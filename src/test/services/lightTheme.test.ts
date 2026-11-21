import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, db, resetDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../db/seed';
import { createBackup, restoreBackup, validateBackup } from '../../services/backup';
import { settingsDtoSchema } from '../../../server/dtos/study-data.dto';

beforeEach(async () => { await resetDatabase(); });

describe('compatibilidade do campo legado de tema nos dados do concurso', () => {
  it.each(['dark', 'system', undefined])('converte preferência legada %s ao ler dados sincronizados', theme => {
    const settings = { ...DEFAULT_SETTINGS, theme };
    expect(settingsDtoSchema.parse(settings).theme).toBe('light');
    const database = createDatabase();
    database.hydrateFromWorkspace({ settings: [settings] });
    expect(database.settings.getSync('settings')?.theme).toBe('light');
    expect(database.settings.getSync('settings')?.dailyGoalMinutes).toBe(DEFAULT_SETTINGS.dailyGoalMinutes);
  });

  it.each(['dark', 'system'])('restaura backup com preferência %s sem reativar o modo escuro', async theme => {
    const backup = await createBackup();
    const legacy = { ...backup, data: { ...backup.data,
      settings: backup.data.settings.map(settings => ({ ...settings, theme, dailyGoalMinutes: 75 })) } };
    const parsed = validateBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Backup legado deveria ser aceito');
    expect(parsed.backup.data.settings[0].theme).toBe('light');
    await restoreBackup(parsed.backup);
    expect(db.settings.getSync('settings')).toMatchObject({ theme: 'light', dailyGoalMinutes: 75 });
    expect((await createBackup()).data.settings[0].theme).toBe('light');
  });
});
