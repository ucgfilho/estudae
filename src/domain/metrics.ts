/**
 * Cálculos de métricas centralizados.
 * Todas as telas (dashboard, relatórios, questões) devem usar estas funções
 * para evitar resultados divergentes.
 */
import {
  addDays,
  diffDays,
  eachDay,
  formatMonthYear,
  formatShortDate,
  isWithin,
  startOfMonth,
  startOfWeek,
  toDateKey,
  zonedDateTimeToEpoch,
  type DateKey,
} from '../lib/dates';
import type { Discipline, QuestionLog, ReviewTask, StudySession, Topic, TopicProgressSnapshot } from '../db/types';

/** Percentual de acerto = acertos / (acertos + erros) * 100. Em branco não entra. */
export function accuracy(correct: number, incorrect: number): number | null {
  const graded = correct + incorrect;
  if (graded <= 0) return null;
  return (correct / graded) * 100;
}

export interface QuestionTotals {
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  accuracy: number | null;
}

export function sumQuestions(logs: readonly QuestionLog[]): QuestionTotals {
  let total = 0;
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  for (const l of logs) {
    total += l.total;
    correct += l.correct;
    incorrect += l.incorrect;
    blank += l.blank;
  }
  return { total, correct, incorrect, blank, accuracy: accuracy(correct, incorrect) };
}

/** Data em que o estudo realmente ocorreu (execução), ou a data planejada. */
export function sessionStudyDate(session: StudySession): DateKey {
  return session.startedAt ? toDateKey(session.startedAt) : session.date;
}

export function studiedSecondsByDate(sessions: readonly StudySession[]): Map<DateKey, number> {
  const map = new Map<DateKey, number>();
  for (const s of sessions) {
    if (s.actualSeconds <= 0) continue;
    const key = sessionStudyDate(s);
    map.set(key, (map.get(key) ?? 0) + s.actualSeconds);
  }
  return map;
}

export function studiedMinutesInRange(sessions: readonly StudySession[], start: DateKey, end: DateKey): number {
  let seconds = 0;
  for (const s of sessions) {
    if (s.actualSeconds > 0 && isWithin(sessionStudyDate(s), start, end)) seconds += s.actualSeconds;
  }
  return seconds / 60;
}

/** IDs de sessões substituídas por uma recuperação (não contam como planejamento em duplicidade). */
export function supersededSessionIds(sessions: readonly StudySession[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sessions) if (s.recoveredFromId) ids.add(s.recoveredFromId);
  return ids;
}

/** Sessões que compõem o planejamento (exclui avulsas e sessões substituídas). */
export function plannedSessions(sessions: readonly StudySession[]): StudySession[] {
  const superseded = supersededSessionIds(sessions);
  return sessions.filter((s) => s.origin === 'planejada' && !superseded.has(s.id));
}

/** Sessões ativas do cronograma em um intervalo (exclui sessões perdidas e substituídas por recuperação). */
export function activeScheduleSessionsInRange(
  sessions: readonly StudySession[],
  start: DateKey,
  end: DateKey,
): StudySession[] {
  const superseded = supersededSessionIds(sessions);
  return sessions.filter(
    (s) => isWithin(s.date, start, end) && s.status !== 'perdida' && !superseded.has(s.id),
  );
}

export function plannedMinutesInRange(sessions: readonly StudySession[], start: DateKey, end: DateKey): number {
  return activeScheduleSessionsInRange(sessions, start, end).reduce(
    (sum, s) => sum + s.plannedMinutes,
    0,
  );
}

/** Percentual de cumprimento (realizado / planejado). `null` se nada planejado. */
export function completionRate(doneMinutes: number, plannedMinutes: number): number | null {
  if (plannedMinutes <= 0) return null;
  return (doneMinutes / plannedMinutes) * 100;
}

export interface WeekScheduleMetrics {
  plannedMinutes: number;
  doneMinutes: number;
  completionRate: number | null;
  totalSessions: number;
  completedSessions: number;
}

