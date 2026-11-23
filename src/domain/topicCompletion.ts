import type { Discipline, Topic, TopicStatus } from '../db/types';

export interface ContestSyllabus {
  disciplines: readonly Discipline[];
  topics: readonly Topic[];
}

const disciplineAliases = new Map([
  ['lingua portuguesa', 'portugues'],
  ['lingua inglesa', 'ingles'],
]);

const knownPlurals = new Map([
  ['administrativos', 'administrativo'],
  ['atos', 'ato'],
  ['textos', 'texto'],
  ['verbais', 'verbal'],
  ['nominais', 'nominal'],
  ['computadores', 'computador'],
  ['digitais', 'digital'],
  ['redes', 'rede'],
]);

const topicAliases = new Map([
  ['interpretacao textual', 'interpretacao de texto'],
  ['lei geral de protecao de dados (lgpd)', 'lgpd'],
  ['lei geral de protecao de dados', 'lgpd'],
]);

function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
    .replace(/^(?:\d+(?:\.\d+)*[.)]|\d+(?:\.\d+)*\s+[-–—]|\d+(?:\.\d+)+)\s+/, '')
    .replace(/[.!?;:]$/, '')
    .replace(/\s*[-–—]\s*/g, '-')
    .replace(/\s+/g, ' ');
}

function normalizeTopic(value: string): string {
  const title = normalizeLabel(value).replace(/\b[a-z]+\b/g, (word) => knownPlurals.get(word) ?? word);
  return topicAliases.get(title) ?? title;
}

export function isTopicCompleted(status: TopicStatus): boolean {
  return status === 'concluido' || status === 'dominado';
}

export function canReuseCompletion(topic: Topic): boolean {
  return topic.active && !isTopicCompleted(topic.status) && !topic.completionReuseDisabled;
}

function describeSyllabus({ disciplines, topics }: ContestSyllabus) {
  const subjects = new Map(disciplines.filter((subject) => subject.active).map((subject) => {
    const name = normalizeLabel(subject.name);
    return [subject.id, disciplineAliases.get(name) ?? name];
  }));
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const children = new Map<string, Topic[]>();
  for (const topic of topics) {
    if (!topic.active || !topic.parentTopicId) continue;
    const siblings = children.get(topic.parentTopicId) ?? [];
    siblings.push(topic);
    children.set(topic.parentTopicId, siblings);
  }

  return topics.flatMap((topic) => {
    const subject = subjects.get(topic.disciplineId);
    const title = normalizeTopic(topic.title);
    if (!topic.active || !subject || !/[a-z0-9]/.test(title)) return [];
    let parentTitle = '';
    if (topic.parentTopicId) {
      const parent = byId.get(topic.parentTopicId);
      if (!parent?.active || parent.parentTopicId || parent.disciplineId !== topic.disciplineId) return [];
      parentTitle = normalizeTopic(parent.title);
      if (!/[a-z0-9]/.test(parentTitle)) return [];
    }
    return [{
      topic,
      key: JSON.stringify([subject, parentTitle, title]),
      children: children.get(topic.id) ?? [],
    }];
  });
}

/** Encontra tópicos que podem aproveitar conteúdo concluído em outros concursos da conta. */
export function findReusableCompletions(target: ContestSyllabus, sources: Iterable<ContestSyllabus>): Topic[] {
  const pending = describeSyllabus(target).filter(({ topic }) => canReuseCompletion(topic));
  if (pending.length === 0) return [];

  const completedKeys = new Set<string>();
  for (const source of sources) {
    for (const { topic, key, children } of describeSyllabus(source)) {
      if (isTopicCompleted(topic.status) && children.every((child) => isTopicCompleted(child.status))) {
        completedKeys.add(key);
      }
    }
  }

  const matches = pending.filter(({ key }) => completedKeys.has(key));
  const matchingChildren = new Set(matches.filter(({ topic }) => topic.parentTopicId).map(({ topic }) => topic.id));
  return matches
    .filter(({ children }) => children.every((child) => isTopicCompleted(child.status) || matchingChildren.has(child.id)))
    .map(({ topic }) => topic);
}
