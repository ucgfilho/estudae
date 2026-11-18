import {
  fetchUserWorkspaceFromApi,
  getAuthSession,
  getActiveContestScopeId,
  getLocalSessionId,
  getWorkspaceCacheKey,
  hasUnsyncedChanges,
  replaceUserWorkspaceInApi,
  retryPendingMutations,
  syncBatchMutationsToApi,
  TEST_LOCAL_SESSION_ID,
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
        void syncBatchMutationsToApi([mutation]);
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

  public applyLocalSettings(settings: Settings): void {
    this.settings.replaceAllSilent([settings]);
    this.versionCounter++;
    this.persistLocalWorkspaceCache();
    this.notifyListeners();
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
    const sessionId = getLocalSessionId();
    const session = getAuthSession();
    if (
      !sessionId ||
      sessionId === TEST_LOCAL_SESSION_ID ||
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
      const key = getWorkspaceCacheKey(session.user.email);
      window.localStorage.setItem(
        key,
        JSON.stringify({
          schemaRevision: 3,
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
        const records = rows as { id: string }[];
        this.table(tableName).replaceAllSilent(tableName === 'settings'
          ? records.map(row => ({ ...row, theme: 'light' }))
          : records);
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
        const records = rows as { id: string }[];
        this.table(tableName).replaceAllSilent(tableName === 'settings'
          ? records.map(row => ({ ...row, theme: 'light' }))
          : records);
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
        void syncBatchMutationsToApi(batch);
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
  const sessionId = getLocalSessionId();
  const session = getAuthSession();
  if (
    !sessionId ||
    sessionId === TEST_LOCAL_SESSION_ID ||
    !session?.user?.email ||
    typeof window === 'undefined' ||
    !window.localStorage
  ) {
    return null;
  }
  try {
    const key = getWorkspaceCacheKey(session.user.email);
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
  // A cache is only a fallback for offline reads. Pending writes are replayed separately.
  void localEnvelope;
  return { workspace: structuredClone(remote), needsRemoteHeal: false };
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
  return false;
}

const inFlightEnsureSeed = new Map<string, Promise<void>>();

/** Carrega o banco da conta/concurso atual e aplica os padrões locais. */
export async function ensureSeed(database: AppDatabase = db): Promise<void> {
  if (database !== db) return runEnsureSeed(database);
  const key = `${getLocalSessionId() ?? ''}:${getActiveContestScopeId()}`;
  const pending = inFlightEnsureSeed.get(key);
  if (pending) return pending;
  const run = runEnsureSeed(database).finally(() => inFlightEnsureSeed.delete(key));
  inFlightEnsureSeed.set(key, run);
  return run;
}

/**
 * Garante as 8 disciplinas padrão, configurações mescladas e alinhamento de semanas
 * localmente sem consultar ou sobrescrever a partir do servidor remoto.
 */
export async function ensureLocalDefaults(database: AppDatabase = db): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.disciplines,
      database.settings,
      database.weeklyPlans,
      database.sessions,
      database.reviews,
      database.errorNotes,
    ],
    async () => {
      const existingList = await database.disciplines.toArray();
      const settings = await database.settings.get(SETTINGS_ID);
      const isCustomContest =
        Boolean(settings?.contestId && settings.contestId !== 'bnb-ti') ||
        (existingList.length > 0 && !existingList.some((d) => d.id === 'arquitetura'));

      if (!isCustomContest) {
        const existing = new Set(existingList.map((d) => d.id));
        const missing = DEFAULT_DISCIPLINES.filter((d) => !existing.has(d.id));
        if (missing.length > 0) await database.disciplines.bulkAdd(missing);
      } else if (existingList.length === 0) {
        await database.disciplines.bulkAdd(DEFAULT_DISCIPLINES);
      }

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

      if (!settings) {
        await database.settings.add({
          ...DEFAULT_SETTINGS,
          distribution: { ...DEFAULT_SETTINGS.distribution },
        });
      } else {
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...settings,
          theme: 'light',
          distribution: isCustomContest
            ? { ...settings.distribution }
            : { ...DEFAULT_SETTINGS.distribution, ...settings.distribution },
        };
        if (JSON.stringify(merged) !== JSON.stringify(settings)) {
          database.applyLocalSettings(merged);
        }
      }

      // Remove revisões futuras duplicadas do intervalo (mantendo apenas a atual)
      // e sincroniza datas entre Caderno de Erros e Revisões.
      const allReviews = await database.reviews.toArray();
      const allNotes = await database.errorNotes.toArray();
      if (allReviews.length > 0 || allNotes.length > 0) {
        const idsToDelete = new Set<string>();
        const reviewsToPut = new Map<string, ReviewTask>();
        const notesToPut = new Map<string, ErrorNote>();

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

        const activePendingByNote = new Map<string, ReviewTask>();
        for (const group of pendingGroups.values()) {
          group.sort(
            (a, b) =>
              a.intervalDays - b.intervalDays ||
              a.dueDate.localeCompare(b.dueDate) ||
              a.createdAt.localeCompare(b.createdAt),
          );
          const keeper = group[0];
          if (keeper.errorNoteId) {
            activePendingByNote.set(keeper.errorNoteId, keeper);
          }
          for (let i = 1; i < group.length; i++) {
            idsToDelete.add(group[i].id);
          }
        }

        for (const note of allNotes) {
          const activePending = activePendingByNote.get(note.id);
          if (note.status === 'dominado') {
            if (activePending) idsToDelete.add(activePending.id);
            if (note.nextReviewDate !== null) {
              notesToPut.set(note.id, { ...note, nextReviewDate: null });
            }
            continue;
          }
          if (activePending) {
            const expectedDueDate = note.nextReviewDate ?? activePending.dueDate;
            if (
              activePending.dueDate !== expectedDueDate ||
              activePending.disciplineId !== note.disciplineId ||
              activePending.topicId !== note.topicId
            ) {
              reviewsToPut.set(activePending.id, {
                ...activePending,
                dueDate: expectedDueDate,
                disciplineId: note.disciplineId,
                topicId: note.topicId,
              });
            }
            if (note.nextReviewDate !== expectedDueDate) {
              notesToPut.set(note.id, { ...note, nextReviewDate: expectedDueDate });
            }
          }
        }

        if (idsToDelete.size > 0) {
          await database.reviews.bulkDelete([...idsToDelete]);
        }
        if (reviewsToPut.size > 0) {
          await database.reviews.bulkPut([...reviewsToPut.values()]);
        }
        if (notesToPut.size > 0) {
          await database.errorNotes.bulkPut([...notesToPut.values()]);
        }
      }
    },
  );
}

async function runEnsureSeed(database: AppDatabase): Promise<void> {
  const sessionId = getLocalSessionId();
  const scope = getActiveContestScopeId();
  const isRealAuthenticatedDb =
    database === db && Boolean(sessionId) && sessionId !== TEST_LOCAL_SESSION_ID;

  if (database === db && sessionId) {
    await waitForPendingSync();
    const localEnvelope = loadLocalWorkspaceCacheEnvelope();
    if (localEnvelope) {
      database.setSyncMetadata(
        localEnvelope.explicitlyClearedTables,
        localEnvelope.deletedIds,
      );
    }
    try {
      await retryPendingMutations();
      const version = database.getSnapshotVersion();
      const remoteWorkspace = await fetchUserWorkspaceFromApi();
      if (sessionId !== getLocalSessionId() || scope !== getActiveContestScopeId()) return;
      // An edit made while the GET was in flight must not be replaced by its stale response.
      if (database.getSnapshotVersion() !== version) return runEnsureSeed(database);
      if (remoteWorkspace) {
        if (localEnvelope && (localEnvelope.schemaRevision ?? 0) < 3) {
          const completed = (localEnvelope.data.reviews ?? []) as ReviewTask[];
          const remoteReviews = remoteWorkspace.reviews as ReviewTask[];
          const recovered = completed.filter((review) => review.status === 'concluida' &&
            remoteReviews.some((remote) => remote.id === review.id && remote.status === 'pendente'));
          if (recovered.length > 0) {
            const noteIds = new Set(recovered.map((review) => review.errorNoteId).filter(Boolean));
            const relatedReviews = completed.filter((review) => noteIds.has(review.errorNoteId) &&
              !remoteReviews.some((remote) => remote.id === review.id));
            const notes = (localEnvelope.data.errorNotes as ErrorNote[]).filter((note) => noteIds.has(note.id));
            await syncBatchMutationsToApi([
              { table: 'reviews', action: 'upsert', records: [...recovered, ...relatedReviews] },
              { table: 'errorNotes', action: 'upsert', records: notes },
            ]);
            if (!hasUnsyncedChanges()) {
              remoteWorkspace.reviews = remoteReviews.map((review) =>
                recovered.find((local) => local.id === review.id) ?? review).concat(relatedReviews);
              remoteWorkspace.errorNotes = (remoteWorkspace.errorNotes as ErrorNote[]).map((note) =>
                notes.find((local) => local.id === note.id) ?? note);
            }
          }
        }
        if (!hasUnsyncedChanges()) database.setSyncMetadata();
        if (localEnvelope) {
          const reconciled = hasUnsyncedChanges()
            ? { workspace: localEnvelope.data, needsRemoteHeal: false }
            : reconcileWorkspaces(remoteWorkspace, localEnvelope);
          database.hydrateFromWorkspace(reconciled.workspace);
        } else {
          database.hydrateFromWorkspace(remoteWorkspace);
        }
      } else if (localEnvelope) {
        database.hydrateFromWorkspace(localEnvelope.data);
      }
    } catch (err) {
      if (sessionId !== getLocalSessionId() || scope !== getActiveContestScopeId()) return;
      if (localEnvelope) {
        database.hydrateFromWorkspace(localEnvelope.data);
      }
      console.error('Erro ao carregar dados do servidor:', err);
    }
  }

  // Em produção/conta autenticada, se a lista de tópicos estiver vazia, não tiver sido
  // explicitamente excluída pelo usuário e o concurso for o padrão BNB, semeia os 148 tópicos oficiais.
  const currentDiscs = database.disciplines.toArraySync();
  const currentSettings = database.settings.toArraySync()[0] as Settings | undefined;
  const isDefaultBnbContest =
    (!currentSettings?.contestId || currentSettings.contestId === 'bnb-ti') &&
    (currentDiscs.length === 0 || currentDiscs.some((d) => d.id === 'arquitetura'));

  if (
    isRealAuthenticatedDb &&
    isDefaultBnbContest &&
    database.topics.toArraySync().length === 0 &&
    !database.isTableExplicitlyCleared('topics')
  ) {
    await database.topics.bulkPut(DEFAULT_TOPICS);
  }

  await ensureLocalDefaults(database);

  if (isRealAuthenticatedDb) {
    database.persistLocalWorkspaceCache();
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
