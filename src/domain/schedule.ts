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
function evidence(input: CycleInput, disciplineId: string, topicId?: string) {
  const logs = input.questionLogs.filter(q => q.disciplineId === disciplineId && (!topicId || q.topicId === topicId));
  const total = logs.reduce((n, q) => n + q.total, 0);
  const correct = logs.reduce((n, q) => n + q.correct, 0);
  // Dez questões equivalentes a 70% de acertos evitam conclusões com amostras pequenas.
  const difficulty = 1 - (correct + 7) / (total + 10);
  const errors = input.errorNotes.filter(e => e.disciplineId === disciplineId && (!topicId || e.topicId === topicId) && e.status !== 'dominado').length;
  return { total, difficulty, errors };
}
export function nextCycleActivity(input: CycleInput): CycleActivity | null {
  const done = cycleCompletions(input.sessions);
  const ordered = input.disciplines.filter(d => d.active).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (!ordered.length) return null;
  const weights = ordered.map(d => Math.max(1, input.settings.distribution[d.id] ?? 1));
  const average = weights.reduce((a, b) => a + b, 0) / weights.length;
  const minutesByDiscipline = new Map(ordered.map(d => [d.id, input.sessions
    .filter(s => s.disciplineId === d.id && s.status === 'concluida')
    .reduce((sum, s) => sum + s.actualSeconds / 60, 0)]));
  const averageMinutes = [...minutesByDiscipline.values()].reduce((a, b) => a + b, 0) / ordered.length;
  const candidates = ordered.map((discipline, i) => {
    const data = evidence(input, discipline.id);
    const timeBalance = Math.max(0.75, Math.min(1.25,
      (averageMinutes + 60) / ((minutesByDiscipline.get(discipline.id) ?? 0) + 60)));
    const weight = Math.max(0.5, Math.min(3, weights[i] / average))
      * (1 + data.difficulty + Math.min(1, data.errors * 0.15)) * timeBalance;
    const served = done.filter(s => s.disciplineId === discipline.id).length;
    return { discipline, priority: served / weight };
  });
  // Primeiro cobre todas as disciplinas; depois distribui frequências por peso e dificuldade.
  // Empates respeitam a ordem configurada e nenhuma disciplina ativa desaparece.
  candidates.sort((a, b) => a.priority - b.priority || a.discipline.order - b.discipline.order);
  const discipline = candidates[0].discipline;
  const pool = availableTopics(input.topics, discipline.id);
  const ranked = pool.map(topic => {
    const data = evidence(input, discipline.id, topic.id);
    const studied = input.sessions.filter(s => s.topicId === topic.id && s.status === 'concluida');
    const minutes = studied.reduce((n, s) => n + s.actualSeconds / 60, 0);
    const last = done.map(s => s.topicId).lastIndexOf(topic.id);
    const gap = last < 0 ? done.length + 1 : done.length - last;
    const status = { 'nao-iniciado': 2, 'em-andamento': 1.5, concluido: 0.75, dominado: 0.25 }[topic.status];
    const score = (status + data.difficulty * 2 + Math.min(2, data.errors * 0.3) + gap * 0.15) / (1 + minutes / 120);
    return { topic, data, score };
  }).sort((a, b) => b.score - a.score || a.topic.order - b.topic.order || a.topic.id.localeCompare(b.topic.id));
  const selected = ranked[0];
  const reason = !selected ? 'Disciplina sem assuntos disponíveis; estude com seu material cadastrado.'
    : selected.data.errors > 0 ? 'Erros registrados indicam necessidade de consolidação.'
    : selected.data.total < 10 ? 'Conteúdo a explorar; ainda há poucas questões para avaliar o desempenho.'
    : selected.data.difficulty > 0.3 ? 'Desempenho indica necessidade de reforço.'
    : 'Consolidação do conteúdo, respeitando a ordem e o tempo já dedicado.';
  return { discipline, topic: selected?.topic ?? null, minutes: Math.max(1, Math.min(60, input.settings.dailyGoalMinutes)), reason };
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
