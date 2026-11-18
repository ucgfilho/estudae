import type { ContestWorkspaceSummary, DataTableName, Settings } from '../db/types';
import { createId } from '../lib/utils';

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface AuthSessionDto {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUserDto;
}

export interface LoginInputDto {
  email: string;
  password: string;
}

export interface RegisterInputDto {
  name: string;
  email: string;
  password: string;
}

export type RemoteTableMutation =
  | { table: 'settings'; action: 'patch'; changes: Partial<Omit<Settings, 'id' | 'theme'>> }
  | { table: DataTableName; action: 'upsert'; records: unknown[] }
  | { table: DataTableName; action: 'delete'; ids: string[] }
  | { table: DataTableName; action: 'clear' };

const AUTH_STORAGE_KEY = 'bnb_auth_session_v1';
const ACTIVE_CONTEST_SCOPE_KEY = 'estudae_active_contest_scope_v1';

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

let cachedSession: AuthSessionDto | null = loadStoredSession();
let activeContestScopeId: string = loadStoredContestScope();

function loadStoredContestScope(): string {
  if (typeof window === 'undefined' || !window.localStorage) return 'default';
  try {
    return window.localStorage.getItem(ACTIVE_CONTEST_SCOPE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

export function getActiveContestScopeId(): string {
  return activeContestScopeId || 'default';
}

export function setActiveContestScopeId(scopeId: string): void {
  const normalized = scopeId?.trim() || 'default';
  activeContestScopeId = normalized;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ACTIVE_CONTEST_SCOPE_KEY, normalized);
    } catch {
      // Ignore storage errors
    }
  }
}

export function getWorkspaceCacheKey(email: string, scopeId = getActiveContestScopeId()): string {
  const cleanEmail = email.toLowerCase();
  if (!scopeId || scopeId === 'default') {
    return `bnb_workspace_cache_v1:${cleanEmail}`;
  }
  return `bnb_workspace_cache_v1:${cleanEmail}::${scopeId}`;
}

function loadStoredSession(): AuthSessionDto | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSessionDto;
    if (!parsed || typeof parsed.token !== 'string' || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function notifyAuthListeners(): void {
  for (const listener of authListeners) {
    listener();
  }
}

export function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function getAuthSession(): AuthSessionDto | null {
  return cachedSession;
}

export function getAuthToken(): string | null {
  return cachedSession?.token ?? null;
}

export function setAuthSession(session: AuthSessionDto | null): void {
  const previousEmail = cachedSession?.user?.email?.toLowerCase();
  cachedSession = session;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (session) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      } else {
        activeContestScopeId = 'default';
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.localStorage.removeItem(ACTIVE_CONTEST_SCOPE_KEY);
        window.localStorage.removeItem('bnb_unsynced_changes_v1');
        if (previousEmail) {
          const cachePrefix = `bnb_workspace_cache_v1:${previousEmail}`;
          window.localStorage.removeItem(cachePrefix);
          const keysToRemove: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && (k === cachePrefix || (k.startsWith(`${cachePrefix}::`) && !k.endsWith(':pending-batches')))) {
              keysToRemove.push(k);
            }
          }
          for (const k of keysToRemove) {
            window.localStorage.removeItem(k);
          }
        }
      }
    } catch {
      // Ignore storage quota errors
    }
  }
  notifyAuthListeners();
}

export function buildBearerHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (activeContestScopeId && activeContestScopeId !== 'default' && !headers['X-Contest-Id']) {
    headers['X-Contest-Id'] = activeContestScopeId;
  }
  return headers;
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (res.status === 401) {
      setAuthSession(null);
    }
    throw new Error(body.error ?? `Erro na requisição (${res.status}).`);
  }
  return body;
}

export async function loginWithCredentials(input: LoginInputDto): Promise<AuthSessionDto> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const session = await parseApiJson<AuthSessionDto>(res);
  setAuthSession(session);
  return session;
}

export async function registerUserAccount(input: RegisterInputDto): Promise<AuthSessionDto> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const session = await parseApiJson<AuthSessionDto>(res);
  setAuthSession(session);
  return session;
}

export async function verifyCurrentSession(): Promise<AuthUserDto | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: buildBearerHeaders(),
    });
    const data = await parseApiJson<{ user: AuthUserDto }>(res);
    if (cachedSession) {
      setAuthSession({ ...cachedSession, user: data.user });
    }
    return data.user;
  } catch {
    return null;
  }
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string | null;
}

