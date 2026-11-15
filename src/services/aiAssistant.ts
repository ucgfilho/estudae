import { db } from '../db/db';
import type {
  Discipline,
  ErrorStatus,
  ErrorType,
  ThemePreference,
  Topic,
  TopicStatus,
} from '../db/types';
import { reviewBuckets } from '../domain/metrics';
import { computeRank } from '../domain/rank';
import { parseIntervals } from '../domain/reviews';
import { addDays, formatDate, isValidDateKey, todayKey, type DateKey } from '../lib/dates';
import {
  bulkRescheduleReviews,
  completeReview,
  deleteErrorNote,
  deleteReview,
  postponeReview,
  reconcileReviewsAndErrorNotes,
  reopenReview,
  saveErrorNote,
  saveQuestionLog,
  scheduleTopicReviews,
  setErrorStatus,
} from './performance';
import { generateSchedule } from './schedule';
import {
  createSession,
  deleteSession,
  rescheduleSession,
  setSessionStatus,
} from './sessions';
import { getSettings, updateSettings } from './settings';
import {
  discardTimer,
  finishTimer,
  getActiveTimer,
  pauseTimer,
  resumeTimer,
  startAdHocTimer,
} from './timer';
import { createTopic, setTopicStatus } from './topics';

export interface AssistantAction {
  type:
    | 'RESCHEDULE_REVIEWS'
    | 'SCHEDULE_REVIEW'
    | 'COMPLETE_REVIEW'
    | 'REOPEN_REVIEW'
    | 'DELETE_REVIEW'
    | 'SYNC_REVIEWS'
    | 'ADD_ERROR_NOTE'
    | 'UPDATE_ERROR_STATUS'
    | 'DELETE_ERROR_NOTE'
    | 'ADD_SESSION'
    | 'COMPLETE_SESSION'
    | 'RESCHEDULE_SESSION'
    | 'DELETE_SESSION'
    | 'START_TIMER'
    | 'PAUSE_TIMER'
    | 'RESUME_TIMER'
    | 'FINISH_TIMER'
    | 'DISCARD_TIMER'
    | 'LOG_QUESTIONS'
    | 'ADD_TOPIC'
    | 'UPDATE_TOPIC_STATUS'
    | 'GENERATE_SCHEDULE'
    | 'UPDATE_SETTINGS'
    | 'NAVIGATE'
    | 'STATUS_SUMMARY';
  params?: Record<string, unknown>;
}

export interface AssistantResponse {
  reply: string;
  executedActions: string[];
  navigateTo?: string;
}

function normalize(text = ''): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchDiscipline(text: string, disciplines: Discipline[]): Discipline | null {
  const norm = normalize(text);
  // 1. Exact or substring match on name/shortName/id
  for (const d of disciplines) {
    const nName = normalize(d.name);
    const nId = normalize(d.id.replace(/-/g, ' '));
    if (
      (nName && norm.includes(nName)) ||
      (nId.length >= 4 && norm.includes(nId))
    ) {
      return d;
    }
  }
  // 2. Common keywords mapping
  const keywords: Array<[RegExp, string]> = [
    [/\b(arquitetura|arq|devops|apis?|microsservicos?)\b/, 'arquitetura'],
    [/\b(engenharia|eng|scrum|agile|requisitos|uml| historias?)\b/, 'engenharia'],
    [/\b(linguagens?|java|python|javascript|typescript|poo)\b/, 'linguagens'],
    [/\b(banco de dados|bancos? de dados|sql|nosql|modelagem|bd)\b/, 'banco-dados'],
    [/\b(logica de programacao|algoritmos?|estrutura de dados|programacao)\b/, 'logica-programacao'],
    [/\b(nuvem|cloud|aws|azure|gcp|docker|containers?)\b/, 'nuvem'],
    [/\b(portugues|gramatica|redacao|interpretacao|lingua portuguesa)\b/, 'portugues'],
    [/\b(raciocinio|matematica|rlm|logica matematica|probabilidade)\b/, 'raciocinio'],
  ];
  for (const [regex, id] of keywords) {
    if (regex.test(norm)) {
      const found = disciplines.find((d) => d.id === id);
      if (found) return found;
    }
  }
  return null;
}

function matchTopic(text: string, topics: Topic[], disciplineId?: string): Topic | null {
  const norm = normalize(text);
  const pool = disciplineId ? topics.filter((t) => t.disciplineId === disciplineId) : topics;
  let best: { topic: Topic; len: number } | null = null;
  for (const t of pool) {
    const nTitle = normalize(t.title);
    if (nTitle.length >= 3 && norm.includes(nTitle)) {
      if (!best || nTitle.length > best.len) {
        best = { topic: t, len: nTitle.length };
      }
    }
  }
  return best?.topic ?? null;
}

/**
 * Extrai datas mencionadas no texto em português (ex.: "2026-11-16", "16/11/2026", "16/11", "dia 10", "dia 16", "hoje", "amanhã").
 */
