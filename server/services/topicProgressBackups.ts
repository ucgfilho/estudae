import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { topicProgressSnapshotSchema } from '../../src/db/settingsFields';
import type { TopicProgressSnapshot } from '../../src/db/types';
import { isValidDateKey } from '../../src/lib/dates';
import type { StudyWorkspaceDto } from '../dtos/study-data.dto';

const workspaceBackupsSchema = z.object({
  firstRecordedDate: z.string().refine(isValidDateKey),
  points: z.array(topicProgressSnapshotSchema),
});
const backupsSchema = z.record(z.string().min(1), workspaceBackupsSchema);
export type WorkspaceBackups = z.infer<typeof workspaceBackupsSchema>;

export function loadTopicProgressBackups(path: string | undefined): Map<string, WorkspaceBackups> {
  if (!path || !existsSync(path)) return new Map();
  try {
    return new Map(Object.entries(backupsSchema.parse(JSON.parse(readFileSync(path, 'utf8')))));
  } catch {
    console.warn('Não foi possível carregar os pontos de progresso recuperados de backup.');
    return new Map();
  }
}

export function withTopicProgressBackups(workspace: StudyWorkspaceDto, backups?: WorkspaceBackups): StudyWorkspaceDto {
  const settings = workspace.settings[0];
  if (!settings || !backups?.points.length) return workspace;

  const history = settings.topicProgressHistory ?? [];
  const firstRecorded = history.find(({ source }) => source !== 'backup')?.date;
  if (firstRecorded !== backups.firstRecordedDate) return workspace;

  const existingDates = new Set(history.map(({ date }) => date));
  const recovered = backups.points.filter(({ date }) =>
    !existingDates.has(date) && date < firstRecorded,
  ).map((point): TopicProgressSnapshot => ({ ...point, source: 'backup' }));
  if (recovered.length === 0) return workspace;

  return {
    ...workspace,
    settings: [{
      ...settings,
      topicProgressHistory: [...recovered, ...history].sort((a, b) => a.date.localeCompare(b.date)),
    }],
  };
}
