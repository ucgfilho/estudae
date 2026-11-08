/**
 * Backup e restauração em JSON, com validação de estrutura (zod) e
 * estratégia de migração por `schemaVersion`.
 */
import { z } from 'zod';
import {
  DATA_TABLES,
  db,
  ensureLocalDefaults,
  SCHEMA_VERSION,
  type DataTableName,
} from '../db/db';
import { isValidDateKey, isValidTime } from '../lib/dates';
import { replaceUserWorkspaceInApi, waitForPendingSync } from './auth';

export type { DataTableName };

export const BACKUP_APP_ID = 'bnb-estudos';

const dateKey = z.string().refine(isValidDateKey, 'Data inválida (esperado AAAA-MM-DD).');
const nullableDateKey = dateKey.nullable();
const nonNegInt = z.number().int().nonnegative();
const iso = z.string().min(1);

const disciplineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  order: z.number().int(),
  kind: z.enum(['technical', 'general']),
});

const topicSchema = z.object({
  id: z.string().min(1),
  disciplineId: z.string().min(1),
  title: z.string().min(1),
  parentTopicId: z.string().nullable(),
  status: z.enum(['nao-iniciado', 'em-andamento', 'concluido', 'dominado']),
  notes: z.string(),
  order: z.number().int(),
  active: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});

const sessionSchema = z.object({
  id: z.string().min(1),
  date: dateKey,
  disciplineId: z.string().min(1),
  topicId: z.string().nullable(),
  plannedStart: z.string().refine(isValidTime, 'Horário inválido.').nullable(),
  plannedMinutes: z.number().int().positive(),
  actualSeconds: nonNegInt,
  status: z.enum(['planejada', 'concluida', 'perdida']),
  objective: z.string(),
  notes: z.string(),
  origin: z.enum(['planejada', 'avulsa']),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  recoveredFromId: z.string().nullable(),
  history: z.array(
    z.object({
      at: iso,
      type: z.enum(['criada', 'reagendada', 'status', 'executada', 'recuperada', 'editada']),
      description: z.string(),
    }),
  ),
  createdAt: iso,
  updatedAt: iso,
  isManual: z.boolean().optional(),
  order: z.number().int().optional(),
});

const timerSchema = z.object({
  id: z.literal('active'),
  sessionId: z.string().nullable(),
  status: z.enum(['running', 'paused']),
  startedAt: z.number().nullable(),
  firstStartedAt: z.number(),
  accumulatedSeconds: z.number().nonnegative(),
  plannedSeconds: nonNegInt,
  disciplineId: z.string().min(1),
  topicId: z.string().nullable(),
  objective: z.string(),
  notes: z.string(),
  updatedAt: z.number(),
});

const questionLogSchema = z
  .object({
    id: z.string().min(1),
    date: dateKey,
    disciplineId: z.string().min(1),
    topicId: z.string().nullable(),
    source: z.string(),
    total: nonNegInt,
    correct: nonNegInt,
    incorrect: nonNegInt,
    blank: nonNegInt,
    durationMinutes: nonNegInt.nullable(),
    notes: z.string(),
    sessionId: z.string().nullable(),
    createdAt: iso,
    updatedAt: iso,
  })
  .refine((l) => l.correct + l.incorrect + l.blank <= l.total, 'Acertos, erros e em branco excedem o total.');

const errorNoteSchema = z.object({
  id: z.string().min(1),
  questionLogId: z.string().nullable(),
  disciplineId: z.string().min(1),
  topicId: z.string().nullable(),
  sourceReference: z.string(),
  errorType: z.enum(['falta-conteudo', 'interpretacao', 'desatencao', 'confusao-alternativas', 'outro']),
  explanation: z.string(),
  errorDate: dateKey,
  status: z.enum(['revisar', 'revisado', 'dominado']),
  nextReviewDate: nullableDateKey,
  createdAt: iso,
  updatedAt: iso,
});

const reviewSchema = z.object({
  id: z.string().min(1),
  disciplineId: z.string().min(1),
  topicId: z.string().nullable(),
  errorNoteId: z.string().nullable(),
  title: z.string(),
  dueDate: dateKey,
  intervalDays: nonNegInt,
  status: z.enum(['pendente', 'concluida']),
  completedAt: z.string().nullable(),
  createdAt: iso,
});

const weeklyPlanSchema = z.object({
  id: z.string().min(1),
  weekIndex: z.number().int().positive(),
  weekStart: dateKey,
  objectives: z.string(),
  plannedContent: z.string(),
  plannedMinutes: nonNegInt,
  status: z.enum(['pendente', 'em-andamento', 'concluida']),
  notes: z.string(),
});

