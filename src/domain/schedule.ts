/** Ciclo contínuo: o histórico de execução é a única fonte da posição. */
import type { Discipline, Topic, StudySession, QuestionLog, ErrorNote, Settings } from '../db/types';

export const SIMULADO_DISCIPLINE_ID = 'simulado';
export const CYCLE_COMPLETION = 'Sessão do ciclo concluída.';
export interface CycleInput {
  disciplines: readonly Discipline[];
  topics: readonly Topic[];
  sessions: readonly StudySession[];
  questionLogs: readonly QuestionLog[];
  errorNotes: readonly ErrorNote[];
  settings: Pick<Settings, 'distribution' | 'dailyGoalMinutes'>;
}
export interface CycleActivity {
  discipline: Discipline;
  topic: Topic | null;
  minutes: number;
  reason: string;
}
export function cycleCompletions(sessions: readonly StudySession[]): StudySession[] {
  return sessions.filter(s => s.status === 'concluida' && s.actualSeconds > 0
    && s.history.some(h => h.type === 'executada' && h.description === CYCLE_COMPLETION))
    .sort((a, b) => (a.endedAt ?? a.createdAt).localeCompare(b.endedAt ?? b.createdAt) || a.id.localeCompare(b.id));
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
/** Quatro sessões de específicos e uma de básicos a cada cinco conclusões. */
export function nextCycleActivity(input: CycleInput): CycleActivity | null {
  const done = cycleCompletions(input.sessions);
  const ordered = input.disciplines.filter(d => d.active).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (!ordered.length) return null;
  const kind = done.length % 5 === 2 ? 'general' : 'technical';
  const group = ordered.filter(d => d.kind === kind);
  // Se o edital só tem uma área ativa, ela ocupa todas as sessões.
  const candidates = group.length ? group : ordered;
  const count = (id: string) => done.filter(s => s.disciplineId === id).length;
  const discipline = [...candidates].sort((a, b) => count(a.id) - count(b.id) || a.order - b.order || a.id.localeCompare(b.id))[0];
  const pool = availableTopics(input.topics, discipline.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const topicCount = (id: string) => done.filter(s => s.topicId === id).length;
  const topic = [...pool].sort((a, b) => topicCount(a.id) - topicCount(b.id) || a.order - b.order || a.id.localeCompare(b.id))[0] ?? null;
  const reason = discipline.kind === 'technical'
    ? 'Conhecimentos específicos: 80% das sessões do ciclo.'
    : 'Conhecimentos básicos: 20% das sessões do ciclo.';
  return { discipline, topic, minutes: input.settings.dailyGoalMinutes > 0 ? Math.max(1, Math.min(60, input.settings.dailyGoalMinutes)) : 60, reason };
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
