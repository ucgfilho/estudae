import { db } from '../db/db';
import type { Topic } from '../db/types';
import { isTopicCompleted } from '../domain/topicCompletion';

function rememberCompletionChoice(topic: Topic, previous?: Topic): Topic {
  if (isTopicCompleted(topic.status)) {
    delete topic.completionReuseDisabled;
  } else if (previous && isTopicCompleted(previous.status)) {
    topic.completionReuseDisabled = true;
  }
  return topic;
}

export async function saveTopicWithStatus(topic: Topic): Promise<void> {
  const changes = [rememberCompletionChoice({ ...topic }, db.topics.getSync(topic.id))];

  if (topic.parentTopicId) {
    const parent = db.topics.getSync(topic.parentTopicId);
    if (parent && isTopicCompleted(parent.status) && !isTopicCompleted(topic.status)) {
      changes.push(rememberCompletionChoice({ ...parent, status: 'em-andamento', updatedAt: topic.updatedAt }, parent));
    }
  } else {
    for (const child of db.topics.toArraySync()) {
      if (child.parentTopicId === topic.id && child.status !== topic.status) {
        changes.push(rememberCompletionChoice({ ...child, status: topic.status, updatedAt: topic.updatedAt }, child));
      }
    }
  }

  await db.topics.bulkPut(changes);
}
