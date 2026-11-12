/**
 * Motivação e reforço positivo baseados em evidências.
 *
 * Fundamentos aplicados (resumo — ver ux-writing.md, seção SCIENTIFIC_RESEARCH):
 * - Self-Determination Theory (Bureau et al., 2022; Wang et al., 2024): autonomia,
 *   competência e relacionamento como necessidades psicológicas básicas que, quando
 *   apoiadas, geram motivação autônoma, persistência e bem-estar acadêmico.
 * - Feedback informativo (Wisniewski et al., 2020): feedback orientado à tarefa,
 *   que identifica erros e orienta melhoria, é mais eficaz que feedback controlador
 *   ou genérico. Feedback deve reconhecer progresso real.
 * - Need Support vs. Thwarting (Howard et al., 2024): comportamentos que apoiam
 *   autonomia (escolha, racionalização), competência (estrutura, feedback) e
 *   relacionamento (cuidado, reconhecimento) predizem engajamento e desempenho.
 *   Comportamentos controladores, caóticos ou frios prejudicam essas necessidades.
 *
 * Princípios de UX Writing derivados (ver ux-writing.md, VERBAL_IDENTITY):
 * - Mensagens determinísticas e contextualizadas (não aleatórias).
 * - Feedback informacional baseado em dados reais do estudante.
 * - Reconhecimento de progresso concreto, não elogios vazios.
 * - Linguagem que apoia autonomia (não controladora).
 * - Tom adaptado ao contexto: conquistas, progresso, dificuldades, pendências, retorno, execução.
 */

import type { QuestionLog, Settings, StudySession } from '../db/types';
import { addDays, type DateKey } from '../lib/dates';
import { accuracy, plannedSessions, studiedMinutesInRange, studyStreak } from './metrics';

/* ------------------------------------------------------------------ */
/* Progresso do dia                                                    */
/* ------------------------------------------------------------------ */

export interface DailyProgress {
  studiedMinutes: number;
  goalMinutes: number;
  /** 0..n (pode ultrapassar 1). */
  ratio: number;
  /** Blocos do cronograma planejados para hoje (sem substituídos). */
  scheduled: StudySession[];
  scheduledDone: number;
  questionsToday: number;
  questionGoal: number | null;
}

export function dailyProgress(
  sessions: readonly StudySession[],
  logs: readonly QuestionLog[],
  settings: Pick<Settings, 'dailyGoalMinutes' | 'dailyQuestionGoal'> | undefined,
  today: DateKey,
): DailyProgress {
  const goalMinutes = settings?.dailyGoalMinutes ?? 120;
  const studiedMinutes = studiedMinutesInRange(sessions, today, today);
  const scheduled = plannedSessions(sessions)
    .filter((s) => s.date === today)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.plannedStart ?? '99:99').localeCompare(b.plannedStart ?? '99:99'));
  return {
    studiedMinutes,
    goalMinutes,
    ratio: goalMinutes > 0 ? studiedMinutes / goalMinutes : 0,
    scheduled,
    scheduledDone: scheduled.filter((s) => s.status === 'concluida').length,
    questionsToday: logs.filter((l) => l.date === today).reduce((sum, l) => sum + l.total, 0),
    questionGoal: settings?.dailyQuestionGoal ?? null,
  };
}

/**
 * Mensagem de progresso com enquadramento dinâmico (Koo & Fishbach, 2012):
 * abaixo de 50% destaca o acumulado; a partir de 50% destaca o que falta.
 * Retorna mensagem determinística baseada nos dados reais.
 */
export function progressFraming(studied: number, goal: number): string {
  const done = Math.round(studied);
  if (goal <= 0) return `${done} min estudados hoje.`;
  if (done >= goal) return 'Meta diária cumprida. Todo minuto extra agora é vantagem competitiva.';
  const remaining = Math.max(1, Math.round(goal - studied));
  if (done === 0) return 'O primeiro bloco é o mais difícil. Comece com 25 minutos.';
  if (studied / goal < 0.5) return `Você já estudou ${done} min hoje. Bom ritmo, continue.`;
  if (remaining <= 15) return `Faltam ${remaining} min para fechar a meta de hoje.`;
  return `Mais da metade feita. Faltam ${remaining} min para a meta.`;
}

/* ------------------------------------------------------------------ */
/* Conquistas (eventos de celebração)                                 */
/* ------------------------------------------------------------------ */

export type AchievementKind =
  | 'session-complete'
  | 'daily-goal'
  | 'schedule-complete'
  | 'question-goal'
  | 'questions-great'
  | 'questions-perfect'
  | 'personal-best'
  | 'streak-milestone'
  | 'questions-logged';

/** `big` = marco raro (mais ênfase); `small` = pequena vitória; `info` = feedback sem festa. */
export type AchievementTier = 'big' | 'small' | 'info';

export interface Achievement {
  kind: AchievementKind;
  tier: AchievementTier;
  /** Dado objetivo exibido como "chip" (feedback informacional). */
  detail?: string;
  disciplineId?: string;
}