export function extractDatesFromText(text: string, today: DateKey = todayKey()): DateKey[] {
  const norm = normalize(text);
  const [currYear, currMonth] = today.split('-').map(Number);
  const found: DateKey[] = [];

  // 1. Explicit YYYY-MM-DD
  for (const m of norm.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g)) {
    const candidate = `${m[1]}-${m[2]}-${m[3]}`;
    if (isValidDateKey(candidate)) found.push(candidate);
  }

  // 2. DD/MM/YYYY or DD/MM
  for (const m of norm.matchAll(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(20\d{2}))?\b/g)) {
    const d = String(Number(m[1])).padStart(2, '0');
    const mo = String(Number(m[2])).padStart(2, '0');
    const y = m[3] ? Number(m[3]) : currYear;
    const candidate = `${y}-${mo}-${d}`;
    if (isValidDateKey(candidate)) found.push(candidate);
  }

  // 3. "dia 10", "pro dia 16", "para o dia 16"
  if (found.length < 2) {
    for (const m of norm.matchAll(/\bdia\s+(0?[1-9]|[12]\d|3[01])(?:\s*\/\s*(0?[1-9]|1[0-2]))?\b/g)) {
      const d = String(Number(m[1])).padStart(2, '0');
      const mo = m[2] ? String(Number(m[2])).padStart(2, '0') : String(currMonth).padStart(2, '0');
      const candidate = `${currYear}-${mo}-${d}`;
      if (isValidDateKey(candidate) && !found.includes(candidate)) {
        found.push(candidate);
      }
    }
  }

  // 4. Relative words ("hoje", "amanha", "depois de amanha")
  if (/\bdepois de amanha\b/.test(norm)) {
    found.push(addDays(today, 2));
  } else if (/\bamanha\b/.test(norm)) {
    found.push(addDays(today, 1));
  } else if (/\bhoje\b/.test(norm)) {
    found.push(today);
  }

  return found;
}

function extractDurationMinutes(text: string): number | null {
  const norm = normalize(text);
  const hmMatch = norm.match(/\b(\d+)\s*h(?:oras?)?\s*(?:e\s*)?(\d+)?\s*(?:m|min|minutos?)?\b/);
  if (hmMatch) {
    const hours = Number(hmMatch[1]);
    const mins = hmMatch[2] ? Number(hmMatch[2]) : 0;
    const total = hours * 60 + mins;
    if (total >= 5 && total <= 720) return total;
  }
  const minMatch = norm.match(/\b(\d+)\s*(?:min|minutos?)\b/);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    if (mins >= 5 && mins <= 720) return mins;
  }
  return null;
}

/**
 * Executa uma ação estruturada diretamente sobre o banco e serviços da plataforma.
 */