/** Atualiza nome e foto do perfil e mantém a sessão local em sincronia. */
export async function updateUserProfile(input: UpdateProfileInput): Promise<AuthUserDto> {
  const token = getAuthToken();
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  if (token === TEST_BYPASS_TOKEN) {
    if (cachedSession) {
      const user = { ...cachedSession.user, ...input, name: input.name?.trim() || cachedSession.user.name };
      setAuthSession({ ...cachedSession, user });
      return user;
    }
    throw new Error('Sessão expirada. Entre novamente.');
  }
  const res = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: buildBearerHeaders(),
    body: JSON.stringify(input),
  });
  const data = await parseApiJson<{ user: AuthUserDto }>(res);
  if (cachedSession) {
    setAuthSession({ ...cachedSession, user: data.user });
  }
  return data.user;
}

export async function deleteUserAccount(): Promise<void> {
  const token = getAuthToken();
  const previousEmail = cachedSession?.user?.email?.toLowerCase();
  if (token && token !== TEST_BYPASS_TOKEN) {
    const res = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: buildBearerHeaders(),
    });
    await parseApiJson<{ deleted: boolean }>(res);
  }
  if (previousEmail && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(`estudae_user_contests_v1:${previousEmail}`);
      const prefix = getWorkspaceCacheKey(previousEmail, 'default');
      for (const key of Object.keys(window.localStorage)) {
        if (key === prefix || key.startsWith(`${prefix}:`)) window.localStorage.removeItem(key);
      }
      for (const key of volatileBatches.keys()) {
        if (key.startsWith(`${prefix}:`)) volatileBatches.delete(key);
      }
    } catch {
      // Ignore storage errors
    }
  }
  setAuthSession(null);
}

export const TEST_BYPASS_TOKEN = 'test-jwt-token';

export async function fetchContestWorkspaces(): Promise<ContestWorkspaceSummary[] | null> {
  const token = getAuthToken();
  if (!token || token === TEST_BYPASS_TOKEN) return null;
  const res = await fetch('/api/study-data/contests', { cache: 'no-store', headers: buildBearerHeaders() });
  const body = await parseApiJson<{ contests: ContestWorkspaceSummary[] }>(res);
  if (!Array.isArray(body.contests)) throw new Error('Resposta inválida ao carregar seus concursos.');
  return body.contests;
}

export async function fetchUserWorkspaceFromApi(): Promise<Record<DataTableName, unknown[]> | null> {
  const token = getAuthToken();
  if (!token || token === TEST_BYPASS_TOKEN) return null;
  const res = await fetch('/api/study-data', {
    method: 'GET',
    cache: 'no-store',
    headers: buildBearerHeaders(),
  });
  const body = await parseApiJson<{ data: Record<DataTableName, unknown[]> }>(res);
  if (!body.data) throw new Error('Resposta inválida ao carregar os dados de estudo.');
  return body.data;
}

const UNSYNCED_KEY = 'bnb_unsynced_changes_v1';
function unsyncedKey(): string {
  return `${UNSYNCED_KEY}:${getAuthSession()?.user.email.toLowerCase() ?? ''}:${getActiveContestScopeId()}`;
}

/** Indica que alguma alteração local não chegou ao servidor (ex.: lote rejeitado ou em trânsito). */
export function hasUnsyncedChanges(): boolean {
  try {
    const key = pendingBatchKey();
    return (key !== null && readPendingBatches(key).length > 0) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem(unsyncedKey()) === '1');
  } catch {
    return false;
  }
}

let syncQueue: Promise<void> = Promise.resolve();
function enqueueSyncTask<T>(task: () => Promise<T>): Promise<T> {
  const run = syncQueue.then(task);
  syncQueue = run.then(() => undefined, () => undefined);
  return run;
}

/** Aguarda todas as sincronizações em andamento na fila terminarem. */
export async function waitForPendingSync(): Promise<void> {
  await syncQueue;
}

async function putWorkspaceDirect(workspace: Record<DataTableName, unknown[]>, headers: Record<string, string>): Promise<boolean> {
  const res = await fetch('/api/study-data/workspace', {
    method: 'PUT',
    headers,
    body: JSON.stringify(workspace),
  });
  const body = await res.json().catch(() => null) as { ok?: boolean } | null;
  return res.ok && body?.ok === true;
}

export async function replaceUserWorkspaceInApi(
  workspace: Record<DataTableName, unknown[]>,
  scope = getActiveContestScopeId(),
): Promise<boolean> {
  const token = getAuthToken();
  if (!token || token === TEST_BYPASS_TOKEN) return false;
  const headers = buildBearerHeaders({ 'X-Contest-Id': scope });
  const key = pendingBatchKey(scope);
  const superseded = new Set(key ? readPendingBatches(key).map((batch) => batch.id) : []);
  return enqueueSyncTask(async () => {
    try {
      const ok = await putWorkspaceDirect(workspace, headers);
      if (ok && key) storePendingBatches(key, readPendingBatches(key).filter((batch) => !superseded.has(batch.id)));
      return ok;
    } catch (err) {
      console.error('Falha ao restaurar workspace no servidor:', err);
      return false;
    }
  });
}

