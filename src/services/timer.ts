import { db } from '../db/db';
import { ACTIVE_TIMER_ID, type StudySession, type TimerState } from '../db/types';
import { elapsedSeconds, pausedState, resumedState } from '../domain/timer';
import { toDateKey } from '../lib/dates';
import { createId, nowIso } from '../lib/utils';
import { formatMinutes } from '../lib/format';
import { MAX_SESSION_MINUTES, ValidationError, syncTopicStatusAfterSession, syncWeeklyPlansWithSessions } from './sessions';

export interface AdHocTimerInput {
  disciplineId: string;
  topicId: string | null;
  objective: string;
  plannedMinutes: number;
  notes: string;
}

export async function getActiveTimer(): Promise<TimerState | undefined> {
  return db.timer.get(ACTIVE_TIMER_ID);
}

const ALREADY_ACTIVE = 'Já existe uma sessão em andamento. Finalize ou descarte a sessão atual antes de iniciar outra.';

/** Inicia o cronômetro para uma sessão planejada. Operação atômica: evita duplicação. */
export async function startPlannedTimer(sessionId: string, now: number = Date.now()): Promise<TimerState> {
  return db.transaction('rw', db.timer, db.sessions, async () => {
    if (await db.timer.get(ACTIVE_TIMER_ID)) throw new ValidationError(ALREADY_ACTIVE);
    const session = await db.sessions.get(sessionId);
    if (!session) throw new ValidationError('Sessão não encontrada.');
    if (session.status !== 'planejada') {
      throw new ValidationError('Somente sessões planejadas podem ser iniciadas. Reagende ou recupere esta sessão para estudar novamente.');
    }
    const state: TimerState = {
      id: ACTIVE_TIMER_ID,
      sessionId,
      status: 'running',
      startedAt: now,
      firstStartedAt: now,
      accumulatedSeconds: 0,
      plannedSeconds: session.plannedMinutes * 60,
      disciplineId: session.disciplineId,
      topicId: session.topicId,
      objective: session.objective,
      notes: '',
      updatedAt: now,
    };
    await db.timer.add(state);
    return state;
  });
}

/** Inicia uma sessão avulsa (sem planejamento prévio). */
export async function startAdHocTimer(input: AdHocTimerInput, now: number = Date.now()): Promise<TimerState> {
  if (!input.disciplineId) throw new ValidationError('Selecione a disciplina.');
  if (!Number.isInteger(input.plannedMinutes) || input.plannedMinutes < 1 || input.plannedMinutes > MAX_SESSION_MINUTES) {
    throw new ValidationError(`A duração pretendida deve ser um número inteiro entre 1 e ${MAX_SESSION_MINUTES} minutos.`);
  }
  return db.transaction('rw', db.timer, async () => {
    if (await db.timer.get(ACTIVE_TIMER_ID)) throw new ValidationError(ALREADY_ACTIVE);
    const state: TimerState = {
      id: ACTIVE_TIMER_ID,
      sessionId: null,
      status: 'running',
      startedAt: now,
      firstStartedAt: now,
      accumulatedSeconds: 0,
      plannedSeconds: input.plannedMinutes * 60,
      disciplineId: input.disciplineId,
      topicId: input.topicId,
      objective: input.objective.trim(),
      notes: input.notes,
      updatedAt: now,
    };
    await db.timer.add(state);
    return state;
  });
}

export async function pauseTimer(now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.timer, async () => {
    const state = await db.timer.get(ACTIVE_TIMER_ID);
    if (!state) throw new ValidationError('Nenhuma sessão em andamento.');
    await db.timer.put(pausedState(state, now));
  });
}

export async function resumeTimer(now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.timer, async () => {
    const state = await db.timer.get(ACTIVE_TIMER_ID);
    if (!state) throw new ValidationError('Nenhuma sessão em andamento.');
    await db.timer.put(resumedState(state, now));
  });
}

export async function updateTimerNotes(notes: string): Promise<void> {
  await db.timer.update(ACTIVE_TIMER_ID, { notes, updatedAt: Date.now() });
}

/**
 * Finaliza o cronômetro e salva o tempo efetivamente estudado.
 * Executado em transação: cliques repetidos não geram sessões duplicadas,
 * pois a segunda chamada não encontra mais o estado ativo e retorna `null`.
 */
export async function finishTimer(now: number = Date.now()): Promise<StudySession | null> {
  return db.transaction('rw', db.timer, db.sessions, db.weeklyPlans, db.topics, async () => {
    const state = await db.timer.get(ACTIVE_TIMER_ID);
    if (!state) return null;
    const elapsed = elapsedSeconds(state, now);
    if (elapsed < 1) throw new ValidationError('Nenhum tempo foi registrado. Continue a sessão ou descarte-a.');
    const startedIso = new Date(state.firstStartedAt).toISOString();
    const endedIso = new Date(now).toISOString();
    const timestamp = nowIso();
    const notes = state.notes.trim();
    let saved: StudySession;

    if (state.sessionId) {
      const session = await db.sessions.get(state.sessionId);
      if (!session) throw new ValidationError('A sessão planejada vinculada não existe mais. Descarte o cronômetro.');
      saved = {
        ...session,
        topicId: state.topicId,
        actualSeconds: session.actualSeconds + elapsed,
        status: 'concluida',
        startedAt: startedIso,
        endedAt: endedIso,
        notes: [session.notes, notes].filter(Boolean).join('\n\n'),
        history: [...session.history, { at: timestamp, type: 'executada', description: `Estudo registrado pelo cronômetro: ${formatMinutes(elapsed / 60)}.` }],
        updatedAt: timestamp,
      };
      await db.sessions.put(saved);
    } else {
      saved = {
        id: createId(),
        date: toDateKey(state.firstStartedAt),
        disciplineId: state.disciplineId,
        topicId: state.topicId,
        plannedStart: null,
        plannedMinutes: Math.max(1, Math.round(state.plannedSeconds / 60)),
        actualSeconds: elapsed,
        status: 'concluida',
        objective: state.objective,
        notes,
        origin: 'avulsa',
        startedAt: startedIso,
        endedAt: endedIso,
        recoveredFromId: null,
        history: [{ at: timestamp, type: 'executada', description: `Sessão avulsa registrada pelo cronômetro: ${formatMinutes(elapsed / 60)}.` }],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.sessions.add(saved);
    }
    await db.timer.delete(ACTIVE_TIMER_ID);
    await syncTopicStatusAfterSession(saved.topicId);
    await syncWeeklyPlansWithSessions();
    return saved;
  });
}

/** Descarta o cronômetro sem salvar tempo (a sessão planejada permanece inalterada). */
export async function discardTimer(): Promise<void> {
  await db.timer.delete(ACTIVE_TIMER_ID);
}