/**
 * Métricas sincronizadas de um intervalo/semana do cronograma com base nas sessões presentes na janela:
 * - Considera todas as sessões ativas (não perdidas e não substituídas) agendadas em [start, end].
 * - Quando uma sessão do cronograma está marcada como concluída, contabiliza a carga do bloco (plannedMinutes),
 *   garantindo que exclusões, adições, edições manuais de duração e conclusões fiquem 100% sincronizadas.
 * - Sessões ainda não concluídas com tempo parcial registrado somam o tempo parcial (actualSeconds / 60).
 */
export function weekScheduleMetrics(
  sessions: readonly StudySession[],
  start: DateKey,
  end: DateKey,
): WeekScheduleMetrics {
  const weekActive = activeScheduleSessionsInRange(sessions, start, end);
  let plannedMinutes = 0;
  let doneMinutes = 0;
  let completedSessions = 0;

  for (const s of weekActive) {
    plannedMinutes += s.plannedMinutes;
    if (s.status === 'concluida') {
      doneMinutes += s.plannedMinutes;
      completedSessions += 1;
    } else if (s.actualSeconds > 0) {
      doneMinutes += s.actualSeconds / 60;
    }
  }

  return {
    plannedMinutes,
    doneMinutes,
    completionRate: completionRate(doneMinutes, plannedMinutes),
    totalSessions: weekActive.length,
    completedSessions,
  };
}

/**
 * Sequência de dias consecutivos com estudo registrado, terminando hoje
 * (ou ontem, se hoje ainda não houve estudo).
 */
