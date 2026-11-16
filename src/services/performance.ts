import { db } from '../db/db';
import type { ErrorFlashcard, ErrorNote, ErrorStatus, ErrorType, QuestionLog, ReviewTask } from '../db/types';
import { findDuplicateLog, type NormalizedQuestionValues } from '../domain/questions';
import { buildNextReviewTask, buildReviewTasks, nextPendingDate, postponedDueDate } from '../domain/reviews';
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
 * Constrói o título padronizado da revisão espaçada vinculada a um erro,
 * garantindo que o número da questão apareça sempre que estiver na referência
 * ou puder ser inferido do texto do diagnóstico/explicação.
 */
export function buildErrorNoteReviewTitle(
  note: Pick<ErrorNote, 'sourceReference' | 'explanation' | 'mockExamTitle'>,
): string {
  let ref = note.sourceReference.trim();
  const hasQuestionInRef = /quest[aã]o\s*#?\d+|\bq\.?\s*#?\d+/i.test(ref);

  if (!hasQuestionInRef && note.explanation) {
    const match = note.explanation.match(/(?:quest[aã]o|q\.?)\s*#?(\d+)/i);
    if (match?.[1]) {
      const qLabel = `questão ${match[1]}`;
      ref = ref ? `${ref} · ${qLabel}` : qLabel;
    }
  }

  const baseTitle = ref || note.explanation.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `Erro: ${baseTitle}`;
}

/**
 * Resolve o título de exibição de uma revisão: caso esteja vinculada a um
 * registro do Caderno de Erros com referência mais completa (ex: número da questão),
 * prioriza o título sincronizado com a anotação de erro.
 */
export function resolveReviewDisplayTitle(review: ReviewTask, linkedNote?: ErrorNote | null): string {
  if (!linkedNote) return review.title;
  if (review.title.startsWith('Caderno de erros:')) return review.title;
  return buildErrorNoteReviewTitle(linkedNote);
}

/**
 * Cria ou atualiza uma anotação de erro. Ao criar com `scheduleReviews`,
 * gera revisões espaçadas (intervalos das configurações) a partir da data do erro.
 * Ao editar uma anotação existente, sincroniza automaticamente o título,
 * a disciplina e o tópico nas revisões vinculadas.
 */
export async function saveErrorNote(input: ErrorNoteInput, options: { id?: string; scheduleReviews?: boolean } = {}): Promise<ErrorNote> {
  return saveErrorNoteRecord(input, options);
}

async function saveErrorNoteRecord(input: ErrorNoteInput, options: { id?: string; scheduleReviews?: boolean }): Promise<ErrorNote> {
  validateErrorNote(input);
  const settings = await getSettings();
  return db.transaction('rw', db.errorNotes, db.reviews, async () => {
    const now = nowIso();
    const base = { ...input, sourceReference: input.sourceReference.trim(), explanation: input.explanation.trim() };
    if (options.id) {
      const current = await db.errorNotes.get(options.id);
      if (!current) throw new ValidationError('Anotação não encontrada.');
      const updated: ErrorNote = { ...current, ...base, updatedAt: now };
      const syncedTitle = buildErrorNoteReviewTitle(updated);
      const linkedReviews = await db.reviews.where('errorNoteId').equals(options.id).toArray();
      const pending = linkedReviews
        .filter((r) => r.status === 'pendente')
        .sort((a, b) => a.intervalDays - b.intervalDays || a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt));
      const completed = linkedReviews.filter((r) => r.status === 'concluida');

      // Remove revisões futuras duplicadas mantendo apenas a atual do intervalo
      if (pending.length > 1) {
        await db.reviews.bulkDelete(pending.slice(1).map((r) => r.id));
      }
      const activePending = pending[0];

      // Atualiza metadados nas revisões concluídas
      for (const rev of completed) {
        const nextTitle = rev.title.startsWith('Caderno de erros:') ? rev.title : syncedTitle;
        if (rev.disciplineId !== updated.disciplineId || rev.topicId !== updated.topicId || rev.title !== nextTitle) {
          await db.reviews.put({
            ...rev,
            disciplineId: updated.disciplineId,
            topicId: updated.topicId,
            title: nextTitle,
          });
        }
      }

      if (updated.status === 'dominado') {
        if (activePending) {
          await db.reviews.delete(activePending.id);
        }
        updated.nextReviewDate = null;
      } else if (updated.nextReviewDate) {
        if (activePending) {
          const nextTitle = activePending.title.startsWith('Caderno de erros:') ? activePending.title : syncedTitle;
          await db.reviews.put({
            ...activePending,
            disciplineId: updated.disciplineId,
            topicId: updated.topicId,
            title: nextTitle,
            dueDate: updated.nextReviewDate,
          });
        } else {
          const tasks = buildReviewTasks(
            { disciplineId: updated.disciplineId, topicId: updated.topicId, errorNoteId: updated.id, title: syncedTitle },
            updated.errorDate,
            settings.reviewIntervals,
          );
          if (tasks[0]) {
            tasks[0].dueDate = updated.nextReviewDate;
            await db.reviews.add(tasks[0]);
          }
        }
      } else if (activePending) {
        if (current.nextReviewDate !== null && input.nextReviewDate === null) {
          await db.reviews.delete(activePending.id);
          updated.nextReviewDate = null;
        } else {
          const nextTitle = activePending.title.startsWith('Caderno de erros:') ? activePending.title : syncedTitle;
          await db.reviews.put({
            ...activePending,
            disciplineId: updated.disciplineId,
            topicId: updated.topicId,
            title: nextTitle,
          });
          updated.nextReviewDate = activePending.dueDate;
        }
      }

      await db.errorNotes.put(updated);
      return updated;
    }
    const note: ErrorNote = { id: createId(), ...base, createdAt: now, updatedAt: now };
    if (options.scheduleReviews && note.status !== 'dominado') {
      const reviewTitle = buildErrorNoteReviewTitle(note);
      const tasks = buildReviewTasks({ disciplineId: note.disciplineId, topicId: note.topicId, errorNoteId: note.id, title: reviewTitle }, note.errorDate, settings.reviewIntervals);
      if (tasks[0] && note.nextReviewDate) {
        tasks[0].dueDate = note.nextReviewDate;
      }
      await db.reviews.bulkAdd(tasks);
      note.nextReviewDate = nextPendingDate(tasks);
    }
    await db.errorNotes.add(note);
    return note;
  });
}

