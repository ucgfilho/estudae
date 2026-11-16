/** Revisões espaçadas. Os intervalos são valores iniciais editáveis. */
import { addDays, type DateKey } from '../lib/dates';
import { createId, nowIso } from '../lib/utils';
import type { ReviewTask } from '../db/types';

export interface ReviewTarget {
  disciplineId: string;
  topicId: string | null;
  errorNoteId: string | null;
  title: string;
}

export function normalizeIntervals(intervals: readonly number[]): number[] {
  return [...new Set(intervals)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
}

/** Cria apenas a primeira revisão do ciclo; as seguintes são liberadas ao concluir a anterior. */
export function buildReviewTasks(target: ReviewTarget, baseDate: DateKey, intervals: readonly number[]): ReviewTask[] {
  const unique = normalizeIntervals(intervals);
  const first = unique[0];
  if (first === undefined) return [];
  return [{
    id: createId(),
    disciplineId: target.disciplineId,
    topicId: target.topicId,
    errorNoteId: target.errorNoteId,
    title: target.title,
    dueDate: addDays(baseDate, first),
    intervalDays: first,
    status: 'pendente',
    completedAt: null,
    createdAt: nowIso(),
  }];
}

/** Retorna o próximo intervalo após `currentIntervalDays`, ou o último intervalo configurado se já tiver chegado ao fim. */
export function nextIntervalAfter(currentIntervalDays: number, intervals: readonly number[]): number | null {
  const unique = normalizeIntervals(intervals);
  if (unique.length === 0) return null;
  return unique.find((n) => n > currentIntervalDays) ?? unique[unique.length - 1];
}

/** Cria a próxima revisão do intervalo após a conclusão da revisão atual. */
export function buildNextReviewTask(
  completedReview: ReviewTask,
  intervals: readonly number[],
  completedDate: DateKey,
): ReviewTask | null {
  const nextDays = nextIntervalAfter(completedReview.intervalDays, intervals);
  if (nextDays === null) return null;
  const deltaDays =
    nextDays > completedReview.intervalDays
      ? nextDays - completedReview.intervalDays
      : nextDays;
  return {
    id: createId(),
    disciplineId: completedReview.disciplineId,
    topicId: completedReview.topicId,
    errorNoteId: completedReview.errorNoteId,
    title: completedReview.title,
    dueDate: addDays(completedDate, deltaDays),
    intervalDays: nextDays,
    status: 'pendente',
    completedAt: null,
    createdAt: nowIso(),
  };
}

export type IntervalParseResult = { ok: true; value: number[] } | { ok: false; error: string };

/** Interpreta "1, 7, 30" como lista de intervalos em dias. */
export function parseIntervals(text: string): IntervalParseResult {
  const parts = text
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Informe ao menos um intervalo em dias.' };
  const values: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { ok: false, error: `"${p}" não é um número inteiro de dias.` };
    const n = Number(p);
    if (n < 1 || n > 365) return { ok: false, error: 'Cada intervalo deve estar entre 1 e 365 dias.' };
    values.push(n);
  }
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length > 10) return { ok: false, error: 'Use no máximo 10 intervalos.' };
  return { ok: true, value: unique };
}

/** Nova data ao adiar: parte de hoje se a revisão já estiver vencida. */
export function postponedDueDate(dueDate: DateKey, days: number, today: DateKey): DateKey {
  const base = dueDate < today ? today : dueDate;
  return addDays(base, days);
}

/** Próxima revisão pendente de um conjunto (para atualizar o caderno de erros). */
export function nextPendingDate(reviews: readonly ReviewTask[]): DateKey | null {
  const pending = reviews.filter((r) => r.status === 'pendente').map((r) => r.dueDate).sort();
  return pending[0] ?? null;
}
