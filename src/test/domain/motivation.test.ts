import { describe, it, expect } from 'vitest';
import {
  dailyProgress,
  detectAchievements,
  evaluateQuestionLog,
  formatAchievementMessage,
  primaryAchievement,
  progressFraming,
  snapshot,
} from '../../domain/motivation';
import type { QuestionLog, StudySession } from '../../db/types';

const TODAY = '2026-10-21';
const settings = { dailyGoalMinutes: 60, dailyQuestionGoal: 20 };

function session(id: string, over: Partial<StudySession> = {}): StudySession {
  return {
    id,
    date: TODAY,
    disciplineId: 'banco-dados',
    topicId: null,
    plannedStart: null,
    plannedMinutes: 30,
    actualSeconds: 0,
    status: 'planejada',
    objective: '',
    notes: '',
    origin: 'planejada',
    startedAt: null,
    endedAt: null,
    recoveredFromId: null,
    history: [],
    createdAt: '2026-10-21T10:00:00Z',
    updatedAt: '2026-10-21T10:00:00Z',
    ...over,
  };
}

function done(s: StudySession, minutes: number): StudySession {
  return { ...s, status: 'concluida', actualSeconds: minutes * 60, startedAt: '2026-10-21T13:00:00Z' };
}

function log(id: string, correct: number, incorrect: number, over: Partial<QuestionLog> = {}): QuestionLog {
  return {
    id,
    date: TODAY,
    disciplineId: 'banco-dados',
    topicId: null,
    source: '',
    total: correct + incorrect,
    correct,
    incorrect,
    blank: 0,
    durationMinutes: null,
    notes: '',
    sessionId: null,
    createdAt: '2026-10-21T10:00:00Z',
    updatedAt: '2026-10-21T10:00:00Z',
    ...over,
  };
}

describe('domain/motivation - daily progress', () => {
  it('summarises time, scheduled blocks and questions for today', () => {
    const sessions = [done(session('a'), 30), session('b'), session('c', { origin: 'avulsa', status: 'concluida', actualSeconds: 600, startedAt: '2026-10-21T15:00:00Z' })];
    const p = dailyProgress(sessions, [log('l1', 8, 2)], settings, TODAY);
    expect(p.studiedMinutes).toBe(40);
    expect(p.ratio).toBeCloseTo(40 / 60);
    expect(p.scheduled.map((s) => s.id)).toEqual(['a', 'b']); // avulsa não entra no cronograma
    expect(p.scheduledDone).toBe(1);
    expect(p.questionsToday).toBe(10);
  });

  it('frames progress by accumulated work early and by remaining work late (Koo & Fishbach)', () => {
    expect(progressFraming(0, 120)).toMatch(/primeiro bloco/i);
    expect(progressFraming(30, 120)).toMatch(/já estudou 30 min/);
    expect(progressFraming(80, 120)).toMatch(/Faltam 40 min/);
    expect(progressFraming(110, 120)).toMatch(/Faltam 10 min/);
    expect(progressFraming(130, 120)).toMatch(/cumprida/);
  });
});

describe('domain/motivation - achievement detection', () => {
  it('detects session completion, daily goal and full schedule in the same transition', () => {
    const before = [done(session('a'), 40), session('b')];
    const after = [done(session('a'), 40), done(session('b'), 25)];
    const prev = snapshot(before, [], settings, TODAY);
    const next = snapshot(after, [], settings, TODAY);
    const found = detectAchievements(prev, next, after, [], 80);
    expect(found.map((a) => a.kind).sort()).toEqual(['daily-goal', 'schedule-complete', 'session-complete']);
    expect(primaryAchievement(found)?.kind).toBe('schedule-complete');
  });

  it('does not celebrate on unrelated edits', () => {
    const s = [done(session('a'), 70)];
    const prev = snapshot(s, [], settings, TODAY);
    const next = snapshot([{ ...s[0], notes: 'editado' }], [], settings, TODAY);
    expect(detectAchievements(prev, next, s, [], 80)).toEqual([]);
  });

  it('ignores bulk changes such as backup restores', () => {
    const prev = snapshot([], [], settings, TODAY);
    const logs = [log('1', 9, 1), log('2', 9, 1), log('3', 9, 1), log('4', 9, 1)];
    const next = snapshot([], logs, settings, TODAY);
    expect(detectAchievements(prev, next, [], logs, 80)).toEqual([]);
  });

  it('detects daily question goal crossing', () => {
    const old = [log('1', 10, 5)];
    const all = [...old, log('2', 3, 2)];
    const found = detectAchievements(snapshot([], old, settings, TODAY), snapshot([], all, settings, TODAY), [], all, 80);
    expect(found.some((a) => a.kind === 'question-goal')).toBe(true);
  });
});

