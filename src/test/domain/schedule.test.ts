import { describe, it, expect } from 'vitest';
import { availableTopics, nextCycleActivity, previewCycle, cycleCompletions, CYCLE_COMPLETION, isRetiredPlannedSession, type CycleInput } from '../../domain/schedule';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS, DEFAULT_TOPICS } from '../../db/seed';
import type { QuestionLog, StudySession, ErrorNote } from '../../db/types';

function input(): CycleInput {
  return { disciplines: DEFAULT_DISCIPLINES.slice(0, 3).map(d => ({ ...d, kind: 'technical' as const })), topics: DEFAULT_TOPICS,
    sessions: [], questionLogs: [], errorNotes: [], settings: { ...DEFAULT_SETTINGS, distribution: {} } };
}
function completion(disciplineId: string, id: string): StudySession {
  return { id, disciplineId, actualSeconds: 3600, topicId: null, status: 'concluida', createdAt: id, endedAt: id,
    history: [{ type: 'executada', at: id, description: CYCLE_COMPLETION }] } as StudySession;
}
function log(disciplineId: string, total: number, correct: number, topicId: string | null = null): QuestionLog {
  return { disciplineId, total, correct, incorrect: total - correct, blank: 0, topicId } as QuestionLog;
}
describe('ciclo contínuo por área do edital', () => {
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
  it('pula a posição excluída na prévia e na execução sem registrar uma conclusão', () => {
    const data = input();
    const [first, removed, third] = previewCycle(data, 3);
    data.settings.skippedCycleActivities = [{
      position: removed.position,
      disciplineId: removed.discipline.id,
      topicId: removed.topic?.id ?? null,
    }];

    expect(previewCycle(data, 2)).toEqual([first, third]);
    data.sessions = [{ ...completion(first.discipline.id, '1'), topicId: first.topic?.id ?? null }];
    expect(nextCycleActivity(data)).toEqual(third);
    expect(cycleCompletions(data.sessions)).toHaveLength(1);
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
  it('reserva 80% para específicos e 20% para básicos, independentemente do desempenho', () => {
    const data = input();
    data.disciplines = DEFAULT_DISCIPLINES;
    const queue = previewCycle(data, 100);
    expect(queue.filter(a => a.discipline.kind === 'technical')).toHaveLength(80);
    expect(queue.filter(a => a.discipline.kind === 'general')).toHaveLength(20);
    data.questionLogs = data.disciplines.map(d => log(d.id, 100, 0));
    data.errorNotes = [{ disciplineId: data.disciplines[0].id, status: 'revisar' } as ErrorNote];
    data.settings.distribution = { portugues: 9999 };
    expect(previewCycle(data, 100)).toEqual(queue);
    expect(new Set(queue.map(a => a.discipline.id)).size).toBe(DEFAULT_DISCIPLINES.length);
  });
  it('usa toda a fila quando só uma área está ativa', () => {
    const data = input();
    for (const kind of ['general', 'technical'] as const) {
      data.disciplines = DEFAULT_DISCIPLINES.filter(d => d.kind === kind);
      expect(previewCycle(data, 10).every(a => a.discipline.kind === kind)).toBe(true);
    }
  });
  it('seleciona assuntos pela ordem e alterna após a conclusão, sem usar questões ou erros', () => {
    const data = input();
    data.disciplines = data.disciplines.slice(0, 1);
    const first = nextCycleActivity(data)!;
    data.questionLogs = [log(first.discipline.id, 100, 0, first.topic!.id)];
    expect(nextCycleActivity(data)).toEqual(first);
    data.sessions = [{ ...completion(first.discipline.id, '1'), topicId: first.topic!.id }];
    expect(nextCycleActivity(data)?.topic?.id).not.toBe(first.topic?.id);
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