const TIER_WEIGHT: Record<AchievementTier, number> = { big: 3, small: 2, info: 1 };
const KIND_PRIORITY: AchievementKind[] = [
  'schedule-complete',
  'personal-best',
  'questions-perfect',
  'daily-goal',
  'streak-milestone',
  'question-goal',
  'questions-great',
  'session-complete',
  'questions-logged',
];

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120] as const;

/** Mínimo de questões corrigidas para considerar um desempenho significativo. */
export const MIN_GRADED_FOR_CELEBRATION = 5;

/** Acima deste número de novidades simultâneas, trata-se de importação em massa. */
export const BULK_CHANGE_LIMIT = 3;

/** Instantâneo do estado relevante para detectar transições. */
export interface MotivationSnapshot {
  today: DateKey;
  dailyGoalReached: boolean;
  scheduleComplete: boolean;
  questionGoalReached: boolean;
  streak: number;
  completedSessionIds: Set<string>;
  logIds: Set<string>;
}

export function snapshot(
  sessions: readonly StudySession[],
  logs: readonly QuestionLog[],
  settings: Pick<Settings, 'dailyGoalMinutes' | 'dailyQuestionGoal'> | undefined,
  today: DateKey,
): MotivationSnapshot {
  const p = dailyProgress(sessions, logs, settings, today);
  return {
    today,
    dailyGoalReached: p.goalMinutes > 0 && p.studiedMinutes >= p.goalMinutes,
    scheduleComplete: p.scheduled.length > 0 && p.scheduledDone === p.scheduled.length,
    questionGoalReached: p.questionGoal !== null && p.questionGoal > 0 && p.questionsToday >= p.questionGoal,
    streak: studyStreak(sessions, today),
    completedSessionIds: new Set(sessions.filter((s) => s.status === 'concluida' && s.actualSeconds > 0).map((s) => s.id)),
    logIds: new Set(logs.map((l) => l.id)),
  };
}

/** Avalia um lançamento de questões recém-criado contra o histórico do próprio aluno. */
export function evaluateQuestionLog(log: QuestionLog, previousLogs: readonly QuestionLog[], accuracyGoal: number): Achievement[] {
  const graded = log.correct + log.incorrect;
  const acc = accuracy(log.correct, log.incorrect);
  const result: Achievement[] = [];
  if (acc === null) return result;
  const detail = `${log.correct}/${graded} acertos (${Math.round(acc)}%)`;

  if (graded < MIN_GRADED_FOR_CELEBRATION) {
    if (acc >= accuracyGoal) result.push({ kind: 'questions-great', tier: 'small', detail, disciplineId: log.disciplineId });
    else result.push({ kind: 'questions-logged', tier: 'info', detail, disciplineId: log.disciplineId });
    return result;
  }

  if (acc >= 100) result.push({ kind: 'questions-perfect', tier: 'big', detail, disciplineId: log.disciplineId });
  else if (acc >= accuracyGoal) result.push({ kind: 'questions-great', tier: 'small', detail, disciplineId: log.disciplineId });

  const history = previousLogs.filter(
    (l) => l.id !== log.id && l.disciplineId === log.disciplineId && l.correct + l.incorrect >= MIN_GRADED_FOR_CELEBRATION,
  );
  if (history.length > 0) {
    const best = Math.max(...history.map((l) => accuracy(l.correct, l.incorrect) ?? 0));
    if (acc > best && acc < 100) {
      result.push({ kind: 'personal-best', tier: 'big', detail: `Recorde na disciplina: ${Math.round(acc)}% (antes ${Math.round(best)}%)`, disciplineId: log.disciplineId });
    }
  }

  if (result.length === 0) result.push({ kind: 'questions-logged', tier: 'info', detail, disciplineId: log.disciplineId });
  return result;
}

/** Compara dois instantâneos e devolve as conquistas obtidas na transição. */
export function detectAchievements(
  prev: MotivationSnapshot,
  next: MotivationSnapshot,
  sessions: readonly StudySession[],
  logs: readonly QuestionLog[],
  accuracyGoal: number,
): Achievement[] {
  const found: Achievement[] = [];
  const sameDay = prev.today === next.today;

  const newlyCompleted = sessions.filter((s) => next.completedSessionIds.has(s.id) && !prev.completedSessionIds.has(s.id));
  const newLogs = logs.filter((l) => !prev.logIds.has(l.id));
  // Mudanças em massa (restauração de backup, importação) não são conquistas.
  if (newlyCompleted.length > BULK_CHANGE_LIMIT || newLogs.length > BULK_CHANGE_LIMIT) return found;

  for (const s of newlyCompleted) {
    found.push({ kind: 'session-complete', tier: 'small', detail: `+${Math.max(1, Math.round(s.actualSeconds / 60))} min`, disciplineId: s.disciplineId });
  }

  if (sameDay && !prev.dailyGoalReached && next.dailyGoalReached) found.push({ kind: 'daily-goal', tier: 'big' });
  if (sameDay && !prev.scheduleComplete && next.scheduleComplete) found.push({ kind: 'schedule-complete', tier: 'big' });
  if (sameDay && !prev.questionGoalReached && next.questionGoalReached) found.push({ kind: 'question-goal', tier: 'big' });

  if (next.streak > prev.streak) {
    const milestone = STREAK_MILESTONES.find((m) => prev.streak < m && next.streak >= m);
    if (milestone) found.push({ kind: 'streak-milestone', tier: 'big', detail: `${next.streak} dias seguidos` });
  }

  const previous = logs.filter((l) => prev.logIds.has(l.id));
  for (const log of newLogs) {
    found.push(...evaluateQuestionLog(log, previous, accuracyGoal));
  }

  return found;
}

