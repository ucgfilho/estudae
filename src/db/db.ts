import { addDays, startOfWeek, weekdayIndex } from '../lib/dates';
import {
  fetchUserWorkspaceFromApi,
  getAuthSession,
  getAuthToken,
  hasUnsyncedChanges,
  replaceUserWorkspaceInApi,
  syncBatchMutationsToApi,
  TEST_BYPASS_TOKEN,
  waitForPendingSync,
  type RemoteTableMutation,
} from '../services/auth';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS, DEFAULT_TOPICS } from './seed';
import {
  DATA_TABLES,
  SETTINGS_ID,
  type DataTableName,
  type Discipline,
  type ErrorNote,
  type MockExam,
  type QuestionLog,
  type ReviewTask,
  type Settings,
  type StudySession,
  type TimerState,
  type Topic,
  type WeeklyPlan,
} from './types';

export { DATA_TABLES, type DataTableName };

export const DB_NAME = 'bnb-estudos';
export const SCHEMA_VERSION = 2;

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

export interface TableCollection<T extends { id: string }> {
  toArray(): Promise<T[]>;
  first(): Promise<T | undefined>;
  count(): Promise<number>;
  primaryKeys(): Promise<string[]>;
  filter(predicate: (item: T) => boolean): TableCollection<T>;
  modify(changes: Partial<T> | ((item: T) => void)): Promise<number>;
  delete(): Promise<number>;
}

export class MemoryTable<T extends { id: string }> {
  public readonly name: DataTableName;
  private readonly items = new Map<string, T>();
  private readonly onMutation: (mutation: RemoteTableMutation) => void;

  constructor(name: DataTableName, onMutation: (mutation: RemoteTableMutation) => void) {
    this.name = name;
    this.onMutation = onMutation;
  }

  public replaceAllSilent(records: readonly T[]): void {
    this.items.clear();
    for (const r of records) {
      this.items.set(r.id, cloneRecord(r));
    }
  }

  public clearSilent(): void {
    this.items.clear();
  }

  public toArraySync(): T[] {
    return Array.from(this.items.values()).map(cloneRecord);
  }

  public getSync(id: string): T | undefined {
    const found = this.items.get(id);
    return found ? cloneRecord(found) : undefined;
  }

  public async toArray(): Promise<T[]> {
    return this.toArraySync();
  }

  public async get(id: string): Promise<T | undefined> {
    return this.getSync(id);
  }

  public async count(): Promise<number> {
    return this.items.size;
  }

  public async add(item: T): Promise<string> {
    const copy = cloneRecord(item);
    this.items.set(copy.id, copy);
    this.onMutation({ table: this.name, action: 'upsert', records: [copy] });
    return copy.id;
  }

  public async put(item: T): Promise<string> {
    const copy = cloneRecord(item);
    this.items.set(copy.id, copy);
    this.onMutation({ table: this.name, action: 'upsert', records: [copy] });
    return copy.id;
  }

  public async update(id: string, changes: Partial<T>): Promise<number> {
    const existing = this.items.get(id);
    if (!existing) return 0;
    const updated = cloneRecord({ ...existing, ...changes, id });
    this.items.set(id, updated);
    this.onMutation({ table: this.name, action: 'upsert', records: [updated] });
    return 1;
  }

  public async delete(id: string): Promise<void> {
    if (this.items.delete(id)) {
      this.onMutation({ table: this.name, action: 'delete', ids: [id] });
    }
  }

  public async bulkAdd(records: readonly T[]): Promise<string> {
    if (records.length === 0) return '';
    const copies = records.map(cloneRecord);
    for (const c of copies) {
      this.items.set(c.id, c);
    }
    this.onMutation({ table: this.name, action: 'upsert', records: copies });
    return copies[copies.length - 1].id;
  }

  public async bulkPut(records: readonly T[]): Promise<string> {
    return this.bulkAdd(records);
  }

  public async bulkDelete(ids: readonly string[]): Promise<void> {
    const deleted: string[] = [];
    for (const id of ids) {
      if (this.items.delete(id)) {
        deleted.push(id);
      }
    }
    if (deleted.length > 0) {
      this.onMutation({ table: this.name, action: 'delete', ids: deleted });
    }
  }

  public async clear(): Promise<void> {
    this.items.clear();
    this.onMutation({ table: this.name, action: 'clear' });
  }

