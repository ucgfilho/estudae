import type { DataTableName } from '../db/types';

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
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
  | { table: DataTableName; action: 'upsert'; records: unknown[] }
  | { table: DataTableName; action: 'delete'; ids: string[] }
  | { table: DataTableName; action: 'clear' };

const AUTH_STORAGE_KEY = 'bnb_auth_session_v1';

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

let cachedSession: AuthSessionDto | null = loadStoredSession();

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
  cachedSession = session;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (session) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
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

export async function deleteUserAccount(): Promise<void> {
  const token = getAuthToken();
  if (token && token !== TEST_BYPASS_TOKEN) {
    const res = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: buildBearerHeaders(),
    });
    await parseApiJson<{ deleted: boolean }>(res);
  }
  setAuthSession(null);
}

export const TEST_BYPASS_TOKEN = 'test-jwt-token';

export async function fetchUserWorkspaceFromApi(): Promise<Record<DataTableName, unknown[]> | null> {
  const token = getAuthToken();
  if (!token || token === TEST_BYPASS_TOKEN) return null;
  const res = await fetch('/api/study-data', {
    method: 'GET',
    headers: buildBearerHeaders(),
  });
  const body = await parseApiJson<{ data: Record<DataTableName, unknown[]> }>(res);
  return body.data;
}

const UNSYNCED_KEY = 'bnb_unsynced_changes_v1';

/** Indica que alguma alteração local não chegou ao servidor (ex.: lote rejeitado ou em trânsito). */
export function hasUnsyncedChanges(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(UNSYNCED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnsyncedChanges(value: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (value) window.localStorage.setItem(UNSYNCED_KEY, '1');
    else window.localStorage.removeItem(UNSYNCED_KEY);
  } catch {
    // Ignore storage errors
  }
}

let syncQueue: Promise<void> = Promise.resolve();
let pendingSyncCount = 0;
let hasSyncFailure = false;

function enqueueSyncTask<T>(task: () => Promise<T>): Promise<T> {
  pendingSyncCount++;
  setUnsyncedChanges(true);
  const run = syncQueue.then(task, task);
  syncQueue = run.then(
    () => {
      pendingSyncCount--;
      if (pendingSyncCount === 0 && !hasSyncFailure) {
        setUnsyncedChanges(false);
      }
    },
    () => {
      pendingSyncCount--;
    },
  );
  return run;
}

/** Aguarda todas as sincronizações em andamento na fila terminarem. */
export async function waitForPendingSync(): Promise<void> {
  await syncQueue;
}

function isRemoteMissingLocalRecords(
  remote: Record<DataTableName, unknown[]>,
  local: Record<DataTableName, unknown[]>,
): boolean {
  const tables: DataTableName[] = [
    'topics',
    'sessions',
    'weeklyPlans',
    'questionLogs',
    'errorNotes',
    'reviews',
    'mockExams',
    'timer',
  ];
  for (const table of tables) {
    if ((local[table]?.length ?? 0) !== (remote[table]?.length ?? 0)) {
      return true;
    }
  }
  return false;
}

async function putWorkspaceDirect(workspace: Record<DataTableName, unknown[]>): Promise<boolean> {
  const res = await fetch('/api/study-data/workspace', {
    method: 'PUT',
    headers: buildBearerHeaders(),
    body: JSON.stringify(workspace),
  });
  return res.ok;
}

export async function replaceUserWorkspaceInApi(
  workspace: Record<DataTableName, unknown[]>,
): Promise<boolean> {
  const token = getAuthToken();
  if (!token || token === TEST_BYPASS_TOKEN) return false;
  return enqueueSyncTask(async () => {
    try {
      const ok = await putWorkspaceDirect(workspace);
      hasSyncFailure = !ok;
      if (!ok) {
        setUnsyncedChanges(true);
      }
      return ok;
    } catch (err) {
      hasSyncFailure = true;
      setUnsyncedChanges(true);
      console.error('Falha ao restaurar workspace no servidor:', err);
      return false;
    }
  });
}

export async function syncBatchMutationsToApi(
  operations: readonly RemoteTableMutation[],
  getLocalSnapshot?: () => Record<DataTableName, unknown[]>,
): Promise<void> {
  const token = getAuthToken();
  if (!token || token === TEST_BYPASS_TOKEN || operations.length === 0) return;
  return enqueueSyncTask(async () => {
    try {
      const res = await fetch('/api/study-data/batch', {
        method: 'POST',
        headers: buildBearerHeaders(),
        body: JSON.stringify({ operations }),
      });
      if (!res.ok && res.status !== 401) {
        hasSyncFailure = true;
        setUnsyncedChanges(true);
        console.error('Servidor rejeitou alterações; serão reenviadas ao recarregar.', res.status);
        return;
      }
      if (res.status === 401) {
        const meRes = await fetch('/api/auth/me', {
          method: 'GET',
          headers: buildBearerHeaders(),
        }).catch(() => null);
        if (meRes && meRes.status === 401) {
          setAuthSession(null);
        }
        return;
      }
      if (res.ok && getLocalSnapshot) {
        const body = (await res.json().catch(() => null)) as {
          data?: Record<DataTableName, unknown[]>;
        } | null;
        const localSnapshot = getLocalSnapshot();
        if (body?.data && isRemoteMissingLocalRecords(body.data, localSnapshot)) {
          const healed = await putWorkspaceDirect(localSnapshot);
          hasSyncFailure = !healed;
          if (!healed) setUnsyncedChanges(true);
          return;
        }
      }
      hasSyncFailure = false;
    } catch (err) {
      hasSyncFailure = true;
      setUnsyncedChanges(true);
      console.error('Falha ao sincronizar alterações com o banco de dados:', err);
    }
  });
}
