import { db } from '../db/db';
import type { Topic, TopicStatus } from '../db/types';
import type { ParsedTopic } from '../domain/checklist';
import { topicTitleKey } from '../domain/duplicateTopics';
import { createId, nowIso } from '../lib/utils';
import { ValidationError } from './sessions';
import { saveTopicWithStatus } from './topicStatus';

export interface TopicInput {
  title: string;
  status: TopicStatus;
  notes: string;
}

function validateTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new ValidationError('Informe o título do tópico.');
  if (t.length > 300) throw new ValidationError('O título deve ter no máximo 300 caracteres.');
  return t;
}

function validateUniqueTitle(title: string, siblings: Topic[], currentId?: string) {
  const key = topicTitleKey(title);
  if (siblings.some((topic) => topic.id !== currentId && topicTitleKey(topic.title) === key)) {
    throw new ValidationError('Já existe um tópico com esse título neste nível da disciplina.');
  }
}

function topicsInDiscipline(disciplineId: string): Topic[] {
  return db.topics.toArraySync().filter((topic) => topic.disciplineId === disciplineId);
}

export async function createTopic(disciplineId: string, parentTopicId: string | null, input: TopicInput): Promise<Topic> {
  const title = validateTitle(input.title);
  return db.transaction('rw', db.topics, db.disciplines, async () => {
    if (!db.disciplines.getSync(disciplineId)) throw new ValidationError('Disciplina não encontrada.');
    if (parentTopicId) {
      const parent = db.topics.getSync(parentTopicId);
      if (!parent || parent.disciplineId !== disciplineId) throw new ValidationError('Tópico pai não encontrado.');
      if (parent.parentTopicId) throw new ValidationError('Subtópicos não podem ter novos níveis.');
    }
    const siblings = topicsInDiscipline(disciplineId).filter((topic) => topic.parentTopicId === parentTopicId);
    validateUniqueTitle(title, siblings);
    const now = nowIso();
    const topic: Topic = {
      id: createId(),
      disciplineId,
      title,
      parentTopicId,
      status: input.status,
      notes: input.notes.trim(),
      order: siblings.reduce((max, topic) => Math.max(max, topic.order + 1), 0),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await saveTopicWithStatus(topic);
    return topic;
  });
}

export async function updateTopic(id: string, input: TopicInput): Promise<void> {
  const title = validateTitle(input.title);
  const current = db.topics.getSync(id);
  if (!current) throw new ValidationError('Tópico não encontrado.');
  if (topicTitleKey(title) !== topicTitleKey(current.title)) {
    const siblings = topicsInDiscipline(current.disciplineId)
      .filter((topic) => topic.parentTopicId === current.parentTopicId);
    validateUniqueTitle(title, siblings, id);
  }
  const updated = { ...current, title, status: input.status, notes: input.notes.trim(), updatedAt: nowIso() };
  if (updated.status === current.status) {
    await db.topics.put(updated);
  } else {
    await saveTopicWithStatus(updated);
  }
}

export async function setTopicStatus(id: string, status: TopicStatus): Promise<void> {
  const current = db.topics.getSync(id);
  if (current) await saveTopicWithStatus({ ...current, status, updatedAt: nowIso() });
}

/** Ativa/desativa o tópico e seus subtópicos. Tópicos inativos não contam no progresso. */
export async function setTopicActive(id: string, active: boolean): Promise<void> {
  await db.transaction('rw', db.topics, async () => {
    const now = nowIso();
    await db.topics.update(id, { active, updatedAt: now });
    await db.topics.where('parentTopicId').equals(id).modify({ active, updatedAt: now });
  });
}

/**
 * Exclui o tópico e seus subtópicos. Registros vinculados (sessões, questões,
 * erros, revisões) são preservados, apenas desvinculados do tópico.
 */
export async function deleteTopic(id: string): Promise<void> {
  await db.transaction('rw', [db.topics, db.sessions, db.questionLogs, db.errorNotes, db.reviews, db.timer], async () => {
    const children = await db.topics.where('parentTopicId').equals(id).primaryKeys();
    const ids = [id, ...children];
    const timer = await db.timer.get('active');
    if (timer?.topicId && ids.includes(timer.topicId)) {
      throw new ValidationError('Este tópico está vinculado à sessão em andamento. Finalize ou descarte o cronômetro antes de excluí-lo.');
    }
    await db.sessions.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.questionLogs.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.errorNotes.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.reviews.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.topics.bulkDelete(ids);
  });
}

/**
 * Exclui todos os tópicos de uma disciplina específica ou de todas as disciplinas.
 * Registros vinculados (sessões, questões, erros, revisões) são preservados,
 * apenas com topicId desvinculado.
 */
export async function deleteAllTopics(disciplineId?: string | null): Promise<number> {
  return db.transaction('rw', [db.topics, db.sessions, db.questionLogs, db.errorNotes, db.reviews, db.timer], async () => {
    const query = disciplineId
      ? db.topics.where('disciplineId').equals(disciplineId)
      : db.topics.toCollection();

    const ids = await query.primaryKeys();
    if (ids.length === 0) return 0;

    const timer = await db.timer.get('active');
    if (timer?.topicId && ids.includes(timer.topicId)) {
      throw new ValidationError('Há tópicos vinculados ao cronômetro em andamento. Finalize ou descarte o cronômetro antes de excluí-los.');
    }

    await db.sessions.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.questionLogs.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.errorNotes.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.reviews.where('topicId').anyOf(ids).modify({ topicId: null });
    await db.topics.bulkDelete(ids);

    return ids.length;
  });
}

async function siblingsOf(topic: Topic): Promise<Topic[]> {
  const list = await db.topics
    .where('disciplineId')
    .equals(topic.disciplineId)
    .filter((t) => t.parentTopicId === topic.parentTopicId)
    .toArray();
  return list.sort((a, b) => a.order - b.order);
}

async function persistOrder(list: Topic[]): Promise<void> {
  const now = nowIso();
  await Promise.all(list.map((t, index) => (t.order !== index ? db.topics.update(t.id, { order: index, updatedAt: now }) : Promise.resolve(1))));
}

/** Move o tópico uma posição para cima (-1) ou para baixo (+1) entre os irmãos. */
export async function moveTopic(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.topics, async () => {
    const topic = await db.topics.get(id);
    if (!topic) throw new ValidationError('Tópico não encontrado.');
    const list = await siblingsOf(topic);
    const index = list.findIndex((t) => t.id === id);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    await persistOrder(list);
  });
}