describe('domain/motivation - question evaluation', () => {
  it('celebrates a perfect battery as a big achievement', () => {
    const [a] = evaluateQuestionLog(log('n', 10, 0), [], 80);
    expect(a).toMatchObject({ kind: 'questions-perfect', tier: 'big' });
  });

  it('detects a personal best within the discipline', () => {
    const history = [log('h1', 6, 4), log('h2', 7, 3)];
    const kinds = evaluateQuestionLog(log('n', 9, 1), history, 80).map((a) => a.kind);
    expect(kinds).toContain('personal-best');
    expect(kinds).toContain('questions-great');
  });

  it('gives informational (not celebratory) feedback below the goal', () => {
    const [a] = evaluateQuestionLog(log('n', 4, 6), [], 80);
    expect(a).toMatchObject({ kind: 'questions-logged', tier: 'info' });
  });

  it('ignores logs without graded questions', () => {
    expect(evaluateQuestionLog(log('n', 0, 0, { blank: 5, total: 5 }), [], 80)).toEqual([]);
  });
});

describe('domain/motivation - deterministic messages', () => {
  it('generates consistent messages for session-complete', () => {
    const msg = formatAchievementMessage('session-complete', '+30 min', 'Banco de Dados');
    expect(msg.title).toBe('Sessão concluída em Banco de Dados');
    expect(msg.body).toBe('+30 min registrados no seu histórico.');
  });

  it('generates consistent messages for daily-goal', () => {
    const msg = formatAchievementMessage('daily-goal');
    expect(msg.title).toBe('Meta diária cumprida');
    expect(msg.body).toBe('Você atingiu o tempo de estudo planejado para hoje.');
  });

  it('generates consistent messages for schedule-complete', () => {
    const msg = formatAchievementMessage('schedule-complete');
    expect(msg.title).toBe('Cronograma do dia completo');
    expect(msg.body).toBe('Todos os blocos planejados para hoje foram executados.');
  });

  it('generates consistent messages for question-goal', () => {
    const msg = formatAchievementMessage('question-goal');
    expect(msg.title).toBe('Meta de questões atingida');
    expect(msg.body).toBe('Volume diário de questões cumprido. É assim que se fixa o conteúdo.');
  });

  it('generates consistent messages for questions-great', () => {
    const msg = formatAchievementMessage('questions-great', '8/10 acertos (80%)', 'Direito Administrativo');
    expect(msg.title).toBe('Ótimo desempenho em Direito Administrativo');
    expect(msg.body).toBe('Você acertou 8/10 (80%). Acima da sua meta de acerto.');
  });

  it('generates consistent messages for questions-perfect', () => {
    const msg = formatAchievementMessage('questions-perfect', '10/10 acertos (100%)', 'Português');
    expect(msg.title).toBe('Gabaritou em Português');
    expect(msg.body).toBe('Você acertou 10/10 (100%). Excelente domínio do conteúdo.');
  });

  it('generates consistent messages for personal-best', () => {
    const msg = formatAchievementMessage('personal-best', 'Recorde na disciplina: 85% (antes 75%)', 'Informática');
    expect(msg.title).toBe('Novo recorde pessoal em Informática');
    expect(msg.body).toBe('Recorde na disciplina: 85% (antes 75%)');
  });

  it('generates consistent messages for streak-milestone', () => {
    const msg = formatAchievementMessage('streak-milestone', '7 dias seguidos');
    expect(msg.title).toBe('7 dias seguidos de estudo');
    expect(msg.body).toBe('Sua constância constrói resultados sólidos. Continue avançando!');
  });

  it('generates consistent messages for questions-logged', () => {
    const msg = formatAchievementMessage('questions-logged', '6/10 acertos (60%)', 'Matemática');
    expect(msg.title).toBe('Questões registradas em Matemática');
    expect(msg.body).toBe('Você acertou 6/10 (60%). Cada erro mapeado vira revisão no Caderno de Erros.');
  });
});
