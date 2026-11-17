import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, resetDatabase, createDatabase, reconcileWorkspaces } from '../../db/db';
import { DEFAULT_TOPICS } from '../../db/seed';
import { nextCycleActivity, cycleCompletions } from '../../domain/schedule';
import { startCycleTimer, pauseTimer, resumeTimer, finishTimer, discardTimer, startAdHocTimer } from '../../services/timer';
import { createBackup, restoreBackup, validateBackup } from '../../services/backup';
import { createSession, setSessionStatus } from '../../services/sessions';
import { completeReview, scheduleTopicReviews } from '../../services/performance';
import { setAuthSession } from '../../services/auth';

function next() {
  return nextCycleActivity({ disciplines: db.disciplines.toArraySync(), topics: db.topics.toArraySync(),
    sessions: db.sessions.toArraySync(), questionLogs: db.questionLogs.toArraySync(),
    errorNotes: db.errorNotes.toArraySync(), settings: db.settings.toArraySync()[0] });
}
beforeEach(async () => {
  setAuthSession(null);
  await resetDatabase();
  await db.topics.bulkAdd(DEFAULT_TOPICS);
});
describe('execução e persistência do ciclo', () => {
  it('pausa, retoma e conclui uma única vez mesmo com cliques concorrentes', async () => {
    const first = next();
    await startCycleTimer(30, 1000);
    await pauseTimer(61000);
    await resumeTimer(121000);
    const results = await Promise.all([finishTimer(181000), finishTimer(181000)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const saved = results.find(Boolean)!;
    expect(saved.actualSeconds).toBe(120);
    expect(saved.topicId).toBe(first?.topic?.id);
    expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(1);
    expect(next()?.discipline.id).not.toBe(first?.discipline.id);
    expect(await db.timer.count()).toBe(0);
    expect((await db.topics.get(saved.topicId!))?.status).not.toBe('dominado');
  });
  it('descarte, cancelamento e vários dias sem estudo preservam a posição', async () => {
    const first = next();
    await startCycleTimer(30, 1000);
    expect(next()).toEqual(first);
    await discardTimer();
    vi.useFakeTimers();
    try { vi.setSystemTime(new Date('2028-05-19')); expect(next()).toEqual(first); }
    finally { vi.useRealTimers(); }
    expect(await db.sessions.count()).toBe(0);
  });
  it('impede dois inícios concorrentes', async () => {
    const results = await Promise.allSettled([startCycleTimer(30), startCycleTimer(30)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('sessões manuais e revisões vencidas/concluídas não avançam o ciclo', async () => {
    const first = next();
    const manual = await createSession({ date: '2026-01-01', disciplineId: first!.discipline.id, topicId: null,
      plannedStart: null, plannedMinutes: 20, objective: '', notes: '' });
    await setSessionStatus(manual.id, 'concluida', 20);
    await scheduleTopicReviews(first!.discipline.id, null, 'Revisão independente', '2026-01-01');
    expect(next()?.discipline.id).toBe(first?.discipline.id);
    const review = (await db.reviews.toArray())[0];
    await completeReview(review.id);
    expect(next()?.discipline.id).toBe(first?.discipline.id);
    await startAdHocTimer({ disciplineId: first!.discipline.id, topicId: null, plannedMinutes: 20, objective: 'Revisar', notes: '' }, 1000);
    await finishTimer(61000);
    expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(0);
  });
  it('preserva posição e cronômetro ao recarregar, sincronizar e restaurar backup', async () => {
    await startCycleTimer(30, 1000);
    await finishTimer(61000);
    const expected = next();
    await startCycleTimer(25, 100000);
    const backup = await createBackup();
    const parsed = validateBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Backup inválido');
    db.clearMemory();
    await restoreBackup(parsed.backup);
    expect(next()).toEqual(expected);
    expect((await db.timer.get('active'))?.cycleStudy).toBe(true);
    const snapshot = db.exportWorkspaceSnapshot();
    const merged = reconcileWorkspaces(snapshot, { schemaRevision: 2, data: snapshot });
    db.hydrateFromWorkspace(merged.workspace);
    expect(next()).toEqual(expected);
    await finishTimer(160000);
    expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(2);
  });
  it('mantém concursos em workspaces isolados', async () => {
    const original = next();
    const firstContest = db.exportWorkspaceSnapshot();
    await startCycleTimer(20, 1000);
    await finishTimer(61000);
    const advanced = next();
    const secondContest = db.exportWorkspaceSnapshot();
    db.hydrateFromWorkspace(firstContest);
    expect(next()).toEqual(original);
    db.hydrateFromWorkspace(secondContest);
    expect(next()).toEqual(advanced);
    const otherUser = createDatabase();
    expect(cycleCompletions(otherUser.sessions.toArraySync())).toHaveLength(0);
  });
  it('aceita backup legado sem marcador de ciclo e preserva planos antigos', async () => {
    const backup = await createBackup();
    backup.data.weeklyPlans.push({ id: 'legacy', weekIndex: 1, weekStart: '2026-01-05', objectives: 'Legado', plannedContent: '', plannedMinutes: 60, status: 'pendente', notes: '' });
    const parsed = validateBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Backup legado inválido');
    await restoreBackup(parsed.backup);
    expect((await db.weeklyPlans.get('legacy'))?.weekStart).toBe('2026-01-05');
    expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(0);
    expect(next()).not.toBeNull();
  });
});
