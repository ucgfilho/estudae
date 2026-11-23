import { describe, expect, it } from 'vitest';
import type { Discipline, Topic } from '../../db/types';
import { findReusableCompletions } from '../../domain/topicCompletion';

const discipline: Discipline = {
  id: 'portugues', name: 'Língua Portuguesa', active: true, kind: 'general', order: 0, color: '#123456',
};
const date = '2026-11-22T12:00:00Z';

function topic(id: string, title: string, fields: Partial<Topic> = {}): Topic {
  return { id, title, disciplineId: discipline.id, status: 'nao-iniciado', active: true,
    notes: '', parentTopicId: null, order: 0, createdAt: date, updatedAt: date, ...fields };
}

function syllabus(topics: Topic[], subject: Discipline = discipline) {
  return { topics, disciplines: [subject] };
}

describe('reaproveitamento de tópicos entre concursos', () => {
  it.each([
    ['Crase', 'Crase'],
    ['Crase', '  CRASE. '],
    ['5.2 Concordância Verbal', 'concordancia verbal'],
    ['Interpretação de textos', 'Interpretação de texto'],
    ['Interpretação de textos digitais', 'Interpretacao de texto digital'],
    ['Interpretação textual', 'Interpretação de textos'],
    ['Atos administrativos', 'Ato administrativo'],
    ['Redes de computadores', 'Redes de Computadores'],
    ['Lei Geral de Proteção de Dados (LGPD)', 'LGPD'],
  ])('reaproveita %s em %s, com IDs de disciplina distintos', (source, target) => {
    const other = { ...discipline, id: 'materia-importada', name: 'Português' };
    const pending = topic('pending', target, { disciplineId: other.id, status: 'em-andamento', notes: 'minha nota' });
    expect(findReusableCompletions(syllabus([pending], other), [
      syllabus([topic('source', source, { status: 'dominado' })]),
    ])).toEqual([pending]);
  });

  it.each([
    ['Crase', 'Crase e regência'],
    ['Concordância verbal', 'Concordância nominal'],
    ['Princípios', 'Princípios gerais'],
    ['C++', 'C#'],
    ['Lei 8.112', 'Lei 8112'],
    ['Parte I', 'Parte II'],
    ['Direitos e garantias', 'Direitos ou garantias'],
  ])('mantém %s e %s como conteúdos distintos', (source, target) => {
    expect(findReusableCompletions(syllabus([topic('target', target)]), [
      syllabus([topic('source', source, { status: 'concluido' })]),
    ])).toEqual([]);
  });

  it('preserva status concluído ou dominado, inatividade e a decisão de reabrir', () => {
    expect(findReusableCompletions(syllabus([
      topic('done', 'Crase', { status: 'concluido' }),
      topic('mastered', 'Crase', { status: 'dominado' }),
      topic('disabled', 'Crase', { active: false }),
      topic('reopened', 'Crase', { completionReuseDisabled: true }),
      topic('active', 'Crase'),
    ]), [syllabus([topic('source', 'Crase', { status: 'concluido' })])]).map(({ id }) => id)).toEqual(['active']);
  });

  it('exige uma fonte concluída e ativa na mesma disciplina', () => {
    const target = syllabus([topic('target', 'Conceitos básicos')]);
    const complete = topic('source', 'Conceitos básicos', { status: 'concluido' });
    expect(findReusableCompletions(target, [
      syllabus([topic('pending', 'Conceitos básicos', { status: 'em-andamento' })]),
      syllabus([{ ...complete, active: false }]),
      syllabus([complete], { ...discipline, active: false }),
      syllabus([complete], { ...discipline, name: 'Informática' }),
    ])).toEqual([]);
    expect(findReusableCompletions(syllabus(target.topics, { ...discipline, active: false }), [
      syllabus([complete]),
    ])).toEqual([]);
  });

  it('compara subtópicos no contexto do pai e deixa o pai pendente quando há conteúdo extra', () => {
    const parent = topic('parent', 'Sintaxe', { status: 'concluido' });
    const source = syllabus([parent, topic('source', 'Conceitos', { parentTopicId: parent.id, status: 'concluido' })]);
    const targetParent = topic('target', 'Sintaxe');
    const matching = topic('matching', 'Conceitos', { parentTopicId: targetParent.id });
    const extra = topic('extra', 'Orações', { parentTopicId: targetParent.id });
    const otherParent = topic('other', 'Semântica');
    const unrelated = topic('unrelated', 'Conceitos', { parentTopicId: otherParent.id });

    expect(findReusableCompletions(syllabus([targetParent, matching, extra, otherParent, unrelated]), [source]))
      .toEqual([matching]);
    expect(findReusableCompletions(syllabus([targetParent, matching]), [source]))
      .toEqual([targetParent, matching]);
    expect(findReusableCompletions(syllabus([targetParent, matching]), [syllabus([parent])]))
      .toEqual([]);
  });

  it('ignora subtópicos órfãos ou sob um pai inativo e títulos sem conteúdo', () => {
    const source = syllabus([
      topic('parent', 'Sintaxe', { active: false }),
      topic('child', 'Conceitos', { parentTopicId: 'parent', status: 'concluido' }),
      topic('orphan', 'Conceitos', { parentTopicId: 'missing', status: 'concluido' }),
      topic('blank', '...', { status: 'concluido' }),
    ]);
    expect(findReusableCompletions(syllabus([
      topic('parent', 'Sintaxe'), topic('target', 'Conceitos', { parentTopicId: 'parent' }),
      topic('blank', '...'),
    ]), [source])).toEqual([]);
  });
});
