import type { ClientSession, Db } from 'mongodb';
import { CONTEST_LIMIT_MESSAGE, MAX_USER_CONTESTS } from '../../src/domain/contestLimit';
import { canReuseCompletion, findReusableCompletions, type ContestSyllabus } from '../../src/domain/topicCompletion';
import { mergeWorkspaceTopics } from '../../src/domain/duplicateTopics';
import { recordTopicProgress, topicProgress } from '../../src/domain/metrics';
import { toDateKey } from '../../src/lib/dates';
import { ConflictError, NotFoundError } from '../errors/AppError';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS } from '../../src/db/seed';
import {
  SETTINGS_ID,
  summarizeContestWorkspace,
  type ContestWorkspaceSummary,
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
} from '../../src/db/types';
import {
  validateTableRecords,
  type StudyWorkspaceDto,
  type TableMutationOperationDto,
} from '../dtos/study-data.dto';
import type { ISensitiveDataCipher } from '../interfaces/ISensitiveDataCipher';
import type { IStudyDataRepository } from '../interfaces/IStudyDataRepository';
import {
  applyWorkspacesCollectionValidator,
  assertWorkspaceDocumentOwnership,
  buildWorkspaceCascadeDeleteFilter,
  buildWorkspaceRlsFilter,
  parseTenantScope,
} from '../security/MongoRlsGuard';

export interface UserWorkspaceDocument {
  _id: string; // scopedId (ownerId ou `${ownerId}::contest::${scopeId}`)
  ownerId: string; // RLS tenant owner ID imutável
  scopeId: string; // 'default' ou ID do concurso
  encryptedPayload: string; // AES-256-GCM AAD vinculado ao ownerId contendo o StudyWorkspaceDto
  rlsVersion: number;
  updatedAt: string;
}

interface LegacyWorkspaceDocument extends Partial<UserWorkspaceDocument> {
  _id: string;
  disciplines?: Discipline[];
  topics?: Topic[];
  sessions?: StudySession[];
  timer?: TimerState[];
  questionLogs?: QuestionLog[];
  errorNotes?: ErrorNote[];
  reviews?: ReviewTask[];
  weeklyPlans?: WeeklyPlan[];
  settings?: Settings[];
  mockExams?: MockExam[];
}

function removeLegacyCredentials(settings: Settings): Settings {
  const clean = { ...settings } as Settings & { geminiApiKey?: string; aiProvider?: string };
  delete clean.geminiApiKey;
  delete clean.aiProvider;
  return clean;
}

function buildDefaultWorkspaceDto(): StudyWorkspaceDto {
  return {
    disciplines: [...DEFAULT_DISCIPLINES],
    topics: [],
    sessions: [],
    timer: [],
    questionLogs: [],
    errorNotes: [],
    reviews: [],
    weeklyPlans: [],
    settings: [{ ...DEFAULT_SETTINGS, distribution: { ...DEFAULT_SETTINGS.distribution } }],
    mockExams: [],
  };
}

/**
 * Repositório de Dados de Estudo baseado em MongoDB com Row-Level Security (RLS) e Zero Dados Explícitos:
 * - Cada documento exige `_id`, `ownerId` (chave de isolamento de titular) e `scopeId`.
 * - Nenhuma tabela de estudo (`disciplines`, `topics`, `sessions`, `settings`, etc.) fica explícita no banco:
 *   todo o documento de workspace é cifrado em repouso (`encryptedPayload`) com AES-256-GCM e AAD vinculado ao `ownerId`.
 * - Os workspaces são criptografados com chave autenticada vinculada ao `ownerId`.
 * - Exclusão em cascata via `ownerId` remove todos os escopos de concursos do titular (LGPD Art. 18, VI).
 */
export class MongoStudyDataRepository implements IStudyDataRepository {
  private readonly db: Db;
  private readonly cipher: ISensitiveDataCipher;