export function studyStreak(sessions: readonly StudySession[], today: DateKey): number {
  const byDate = studiedSecondsByDate(sessions);
  let cursor = (byDate.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  let streak = 0;
  while ((byDate.get(cursor) ?? 0) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface DisciplineAccuracy extends QuestionTotals {
  disciplineId: string;
  name: string;
  color: string;
}

export function accuracyByDiscipline(logs: readonly QuestionLog[], disciplines: readonly Discipline[]): DisciplineAccuracy[] {
  return [...disciplines]
    .sort((a, b) => a.order - b.order)
    .map((d) => ({
      disciplineId: d.id,
      name: d.name,
      color: d.color,
      ...sumQuestions(logs.filter((l) => l.disciplineId === d.id)),
    }));
}

export interface TopicAccuracy extends QuestionTotals {
  topicId: string;
  title: string;
  disciplineId: string;
}

export function accuracyByTopic(logs: readonly QuestionLog[], topics: readonly Topic[]): TopicAccuracy[] {
  const byTopic = new Map<string, QuestionLog[]>();
  for (const l of logs) {
    if (!l.topicId) continue;
    const list = byTopic.get(l.topicId) ?? [];
    list.push(l);
    byTopic.set(l.topicId, list);
  }
  const result: TopicAccuracy[] = [];
  for (const t of topics) {
    const list = byTopic.get(t.id);
    if (!list) continue;
    result.push({ topicId: t.id, title: t.title, disciplineId: t.disciplineId, ...sumQuestions(list) });
  }
  return result;
}

/** Conteúdos (tópicos) com pior desempenho, considerando somente questões corrigidas. */
export function worstTopics(logs: readonly QuestionLog[], topics: readonly Topic[], limit = 5): TopicAccuracy[] {
  return accuracyByTopic(logs, topics)
    .filter((t) => t.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.incorrect - a.incorrect)
    .slice(0, limit);
}

export type Granularity = 'day' | 'week' | 'month';

function bucketKey(key: DateKey, granularity: Granularity): DateKey {
  if (granularity === 'week') return startOfWeek(key);
  if (granularity === 'month') return startOfMonth(key);
  return key;
}

function bucketLabel(key: DateKey, granularity: Granularity): string {
  if (granularity === 'month') return formatMonthYear(key);
  if (granularity === 'week') return `Sem. ${formatShortDate(key)}`;
  return formatShortDate(key);
}

function bucketsInRange(start: DateKey, end: DateKey, granularity: Granularity): DateKey[] {
  const keys: DateKey[] = [];
  for (const day of eachDay(start, end)) {
    const k = bucketKey(day, granularity);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

export interface StudyTimePoint {
  key: DateKey;
  label: string;
  studiedMinutes: number;
  plannedMinutes: number;
}

/** Série temporal de tempo estudado versus planejado. */
export function studyTimeSeries(
  sessions: readonly StudySession[],
  start: DateKey,
  end: DateKey,
  granularity: Granularity,
): StudyTimePoint[] {
  const points = new Map<DateKey, StudyTimePoint>();
  for (const k of bucketsInRange(start, end, granularity)) {
    points.set(k, { key: k, label: bucketLabel(k, granularity), studiedMinutes: 0, plannedMinutes: 0 });
  }
  for (const s of sessions) {
    const studyDate = sessionStudyDate(s);
    if (s.actualSeconds > 0 && isWithin(studyDate, start, end)) {
      const p = points.get(bucketKey(studyDate, granularity));
      if (p) p.studiedMinutes += s.actualSeconds / 60;
    }
  }
  for (const s of plannedSessions(sessions)) {
    if (!isWithin(s.date, start, end)) continue;
    const p = points.get(bucketKey(s.date, granularity));
    if (p) p.plannedMinutes += s.plannedMinutes;
  }
  return [...points.values()].map((p) => ({ ...p, studiedMinutes: Math.round(p.studiedMinutes) }));
}

export interface AccuracyPoint {
  key: DateKey;
  label: string;
  accuracy: number | null;
  correct: number;
  incorrect: number;
  total: number;
}

/** Evolução do percentual de acerto por período. */
export function accuracySeries(
  logs: readonly QuestionLog[],
  start: DateKey,
  end: DateKey,
  granularity: Granularity,
): AccuracyPoint[] {
  const points = new Map<DateKey, AccuracyPoint>();
  for (const k of bucketsInRange(start, end, granularity)) {
    points.set(k, { key: k, label: bucketLabel(k, granularity), accuracy: null, correct: 0, incorrect: 0, total: 0 });
  }
  for (const l of logs) {
    if (!isWithin(l.date, start, end)) continue;
    const p = points.get(bucketKey(l.date, granularity));
    if (!p) continue;
    p.correct += l.correct;
    p.incorrect += l.incorrect;
    p.total += l.total;
  }
  return [...points.values()].map((p) => ({ ...p, accuracy: accuracy(p.correct, p.incorrect) }));
}

export interface TopicProgress {
  total: number;
  completed: number;
  mastered: number;
  inProgress: number;
  percent: number | null;
  approachedPercent: number | null;
}

function topicPercent(count: number, total: number): number | null {
  return total > 0 ? (count / total) * 100 : null;
}

/** Progresso dos tópicos ativos (concluído ou dominado contam como finalizados). */
export function topicProgress(topics: readonly Topic[]): TopicProgress {
  const active = topics.filter((t) => t.active);
  const completed = active.filter((t) => t.status === 'concluido' || t.status === 'dominado').length;
  const mastered = active.filter((t) => t.status === 'dominado').length;
  const inProgress = active.filter((t) => t.status === 'em-andamento').length;
  return {
    total: active.length,
    completed,
    mastered,
    inProgress,
    percent: topicPercent(completed, active.length),
    approachedPercent: topicPercent(completed + inProgress, active.length),
  };
}

export function recordTopicProgress(
  history: TopicProgressSnapshot[] | undefined,
  progress: Pick<TopicProgress, 'total' | 'completed' | 'inProgress'>,
  date: DateKey,
): TopicProgressSnapshot[] | undefined {
  const previous = history?.at(-1);
  const { total, completed, inProgress } = progress;
  if (!previous && total === 0) return history;
  if (previous && (previous.date > date ||
    (previous.source !== 'backup' && previous.total === total &&
      previous.completed === completed && previous.inProgress === inProgress))) {
    return history;
  }
  const snapshot = { date, total, completed, inProgress };
  return [...(history?.slice(0, previous?.date === date ? -1 : undefined) ?? []), snapshot];
}

export function topicProgressSeries(
  history: readonly TopicProgressSnapshot[],
  current: TopicProgress,
  start: DateKey,
  end: DateKey,
  granularity: Granularity,
) {
  // Sempre mostra o estado atual, inclusive enquanto a última alteração está sincronizando.
  const snapshots: TopicProgressSnapshot[] = [...history.filter((point) => point.date < end), { ...current, date: end }]
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = snapshots[0].date;
  const startDate = start < firstDate ? firstDate : start;
  let index = 0;
  let recorded: TopicProgressSnapshot | undefined;
  return bucketsInRange(startDate, end, granularity).map((key, position, keys) => {
    const nextKey = keys[position + 1];
    let backup: TopicProgressSnapshot | undefined;
    while (index < snapshots.length && (!nextKey || snapshots[index].date < nextKey)) {
      const snapshot = snapshots[index++];
      if (snapshot.source !== 'backup') recorded = snapshot;
      else if (snapshot.date >= startDate) backup = snapshot;
    }
    return {
      key,
      label: bucketLabel(key, granularity),
      coverage: recorded ? topicPercent(recorded.completed, recorded.total) : null,
      approached: recorded ? topicPercent(recorded.completed + recorded.inProgress, recorded.total) : null,
      backupCoverage: !recorded && backup ? topicPercent(backup.completed, backup.total) : null,
      backupApproached: !recorded && backup ? topicPercent(backup.completed + backup.inProgress, backup.total) : null,
      backupDate: !recorded ? backup?.date : undefined,
    };
  });
}

function sessionSortValue(s: StudySession): number {
  return zonedDateTimeToEpoch(s.date, s.plannedStart ?? '23:59');
}

export function compareSessions(a: StudySession, b: StudySession): number {
  return a.date.localeCompare(b.date) || (a.plannedStart ?? '99:99').localeCompare(b.plannedStart ?? '99:99') || a.createdAt.localeCompare(b.createdAt);
}

/** Próxima sessão planejada a partir de agora (sessões sem horário valem para o dia todo). */
export function nextPlannedSession(sessions: readonly StudySession[], now: number = Date.now()): StudySession | null {
  const today = toDateKey(now);
  const candidates = sessions
    .filter((s) => s.status === 'planejada' && s.date >= today)
    .filter((s) => s.date > today || !s.plannedStart || sessionSortValue(s) >= now - 60 * 60_000)
    .sort(compareSessions);
  return candidates[0] ?? null;
}

export function isSessionOverdue(session: StudySession, today: DateKey): boolean {
  return session.status === 'planejada' && session.date < today;
}

export interface ReviewBuckets {
  overdue: ReviewTask[];
  today: ReviewTask[];
  upcoming: ReviewTask[];
}

export function reviewBuckets(reviews: readonly ReviewTask[], today: DateKey): ReviewBuckets {
  const pending = reviews.filter((r) => r.status === 'pendente').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    overdue: pending.filter((r) => r.dueDate < today),
    today: pending.filter((r) => r.dueDate === today),
    upcoming: pending.filter((r) => r.dueDate > today),
  };
}

export interface QuestionFilter {
  start?: DateKey | null;
  end?: DateKey | null;
  disciplineId?: string | null;
  topicId?: string | null;
  source?: string | null;
}

export function filterQuestionLogs(logs: readonly QuestionLog[], filter: QuestionFilter): QuestionLog[] {
  const source = filter.source?.trim().toLowerCase();
  return logs.filter((l) => {
    if (filter.start && l.date < filter.start) return false;
    if (filter.end && l.date > filter.end) return false;
    if (filter.disciplineId && l.disciplineId !== filter.disciplineId) return false;
    if (filter.topicId && l.topicId !== filter.topicId) return false;
    if (source && !l.source.toLowerCase().includes(source)) return false;
    return true;
  });
}

/** Questões respondidas em uma data específica. */
export function questionsOnDate(logs: readonly QuestionLog[], date: DateKey): number {
  return logs.filter((l) => l.date === date).reduce((sum, l) => sum + l.total, 0);
}

/** Dias restantes até a data da prova (se configurada). */
export function daysUntil(target: DateKey | null, today: DateKey): number | null {
  if (!target) return null;
  return diffDays(target, today);
}