  public orderBy(field: keyof T & string): {
    toArray(): Promise<T[]>;
    first(): Promise<T | undefined>;
  } {
    const getSorted = (): T[] => {
      const list = this.toArraySync();
      list.sort((a, b) => {
        const va = a[field];
        const vb = b[field];
        if (va === vb) return 0;
        if (va === undefined || va === null) return 1;
        if (vb === undefined || vb === null) return -1;
        return va < vb ? -1 : 1;
      });
      return list;
    };
    return {
      toArray: async () => getSorted(),
      first: async () => getSorted()[0],
    };
  }

  public toCollection(): TableCollection<T> {
    return this.createCollection(() => true);
  }

  public filter(predicate: (item: T) => boolean): TableCollection<T> {
    return this.createCollection(predicate);
  }

  public where(field: (keyof T & string) | 'id'): {
    equals(value: unknown): TableCollection<T>;
    anyOf(values: readonly unknown[]): TableCollection<T>;
    between(
      lower: unknown,
      upper: unknown,
      includeLower?: boolean,
      includeUpper?: boolean,
    ): TableCollection<T>;
  } {
    return {
      equals: (value: unknown) =>
        this.createCollection((item) => item[field as keyof T] === value),
      anyOf: (values: readonly unknown[]) => {
        const set = new Set(values);
        return this.createCollection((item) => set.has(item[field as keyof T]));
      },
      between: (
        lower: unknown,
        upper: unknown,
        includeLower = true,
        includeUpper = true,
      ) =>
        this.createCollection((item) => {
          const v = item[field as keyof T] as string | number;
          const lo = lower as string | number;
          const hi = upper as string | number;
          const aboveLow = includeLower ? v >= lo : v > lo;
          const belowHigh = includeUpper ? v <= hi : v < hi;
          return aboveLow && belowHigh;
        }),
    };
  }

  private createCollection(predicate: (item: T) => boolean): TableCollection<T> {
    const matchItems = (): T[] => this.toArraySync().filter(predicate);

    return {
      toArray: async () => matchItems(),
      first: async () => matchItems()[0],
      count: async () => matchItems().length,
      primaryKeys: async () => matchItems().map((i) => i.id),
      filter: (nextPred: (item: T) => boolean) =>
        this.createCollection((item) => predicate(item) && nextPred(item)),
      modify: async (changes: Partial<T> | ((item: T) => void)) => {
        const matched = matchItems();
        if (matched.length === 0) return 0;
        const updatedRecords: T[] = [];
        for (const item of matched) {
          const copy = cloneRecord(item);
          if (typeof changes === 'function') {
            changes(copy);
          } else {
            Object.assign(copy, changes);
          }
          this.items.set(copy.id, copy);
          updatedRecords.push(copy);
        }
        this.onMutation({ table: this.name, action: 'upsert', records: updatedRecords });
        return updatedRecords.length;
      },
      delete: async () => {
        const matched = matchItems();
        if (matched.length === 0) return 0;
        const ids = matched.map((i) => i.id);
        await this.bulkDelete(ids);
        return ids.length;
      },
    };
  }
}

/**
 * Store reativo em memória sincronizado com o banco de dados relacional do backend via REST API (Bearer JWT).
 * Substitui integralmente o IndexedDB no navegador.
 */
export class AppDatabase {
  public readonly disciplines: MemoryTable<Discipline>;
  public readonly topics: MemoryTable<Topic>;
  public readonly sessions: MemoryTable<StudySession>;
  public readonly timer: MemoryTable<TimerState>;
  public readonly questionLogs: MemoryTable<QuestionLog>;
  public readonly errorNotes: MemoryTable<ErrorNote>;
  public readonly reviews: MemoryTable<ReviewTask>;
  public readonly weeklyPlans: MemoryTable<WeeklyPlan>;
  public readonly settings: MemoryTable<Settings>;
  public readonly mockExams: MemoryTable<MockExam>;

  private readonly listeners = new Set<() => void>();
  private txDepth = 0;
  private pendingMutations: RemoteTableMutation[] = [];
  private versionCounter = 0;
  private explicitlyClearedTables: Partial<Record<DataTableName, boolean>> = {};
  private deletedIds: Partial<Record<DataTableName, Set<string>>> = {};