  constructor(db: Db, cipher: ISensitiveDataCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  private collection() {
    return this.db.collection<UserWorkspaceDocument>('user_workspaces');
  }

  public async initIndexes(): Promise<void> {
    await this.migrateLegacyDocuments();

    await this.collection().createIndex(
      { ownerId: 1, _id: 1 },
      { name: 'idx_workspaces_rls_owner_scope' },
    );

    await applyWorkspacesCollectionValidator(this.db);
  }

  /**
   * Migra de forma idempotente documentos legados que possuam arrays de estudo explícitos
   * para o envelope criptografado `encryptedPayload` vinculado ao `ownerId` via RLS,
   * removendo (`$unset`) todos os campos em texto explícito do MongoDB.
   */
  public async migrateLegacyDocuments(): Promise<void> {
    const existingCols = await this.db
      .listCollections({ name: 'user_workspaces' }, { nameOnly: true })
      .toArray();
    if (existingCols.length === 0) return;

    const rawCol = this.db.collection<LegacyWorkspaceDocument>('user_workspaces');
    const docs = await rawCol.find({}).toArray();
    const now = new Date().toISOString();

    for (const raw of docs) {
      const hasExplicitArrays =
        raw.disciplines !== undefined ||
        raw.topics !== undefined ||
        raw.sessions !== undefined ||
        raw.timer !== undefined ||
        raw.questionLogs !== undefined ||
        raw.errorNotes !== undefined ||
        raw.reviews !== undefined ||
        raw.weeklyPlans !== undefined ||
        raw.settings !== undefined ||
        raw.mockExams !== undefined;

      const needsMigration =
        hasExplicitArrays ||
        !raw.ownerId ||
        !raw.scopeId ||
        !raw.encryptedPayload ||
        !raw.rlsVersion;

      if (!needsMigration) continue;

      const ctx = parseTenantScope(raw._id);

      let workspace: StudyWorkspaceDto;
      if (raw.encryptedPayload) {
        workspace = this.decryptAndDeserializeWorkspace(ctx.ownerId, raw.encryptedPayload);
      } else {
        const decryptedSettings: Settings[] = (raw.settings ?? []).map((settings) => ({
          ...removeLegacyCredentials(settings), id: SETTINGS_ID, theme: 'light',
        }));

        workspace = {
          disciplines:
            raw.disciplines && raw.disciplines.length > 0
              ? raw.disciplines
              : [...DEFAULT_DISCIPLINES],
          topics: raw.topics || [],
          sessions: raw.sessions || [],
          timer: raw.timer || [],
          questionLogs: raw.questionLogs || [],
          errorNotes: raw.errorNotes || [],
          reviews: raw.reviews || [],
          weeklyPlans: raw.weeklyPlans || [],
          settings:
            decryptedSettings.length > 0
              ? decryptedSettings
              : [{ ...DEFAULT_SETTINGS, distribution: { ...DEFAULT_SETTINGS.distribution } }],
          mockExams: raw.mockExams || [],
        };
      }

      const encryptedPayload = this.serializeAndEncryptWorkspace(ctx.ownerId, workspace);

      await rawCol.updateOne(
        { _id: ctx.scopedId },
        {
          $set: {
            ownerId: ctx.ownerId,
            scopeId: ctx.scopeId,
            encryptedPayload,
            rlsVersion: 1,
            updatedAt: raw.updatedAt || now,
          },
          $unset: {
            disciplines: '',
            topics: '',
            sessions: '',
            timer: '',
            questionLogs: '',
            errorNotes: '',
            reviews: '',
            weeklyPlans: '',
            settings: '',
            mockExams: '',
          },
        },
      );
    }
  }

  private serializeAndEncryptWorkspace(ownerId: string, workspace: StudyWorkspaceDto): string {
    const encryptedSettings: Settings[] = (workspace.settings ?? []).map((settings) => ({
      ...removeLegacyCredentials(settings), id: SETTINGS_ID,
    }));

    const normalized: StudyWorkspaceDto = {
      disciplines: workspace.disciplines || [],
      topics: workspace.topics || [],
      sessions: workspace.sessions || [],
      timer: workspace.timer || [],
      questionLogs: workspace.questionLogs || [],
      errorNotes: workspace.errorNotes || [],
      reviews: workspace.reviews || [],
      weeklyPlans: workspace.weeklyPlans || [],
      settings: encryptedSettings,
      mockExams: workspace.mockExams || [],
    };

    return this.cipher.encryptForTenant(ownerId, JSON.stringify(normalized));
  }

  private decryptAndDeserializeWorkspace(
    ownerId: string,
    encryptedPayload: string,
  ): StudyWorkspaceDto {
    const decryptedJson = this.cipher.decryptForTenant(ownerId, encryptedPayload);
    const parsed = JSON.parse(decryptedJson) as Partial<StudyWorkspaceDto>;

    const settings: Settings[] = (parsed.settings ?? []).map((settings) => ({
      ...removeLegacyCredentials(settings), id: SETTINGS_ID, theme: 'light',
    }));

    return {
      disciplines: parsed.disciplines || [],
      topics: parsed.topics || [],
      sessions: parsed.sessions || [],
      timer: parsed.timer || [],
      questionLogs: parsed.questionLogs || [],
      errorNotes: parsed.errorNotes || [],
      reviews: parsed.reviews || [],
      weeklyPlans: parsed.weeklyPlans || [],
      settings,
      mockExams: parsed.mockExams || [],
    };
  }

  public async ensureUserSeed(userId: string): Promise<void> {
    const ctx = parseTenantScope(userId);
    const rlsFilter = buildWorkspaceRlsFilter(userId);
    const existing = await this.collection().findOne(rlsFilter);

    if (!existing) {
      const initialWorkspace = buildDefaultWorkspaceDto();
      const doc: UserWorkspaceDocument = {
        _id: ctx.scopedId,
        ownerId: ctx.ownerId,
        scopeId: ctx.scopeId,
        encryptedPayload: this.serializeAndEncryptWorkspace(ctx.ownerId, initialWorkspace),
        rlsVersion: 1,
        updatedAt: new Date().toISOString(),
      };
      await this.collection().updateOne(rlsFilter, { $setOnInsert: doc }, { upsert: true });
      return;
    }

    assertWorkspaceDocumentOwnership(existing, userId);
    const workspace = this.decryptAndDeserializeWorkspace(ctx.ownerId, existing.encryptedPayload);

    const encryptedSettingsJson = this.cipher.decryptForTenant(ctx.ownerId, existing.encryptedPayload);
    let needsUpdate = encryptedSettingsJson.includes('"geminiApiKey"') || encryptedSettingsJson.includes('"aiProvider"');
    if (!workspace.disciplines || workspace.disciplines.length === 0) {
      workspace.disciplines = [...DEFAULT_DISCIPLINES];
      needsUpdate = true;
    }
    if (!workspace.settings || workspace.settings.length === 0) {
      workspace.settings = [
        { ...DEFAULT_SETTINGS, distribution: { ...DEFAULT_SETTINGS.distribution } },
      ];
      needsUpdate = true;
    }

    if (needsUpdate) {
      await this.collection().updateOne({ ...rlsFilter, encryptedPayload: existing.encryptedPayload }, {
        $set: {
          encryptedPayload: this.serializeAndEncryptWorkspace(ctx.ownerId, workspace),
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }

  public async getWorkspace(userId: string): Promise<StudyWorkspaceDto> {
    await this.ensureUserSeed(userId);
    const filter = buildWorkspaceRlsFilter(userId);
    for (let attempt = 0; attempt < 10; attempt++) {
      const doc = await this.collection().findOne(filter);
      if (!doc) return buildDefaultWorkspaceDto();

      const { ownerId } = assertWorkspaceDocumentOwnership(doc, userId);
      const stored = this.decryptAndDeserializeWorkspace(ownerId, doc.encryptedPayload);
      const workspace = mergeWorkspaceTopics(stored);
      const now = new Date().toISOString();
      const completedTopics = await this.reuseTopicCompletions(workspace, doc._id, ownerId, now);
      const settings = workspace.settings[0];
      const history = settings?.topicProgressHistory;
      const recorded = settings && !settings.contestHidden
        ? recordTopicProgress(history, topicProgress(completedTopics), toDateKey(now))
        : history;
      if (workspace === stored && completedTopics === workspace.topics && recorded === history) return workspace;
      workspace.topics = completedTopics;
      if (settings && recorded !== history) settings.topicProgressHistory = recorded;
      const result = await this.collection().updateOne(
        { ...filter, encryptedPayload: doc.encryptedPayload },
        { $set: { encryptedPayload: this.serializeAndEncryptWorkspace(ownerId, workspace), updatedAt: now } },
      );
      if (result.matchedCount === 1) return workspace;
    }
    throw new ConflictError('Dados alterados em outro dispositivo. Tente novamente.');
  }

  private async reuseTopicCompletions(workspace: StudyWorkspaceDto, scopedId: string, ownerId: string, now: string): Promise<Topic[]> {
    if (workspace.settings[0]?.contestHidden || !workspace.topics.some(canReuseCompletion)) return workspace.topics;

    const sources: ContestSyllabus[] = [];
    for await (const source of this.collection().find({ ownerId })) {
      if (source._id === scopedId) continue;
      assertWorkspaceDocumentOwnership(source, source._id);
      const syllabus = this.decryptAndDeserializeWorkspace(ownerId, source.encryptedPayload);
      if (!syllabus.settings[0]?.contestHidden) sources.push(syllabus);
    }
    const matches = new Set(findReusableCompletions(workspace, sources).map(({ id }) => id));
    if (matches.size === 0) return workspace.topics;
    return workspace.topics.map((topic) =>
      matches.has(topic.id) ? { ...topic, status: 'concluido', updatedAt: now } : topic,
    );
  }

  public async isContestActive(userId: string): Promise<boolean> {
    const doc = await this.collection().findOne(buildWorkspaceRlsFilter(userId));
    if (!doc) return false;
    const { ownerId } = assertWorkspaceDocumentOwnership(doc, userId);
    const workspace = this.decryptAndDeserializeWorkspace(ownerId, doc.encryptedPayload);
    return !workspace.settings[0]?.contestHidden;
  }

  public async listContestWorkspaces(userId: string, session?: ClientSession): Promise<ContestWorkspaceSummary[]> {
    const { ownerId } = parseTenantScope(userId);
    const summaries: ContestWorkspaceSummary[] = [];
    for await (const doc of this.collection().find({ ownerId }, { session })) {
      const { scopeId } = assertWorkspaceDocumentOwnership(doc, doc._id);
      const workspace = this.decryptAndDeserializeWorkspace(ownerId, doc.encryptedPayload);
      const summary = summarizeContestWorkspace(
        scopeId, workspace.settings[0], workspace.disciplines.length, workspace.topics.length,
      );
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  public async replaceWorkspace(
    userId: string,
    workspace: StudyWorkspaceDto,
  ): Promise<StudyWorkspaceDto> {
    const ctx = parseTenantScope(userId);
    const rlsFilter = buildWorkspaceRlsFilter(userId);

    const normalized = mergeWorkspaceTopics({
      disciplines:
        workspace.disciplines && workspace.disciplines.length > 0
          ? workspace.disciplines
          : [...DEFAULT_DISCIPLINES],
      topics: workspace.topics || [],
      sessions: workspace.sessions || [],
      timer: workspace.timer || [],
      questionLogs: workspace.questionLogs || [],
      errorNotes: workspace.errorNotes || [],
      reviews: workspace.reviews || [],
      weeklyPlans: workspace.weeklyPlans || [],
      settings:
        workspace.settings && workspace.settings.length > 0
          ? workspace.settings
          : [{ ...DEFAULT_SETTINGS, distribution: { ...DEFAULT_SETTINGS.distribution } }],
      mockExams: workspace.mockExams || [],
    });

    const doc: UserWorkspaceDocument = {
      _id: ctx.scopedId,
      ownerId: ctx.ownerId,
      scopeId: ctx.scopeId,
      encryptedPayload: this.serializeAndEncryptWorkspace(ctx.ownerId, normalized),
      rlsVersion: 1,
      updatedAt: new Date().toISOString(),
    };

    const existing = await this.collection().findOne(rlsFilter);
    if (existing) {
      assertWorkspaceDocumentOwnership(existing, userId);
      const current = this.decryptAndDeserializeWorkspace(ctx.ownerId, existing.encryptedPayload);
      if (current.settings[0]?.contestHidden) throw new NotFoundError('Concurso não encontrado.');
      const result = await this.collection().updateOne(
        { ...rlsFilter, encryptedPayload: existing.encryptedPayload },
        { $set: doc },
      );
      if (result.matchedCount === 0) throw new ConflictError('Dados alterados em outro dispositivo. Tente novamente.');
    } else if (ctx.scopeId === 'default') {
      await this.collection().insertOne(doc);
    } else {
      await this.insertContestWithinLimit(doc);
    }

    return this.getWorkspace(userId);
  }

  private async insertContestWithinLimit(doc: UserWorkspaceDocument): Promise<void> {
    const { ownerId } = doc;
    const ownerFilter = buildWorkspaceRlsFilter(ownerId);
    await this.db.client.withSession((session) => session.withTransaction(async () => {
      const root = await this.collection().findOne(ownerFilter, { session });
      if (!root) throw new NotFoundError('Conta sem espaço de estudos.');

      // A escrita no espaço raiz serializa criações simultâneas da mesma conta.
      const plaintext = this.cipher.decryptForTenant(ownerId, root.encryptedPayload);
      await this.collection().updateOne(ownerFilter, {
        $set: { encryptedPayload: this.cipher.encryptForTenant(ownerId, plaintext) },
      }, { session });

      const contests = await this.listContestWorkspaces(ownerId, session);
      if (contests.length >= MAX_USER_CONTESTS) throw new ConflictError(CONTEST_LIMIT_MESSAGE);
      await this.collection().insertOne(doc, { session });
    }));
  }

  public async resetWorkspace(userId: string): Promise<StudyWorkspaceDto> {
    return this.replaceWorkspace(userId, buildDefaultWorkspaceDto());
  }

  public async deleteUserWorkspace(userId: string): Promise<void> {
    const cascadeFilter = buildWorkspaceCascadeDeleteFilter(userId);
    await this.collection().deleteMany(cascadeFilter);
  }

  public async applyBatch(
    userId: string,
    operations: readonly TableMutationOperationDto[],
  ): Promise<void> {
    await this.ensureUserSeed(userId);
    for (let attempt = 0; attempt < 10; attempt++) {
      const filter = buildWorkspaceRlsFilter(userId);
      const doc = await this.collection().findOne(filter);
      if (!doc) throw new ConflictError('Workspace indisponível. Tente novamente.');
      const ctx = assertWorkspaceDocumentOwnership(doc, userId);
      const workspace = this.decryptAndDeserializeWorkspace(ctx.ownerId, doc.encryptedPayload);

      if (workspace.settings[0]?.contestHidden) throw new NotFoundError('Concurso não encontrado.');
      const history = workspace.settings[0]?.topicProgressHistory;

      for (const op of operations) {
        if (op.action === 'patch') {
          workspace.settings = [{ ...(workspace.settings[0] ?? DEFAULT_SETTINGS), ...op.changes }];
        } else if (op.action === 'clear') {
          (workspace[op.table] as unknown[]) = [];
        } else if (op.action === 'delete') {
          const idSet = new Set(op.ids);
          (workspace[op.table] as unknown[]) = (workspace[op.table] as { id: string }[]).filter(
            (item) => !idSet.has(item.id),
          );
        } else if (op.action === 'upsert') {
          const validated = validateTableRecords(op.table, op.records) as { id: string }[];
          const currentList = [...(workspace[op.table] as { id: string }[])];
          const indexMap = new Map(currentList.map((item, idx) => [item.id, idx]));

          for (const item of validated) {
            if (indexMap.has(item.id)) {
              const idx = indexMap.get(item.id)!;
              currentList[idx] = op.table === 'settings' ? { ...currentList[idx], ...item } : item;
            } else {
              currentList.push(item);
              indexMap.set(item.id, currentList.length - 1);
            }
          }
          (workspace[op.table] as unknown[]) = currentList;
        }
      }

      const now = new Date().toISOString();
      const settings = workspace.settings[0];
      if (settings) {
        settings.topicProgressHistory = operations.some((op) => op.table === 'topics')
          ? recordTopicProgress(history, topicProgress(workspace.topics), toDateKey(now))
          : history;
      }
      const result = await this.collection().updateOne(
        { ...filter, encryptedPayload: doc.encryptedPayload },
        { $set: {
          encryptedPayload: this.serializeAndEncryptWorkspace(ctx.ownerId, workspace),
          updatedAt: now,
        } },
      );
      if (result.matchedCount === 1) return;
    }
    throw new ConflictError('Dados alterados em outro dispositivo. Tente novamente.');
  }

  public async upsertTable(
    userId: string,
    table: DataTableName,
    records: readonly unknown[],
  ): Promise<void> {
    await this.applyBatch(userId, [
      { action: 'upsert', table, records: records as Record<string, unknown>[] },
    ]);
  }

  public async deleteFromTable(
    userId: string,
    table: DataTableName,
    ids: readonly string[],
  ): Promise<void> {
    await this.applyBatch(userId, [{ action: 'delete', table, ids: [...ids] }]);
  }

  public async clearTable(userId: string, table: DataTableName): Promise<void> {
    await this.applyBatch(userId, [{ action: 'clear', table }]);
  }
}
