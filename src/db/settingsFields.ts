import { z } from 'zod';
import { isValidDateKey } from '../lib/dates';

export const workspacePreferenceFields = {
  celebrationsEnabled: z.boolean().optional(),
  reportTimeGranularity: z.enum(['day', 'week', 'month']).optional(),
  reportPeriodDays: z.enum(['30', '60', '90', 'all']).optional(),
  flashcardDraft: z.object({
    date: z.string().refine(isValidDateKey),
    progress: z.string().max(500_000),
  }).optional(),
  contestExamBoard: z.string().optional(),
  contestCreatedAt: z.string().optional(),
  contestHidden: z.boolean().optional(),
};
