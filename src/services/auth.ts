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
  sessionId: string;
  legacyToken?: string;
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

const AUTH_STORAGE_KEY = 'bnb_auth_session_v2';
const LEGACY_AUTH_STORAGE_KEY = 'bnb_auth_session_v1';
const BROWSER_SESSION_HEADER = 'X-Estudae-Session';
const ACTIVE_CONTEST_SCOPE_KEY = 'estudae_active_contest_scope_v1';

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

let authRevision = 0;
let cachedSession: AuthSessionDto | null = loadStoredSession();
let activeContestScopeId: string = loadStoredContestScope();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== window.localStorage || event.key !== AUTH_STORAGE_KEY) return;
    authRevision++;
    cachedSession = loadStoredSession();
    activeContestScopeId = cachedSession ? loadStoredContestScope() : 'default';
    notifyAuthListeners();
  });
}

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
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSessionDto;
    if (!parsed || !parsed.user?.id) return null;
    if (typeof parsed.sessionId === 'string') return parsed;
    const legacy = parsed as unknown as { token?: string } & AuthSessionDto;
    if (typeof legacy.token === 'string') {
      return { sessionId: createId(), legacyToken: legacy.token, expiresIn: parsed.expiresIn, user: parsed.user };
    }
    return null;
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

export function getLocalSessionId(): string | null {
  return cachedSession?.sessionId ?? null;
}

export function setAuthSession(session: AuthSessionDto | null): void {
  const previousEmail = cachedSession?.user?.email?.toLowerCase();
  authRevision++;
  cachedSession = session;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (session) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
      } else {
        activeContestScopeId = 'default';
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
        window.localStorage.removeItem(ACTIVE_CONTEST_SCOPE_KEY);
        window.localStorage.removeItem('bnb_unsynced_changes_v1');
        if (previousEmail) {
          const cachePrefix = `bnb_workspace_cache_v1:${previousEmail}`;
          window.localStorage.removeItem(cachePrefix);
          const keysToRemove: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && (k === cachePrefix || (k.startsWith(`${cachePrefix}::`) && !k.includes(':pending-batches')))) {
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

export function buildSessionHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const session = getAuthSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (session) headers[BROWSER_SESSION_HEADER] = session.user.id;
  if (session?.legacyToken) {
    headers.Authorization = `Bearer ${session.legacyToken}`;
  }
  if (activeContestScopeId && activeContestScopeId !== 'default' && !headers['X-Contest-Id']) {
    headers['X-Contest-Id'] = activeContestScopeId;
  }
  return headers;
}

async function parseApiJson<T>(res: Response, sessionId?: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (res.status === 401 && sessionId && getLocalSessionId() === sessionId) {
      await verifyCurrentSession();
    }
    throw new Error(body.error ?? `Erro na requisição (${res.status}).`);
  }
  return body;
}

export async function loginWithCredentials(input: LoginInputDto): Promise<AuthSessionDto> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [BROWSER_SESSION_HEADER]: 'start' },
    body: JSON.stringify(input),
  });
  const { user, expiresIn } = await parseApiJson<Pick<AuthSessionDto, 'user' | 'expiresIn'>>(res);
  // O identificador local distingue operações em andamento entre sessões. A credencial é HttpOnly.
  const session: AuthSessionDto = { sessionId: createId(), user, expiresIn };
  setAuthSession(session);
  return session;
}

export async function registerUserAccount(input: RegisterInputDto): Promise<AuthSessionDto> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [BROWSER_SESSION_HEADER]: 'start' },
    body: JSON.stringify(input),
  });
  const { user, expiresIn } = await parseApiJson<Pick<AuthSessionDto, 'user' | 'expiresIn'>>(res);
  // O identificador local distingue operações em andamento entre sessões. A credencial é HttpOnly.
  const session: AuthSessionDto = { sessionId: createId(), user, expiresIn };
  setAuthSession(session);
  return session;
}

let sessionRecovery: Promise<void> | undefined;

export function restoreCurrentSession(): Promise<void> {
  if (cachedSession) return Promise.resolve();
  if (sessionRecovery) return sessionRecovery;

  const revision = authRevision;
  sessionRecovery = fetch('/api/auth/me', {
    cache: 'no-store',
    headers: { [BROWSER_SESSION_HEADER]: 'restore' },
  }).then(async (response) => {
    if (!response.ok) return;
    const { user, expiresIn } = await parseApiJson<Pick<AuthSessionDto, 'user' | 'expiresIn'>>(response);
    if (revision === authRevision) {
      setAuthSession({ sessionId: createId(), user, expiresIn });
    }
  }).catch(() => {
    // Uma falha de rede deixa o formulário de acesso disponível.
  }).finally(() => {
    sessionRecovery = undefined;
  });

  return sessionRecovery;
}