export async function executeAssistantAction(
  action: AssistantAction,
  today: DateKey = todayKey(),
): Promise<{ summary: string; navigateTo?: string }> {
  const disciplines = await db.disciplines.toArray();
  const topics = await db.topics.toArray();
  const params = action.params ?? {};

  switch (action.type) {
    case 'SYNC_REVIEWS': {
      const res = await reconcileReviewsAndErrorNotes();
      return {
        summary: `Sincronização concluída: ${res.deletedReviews} revisão(ões) futura(s) removida(s) e ${res.updatedReviews + res.updatedNotes} registro(s) alinhado(s) entre Revisões e Caderno de Erros.`,
        navigateTo: '/revisoes',
      };
    }

    case 'RESCHEDULE_REVIEWS': {
      await reconcileReviewsAndErrorNotes();
      const newDueDate = (params.newDueDate as DateKey | undefined) ?? today;
      const fromDueDate = params.fromDueDate as DateKey | undefined;
      const disciplineId = params.disciplineId as string | undefined;
      const onlyOverdue = Boolean(params.onlyOverdue);
      const days = params.days as number | undefined;

      if (days && Number.isInteger(days) && days > 0) {
        const allReviews = await db.reviews.toArray();
        const targets = allReviews.filter(
          (r) =>
            r.status === 'pendente' &&
            (!disciplineId || r.disciplineId === disciplineId) &&
            (!onlyOverdue || r.dueDate < today),
        );
        for (const r of targets) {
          await postponeReview(r.id, days, today);
        }
        return {
          summary: `${targets.length} revisão(ões) adiada(s) em ${days} dia(s) (sincronizado com o Caderno de Erros).`,
          navigateTo: '/revisoes',
        };
      }

      const count = await bulkRescheduleReviews({
        newDueDate,
        fromDueDate,
        disciplineId,
        onlyOverdue,
        today,
      });
      return {
        summary:
          count > 0
            ? `${count} revisão(ões) remarcada(s) para ${formatDate(newDueDate)} e sincronizada(s) com o Caderno de Erros.`
            : `Nenhuma revisão pendente encontrada com esse filtro para remarcar para ${formatDate(newDueDate)}.`,
        navigateTo: '/revisoes',
      };
    }

    case 'SCHEDULE_REVIEW': {
      const discId = (params.disciplineId as string) || disciplines[0]?.id;
      if (!discId) throw new Error('Nenhuma disciplina disponível.');
      const disc = disciplines.find((d) => d.id === discId);
      const topicId = (params.topicId as string | null) ?? null;
      const title =
        (params.title as string)?.trim() ||
        `Revisão de ${disc?.name ?? 'Conteúdo'}`;
      const baseDate = (params.baseDate as DateKey) || today;
      await scheduleTopicReviews(discId, topicId, title, baseDate);
      return {
        summary: `Revisão "${title}" (${disc?.name ?? discId}) agendada no ciclo inicial a partir de ${formatDate(baseDate)}.`,
        navigateTo: '/revisoes',
      };
    }

    case 'COMPLETE_REVIEW': {
      const disciplineId = params.disciplineId as string | undefined;
      const all = Boolean(params.all);
      const pending = (await db.reviews.toArray())
        .filter(
          (r) =>
            r.status === 'pendente' &&
            (!disciplineId || r.disciplineId === disciplineId),
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      if (pending.length === 0) {
        return { summary: 'Não há revisões pendentes para concluir no momento.' };
      }

      if (all) {
        const dueOrOverdue = pending.filter((r) => r.dueDate <= today);
        const list = dueOrOverdue.length > 0 ? dueOrOverdue : [pending[0]];
        for (const r of list) {
          await completeReview(r.id);
        }
        return {
          summary: `${list.length} revisão(ões) concluída(s) com sucesso! A próxima revisão de cada intervalo foi liberada automaticamente.`,
          navigateTo: '/revisoes',
        };
      }

      const target = pending[0];
      await completeReview(target.id);
      return {
        summary: `Revisão "${target.title}" concluída! A próxima revisão do intervalo foi liberada.`,
        navigateTo: '/revisoes',
      };
    }

    case 'REOPEN_REVIEW': {
      const completed = (await db.reviews.toArray())
        .filter((r) => r.status === 'concluida')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      if (completed.length === 0) {
        return { summary: 'Nenhuma revisão concluída encontrada para reabrir.' };
      }
      await reopenReview(completed[0].id);
      return {
        summary: `Revisão "${completed[0].title}" reaberta com sucesso.`,
        navigateTo: '/revisoes',
      };
    }

    case 'DELETE_REVIEW': {
      const disciplineId = params.disciplineId as string | undefined;
      const pending = (await db.reviews.toArray()).filter(
        (r) =>
          r.status === 'pendente' &&
          (!disciplineId || r.disciplineId === disciplineId),
      );
      if (pending.length === 0) {
        return { summary: 'Nenhuma revisão pendente encontrada para excluir.' };
      }
      await deleteReview(pending[0].id);
      return {
        summary: `Revisão "${pending[0].title}" excluída com sucesso.`,
        navigateTo: '/revisoes',
      };
    }

    case 'ADD_ERROR_NOTE': {
      const discId = (params.disciplineId as string) || disciplines[0]?.id;
      if (!discId) throw new Error('Nenhuma disciplina cadastrada.');
      const disc = disciplines.find((d) => d.id === discId);
      const topicId = (params.topicId as string | null) ?? null;
      const sourceReference =
        (params.sourceReference as string)?.trim() ||
        `Erro registrado via Assistente (${disc?.name ?? discId})`;
      const explanation =
        (params.explanation as string)?.trim() ||
        sourceReference;
      const errorType = ((params.errorType as ErrorType) || 'falta-conteudo') as ErrorType;
      const errorDate = (params.errorDate as DateKey) || today;
      const nextReviewDate = (params.nextReviewDate as DateKey | null) ?? null;

      const note = await saveErrorNote(
        {
          disciplineId: discId,
          topicId,
          questionLogId: null,
          sourceReference,
          errorType,
          explanation,
          errorDate,
          status: 'revisar',
          nextReviewDate,
        },
        { scheduleReviews: true },
      );
      return {
        summary: `Erro adicionado ao Caderno de Erros em ${disc?.name ?? discId} ("${note.sourceReference}") com revisão agendada para ${formatDate(note.nextReviewDate ?? today)}.`,
        navigateTo: '/erros',
      };
    }

    case 'UPDATE_ERROR_STATUS': {
      const status = ((params.status as ErrorStatus) || 'revisado') as ErrorStatus;
      const notes = await db.errorNotes.toArray();
      if (notes.length === 0) {
        return { summary: 'Nenhuma anotação encontrada no Caderno de Erros.' };
      }
      await setErrorStatus(notes[0].id, status);
      return {
        summary: `Status do erro "${notes[0].sourceReference || notes[0].explanation}" atualizado para "${status}".`,
        navigateTo: '/erros',
      };
    }

    case 'DELETE_ERROR_NOTE': {
      const notes = await db.errorNotes.toArray();
      if (notes.length === 0) {
        return { summary: 'Nenhuma anotação encontrada no Caderno de Erros para excluir.' };
      }
      await deleteErrorNote(notes[0].id);
      return {
        summary: `Anotação "${notes[0].sourceReference || notes[0].explanation}" excluída do Caderno de Erros.`,
        navigateTo: '/erros',
      };
    }

    case 'ADD_SESSION': {
      const discId = (params.disciplineId as string) || disciplines[0]?.id;
      if (!discId) throw new Error('Nenhuma disciplina disponível.');
      const disc = disciplines.find((d) => d.id === discId);
      const topicId = (params.topicId as string | null) ?? null;
      const date = (params.date as DateKey) || today;
      const plannedMinutes = Number(params.plannedMinutes) || 60;
      const objective =
        (params.objective as string)?.trim() ||
        `Estudo de ${disc?.name ?? 'disciplina'}`;
      const plannedStart = (params.plannedStart as string | null) ?? null;

      await createSession({
        date,
        disciplineId: discId,
        topicId,
        plannedMinutes,
        objective,
        plannedStart,
        notes: 'Criada pelo Assistente IA',
      });
      return {
        summary: `Sessão de estudo de ${disc?.name ?? discId} (${plannedMinutes} min) agendada para ${formatDate(date)}.`,
        navigateTo: '/calendario',
      };
    }

    case 'COMPLETE_SESSION': {
      const disciplineId = params.disciplineId as string | undefined;
      const sessions = (await db.sessions.toArray()).filter(
        (s) =>
          s.status === 'planejada' &&
          (!disciplineId || s.disciplineId === disciplineId),
      );
      const todaySessions = sessions.filter((s) => s.date === today);
      const target = todaySessions[0] ?? sessions[0];
      if (!target) {
        return { summary: 'Nenhuma sessão pendente encontrada para concluir.' };
      }
      const mins = Number(params.actualMinutes) || target.plannedMinutes;
      await setSessionStatus(target.id, 'concluida', mins);
      return {
        summary: `Sessão "${target.objective || 'Estudo'}" marcada como concluída (${mins} min).`,
        navigateTo: '/calendario',
      };
    }

    case 'RESCHEDULE_SESSION': {
      const newDate = (params.newDate as DateKey) || addDays(today, 1);
      const disciplineId = params.disciplineId as string | undefined;
      const sessions = (await db.sessions.toArray()).filter(
        (s) =>
          s.status === 'planejada' &&
          (!disciplineId || s.disciplineId === disciplineId),
      );
      if (sessions.length === 0) {
        return { summary: 'Nenhuma sessão pendente encontrada para reagendar.' };
      }
      await rescheduleSession(sessions[0].id, newDate);
      return {
        summary: `Sessão "${sessions[0].objective || 'Estudo'}" reagendada para ${formatDate(newDate)}.`,
        navigateTo: '/calendario',
      };
    }

    case 'DELETE_SESSION': {
      const disciplineId = params.disciplineId as string | undefined;
      const sessions = (await db.sessions.toArray()).filter(
        (s) =>
          s.status === 'planejada' &&
          (!disciplineId || s.disciplineId === disciplineId),
      );
      if (sessions.length === 0) {
        return { summary: 'Nenhuma sessão pendente encontrada para excluir.' };
      }
      await deleteSession(sessions[0].id);
      return {
        summary: `Sessão "${sessions[0].objective || 'Estudo'}" excluída com sucesso.`,
        navigateTo: '/calendario',
      };
    }

    case 'START_TIMER': {
      const discId = (params.disciplineId as string) || disciplines[0]?.id;
      if (!discId) throw new Error('Nenhuma disciplina disponível.');
      const disc = disciplines.find((d) => d.id === discId);
      const topicId = (params.topicId as string | null) ?? null;
      const plannedMinutes = Number(params.plannedMinutes) || 60;
      const active = await getActiveTimer();
      if (active) {
        await discardTimer();
      }
      await startAdHocTimer({
        disciplineId: discId,
        topicId,
        plannedMinutes,
        objective: (params.objective as string) || `Foco em ${disc?.name ?? discId}`,
        notes: '',
      });
      return {
        summary: `Cronômetro iniciado para ${disc?.name ?? discId} (${plannedMinutes} min). Bons estudos!`,
        navigateTo: '/estudar-agora',
      };
    }

    case 'PAUSE_TIMER': {
      await pauseTimer();
      return { summary: 'Cronômetro pausado.', navigateTo: '/estudar-agora' };
    }

    case 'RESUME_TIMER': {
      await resumeTimer();
      return { summary: 'Cronômetro retomado!', navigateTo: '/estudar-agora' };
    }

    case 'FINISH_TIMER': {
      const finished = await finishTimer();
      const mins = finished ? Math.max(1, Math.round(finished.actualSeconds / 60)) : 0;
      return {
        summary: finished
          ? `Sessão finalizada e registrada com ${mins} min!`
          : 'Cronômetro finalizado.',
        navigateTo: '/estudar-agora',
      };
    }

    case 'DISCARD_TIMER': {
      await discardTimer();
      return { summary: 'Cronômetro descartado.', navigateTo: '/estudar-agora' };
    }

    case 'LOG_QUESTIONS': {
      const discId = (params.disciplineId as string) || disciplines[0]?.id;
      if (!discId) throw new Error('Nenhuma disciplina disponível.');
      const disc = disciplines.find((d) => d.id === discId);
      const total = Math.max(1, Number(params.total) || 10);
      const correct = Math.min(total, Math.max(0, Number(params.correct ?? Math.round(total * 0.8))));
      const incorrect = Math.max(0, total - correct);
      await saveQuestionLog(
        {
          date: (params.date as DateKey) || today,
          disciplineId: discId,
          topicId: (params.topicId as string | null) ?? null,
          source: (params.source as string) || 'Bateria registrada via Assistente',
          total,
          correct,
          incorrect,
          blank: 0,
          durationMinutes: null,
          notes: '',
        },
        { allowDuplicate: true },
      );
      const pct = Math.round((correct / total) * 100);
      return {
        summary: `Bateria de questões registrada em ${disc?.name ?? discId}: ${correct}/${total} acertos (${pct}%).`,
        navigateTo: '/questoes',
      };
    }

    case 'ADD_TOPIC': {
      const discId = (params.disciplineId as string) || disciplines[0]?.id;
      if (!discId) throw new Error('Nenhuma disciplina disponível.');
      const disc = disciplines.find((d) => d.id === discId);
      const title = (params.title as string)?.trim() || 'Novo Tópico';
      await createTopic(discId, null, {
        title,
        status: 'nao-iniciado',
        notes: '',
      });
      return {
        summary: `Tópico "${title}" adicionado na disciplina ${disc?.name ?? discId}.`,
        navigateTo: '/disciplinas',
      };
    }

    case 'UPDATE_TOPIC_STATUS': {
      const topicId = params.topicId as string | undefined;
      const status = ((params.status as TopicStatus) || 'concluido') as TopicStatus;
      const target = topicId ? topics.find((t) => t.id === topicId) : topics[0];
      if (!target) {
        return { summary: 'Tópico não encontrado para atualizar.' };
      }
      await setTopicStatus(target.id, status);
      return {
        summary: `Status do tópico "${target.title}" atualizado para "${status}".`,
        navigateTo: '/disciplinas',
      };
    }

    case 'GENERATE_SCHEDULE': {
      const startDate = (params.startDate as DateKey) || today;
      const count = await generateSchedule(startDate);
      return {
        summary: `Cronograma gerado com sucesso a partir de ${formatDate(startDate)} (${count} sessões planejadas).`,
        navigateTo: '/cronograma',
      };
    }

    case 'UPDATE_SETTINGS': {
      const patch: Record<string, unknown> = {};
      const parts: string[] = [];
      if (params.dailyGoalMinutes !== undefined) {
        const mins = Number(params.dailyGoalMinutes);
        patch.dailyGoalMinutes = mins;
        patch.weeklyGoalMinutes = mins * 7;
        parts.push(`meta diária para ${mins} min`);
      }
      if (params.reviewIntervals !== undefined) {
        const intervals = Array.isArray(params.reviewIntervals)
          ? (params.reviewIntervals as number[])
          : [1, 7, 30];
        patch.reviewIntervals = intervals;
        parts.push(`intervalos de revisão para ${intervals.join(', ')}d`);
      }
      if (params.examDate !== undefined) {
        patch.examDate = params.examDate;
        parts.push(`data da prova para ${formatDate(String(params.examDate))}`);
      }
      if (params.theme !== undefined) {
        patch.theme = params.theme as ThemePreference;
        parts.push(`tema para ${String(params.theme)}`);
      }
      await updateSettings(patch);
      return {
        summary: `Configurações atualizadas: ${parts.join('; ') || 'preferências salvas'}.`,
        navigateTo: '/configuracoes',
      };
    }

    case 'NAVIGATE': {
      const route = (params.route as string) || '/';
      return {
        summary: `Redirecionando para ${route}...`,
        navigateTo: route,
      };
    }

    case 'STATUS_SUMMARY':
    default: {
      await reconcileReviewsAndErrorNotes();
      const [sessions, reviews, errorNotes, questionLogs, settings] = await Promise.all([
        db.sessions.toArray(),
        db.reviews.toArray(),
        db.errorNotes.toArray(),
        db.questionLogs.toArray(),
        getSettings(),
      ]);
      const buckets = reviewBuckets(reviews, today);
      const todaySessions = sessions.filter((s) => s.date === today);
      const pendingErrors = errorNotes.filter((e) => e.status === 'revisar').length;
      const rank = computeRank({ sessions, reviews, settings, today });
      const totalQ = questionLogs.reduce((acc, q) => acc + q.total, 0);
      return {
        summary: [
          `📊 **Resumo atual da sua preparação (${formatDate(today)}):**`,
          `• **Patente:** ${rank.rank.name} (${rank.xp} XP)`,
          `• **Sessões de hoje:** ${todaySessions.filter((s) => s.status === 'concluida').length}/${todaySessions.length} concluída(s)`,
          `• **Revisões:** ${buckets.overdue.length} atrasada(s), ${buckets.today.length} para hoje e ${buckets.upcoming.length} próxima(s)`,
          `• **Caderno de erros:** ${pendingErrors} erro(s) para revisar (${errorNotes.length} no total)`,
          `• **Questões resolvidas:** ${totalQ} questão(ões)`,
        ].join('\n'),
      };
    }
  }
}

/**
 * Interpreta o pedido em linguagem natural (motor local determinístico)
 * cobrindo todas as funcionalidades da plataforma.
 */
export async function parseBuiltinAssistantIntent(
  userMessage: string,
  today: DateKey = todayKey(),
): Promise<{ actions: AssistantAction[]; directReply?: string }> {
  const norm = normalize(userMessage);
  const [disciplines, topics] = await Promise.all([
    db.disciplines.toArray(),
    db.topics.toArray(),
  ]);
  const disc = matchDiscipline(userMessage, disciplines);
  const topic = matchTopic(userMessage, topics, disc?.id);
  const dates = extractDatesFromText(userMessage, today);
  const minutes = extractDurationMinutes(userMessage);

  // 1. Limpar revisões futuras / sincronizar revisões com caderno de erros
  if (
    (/\b(remover|remova|limpar|limpe|apagar|excluir|sincronizar|sincronize)\b/.test(norm) &&
      /\b(revisoes futuras|revisao futura|intervalos futuros|caderno de erros)\b/.test(norm)) ||
    /\bsincroniz\w+\s+.*revis/.test(norm)
  ) {
    return { actions: [{ type: 'SYNC_REVIEWS' }] };
  }

  // 2. Mudar/adiar data de revisão (ex.: "mudar data de revisão do dia 10 para o dia 16", "adiar revisões atrasadas para amanhã")
  if (
    /\b(revisao|revisoes)\b/.test(norm) &&
    (/\b(mudar|mude|alterar|altere|passar|passe|mover|mova|adiar|adie|remarcar|remarque|transferir|transfira)\b/.test(norm) ||
      dates.length >= 1)
  ) {
    // Check if postponing by N days ("adiar em 3 dias")
    const daysMatch = norm.match(/\b(?:em|por|mais)\s+(\d+)\s*dias?\b/);
    if (daysMatch && /\b(adiar|adie)\b/.test(norm) && dates.length === 0) {
      return {
        actions: [
          {
            type: 'RESCHEDULE_REVIEWS',
            params: {
              days: Number(daysMatch[1]),
              disciplineId: disc?.id,
              onlyOverdue: /\batrasad/.test(norm),
            },
          },
        ],
      };
    }

    if (dates.length >= 2) {
      return {
        actions: [
          {
            type: 'RESCHEDULE_REVIEWS',
            params: {
              fromDueDate: dates[0],
              newDueDate: dates[1],
              disciplineId: disc?.id,
            },
          },
        ],
      };
    }

    if (dates.length === 1) {
      return {
        actions: [
          {
            type: 'RESCHEDULE_REVIEWS',
            params: {
              newDueDate: dates[0],
              disciplineId: disc?.id,
              onlyOverdue: /\batrasad/.test(norm),
            },
          },
        ],
      };
    }
  }

  // 3. Concluir revisão ("concluir revisão", "marcar revisão como concluída")
  if (
    /\b(concluir|conclua|finalizar|finaliza|marcar como concluida|fechar)\b/.test(norm) &&
    /\b(revisao|revisoes)\b/.test(norm)
  ) {
    return {
      actions: [
        {
          type: 'COMPLETE_REVIEW',
          params: {
            disciplineId: disc?.id,
            all: /\b(todas|tudo|atrasadas|hoje)\b/.test(norm),
          },
        },
      ],
    };
  }

  // 4. Agendar nova revisão ("agendar revisão de Arquitetura", "criar revisão")
  if (
    /\b(agendar|agende|criar|crie|adicionar|adicione|nova)\b/.test(norm) &&
    /\b(revisao|revisoes)\b/.test(norm)
  ) {
    return {
      actions: [
        {
          type: 'SCHEDULE_REVIEW',
          params: {
            disciplineId: disc?.id ?? disciplines[0]?.id,
            topicId: topic?.id ?? null,
            title: topic?.title ?? (disc ? `Revisão de ${disc.name}` : 'Revisão geral'),
            baseDate: dates[0] ?? today,
          },
        },
      ],
    };
  }

  // 5. Caderno de erros ("adicionar um erro no caderno de erros", "registrar erro")
  if (
    /\b(caderno de erros?|anotacao de erro|\berro\b)\b/.test(norm) &&
    /\b(adicionar|adicione|cadastrar|cadastre|registrar|registre|novo|criar|crie|inserir)\b/.test(norm)
  ) {
    const qMatch = userMessage.match(/quest[aã]o\s*#?(\d+)/i);
    const ref = qMatch
      ? `Questão ${qMatch[1]} · ${disc?.name ?? 'Prova'}`
      : topic?.title
        ? `${disc?.name ?? 'Estudo'} · ${topic.title}`
        : `Erro em ${disc?.name ?? 'Estudo'}`;
    const cleanedExplanation = userMessage
      .replace(/^(?:quero\s+)?(?:adicionar|adicione|registrar|registre|cadastrar|cadastre|criar|crie)\s+(?:um\s+)?erro\s+(?:no\s+(?:meu\s+)?caderno\s+de\s+erros\s*)?(?:de\s+|em\s+|sobre\s+)?/i, '')
      .trim();

    let errorType: ErrorType = 'falta-conteudo';
    if (/\bdesatencao\b/.test(norm)) errorType = 'desatencao';
    else if (/\binterpretacao\b/.test(norm)) errorType = 'interpretacao';
    else if (/\balternativas\b/.test(norm)) errorType = 'confusao-alternativas';

    return {
      actions: [
        {
          type: 'ADD_ERROR_NOTE',
          params: {
            disciplineId: disc?.id ?? disciplines[0]?.id,
            topicId: topic?.id ?? null,
            sourceReference: ref,
            explanation: cleanedExplanation || ref,
            errorType,
            errorDate: today,
            nextReviewDate: dates[0] ?? null,
          },
        },
      ],
    };
  }

  // 6. Registrar bateria de questões ("registrei 20 questões de Português com 16 acertos", "adicionar 15 questões")
  if (/\bquest(ao|oes)\b/.test(norm) && /\b(\d+)\b/.test(norm)) {
    const totalMatch = norm.match(/\b(\d+)\s*quest(ao|oes)\b/);
    const correctMatch =
      norm.match(/\b(\d+)\s*(?:acertos?|certas?|corretas?)\b/) ||
      norm.match(/\bacert(?:ei|ou)\s*(\d+)\b/);
    if (totalMatch || correctMatch) {
      const total = totalMatch ? Number(totalMatch[1]) : Number(correctMatch![1]);
      const correct = correctMatch ? Number(correctMatch[1]) : total;
      return {
        actions: [
          {
            type: 'LOG_QUESTIONS',
            params: {
              disciplineId: disc?.id ?? disciplines[0]?.id,
              topicId: topic?.id ?? null,
              total,
              correct,
              date: dates[0] ?? today,
            },
          },
        ],
      };
    }
  }

  // 7. Cronômetro / Estudar agora ("iniciar cronômetro", "pausar cronômetro", "finalizar cronômetro")
  if (/\b(cronometro|timer|foco|estudar agora)\b/.test(norm)) {
    if (/\b(pausar|pause)\b/.test(norm)) return { actions: [{ type: 'PAUSE_TIMER' }] };
    if (/\b(retomar|retome|continuar|continue)\b/.test(norm)) return { actions: [{ type: 'RESUME_TIMER' }] };
    if (/\b(finalizar|finalize|concluir|conclua|encerrar|salvar)\b/.test(norm)) {
      return { actions: [{ type: 'FINISH_TIMER' }] };
    }
    if (/\b(descartar|descarte|cancelar|cancele)\b/.test(norm)) {
      return { actions: [{ type: 'DISCARD_TIMER' }] };
    }
    return {
      actions: [
        {
          type: 'START_TIMER',
          params: {
            disciplineId: disc?.id ?? disciplines[0]?.id,
            topicId: topic?.id ?? null,
            plannedMinutes: minutes ?? 60,
          },
        },
      ],
    };
  }

  // 8. Sessões de estudo ("adicionar uma sessão", "agendar sessão", "concluir sessão", "reagendar sessão", "excluir sessão")
  if (/\b(sessao|sessoes|aula|bloco de estudo)\b/.test(norm)) {
    if (/\b(concluir|conclua|finalizar|marcar como concluida)\b/.test(norm)) {
      return {
        actions: [
          {
            type: 'COMPLETE_SESSION',
            params: { disciplineId: disc?.id, actualMinutes: minutes ?? undefined },
          },
        ],
      };
    }
    if (/\b(excluir|exclua|remover|remova|apagar|apague)\b/.test(norm)) {
      return {
        actions: [{ type: 'DELETE_SESSION', params: { disciplineId: disc?.id } }],
      };
    }
    if (/\b(reagendar|reagende|mover|mova|adiar|adie|mudar|mude)\b/.test(norm) && dates.length >= 1) {
      return {
        actions: [
          {
            type: 'RESCHEDULE_SESSION',
            params: { disciplineId: disc?.id, newDate: dates[dates.length - 1] },
          },
        ],
      };
    }

    const timeMatch = norm.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const plannedStart = timeMatch
      ? `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`
      : null;

    return {
      actions: [
        {
          type: 'ADD_SESSION',
          params: {
            disciplineId: disc?.id ?? disciplines[0]?.id,
            topicId: topic?.id ?? null,
            date: dates[0] ?? today,
            plannedMinutes: minutes ?? 60,
            objective: topic?.title ?? (disc ? `Estudo de ${disc.name}` : 'Sessão de estudo'),
            plannedStart,
          },
        },
      ],
    };
  }

  // 9. Tópicos do edital ("adicionar tópico", "marcar tópico como concluído")
  if (/\btopico\b/.test(norm)) {
    if (/\b(concluir|concluido|dominado|em andamento)\b/.test(norm) && topic) {
      const status: TopicStatus = /\bdominado\b/.test(norm)
        ? 'dominado'
        : /\bandamento\b/.test(norm)
          ? 'em-andamento'
          : 'concluido';
      return {
        actions: [{ type: 'UPDATE_TOPIC_STATUS', params: { topicId: topic.id, status } }],
      };
    }
    if (/\b(adicionar|adicione|criar|crie|novo)\b/.test(norm)) {
      const cleanedTitle = userMessage
        .replace(/^(?:quero\s+)?(?:adicionar|adicione|criar|crie)\s+(?:um\s+)?(?:novo\s+)?t[oó]pico\s*(?:de|em|sobre)?\s*/i, '')
        .trim();
      return {
        actions: [
          {
            type: 'ADD_TOPIC',
            params: {
              disciplineId: disc?.id ?? disciplines[0]?.id,
              title: cleanedTitle || 'Novo Tópico de Estudo',
            },
          },
        ],
      };
    }
  }

  // 10. Configurações ("mudar meta diária para 180 minutos", "intervalo de revisão para 1, 7, 30", "tema escuro")
  if (/\b(meta diaria|meta de estudo)\b/.test(norm) && (minutes || /\b(\d+)\b/.test(norm))) {
    const numMatch = norm.match(/\b(\d+)\b/);
    const goal = minutes ?? (numMatch ? Number(numMatch[1]) : 120);
    return {
      actions: [{ type: 'UPDATE_SETTINGS', params: { dailyGoalMinutes: goal } }],
    };
  }

  if (/\bintervalos?\s+de\s+revis(ao|oes)\b/.test(norm)) {
    const nums = [...norm.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
    const parsed = parseIntervals(nums.join(', '));
    if (parsed.ok) {
      return {
        actions: [{ type: 'UPDATE_SETTINGS', params: { reviewIntervals: parsed.value } }],
      };
    }
  }

  if (/\btema\s+(escuro|dark|claro|light|sistema)\b/.test(norm)) {
    const theme: ThemePreference = /\b(escuro|dark)\b/.test(norm)
      ? 'dark'
      : /\b(claro|light)\b/.test(norm)
        ? 'light'
        : 'system';
    return {
      actions: [{ type: 'UPDATE_SETTINGS', params: { theme } }],
    };
  }

  // 11. Gerar cronograma ("gerar cronograma")
  if (/\b(gerar|gere|criar|crie)\s+(?:o\s+)?cronograma\b/.test(norm)) {
    return {
      actions: [{ type: 'GENERATE_SCHEDULE', params: { startDate: dates[0] ?? today } }],
    };
  }

  // 12. Navegação ("ir para revisões", "abrir simulados", "abrir caderno de erros")
  if (/\b(ir para|abrir|abra|mostrar|mostre|navegar para)\b/.test(norm)) {
    const routes: Array<[RegExp, string]> = [
      [/\brevis(ao|oes)\b/, '/revisoes'],
      [/\b(caderno de erros?|erros?)\b/, '/erros'],
      [/\b(calendario|agenda)\b/, '/calendario'],
      [/\bcronograma\b/, '/cronograma'],
      [/\b(estudar agora|cronometro|foco)\b/, '/estudar-agora'],
      [/\bquest(ao|oes)\b/, '/questoes'],
      [/\bsimulados?\b/, '/simulados'],
      [/\b(disciplinas?|edital|topicos?)\b/, '/disciplinas'],
      [/\b(relatorios?|estatisticas?|desempenho)\b/, '/relatorios'],
      [/\bconfigurac(ao|oes)\b/, '/configuracoes'],
      [/\b(visao geral|inicio|home|dashboard)\b/, '/'],
    ];
    for (const [regex, route] of routes) {
      if (regex.test(norm)) {
        return { actions: [{ type: 'NAVIGATE', params: { route } }] };
      }
    }
  }

  // 13. Caso mencione mudar data de erro/caderno de erros ("mudar data do caderno de erros do dia 10 para 16")
  if (/\b(caderno de erros?|erros?)\b/.test(norm) && dates.length >= 1) {
    return {
      actions: [
        {
          type: 'RESCHEDULE_REVIEWS',
          params: {
            fromDueDate: dates.length >= 2 ? dates[0] : undefined,
            newDueDate: dates[dates.length - 1],
            disciplineId: disc?.id,
          },
        },
      ],
    };
  }

  // Default: Resumo inteligente + orientações de comandos
  return {
    actions: [{ type: 'STATUS_SUMMARY' }],
  };
}

async function tryGeminiAssistantIntent(
  userMessage: string,
  apiKey: string,
  today: DateKey,
): Promise<{ actions: AssistantAction[]; directReply?: string } | null> {
  try {
    const [disciplines, topics, reviews, errorNotes] = await Promise.all([
      db.disciplines.toArray(),
      db.topics.toArray(),
      db.reviews.toArray(),
      db.errorNotes.toArray(),
    ]);
    const discSummary = disciplines.map((d) => `${d.id}: ${d.name}`).join(', ');
    const pendingReviewsCount = reviews.filter((r) => r.status === 'pendente').length;

    const systemPrompt = `Você é o Assistente IA oficial da plataforma estudaê.
Data de hoje: ${today}.
Disciplinas disponíveis (id: nome): ${discSummary}.
Total de tópicos ativos: ${topics.length}. Revisões pendentes: ${pendingReviewsCount}. Cadernos de erro: ${errorNotes.length}.

Sua tarefa é traduzir o pedido do usuário em JSON estrito no formato:
{
  "reply": "resposta cordial e objetiva em português",
  "actions": [
    {
      "type": "RESCHEDULE_REVIEWS" | "SCHEDULE_REVIEW" | "COMPLETE_REVIEW" | "REOPEN_REVIEW" | "DELETE_REVIEW" | "SYNC_REVIEWS" | "ADD_ERROR_NOTE" | "UPDATE_ERROR_STATUS" | "DELETE_ERROR_NOTE" | "ADD_SESSION" | "COMPLETE_SESSION" | "RESCHEDULE_SESSION" | "DELETE_SESSION" | "START_TIMER" | "PAUSE_TIMER" | "RESUME_TIMER" | "FINISH_TIMER" | "DISCARD_TIMER" | "LOG_QUESTIONS" | "ADD_TOPIC" | "UPDATE_TOPIC_STATUS" | "GENERATE_SCHEDULE" | "UPDATE_SETTINGS" | "NAVIGATE" | "STATUS_SUMMARY",
      "params": { ... }
    }
  ]
}
Parâmetros aceitos por tipo:
- RESCHEDULE_REVIEWS: { newDueDate: "YYYY-MM-DD", fromDueDate?: "YYYY-MM-DD", disciplineId?: string, onlyOverdue?: boolean, days?: number }
- SCHEDULE_REVIEW: { disciplineId: string, topicId?: string | null, title: string, baseDate?: "YYYY-MM-DD" }
- COMPLETE_REVIEW: { disciplineId?: string, all?: boolean }
- SYNC_REVIEWS: {}
- ADD_ERROR_NOTE: { disciplineId: string, topicId?: string | null, sourceReference: string, explanation: string, errorType?: "falta-conteudo" | "desatencao" | "interpretacao" | "chute", errorDate?: "YYYY-MM-DD", nextReviewDate?: "YYYY-MM-DD" | null }
- ADD_SESSION: { disciplineId: string, topicId?: string | null, date?: "YYYY-MM-DD", plannedMinutes?: number, type?: "teoria" | "questoes" | "revisao" | "simulado", objective?: string, plannedStart?: "HH:mm" | null }
- COMPLETE_SESSION: { disciplineId?: string, actualMinutes?: number }
- RESCHEDULE_SESSION: { disciplineId?: string, newDate: "YYYY-MM-DD" }
- DELETE_SESSION: { disciplineId?: string }
- START_TIMER: { disciplineId: string, plannedMinutes?: number, objective?: string }
- PAUSE_TIMER / RESUME_TIMER / FINISH_TIMER / DISCARD_TIMER: {}
- LOG_QUESTIONS: { disciplineId: string, total: number, correct: number, date?: "YYYY-MM-DD", source?: string }
- ADD_TOPIC: { disciplineId: string, title: string }
- UPDATE_SETTINGS: { dailyGoalMinutes?: number, reviewIntervals?: number[], examDate?: "YYYY-MM-DD", theme?: "light" | "dark" | "system" }
- NAVIGATE: { route: "/" | "/calendario" | "/cronograma" | "/estudar-agora" | "/questoes" | "/erros" | "/revisoes" | "/simulados" | "/disciplinas" | "/relatorios" | "/configuracoes" }
- STATUS_SUMMARY: {}
Responda APENAS com o objeto JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText) as {
      reply?: string;
      actions?: AssistantAction[];
    };
    if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) return null;
    return {
      actions: parsed.actions,
      directReply: parsed.reply,
    };
  } catch {
    return null;
  }
}

/**
 * Processa a mensagem do usuário, executa todas as ações correspondentes na plataforma
 * e retorna a confirmação detalhada.
 */
export async function processAssistantMessage(
  userMessage: string,
  today: DateKey = todayKey(),
): Promise<AssistantResponse> {
  const settings = await getSettings();
  let plan: { actions: AssistantAction[]; directReply?: string } | null = null;

  if (settings.geminiApiKey?.trim()) {
    plan = await tryGeminiAssistantIntent(userMessage, settings.geminiApiKey.trim(), today);
  }
  if (!plan) {
    plan = await parseBuiltinAssistantIntent(userMessage, today);
  }

  const executedActions: string[] = [];
  let navigateTo: string | undefined;

  for (const action of plan.actions) {
    const res = await executeAssistantAction(action, today);
    executedActions.push(res.summary);
    if (res.navigateTo) {
      navigateTo = res.navigateTo;
    }
  }

  const reply = plan.directReply
    ? `${plan.directReply}\n\n${executedActions.join('\n')}`
    : executedActions.join('\n\n');

  return {
    reply,
    executedActions,
    navigateTo,
  };
}
