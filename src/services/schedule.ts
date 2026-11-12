import { db } from '../db/db';
import type { StudySession, WeeklyPlan } from '../db/types';
import { DEFAULT_TOPICS } from '../db/seed';
import {
  blockToSession,
  distributeWeek,
  isManualSession,
  SIMULADO_DISCIPLINE_ID,
} from '../domain/schedule';
import { addDays, isValidDateKey, todayKey, type DateKey } from '../lib/dates';
import { replaceUserWorkspaceInApi, waitForPendingSync } from './auth';
import { createId, nowIso } from '../lib/utils';
import { getSettings, updateSettings } from './settings';
import { ValidationError, syncWeeklyPlansWithSessions } from './sessions';
import {
  generateAiSchedulePlan,
  filterAndAdjustAiSessions,
  type AiScheduleOptions,
} from './aiSchedule';

export { syncWeeklyPlansWithSessions };

/** Sessão planejada ainda não tocada pelo usuário e gerada pela IA (pode ser substituída por nova geração). */
function isReplaceable(s: StudySession): boolean {
  if (isManualSession(s)) return false;
  return s.status === 'planejada' && s.actualSeconds === 0 && s.origin === 'planejada' && s.recoveredFromId === null;
}

/**
 * Gera o cronograma de 24 semanas EXCLUSIVAMENTE por Inteligência Artificial (motor especialista BNB ou Gemini),
 * baseando-se rigorosamente no Edital Verticalizado BNB 2022 (Perfil 1: Desenvolvimento de Sistemas):
 * - Aplica o peso real da prova do BNB com forte enfoque em Conhecimentos Específicos de TI.
 * - Limita os dias de estudo rigorosamente a 2 horas (120 minutos).
 * - Aos sábados: exclusivamente de resolução de questões ou simulados.
 * - Domingos: dia livre / descanso semanal.
 * - Respeita e NÃO sobrepõe sessões pré-criadas/manuais ou executadas pelo usuário.
 */