export async function verifyCurrentSession(): Promise<AuthUserDto | null> {
  const session = getAuthSession();
  if (!session) return null;
  try {
    const headers = buildSessionHeaders();
    if (session.legacyToken) headers[BROWSER_SESSION_HEADER] = 'exchange';
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers,
    });
    if (getLocalSessionId() !== session.sessionId) return null;
    if (res.status === 401) {
      setAuthSession(null);
      return null;
    }
    const data = await parseApiJson<{ user: AuthUserDto; exchanged?: boolean }>(res);
    if (getLocalSessionId() === session.sessionId && (!session.legacyToken || data.exchanged)) {
      setAuthSession({ ...session, legacyToken: undefined, user: data.user });
    }
    return getLocalSessionId() === session.sessionId ? data.user : null;
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
  const sessionId = getLocalSessionId();
  if (!sessionId) throw new Error('Sessão expirada. Entre novamente.');
  if (sessionId === TEST_LOCAL_SESSION_ID) {
    if (cachedSession) {
      const user = { ...cachedSession.user, ...input, name: input.name?.trim() || cachedSession.user.name };
      setAuthSession({ ...cachedSession, user });
      return user;
    }
    throw new Error('Sessão expirada. Entre novamente.');
  }
  const res = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: buildSessionHeaders(),
    body: JSON.stringify(input),
  });
  const data = await parseApiJson<{ user: AuthUserDto }>(res, sessionId);
  if (cachedSession?.sessionId === sessionId) {
    setAuthSession({ ...cachedSession, user: data.user });
  }
  return data.user;
}

export async function deleteUserAccount(): Promise<void> {
  const sessionId = getLocalSessionId();
  const previousEmail = cachedSession?.user?.email?.toLowerCase();
  if (sessionId && sessionId !== TEST_LOCAL_SESSION_ID) {
    const res = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: buildSessionHeaders(),
    });
    await parseApiJson<{ deleted: boolean }>(res, sessionId);
    if (getLocalSessionId() !== sessionId) return;
  }
  if (previousEmail) {
    purgeWorkspaceStorage(previousEmail);
    try {
      window.localStorage.removeItem(`estudae_user_contests_v1:${previousEmail}`);
    } catch {
      // Storage is optional.
    }
  }
  setAuthSession(null);
}

export async function logoutUser(): Promise<boolean> {
  const session = getAuthSession();
  if (!session) return true;
  const email = session.user.email;
  const workspaceKeys = getLocalWorkspaceKeys(email);
  const pending = workspaceKeys.some((key) => key.includes(':pending-batches') && readPendingBatches(key).length > 0);
  if (pending && !window.confirm('Há alterações de estudo não sincronizadas. Sair e descartar essas alterações deste dispositivo?')) {
    return false;
  }
  if (session.sessionId !== TEST_LOCAL_SESSION_ID) {
    const res = await fetch('/api/auth/logout', { method: 'POST', headers: buildSessionHeaders() });
    if (!res.ok) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
  }
  if (getAuthSession()?.sessionId !== session.sessionId) return false;
  purgeWorkspaceStorage(email);
  setAuthSession(null);
  return true;
}

function getLocalWorkspaceKeys(email: string): string[] {
  const prefix = getWorkspaceCacheKey(email, 'default');
  let keys = [...volatileBatches.keys()];
  try {
    keys = [...keys, ...Object.keys(window.localStorage)];
  } catch {
    // The in-memory queue remains available when storage is unavailable.
  }
  return [...new Set(keys)].filter((key) => key === prefix || key.startsWith(`${prefix}:`));
}

function purgeWorkspaceStorage(email: string): void {
  for (const key of getLocalWorkspaceKeys(email)) {
    volatileBatches.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage is optional.
    }
  }
}

export const TEST_LOCAL_SESSION_ID = 'test-jwt-token';

export async function fetchContestWorkspaces(): Promise<ContestWorkspaceSummary[] | null> {
  const sessionId = getLocalSessionId();
  if (!sessionId || sessionId === TEST_LOCAL_SESSION_ID) return null;
  const res = await fetch('/api/study-data/contests', { cache: 'no-store', headers: buildSessionHeaders() });
  const body = await parseApiJson<{ contests: ContestWorkspaceSummary[] }>(res, sessionId);
  if (!Array.isArray(body.contests)) throw new Error('Resposta inválida ao carregar seus concursos.');
  return body.contests;
}

