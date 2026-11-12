import { db } from '../db/db';
import type { SessionHistoryEntry, SessionStatus, StudySession, WeeklyPlan } from '../db/types';
import { SESSION_STATUS_LABELS } from '../db/types';
import { weekScheduleMetrics } from '../domain/metrics';
import { addDays, formatDate, isValidDateKey, isValidTime, type DateKey } from '../lib/dates';
import { createId, nowIso } from '../lib/utils';

/**
 * Sincroniza `plannedMinutes` e `status` dos planos semanais (`weeklyPlans`)
 * com as sessões reais presentes em cada semana no banco de dados.
 */
export async function syncWeeklyPlansWithSessions(): Promise<void> {
  const [plans, allSessions] = await Promise.all([
    db.weeklyPlans.toArray(),
    db.sessions.toArray(),
  ]);
  if (plans.length === 0) return;

  const updates: WeeklyPlan[] = [];
  for (const wp of plans) {
    const weekEnd = addDays(wp.weekStart, 6);
    const metrics = weekScheduleMetrics(allSessions, wp.weekStart, weekEnd);
    const nextPlannedMinutes = metrics.plannedMinutes;
    const nextStatus: WeeklyPlan['status'] =
      metrics.totalSessions > 0 && metrics.completedSessions === metrics.totalSessions
        ? 'concluida'
        : metrics.completedSessions > 0 || metrics.doneMinutes > 0
        ? 'em-andamento'
        : 'pendente';

    if (wp.plannedMinutes !== nextPlannedMinutes || wp.status !== nextStatus) {
      updates.push({
        ...wp,
        plannedMinutes: nextPlannedMinutes,
        status: nextStatus,
      });
    }
  }

  if (updates.length > 0) {
    await db.weeklyPlans.bulkPut(updates);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface SessionInput {
  date: DateKey;
  disciplineId: string;
  topicId: string | null;
  plannedStart: string | null;
  plannedMinutes: number;
  objective: string;
  notes: string;
}

export const MAX_SESSION_MINUTES = 720;

export function validateSessionInput(input: SessionInput): string | null {
  if (!isValidDateKey(input.date)) return 'Informe uma data válida.';
  if (!input.disciplineId) return 'Selecione a disciplina.';
  if (input.plannedStart !== null && !isValidTime(input.plannedStart)) return 'Informe um horário válido (HH:mm).';
  if (!Number.isInteger(input.plannedMinutes) || input.plannedMinutes < 1 || input.plannedMinutes > MAX_SESSION_MINUTES) {
    return `A duração deve ser um número inteiro entre 1 e ${MAX_SESSION_MINUTES} minutos.`;
  }
  return null;
}

function entry(type: SessionHistoryEntry['type'], description: string): SessionHistoryEntry {
  return { at: nowIso(), type, description };
}

async function requireSession(id: string): Promise<StudySession> {
  const session = await db.sessions.get(id);
  if (!session) throw new ValidationError('Sessão não encontrada. Ela pode ter sido excluída.');
  return session;
}

export async function createSession(input: SessionInput): Promise<StudySession> {
  const error = validateSessionInput(input);
  if (error) throw new ValidationError(error);
  const now = nowIso();
  return db.transaction('rw', db.sessions, db.weeklyPlans, async () => {
    const count = await db.sessions.where('date').equals(input.date).count();
    const session: StudySession = {
      id: createId(),
      ...input,
      order: count,
      objective: input.objective.trim(),
      notes: input.notes.trim(),
      actualSeconds: 0,
      status: 'planejada',
      origin: 'planejada',
      isManual: true,
      startedAt: null,
      endedAt: null,
      recoveredFromId: null,
      history: [entry('criada', 'Sessão planejada criada pelo usuário.')],
      createdAt: now,
      updatedAt: now,
    };
    await db.sessions.add(session);
    await syncWeeklyPlansWithSessions();
    return session;
  });
}

export async function updateSession(id: string, input: SessionInput): Promise<void> {
  const error = validateSessionInput(input);
  if (error) throw new ValidationError(error);
  await db.transaction('rw', db.sessions, db.weeklyPlans, async () => {
    const current = await requireSession(id);
    const history = [...current.history];
    if (current.date !== input.date || current.plannedStart !== input.plannedStart) {
      history.push(
        entry(
          'reagendada',
          `Reagendada de ${formatDate(current.date)}${current.plannedStart ? ` ${current.plannedStart}` : ''} para ${formatDate(input.date)}${input.plannedStart ? ` ${input.plannedStart}` : ''}.`,
        ),
      );
    } else {
      history.push(entry('editada', 'Detalhes da sessão editados.'));
    }
    const nextActualSeconds =
      current.status === 'concluida'
        ? input.plannedMinutes * 60
        : current.actualSeconds;
    await db.sessions.put({
      ...current,
      ...input,
      actualSeconds: nextActualSeconds,
      objective: input.objective.trim(),
      notes: input.notes.trim(),
      history,
      updatedAt: nowIso(),
    });
    await syncWeeklyPlansWithSessions();
  });
}

export function compareSessionsInDay(a: StudySession, b: StudySession): number {
  const aHasOrder = typeof a.order === 'number';
  const bHasOrder = typeof b.order === 'number';
  if (aHasOrder && bHasOrder && a.order !== b.order) {
    return a.order! - b.order!;
  }
  if (aHasOrder !== bHasOrder) {
    return aHasOrder ? -1 : 1;
  }
  return (
    a.plannedMinutes - b.plannedMinutes ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Move a sessão para outra data ou reordena dentro do mesmo dia (drag-and-drop no cronograma).
 */
export async function moveSession(
  id: string,
  newDate: DateKey,
  targetIndex?: number,
): Promise<StudySession> {
  if (!isValidDateKey(newDate)) throw new ValidationError('Informe uma data válida.');
  return db.transaction('rw', db.sessions, db.weeklyPlans, async () => {
    const current = await requireSession(id);
    if (current.date === newDate && targetIndex === undefined) return current;

    const now = nowIso();
    const sameDayOthers = (await db.sessions.where('date').equals(newDate).toArray())
      .filter((s) => s.id !== id)
      .sort(compareSessionsInDay);

    const insertAt =
      targetIndex !== undefined
        ? Math.max(0, Math.min(targetIndex, sameDayOthers.length))
        : sameDayOthers.length;

    const history =
      current.date !== newDate
        ? [
            ...current.history,
            entry('reagendada', `Movida de ${formatDate(current.date)} para ${formatDate(newDate)}.`),
          ]
        : current.history;

    const updated: StudySession = {
      ...current,
      date: newDate,
      order: insertAt,
      history,
      updatedAt: now,
    };

    const reordered = [...sameDayOthers];
    reordered.splice(insertAt, 0, updated);

    const toPut = reordered.map((s, idx) =>
      s.id === updated.id
        ? { ...updated, order: idx }
        : s.order === idx
        ? s
        : { ...s, order: idx, updatedAt: now },
    );

    await db.sessions.bulkPut(toPut);
    await syncWeeklyPlansWithSessions();
    return { ...updated, order: insertAt };
  });
}

/**
 * Reagenda uma sessão.
 * - Sessão planejada sem execução: a data é alterada e o histórico registra a mudança.
 * - Sessão já executada, concluída ou perdida: o registro original é preservado
 *   e uma nova sessão planejada é criada (vinculada por `recoveredFromId`).
 */
export async function rescheduleSession(id: string, date: DateKey, plannedStart?: string | null): Promise<StudySession> {
  if (!isValidDateKey(date)) throw new ValidationError('Informe uma data válida.');
  if (plannedStart !== undefined && plannedStart !== null && !isValidTime(plannedStart)) {
    throw new ValidationError('Informe um horário válido (HH:mm).');
  }
  return db.transaction('rw', db.sessions, db.weeklyPlans, async () => {
    const current = await requireSession(id);
    const time = plannedStart === undefined ? current.plannedStart : plannedStart;
    if (current.status === 'planejada' && current.actualSeconds === 0) {
      if (current.date === date && current.plannedStart === time) return current;
      const updated: StudySession = {
        ...current,
        date,
        plannedStart: time,
        history: [...current.history, entry('reagendada', `Reagendada de ${formatDate(current.date)} para ${formatDate(date)}.`)],
        updatedAt: nowIso(),
      };
      await db.sessions.put(updated);
      await syncWeeklyPlansWithSessions();
      return updated;
    }
    const copy = await createRecoveryCopy(current, date, time);
    await syncWeeklyPlansWithSessions();
    return copy;
  });
}

async function createRecoveryCopy(original: StudySession, date: DateKey, plannedStart: string | null): Promise<StudySession> {
  const now = nowIso();
  const copy: StudySession = {
    ...original,
    id: createId(),
    date,
    plannedStart,
    actualSeconds: 0,
    status: 'planejada',
    origin: 'planejada',
    startedAt: null,
    endedAt: null,
    recoveredFromId: original.id,
    history: [entry('recuperada', `Recuperação da sessão de ${formatDate(original.date)}.`)],
    createdAt: now,
    updatedAt: now,
  };
  const originalHistory = [...original.history, entry('recuperada', `Recuperada em nova sessão para ${formatDate(date)}.`)];
  await db.sessions.put({
    ...original,
    status: original.status === 'planejada' ? 'perdida' : original.status,
    history: originalHistory,
    updatedAt: now,
  });
  await db.sessions.add(copy);
  return copy;
}

/** Recupera uma sessão não concluída: marca a original como perdida e cria uma nova planejada. */
export async function recoverSession(id: string, date: DateKey): Promise<StudySession> {
  if (!isValidDateKey(date)) throw new ValidationError('Informe uma data válida.');
  return db.transaction('rw', db.sessions, db.weeklyPlans, async () => {
    const current = await requireSession(id);
    if (current.status === 'concluida') throw new ValidationError('Sessões concluídas não precisam de recuperação.');
    const copy = await createRecoveryCopy(current, date, current.plannedStart);
    await syncWeeklyPlansWithSessions();
    return copy;
  });
}

/**
 * Atualiza o status do tópico após concluir uma sessão: "não iniciado" passa a
 * "em andamento" e, sem sessões pendentes para o tópico, a "concluído".
 * Tópicos "dominados" nunca são rebaixados.
 */
export async function syncTopicStatusAfterSession(topicId: string | null): Promise<void> {
  if (!topicId) return;
  const topic = await db.topics.get(topicId);
  if (!topic || topic.status === 'dominado' || topic.status === 'concluido') return;
  const related = await db.sessions.filter((s) => s.topicId === topicId).toArray();
  if (!related.some((s) => s.status === 'concluida')) return;
  const pending = related.some((s) => s.status === 'planejada');
  const next = pending ? 'em-andamento' : 'concluido';
  if (topic.status !== next) await db.topics.update(topicId, { status: next, updatedAt: nowIso() });
}

/**
 * Altera o status. Ao concluir manualmente, `actualMinutes` registra o tempo
 * efetivamente estudado informado pelo usuário (opcional).
 */
export async function setSessionStatus(id: string, status: SessionStatus, actualMinutes?: number): Promise<void> {
  if (actualMinutes !== undefined && (!Number.isInteger(actualMinutes) || actualMinutes < 0 || actualMinutes > MAX_SESSION_MINUTES)) {
    throw new ValidationError(`O tempo realizado deve ser um número inteiro entre 0 e ${MAX_SESSION_MINUTES} minutos.`);
  }
  await db.transaction('rw', db.sessions, db.weeklyPlans, db.topics, async () => {
    const current = await requireSession(id);
    const history = [...current.history, entry('status', `Status alterado para ${SESSION_STATUS_LABELS[status]}.`)];
    const nextActualSeconds =
      actualMinutes !== undefined
        ? actualMinutes * 60
        : status === 'concluida' && current.actualSeconds === 0
        ? current.plannedMinutes * 60
        : status === 'planejada'
        ? 0
        : current.actualSeconds;
    await db.sessions.put({
      ...current,
      status,
      actualSeconds: nextActualSeconds,
      history,
      updatedAt: nowIso(),
    });
    if (status === 'concluida') await syncTopicStatusAfterSession(current.topicId);
    await syncWeeklyPlansWithSessions();
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.questionLogs, db.timer, db.weeklyPlans, async () => {
    const timer = await db.timer.get('active');
    if (timer?.sessionId === id) {
      throw new ValidationError('Esta sessão está com o cronômetro em andamento. Finalize ou descarte o cronômetro antes de excluí-la.');
    }
    await db.questionLogs.filter((l) => l.sessionId === id).modify({ sessionId: null });
    await db.sessions.delete(id);
    await syncWeeklyPlansWithSessions();
  });
}
