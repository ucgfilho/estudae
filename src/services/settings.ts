import { db, ensureSeed } from '../db/db';
import { SETTINGS_ID, type Settings } from '../db/types';
import { DEFAULT_SETTINGS } from '../db/seed';
import { isValidDateKey } from '../lib/dates';
import { ValidationError } from './sessions';

export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.get(SETTINGS_ID);
  if (settings) return settings;
  await ensureSeed();
  return (await db.settings.get(SETTINGS_ID)) ?? { ...DEFAULT_SETTINGS };
}

export function validateSettingsPatch(patch: Partial<Settings>): string | null {
  const intIn = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (patch.dailyGoalMinutes !== undefined && !intIn(patch.dailyGoalMinutes, 0, 1440)) return 'A meta diária deve ser um inteiro entre 0 e 1440 minutos.';
  if (patch.weeklyGoalMinutes !== undefined && !intIn(patch.weeklyGoalMinutes, 0, 10080)) return 'A meta semanal deve ser um inteiro entre 0 e 10080 minutos.';
  if (patch.dailyQuestionGoal !== undefined && patch.dailyQuestionGoal !== null && !intIn(patch.dailyQuestionGoal, 1, 10000)) return 'A meta diária de questões deve ser um inteiro entre 1 e 10000.';
  if (patch.accuracyGoal !== undefined && !intIn(patch.accuracyGoal, 1, 100)) return 'A meta de acerto deve ser um inteiro entre 1 e 100.';
  if (patch.topicCompletionGoal !== undefined && patch.topicCompletionGoal !== null && !intIn(patch.topicCompletionGoal, 1, 100)) return 'A meta de conclusão de tópicos deve ser um inteiro entre 1 e 100.';
  if (patch.examDate !== undefined && patch.examDate !== null && !isValidDateKey(patch.examDate)) return 'Informe uma data de prova válida.';
  if (patch.reviewIntervals !== undefined && (patch.reviewIntervals.length === 0 || !patch.reviewIntervals.every((n) => intIn(n, 1, 365)))) return 'Intervalos de revisão inválidos.';
  if (patch.distribution !== undefined && !Object.values(patch.distribution).every((n) => intIn(n, 0, 10080))) return 'A distribuição deve conter minutos inteiros não negativos.';
  return null;
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const error = validateSettingsPatch(patch);
  if (error) throw new ValidationError(error);
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, theme: 'light', id: SETTINGS_ID });
}
