import type { Db } from 'mongodb';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS } from '../../src/db/seed';
import {
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
} from '../../src/db/types';
import {
  validateTableRecords,
  type StudyWorkspaceDto,
  type TableMutationOperationDto,
} from '../dtos/study-data.dto';
import type { ISensitiveDataCipher } from '../interfaces/ISensitiveDataCipher';
import type { IStudyDataRepository } from '../interfaces/IStudyDataRepository';

interface UserWorkspaceDocument {
  _id: string; // userId
  disciplines: Discipline[];
  topics: Topic[];
  sessions: StudySession[];
  timer: TimerState[];
  questionLogs: QuestionLog[];
  errorNotes: ErrorNote[];
  reviews: ReviewTask[];
  weeklyPlans: WeeklyPlan[];
  settings: Settings[];
  mockExams: MockExam[];
  updatedAt: string;
}

/**
 * Repositório de Dados de Estudo baseado em MongoDB (Document Model).
 * Segue rigorosamente a skill mongodb-schema-design:
 * - "Data that is accessed together should be stored together": O workspace completo de um usuário
 *   é armazenado como um documento de agregação vinculado ao `_id: userId`.
 * - Leituras e escritas são atômicas em uma única viagem de rede (RTT).
 * - Criptografia em repouso com AES-256-GCM para chaves de API / dados sensíveis (LGPD).
 */
export class MongoStudyDataRepository implements IStudyDataRepository {
  private readonly db: Db;
  private readonly cipher?: ISensitiveDataCipher;

  constructor(db: Db, cipher?: ISensitiveDataCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  private collection() {
    return this.db.collection<UserWorkspaceDocument>('user_workspaces');
  }

  public async initIndexes(): Promise<void> {
    // _id já é indexado por padrão pelo MongoDB
  }

  public async ensureUserSeed(userId: string): Promise<void> {
    const existing = await this.collection().findOne({ _id: userId }, { projection: { _id: 1, disciplines: 1, settings: 1 } });
    if (!existing) {
      const initial: UserWorkspaceDocument = {
        _id: userId,
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
        updatedAt: new Date().toISOString(),
      };
      await this.collection().insertOne(initial);
      return;
    }

    // Se já existe mas falta disciplinas ou settings, inicializa
    const updates: Partial<UserWorkspaceDocument> = {};
    if (!existing.disciplines || existing.disciplines.length === 0) {
      updates.disciplines = [...DEFAULT_DISCIPLINES];
    }
    if (!existing.settings || existing.settings.length === 0) {
      updates.settings = [{ ...DEFAULT_SETTINGS, distribution: { ...DEFAULT_SETTINGS.distribution } }];
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await this.collection().updateOne({ _id: userId }, { $set: updates });
    }
  }

  public async getWorkspace(userId: string): Promise<StudyWorkspaceDto> {
    await this.ensureUserSeed(userId);
    const doc = await this.collection().findOne({ _id: userId });
    if (!doc) {
      return {
        disciplines: [...DEFAULT_DISCIPLINES],
        topics: [],
        sessions: [],
        timer: [],
        questionLogs: [],
        errorNotes: [],
        reviews: [],
        weeklyPlans: [],
        settings: [{ ...DEFAULT_SETTINGS }],
        mockExams: [],
      };
    }

    // Decripta chaves se necessário e garante id normalizado
    const settings: Settings[] = (doc.settings || []).map((s) => {
      let key = s.geminiApiKey ?? '';
      if (key && this.cipher) {
        try {
          key = this.cipher.decrypt(key);
        } catch {
          // mantém caso não esteja criptografado
        }
      }
      return { ...s, id: SETTINGS_ID as 'settings', geminiApiKey: key };
    });

    return {
      disciplines: doc.disciplines || [],
      topics: doc.topics || [],
      sessions: doc.sessions || [],
      timer: doc.timer || [],
      questionLogs: doc.questionLogs || [],
      errorNotes: doc.errorNotes || [],
      reviews: doc.reviews || [],
      weeklyPlans: doc.weeklyPlans || [],
      settings,
      mockExams: doc.mockExams || [],
    };
  }

  public async replaceWorkspace(
    userId: string,
    workspace: StudyWorkspaceDto,
  ): Promise<StudyWorkspaceDto> {
    const encryptedSettings: Settings[] = (workspace.settings || []).map((s) => ({
      ...s,
      id: SETTINGS_ID as 'settings',
      geminiApiKey: this.cipher && s.geminiApiKey ? this.cipher.encrypt(s.geminiApiKey) : (s.geminiApiKey ?? ''),
    }));

    const doc: UserWorkspaceDocument = {
      _id: userId,
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
      updatedAt: new Date().toISOString(),
    };

    await this.collection().updateOne(
      { _id: userId },
      { $set: doc },
      { upsert: true }
    );

    return this.getWorkspace(userId);
  }

  public async resetWorkspace(userId: string): Promise<StudyWorkspaceDto> {
    const fresh: UserWorkspaceDocument = {
      _id: userId,
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
      updatedAt: new Date().toISOString(),
    };

    await this.collection().updateOne(
      { _id: userId },
      { $set: fresh },
      { upsert: true }
    );

    return this.getWorkspace(userId);
  }

  public async deleteUserWorkspace(userId: string): Promise<void> {
    await this.collection().deleteOne({ _id: userId });
  }

  public async applyBatch(
    userId: string,
    operations: readonly TableMutationOperationDto[],
  ): Promise<void> {
    const workspace = await this.getWorkspace(userId);

    for (const op of operations) {
      if (op.action === 'clear') {
        (workspace[op.table] as unknown[]) = [];
      } else if (op.action === 'delete') {
        const idSet = new Set(op.ids);
        (workspace[op.table] as unknown[]) = (workspace[op.table] as { id: string }[]).filter(
          (item) => !idSet.has(item.id)
        );
      } else if (op.action === 'upsert') {
        const validated = validateTableRecords(op.table, op.records) as { id: string }[];
        const currentList = [...(workspace[op.table] as { id: string }[])];
        const indexMap = new Map(currentList.map((item, idx) => [item.id, idx]));

        for (const item of validated) {
          if (indexMap.has(item.id)) {
            const idx = indexMap.get(item.id)!;
            currentList[idx] = item;
          } else {
            currentList.push(item);
            indexMap.set(item.id, currentList.length - 1);
          }
        }
        (workspace[op.table] as unknown[]) = currentList;
      }
    }

    await this.replaceWorkspace(userId, workspace);
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
