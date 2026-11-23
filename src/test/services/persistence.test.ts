import { startCycleTimer } from '../../services/timer';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, ensureSeed, resetDatabase } from '../../db/db';
import { setAuthSession, waitForPendingSync } from '../../services/auth';
import {
  createSession,
  rescheduleSession,
  recoverSession,
  moveSession,
  compareSessionsInDay,
  setSessionStatus,
} from '../../services/sessions';
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
  toCsv,
} from '../../services/backup';
import { completeReview, reconcileReviewsAndErrorNotes, saveErrorNote, saveQuestionLog, scheduleTopicReviews } from '../../services/performance';
import { createTopic, deleteAllTopics, setTopicStatus, updateTopic } from '../../services/topics';
import { computeRank } from '../../domain/rank';
import { reviewBuckets } from '../../domain/metrics';
import { addDays, todayKey } from '../../lib/dates';

describe('services/persistence & workflows', () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('exporta texto potencialmente interpretável como fórmula e mantém números tipados', () => {
    expect(toCsv(['Observação', 'Saldo'], [['@exemplo', -3], ['texto;com separador', 2]]))
      .toBe("\uFEFFObservação;Saldo\r\n'@exemplo;-3\r\n\"texto;com separador\";2");
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

  it.each(['dominado', 'concluido', 'em-andamento', 'nao-iniciado'] as const)('marca os subtópicos ao definir o pai como %s e reabre o pai ao reabrir um filho', async (status) => {
    const parent = await createTopic('portugues', null, { title: 'Coesão textual', status: 'nao-iniciado', notes: '' });
    const first = await createTopic('portugues', parent.id, { title: 'Referência', status: 'nao-iniciado', notes: '' });
    const second = await createTopic('portugues', parent.id, { title: 'Conectores', status: 'em-andamento', notes: '' });

    await setTopicStatus(parent.id, status);
    expect(db.topics.getSync(first.id)?.status).toBe(status);
    expect(db.topics.getSync(second.id)?.status).toBe(status);

    if (status === 'concluido' || status === 'dominado') {
      await setTopicStatus(first.id, 'concluido');
      expect(db.topics.getSync(parent.id)?.status).toBe(status);

      await updateTopic(first.id, { title: first.title, status: 'nao-iniciado', notes: '' });
      expect(db.topics.getSync(parent.id)?.status).toBe('em-andamento');
      expect(db.topics.getSync(second.id)?.status).toBe(status);

      await updateTopic(parent.id, { title: parent.title, status, notes: '' });
      expect(db.topics.getSync(first.id)?.status).toBe(status);
      await createTopic('portugues', parent.id, { title: 'Tempos verbais', status: 'nao-iniciado', notes: '' });
      expect(db.topics.getSync(parent.id)?.status).toBe('em-andamento');
    }
  });

  it('atualiza os subtópicos quando a conclusão de uma sessão conclui o tópico-pai', async () => {
    const parent = await createTopic('portugues', null, { title: 'Coesão textual', status: 'nao-iniciado', notes: '' });
    const child = await createTopic('portugues', parent.id, { title: 'Referência', status: 'nao-iniciado', notes: '' });
    const session = await createSession({
      date: '2026-10-14',
      disciplineId: 'portugues',
      topicId: parent.id,
      plannedStart: '19:00',
      plannedMinutes: 60,
      objective: 'Estudar coesão textual',
      notes: '',
    });

    await setSessionStatus(session.id, 'concluida');
    expect(db.topics.getSync(parent.id)?.status).toBe('concluido');
    expect(db.topics.getSync(child.id)?.status).toBe('concluido');
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
    const topic = await createTopic('portugues', null, { title: 'Crase', status: 'concluido', notes: '' });
    await setTopicStatus(topic.id, 'em-andamento');
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
    await db.topics.delete(topic.id);
    expect(await db.sessions.count()).toBe(0);

    if (validation.ok) {
      await restoreBackup(validation.backup);
      expect(await db.sessions.count()).toBe(1);
      expect(db.topics.getSync(topic.id)).toMatchObject({
        status: 'em-andamento', completionReuseDisabled: true,
      });
    }
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

    // Verify only the first review in the interval (1d) is created initially
    const reviews = await db.reviews.where('errorNoteId').equals(note.id).toArray();
    expect(reviews.length).toBe(1);
    expect(reviews[0].intervalDays).toBe(1);

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
  });

  it('releases the next review in the interval only when the current review is completed', async () => {
    const count = await scheduleTopicReviews('logica-programacao', null, 'Estruturas de Dados', '2026-10-15');
    expect(count).toBe(1);

    let reviews = await db.reviews.where('disciplineId').equals('logica-programacao').toArray();
    expect(reviews.map((r) => r.intervalDays)).toEqual([1]);

    // Completing 1d unlocks 7d
    await completeReview(reviews[0].id);
    reviews = await db.reviews.where('disciplineId').equals('logica-programacao').toArray();
    expect(reviews.map((r) => r.intervalDays).sort((a, b) => a - b)).toEqual([1, 7]);

    // Completing 7d unlocks 30d
    const review7d = reviews.find((r) => r.intervalDays === 7)!;
    await completeReview(review7d.id);
    reviews = await db.reviews.where('disciplineId').equals('logica-programacao').toArray();
    expect(reviews.map((r) => r.intervalDays).sort((a, b) => a - b)).toEqual([1, 7, 30]);

    // O último intervalo continua sendo repetido conforme a regra existente.
    const review30d = reviews.find((r) => r.intervalDays === 30)!;
    await completeReview(review30d.id);
    reviews = await db.reviews.where('disciplineId').equals('logica-programacao').toArray();
    expect(reviews.length).toBe(4);
    expect(reviews.filter(r => r.status === 'pendente').map(r => r.intervalDays)).toEqual([30]);
  });

  it('mantém a próxima revisão de um erro revisado na fila até a conclusão explícita', async () => {
    const today = todayKey();
    const firstDate = addDays(today, -7);
    const note = await saveErrorNote({
      disciplineId: 'arquitetura',
      topicId: null,
      questionLogId: null,
      sourceReference: 'Prova BNB · questão 65',
      errorType: 'falta-conteudo',
      explanation: 'Revisar microsserviços.',
      errorDate: addDays(firstDate, -1),
      status: 'revisar',
      nextReviewDate: null,
    }, { scheduleReviews: true });
    const [first] = await db.reviews.toArray();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(`${firstDate}T15:00:00Z`));
      await completeReview(first.id);
    } finally {
      vi.useRealTimers();
    }
    expect(await db.errorNotes.get(note.id)).toMatchObject({
      status: 'revisado', nextReviewDate: addDays(today, -1),
    });
    const before = await db.reviews.toArray();
    const [due] = reviewBuckets(before, today).overdue;
    expect(due).toMatchObject({ intervalDays: 7, status: 'pendente', completedAt: null });

    await reconcileReviewsAndErrorNotes();
    await reconcileReviewsAndErrorNotes();
    const after = await db.reviews.toArray();
    expect(after).toEqual(before);
    expect(computeRank({ sessions: [], reviews: after, settings: undefined, today }).todayXp).toBe(0);

    await completeReview(due.id);
    await reconcileReviewsAndErrorNotes();
    const completed = await db.reviews.toArray();
    expect(completed.filter((r) => r.status === 'concluida').map((r) => r.id)).toEqual([first.id, due.id]);
    expect(completed.filter((r) => r.status === 'pendente')).toMatchObject([{ intervalDays: 30 }]);
    expect(computeRank({ sessions: [], reviews: completed, settings: undefined, today }).todayXp).toBe(30);
  });

  it('synchronizes review dueDate when nextReviewDate is changed on an ErrorNote and prunes legacy future reviews', async () => {
    const note = await saveErrorNote(
      {
        disciplineId: 'arquitetura',
        topicId: null,
        questionLogId: null,
        sourceReference: 'Prova BNB 2022 · questão 65',
        errorType: 'falta-conteudo',
        explanation: 'Revisar microsserviços.',
        errorDate: '2026-11-09',
        status: 'revisar',
        nextReviewDate: null,
      },
      { scheduleReviews: true },
    );

    // Simulate legacy future reviews (7d, 30d) created before progressive feature
    await db.reviews.bulkAdd([
      {
        id: 'legacy-7d',
        disciplineId: 'arquitetura',
        topicId: null,
        errorNoteId: note.id,
        title: 'Erro: Prova BNB 2022 · questão 65',
        dueDate: '2026-11-16',
        intervalDays: 7,
        status: 'pendente',
        completedAt: null,
        createdAt: '2026-11-09T10:00:00.000Z',
      },
      {
        id: 'legacy-30d',
        disciplineId: 'arquitetura',
        topicId: null,
        errorNoteId: note.id,
        title: 'Erro: Prova BNB 2022 · questão 65',
        dueDate: '2026-12-09',
        intervalDays: 30,
        status: 'pendente',
        completedAt: null,
        createdAt: '2026-11-09T10:00:00.000Z',
      },
    ]);

    // User edits ErrorNote changing nextReviewDate from 2026-11-10 to 2026-11-16
    await saveErrorNote(
      {
        disciplineId: 'arquitetura',
        topicId: null,
        questionLogId: null,
        sourceReference: 'Prova BNB 2022 · questão 65',
        errorType: 'falta-conteudo',
        explanation: 'Revisar microsserviços.',
        errorDate: '2026-11-09',
        status: 'revisar',
        nextReviewDate: '2026-11-16',
      },
      { id: note.id },
    );

    const reviewsAfterEdit = await db.reviews.where('errorNoteId').equals(note.id).toArray();
    expect(reviewsAfterEdit.length).toBe(1);
    expect(reviewsAfterEdit[0].intervalDays).toBe(1);
    expect(reviewsAfterEdit[0].dueDate).toBe('2026-11-16');

    // Also verify reconcileReviewsAndErrorNotes heals pre-existing out-of-sync data
    await db.reviews.update(reviewsAfterEdit[0].id, { dueDate: '2026-11-10' });
    const res = await reconcileReviewsAndErrorNotes();
    expect(res.updatedReviews).toBe(1);
    const healed = await db.reviews.get(reviewsAfterEdit[0].id);
    expect(healed?.dueDate).toBe('2026-11-16');
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
      await startCycleTimer(30, 1000);
      await finishTimer(61000);

      const backup = await createBackup();
      const backupJson = JSON.stringify(backup);
      const expectedSessionCount = backup.data.sessions.length;
      expect(expectedSessionCount).toBe(2);

      // 2. Validate backup keeps isManual and order fields
      const validated = validateBackup(backupJson);
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;

      const validatedManual = validated.backup.data.sessions.find((s) => s.id === manual.id);
      expect(validatedManual?.isManual).toBe(true);
      expect(validatedManual?.order).toBe(0);

      // 3. Authenticate as Vercel user where GET /api/study-data returns 0 sessions (stale server state)
      setAuthSession({
        sessionId: 'real-vercel-jwt-token',
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
      expect(afterReloadPlans.length).toBe(0);
    } finally {
      setAuthSession(null);
      globalThis.fetch = originalFetch;
    }
  });

  it('loads newer server edits and deletions instead of restoring an acknowledged browser cache', async () => {
    const originalFetch = globalThis.fetch;

    try {
      setAuthSession({
        sessionId: 'real-vercel-jwt-token',
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
        if (url.endsWith('/api/study-data/batch') && init?.method === 'POST') {
          const { operations } = JSON.parse(String(init.body));
          for (const op of operations) {
            if (op.action === 'upsert') {
              const rows = new Map((serverWorkspace[op.table] as { id: string }[]).map((r) => [r.id, r]));
              for (const row of op.records) rows.set(row.id, row);
              serverWorkspace[op.table] = [...rows.values()];
            }
          }
        }
        return new Response(JSON.stringify({ ok: true, data: serverWorkspace }), { status: 200 });
      }) as typeof fetch;

      // 1. First load: server has 1 session and 0 topics -> should auto-seed the 148 official topics and keep the session
      db.clearMemory();
      await ensureSeed(db);

      const initialTopics = await db.topics.toArray();
      expect(initialTopics.length).toBe(148);
      expect(await db.sessions.count()).toBe(1);

      // 2. Acknowledge local edits, then simulate newer edits/deletions from another device.
      await db.topics.update(initialTopics[0].id, { status: 'concluido' });
      const customTopic = await createTopic('arquitetura', null, {
        title: 'Event Sourcing Avançado',
        status: 'em-andamento',
        notes: 'Revisar CQRS',
      });
      expect(await db.topics.count()).toBe(149);

      await waitForPendingSync();
      serverWorkspace.topics = (serverWorkspace.topics as { id: string; status: string }[])
        .filter((topic) => topic.id !== customTopic.id)
        .map((topic) => topic.id === initialTopics[0].id ? { ...topic, status: 'em-andamento' } : topic);

      db.clearMemory();
      await ensureSeed(db);

      const topicsAfterReload = await db.topics.toArray();
      expect(topicsAfterReload.length).toBe(148);
      expect(topicsAfterReload.find((t) => t.id === initialTopics[0].id)?.status).toBe('em-andamento');
      expect(topicsAfterReload.find((t) => t.id === customTopic.id)).toBeUndefined();
      expect(serverWorkspace.topics.length).toBe(148);
    } finally {
      setAuthSession(null);
      globalThis.fetch = originalFetch;
    }
  });
});
