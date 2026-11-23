import type { ErrorNote, QuestionLog, ReviewTask, Settings, StudySession, TimerState, Topic, TopicStatus } from '../db/types';

export function topicTitleKey(title: string): string {
  return title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
    .replace(/\s+/g, ' ').replace(/\.$/, '').trimEnd();
}

const statusRank: Record<TopicStatus, number> = {
  'nao-iniciado': 0,
  'em-andamento': 1,
  concluido: 2,
  dominado: 3,
};

export function mergeDuplicateTopics(topics: Topic[]): Topic[] {
  return planTopicMerge(topics).topics;
}

function planTopicMerge(topics: Topic[]) {
  const redirects = new Map<string, string>();
  const changes = new Map<string, Topic>();

  // Resolve os pais primeiro para comparar os subtópicos do mesmo tópico.
  for (const isChild of [false, true]) {
    const groups = new Map<string, Topic[]>();
    for (const topic of topics) {
      if (Boolean(topic.parentTopicId) !== isChild) continue;
      const parentTopicId = (topic.parentTopicId && redirects.get(topic.parentTopicId)) || topic.parentTopicId;
      const current = parentTopicId === topic.parentTopicId ? topic : { ...topic, parentTopicId };
      if (current !== topic) changes.set(topic.id, current);
      const key = JSON.stringify([topic.disciplineId, parentTopicId || null, topicTitleKey(topic.title)]);
      const siblings = groups.get(key);
      if (siblings) siblings.push(current);
      else groups.set(key, [current]);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.order - b.order || a.id.localeCompare(b.id));
      const [original, ...copies] = group;
      const merged = { ...original };
      for (const copy of copies) {
        redirects.set(copy.id, original.id);
        if (statusRank[copy.status] > statusRank[merged.status]) merged.status = copy.status;
        if (copy.updatedAt > merged.updatedAt) merged.updatedAt = copy.updatedAt;
        if (copy.completionReuseDisabled) merged.completionReuseDisabled = true;
        merged.order = Math.min(merged.order, copy.order);
      }
      merged.notes = [...new Set(group.map(({ notes }) => notes).filter((notes) => notes.trim()))].join('\n\n');
      changes.set(original.id, merged);
    }
  }

  return {
    redirects,
    topics: redirects.size === 0 ? topics : topics.flatMap((topic) =>
      redirects.has(topic.id) ? [] : [changes.get(topic.id) ?? topic]),
  };
}

interface TopicWorkspace {
  topics: Topic[];
  sessions: StudySession[];
  timer: TimerState[];
  questionLogs: QuestionLog[];
  errorNotes: ErrorNote[];
  reviews: ReviewTask[];
  settings: Settings[];
}

export function mergeWorkspaceTopics<T extends TopicWorkspace>(workspace: T): T {
  const { topics, redirects } = planTopicMerge(workspace.topics);
  if (redirects.size === 0) return workspace;

  function redirectTopic<R extends { topicId: string | null }>(row: R): R {
    const replacement = row.topicId && redirects.get(row.topicId);
    return replacement ? { ...row, topicId: replacement } : row;
  }

  return {
    ...workspace,
    topics,
    sessions: workspace.sessions.map(redirectTopic),
    timer: workspace.timer.map(redirectTopic),
    questionLogs: workspace.questionLogs.map(redirectTopic),
    errorNotes: workspace.errorNotes.map(redirectTopic),
    reviews: workspace.reviews.map(redirectTopic),
    settings: workspace.settings.map((settings) => {
      const skipped = settings.skippedCycleActivities;
      if (!skipped?.some(({ topicId }) => topicId && redirects.has(topicId))) return settings;
      return { ...settings, skippedCycleActivities: skipped.map(redirectTopic) };
    }),
  };
}
