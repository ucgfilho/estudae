/** O histórico de execução e as exclusões determinam a posição no ciclo contínuo. */
import type { Discipline, Topic, StudySession, QuestionLog, ErrorNote, Settings } from '../db/types';
import { compareSessions, supersededSessionIds } from './metrics';

export const SIMULADO_DISCIPLINE_ID = 'simulado';
export const CYCLE_COMPLETION = 'Sessão do ciclo concluída.';
export interface CycleInput {
  disciplines: readonly Discipline[];
  topics: readonly Topic[];
  sessions: readonly StudySession[];
  questionLogs: readonly QuestionLog[];
  errorNotes: readonly ErrorNote[];
  settings: Pick<Settings, 'distribution' | 'dailyGoalMinutes' | 'skippedCycleActivities'>;
}
export interface CycleActivity {
  position: number;
  discipline: Discipline;
  topic: Topic | null;
  minutes: number;
  reason: string;
}
export function isManualSession(session: StudySession): boolean {
  return session.isManual ?? session.history.some(
    entry => entry.type === 'criada' && entry.description === 'Sessão planejada criada pelo usuário.',
  );
}
export function manualPlannedSessions(sessions: readonly StudySession[]): StudySession[] {
  const superseded = supersededSessionIds(sessions);
  return sessions
    .filter(session => session.status === 'planejada' && !superseded.has(session.id) && isManualSession(session))
    .sort(compareSessions);
}
export function cycleCompletions(sessions: readonly StudySession[]): StudySession[] {
  return sessions.filter(s => s.status === 'concluida' && s.actualSeconds > 0
    && s.history.some(h => h.type === 'executada' && h.description === CYCLE_COMPLETION))
    .sort((a, b) => (a.endedAt ?? a.createdAt).localeCompare(b.endedAt ?? b.createdAt) || a.id.localeCompare(b.id));
}
export function completedTopicsSet(topics: readonly Topic[], sessions: readonly StudySession[]): Set<string> {
  const completed = new Set<string>();
  const topicIds = new Set<string>();
  for (const t of topics) {
    topicIds.add(t.id);
    if (t.status === 'concluido' || t.status === 'dominado') completed.add(t.id);
  }
  const pendingWithSessions = new Set<string>();
  for (const s of sessions) {
    if (s.topicId && s.status === 'planejada') pendingWithSessions.add(s.topicId);
  }
  for (const s of sessions) {
    if (s.topicId && s.status === 'concluida' && s.actualSeconds > 0 && !pendingWithSessions.has(s.topicId)) {
      if (!topicIds.has(s.topicId)) {
        completed.add(s.topicId);
      } else {
        const isSimulatedPreview = s.id.startsWith('preview-');
        if (!isSimulatedPreview) {
          completed.add(s.topicId);
        }
      }
    }
  }
  return completed;
}
/** Ignora também descendentes de tópicos inativos, órfãos ou com hierarquia circular. */
export function availableTopics(topics: readonly Topic[], disciplineId: string): Topic[] {
  const map = new Map(topics.filter(t => t.disciplineId === disciplineId).map(t => [t.id, t]));
  return [...map.values()].filter(t => {
    const seen = new Set<string>();
    let current: Topic | undefined = t;
    while (current) {
      if (!current.active || seen.has(current.id)) return false;
      seen.add(current.id);
      if (!current.parentTopicId) return true;
      current = map.get(current.parentTopicId);
    }
    return false;
  }).filter(t => ![...map.values()].some(child => child.active && child.parentTopicId === t.id));
}
/** Quatro posições para específicos e uma para básicos em cada bloco de cinco. */
export function nextCycleActivity(input: CycleInput): CycleActivity | null {
  const done = cycleCompletions(input.sessions);
  const completedNonCycle = input.sessions.filter(
    s => s.status === 'concluida' && s.actualSeconds > 0 && s.topicId !== null && !done.some(d => d.id === s.id),
  );
  const consumed = [
    ...done.map(({ disciplineId, topicId }) => ({ disciplineId, topicId })),
    ...completedNonCycle.map(({ disciplineId, topicId }) => ({ disciplineId, topicId })),
  ];
  let position = done.length + 1;
  const skipped = new Map(input.settings.skippedCycleActivities?.map(activity => [activity.position, activity]));
  for (const activity of [...skipped.values()].sort((a, b) => a.position - b.position)) {
    if (activity.position > position) break;
    consumed.push(activity);
    position += 1;
  }
  const doneTopics = completedTopicsSet(input.topics, input.sessions);
  const ordered = input.disciplines.filter(d => d.active)
    .map(discipline => {
      const available = availableTopics(input.topics, discipline.id);
      const pending = available.filter(topic => !doneTopics.has(topic.id));
      return { discipline, available, pending };
    })
    .filter(({ available, pending }) => !available.length || pending.length > 0);
  if (!ordered.length) return null;
  const kind = (position - 1) % 5 === 2 ? 'general' : 'technical';
  const group = ordered.filter(({ discipline }) => discipline.kind === kind);
  // Se apenas uma área tem atividades elegíveis, ela ocupa todas as posições.
  const candidates = group.length ? group : ordered;
  const count = (id: string) => consumed.filter(s => s.disciplineId === id).length;
  const { discipline, pending } = candidates.sort(({ discipline: a }, { discipline: b }) =>
    count(a.id) - count(b.id) || a.order - b.order || a.id.localeCompare(b.id))[0];
  const topicCount = (id: string) => consumed.filter(s => s.topicId === id).length;
  const topic = pending.sort((a, b) => topicCount(a.id) - topicCount(b.id) || a.order - b.order || a.id.localeCompare(b.id))[0] ?? null;
  const reason = discipline.kind === 'technical'
    ? 'Conhecimentos específicos: 80% das sessões do ciclo.'
    : 'Conhecimentos básicos: 20% das sessões do ciclo.';
  return { position, discipline, topic, minutes: input.settings.dailyGoalMinutes > 0 ? Math.max(1, Math.min(60, input.settings.dailyGoalMinutes)) : 60, reason };
}
/** Prévia recalculada a cada conclusão; não cria sessões nem compromissos no calendário. */
export function previewCycle(input: CycleInput, count = 7): CycleActivity[] {
  const sessions = [...input.sessions];
  const result: CycleActivity[] = [];
  for (let i = 0; i < count; i++) {
    const next = nextCycleActivity({ ...input, sessions });
    if (!next) break;
    result.push(next);
    sessions.push({ id: `preview-${i}`, disciplineId: next.discipline.id, topicId: next.topic?.id ?? null,
      status: 'concluida', actualSeconds: next.minutes * 60, endedAt: `9999-${i}`, createdAt: `9999-${i}`,
      history: [{ type: 'executada', description: CYCLE_COMPLETION, at: '' }] } as StudySession);
  }
  return result;
}

/** Planos automáticos legados permanecem no backup, mas não geram obrigações. */
export function isRetiredPlannedSession(session: StudySession): boolean {
  return session.status === 'planejada' && session.actualSeconds === 0 && !session.isManual
    && session.origin === 'planejada' && !session.recoveredFromId
    && !session.history.some(h => h.type === 'editada' || h.type === 'reagendada')
    && session.history.some(h => h.type === 'criada' && /cronograma|gerad.*(?:IA|inteligência|inteligencia)/i.test(h.description));
}