export async function generateSchedule(
  startDateInput: DateKey,
  _today: DateKey = todayKey(),
  options?: AiScheduleOptions,
): Promise<{ weekCount: number; sessionCount: number; providerUsed: string }> {
  if (!isValidDateKey(startDateInput)) throw new ValidationError('Informe uma data de início válida.');
  const startDate = startDateInput;
  const settings = await getSettings();
  const disciplines = await db.disciplines.toArray();
  let topics = await db.topics.toArray();

  // Caso os tópicos do Edital Verticalizado BNB 2022 ainda não estejam cadastrados no banco,
  // semeia automaticamente para que todas as sessões geradas fiquem vinculadas aos tópicos oficiais.
  if (topics.length === 0 && disciplines.some((d) => d.id === 'arquitetura')) {
    await db.topics.bulkAdd(DEFAULT_TOPICS);
    topics = await db.topics.toArray();
  }

  const aiResult = await generateAiSchedulePlan({
    startDate,
    disciplines,
    topics,
    settings,
    options,
  });

  await db.transaction('rw', db.weeklyPlans, db.sessions, db.settings, db.topics, async () => {
    const replaceable = await db.sessions.filter(isReplaceable).primaryKeys();
    await db.sessions.bulkDelete(replaceable);
    await db.weeklyPlans.clear();

    await db.weeklyPlans.bulkAdd(aiResult.weeklyPlans);

    const preservedSessions = await db.sessions.toArray();
    const finalSessions = filterAndAdjustAiSessions(aiResult.sessions, preservedSessions);

    // Garante que toda sessão de estudo gerada tenha tópico vinculado (cria o tópico se faltar).
    const allTopics = await db.topics.toArray();
    const norm = (t: string) => t.trim().toLowerCase();
    for (const session of finalSessions) {
      if (session.topicId || session.disciplineId === SIMULADO_DISCIPLINE_ID || !session.objective.trim()) continue;
      const title = session.objective.trim();
      let topic = allTopics.find((t) => t.disciplineId === session.disciplineId && norm(t.title) === norm(title));
      if (!topic) {
        const siblings = allTopics.filter((t) => t.disciplineId === session.disciplineId && !t.parentTopicId);
        const now = nowIso();
        topic = {
          id: createId(),
          disciplineId: session.disciplineId,
          title,
          parentTopicId: null,
          status: 'nao-iniciado',
          notes: '',
          order: siblings.reduce((m, t) => Math.max(m, t.order + 1), 0),
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        await db.topics.add(topic);
        allTopics.push(topic);
      }
      session.topicId = topic.id;
    }

    await db.sessions.bulkAdd(finalSessions);
    await syncWeeklyPlansWithSessions();
    await db.settings.update('settings', { scheduleStartDate: startDate });
  });

  db.persistLocalWorkspaceCache();
  await replaceUserWorkspaceInApi(db.exportWorkspaceSnapshot());
  await waitForPendingSync();

  return {
    weekCount: aiResult.weeklyPlans.length,
    sessionCount: aiResult.sessions.length,
    providerUsed: aiResult.providerUsed,
  };
}

/**
 * Reaplica a distribuição atual a uma semana: substitui sessões planejadas não
 * executadas e geradas automaticamente a partir de hoje. Sessões manuais e executadas não mudam.
 */
export async function applyDistributionToWeek(weekStart: DateKey, today: DateKey = todayKey()): Promise<number> {
  const settings = await getSettings();
  const disciplines = await db.disciplines.toArray();
  const end = addDays(weekStart, 6);
  return db.transaction('rw', db.sessions, db.weeklyPlans, async () => {
    const replaceable = await db.sessions
      .where('date')
      .between(weekStart, end, true, true)
      .filter((s) => s.date >= today && isReplaceable(s))
      .primaryKeys();
    await db.sessions.bulkDelete(replaceable);

    const remainingSessions = await db.sessions
      .where('date')
      .between(weekStart, end, true, true)
      .toArray();

    const sessions = distributeWeek(weekStart, settings.distribution, disciplines, true, remainingSessions)
      .filter((b) => b.date >= today)
      .map((b) => blockToSession(b));
    await db.sessions.bulkAdd(sessions);
    await syncWeeklyPlansWithSessions();
    return sessions.length;
  });
}

export interface WeeklyPlanInput {
  objectives: string;
  plannedContent: string;
  plannedMinutes: number;
  status: WeeklyPlan['status'];
  notes: string;
}

export async function updateWeeklyPlan(id: string, input: WeeklyPlanInput): Promise<void> {
  if (!Number.isInteger(input.plannedMinutes) || input.plannedMinutes < 0 || input.plannedMinutes > 10080) {
    throw new ValidationError('A meta da semana deve ser um inteiro entre 0 e 10080 minutos.');
  }
  const updated = await db.weeklyPlans.update(id, {
    objectives: input.objectives.trim(),
    plannedContent: input.plannedContent.trim(),
    plannedMinutes: input.plannedMinutes,
    status: input.status,
    notes: input.notes.trim(),
  });
  if (!updated) throw new ValidationError('Semana não encontrada.');
}

export async function saveDistribution(distribution: Record<string, number>): Promise<void> {
  await updateSettings({ distribution });
}

/**
 * Limpa o cronograma: remove todos os planos semanais e as sessões planejadas
 * que ainda não foram executadas (preserva sessões concluídas e histórico).
 * Reseta scheduleStartDate nas configurações.
 */
export async function clearSchedule(): Promise<void> {
  await db.transaction('rw', db.weeklyPlans, db.sessions, db.settings, async () => {
    const replaceable = await db.sessions.filter(isReplaceable).primaryKeys();
    await db.sessions.bulkDelete(replaceable);
    await db.weeklyPlans.clear();
    await db.settings.update('settings', { scheduleStartDate: null });
  });
  db.persistLocalWorkspaceCache();
  await replaceUserWorkspaceInApi(db.exportWorkspaceSnapshot());
  await waitForPendingSync();
}
