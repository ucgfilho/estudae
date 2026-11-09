import { db } from '../db/db';
import type { ErrorNote, ErrorStatus, ErrorType, QuestionLog } from '../db/types';
import { findDuplicateLog, type NormalizedQuestionValues } from '../domain/questions';
import { buildReviewTasks, nextPendingDate, postponedDueDate } from '../domain/reviews';
import { isValidDateKey, todayKey, type DateKey } from '../lib/dates';
import { createId, nowIso } from '../lib/utils';
import { getSettings } from './settings';
import { ValidationError } from './sessions';

/* ------------------------------ Questões ------------------------------ */

export class DuplicateLogError extends Error {
  constructor(public readonly duplicate: QuestionLog) {
    super('Já existe um lançamento idêntico para esta data, disciplina, tópico e fonte.');
    this.name = 'DuplicateLogError';
  }
}

export interface SaveQuestionOptions {
  id?: string;
  sessionId?: string | null;
  /** Confirmação explícita do usuário para salvar mesmo havendo lançamento idêntico. */
  allowDuplicate?: boolean;
}

export async function saveQuestionLog(value: NormalizedQuestionValues, options: SaveQuestionOptions = {}): Promise<QuestionLog> {
  return db.transaction('rw', db.questionLogs, db.sessions, async () => {
    if (!options.allowDuplicate) {
      const sameDay = await db.questionLogs.where('date').equals(value.date).toArray();
      const duplicate = findDuplicateLog(value, sameDay, options.id);
      if (duplicate) throw new DuplicateLogError(duplicate);
    }
    const now = nowIso();
    let log: QuestionLog;

    if (options.id) {
      const current = await db.questionLogs.get(options.id);
      if (!current) throw new ValidationError('Lançamento não encontrado.');
      const updated: QuestionLog = { ...current, ...value, updatedAt: now };
      await db.questionLogs.put(updated);
      log = updated;
    } else {
      log = { id: createId(), ...value, sessionId: options.sessionId ?? null, createdAt: now, updatedAt: now };
      await db.questionLogs.add(log);
    }

    // Se houver tempo gasto especificado nas questões, incorpora ao tempo geral de estudo
    if (value.durationMinutes && value.durationMinutes > 0) {
      const durationSeconds = value.durationMinutes * 60;

      // 1. Se o lançamento estiver associado a uma sessão existente
      if (log.sessionId) {
        const session = await db.sessions.get(log.sessionId);
        if (session) {
          // Se a sessão foi criada pelo próprio lançamento de questões, atualiza o tempo
          if (session.history?.some((h) => h.description.includes('lançamento de questões'))) {
            await db.sessions.update(session.id, {
              actualSeconds: durationSeconds,
              plannedMinutes: value.durationMinutes,
              updatedAt: now,
            });
          } else if (session.actualSeconds === 0) {
            // Se a sessão ainda não tinha tempo registrado, preenche com o tempo das questões
            await db.sessions.update(session.id, {
              actualSeconds: durationSeconds,
              status: 'concluida',
              updatedAt: now,
            });
          }
        }
      } else {
        // 2. Se não havia sessão associada, cria uma sessão avulsa concluída para contabilizar nas horas gerais
        const sessionCount = await db.sessions.where('date').equals(value.date).count();
        const newSessionId = createId();
        await db.sessions.add({
          id: newSessionId,
          date: value.date,
          disciplineId: value.disciplineId,
          topicId: value.topicId,
          plannedStart: null,
          plannedMinutes: value.durationMinutes,
          actualSeconds: durationSeconds,
          status: 'concluida',
          objective: `Resolução de Questões (${value.total} itens: ${value.correct} acertos)`,
          notes: value.source ? `Banca/Fonte: ${value.source}` : '',
          origin: 'avulsa',
          startedAt: `${value.date}T12:00:00Z`,
          endedAt: `${value.date}T12:${String(Math.min(59, value.durationMinutes)).padStart(2, '0')}:00Z`,
          recoveredFromId: null,
          order: sessionCount,
          isManual: true,
          history: [
            {
              at: now,
              type: 'executada',
              description: `Tempo registrado automaticamente pelo lançamento de questões (${value.durationMinutes} min).`,
            },
          ],
          createdAt: now,
          updatedAt: now,
        });

        // Vincula a nova sessão ao lançamento
        log.sessionId = newSessionId;
        await db.questionLogs.update(log.id, { sessionId: newSessionId, updatedAt: now });
      }
    }

    return log;
  });
}

export async function deleteQuestionLog(id: string): Promise<void> {
  await db.transaction('rw', db.questionLogs, db.errorNotes, async () => {
    await db.errorNotes.where('id').anyOf(await db.errorNotes.filter((n) => n.questionLogId === id).primaryKeys()).modify({ questionLogId: null });
    await db.questionLogs.delete(id);
  });
}

/* --------------------------- Caderno de erros -------------------------- */

export interface ErrorNoteInput {
  disciplineId: string;
  topicId: string | null;
  questionLogId: string | null;
  sourceReference: string;
  errorType: ErrorType;
  explanation: string;
  errorDate: DateKey;
  status: ErrorStatus;
  nextReviewDate: DateKey | null;
  mockExamId?: string | null;
  mockExamTitle?: string | null;
}

