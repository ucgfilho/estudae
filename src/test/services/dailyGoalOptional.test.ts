import { describe, expect, it } from 'vitest';
import { dailyProgress, progressFraming } from '../../domain/motivation';
import { nextCycleActivity } from '../../domain/schedule';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS } from '../../db/seed';
import { validateSettingsPatch } from '../../services/settings';

describe('meta diária de tempo opcional', () => {
  it('aceita zero e rejeita valores fora do intervalo', () => {
    expect(validateSettingsPatch({ dailyGoalMinutes: 0 })).toBeNull();
    expect(validateSettingsPatch({ dailyGoalMinutes: -1 })).not.toBeNull();
    expect(validateSettingsPatch({ dailyGoalMinutes: 1441 })).not.toBeNull();
  });

  it('mantém o tempo estudado e remove percentual/meta quando a meta é zero', () => {
    const progress = dailyProgress([], [], { dailyGoalMinutes: 0, dailyQuestionGoal: null }, '2026-11-17');
    expect(progress.goalMinutes).toBe(0);
    expect(progress.ratio).toBe(0);
    expect(progressFraming(34, 0)).toBe('34 min estudados hoje.');
  });

  it('usa duração padrão do ciclo quando não há meta diária', () => {
    const activity = nextCycleActivity({ disciplines: DEFAULT_DISCIPLINES, topics: [], sessions: [],
      questionLogs: [], errorNotes: [], settings: { ...DEFAULT_SETTINGS, dailyGoalMinutes: 0 } });
    expect(activity?.minutes).toBe(60);
  });
});

describe('meta semanal de tempo opcional', () => {
  it('aceita zero e rejeita valores semanais negativos ou acima do limite', () => {
    expect(validateSettingsPatch({ weeklyGoalMinutes: 0 })).toBeNull();
    expect(validateSettingsPatch({ weeklyGoalMinutes: -1 })).not.toBeNull();
    expect(validateSettingsPatch({ weeklyGoalMinutes: 10081 })).not.toBeNull();
  });
});
