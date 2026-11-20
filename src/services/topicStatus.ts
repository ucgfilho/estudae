import { db } from '../db/db';
import type { Topic, TopicStatus } from '../db/types';

function isCompleted(status: TopicStatus): boolean {
  return status === 'concluido' || status === 'dominado';
}

export async function saveTopicWithStatus(topic: Topic): Promise<void> {
  const changes = [topic];

  if (topic.parentTopicId) {
    const parent = db.topics.getSync(topic.parentTopicId);
    if (parent && isCompleted(parent.status) && !isCompleted(topic.status)) {
      changes.push({ ...parent, status: 'em-andamento', updatedAt: topic.updatedAt });
    }
  } else {
    for (const child of db.topics.toArraySync()) {
      if (child.parentTopicId === topic.id && child.status !== topic.status) {
        changes.push({ ...child, status: topic.status, updatedAt: topic.updatedAt });
      }
    }
  }

  await db.topics.bulkPut(changes);
}
