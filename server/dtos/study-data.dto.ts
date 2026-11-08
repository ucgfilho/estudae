import { z } from 'zod';
import {
  DATA_TABLES,
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
import { isValidDateKey, isValidTime } from '../../src/lib/dates';
import { DtoValidationError } from '../errors/AppError';

const dateKey = z.string().refine(isValidDateKey, 'Data inválida (esperado AAAA-MM-DD).');
const nullableDateKey = dateKey.nullable();
const nonNegInt = z.number().int().nonnegative();
const iso = z.string().min(1);

export const disciplineDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  order: z.number().int(),
  kind: z.enum(['technical', 'general']),
});

export const topicDtoSchema = z.object({
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

export const sessionDtoSchema = z.object({
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
  isManual: z.boolean().optional(),
  order: z.number().int().optional(),
  history: z.array(
    z.object({
      at: iso,
      type: z.enum(['criada', 'reagendada', 'status', 'executada', 'recuperada', 'editada']),
      description: z.string(),
    }),
  ),
  createdAt: iso,
  updatedAt: iso,
});

export const timerDtoSchema = z.object({
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

export const questionLogDtoSchema = z.object({
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
});

export const errorNoteDtoSchema = z.object({
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

export const reviewTaskDtoSchema = z.object({
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

export const weeklyPlanDtoSchema = z.object({
  id: z.string().min(1),
  weekIndex: z.number().int().positive(),
  weekStart: dateKey,
  objectives: z.string(),
  plannedContent: z.string(),
  plannedMinutes: nonNegInt,
  status: z.enum(['pendente', 'em-andamento', 'concluida']),
  notes: z.string(),
});

export const settingsDtoSchema = z.object({
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
  contestId: z.string().optional(),
  contestName: z.string().optional(),
  contestRole: z.string().optional(),
  editalFileName: z.string().nullable().optional(),
});

const questionNumberKey = z.string().regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/, 'Chave de questão inválida (esperado 1..500).');
const answerKeyValueSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'X']);
const markedResponseValueSchema = z.enum(['A', 'B', 'C', 'D', 'E']);

export const mockExamDtoSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(500),
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

export const studyWorkspaceDtoSchema = z.object({
  disciplines: z.array(disciplineDtoSchema),
  topics: z.array(topicDtoSchema),
  sessions: z.array(sessionDtoSchema),
  timer: z.array(timerDtoSchema),
  questionLogs: z.array(questionLogDtoSchema),
  errorNotes: z.array(errorNoteDtoSchema),
  reviews: z.array(reviewTaskDtoSchema),
  weeklyPlans: z.array(weeklyPlanDtoSchema),
  settings: z.array(settingsDtoSchema).max(1),
  mockExams: z.array(mockExamDtoSchema).default([]),
});

export interface StudyWorkspaceDto {
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
}

export const tableNameSchema = z.enum(DATA_TABLES);

export const tableMutationOperationSchema = z.discriminatedUnion('action', [
  z.object({
    table: tableNameSchema,
    action: z.literal('upsert'),
    records: z.array(z.unknown()),
  }),
  z.object({
    table: tableNameSchema,
    action: z.literal('delete'),
    ids: z.array(z.string().min(1)),
  }),
  z.object({
    table: tableNameSchema,
    action: z.literal('clear'),
  }),
]);

export type TableMutationOperationDto = z.infer<typeof tableMutationOperationSchema>;

export const batchTransactionRequestSchema = z.object({
  operations: z.array(tableMutationOperationSchema),
});

export type BatchTransactionRequestDto = z.infer<typeof batchTransactionRequestSchema>;

export const singleTableMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert'),
    records: z.array(z.unknown()),
  }),
  z.object({
    action: z.literal('delete'),
    ids: z.array(z.string().min(1)),
  }),
  z.object({
    action: z.literal('clear'),
  }),
]);

export type SingleTableMutationDto = z.infer<typeof singleTableMutationSchema>;

const TABLE_ITEM_SCHEMAS: Record<DataTableName, z.ZodTypeAny> = {
  disciplines: disciplineDtoSchema,
  topics: topicDtoSchema,
  sessions: sessionDtoSchema,
  timer: timerDtoSchema,
  questionLogs: questionLogDtoSchema,
  errorNotes: errorNoteDtoSchema,
  reviews: reviewTaskDtoSchema,
  weeklyPlans: weeklyPlanDtoSchema,
  settings: settingsDtoSchema,
  mockExams: mockExamDtoSchema,
};

export function validateTableRecords(table: DataTableName, records: readonly unknown[]): unknown[] {
  const itemSchema = TABLE_ITEM_SCHEMAS[table];
  return records.map((rec, idx) => {
    const parsed = itemSchema.safeParse(rec);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new DtoValidationError(`Registro inválido em ${table}[${idx}]: ${msg}`);
    }
    return parsed.data;
  });
}

export function parseStudyWorkspaceDto(raw: unknown): StudyWorkspaceDto {
  const result = studyWorkspaceDtoSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.slice(0, 8).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new DtoValidationError(details[0] ?? 'Workspace de estudos inválido.', details);
  }
  return result.data as StudyWorkspaceDto;
}

export function parseBatchRequestDto(raw: unknown): BatchTransactionRequestDto {
  const result = batchTransactionRequestSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new DtoValidationError(details[0] ?? 'Operação em lote inválida.', details);
  }
  return result.data;
}

export function parseSingleTableMutationDto(raw: unknown): SingleTableMutationDto {
  const result = singleTableMutationSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new DtoValidationError(details[0] ?? 'Operação de tabela inválida.', details);
  }
  return result.data;
}