export async function fetchUserWorkspaceFromApi(): Promise<Record<DataTableName, unknown[]> | null> {
  const sessionId = getLocalSessionId();
  if (!sessionId || sessionId === TEST_LOCAL_SESSION_ID) return null;
  const res = await fetch('/api/study-data', {
    method: 'GET',
    cache: 'no-store',
    headers: buildSessionHeaders(),
  });
  const body = await parseApiJson<{ data: Record<DataTableName, unknown[]> }>(res, sessionId);
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

type SyncedWorkspace = Partial<Record<DataTableName, unknown[]>>;
type OnWorkspaceSynced = (workspace: SyncedWorkspace) => void;

async function putWorkspaceDirect(
  workspace: Record<DataTableName, unknown[]>,
  headers: Record<string, string>,
  onSynced?: OnWorkspaceSynced,
): Promise<boolean> {
  const res = await fetch('/api/study-data/workspace', {
    method: 'PUT',
    headers,
    body: JSON.stringify(workspace),
  });
  const body = await res.json().catch(() => null) as { ok?: boolean; data?: SyncedWorkspace } | null;
  if (!res.ok || body?.ok !== true) return false;
  if (body.data) onSynced?.(body.data);
  return true;
}

export async function replaceUserWorkspaceInApi(
  workspace: Record<DataTableName, unknown[]>,
  scope = getActiveContestScopeId(),
  onSynced?: OnWorkspaceSynced,
): Promise<boolean> {
  const sessionId = getLocalSessionId();
  if (!sessionId || sessionId === TEST_LOCAL_SESSION_ID) return false;
  const headers = buildSessionHeaders({ 'X-Contest-Id': scope });
  const key = pendingBatchKey(scope);
  const superseded = new Set(key ? readPendingBatches(key).map((batch) => batch.id) : []);
  return enqueueSyncTask(async () => {
    try {
      const ok = await putWorkspaceDirect(workspace, headers, onSynced);
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
      const changes = { ...op.changes } as Record<string, unknown>;
      delete changes.geminiApiKey;
      delete changes.aiProvider;
      return { ...op, changes };
    }
    if (op.action !== 'upsert') return op;
    return { ...op, records: op.records.map((record) => {
      const safeRecord = { ...(record as Record<string, unknown>) };
      delete safeRecord.geminiApiKey;
      delete safeRecord.aiProvider;
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
  sessionId: string,
  currentBatch?: PendingBatch,
  retryThroughId?: string,
  onSynced?: OnWorkspaceSynced,
): Promise<boolean> {
  let confirmed = true;
  for (const saved of readPendingBatches(key)) {
    if (getLocalSessionId() !== sessionId) return false;
    const batch = saved.id === currentBatch?.id ? currentBatch : saved;
    try {
      const res = await fetch('/api/study-data/batch', {
        method: 'POST', headers, body: JSON.stringify({ operations: batch.operations }),
      });
      const body = await res.json().catch(() => null) as { ok?: boolean; error?: string; data?: SyncedWorkspace } | null;
      if (getLocalSessionId() !== sessionId) return false;
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
      if (saved.id === currentBatch?.id || saved.id === retryThroughId) {
        if (confirmed && body?.data) onSynced?.(body.data);
        return confirmed;
      }
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
  const sessionId = getLocalSessionId();
  if (!key || !sessionId || sessionId === TEST_LOCAL_SESSION_ID) return;
  const marker = unsyncedKey();
  const headers = buildSessionHeaders();
  const lastPending = readPendingBatches(key).at(-1)?.id;
  await enqueueSyncTask(async () => {
    if (getLocalSessionId() !== sessionId) return;
    const pending = lastPending && readPendingBatches(key).some((batch) => batch.id === lastPending);
    if (!pending || await drainPendingBatches(key, headers, sessionId, undefined, lastPending)) {
      try { window.localStorage.removeItem(marker); } catch { /* Storage is optional. */ }
    }
  });
}

export async function syncBatchMutationsToApi(
  operations: readonly RemoteTableMutation[],
  scope = getActiveContestScopeId(),
  onSynced?: OnWorkspaceSynced,
): Promise<boolean> {
  const sessionId = getLocalSessionId();
  const key = pendingBatchKey(scope);
  if (!sessionId || sessionId === TEST_LOCAL_SESSION_ID || !key || operations.length === 0) return true;
  const headers = buildSessionHeaders({ 'X-Contest-Id': scope });
  const batch: PendingBatch = {
    id: createId(),
    operations: structuredClone([...operations]),
  };
  storePendingBatches(key, [...readPendingBatches(key), batch]);
  return enqueueSyncTask(() => drainPendingBatches(key, headers, sessionId, batch, undefined, onSynced));
}