function validateErrorNote(input: ErrorNoteInput): void {
  if (!input.disciplineId) throw new ValidationError('Selecione a disciplina.');
  if (!isValidDateKey(input.errorDate)) throw new ValidationError('Informe uma data de erro válida.');
  if (input.nextReviewDate !== null && !isValidDateKey(input.nextReviewDate)) throw new ValidationError('Informe uma data de revisão válida.');
  if (!input.sourceReference.trim() && !input.explanation.trim()) {
    throw new ValidationError('Informe a referência da questão ou a explicação do aprendizado.');
  }
}

/**
 * Cria ou atualiza uma anotação de erro. Ao criar com `scheduleReviews`,
 * gera revisões espaçadas (intervalos das configurações) a partir da data do erro.
 */
export async function saveErrorNote(input: ErrorNoteInput, options: { id?: string; scheduleReviews?: boolean } = {}): Promise<ErrorNote> {
  validateErrorNote(input);
  const settings = await getSettings();
  return db.transaction('rw', db.errorNotes, db.reviews, async () => {
    const now = nowIso();
    const base = { ...input, sourceReference: input.sourceReference.trim(), explanation: input.explanation.trim() };
    if (options.id) {
      const current = await db.errorNotes.get(options.id);
      if (!current) throw new ValidationError('Anotação não encontrada.');
      const updated: ErrorNote = { ...current, ...base, updatedAt: now };
      await db.errorNotes.put(updated);
      return updated;
    }
    const note: ErrorNote = { id: createId(), ...base, createdAt: now, updatedAt: now };
    if (options.scheduleReviews) {
      const title = note.sourceReference || note.explanation.slice(0, 80);
      const tasks = buildReviewTasks({ disciplineId: note.disciplineId, topicId: note.topicId, errorNoteId: note.id, title: `Erro: ${title}` }, note.errorDate, settings.reviewIntervals);
      await db.reviews.bulkAdd(tasks);
      note.nextReviewDate = nextPendingDate(tasks);
    }
    await db.errorNotes.add(note);
    return note;
  });
}

export async function setErrorStatus(id: string, status: ErrorStatus): Promise<void> {
  await db.errorNotes.update(id, { status, updatedAt: nowIso() });
}

/** Exclui a anotação e suas revisões pendentes (revisões concluídas permanecem no histórico). */
export async function deleteErrorNote(id: string): Promise<void> {
  await db.transaction('rw', db.errorNotes, db.reviews, async () => {
    await db.reviews.where('errorNoteId').equals(id).filter((r) => r.status === 'pendente').delete();
    await db.reviews.where('errorNoteId').equals(id).modify({ errorNoteId: null });
    await db.errorNotes.delete(id);
  });
}

/* ------------------------------ Revisões ------------------------------- */

export async function scheduleTopicReviews(disciplineId: string, topicId: string | null, title: string, baseDate: DateKey = todayKey()): Promise<number> {
  const settings = await getSettings();
  const tasks = buildReviewTasks({ disciplineId, topicId, errorNoteId: null, title }, baseDate, settings.reviewIntervals);
  await db.reviews.bulkAdd(tasks);
  return tasks.length;
}

async function syncErrorNoteReviewDate(errorNoteId: string | null, markReviewed: boolean): Promise<void> {
  if (!errorNoteId) return;
  const note = await db.errorNotes.get(errorNoteId);
  if (!note) return;
  const reviews = await db.reviews.where('errorNoteId').equals(errorNoteId).toArray();
  await db.errorNotes.put({
    ...note,
    nextReviewDate: nextPendingDate(reviews),
    status: markReviewed && note.status === 'revisar' ? 'revisado' : note.status,
    updatedAt: nowIso(),
  });
}

export async function completeReview(id: string): Promise<void> {
  await db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const review = await db.reviews.get(id);
    if (!review) throw new ValidationError('Revisão não encontrada.');
    if (review.status === 'concluida') return;
    await db.reviews.put({ ...review, status: 'concluida', completedAt: nowIso() });
    await syncErrorNoteReviewDate(review.errorNoteId, true);
  });
}

export async function reopenReview(id: string): Promise<void> {
  await db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const review = await db.reviews.get(id);
    if (!review) throw new ValidationError('Revisão não encontrada.');
    await db.reviews.put({ ...review, status: 'pendente', completedAt: null });
    await syncErrorNoteReviewDate(review.errorNoteId, false);
  });
}

export async function postponeReview(id: string, days: number, today: DateKey = todayKey()): Promise<void> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ValidationError('Informe um adiamento entre 1 e 365 dias.');
  await db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const review = await db.reviews.get(id);
    if (!review) throw new ValidationError('Revisão não encontrada.');
    await db.reviews.put({ ...review, dueDate: postponedDueDate(review.dueDate, days, today) });
    await syncErrorNoteReviewDate(review.errorNoteId, false);
  });
}

export async function postponeReviewToDate(id: string, newDueDate: DateKey): Promise<void> {
  if (!isValidDateKey(newDueDate)) throw new ValidationError('Informe uma data válida.');
  await db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const review = await db.reviews.get(id);
    if (!review) throw new ValidationError('Revisão não encontrada.');
    await db.reviews.put({ ...review, dueDate: newDueDate });
    await syncErrorNoteReviewDate(review.errorNoteId, false);
  });
}

export async function deleteReview(id: string): Promise<void> {
  await db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const review = await db.reviews.get(id);
    if (!review) return;
    await db.reviews.delete(id);
    await syncErrorNoteReviewDate(review.errorNoteId, false);
  });
}