export async function setErrorStatus(id: string, status: ErrorStatus): Promise<void> {
  await db.transaction('rw', db.errorNotes, db.reviews, async () => {
    const current = await db.errorNotes.get(id);
    if (!current) return;
    if (status === 'dominado') {
      await db.reviews.where('errorNoteId').equals(id).filter((r) => r.status === 'pendente').delete();
      await db.errorNotes.update(id, { status, nextReviewDate: null, updatedAt: nowIso() });
    } else {
      await db.errorNotes.update(id, { status, updatedAt: nowIso() });
    }
  });
  // Marcar como revisado conclui a revisão ativa, mantendo Revisões e Caderno sincronizados.
  if (status === 'revisado') await completePendingReviewsOfNote(id);
}

async function completePendingReviewsOfNote(noteId: string): Promise<void> {
  const pending = (await db.reviews.where('errorNoteId').equals(noteId).toArray())
    .filter((r) => r.status === 'pendente')
    .sort((a, b) => a.intervalDays - b.intervalDays || a.dueDate.localeCompare(b.dueDate));
  if (pending[0]) await completeReview(pending[0].id);
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

export async function completeReview(id: string, flashcardStats?: { hits: number; misses: number }): Promise<void> {
  await db.transaction('rw', db.reviews, db.errorNotes, db.settings, async () => {
    const review = await db.reviews.get(id);
    if (!review) throw new ValidationError('Revisão não encontrada.');
    if (review.status === 'concluida') return;
    await db.reviews.put({ ...review, status: 'concluida', completedAt: nowIso(), ...(flashcardStats ? { flashcardStats } : {}) });

    const settings = await getSettings();
    const nextTask = buildNextReviewTask(review, settings.reviewIntervals, todayKey());
    if (nextTask) {
      const existing = await db.reviews
        .where('disciplineId')
        .equals(review.disciplineId)
        .filter(
          (r) =>
            r.errorNoteId === review.errorNoteId &&
            r.title === review.title &&
            r.intervalDays === nextTask.intervalDays,
        )
        .first();
      if (!existing) {
        await db.reviews.add(nextTask);
      }
    }

    await syncErrorNoteReviewDate(review.errorNoteId, true);
  });
}

export async function reopenReview(id: string): Promise<void> {
  await db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const review = await db.reviews.get(id);
    if (!review) throw new ValidationError('Revisão não encontrada.');
    await db.reviews.put({ ...review, status: 'pendente', completedAt: null, flashcardStats: null });
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

export interface ReconcileReviewsResult {
  deletedReviews: number;
  updatedReviews: number;
  updatedNotes: number;
}

/**
 * Remove revisões futuras duplicadas (mantendo apenas a revisão atual do intervalo em cada cadeia)
 * e sincroniza rigorosamente datas, títulos, disciplinas e tópicos entre `reviews` e `errorNotes`.
 */
export async function reconcileReviewsAndErrorNotes(): Promise<ReconcileReviewsResult> {
  // Erros já marcados como revisados com revisão vencida (dados antigos): conclui a revisão para sincronizar.
  const today = todayKey();
  const [notesNow, reviewsNow] = await Promise.all([db.errorNotes.toArray(), db.reviews.toArray()]);
  for (const n of notesNow) {
    if (n.status !== 'revisado') continue;
    if (reviewsNow.some((r) => r.errorNoteId === n.id && r.status === 'pendente' && r.dueDate <= today)) {
      await completePendingReviewsOfNote(n.id);
    }
  }
  return db.transaction('rw', db.reviews, db.errorNotes, db.settings, async () => {
    const [allReviews, allNotes, settings] = await Promise.all([
      db.reviews.toArray(),
      db.errorNotes.toArray(),
      getSettings(),
    ]);

    const idsToDelete = new Set<string>();
    const reviewsToPut = new Map<string, ReviewTask>();
    const notesToPut = new Map<string, ErrorNote>();

    // 1. Agrupa revisões pendentes por cadeia (errorNoteId ou disciplina+tópico+título)
    // e remove revisões futuras do intervalo que foram criadas antes da liberação progressiva.
    const pendingGroups = new Map<string, ReviewTask[]>();
    for (const r of allReviews) {
      if (r.status !== 'pendente') continue;
      const key = r.errorNoteId
        ? `err:${r.errorNoteId}`
        : `topic:${r.disciplineId}:${r.topicId ?? ''}:${r.title.trim().toLowerCase()}`;
      const list = pendingGroups.get(key) ?? [];
      list.push(r);
      pendingGroups.set(key, list);
    }

    const activePendingByErrorNote = new Map<string, ReviewTask>();
    for (const group of pendingGroups.values()) {
      group.sort(
        (a, b) =>
          a.intervalDays - b.intervalDays ||
          a.dueDate.localeCompare(b.dueDate) ||
          a.createdAt.localeCompare(b.createdAt),
      );
      const keeper = group[0];
      if (keeper.errorNoteId) {
        activePendingByErrorNote.set(keeper.errorNoteId, keeper);
      }
      for (let i = 1; i < group.length; i++) {
        idsToDelete.add(group[i].id);
      }
    }

    // 2. Sincroniza rigorosamente cada anotação do Caderno de Erros com sua revisão ativa
    for (const note of allNotes) {
      const activePending = activePendingByErrorNote.get(note.id);
      if (note.status === 'dominado') {
        if (activePending) {
          idsToDelete.add(activePending.id);
        }
        if (note.nextReviewDate !== null) {
          notesToPut.set(note.id, { ...note, nextReviewDate: null });
        }
        continue;
      }

      if (activePending) {
        const expectedTitle = resolveReviewDisplayTitle(activePending, note);
        const expectedDueDate = note.nextReviewDate ?? activePending.dueDate;
        if (
          activePending.dueDate !== expectedDueDate ||
          activePending.disciplineId !== note.disciplineId ||
          activePending.topicId !== note.topicId ||
          activePending.title !== expectedTitle
        ) {
          reviewsToPut.set(activePending.id, {
            ...activePending,
            dueDate: expectedDueDate,
            disciplineId: note.disciplineId,
            topicId: note.topicId,
            title: expectedTitle,
          });
        }
        if (note.nextReviewDate !== expectedDueDate) {
          notesToPut.set(note.id, {
            ...note,
            nextReviewDate: expectedDueDate,
          });
        }
      } else if (note.nextReviewDate) {
        const reviewTitle = buildErrorNoteReviewTitle(note);
        const tasks = buildReviewTasks(
          {
            disciplineId: note.disciplineId,
            topicId: note.topicId,
            errorNoteId: note.id,
            title: reviewTitle,
          },
          note.errorDate,
          settings.reviewIntervals,
        );
        if (tasks[0]) {
          tasks[0].dueDate = note.nextReviewDate;
          reviewsToPut.set(tasks[0].id, tasks[0]);
        }
      }
    }

    if (idsToDelete.size > 0) {
      await db.reviews.bulkDelete([...idsToDelete]);
    }
    if (reviewsToPut.size > 0) {
      await db.reviews.bulkPut([...reviewsToPut.values()]);
    }
    if (notesToPut.size > 0) {
      await db.errorNotes.bulkPut([...notesToPut.values()]);
    }

    return {
      deletedReviews: idsToDelete.size,
      updatedReviews: reviewsToPut.size,
      updatedNotes: notesToPut.size,
    };
  });
}

/**
 * Reagenda em lote revisões pendentes (e seus respectivos cadernos de erros)
 * filtrando opcionalmente por data de origem, disciplina ou status de atraso.
 */
export async function bulkRescheduleReviews(params: {
  newDueDate: DateKey;
  fromDueDate?: DateKey;
  disciplineId?: string;
  onlyOverdue?: boolean;
  today?: DateKey;
}): Promise<number> {
  if (!isValidDateKey(params.newDueDate)) {
    throw new ValidationError('Informe uma nova data válida para as revisões.');
  }
  const refToday = params.today ?? todayKey();
  return db.transaction('rw', db.reviews, db.errorNotes, async () => {
    const allReviews = await db.reviews.toArray();
    const matching = allReviews.filter((r) => {
      if (r.status !== 'pendente') return false;
      if (params.fromDueDate && r.dueDate !== params.fromDueDate) return false;
      if (params.disciplineId && r.disciplineId !== params.disciplineId) return false;
      if (params.onlyOverdue && r.dueDate >= refToday) return false;
      return true;
    });

    const affectedErrorNoteIds = new Set<string>();
    const updatedReviews: ReviewTask[] = [];
    for (const r of matching) {
      if (r.dueDate !== params.newDueDate) {
        updatedReviews.push({ ...r, dueDate: params.newDueDate });
      }
      if (r.errorNoteId) {
        affectedErrorNoteIds.add(r.errorNoteId);
      }
    }

    if (updatedReviews.length > 0) {
      await db.reviews.bulkPut(updatedReviews);
    }

    // Também atualiza diretamente cadernos de erros cuja nextReviewDate batia com o filtro
    const allNotes = await db.errorNotes.toArray();
    for (const note of allNotes) {
      if (note.status === 'dominado') continue;
      const matchesNoteFilter =
        (params.fromDueDate && note.nextReviewDate === params.fromDueDate) ||
        (params.onlyOverdue && note.nextReviewDate && note.nextReviewDate < refToday) ||
        affectedErrorNoteIds.has(note.id);
      if (matchesNoteFilter && (!params.disciplineId || note.disciplineId === params.disciplineId)) {
        await db.errorNotes.put({
          ...note,
          nextReviewDate: params.newDueDate,
          updatedAt: nowIso(),
        });
      }
    }

    return Math.max(updatedReviews.length, affectedErrorNoteIds.size);
  });
}

export interface FlashcardInput {
  statement: string;
  answer: 'certo' | 'errado';
  explanation: string;
}

function validateFlashcardInput(input: FlashcardInput): { statement: string; answer: 'certo' | 'errado'; explanation: string } {
  const statement = input.statement.trim();
  if (!statement) throw new ValidationError('Escreva o enunciado do flashcard.');
  if (input.answer !== 'certo' && input.answer !== 'errado') {
    throw new ValidationError('Selecione se o gabarito é Certo ou Errado.');
  }
  const explanation = input.explanation.trim();
  if (!explanation) throw new ValidationError('Escreva a explicação do flashcard.');
  return { statement, answer: input.answer, explanation };
}

/** Adiciona um flashcard manual ao erro (é possível criar vários por erro). */
export async function addFlashcard(noteId: string, input: FlashcardInput): Promise<ErrorFlashcard> {
  const valid = validateFlashcardInput(input);
  const note = await db.errorNotes.get(noteId);
  if (!note) throw new ValidationError('Erro não encontrado no caderno.');
  const card: ErrorFlashcard = {
    id: createId(),
    ...valid,
    createdAt: nowIso(),
  };
  await db.errorNotes.put({
    ...note,
    flashcards: [...(note.flashcards ?? []), card],
    updatedAt: nowIso(),
  });
  return card;
}

/** Atualiza um flashcard existente vinculado a um erro. */
export async function updateFlashcard(noteId: string, cardId: string, input: FlashcardInput): Promise<ErrorFlashcard> {
  const valid = validateFlashcardInput(input);
  const note = await db.errorNotes.get(noteId);
  if (!note) throw new ValidationError('Erro não encontrado no caderno.');
  const cards = note.flashcards ?? [];
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new ValidationError('Flashcard não encontrado.');
  const updatedCard: ErrorFlashcard = { ...cards[idx], ...valid };
  const nextCards = [...cards];
  nextCards[idx] = updatedCard;
  await db.errorNotes.put({ ...note, flashcards: nextCards, updatedAt: nowIso() });
  return updatedCard;
}

/** Remove um flashcard vinculado a um erro. */
export async function deleteFlashcard(noteId: string, cardId: string): Promise<void> {
  const note = await db.errorNotes.get(noteId);
  if (!note) return;
  const nextCards = (note.flashcards ?? []).filter((c) => c.id !== cardId);
  await db.errorNotes.put({ ...note, flashcards: nextCards, updatedAt: nowIso() });
}