  constructor() {
    const handleMutation = (mutation: RemoteTableMutation) => {
      this.recordMutationMetadata(mutation);
      this.versionCounter++;
      if (this.txDepth > 0) {
        this.pendingMutations.push(mutation);
      } else {
        this.persistLocalWorkspaceCache();
        this.notifyListeners();
        void syncBatchMutationsToApi([mutation], () => this.exportWorkspaceSnapshot());
      }
    };

    this.disciplines = new MemoryTable<Discipline>('disciplines', handleMutation);
    this.topics = new MemoryTable<Topic>('topics', handleMutation);
    this.sessions = new MemoryTable<StudySession>('sessions', handleMutation);
    this.timer = new MemoryTable<TimerState>('timer', handleMutation);
    this.questionLogs = new MemoryTable<QuestionLog>('questionLogs', handleMutation);
    this.errorNotes = new MemoryTable<ErrorNote>('errorNotes', handleMutation);
    this.reviews = new MemoryTable<ReviewTask>('reviews', handleMutation);
    this.weeklyPlans = new MemoryTable<WeeklyPlan>('weeklyPlans', handleMutation);
    this.settings = new MemoryTable<Settings>('settings', handleMutation);
    this.mockExams = new MemoryTable<MockExam>('mockExams', handleMutation);

    this.seedDefaultsSilent();
  }

  public seedDefaultsSilent(): void {
    this.disciplines.replaceAllSilent(DEFAULT_DISCIPLINES);
    this.settings.replaceAllSilent([
      { ...DEFAULT_SETTINGS, distribution: { ...DEFAULT_SETTINGS.distribution } },
    ]);
  }

  private recordMutationMetadata(mutation: RemoteTableMutation): void {
    const table = mutation.table;
    if (mutation.action === 'clear') {
      this.explicitlyClearedTables[table] = true;
      this.deletedIds[table] = new Set();
      return;
    }
    if (mutation.action === 'delete') {
      const set = this.deletedIds[table] ?? new Set<string>();
      for (const id of mutation.ids) {
        set.add(id);
      }
      this.deletedIds[table] = set;
      if (this.table(table).toArraySync().length === 0) {
        this.explicitlyClearedTables[table] = true;
      }
      return;
    }
    if (mutation.action === 'upsert' && mutation.records.length > 0) {
      delete this.explicitlyClearedTables[table];
      const set = this.deletedIds[table];
      if (set) {
        for (const r of mutation.records) {
          const id = (r as { id?: string })?.id;
          if (id) set.delete(id);
        }
      }
    }
  }

  public isTableExplicitlyCleared(table: DataTableName): boolean {
    return Boolean(this.explicitlyClearedTables[table]);
  }

  public setSyncMetadata(
    explicitlyClearedTables?: Partial<Record<DataTableName, boolean>>,
    deletedIds?: Partial<Record<DataTableName, string[]>>,
  ): void {
    this.explicitlyClearedTables = { ...(explicitlyClearedTables ?? {}) };
    this.deletedIds = {};
    if (deletedIds) {
      for (const table of DATA_TABLES) {
        const list = deletedIds[table];
        if (Array.isArray(list) && list.length > 0) {
          this.deletedIds[table] = new Set(list);
        }
      }
    }
  }