const settingsSchema = z.object({
  id: z.literal('settings'),
  dailyGoalMinutes: z.number().int().positive(),
  weeklyGoalMinutes: z.number().int().positive(),
  dailyQuestionGoal: z.number().int().positive().nullable(),
  accuracyGoal: z.number().int().min(1).max(100),
  topicCompletionGoal: z.number().int().min(1).max(100).nullable(),
  reviewIntervals: z.array(z.number().int().min(1).max(365)).min(1),
  theme: z.enum(['light', 'dark', 'system']),
  examDate: nullableDateKey,
  scheduleStartDate: nullableDateKey,
  scheduleWeeks: z.number().int().positive(),
  distribution: z.record(z.string(), nonNegInt),
  geminiApiKey: z.string().optional(),
  aiProvider: z.enum(['builtin', 'gemini']).optional(),
});

const questionNumberKey = z.string().regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/);
const answerKeyValueSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'X']);
const markedResponseValueSchema = z.enum(['A', 'B', 'C', 'D', 'E']);

const mockExamSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(500),
  date: dateKey.optional(),
  sessionId: z.string().max(128).nullable().optional(),
  examFileName: z.string().max(500).nullable(),
  keyFileName: z.string().max(500).nullable(),
  questionCount: z.number().int().min(0).max(500),
  optionCount: z.number().int().min(2).max(5),
  answerKey: z.record(questionNumberKey, answerKeyValueSchema),
  ranges: z
    .array(
      z.object({
        from: z.number().int().min(1).max(500),
        to: z.number().int().min(1).max(500),
        disciplineId: z.string().min(1).max(128),
      }),
    )
    .max(100),
  responses: z.record(questionNumberKey, markedResponseValueSchema.nullable()),
  submittedAt: z.string().max(64).nullable(),
  createdAt: iso,
  updatedAt: iso,
});

const dataSchema = z.object({
  disciplines: z.array(disciplineSchema),
  topics: z.array(topicSchema),
  sessions: z.array(sessionSchema),
  timer: z.array(timerSchema),
  questionLogs: z.array(questionLogSchema),
  errorNotes: z.array(errorNoteSchema),
  reviews: z.array(reviewSchema),
  weeklyPlans: z.array(weeklyPlanSchema),
  settings: z.array(settingsSchema).max(1),
  // Ausente em backups da versão 1.
  mockExams: z.array(mockExamSchema).default([]),
});

const backupSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  data: dataSchema,
});

export type BackupFile = z.infer<typeof backupSchema>;
export type BackupData = BackupFile['data'];

export async function createBackup(): Promise<BackupFile> {
  const entries = await db.transaction('r', DATA_TABLES.map((t) => db.table(t)), async () =>
    Promise.all(DATA_TABLES.map(async (t) => [t, await db.table(t).toArray()] as const)),
  );
  const data = Object.fromEntries(entries) as BackupData;
  if (Array.isArray(data.settings)) {
    data.settings = data.settings.map((s) => {
      const sanitized = { ...(s as Record<string, unknown>) };
      delete sanitized.geminiApiKey;
      return sanitized as BackupData['settings'][number];
    });
  }
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Migra backups de versões anteriores para o formato atual.
 * Versão 2 é a atual (adiciona `mockExams`, opcional em backups v1); novas versões devem adicionar transformações aqui.
 */
export function migrateBackup(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const file = raw as { schemaVersion?: unknown };
  if (typeof file.schemaVersion === 'number' && file.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Este backup foi criado por uma versão mais recente do aplicativo (schema ${file.schemaVersion}).`);
  }
  return raw;
}

export type BackupValidation = { ok: true; backup: BackupFile; counts: Record<DataTableName, number> } | { ok: false; errors: string[] };

export function validateBackup(text: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['O arquivo não é um JSON válido.'] };
  }
  try {
    parsed = migrateBackup(parsed);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.slice(0, 8).map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    if (result.error.issues.length > 8) errors.push(`… e mais ${result.error.issues.length - 8} problema(s).`);
    return { ok: false, errors };
  }
  const data = result.data.data;
  const counts = Object.fromEntries(DATA_TABLES.map((t) => [t, data[t].length])) as Record<DataTableName, number>;
  return { ok: true, backup: result.data, counts };
}

/** Substitui todos os dados pelo conteúdo do backup (em uma única transação). */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await waitForPendingSync();
  const previousSettings = await db.settings.get('settings');
  const restoredData: Record<DataTableName, unknown[]> = {
    ...backup.data,
    settings: backup.data.settings.map((s) => ({
      ...s,
      geminiApiKey: s.geminiApiKey ?? previousSettings?.geminiApiKey,
      aiProvider: s.aiProvider ?? previousSettings?.aiProvider,
    })),
  };

  db.replaceAllFromBackup(restoredData);
  await ensureLocalDefaults(db);
  db.persistLocalWorkspaceCache();
  await replaceUserWorkspaceInApi(db.exportWorkspaceSnapshot());
  await waitForPendingSync();
}

/* ------------------------- Exportação em CSV ------------------------- */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV com separador ";" (padrão de planilhas em pt-BR). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '\uFEFF' + [headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
