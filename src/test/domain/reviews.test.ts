import { describe, expect, it } from 'vitest';
import { buildNextReviewTask, nextIntervalAfter } from '../../domain/reviews';
import type { ReviewTask } from '../../db/types';

function makeReview(intervalDays: number): ReviewTask {
  return {
    id: `rev-${intervalDays}`,
    disciplineId: 'disc-1',
    topicId: null,
    errorNoteId: 'err-1',
    title: 'Erro de teste',
    dueDate: '2026-11-16',
    intervalDays,
    status: 'concluida',
    completedAt: '2026-11-16T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
  };
}

describe('reviews domain', () => {
  it('advances through intervals and repeats the final interval (30 days) indefinitely', () => {
    const intervals = [1, 7, 30];

    expect(nextIntervalAfter(1, intervals)).toBe(7);
    expect(nextIntervalAfter(7, intervals)).toBe(30);
    expect(nextIntervalAfter(30, intervals)).toBe(30);
    expect(nextIntervalAfter(1, [])).toBeNull();

    const after1 = buildNextReviewTask(makeReview(1), intervals, '2026-11-16');
    expect(after1?.intervalDays).toBe(7);
    expect(after1?.dueDate).toBe('2026-11-22');

    const after7 = buildNextReviewTask(makeReview(7), intervals, '2026-11-16');
    expect(after7?.intervalDays).toBe(30);
    expect(after7?.dueDate).toBe('2026-12-09');

    const after30 = buildNextReviewTask(makeReview(30), intervals, '2026-11-16');
    expect(after30?.intervalDays).toBe(30);
    expect(after30?.dueDate).toBe('2026-12-16');
    expect(after30?.status).toBe('pendente');
  });
});