  public table(name: DataTableName): MemoryTable<{ id: string }> {
    return this[name] as unknown as MemoryTable<{ id: string }>;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshotVersion(): number {
    return this.versionCounter;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public exportWorkspaceSnapshot(): Record<DataTableName, unknown[]> {
    const out = {} as Record<DataTableName, unknown[]>;
    for (const tableName of DATA_TABLES) {
      out[tableName] = this.table(tableName).toArraySync();
    }
    return out;
  }

  public persistLocalWorkspaceCache(): void {
    const token = getAuthToken();
    const session = getAuthSession();
    if (
      !token ||
      token === TEST_BYPASS_TOKEN ||
      !session?.user?.email ||
      typeof window === 'undefined' ||
      !window.localStorage
    ) {
      return;
    }
    try {
      const serializedDeleted: Partial<Record<DataTableName, string[]>> = {};
      for (const table of DATA_TABLES) {
        const set = this.deletedIds[table];
        if (set && set.size > 0) {
          serializedDeleted[table] = Array.from(set);
        }
      }
      const snapshot = this.exportWorkspaceSnapshot();
      // LGPD / Proteção de Segredos: nunca persistir chaves de API em texto puro no localStorage
      if (Array.isArray(snapshot.settings)) {
        snapshot.settings = (snapshot.settings as Settings[]).map((s) => ({
          ...s,
          geminiApiKey: '',
        }));
      }
      const key = `bnb_workspace_cache_v1:${session.user.email.toLowerCase()}`;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          schemaRevision: 2,
          savedAt: Date.now(),
          explicitlyClearedTables: this.explicitlyClearedTables,
          deletedIds: serializedDeleted,
          data: snapshot,
        }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  public hydrateFromWorkspace(workspace: Partial<Record<DataTableName, unknown[]>>): void {
    for (const tableName of DATA_TABLES) {
      const rows = workspace[tableName];
      if (Array.isArray(rows)) {
        this.table(tableName).replaceAllSilent(rows as { id: string }[]);
        if (rows.length > 0) {
          delete this.explicitlyClearedTables[tableName];
        }
      } else {
        this.table(tableName).clearSilent();
      }
    }
    this.persistLocalWorkspaceCache();
    this.versionCounter++;
    this.notifyListeners();
  }

  public replaceAllFromBackup(workspace: Partial<Record<DataTableName, unknown[]>>): void {
    this.deletedIds = {};
    this.explicitlyClearedTables = {};
    for (const tableName of DATA_TABLES) {
      const rows = workspace[tableName];
      if (Array.isArray(rows) && rows.length > 0) {
        this.table(tableName).replaceAllSilent(rows as { id: string }[]);
      } else {
        this.table(tableName).clearSilent();
        this.explicitlyClearedTables[tableName] = true;
      }
    }
    this.persistLocalWorkspaceCache();
    this.versionCounter++;
    this.notifyListeners();
  }

  public clearMemory(): void {
    this.explicitlyClearedTables = {};
    this.deletedIds = {};
    for (const tableName of DATA_TABLES) {
      this.table(tableName).clearSilent();
    }
    this.seedDefaultsSilent();
    this.versionCounter++;
    this.notifyListeners();
  }

  public async transaction<R>(
    mode: 'r' | 'rw',
    t1: unknown,
    callback: () => Promise<R> | R,
  ): Promise<R>;
  public async transaction<R>(
    mode: 'r' | 'rw',
    t1: unknown,
    t2: unknown,
    callback: () => Promise<R> | R,
  ): Promise<R>;
  public async transaction<R>(
    mode: 'r' | 'rw',
    t1: unknown,
    t2: unknown,
    t3: unknown,
    callback: () => Promise<R> | R,
  ): Promise<R>;
  public async transaction<R>(
    mode: 'r' | 'rw',
    t1: unknown,
    t2: unknown,
    t3: unknown,
    t4: unknown,
    callback: () => Promise<R> | R,
  ): Promise<R>;
  public async transaction<R>(_mode: 'r' | 'rw', ...args: unknown[]): Promise<R> {
    const callback = args[args.length - 1] as () => Promise<R> | R;
    this.txDepth++;
    try {
      const result = await callback();
      return result;
    } finally {
      this.txDepth--;
      if (this.txDepth === 0 && this.pendingMutations.length > 0) {
        const batch = this.pendingMutations;
        this.pendingMutations = [];
        this.persistLocalWorkspaceCache();
        this.notifyListeners();
        void syncBatchMutationsToApi(batch, () => this.exportWorkspaceSnapshot());
      }
    }
  }

  public async delete(): Promise<void> {
    this.clearMemory();
  }

  public async open(): Promise<this> {
    return this;
  }
}

export function createDatabase(): AppDatabase {
  return new AppDatabase();
}

export const db = createDatabase();

export interface LocalWorkspaceCacheEnvelope {
  schemaRevision?: number;
  savedAt?: number;
  explicitlyClearedTables?: Partial<Record<DataTableName, boolean>>;
  deletedIds?: Partial<Record<DataTableName, string[]>>;
  data: Record<DataTableName, unknown[]>;
}

function loadLocalWorkspaceCacheEnvelope(): LocalWorkspaceCacheEnvelope | null {
  const token = getAuthToken();
  const session = getAuthSession();
  if (
    !token ||
    token === TEST_BYPASS_TOKEN ||
    !session?.user?.email ||
    typeof window === 'undefined' ||
    !window.localStorage
  ) {
    return null;
  }
  try {
    const key = `bnb_workspace_cache_v1:${session.user.email.toLowerCase()}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalWorkspaceCacheEnvelope;
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function reconcileWorkspaces(
  remote: Record<DataTableName, unknown[]>,
  localEnvelope: LocalWorkspaceCacheEnvelope,
): { workspace: Record<DataTableName, unknown[]>; needsRemoteHeal: boolean } {
  const out = {} as Record<DataTableName, unknown[]>;
  let needsRemoteHeal = false;
  const isAuthoritativeLocal = localEnvelope.schemaRevision === 2;

  for (const tableName of DATA_TABLES) {
    const localRows = Array.isArray(localEnvelope.data[tableName])
      ? (localEnvelope.data[tableName] as { id: string; weekIndex?: number }[])
      : [];
    const remoteRows = Array.isArray(remote[tableName])
      ? (remote[tableName] as { id: string; weekIndex?: number }[])
      : [];
    const isCleared = Boolean(localEnvelope.explicitlyClearedTables?.[tableName]);
    const deletedSet = new Set(localEnvelope.deletedIds?.[tableName] ?? []);
    const validRemoteRows = isCleared ? [] : remoteRows.filter((r) => !deletedSet.has(r.id));

    let merged: unknown[];
    if (tableName === 'settings' && validRemoteRows.length > 0 && localRows.length > 0) {
      const remoteSettings = validRemoteRows[0] as unknown as Settings;
      const localSettings = localRows[0] as unknown as Settings;
      merged = [
        {
          ...(isAuthoritativeLocal ? localSettings : remoteSettings),
          geminiApiKey: localSettings.geminiApiKey || remoteSettings.geminiApiKey || '',
        },
      ];
    } else if (isCleared && localRows.length === 0) {
      merged = [];
    } else if (localRows.length === 0) {
      merged = validRemoteRows;
    } else if (validRemoteRows.length === 0 || isAuthoritativeLocal) {
      merged = localRows;
    } else {
      // Cache legado (anterior a schemaRevision 2): preserva registros locais e recupera registros remotos ausentes
      const seenIds = new Set(localRows.map((r) => r.id));
      const seenWeekIndices =
        tableName === 'weeklyPlans'
          ? new Set(localRows.map((r) => r.weekIndex).filter((w) => w !== undefined))
          : null;
      merged = [...localRows];
      for (const r of validRemoteRows) {
        if (seenIds.has(r.id)) continue;
        if (seenWeekIndices && r.weekIndex !== undefined && seenWeekIndices.has(r.weekIndex)) {
          continue;
        }
        merged.push(r);
      }
    }

    out[tableName] = merged;
    if (
      merged.length !== remoteRows.length ||
      JSON.stringify(merged) !== JSON.stringify(remoteRows)
    ) {
      needsRemoteHeal = true;
    }
  }

  return { workspace: out, needsRemoteHeal };
}

export function shouldRecoverFromLocalCache(
  remote: Record<DataTableName, unknown[]>,
  local: Record<DataTableName, unknown[]>,
): boolean {
  const tablesToCompare: DataTableName[] = [
    'topics',
    'sessions',
    'weeklyPlans',
    'questionLogs',
    'errorNotes',
    'reviews',
    'mockExams',
    'timer',
  ];
  for (const table of tablesToCompare) {
    if ((local[table]?.length ?? 0) > (remote[table]?.length ?? 0)) {
      return true;
    }
  }
  const localSettings = (local.settings?.[0] ?? null) as Partial<Settings> | null;
  const remoteSettings = (remote.settings?.[0] ?? null) as Partial<Settings> | null;
  if (localSettings?.scheduleStartDate && !remoteSettings?.scheduleStartDate) {
    return true;
  }
  return false;
}

let inFlightEnsureSeed: Promise<void> | null = null;

/**
 * Sincroniza o estado em memória com o banco de dados do usuário autenticado (quando houver token)
 * e garante que as oito disciplinas e as configurações existam.
 */
export async function ensureSeed(database: AppDatabase = db): Promise<void> {
  if (database === db) {
    if (inFlightEnsureSeed) return inFlightEnsureSeed;
    inFlightEnsureSeed = runEnsureSeed(database).finally(() => {
      inFlightEnsureSeed = null;
    });
    return inFlightEnsureSeed;
  }
  return runEnsureSeed(database);
}

/**
 * Garante as 8 disciplinas padrão, configurações mescladas e alinhamento de semanas
 * localmente sem consultar ou sobrescrever a partir do servidor remoto.
 */
export async function ensureLocalDefaults(database: AppDatabase = db): Promise<void> {
  await database.transaction(
    'rw',
    database.disciplines,
    database.settings,
    database.weeklyPlans,
    database.sessions,
    async () => {
      const existingList = await database.disciplines.toArray();
      const existing = new Set(existingList.map((d) => d.id));
      const missing = DEFAULT_DISCIPLINES.filter((d) => !existing.has(d.id));
      if (missing.length > 0) await database.disciplines.bulkAdd(missing);

      const oldPalette = [
        '#2563eb',
        '#7c3aed',
        '#0d9488',
        '#c2410c',
        '#be123c',
        '#4d7c0f',
        '#a16207',
        '#0369a1',
      ];
      for (const def of DEFAULT_DISCIPLINES) {
        const current = existingList.find((d) => d.id === def.id);
        if (current && oldPalette.includes(current.color) && current.color !== def.color) {
          await database.disciplines.update(current.id, { color: def.color });
        }
      }

      const settings = await database.settings.get(SETTINGS_ID);
      if (!settings) {
        await database.settings.add({
          ...DEFAULT_SETTINGS,
          distribution: { ...DEFAULT_SETTINGS.distribution },
        });
      } else {
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...settings,
          distribution: { ...DEFAULT_SETTINGS.distribution, ...settings.distribution },
        };
        if (JSON.stringify(merged) !== JSON.stringify(settings)) {
          await database.settings.put(merged);
        }
      }

      const plans = await database.weeklyPlans.toArray();
      if (plans.length > 0 && plans.some((p) => weekdayIndex(p.weekStart) !== 0)) {
        plans.sort((a, b) => a.weekIndex - b.weekIndex);
        const newFirstStart = startOfWeek(plans[0].weekStart);
        const allSessions = await database.sessions.toArray();
        for (const plan of plans) {
          const newStart = addDays(newFirstStart, (plan.weekIndex - 1) * 7);
          const newEnd = addDays(newStart, 6);
          const weekSessions = allSessions.filter((s) => s.date >= newStart && s.date <= newEnd);
          const weekPlanned = weekSessions.reduce((sum, s) => sum + s.plannedMinutes, 0);
          await database.weeklyPlans.update(plan.id, {
            weekStart: newStart,
            plannedMinutes: weekPlanned || plan.plannedMinutes,
          });
        }
      }
    },
  );
}

async function runEnsureSeed(database: AppDatabase): Promise<void> {
  const token = getAuthToken();
  const isRealAuthenticatedDb =
    database === db && Boolean(token) && token !== TEST_BYPASS_TOKEN;
  let needsRemoteHeal = false;

  if (database === db && token) {
    await waitForPendingSync();
    const localEnvelope = loadLocalWorkspaceCacheEnvelope();
    if (localEnvelope) {
      database.setSyncMetadata(
        localEnvelope.explicitlyClearedTables,
        localEnvelope.deletedIds,
      );
    }
    try {
      const remoteWorkspace = await fetchUserWorkspaceFromApi();
      if (remoteWorkspace) {
        if (localEnvelope) {
          const reconciled = reconcileWorkspaces(remoteWorkspace, localEnvelope);
          database.hydrateFromWorkspace(reconciled.workspace);
          needsRemoteHeal = reconciled.needsRemoteHeal || hasUnsyncedChanges();
        } else {
          database.hydrateFromWorkspace(remoteWorkspace);
        }
      } else if (localEnvelope) {
        database.hydrateFromWorkspace(localEnvelope.data);
      }
    } catch (err) {
      if (localEnvelope) {
        database.hydrateFromWorkspace(localEnvelope.data);
      }
      console.error('Erro ao carregar dados do servidor:', err);
    }
  }

  // Em produção/conta autenticada, se a lista de tópicos estiver vazia e não tiver sido
  // explicitamente excluída pelo usuário, semeia os 148 tópicos oficiais do Edital Verticalizado BNB 2022.
  if (
    isRealAuthenticatedDb &&
    database.topics.toArraySync().length === 0 &&
    !database.isTableExplicitlyCleared('topics')
  ) {
    database.topics.replaceAllSilent(DEFAULT_TOPICS);
    needsRemoteHeal = true;
  }

  await ensureLocalDefaults(database);

  if (isRealAuthenticatedDb) {
    database.persistLocalWorkspaceCache();
    if (needsRemoteHeal || hasUnsyncedChanges()) {
      await replaceUserWorkspaceInApi(database.exportWorkspaceSnapshot());
    }
  }
  await waitForPendingSync();
}

/** Apaga todos os dados do usuário e recria o estado inicial. */
export async function resetDatabase(database: AppDatabase = db): Promise<void> {
  await database.transaction(
    'rw',
    DATA_TABLES.map((t) => database.table(t)),
    async () => {
      for (const t of DATA_TABLES) await database.table(t).clear();
    },
  );
  await ensureLocalDefaults(database);
  if (database === db) {
    database.persistLocalWorkspaceCache();
    await replaceUserWorkspaceInApi(database.exportWorkspaceSnapshot());
    await waitForPendingSync();
  }
}
