import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, ensureSeed, resetDatabase } from '../../db/db';
import { setAuthSession } from '../../services/auth';
import {
  createSession,
  updateSession,
  deleteSession,
  rescheduleSession,
  recoverSession,
  setSessionStatus,
  moveSession,
  compareSessionsInDay,
} from '../../services/sessions';
import { weekScheduleMetrics } from '../../domain/metrics';
import {
  startPlannedTimer,
  pauseTimer,
  resumeTimer,
  finishTimer,
  getActiveTimer,
} from '../../services/timer';
import {
  createBackup,
  validateBackup,
  restoreBackup,
} from '../../services/backup';
import { generateSchedule, clearSchedule } from '../../services/schedule';
import { saveErrorNote, saveQuestionLog } from '../../services/performance';
import { createTopic, deleteAllTopics } from '../../services/topics';

describe('services/persistence & workflows', () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('initializes with the 8 mandatory disciplines and default settings', async () => {
    await ensureSeed(db);
    const disciplines = await db.disciplines.toArray();
    expect(disciplines.length).toBe(8);
    const ids = disciplines.map((d) => d.id);
    expect(ids).toContain('portugues');
    expect(ids).toContain('raciocinio');
    expect(ids).toContain('logica-programacao');
    expect(ids).toContain('arquitetura');
    expect(ids).toContain('engenharia');
    expect(ids).toContain('linguagens');
    expect(ids).toContain('banco-dados');
    expect(ids).toContain('nuvem');

    const settings = await db.settings.get('settings');
    expect(settings).toBeDefined();
    expect(settings?.dailyGoalMinutes).toBe(120);
    expect(settings?.weeklyGoalMinutes).toBe(840);
  });

  it('reschedules a planned session preserving history without data loss', async () => {
    const session = await createSession({
      date: '2026-10-14',
      disciplineId: 'arquitetura',
      topicId: null,
      plannedStart: '19:00',
      plannedMinutes: 60,
      objective: 'Estudar Microsserviços',
      notes: '',
    });

    expect(session.history.length).toBe(1);

    const rescheduled = await rescheduleSession(session.id, '2026-10-16', '20:00');
    expect(rescheduled.date).toBe('2026-10-16');
    expect(rescheduled.plannedStart).toBe('20:00');
    expect(rescheduled.history.length).toBe(2);
    expect(rescheduled.history[1].type).toBe('reagendada');
  });

  it('recovers an uncompleted session by marking the original as lost and creating a new linked session', async () => {
    const original = await createSession({
      date: '2026-10-12',
      disciplineId: 'engenharia',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 50,
      objective: 'Engenharia de Requisitos',
      notes: '',
    });

    const recovered = await recoverSession(original.id, '2026-10-15');
    expect(recovered.id).not.toBe(original.id);
    expect(recovered.date).toBe('2026-10-15');
    expect(recovered.recoveredFromId).toBe(original.id);
    expect(recovered.status).toBe('planejada');

    const updatedOriginal = await db.sessions.get(original.id);
    expect(updatedOriginal?.status).toBe('perdida');
    expect(updatedOriginal?.history.some((h) => h.type === 'recuperada')).toBe(true);
  });

  it('runs timer lifecycle, saves actual time to database, and prevents duplicate saves on repeated clicks', async () => {
    const session = await createSession({
      date: '2026-10-14',
      disciplineId: 'linguagens',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'TypeScript & Java',
      notes: 'Nota inicial',
    });

    const t0 = 100000;
    await startPlannedTimer(session.id, t0);
    expect(await getActiveTimer()).toBeDefined();

    // Pause after 30s
    await pauseTimer(t0 + 30 * 1000);
    expect((await getActiveTimer())?.status).toBe('paused');

    // Resume 10s later
    await resumeTimer(t0 + 40 * 1000);
    expect((await getActiveTimer())?.status).toBe('running');

    // Finish 30s after resume (total 60s studied)
    const finishTime = t0 + 70 * 1000;
    const finished = await finishTimer(finishTime);
    expect(finished).not.toBeNull();
    expect(finished?.status).toBe('concluida');
    expect(finished?.actualSeconds).toBe(60);

    // Active timer is cleared
    expect(await getActiveTimer()).toBeUndefined();

    // Verify persisted session in IndexedDB
    const persisted = await db.sessions.get(session.id);
    expect(persisted?.status).toBe('concluida');
    expect(persisted?.actualSeconds).toBe(60);

    // Repeated call to finishTimer (e.g. accidental double click) safely returns null and does not duplicate
    const secondCall = await finishTimer(finishTime);
    expect(secondCall).toBeNull();
  });

  it('creates, validates, and restores backups with schema checking', async () => {
    await createSession({
      date: '2026-10-14',
      disciplineId: 'nuvem',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 45,
      objective: 'AWS IAM & S3',
      notes: '',
    });

    const backup = await createBackup();
    expect(backup.app).toBe('bnb-estudos');
    expect(backup.schemaVersion).toBe(2);
    expect(backup.data.sessions.length).toBe(1);

    const jsonText = JSON.stringify(backup);
    const validation = validateBackup(jsonText);
    expect(validation.ok).toBe(true);

    // Corrupt validation check
    const invalidValidation = validateBackup('{"invalid": true}');
    expect(invalidValidation.ok).toBe(false);

    // Clear and restore
    await db.sessions.clear();
    expect(await db.sessions.count()).toBe(0);

    if (validation.ok) {
      await restoreBackup(validation.backup);
      expect(await db.sessions.count()).toBe(1);
    }
  });

  it('generates 24-week schedule from the specified start date even if start date is in the past', async () => {
    await ensureSeed(db);

    // Specify a Monday in the past compared to today (today is 2026-10-14, Monday was 2026-10-05)
    await generateSchedule('2026-10-05', '2026-10-14');

    const weeklyPlans = await db.weeklyPlans.orderBy('weekIndex').toArray();
    expect(weeklyPlans.length).toBe(24);
    expect(weeklyPlans[0].weekIndex).toBe(1);
    expect(weeklyPlans[0].weekStart).toBe('2026-10-04'); // Sunday

    const sessions = await db.sessions.toArray();
    expect(sessions.length).toBeGreaterThan(0);

    // Verify sessions were created starting on 2026-10-05 (and not dropped just because they are < today)
    const weekOneSessions = sessions.filter((s) => s.date >= '2026-10-05' && s.date <= '2026-10-10');
    expect(weekOneSessions.length).toBeGreaterThan(0);

    // Check setting was updated
    const settings = await db.settings.get('settings');
    expect(settings?.scheduleStartDate).toBe('2026-10-05');
  });

  it('preserves executed sessions when regenerating schedule with a new start date', async () => {
    await ensureSeed(db);

    // Create an executed session
    const executed = await createSession({
      date: '2026-10-08',
      disciplineId: 'arquitetura',
      topicId: null,
      plannedStart: '10:00',
      plannedMinutes: 60,
      objective: 'Arquitetura Hexagonal',
      notes: '',
    });
    await db.sessions.update(executed.id, {
      actualSeconds: 3600,
      status: 'concluida',
    });

    // Generate schedule starting from 2026-10-05
    await generateSchedule('2026-10-05', '2026-10-14');

    // Executed session must still exist
    const preserved = await db.sessions.get(executed.id);
    expect(preserved).toBeDefined();
    expect(preserved?.actualSeconds).toBe(3600);
    expect(preserved?.status).toBe('concluida');
  });

  it('generates schedule aligning weeks always from Sunday to Saturday while respecting user startDate', async () => {
    await ensureSeed(db);

    // User explicitly selects Thursday 2026-10-15
    await generateSchedule('2026-10-15');

    const weeklyPlans = await db.weeklyPlans.orderBy('weekIndex').toArray();
    expect(weeklyPlans.length).toBe(24);
    expect(weeklyPlans[0].weekIndex).toBe(1);
    expect(weeklyPlans[0].weekStart).toBe('2026-10-11'); // Starts on Sunday

    const sessions = await db.sessions.toArray();
    // Verify no sessions were created prior to 2026-10-15
    const sessionsBeforeStart = sessions.filter((s) => s.date < '2026-10-15');
    expect(sessionsBeforeStart.length).toBe(0);

    // Verify Week 1 sessions start on 2026-10-15 (Thu) and end on 2026-10-17 (Sat)
    const weekOneSessions = sessions.filter((s) => s.date >= '2026-10-11' && s.date <= '2026-10-17');
    expect(weekOneSessions.length).toBeGreaterThan(0);
    expect(weekOneSessions.every((s) => s.date >= '2026-10-15')).toBe(true);

    // Week 2 starts on the next Sunday (2026-10-18)
    expect(weeklyPlans[1].weekStart).toBe('2026-10-18');

    // Check setting saved exact date
    const settings = await db.settings.get('settings');
    expect(settings?.scheduleStartDate).toBe('2026-10-15');
  });

  it('clears schedule: deletes weekly plans and unexecuted planned sessions while preserving completed ones and resetting scheduleStartDate', async () => {
    await ensureSeed(db);

    // 1. Generate schedule
    await generateSchedule('2026-10-12');
    expect((await db.weeklyPlans.toArray()).length).toBe(24);
    expect((await db.sessions.toArray()).length).toBeGreaterThan(0);

    // 2. Mark one session as completed
    const firstSession = await db.sessions.toCollection().first();
    expect(firstSession).toBeDefined();
    await setSessionStatus(firstSession!.id, 'concluida', 60);

    // 3. Clear schedule
    await clearSchedule();

    // Weekly plans must be empty
    expect(await db.weeklyPlans.count()).toBe(0);

    // Only the completed session must remain
    const remainingSessions = await db.sessions.toArray();
    expect(remainingSessions).toHaveLength(1);
    expect(remainingSessions[0].id).toBe(firstSession!.id);
    expect(remainingSessions[0].status).toBe('concluida');
    expect(remainingSessions[0].actualSeconds).toBe(3600);

    // scheduleStartDate in settings must be null
    const settings = await db.settings.get('settings');
    expect(settings?.scheduleStartDate).toBeNull();
  });

  it('preserves pre-created manual sessions when generating 24 weeks schedule and when clearing schedule', async () => {
    await ensureSeed(db);

    // 1. User pre-creates a manual session via createSession (like in SessionModal)
    const manualSession = await createSession({
      date: '2026-10-14',
      disciplineId: 'arquitetura',
      topicId: null,
      plannedStart: '14:00',
      plannedMinutes: 60,
      objective: 'Estudo manual prévio de Arquitetura',
      notes: 'Minhas anotações',
    });

    expect(manualSession.isManual).toBe(true);

    // 2. User generates 24 weeks schedule
    await generateSchedule('2026-10-12');

    // 3. The pre-created session must still exist intact!
    const found = await db.sessions.get(manualSession.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(manualSession.id);
    expect(found?.disciplineId).toBe('arquitetura');
    expect(found?.plannedMinutes).toBe(60);
    expect(found?.objective).toBe('Estudo manual prévio de Arquitetura');
    expect(found?.isManual).toBe(true);

    // 4. On Wednesday (2026-10-14), there should not be another duplicate 'arquitetura' session generated
    const wednesdaySessions = await db.sessions.where('date').equals('2026-10-14').toArray();
    const wednesdayArq = wednesdaySessions.filter((s) => s.disciplineId === 'arquitetura');
    expect(wednesdayArq).toHaveLength(1);
    expect(wednesdayArq[0].id).toBe(manualSession.id);

    // 5. When clearing schedule, manual session should still be preserved
    await clearSchedule();
    const afterClear = await db.sessions.get(manualSession.id);
    expect(afterClear).toBeDefined();
    expect(afterClear?.id).toBe(manualSession.id);
  });

  it('saves an error note with scheduled reviews and persists in database linked to question log', async () => {
    await ensureSeed(db);

    const log = await saveQuestionLog({
      date: '2026-10-15',
      disciplineId: 'logica-programacao',
      topicId: null,
      source: 'CESPE 2024 BNB',
      total: 10,
      correct: 7,
      incorrect: 3,
      blank: 0,
      durationMinutes: null,
      notes: '',
    });

    const note = await saveErrorNote(
      {
        disciplineId: 'logica-programacao',
        topicId: null,
        questionLogId: log.id,
        sourceReference: 'CESPE 2024 BNB - Q5',
        errorType: 'falta-conteudo',
        explanation: 'Confundi operadores lógicos em laço while.',
        errorDate: '2026-10-15',
        status: 'revisar',
        nextReviewDate: null,
      },
      { scheduleReviews: true },
    );

    expect(note.id).toBeDefined();
    expect(note.questionLogId).toBe(log.id);
    expect(note.explanation).toBe('Confundi operadores lógicos em laço while.');

    // Verify it is in db.errorNotes
    const stored = await db.errorNotes.get(note.id);
    expect(stored).toBeDefined();
    expect(stored?.explanation).toBe('Confundi operadores lógicos em laço while.');
    expect(stored?.questionLogId).toBe(log.id);

    // Verify reviews were created
    const reviews = await db.reviews.where('errorNoteId').equals(note.id).toArray();
    expect(reviews.length).toBe(3); // 1, 7, 30 days

    // Reopen and update existing note
    const updatedNote = await saveErrorNote(
      {
        disciplineId: 'logica-programacao',
        topicId: null,
        questionLogId: log.id,
        sourceReference: 'CESPE 2024 BNB - Q5',
        errorType: 'desatencao',
        explanation: 'Confundi operadores lógicos em laço while. Re-lido com atenção.',
        errorDate: '2026-10-15',
        status: 'revisado',
        nextReviewDate: null,
      },
      { id: note.id },
    );

    expect(updatedNote.id).toBe(note.id);
    expect(updatedNote.errorType).toBe('desatencao');
    expect(updatedNote.explanation).toBe('Confundi operadores lógicos em laço while. Re-lido com atenção.');

    // Ensure count in db remains 1
    const allNotes = await db.errorNotes.toArray();
    const allNotesForLog = allNotes.filter((n) => n.questionLogId === log.id);
    expect(allNotesForLog.length).toBe(1);
    expect(allNotesForLog[0].explanation).toBe('Confundi operadores lógicos em laço while. Re-lido com atenção.');
  });

  it('moves a session to another date freely via drag and drop and preserves history', async () => {
    const session = await createSession({
      date: '2026-10-15',
      disciplineId: 'logica-programacao',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'Exercícios de recursão',
      notes: '',
    });

    expect(session.date).toBe('2026-10-15');

    // Move session to another date (e.g. 2026-10-18)
    const moved = await moveSession(session.id, '2026-10-18');
    expect(moved.id).toBe(session.id);
    expect(moved.date).toBe('2026-10-18');
    expect(moved.objective).toBe('Exercícios de recursão');
    expect(moved.plannedMinutes).toBe(60);

    const fromDb = await db.sessions.get(session.id);
    expect(fromDb?.date).toBe('2026-10-18');
    expect(fromDb?.history.some((h) => h.type === 'reagendada')).toBe(true);
  });

  it('reorders sessions within the same day and inserts at targetIndex across days via drag and drop', async () => {
    const s1 = await createSession({
      date: '2026-10-15',
      disciplineId: 'portugues',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 45,
      objective: 'Sessão 1',
      notes: '',
    });
    const s2 = await createSession({
      date: '2026-10-15',
      disciplineId: 'raciocinio',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'Sessão 2',
      notes: '',
    });
    const s3 = await createSession({
      date: '2026-10-15',
      disciplineId: 'arquitetura',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 90,
      objective: 'Sessão 3',
      notes: '',
    });

    // Move s3 to top of the same day (targetIndex = 0)
    await moveSession(s3.id, '2026-10-15', 0);

    const sameDaySorted = (await db.sessions.where('date').equals('2026-10-15').toArray()).sort(
      compareSessionsInDay
    );
    expect(sameDaySorted.map((s) => s.id)).toEqual([s3.id, s1.id, s2.id]);

    // Move s2 from 2026-10-15 into 2026-10-16 between two existing sessions
    const d1 = await createSession({
      date: '2026-10-16',
      disciplineId: 'engenharia',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'Dia 16 - A',
      notes: '',
    });
    const d2 = await createSession({
      date: '2026-10-16',
      disciplineId: 'linguagens',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'Dia 16 - B',
      notes: '',
    });

    await moveSession(s2.id, '2026-10-16', 1);

    const nextDaySorted = (await db.sessions.where('date').equals('2026-10-16').toArray()).sort(
      compareSessionsInDay
    );
    expect(nextDaySorted.map((s) => s.id)).toEqual([d1.id, s2.id, d2.id]);
  });

  it('deletes all topics by discipline or globally and unlinks foreign keys in sessions and question logs safely', async () => {
    await ensureSeed(db);

    const tPort1 = await createTopic('portugues', null, { title: 'Ortografia', status: 'nao-iniciado', notes: '' });
    const tPortSub = await createTopic('portugues', tPort1.id, { title: 'Acentuação', status: 'nao-iniciado', notes: '' });
    const tArq1 = await createTopic('arquitetura', null, { title: 'Microserviços', status: 'nao-iniciado', notes: '' });

    // Link a study session and question log to tPortSub
    const session = await createSession({
      date: '2026-10-20',
      disciplineId: 'portugues',
      topicId: tPortSub.id,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'Estudo de acentuação',
      notes: '',
    });

    const qLog = await saveQuestionLog({
      date: '2026-10-20',
      disciplineId: 'portugues',
      topicId: tPortSub.id,
      source: 'CESPE',
      total: 10,
      correct: 8,
      incorrect: 2,
      blank: 0,
      durationMinutes: 30,
      notes: '',
    });

    expect(session.topicId).toBe(tPortSub.id);
    expect(qLog.topicId).toBe(tPortSub.id);

    // 1. Delete all topics only for portugues
    const deletedCount = await deleteAllTopics('portugues');
    expect(deletedCount).toBe(2);

    // Verify portugues topics are gone
    const remainingPort = await db.topics.where('disciplineId').equals('portugues').toArray();
    expect(remainingPort).toHaveLength(0);

    // Verify arquitetura topic is still intact
    const remainingArq = await db.topics.where('disciplineId').equals('arquitetura').toArray();
    expect(remainingArq).toHaveLength(1);
    expect(remainingArq[0].id).toBe(tArq1.id);

    // Verify linked session and question log preserved their data, with topicId unlinked (null)
    const storedSession = await db.sessions.get(session.id);
    expect(storedSession).toBeDefined();
    expect(storedSession?.topicId).toBeNull();
    expect(storedSession?.objective).toBe('Estudo de acentuação');

    const storedLog = await db.questionLogs.get(qLog.id);
    expect(storedLog).toBeDefined();
    expect(storedLog?.topicId).toBeNull();
    expect(storedLog?.correct).toBe(8);

    // 2. Delete all topics across all disciplines
    const deletedTotal = await deleteAllTopics(null);
    expect(deletedTotal).toBe(1); // the remaining arquitetura topic

    const allTopics = await db.topics.toArray();
    expect(allTopics).toHaveLength(0);
  });

  it('correctly calculates week 1 metrics when schedule is generated on a Thursday (2026-10-22) aligning Sunday to Saturday', async () => {
    await ensureSeed(db);

    // Geração no dia 22/10/2026 (Quinta-feira)
    await generateSchedule('2026-10-22');

    const weeklyPlans = await db.weeklyPlans.orderBy('weekIndex').toArray();
    expect(weeklyPlans[0].weekStart).toBe('2026-10-18'); // Domingo anterior

    const sessions = await db.sessions.toArray();

    // Sessões da Semana 1 (18/10 a 24/10): somente Quinta (22/10), Sexta (23/10) e Sábado (24/10)
    const weekOneSessions = sessions.filter((s) => s.date >= '2026-10-18' && s.date <= '2026-10-24');
    expect(weekOneSessions.length).toBe(5); // 2 na qui, 2 na sex, 1 simulado no sáb
    expect(weekOneSessions.every((s) => s.date >= '2026-10-22' && s.date <= '2026-10-24')).toBe(true);

    // Sessões da Semana 2 (25/10 a 31/10): Segunda (26/10), Terça (27/10), Quarta (28/10), etc.
    const weekTwoSessions = sessions.filter((s) => s.date >= '2026-10-25' && s.date <= '2026-10-31');
    expect(weekTwoSessions.length).toBe(11);
    expect(weekTwoSessions.some((s) => s.date === '2026-10-26')).toBe(true);
    expect(weekTwoSessions.some((s) => s.date === '2026-10-27')).toBe(true);
    expect(weekTwoSessions.some((s) => s.date === '2026-10-28')).toBe(true);

    // Conclusão de 1 sessão na quinta-feira de 57 min
    const firstThuSession = weekOneSessions.find((s) => s.date === '2026-10-22')!;
    await setSessionStatus(firstThuSession.id, 'concluida', 57);

    const updatedSessions = await db.sessions.toArray();
    const updatedWeekOne = updatedSessions.filter((s) => s.date >= '2026-10-18' && s.date <= '2026-10-24');
    const doneCount = updatedWeekOne.filter((s) => s.status === 'concluida').length;
    expect(doneCount).toBe(1);
    expect(updatedWeekOne.length).toBe(5); // 1 de 5 sessões (e não 1 de 11!)
  });

  it('synchronizes WeeklyPlan plannedMinutes, status, and weekScheduleMetrics when deleting, editing, or completing sessions', async () => {
    await ensureSeed(db);
    await generateSchedule('2026-10-18');

    const initialSessions = (await db.sessions.toArray()).filter(
      (s) => s.date >= '2026-10-18' && s.date <= '2026-10-24'
    );
    expect(initialSessions.length).toBeGreaterThan(2);

    // Delete 2 generated sessions that could not be performed
    await deleteSession(initialSessions[0].id);
    await deleteSession(initialSessions[1].id);

    // Edit one session's plannedMinutes
    const targetToEdit = initialSessions[2];
    await updateSession(targetToEdit.id, {
      date: targetToEdit.date,
      disciplineId: targetToEdit.disciplineId,
      topicId: targetToEdit.topicId,
      plannedStart: targetToEdit.plannedStart,
      plannedMinutes: 90,
      objective: targetToEdit.objective,
      notes: targetToEdit.notes,
    });

    const afterAdjustSessions = (await db.sessions.toArray()).filter(
      (s) => s.date >= '2026-10-18' && s.date <= '2026-10-24'
    );
    const expectedTotalMinutes = afterAdjustSessions.reduce((acc, s) => acc + s.plannedMinutes, 0);

    const planAfterAdjust = (await db.weeklyPlans.orderBy('weekIndex').toArray())[0];
    expect(planAfterAdjust.plannedMinutes).toBe(expectedTotalMinutes);
    expect(planAfterAdjust.status).toBe('pendente');

    // Complete all remaining sessions in Week 1
    for (const s of afterAdjustSessions) {
      await setSessionStatus(s.id, 'concluida');
    }

    const finalSessions = await db.sessions.toArray();
    const metrics = weekScheduleMetrics(finalSessions, '2026-10-18', '2026-10-24');
    expect(metrics.totalSessions).toBe(afterAdjustSessions.length);
    expect(metrics.completedSessions).toBe(afterAdjustSessions.length);
    expect(metrics.plannedMinutes).toBe(expectedTotalMinutes);
    expect(metrics.doneMinutes).toBe(expectedTotalMinutes);
    expect(metrics.completionRate).toBe(100);

    const planFinal = (await db.weeklyPlans.orderBy('weekIndex').toArray())[0];
    expect(planFinal.plannedMinutes).toBe(expectedTotalMinutes);
    expect(planFinal.status).toBe('concluida');
  });

  it('preserves all 24-week schedule sessions across page reload on Vercel even when serverless instance has only partial sessions on 03/11', async () => {
    const originalFetch = globalThis.fetch;
    const putWorkspacePayloads: Record<string, unknown[]>[] = [];

    try {
      setAuthSession({
        token: 'real-vercel-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 604800,
        user: {
          id: 'user-vercel-1',
          name: 'Usuário BNB',
          email: 'usuario.bnb@exemplo.com',
          createdAt: '2026-11-02T00:00:00.000Z',
        },
      });

      // Mock fetch during schedule generation
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/study-data/workspace') && init?.method === 'PUT') {
          const payload = JSON.parse(String(init.body)) as Record<string, unknown[]>;
          putWorkspacePayloads.push(payload);
          return new Response(JSON.stringify({ ok: true, data: payload }), { status: 200 });
        }
        if (url.endsWith('/api/study-data/batch') && init?.method === 'POST') {
          return new Response(JSON.stringify({ ok: true, data: db.exportWorkspaceSnapshot() }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ data: db.exportWorkspaceSnapshot() }), { status: 200 });
      }) as typeof fetch;

      // 1. Pre-existing manual sessions on Tuesday 03/11 (as in the screenshot)
      const sArq = await createSession({
        date: '2026-11-03',
        disciplineId: 'arquitetura',
        topicId: null,
        plannedStart: null,
        plannedMinutes: 60,
        objective: 'Arquitetura de software.',
        notes: '',
      });
      const sLog = await createSession({
        date: '2026-11-03',
        disciplineId: 'logica-programacao',
        topicId: null,
        plannedStart: null,
        plannedMinutes: 60,
        objective: 'Construção de algoritmos.',
        notes: '',
      });

      // 2. Generate 24-week schedule starting on 2026-11-03
      await generateSchedule('2026-11-03', '2026-11-02');

      const allBeforeReload = await db.sessions.toArray();
      expect(allBeforeReload.length).toBeGreaterThan(200);
      const subsequentDaysBefore = allBeforeReload.filter((s) => s.date > '2026-11-03');
      expect(subsequentDaysBefore.length).toBeGreaterThan(200);

      // 3. Simulate Vercel page reload hitting a serverless instance that only has the 2 sessions on 03/11
      const partialRemoteWorkspace = {
        ...db.exportWorkspaceSnapshot(),
        sessions: [sArq, sLog],
      };

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/study-data') && (!init?.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ data: partialRemoteWorkspace }), { status: 200 });
        }
        if (url.endsWith('/api/study-data/workspace') && init?.method === 'PUT') {
          const payload = JSON.parse(String(init.body)) as Record<string, unknown[]>;
          putWorkspacePayloads.push(payload);
          return new Response(JSON.stringify({ ok: true, data: payload }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch;

      // Clear in-memory DB to simulate fresh browser reload reading from localStorage + API
      db.clearMemory();
      await ensureSeed(db);

      const allAfterReload = await db.sessions.toArray();
      expect(allAfterReload.length).toBe(allBeforeReload.length);
      const subsequentDaysAfter = allAfterReload.filter((s) => s.date > '2026-11-03');
      expect(subsequentDaysAfter.length).toBe(subsequentDaysBefore.length);

      // Verify Wednesday 04/11, Thursday 05/11, Friday 06/11, Saturday 07/11 all have their sessions intact
      expect(allAfterReload.some((s) => s.date === '2026-11-04')).toBe(true);
      expect(allAfterReload.some((s) => s.date === '2026-11-05')).toBe(true);
      expect(allAfterReload.some((s) => s.date === '2026-11-06')).toBe(true);
      expect(allAfterReload.some((s) => s.date === '2026-11-07')).toBe(true);

      // Verify server was healed with the full session list
      const lastPut = putWorkspacePayloads[putWorkspacePayloads.length - 1];
      expect(lastPut).toBeDefined();
      expect(lastPut.sessions.length).toBe(allBeforeReload.length);
    } finally {
      setAuthSession(null);
      globalThis.fetch = originalFetch;
    }
  });

  it('restores JSON backup preserving all schedule sessions, isManual, and order without being overwritten on Vercel', async () => {
    const originalFetch = globalThis.fetch;

    try {
      // 1. Build a full schedule + manual session and export backup JSON
      const manual = await createSession({
        date: '2026-11-03',
        disciplineId: 'arquitetura',
        topicId: null,
        plannedStart: null,
        plannedMinutes: 60,
        objective: 'Arquitetura de software.',
        notes: '',
      });
      await moveSession(manual.id, '2026-11-03', 0);
      await generateSchedule('2026-11-03', '2026-11-02');

      const backup = await createBackup();
      const backupJson = JSON.stringify(backup);
      const expectedSessionCount = backup.data.sessions.length;
      expect(expectedSessionCount).toBeGreaterThan(200);

      // 2. Validate backup keeps isManual and order fields
      const validated = validateBackup(backupJson);
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;

      const validatedManual = validated.backup.data.sessions.find((s) => s.id === manual.id);
      expect(validatedManual?.isManual).toBe(true);
      expect(validatedManual?.order).toBe(0);

      // 3. Authenticate as Vercel user where GET /api/study-data returns 0 sessions (stale server state)
      setAuthSession({
        token: 'real-vercel-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 604800,
        user: {
          id: 'user-vercel-2',
          name: 'Usuário Backup',
          email: 'backup.bnb@exemplo.com',
          createdAt: '2026-11-02T00:00:00.000Z',
        },
      });

      await resetDatabase(db);
      expect(await db.sessions.count()).toBe(0);

      let serverWorkspace: Record<string, unknown[]> = {
        ...db.exportWorkspaceSnapshot(),
        sessions: [],
        weeklyPlans: [],
      };

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/study-data') && (!init?.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ data: serverWorkspace }), { status: 200 });
        }
        if (url.endsWith('/api/study-data/workspace') && init?.method === 'PUT') {
          serverWorkspace = JSON.parse(String(init.body)) as Record<string, unknown[]>;
          return new Response(JSON.stringify({ ok: true, data: serverWorkspace }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, data: serverWorkspace }), { status: 200 });
      }) as typeof fetch;

      // 4. Restore backup and verify sessions are preserved both before and after reload
      await restoreBackup(validated.backup);

      const restoredSessions = await db.sessions.toArray();
      expect(restoredSessions.length).toBe(expectedSessionCount);
      expect(serverWorkspace.sessions.length).toBe(expectedSessionCount);

      // Simulate page reload after backup import
      db.clearMemory();
      await ensureSeed(db);

      const afterReloadSessions = await db.sessions.toArray();
      expect(afterReloadSessions.length).toBe(expectedSessionCount);
      const afterReloadPlans = await db.weeklyPlans.toArray();
      expect(afterReloadPlans.length).toBe(24);
    } finally {
      setAuthSession(null);
      globalThis.fetch = originalFetch;
    }
  });

  it('preserves discipline topics, edits, and deletions across page reloads on Vercel even when server returns empty or stale topics', async () => {
    const originalFetch = globalThis.fetch;

    try {
      setAuthSession({
        token: 'real-vercel-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 604800,
        user: {
          id: 'user-vercel-topics',
          name: 'Usuário Tópicos',
          email: 'topicos.bnb@exemplo.com',
          createdAt: '2026-11-02T00:00:00.000Z',
        },
      });

      window.localStorage.removeItem('bnb_workspace_cache_v1:topicos.bnb@exemplo.com');

      let serverWorkspace: Record<string, unknown[]> = {
        disciplines: [],
        topics: [],
        sessions: [
          {
            id: 'partial-session-1',
            date: '2026-11-03',
            disciplineId: 'arquitetura',
            topicId: null,
            plannedStart: null,
            plannedMinutes: 60,
            actualSeconds: 0,
            status: 'planejada',
            objective: 'Arquitetura de software.',
            notes: '',
            origin: 'planejada',
            startedAt: null,
            endedAt: null,
            recoveredFromId: null,
            isManual: true,
            history: [],
            createdAt: '2026-11-02T00:00:00.000Z',
            updatedAt: '2026-11-02T00:00:00.000Z',
          },
        ],
        timer: [],
        questionLogs: [],
        errorNotes: [],
        reviews: [],
        weeklyPlans: [],
        settings: [],
        mockExams: [],
      };

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/study-data') && (!init?.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ data: serverWorkspace }), { status: 200 });
        }
        if (url.endsWith('/api/study-data/workspace') && init?.method === 'PUT') {
          serverWorkspace = JSON.parse(String(init.body)) as Record<string, unknown[]>;
          return new Response(JSON.stringify({ ok: true, data: serverWorkspace }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, data: serverWorkspace }), { status: 200 });
      }) as typeof fetch;

      // 1. First load: server has 1 session and 0 topics -> should auto-seed the 148 official topics and keep the session
      db.clearMemory();
      await ensureSeed(db);

      const initialTopics = await db.topics.toArray();
      expect(initialTopics.length).toBe(148);
      expect(await db.sessions.count()).toBe(1);

      // 2. User marks a topic as concluido and adds a custom topic, then server cold-starts (returns 0 topics on reload)
      await db.topics.update(initialTopics[0].id, { status: 'concluido' });
      const customTopic = await createTopic('arquitetura', null, {
        title: 'Event Sourcing Avançado',
        status: 'em-andamento',
        notes: 'Revisar CQRS',
      });
      expect(await db.topics.count()).toBe(149);

      // Simulate server cold start losing all topics while keeping only 1 session
      serverWorkspace = {
        ...serverWorkspace,
        topics: [],
      };

      db.clearMemory();
      await ensureSeed(db);

      const topicsAfterReload = await db.topics.toArray();
      expect(topicsAfterReload.length).toBe(149);
      expect(topicsAfterReload.find((t) => t.id === initialTopics[0].id)?.status).toBe('concluido');
      expect(topicsAfterReload.find((t) => t.id === customTopic.id)?.title).toBe(
        'Event Sourcing Avançado',
      );
      expect(serverWorkspace.topics.length).toBe(149);
    } finally {
      setAuthSession(null);
      globalThis.fetch = originalFetch;
    }
  });
});