interface PendingBatch {
  id: string;
  operations: RemoteTableMutation[];
}

function pendingBatchKey(scope = getActiveContestScopeId()): string | null {
  const email = getAuthSession()?.user.email;
  return email ? `${getWorkspaceCacheKey(email, scope)}:pending-batches` : null;
}

const volatileBatches = new Map<string, PendingBatch[]>();

function readPendingBatches(key: string): PendingBatch[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || '[]');
    return volatileBatches.get(key) ?? (Array.isArray(parsed) ? parsed : []);
  } catch {
    return volatileBatches.get(key) ?? [];
  }
}

function storePendingBatches(key: string, batches: PendingBatch[]): void {
  const safe = batches.map((batch) => ({ ...batch, operations: batch.operations.map((op) => {
    if (op.table !== 'settings') return op;
    if (op.action === 'patch') {
      const changes = { ...op.changes };
      delete changes.geminiApiKey;
      return { ...op, changes };
    }
    if (op.action !== 'upsert') return op;
    return { ...op, records: op.records.map((record) => {
      const safeRecord = { ...(record as Record<string, unknown>) };
      delete safeRecord.geminiApiKey;
      return safeRecord;
    }) };
  }) }));
  try {
    window.localStorage.setItem(key, JSON.stringify(safe));
    volatileBatches.delete(key);
  } catch {
    volatileBatches.set(key, safe);
  }
}

async function drainPendingBatches(
  key: string,
  headers: Record<string, string>,
  currentBatch?: PendingBatch,
  retryThroughId?: string,
): Promise<boolean> {
  let confirmed = true;
  for (const saved of readPendingBatches(key)) {
    const batch = saved.id === currentBatch?.id ? currentBatch : saved;
    try {
      const res = await fetch('/api/study-data/batch', {
        method: 'POST', headers, body: JSON.stringify({ operations: batch.operations }),
      });
      const body = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || body?.ok !== true) {
        if (res.status !== 400 && res.status !== 422) return false;
        // A rejected batch must not block valid writes. Keep it for recovery.
        const rejectedKey = `${key}:rejected`;
        const rejected = readPendingBatches(rejectedKey);
        storePendingBatches(rejectedKey, [...rejected.slice(-19), saved]);
        if (saved.id === currentBatch?.id) confirmed = false;
        console.error('Alterações rejeitadas pelo servidor:', body?.error ?? res.status);
      }
      storePendingBatches(key, readPendingBatches(key).filter((item) => item.id !== batch.id));
      if (saved.id === currentBatch?.id || saved.id === retryThroughId) return confirmed;
    } catch (err) {
      console.error('Falha ao sincronizar alterações com o banco de dados:', err);
      return false;
    }
  }
  return confirmed && (!currentBatch ||
    !readPendingBatches(`${key}:rejected`).some((batch) => batch.id === currentBatch.id));
}

/** Reenvia somente operações não confirmadas, sem substituir dados de outros dispositivos. */
export async function retryPendingMutations(): Promise<void> {
  const key = pendingBatchKey();
  const token = getAuthToken();
  if (!key || !token || token === TEST_BYPASS_TOKEN) return;
  const marker = unsyncedKey();
  const headers = buildBearerHeaders();
  const lastPending = readPendingBatches(key).at(-1)?.id;
  await enqueueSyncTask(async () => {
    const pending = lastPending && readPendingBatches(key).some((batch) => batch.id === lastPending);
    if (!pending || await drainPendingBatches(key, headers, undefined, lastPending)) {
      try { window.localStorage.removeItem(marker); } catch { /* Storage is optional. */ }
    }
  });
}

export async function syncBatchMutationsToApi(
  operations: readonly RemoteTableMutation[],
  scope = getActiveContestScopeId(),
): Promise<boolean> {
  const token = getAuthToken();
  const key = pendingBatchKey(scope);
  if (!token || token === TEST_BYPASS_TOKEN || !key || operations.length === 0) return true;
  const headers = buildBearerHeaders({ 'X-Contest-Id': scope });
  const batch: PendingBatch = {
    id: createId(),
    operations: structuredClone([...operations]),
  };
  storePendingBatches(key, [...readPendingBatches(key), batch]);
  return enqueueSyncTask(() => drainPendingBatches(key, headers, batch));
}
