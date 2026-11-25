import { z } from 'zod';
import { isValidDateKey } from '../lib/dates';

export const topicProgressSnapshotSchema = z.object({
  date: z.string().refine(isValidDateKey),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  source: z.literal('backup').optional(),
}).refine(({ total, completed, inProgress }) => completed + inProgress <= total);

export const workspacePreferenceFields = {
  celebrationsEnabled: z.boolean().optional(),
  reportTimeGranularity: z.enum(['day', 'week', 'month']).optional(),
  reportPeriodDays: z.enum(['30', '60', '90', 'all']).optional(),
  topicProgressHistory: z.array(topicProgressSnapshotSchema).optional(),
  flashcardDraft: z.object({
    date: z.string().refine(isValidDateKey),
    progress: z.string().max(500_000),
  }).optional(),
  skippedCycleActivities: z.array(z.object({
    position: z.number().int().positive(),
    disciplineId: z.string().min(1),
    topicId: z.string().nullable(),
  })).optional(),
  contestExamBoard: z.string().optional(),
  contestCreatedAt: z.string().optional(),
  contestHidden: z.boolean().optional(),
};
