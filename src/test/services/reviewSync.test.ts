import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, ensureSeed } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../db/seed';
import { DATA_TABLES, type DataTableName, type ReviewTask } from '../../db/types';
import {
  getWorkspaceCacheKey, hasUnsyncedChanges, retryPendingMutations,
  setActiveContestScopeId, setAuthSession, syncBatchMutationsToApi, waitForPendingSync,
  type RemoteTableMutation,
} from '../../services/auth';
import { completeReview } from '../../services/performance';

const email = 'review-sync@example.local';
const review: ReviewTask = {
  id: 'review-1', disciplineId: 'portugues', topicId: null, errorNoteId: null,
  title: 'Revisão', dueDate: '2026-01-01', intervalDays: 1,
  status: 'pendente', completedAt: null, createdAt: '2026-01-01T10:00:00Z',
};
const originalFetch = globalThis.fetch;
let server: Record<DataTableName, unknown[]>;
let offline = false;
let requests: { url: string; init?: RequestInit }[];

function apply(operations: RemoteTableMutation[]) {
  for (const op of operations) {
    if (op.action === 'clear') server[op.table] = [];
    else if (op.action === 'delete') server[op.table] = (server[op.table] as { id: string }[]).filter((r) => !op.ids.includes(r.id));
    else {
      const rows = new Map((server[op.table] as { id: string }[]).map((r) => [r.id, r]));
      for (const row of op.records as { id: string }[]) rows.set(row.id, row);
      server[op.table] = [...rows.values()];
    }
  }
}

beforeEach(async () => {
  await waitForPendingSync();
  setAuthSession(null);
  localStorage.clear();
  setActiveContestScopeId('default');
  db.clearMemory();
  server = Object.fromEntries(DATA_TABLES.map((table) => [table, []])) as unknown as Record<DataTableName, unknown[]>;
  server.disciplines = db.disciplines.toArraySync();
  server.settings = [{ ...DEFAULT_SETTINGS, contestId: 'custom', reviewIntervals: [1, 7, 30] }];
  server.reviews = [structuredClone(review)];
  offline = false;
  requests = [];
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (offline) throw new TypeError('Offline');
    if (url.endsWith('/batch')) apply(JSON.parse(String(init?.body)).operations);
    return new Response(JSON.stringify({ data: server }), { status: 200 });
  }) as typeof fetch;
  setAuthSession({ token: 'sync-test-real-token', tokenType: 'Bearer', expiresIn: 600,
    user: { id: 'sync-user', name: 'Teste', email, createdAt: '2026-01-01T00:00:00Z' } });
  await ensureSeed();
});

afterEach(async () => {
  offline = false;
  await retryPendingMutations();
  await waitForPendingSync();
  setAuthSession(null);
  localStorage.clear();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('sincronização de revisões entre dispositivos', () => {
  it('carrega a conclusão do servidor mesmo com cache local pendente e a mesma quantidade de registros', async () => {
    const cached = localStorage.getItem(getWorkspaceCacheKey(email));
    const completed = { ...review, status: 'concluida', completedAt: '2026-11-17T10:00:00Z' };
    server.reviews = [completed];
    db.clearMemory();
    localStorage.setItem(getWorkspaceCacheKey(email), cached!);
    await ensureSeed();
    expect(await db.reviews.get(review.id)).toEqual(completed);
    expect(server.reviews).toEqual([completed]);
    expect(requests.some(({ init }) => init?.method === 'PUT')).toBe(false);
  });

  it('reenvia conclusão e próximo ciclo após falha de rede e recarga, permitindo login sem cache', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    offline = true;
    await expect(completeReview(review.id, { hits: 2, misses: 1 })).rejects.toThrow('Não foi possível confirmar no servidor');
    await waitForPendingSync();
    expect(hasUnsyncedChanges()).toBe(true);
    expect((server.reviews[0] as ReviewTask).status).toBe('pendente');
    expect(localStorage.getItem(`${getWorkspaceCacheKey(email)}:pending-batches`)).toContain('concluida');
    // Reload/reconnect: only the durable outbox can recover the failed request.
    db.clearMemory();
    offline = false;
    await ensureSeed();
    expect(hasUnsyncedChanges()).toBe(false);
    expect((server.reviews as ReviewTask[]).find((r) => r.id === review.id)?.status).toBe('concluida');
    expect((server.reviews as ReviewTask[]).filter((r) => r.status === 'pendente')).toHaveLength(1);
    localStorage.removeItem(getWorkspaceCacheKey(email));
    db.clearMemory();
    await ensureSeed();
    expect((await db.reviews.get(review.id))?.flashcardStats).toEqual({ hits: 2, misses: 1 });
    expect(db.reviews.toArraySync().filter((r) => r.status === 'pendente')).toHaveLength(1);
  });

  it('não apaga registros de outro dispositivo por diferença na quantidade de registros', async () => {
    server.reviews.push({ ...review, id: 'other-device' });
    await completeReview(review.id);
    await waitForPendingSync();
    expect((server.reviews as ReviewTask[]).some((r) => r.id === 'other-device')).toBe(true);
    expect(requests.some(({ init }) => init?.method === 'PUT')).toBe(false);
  });

  it('preserva uma conclusão feita durante uma leitura remota em andamento', async () => {
    const fetchServer = globalThis.fetch;
    let release!: () => void;
    let started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let delayed = false;
    globalThis.fetch = vi.fn(async (input, init) => {
      if (!delayed && String(input).endsWith('/api/study-data') && init?.method === 'GET') {
        delayed = true;
        const stale = JSON.stringify({ data: server });
        started();
        await waiting;
        return new Response(stale, { status: 200 });
      }
      return fetchServer(input, init);
    }) as typeof fetch;
    const loading = ensureSeed();
    await reading;
    await completeReview(review.id);
    release();
    await loading;
    expect((await db.reviews.get(review.id))?.status).toBe('concluida');
  });

  it('mantém a ordem após rejeição e isola operações pendentes por concurso', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    offline = true;
    await syncBatchMutationsToApi([{ table: 'reviews', action: 'upsert', records: [{ ...review, status: 'concluida' }] }]);
    await syncBatchMutationsToApi([{ table: 'reviews', action: 'delete', ids: [review.id] }]);
    offline = false;
    setActiveContestScopeId('another-contest');
    await retryPendingMutations();
    expect(server.reviews).toHaveLength(1);
    setActiveContestScopeId('default');
    await retryPendingMutations();
    expect(server.reviews).toHaveLength(0);
    expect(hasUnsyncedChanges()).toBe(false);
  });

  it('recupera conclusões do cache antigo uma única vez', async () => {
    const cache = JSON.parse(localStorage.getItem(getWorkspaceCacheKey(email))!);
    cache.schemaRevision = 2;
    cache.data.reviews = [{ ...review, status: 'concluida', completedAt: '2026-11-17T10:00:00Z' }];
    localStorage.setItem(getWorkspaceCacheKey(email), JSON.stringify(cache));
    db.clearMemory();
    await ensureSeed();
    expect((server.reviews[0] as ReviewTask).status).toBe('concluida');
    server.reviews = [review]; // An explicit reopen on another device must then take effect.
    db.clearMemory();
    await ensureSeed();
    expect((await db.reviews.get(review.id))?.status).toBe('pendente');
  });
});
