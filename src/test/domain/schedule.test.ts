import { describe, it, expect } from 'vitest';
import { availableTopics, nextCycleActivity, previewCycle, cycleCompletions, CYCLE_COMPLETION, isRetiredPlannedSession, type CycleInput } from '../../domain/schedule';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS, DEFAULT_TOPICS } from '../../db/seed';
import type { QuestionLog, StudySession, ErrorNote } from '../../db/types';

function input(): CycleInput {
  return { disciplines: DEFAULT_DISCIPLINES.slice(0, 3).map(d => ({ ...d })), topics: DEFAULT_TOPICS,
    sessions: [], questionLogs: [], errorNotes: [], settings: { ...DEFAULT_SETTINGS, distribution: {} } };
}
function completion(disciplineId: string, id: string): StudySession {
  return { id, disciplineId, actualSeconds: 3600, topicId: null, status: 'concluida', createdAt: id, endedAt: id,
    history: [{ type: 'executada', at: id, description: CYCLE_COMPLETION }] } as StudySession;
}
function log(disciplineId: string, total: number, correct: number, topicId: string | null = null): QuestionLog {
  return { disciplineId, total, correct, incorrect: total - correct, blank: 0, topicId } as QuestionLog;
}
describe('ciclo contínuo adaptativo', () => {
  it('cria fila determinística com disciplinas ativas, sem datas nem geração de sessões', () => {
    const data = input();
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[0].id);
    const preview = previewCycle(data, 12);
    expect(preview).toHaveLength(12);
    expect(new Set(preview.map(a => a.discipline.id)).size).toBe(3);
    expect(data.sessions).toEqual([]);
    expect(previewCycle(data, 12)).toEqual(preview);
  });
  it('avança apenas com execução do ciclo e respeita mudança de ordem', () => {
    const data = input();
    const first = data.disciplines[0].id;
    data.sessions = [completion(first, '1')];
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[1].id);
    data.disciplines = data.disciplines.map((d, i) => ({ ...d, order: -i }));
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[0 + 2].id);
  });
  it('não conta sessões incompletas ou sem tempo, mesmo com histórico inconsistente', () => {
    const saved = completion('portugues', '1');
    expect(cycleCompletions([{ ...saved, status: 'planejada' }, { ...saved, actualSeconds: 0 }])).toHaveLength(0);
  });
  it('ignora disciplinas desativadas ou excluídas sem perder histórico', () => {
    const data = input();
    data.sessions = [completion(data.disciplines[0].id, '1')];
    data.disciplines = data.disciplines.slice(1).map((d, i) => ({ ...d, active: i === 1 }));
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[1].id);
    expect(data.sessions).toHaveLength(1);
    expect(nextCycleActivity({ ...data, disciplines: [] })).toBeNull();
  });
  it('usa peso e desempenho com amostra suficiente sem excluir disciplinas fortes', () => {
    const data = input();
    data.sessions = data.disciplines.map((d, i) => completion(d.id, String(i)));
    data.questionLogs = data.disciplines.map((d, i) => log(d.id, 100, i === 2 ? 45 : 92));
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[2].id);
    const queue = previewCycle(data, 90);
    const counts = data.disciplines.map(d => queue.filter(a => a.discipline.id === d.id).length);
    expect(counts[2]).toBeGreaterThan(counts[0]);
    expect(counts.every(n => n > 0)).toBe(true);
    data.settings.distribution = { [data.disciplines[1].id]: 3, [data.disciplines[0].id]: 1, [data.disciplines[2].id]: 1 };
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[1].id);
  });
  it('seleciona tópicos com baixo desempenho e erros recorrentes; aceita ausência de questões', () => {
    const data = input();
    data.disciplines = data.disciplines.slice(0, 1);
    const pool = availableTopics(data.topics, data.disciplines[0].id).slice(0, 2);
    data.topics = pool;
    expect(nextCycleActivity(data)?.reason).toContain('poucas questões');
    data.questionLogs = [log(pool[0].disciplineId, 100, 95, pool[0].id), log(pool[1].disciplineId, 100, 30, pool[1].id)];
    expect(nextCycleActivity(data)?.topic?.id).toBe(pool[1].id);
    data.errorNotes = [{ disciplineId: pool[0].disciplineId, topicId: pool[0].id, status: 'revisar' } as ErrorNote];
    data.questionLogs = [];
    expect(nextCycleActivity(data)?.topic?.id).toBe(pool[0].id);
    expect(nextCycleActivity(data)?.reason).toContain('Erros');
  });
  it('não interpreta uma única questão errada como desempenho confiável', () => {
    const data = input();
    data.disciplines = data.disciplines.slice(0, 2);
    data.sessions = data.disciplines.map((d, i) => completion(d.id, String(i)));
    data.questionLogs = [log(data.disciplines[0].id, 1, 0), log(data.disciplines[1].id, 100, 45)];
    expect(nextCycleActivity(data)?.discipline.id).toBe(data.disciplines[1].id);
  });
  it('respeita hierarquia e ignora tópicos inativos, órfãos e ciclos', () => {
    const base = DEFAULT_TOPICS[0];
    const topics = [{ ...base, id: 'parent', parentTopicId: null, active: false },
      { ...base, id: 'child', parentTopicId: 'parent', active: true },
      { ...base, id: 'orphan', parentTopicId: 'missing' },
      { ...base, id: 'loop', parentTopicId: 'loop' },
      { ...base, id: 'valid', parentTopicId: null, active: true }];
    expect(availableTopics(topics, base.disciplineId).map(t => t.id)).toEqual(['valid']);
    expect(nextCycleActivity({ ...input(), topics: [] })?.topic).toBeNull();
  });
  it('arquiva apenas planejamento automático intocado e preserva histórico e sessões manuais', () => {
    const session = { status: 'planejada', actualSeconds: 0, origin: 'planejada', recoveredFromId: null,
      history: [{ type: 'criada', description: 'Criada pelo cronograma semanal.' }] } as StudySession;
    expect(isRetiredPlannedSession(session)).toBe(true);
    expect(isRetiredPlannedSession({ ...session, isManual: true })).toBe(false);
    expect(isRetiredPlannedSession({ ...session, status: 'concluida' })).toBe(false);
  });
});