/** Reposiciona `draggedId` antes de `targetId` (`null` = fim da lista) entre irmãos. */
export async function reorderTopic(draggedId: string, targetId: string | null): Promise<void> {
  if (draggedId === targetId) return;
  await db.transaction('rw', db.topics, async () => {
    const dragged = await db.topics.get(draggedId);
    const target = targetId ? await db.topics.get(targetId) : null;
    if (!dragged || (targetId && !target)) return;
    if (target && (dragged.disciplineId !== target.disciplineId || dragged.parentTopicId !== target.parentTopicId)) {
      throw new ValidationError('Só é possível reordenar itens do mesmo nível.');
    }
    const list = (await siblingsOf(dragged)).filter((t) => t.id !== draggedId);
    const index = targetId ? list.findIndex((t) => t.id === targetId) : list.length;
    list.splice(index, 0, dragged);
    await persistOrder(list);
  });
}

/** Importa tópicos/subtópicos a partir de uma prévia validada pelo usuário. */
export async function importTopics(disciplineId: string, parsed: readonly ParsedTopic[]): Promise<number> {
  if (parsed.length === 0) throw new ValidationError('Nenhum tópico para importar.');
  return db.transaction('rw', db.topics, db.disciplines, async () => {
    if (!db.disciplines.getSync(disciplineId)) throw new ValidationError('Disciplina não encontrada.');
    const now = nowIso();
    const records: Topic[] = [];
    const siblingsByParent = new Map<string | null, Map<string, Topic>>();
    const nextOrders = new Map<string | null, number>();
    const indexTopic = (topic: Topic) => {
      const parentId = topic.parentTopicId;
      const siblings = siblingsByParent.get(parentId) ?? new Map<string, Topic>();
      const key = topicTitleKey(topic.title);
      if (!siblings.has(key)) siblings.set(key, topic);
      siblingsByParent.set(parentId, siblings);
      nextOrders.set(parentId, Math.max(nextOrders.get(parentId) ?? 0, topic.order + 1));
    };
    topicsInDiscipline(disciplineId).forEach(indexTopic);

    const addIfNew = (title: string, parent: Topic | null): Topic => {
      const parentTopicId = parent?.id ?? null;
      const existing = siblingsByParent.get(parentTopicId)?.get(topicTitleKey(title));
      if (existing) return existing;
      const topic: Topic = {
        id: createId(), disciplineId, title, parentTopicId, status: 'nao-iniciado', notes: '',
        order: nextOrders.get(parentTopicId) ?? 0, active: parent?.active ?? true, createdAt: now, updatedAt: now,
      };
      indexTopic(topic);
      records.push(topic);
      return topic;
    };
    for (const p of parsed) {
      const parent = addIfNew(p.title, null);
      p.subtopics.forEach((title) => addIfNew(title, parent));
    }
    await db.topics.bulkAdd(records);
    return records.length;
  });
}

export async function updateDisciplineColor(id: string, color: string): Promise<void> {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new ValidationError('Cor inválida.');
  await db.disciplines.update(id, { color });
}