/** Escolhe a conquista principal (maior nível e prioridade). */
export function primaryAchievement(list: readonly Achievement[]): Achievement | null {
  if (list.length === 0) return null;
  return [...list].sort(
    (a, b) => TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind),
  )[0];
}

export function highestTier(list: readonly Achievement[]): AchievementTier | null {
  return primaryAchievement(list)?.tier ?? null;
}

/* ------------------------------------------------------------------ */
/* Mensagens determinísticas e contextualizadas (não aleatórias)      */
/* ------------------------------------------------------------------ */

/**
 * Gera título e corpo da mensagem baseados no tipo de conquista e dados reais.
 * Substitui pickMessage aleatório por mensagens determinísticas e informativas.
 */
export function formatAchievementMessage(
  kind: AchievementKind,
  detail?: string,
  disciplineName?: string,
  studiedMinutes?: number,
  streakDays?: number,
): { title: string; body: string } {
  // Usa disciplina no título quando disponível para contextualização
  const disc = disciplineName ? ` em ${disciplineName}` : '';

  switch (kind) {
    case 'session-complete': {
      const mins = detail ? detail.replace('+', '').replace(' min', '') : studiedMinutes?.toString() ?? '';
      return {
        title: `Sessão concluída${disc}`,
        body: mins ? `+${mins} min registrados no seu histórico.` : 'Sessão finalizada e salva.',
      };
    }
    case 'daily-goal': {
      return {
        title: 'Meta diária cumprida',
        body: 'Você atingiu o tempo de estudo planejado para hoje.',
      };
    }
    case 'schedule-complete': {
      return {
        title: 'Cronograma do dia completo',
        body: 'Todos os blocos planejados para hoje foram executados.',
      };
    }
    case 'question-goal': {
      return {
        title: 'Meta de questões atingida',
        body: 'Volume diário de questões cumprido. É assim que se fixa o conteúdo.',
      };
    }
    case 'questions-great': {
      return {
        title: `Ótimo desempenho${disc}`,
        body: detail ? `Acertou ${detail}. Acima da sua meta de acerto.` : 'Desempenho acima da sua meta de acerto.',
      };
    }
    case 'questions-perfect': {
      return {
        title: `Gabaritou${disc}`,
        body: detail ? `Acertou ${detail}. Domínio demonstrado.` : '100% de acerto nesta bateria. Considere aumentar a dificuldade.',
      };
    }
    case 'personal-best': {
      return {
        title: `Novo recorde pessoal${disc}`,
        body: detail ?? 'Você superou sua melhor marca nesta disciplina.',
      };
    }
    case 'streak-milestone': {
      const days = streakDays ?? (detail ? parseInt(detail.replace(' dias seguidos', ''), 10) : null);
      return {
        title: days ? `${days} dias seguidos de estudo` : 'Marco de constância atingido',
        body: 'Constância é o diferencial que aprova. Mantenha a sequência.',
      };
    }
    case 'questions-logged': {
      return {
        title: `Questões registradas${disc}`,
        body: detail
          ? `Acertou ${detail}. Cada erro mapeado vira revisão no Caderno de Erros.`
          : 'Bateria registrada. Erros viram revisão; acertos confirmam o que você já domina.',
      };
    }
  }
}

/** Comparativo opcional com ontem (feedback informacional surpresa). */
export function comparedToYesterday(sessions: readonly StudySession[], today: DateKey): string | null {
  const yesterday = addDays(today, -1);
  const t = studiedMinutesInRange(sessions, today, today);
  const y = studiedMinutesInRange(sessions, yesterday, yesterday);
  if (y <= 0 || t <= y) return null;
  return `+${Math.round(t - y)} min a mais que ontem`;
}

/** Próximo bloco pendente do cronograma de hoje (combate o "reset pós-recompensa"). */
export function nextPendingToday(sessions: readonly StudySession[], today: DateKey): StudySession | null {
  return (
    plannedSessions(sessions)
      .filter((s) => s.date === today && s.status === 'planejada')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.plannedStart ?? '99:99').localeCompare(b.plannedStart ?? '99:99'))[0] ?? null
  );
}
