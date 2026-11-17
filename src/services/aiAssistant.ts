import { isRetiredPlannedSession, nextCycleActivity } from '../domain/schedule';
import { PRIMARY_GEMINI_MODEL, orderGeminiModels } from './geminiModels';
import { db } from '../db/db';
import type {
  Discipline,
  ErrorStatus,
  ErrorType,
  ThemePreference,
  TopicStatus,
} from '../db/types';
import { reviewBuckets } from '../domain/metrics';
import { computeRank } from '../domain/rank';
import { parseIntervals } from '../domain/reviews';
import { addDays, diffDays, formatDate, isValidDateKey, todayKey, type DateKey } from '../lib/dates';
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
    | 'OPEN_CYCLE'
    | 'UPDATE_SETTINGS'
    | 'NAVIGATE'
    | 'STATUS_SUMMARY';
  params?: Record<string, unknown>;
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantResponse {
  reply: string;
  executedActions: string[];
  navigateTo?: string;
}

export interface ProcessAssistantOptions {
  today?: DateKey;
  history?: AssistantChatMessage[];
  apiKey?: string;
}

const DEFAULT_GEMINI_MODELS = [
  PRIMARY_GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

const geminiModelsCache = new Map<string, string[]>();

export function clearGeminiModelsCache(): void {
  geminiModelsCache.clear();
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
  for (const d of disciplines) {
    const nName = normalize(d.name);
    const nId = normalize(d.id.replace(/-/g, ' '));
    if ((nName && norm.includes(nName)) || (nId.length >= 4 && norm.includes(nId))) {
      return d;
    }
  }
  const keywords: Array<[RegExp, string]> = [
    [/\b(arquitetura|arq|devops|apis?|microsservicos?)\b/, 'arquitetura'],
    [/\b(engenharia|eng|scrum|agile|requisitos|uml|historias?)\b/, 'engenharia'],
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

/**
 * Extrai datas mencionadas no texto em português (ex.: "2026-11-16", "16/11/2026", "16/11", "dia 10", "dia 16", "hoje", "amanhã").
 */
export function extractDatesFromText(text: string, today: DateKey = todayKey()): DateKey[] {
  const results: DateKey[] = [];
  const norm = normalize(text);
  const [currentYear, currentMonth] = today.split('-').map(Number);

  const pushUnique = (d: DateKey) => {
    if (isValidDateKey(d) && !results.includes(d)) {
      results.push(d);
    }
  };

  if (/\bdepois de amanha\b/.test(norm)) {
    pushUnique(addDays(today, 2));
  } else if (/\bamanha\b/.test(norm)) {
    pushUnique(addDays(today, 1));
  }
  if (/\bhoje\b/.test(norm)) {
    pushUnique(today);
  }
  if (/\bontem\b/.test(norm)) {
    pushUnique(addDays(today, -1));
  }

  for (const m of norm.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g)) {
    pushUnique(`${m[1]}-${m[2]}-${m[3]}`);
  }

  for (const m of norm.matchAll(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(20\d{2}|\d{2}))?\b/g)) {
    const day = String(Number(m[1])).padStart(2, '0');
    const month = String(Number(m[2])).padStart(2, '0');
    const rawYear = m[3];
    const year = rawYear
      ? rawYear.length === 2
        ? `20${rawYear}`
        : rawYear
      : String(currentYear);
    pushUnique(`${year}-${month}-${day}`);
  }

  for (const m of norm.matchAll(/\bdia\s+(0?[1-9]|[12]\d|3[01])(?:\s+para\s+(?:o\s+)?(?:dia\s+)?(0?[1-9]|[12]\d|3[01]))?\b/g)) {
    const day1 = String(Number(m[1])).padStart(2, '0');
    const monthStr = String(currentMonth).padStart(2, '0');
    pushUnique(`${currentYear}-${monthStr}-${day1}`);
    if (m[2]) {
      const day2 = String(Number(m[2])).padStart(2, '0');
      pushUnique(`${currentYear}-${monthStr}-${day2}`);
    }
  }

  for (const m of norm.matchAll(/\b(?:para\s+(?:o\s+)?|pro\s+|ate\s+(?:o\s+)?)?(?:dia\s+)(0?[1-9]|[12]\d|3[01])\b/g)) {
    const day = String(Number(m[1])).padStart(2, '0');
    const monthStr = String(currentMonth).padStart(2, '0');
    pushUnique(`${currentYear}-${monthStr}-${day}`);
  }

  return results;
}

export function extractDurationMinutes(text: string): number | null {
  const norm = normalize(text);
  const minMatch = norm.match(/\b(\d{1,3})\s*(?:min|minutos?|m)\b/);
  if (minMatch) return Math.max(5, Math.min(480, Number(minMatch[1])));

  const hourMatch = norm.match(/\b(\d{1,2})(?:[.,](\d))?\s*(?:h|horas?)\b/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    const frac = hourMatch[2] ? Number(hourMatch[2]) * 6 : 0;
    return Math.max(15, Math.min(480, hours * 60 + frac));
  }
  return null;
}

/**
 * Executa uma ação estruturada diretamente no banco de dados da plataforma.
 */
export async function executeAssistantAction(
  action: AssistantAction,
  today: DateKey = todayKey(),
): Promise<{ summary: string; navigateTo?: string }> {
  const params = action.params ?? {};
  const disciplines = await db.disciplines.toArray();

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
      const rawNewDate = (params.newDueDate as DateKey | undefined) ?? today;
      const newDueDate = isValidDateKey(rawNewDate) ? rawNewDate : today;
      const fromDueDate =
        typeof params.fromDueDate === 'string' && isValidDateKey(params.fromDueDate)
          ? params.fromDueDate
          : undefined;
      const disciplineId =
        typeof params.disciplineId === 'string' ? params.disciplineId : undefined;
      const onlyOverdue = Boolean(params.onlyOverdue);
      const daysDelta = typeof params.days === 'number' ? params.days : undefined;

      if (daysDelta && !params.newDueDate) {
        const pending = await db.reviews.where('status').equals('pendente').toArray();
        const filtered = pending.filter((r) => {
          if (disciplineId && r.disciplineId !== disciplineId) return false;
          if (fromDueDate && r.dueDate !== fromDueDate) return false;
          if (onlyOverdue && r.dueDate >= today) return false;
          return true;
        });
        for (const r of filtered) {
          await postponeReview(r.id, daysDelta);
        }
        return {
          summary:
            filtered.length > 0
              ? `${filtered.length} revisão(ões) adiada(s) em ${daysDelta} dia(s) (e sincronizadas com o Caderno de Erros).`
              : 'Nenhuma revisão pendente encontrada com os critérios informados.',
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

      if (count === 0 && fromDueDate) {
        const notes = await db.errorNotes.toArray();
        const matchingNotes = notes.filter(
          (n) =>
            n.nextReviewDate === fromDueDate &&
            (!disciplineId || n.disciplineId === disciplineId),
        );
        for (const note of matchingNotes) {
          await db.errorNotes.update(note.id, {
            nextReviewDate: newDueDate,
            updatedAt: new Date().toISOString(),
          });
        }
        await reconcileReviewsAndErrorNotes();
        if (matchingNotes.length > 0) {
          return {
            summary: `${matchingNotes.length} registro(s) do Caderno de Erros e suas revisões foram movidos de ${formatDate(fromDueDate)} para ${formatDate(newDueDate)}.`,
            navigateTo: '/revisoes',
          };
        }
      }

      if (count === 0) {
        const fallbackCount = await bulkRescheduleReviews({
          newDueDate,
          disciplineId,
          today,
        });
        if (fallbackCount > 0) {
          return {
            summary: `${fallbackCount} revisão(ões) pendente(s) reagendada(s) para ${formatDate(newDueDate)} (sincronizadas com o Caderno de Erros).`,
            navigateTo: '/revisoes',
          };
        }
      }

      return {
        summary:
          count > 0
            ? `${count} revisão(ões) reagendada(s) para ${formatDate(newDueDate)} e sincronizada(s) com o Caderno de Erros.`
            : `Nenhuma revisão pendente encontrada para reagendar para ${formatDate(newDueDate)}.`,
        navigateTo: '/revisoes',
      };
    }

    case 'SCHEDULE_REVIEW': {
      const discId =
        (params.disciplineId as string) || disciplines[0]?.id || 'logica-programacao';
      const topicId = (params.topicId as string | null) ?? null;
      const title = (params.title as string) || 'Revisão programada via Assistente IA';
      const baseDate =
        typeof params.baseDate === 'string' && isValidDateKey(params.baseDate)
          ? params.baseDate
          : today;
      const created = await scheduleTopicReviews(discId, topicId, title, baseDate);
      return {
        summary:
          created > 0
            ? `Revisão "${title}" agendada com sucesso (iniciando pelo ciclo de 1 dia a partir de ${formatDate(baseDate)}).`
            : `A revisão "${title}" já estava agendada.`,
        navigateTo: '/revisoes',
      };
    }

    case 'COMPLETE_REVIEW': {
      const reviewId = params.reviewId as string | undefined;
      const disciplineId = params.disciplineId as string | undefined;
      const completeAll = Boolean(params.all);

      if (reviewId) {
        await completeReview(reviewId);
        return {
          summary: 'Revisão concluída! A próxima etapa do ciclo espaçado foi liberada automaticamente.',
          navigateTo: '/revisoes',
        };
      }

      const pending = await db.reviews.where('status').equals('pendente').toArray();
      const targets = pending
        .filter((r) => !disciplineId || r.disciplineId === disciplineId)
        .filter((r) => completeAll || r.dueDate <= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      if (targets.length === 0 && pending.length > 0) {
        await completeReview(pending[0].id);
        return {
          summary: `Revisão "${pending[0].title}" concluída! Próximo ciclo liberado.`,
          navigateTo: '/revisoes',
        };
      }

      const toComplete = completeAll ? targets : targets.slice(0, 1);
      for (const r of toComplete) {
        await completeReview(r.id);
      }
      return {
        summary:
          toComplete.length > 0
            ? `${toComplete.length} revisão(ões) marcada(s) como concluída(s)! Próxima etapa do ciclo liberada.`
            : 'Não há revisões pendentes para concluir.',
        navigateTo: '/revisoes',
      };
    }

    case 'REOPEN_REVIEW': {
      const completed = await db.reviews.where('status').equals('concluida').toArray();
      const target = completed[completed.length - 1];
      if (!target) {
        return { summary: 'Nenhuma revisão concluída encontrada para reabrir.' };
      }
      await reopenReview(target.id);
      return {
        summary: `Revisão "${target.title}" reaberta como pendente.`,
        navigateTo: '/revisoes',
      };
    }

    case 'DELETE_REVIEW': {
      const reviewId = params.reviewId as string | undefined;
      const titleQuery = typeof params.title === 'string' ? normalize(params.title) : '';
      const all = await db.reviews.toArray();
      const target = reviewId
        ? all.find((r) => r.id === reviewId)
        : titleQuery
          ? all.find((r) => normalize(r.title).includes(titleQuery))
          : all.find((r) => r.status === 'pendente');
      if (!target) {
        return { summary: 'Nenhuma revisão encontrada para excluir.' };
      }
      await deleteReview(target.id);
      return {
        summary: `Revisão "${target.title}" excluída.`,
        navigateTo: '/revisoes',
      };
    }

    case 'ADD_ERROR_NOTE': {
      const discId =
        (params.disciplineId as string) || disciplines[0]?.id || 'logica-programacao';
      const topicId = (params.topicId as string | null) ?? null;
      const sourceReference =
        (params.sourceReference as string) || 'Registro via Assistente IA';
      const explanation =
        (params.explanation as string) ||
        'Revisar conceito e refazer questões equivalentes.';
      const errorType = ((params.errorType as ErrorType) || 'falta-conteudo') as ErrorType;
      const errorDate =
        typeof params.errorDate === 'string' && isValidDateKey(params.errorDate)
          ? params.errorDate
          : today;
      const nextReviewDate =
        typeof params.nextReviewDate === 'string' && isValidDateKey(params.nextReviewDate)
          ? params.nextReviewDate
          : null;

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

      const discName = disciplines.find((d) => d.id === discId)?.name ?? discId;
      return {
        summary: `Erro adicionado ao Caderno de Erros em **${discName}** ("${note.sourceReference}") com revisão agendada para ${formatDate(note.nextReviewDate ?? addDays(errorDate, 1))}.`,
        navigateTo: '/erros',
      };
    }

    case 'UPDATE_ERROR_STATUS': {
      const status = ((params.status as ErrorStatus) || 'dominado') as ErrorStatus;
      const notes = await db.errorNotes.toArray();
      const target = notes.find((n) => n.status !== status) ?? notes[0];
      if (!target) {
        return { summary: 'Nenhum registro encontrado no Caderno de Erros.' };
      }
      await setErrorStatus(target.id, status);
      return {
        summary: `Status do erro "${target.sourceReference}" atualizado para **${status}**.`,
        navigateTo: '/erros',
      };
    }

    case 'DELETE_ERROR_NOTE': {
      const notes = await db.errorNotes.toArray();
      const target = notes[notes.length - 1];
      if (!target) {
        return { summary: 'Nenhum erro encontrado no Caderno de Erros para excluir.' };
      }
      await deleteErrorNote(target.id);
      return {
        summary: `Erro "${target.sourceReference}" removido do Caderno de Erros e revisões vinculadas excluídas.`,
        navigateTo: '/erros',
      };
    }

    case 'ADD_SESSION': {
      const discId =
        (params.disciplineId as string) || disciplines[0]?.id || 'logica-programacao';
      const topicId = (params.topicId as string | null) ?? null;
      const date =
        typeof params.date === 'string' && isValidDateKey(params.date) ? params.date : today;
      const plannedMinutes =
        typeof params.plannedMinutes === 'number' ? params.plannedMinutes : 60;
      const objective = (params.objective as string) || 'Sessão criada via Assistente IA';
      const plannedStart = (params.plannedStart as string | null) ?? null;

      const session = await createSession({
        date,
        disciplineId: discId,
        topicId,
        plannedStart,
        plannedMinutes,
        objective,
        notes: 'Criada pelo Assistente IA',
      });

      const discName = disciplines.find((d) => d.id === discId)?.name ?? discId;
      return {
        summary: `Sessão de estudo criada em **${discName}** para ${formatDate(session.date)} (${session.plannedMinutes} min — "${session.objective}").`,
        navigateTo: '/calendario',
      };
    }

    case 'COMPLETE_SESSION': {
      const disciplineId = params.disciplineId as string | undefined;
      const date =
        typeof params.date === 'string' && isValidDateKey(params.date) ? params.date : today;
      const actualMinutes =
        typeof params.actualMinutes === 'number' ? params.actualMinutes : undefined;

      const sessions = await db.sessions.filter(s => !isRetiredPlannedSession(s)).toArray();
      const target =
        sessions.find(
          (s) =>
            s.status !== 'concluida' &&
            s.date === date &&
            (!disciplineId || s.disciplineId === disciplineId),
        ) ??
        sessions.find(
          (s) => s.status !== 'concluida' && (!disciplineId || s.disciplineId === disciplineId),
        );

      if (!target) {
        return { summary: 'Nenhuma sessão pendente encontrada para concluir.' };
      }

      await setSessionStatus(target.id, 'concluida', actualMinutes ?? target.plannedMinutes);
      const discName =
        disciplines.find((d) => d.id === target.disciplineId)?.name ?? target.disciplineId;
      return {
        summary: `Sessão de **${discName}** ("${target.objective}") marcada como concluída (${actualMinutes ?? target.plannedMinutes} min)!`,
        navigateTo: '/calendario',
      };
    }

    case 'RESCHEDULE_SESSION': {
      const disciplineId = params.disciplineId as string | undefined;
      const fromDate =
        typeof params.fromDate === 'string' && isValidDateKey(params.fromDate)
          ? params.fromDate
          : undefined;
      const newDate =
        typeof params.newDate === 'string' && isValidDateKey(params.newDate)
          ? params.newDate
          : addDays(today, 1);

      const sessions = await db.sessions.filter(s => !isRetiredPlannedSession(s)).toArray();
      const target =
        sessions.find(
          (s) =>
            s.status !== 'concluida' &&
            (!fromDate || s.date === fromDate) &&
            (!disciplineId || s.disciplineId === disciplineId),
        ) ?? sessions.find((s) => s.status !== 'concluida');

      if (!target) {
        return { summary: 'Nenhuma sessão pendente encontrada para reagendar.' };
      }

      await rescheduleSession(target.id, newDate, 'Reagendada via Assistente IA');
      const discName =
        disciplines.find((d) => d.id === target.disciplineId)?.name ?? target.disciplineId;
      return {
        summary: `Sessão de **${discName}** ("${target.objective}") reagendada para ${formatDate(newDate)}.`,
        navigateTo: '/calendario',
      };
    }

    case 'DELETE_SESSION': {
      const disciplineId = params.disciplineId as string | undefined;
      const sessions = await db.sessions.filter(s => !isRetiredPlannedSession(s)).toArray();
      const target =
        sessions.find(
          (s) => s.status !== 'concluida' && (!disciplineId || s.disciplineId === disciplineId),
        ) ?? sessions[sessions.length - 1];
      if (!target) {
        return { summary: 'Nenhuma sessão encontrada para excluir.' };
      }
      await deleteSession(target.id);
      return {
        summary: `Sessão "${target.objective}" (${formatDate(target.date)}) excluída.`,
        navigateTo: '/calendario',
      };
    }

    case 'START_TIMER': {
      const discId =
        (params.disciplineId as string) || disciplines[0]?.id || 'logica-programacao';
      const topicId = (params.topicId as string | null) ?? null;
      const plannedMinutes =
        typeof params.plannedMinutes === 'number' ? params.plannedMinutes : 60;
      const objective = (params.objective as string) || 'Sessão de foco iniciada pelo Assistente IA';

      const active = await getActiveTimer();
      if (active) {
        await discardTimer();
      }
      await startAdHocTimer({
        disciplineId: discId,
        topicId,
        plannedMinutes,
        objective,
        notes: '',
      });
      const discName = disciplines.find((d) => d.id === discId)?.name ?? discId;
      return {
        summary: `Cronômetro iniciado para **${discName}** (${plannedMinutes} min)!`,
        navigateTo: '/estudar-agora',
      };
    }

    case 'PAUSE_TIMER': {
      const active = await getActiveTimer();
      if (!active) return { summary: 'Não há cronômetro ativo no momento.' };
      await pauseTimer();
      return { summary: 'Cronômetro pausado.', navigateTo: '/estudar-agora' };
    }

    case 'RESUME_TIMER': {
      const active = await getActiveTimer();
      if (!active) return { summary: 'Não há cronômetro pausado no momento.' };
      await resumeTimer();
      return { summary: 'Cronômetro retomado!', navigateTo: '/estudar-agora' };
    }

    case 'FINISH_TIMER': {
      const active = await getActiveTimer();
      if (!active) return { summary: 'Não há cronômetro ativo para finalizar.' };
      const session = await finishTimer();
      const mins = session ? Math.max(1, Math.round(session.actualSeconds / 60)) : 0;
      return {
        summary: session
          ? `Cronômetro finalizado! Sessão registrada com ${mins} min estudados.`
          : 'Cronômetro finalizado.',
        navigateTo: '/estudar-agora',
      };
    }

    case 'DISCARD_TIMER': {
      await discardTimer();
      return { summary: 'Cronômetro descartado.' };
    }

    case 'LOG_QUESTIONS': {
      const discId =
        (params.disciplineId as string) || disciplines[0]?.id || 'logica-programacao';
      const topicId = (params.topicId as string | null) ?? null;
      const total = Math.max(1, Number(params.total) || 10);
      const correct = Math.min(total, Math.max(0, Number(params.correct ?? total)));
      const incorrect = Math.max(0, total - correct);
      const date =
        typeof params.date === 'string' && isValidDateKey(params.date) ? params.date : today;
      const source = (params.source as string) || 'Bateria registrada via Assistente IA';

      await saveQuestionLog(
        {
          date,
          disciplineId: discId,
          topicId,
          source,
          total,
          correct,
          incorrect,
          blank: 0,
          durationMinutes: null,
          notes: '',
        },
        { allowDuplicate: true },
      );
      const discName = disciplines.find((d) => d.id === discId)?.name ?? discId;
      const pct = Math.round((correct / total) * 100);
      return {
        summary: `Bateria registrada em **${discName}**: ${correct}/${total} acertos (${pct}%) em ${formatDate(date)}.`,
        navigateTo: '/questoes',
      };
    }

    case 'ADD_TOPIC': {
      const discId =
        (params.disciplineId as string) || disciplines[0]?.id || 'logica-programacao';
      const title = (params.title as string) || 'Novo Tópico';
      const topic = await createTopic(discId, null, {
        title,
        status: 'nao-iniciado',
        notes: '',
      });
      const discName = disciplines.find((d) => d.id === discId)?.name ?? discId;
      return {
        summary: `Tópico "${topic.title}" adicionado à disciplina **${discName}**.`,
        navigateTo: '/disciplinas',
      };
    }

    case 'UPDATE_TOPIC_STATUS': {
      const topicId = params.topicId as string | undefined;
      const status = ((params.status as TopicStatus) || 'concluido') as TopicStatus;
      if (!topicId) {
        return { summary: 'Nenhum tópico específico encontrado para atualizar.' };
      }
      await setTopicStatus(topicId, status);
      return {
        summary: `Status do tópico atualizado para **${status}**.`,
        navigateTo: '/disciplinas',
      };
    }

    case 'OPEN_CYCLE': {
      return { summary: 'Seu ciclo de estudos é contínuo e distribui as sessões entre específicos (80%) e básicos (20%). Continue de onde parou.', navigateTo: '/cronograma' };
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
          : typeof params.reviewIntervals === 'string'
            ? (() => {
                const parsed = parseIntervals(params.reviewIntervals);
                return parsed.ok ? parsed.value : [1, 7, 30];
              })()
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
        db.sessions.filter(s => !isRetiredPlannedSession(s)).toArray(),
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
 * Constrói o snapshot completo e determinístico de todos os dados reais do usuário no banco de dados.
 * Serve como fonte única da verdade (grounding) para impedir qualquer alucinação do modelo Gemini.
 */
export async function buildAssistantGroundingContext(today: DateKey = todayKey()): Promise<string> {
  await reconcileReviewsAndErrorNotes();

  const [
    disciplines,
    topics,
    sessions,
    reviews,
    errorNotes,
    questionLogs,
    mockExams,
    settings,
    activeTimer,
  ] = await Promise.all([
    db.disciplines.toArray(),
    db.topics.toArray(),
    db.sessions.filter(s => !isRetiredPlannedSession(s)).toArray(),
    db.reviews.toArray(),
    db.errorNotes.toArray(),
    db.questionLogs.toArray(),
    db.mockExams.toArray(),
    getSettings(),
    getActiveTimer(),
  ]);

  const nextCycle = nextCycleActivity({ disciplines, topics, sessions, questionLogs, errorNotes, settings });
  const discMap = new Map(disciplines.map((d) => [d.id, d]));
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const rankState = computeRank({
    sessions,
    reviews,
    settings,
    today,
  });

  const minsByDisc = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === 'concluida' || s.actualSeconds > 0) {
      const m = s.actualSeconds > 0 ? Math.round(s.actualSeconds / 60) : s.plannedMinutes;
      minsByDisc.set(s.disciplineId, (minsByDisc.get(s.disciplineId) ?? 0) + m);
    }
  }
  const totalStudiedMins = Array.from(minsByDisc.values()).reduce((acc, m) => acc + m, 0);

  const qByDisc = new Map<string, { total: number; correct: number }>();
  for (const q of questionLogs) {
    const prev = qByDisc.get(q.disciplineId) ?? { total: 0, correct: 0 };
    prev.total += q.total;
    prev.correct += q.correct;
    qByDisc.set(q.disciplineId, prev);
  }

  const revBuckets = reviewBuckets(reviews, today);

  const daysUntilExam =
    settings.examDate && isValidDateKey(settings.examDate)
      ? diffDays(settings.examDate, today)
      : null;

  const lines: string[] = [];

  lines.push('=== DADOS REAIS DO USUÁRIO NA PLATAFORMA ESTUDAÊ (FONTE ÚNICA DA VERDADE) ===');
  lines.push(
    `Data de hoje: ${today} (${formatDate(today)}) | Ontem: ${addDays(today, -1)} (${formatDate(addDays(today, -1))}) | Amanhã: ${addDays(today, 1)} (${formatDate(addDays(today, 1))})`,
  );

  // 1. Concurso e Configurações
  lines.push('\n[1. CONCURSO E CONFIGURAÇÕES]');
  lines.push(`- Concurso: ${settings.contestName || 'Banco do Nordeste (BNB)'}`);
  lines.push(`- Cargo/Perfil: ${settings.contestRole || 'Analista de Sistemas'}`);
  lines.push(
    `- Data da prova: ${settings.examDate ? `${settings.examDate} (${formatDate(settings.examDate)}) — faltam ${daysUntilExam} dia(s)` : 'Não definida'}`,
  );
  lines.push(`- Meta diária: ${settings.dailyGoalMinutes} min/dia (${(settings.dailyGoalMinutes / 60).toFixed(1)}h/dia)`);
  lines.push(`- Intervalos de revisão espaçada: ${(settings.reviewIntervals ?? [1, 7, 30]).join(', ')} dias`);
  lines.push('- Planejamento: ciclo contínuo por área do edital, sem datas obrigatórias.');
  lines.push(`- Tema visual: ${settings.theme}`);

  if (nextCycle) lines.push(`- Próxima atividade do ciclo: ${nextCycle.discipline.name} — ${nextCycle.topic?.title ?? 'Sem assunto disponível'} (${nextCycle.minutes} min). Motivo: ${nextCycle.reason}`);

  // 2. Gamificação, Patente, XP, Ofensiva e Escudos
  lines.push('\n[2. PATENTE, XP, OFENSIVA E ESCUDOS]');
  lines.push(`- Patente atual: ${rankState.rank.name} (nível ${rankState.rankIndex + 1} de 18)`);
  lines.push(`- XP Total atual: ${rankState.xp} XP (XP ganho hoje: +${rankState.todayXp} XP)`);
  lines.push(
    `- Próxima patente: ${
      rankState.nextRank
        ? `${rankState.nextRank.name} (necessário: ${rankState.nextRank.minXp} XP | faltam ${rankState.xpToNext} XP | progresso no nível atual: ${Math.round(rankState.progress * 100)}%)`
        : 'Patente máxima alcançada (Aprovado de Elite — 18.000+ XP)'
    }`,
  );
  lines.push(`- Tempo líquido total estudado: ${(totalStudiedMins / 60).toFixed(1)}h (${totalStudiedMins} min)`);
  lines.push(`- Sequência atual (streak): ${rankState.streak} dia(s) consecutivo(s) válidos (recorde: ${rankState.bestStreak} dia(s))`);
  lines.push(
    `- Proteções ativas: Escudo de Patente=${rankState.shield ? 'Ativo' : 'Indisponível'} | Streak Freeze=${rankState.freezeAvailable ? 'Disponível' : `Em recarga (${rankState.freezeCooldownLeft}d)`}`,
  );
  lines.push(
    '- Regras oficiais de XP e Patentes da plataforma: Dia estudado válido (>=30 min ou meta diária): +100 XP; Meta diária cumprida: +50 XP; Flashcard de revisão acertado: +20 XP; flashcard errado: -20 XP; revisão concluída sem flashcard: +30 XP (máx. 4/dia); Bônus de retorno após >=2 ausências: +50 XP; Penalidades em dias previstos sem estudo: 1ª ausência -250 XP, 2ª em diante -400 XP/dia (XP nunca fica negativo; Streak Freeze protege 1 ausência a cada 30 dias; Escudo de Patente ganho a cada 7 dias válidos seguidos impede 1 queda de patente).',
  );

  // 3. Cronômetro Ativo
  lines.push('\n[3. CRONÔMETRO ATIVO AGORA]');
  if (activeTimer) {
    const dName = discMap.get(activeTimer.disciplineId)?.name ?? activeTimer.disciplineId;
    const plannedMins = Math.round(activeTimer.plannedSeconds / 60);
    lines.push(
      `- Cronômetro ativo: Disciplina "${dName}" (id: ${activeTimer.disciplineId}) | Objetivo: "${activeTimer.objective}" | Planejado: ${plannedMins} min | Status: ${activeTimer.status === 'running' ? 'Em andamento' : 'Pausado'}`,
    );
  } else {
    lines.push('- Nenhum cronômetro ativo no momento.');
  }

  // 4. Disciplinas e Estatísticas por Disciplina
  lines.push('\n[4. DISCIPLINAS E DESEMPENHO POR DISCIPLINA]');
  for (const d of disciplines) {
    const mins = minsByDisc.get(d.id) ?? 0;
    const qStat = qByDisc.get(d.id) ?? { total: 0, correct: 0 };
    const acc = qStat.total > 0 ? Math.round((qStat.correct / qStat.total) * 100) : 0;
    const dTopics = topics.filter((t) => t.disciplineId === d.id && t.active);
    const doneTopics = dTopics.filter((t) => t.status === 'concluido' || t.status === 'dominado').length;
    const dSessions = sessions.filter((s) => s.disciplineId === d.id);
    const completedSessions = dSessions.filter((s) => s.status === 'concluida').length;
    const dErrors = errorNotes.filter((e) => e.disciplineId === d.id).length;

    lines.push(
      `- ID: "${d.id}" | Nome: "${d.name}" (${d.kind === 'technical' ? 'Conhecimentos Específicos' : 'Conhecimentos Básicos'}) | Ativa: ${d.active ? 'Sim' : 'Não'} | Estudado: ${mins} min (${(mins / 60).toFixed(1)}h) em ${completedSessions}/${dSessions.length} sessões | Questões: ${qStat.correct}/${qStat.total} acertos (${acc}%) | Tópicos concluídos/dominados: ${doneTopics}/${dTopics.length} | Erros no caderno: ${dErrors}`,
    );
  }

  // 5. Tópicos do Edital Verticalizado
  lines.push('\n[5. TÓPICOS DO EDITAL VERTICALIZADO POR DISCIPLINA]');
  for (const d of disciplines.filter((disc) => disc.active)) {
    const dTopics = topics
      .filter((t) => t.disciplineId === d.id && t.active)
      .sort((a, b) => a.order - b.order);
    if (dTopics.length === 0) continue;
    lines.push(`* ${d.name} (${d.id}):`);
    for (const t of dTopics) {
      lines.push(`  - [id: ${t.id}] "${t.title}" (status: ${t.status})`);
    }
  }

  // 6. Sessões de Estudo
  const todaySessions = sessions.filter((s) => s.date === today);
  const overdueSessions = sessions
    .filter((s) => s.date < today && s.status !== 'concluida')
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcomingSessions = sessions
    .filter((s) => s.date > today && s.date <= addDays(today, 14) && s.status !== 'concluida')
    .sort((a, b) => a.date.localeCompare(b.date));
  const completedSessionsList = sessions
    .filter((s) => s.status === 'concluida')
    .sort((a, b) => b.date.localeCompare(a.date));

  lines.push('\n[6. SESSÕES DE ESTUDO]');
  lines.push(
    `Resumo de sessões: Total=${sessions.length} | Concluídas=${completedSessionsList.length} | Hoje (${today})=${todaySessions.length} | Atrasadas=${overdueSessions.length}`,
  );
  lines.push(`* Sessões de HOJE (${today} — ${formatDate(today)}):`);
  if (todaySessions.length === 0) {
    lines.push('  - Nenhuma sessão agendada para hoje.');
  } else {
    for (const s of todaySessions) {
      const dName = discMap.get(s.disciplineId)?.name ?? s.disciplineId;
      const actualMins = Math.round(s.actualSeconds / 60);
      lines.push(
        `  - [id: ${s.id}] Disciplina: ${dName} (${s.disciplineId}) | Objetivo: "${s.objective}" | Planejado: ${s.plannedMinutes} min | Realizado: ${actualMins} min | Horário: ${s.plannedStart ?? 'livre'} | Status: ${s.status}`,
      );
    }
  }

  lines.push(`* Sessões ATRASADAS (${overdueSessions.length}):`);
  if (overdueSessions.length === 0) {
    lines.push('  - Nenhuma sessão atrasada.');
  } else {
    for (const s of overdueSessions.slice(0, 25)) {
      const dName = discMap.get(s.disciplineId)?.name ?? s.disciplineId;
      lines.push(
        `  - [id: ${s.id}] Data: ${s.date} (${formatDate(s.date)}) | Disciplina: ${dName} (${s.disciplineId}) | Objetivo: "${s.objective}" | ${s.plannedMinutes} min | Status: ${s.status}`,
      );
    }
  }

  lines.push(`* Próximas sessões agendadas nos próximos 14 dias (${upcomingSessions.length}):`);
  if (upcomingSessions.length === 0) {
    lines.push('  - Nenhuma sessão agendada para os próximos 14 dias.');
  } else {
    for (const s of upcomingSessions.slice(0, 30)) {
      const dName = discMap.get(s.disciplineId)?.name ?? s.disciplineId;
      lines.push(
        `  - [id: ${s.id}] Data: ${s.date} (${formatDate(s.date)}) | Disciplina: ${dName} (${s.disciplineId}) | Objetivo: "${s.objective}" | ${s.plannedMinutes} min | Status: ${s.status}`,
      );
    }
  }

  if (completedSessionsList.length > 0) {
    lines.push(`* Últimas sessões concluídas (até 15 mais recentes):`);
    for (const s of completedSessionsList.slice(0, 15)) {
      const dName = discMap.get(s.disciplineId)?.name ?? s.disciplineId;
      const actualMins = Math.round(s.actualSeconds / 60) || s.plannedMinutes;
      lines.push(
        `  - Data: ${s.date} (${formatDate(s.date)}) | Disciplina: ${dName} (${s.disciplineId}) | Objetivo: "${s.objective}" | Tempo estudado: ${actualMins} min`,
      );
    }
  }

  // 7. Revisões Espaçadas
  const completedReviewsCount = reviews.filter((r) => r.status === 'concluida').length;
  lines.push('\n[7. REVISÕES ESPAÇADAS]');
  lines.push(
    `Resumo de revisões: Atrasadas=${revBuckets.overdue.length} | Para hoje (${today})=${revBuckets.today.length} | Próximas=${revBuckets.upcoming.length} | Concluídas=${completedReviewsCount}`,
  );
  lines.push('* Revisões ATRASADAS (pendentes com data anterior a hoje):');
  if (revBuckets.overdue.length === 0) {
    lines.push('  - Nenhuma revisão atrasada.');
  } else {
    for (const r of revBuckets.overdue) {
      const dName = discMap.get(r.disciplineId)?.name ?? r.disciplineId;
      lines.push(
        `  - [id: ${r.id}] Data: ${r.dueDate} (${formatDate(r.dueDate)}) | Disciplina: ${dName} (${r.disciplineId}) | Título: "${r.title}" | Ciclo: ${r.intervalDays}d`,
      );
    }
  }

  lines.push(`* Revisões para HOJE (${today} — ${formatDate(today)}):`);
  if (revBuckets.today.length === 0) {
    lines.push('  - Nenhuma revisão pendente para hoje.');
  } else {
    for (const r of revBuckets.today) {
      const dName = discMap.get(r.disciplineId)?.name ?? r.disciplineId;
      lines.push(
        `  - [id: ${r.id}] Data: ${r.dueDate} (${formatDate(r.dueDate)}) | Disciplina: ${dName} (${r.disciplineId}) | Título: "${r.title}" | Ciclo: ${r.intervalDays}d`,
      );
    }
  }

  lines.push('* Próximas revisões pendentes (futuras):');
  if (revBuckets.upcoming.length === 0) {
    lines.push('  - Nenhuma revisão futura agendada.');
  } else {
    for (const r of revBuckets.upcoming.slice(0, 30)) {
      const dName = discMap.get(r.disciplineId)?.name ?? r.disciplineId;
      lines.push(
        `  - [id: ${r.id}] Data: ${r.dueDate} (${formatDate(r.dueDate)}) | Disciplina: ${dName} (${r.disciplineId}) | Título: "${r.title}" | Ciclo: ${r.intervalDays}d`,
      );
    }
  }

  // 8. Caderno de Erros
  lines.push('\n[8. CADERNO DE ERROS]');
  lines.push(
    `Total de erros registrados: ${errorNotes.length} (Para revisar: ${errorNotes.filter((e) => e.status === 'revisar').length} | Revisados: ${errorNotes.filter((e) => e.status === 'revisado').length} | Dominados: ${errorNotes.filter((e) => e.status === 'dominado').length})`,
  );
  if (errorNotes.length === 0) {
    lines.push('  - Nenhum erro registrado no Caderno de Erros.');
  } else {
    for (const e of errorNotes.slice(0, 40)) {
      const dName = discMap.get(e.disciplineId)?.name ?? e.disciplineId;
      const tTitle = e.topicId ? topicMap.get(e.topicId)?.title : null;
      lines.push(
        `  - [id: ${e.id}] Disciplina: ${dName} (${e.disciplineId})${tTitle ? ` | Tópico: "${tTitle}"` : ''} | Ref: "${e.sourceReference}" | Tipo: ${e.errorType} | Status: ${e.status} | Data do erro: ${e.errorDate} (${formatDate(e.errorDate)}) | Próxima revisão: ${e.nextReviewDate ? `${e.nextReviewDate} (${formatDate(e.nextReviewDate)})` : 'Sem data'} | Explicação/Anotação: "${e.explanation}"`,
      );
    }
  }

  // 9. Baterias de Questões e Simulados
  const totalQuestions = questionLogs.reduce((acc, q) => acc + q.total, 0);
  const totalCorrect = questionLogs.reduce((acc, q) => acc + q.correct, 0);
  const globalAcc = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  lines.push('\n[9. BATERIAS DE QUESTÕES E SIMULADOS]');
  lines.push(
    `Total global de questões resolvidas: ${totalQuestions} | Acertos: ${totalCorrect} | Aproveitamento global: ${globalAcc}%`,
  );
  if (questionLogs.length > 0) {
    const recentLogs = [...questionLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    lines.push('* Últimas baterias de questões registradas:');
    for (const q of recentLogs) {
      const dName = discMap.get(q.disciplineId)?.name ?? q.disciplineId;
      const pct = q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0;
      lines.push(
        `  - Data: ${q.date} (${formatDate(q.date)}) | Disciplina: ${dName} (${q.disciplineId}) | Acertos: ${q.correct}/${q.total} (${pct}%) | Fonte: "${q.source}"`,
      );
    }
  } else {
    lines.push('* Nenhuma bateria de questões registrada até o momento.');
  }

  if (mockExams.length > 0) {
    lines.push(`* Simulados realizados (${mockExams.length}):`);
    for (const m of mockExams) {
      let correctCount = 0;
      for (const [qNum, ans] of Object.entries(m.answerKey ?? {})) {
        if (m.responses?.[qNum] && m.responses[qNum] === ans) {
          correctCount++;
        }
      }
      const totalQ = m.questionCount || Object.keys(m.answerKey ?? {}).length;
      const pct = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
      const dateStr = m.date ? `${m.date} (${formatDate(m.date)})` : 'Sem data';
      lines.push(
        `  - Data: ${dateStr} | Título: "${m.title}" | Resultado: ${correctCount}/${totalQ} (${pct}%) | Status: ${m.submittedAt ? 'Finalizado' : 'Em aberto'}`,
      );
    }
  } else {
    lines.push('* Nenhum simulado registrado até o momento.');
  }

  return lines.join('\n');
}

export async function getAvailableGeminiModelsForAssistant(apiKey: string): Promise<string[]> {
  const cached = geminiModelsCache.get(apiKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal },
    ).finally(() => clearTimeout(timer));

    if (response.ok) {
      const data = (await response.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      if (Array.isArray(data.models) && data.models.length > 0) {
        const models = orderGeminiModels(
          data.models
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m) => (m.name ?? '').replace(/^models\//, '')),
        );

        if (models.length > 0) {
          geminiModelsCache.set(apiKey, models);
          return models;
        }
      }
    }
  } catch {
    // Fallback silencioso para a lista padrão de modelos Gemini
  }

  geminiModelsCache.set(apiKey, DEFAULT_GEMINI_MODELS);
  return DEFAULT_GEMINI_MODELS;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function callGeminiAssistant(params: {
  userMessage: string;
  apiKey: string;
  today: DateKey;
  history?: AssistantChatMessage[];
}): Promise<{ reply: string; actions: AssistantAction[] }> {
  const { userMessage, apiKey, today, history = [] } = params;
  const groundingContext = await buildAssistantGroundingContext(today);
  const disciplines = await db.disciplines.toArray();

  const systemInstruction = `Você é o Assistente IA oficial da plataforma "estudaê".
Sua missão é fornecer respostas CONCISAS, DIRETAS, CERTEIRAS e SEM ENROLAR nem alucinar, além de executar ações solicitadas.

DIRETRIZES DE ESTILO E CONCISÃO:
1. RESPOSTAS CURTAS E DIRETAS AO PONTO:
   - Responda em no máximo 2 a 4 tópicos objetivos ou 1 a 2 parágrafos curtos.
   - NUNCA faça introduções longas como "Com base nos dados reais do seu Caderno de Erros e no seu histórico...". Vá direto ao fato ou à resposta.
   - NUNCA use cabeçalhos markdown pesados como "### 1. Próximas Revisões...". Use listas simples com marcadores • ou negrito inline.
   - Não despeje relatórios gigantescos a menos que o usuário peça explicitamente "detalhe tudo" ou "liste todos os erros".

2. FIDELIDADE ABSOLUTA AOS DADOS (ZERO ALUCINAÇÃO):
   - Consulte o bloco de dados abaixo como fonte única da verdade.
   - NUNCA invente números, datas ou disciplinas que não constem no contexto.
   - Se não houver itens para determinada consulta, diga em uma linha: "Você não possui revisões/sessões pendentes no momento."

3. QUANDO USAR "actions" VS APENAS RESPONDER ("actions": []):
   - Se for uma pergunta, dúvida ou consulta: retorne "actions": [] e responda no campo "reply".
   - Só adicione itens em "actions" quando o usuário pedir expressamente para criar, reagendar, concluir, excluir, registrar questões ou iniciar timer.

4. FORMATO DE SAÍDA (JSON ESTRITO):
{
  "reply": "Texto conciso, bem pontuado, com quebras de linha e marcadores • quando útil.",
  "actions": [ ... ]
}

AÇÕES DISPONÍVEIS:
- RESCHEDULE_REVIEWS: { newDueDate: "YYYY-MM-DD", fromDueDate?: "YYYY-MM-DD", disciplineId?: string, onlyOverdue?: boolean, days?: number }
- SCHEDULE_REVIEW: { disciplineId: string, topicId?: string | null, title: string, baseDate?: "YYYY-MM-DD" }
- COMPLETE_REVIEW: { reviewId?: string, disciplineId?: string, all?: boolean }
- REOPEN_REVIEW: {}
- DELETE_REVIEW: { reviewId?: string, title?: string }
- SYNC_REVIEWS: {}
- ADD_ERROR_NOTE: { disciplineId: string, topicId?: string | null, sourceReference: string, explanation: string, errorType?: "falta-conteudo" | "desatencao" | "interpretacao" | "confusao-alternativas", errorDate?: "YYYY-MM-DD", nextReviewDate?: "YYYY-MM-DD" | null }
- UPDATE_ERROR_STATUS: { status: "revisar" | "revisado" | "dominado" }
- DELETE_ERROR_NOTE: {}
- ADD_SESSION: { disciplineId: string, topicId?: string | null, date?: "YYYY-MM-DD", plannedMinutes?: number, objective?: string, plannedStart?: "HH:mm" | null }
- COMPLETE_SESSION: { disciplineId?: string, date?: "YYYY-MM-DD", actualMinutes?: number }
- RESCHEDULE_SESSION: { disciplineId?: string, fromDate?: "YYYY-MM-DD", newDate: "YYYY-MM-DD" }
- DELETE_SESSION: { disciplineId?: string }
- START_TIMER: { disciplineId: string, topicId?: string | null, plannedMinutes?: number, objective?: string }
- PAUSE_TIMER: {}
- RESUME_TIMER: {}
- FINISH_TIMER: {}
- DISCARD_TIMER: {}
- LOG_QUESTIONS: { disciplineId: string, topicId?: string | null, total: number, correct: number, date?: "YYYY-MM-DD", source?: string }
- ADD_TOPIC: { disciplineId: string, title: string }
- UPDATE_TOPIC_STATUS: { topicId: string, status: "nao-iniciado" | "em-andamento" | "concluido" | "dominado" }
- OPEN_CYCLE: {} (abre o ciclo contínuo; não gera semanas ou datas fixas)
- UPDATE_SETTINGS: { dailyGoalMinutes?: number, reviewIntervals?: number[], examDate?: "YYYY-MM-DD", theme?: "light" | "dark" | "system" }
- NAVIGATE: { route: "/" | "/calendario" | "/cronograma" | "/estudar-agora" | "/questoes" | "/erros" | "/revisoes" | "/simulados" | "/disciplinas" | "/relatorios" | "/configuracoes" }

${groundingContext}`;

  const recentHistory = history
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const contents = [
    ...recentHistory,
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  const models = await getAvailableGeminiModelsForAssistant(apiKey);
  let lastError = 'Não foi possível obter resposta da API do Google Gemini.';

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!response.ok) {
        const errBody = (await response.text()).slice(0, 300);
        lastError = `Erro na API do Gemini (${response.status} em ${model}): ${errBody}`;
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            'Chave de API do Google Gemini inválida ou sem permissão. Verifique sua chave em Configurações.',
          );
        }
        if (response.status === 400 && /API_KEY_INVALID|API key not valid/i.test(errBody)) {
          throw new Error(
            'Chave de API do Google Gemini inválida. Verifique sua chave em Configurações.',
          );
        }
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();

      if (!rawText) {
        lastError = `O modelo ${model} retornou uma resposta vazia.`;
        continue;
      }

      try {
        const parsed = JSON.parse(extractJsonObject(rawText)) as {
          reply?: string;
          actions?: AssistantAction[];
        };
        const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        // Normaliza disciplineId caso o modelo tenha enviado o nome da disciplina em vez do ID
        for (const act of actions) {
          if (act.params && typeof act.params.disciplineId === 'string') {
            const rawDisc = act.params.disciplineId;
            const exact = disciplines.find((d) => d.id === rawDisc);
            if (!exact) {
              const matched = matchDiscipline(rawDisc, disciplines);
              if (matched) {
                act.params.disciplineId = matched.id;
              }
            }
          }
        }
        const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
        if (!reply && actions.length === 0) {
          lastError = `O modelo ${model} retornou um JSON sem resposta e sem ações.`;
          continue;
        }
        return { reply, actions };
      } catch {
        // Caso o modelo tenha retornado texto puro válido em vez de JSON
        return {
          reply: rawText,
          actions: [],
        };
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Chave de API do Google Gemini inválida') ||
          err.message.includes('sem permissão'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError);
}

/**
 * Processa a mensagem do usuário utilizando EXCLUSIVAMENTE a API do Google Gemini
 * com grounding completo nos dados reais do banco de dados da plataforma.
 */
export async function processAssistantMessage(
  userMessage: string,
  todayOrOptions: DateKey | ProcessAssistantOptions = todayKey(),
  historyArg?: AssistantChatMessage[],
): Promise<AssistantResponse> {
  const options: ProcessAssistantOptions =
    typeof todayOrOptions === 'string'
      ? { today: todayOrOptions, history: historyArg }
      : todayOrOptions;

  const today = options.today ?? todayKey();
  const settings = await getSettings();
  const apiKey = (options.apiKey ?? settings.geminiApiKey ?? '').trim();

  if (!apiKey) {
    throw new Error(
      'Chave da API do Google Gemini não configurada. Informe sua chave Gemini em Configurações para usar o Assistente IA.',
    );
  }

  const plan = await callGeminiAssistant({
    userMessage,
    apiKey,
    today,
    history: options.history,
  });

  const executedActions: string[] = [];
  let navigateTo: string | undefined;

  for (const action of plan.actions) {
    const res = await executeAssistantAction(action, today);
    executedActions.push(res.summary);
    if (res.navigateTo) {
      navigateTo = res.navigateTo;
    }
  }

  const reply =
    plan.reply && executedActions.length > 0
      ? `${plan.reply}\n\n${executedActions.join('\n')}`
      : plan.reply || executedActions.join('\n\n');

  return {
    reply,
    executedActions,
    navigateTo,
  };
}
