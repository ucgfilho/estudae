import { isRetiredPlannedSession } from '../domain/schedule';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { ACTIVE_TIMER_ID, SETTINGS_ID } from '../db/types';
import { todayKey } from '../lib/dates';

/*
 * Hooks de leitura reativa conectados ao store sincronizado com o banco de dados do usuário.
 */

function useReactiveQuery<T>(reader: () => T): T {
  const [state, setState] = useState<T>(() => reader());

  useEffect(() => {
    setState(reader());
    return db.subscribe(() => {
      setState(reader());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

export function useDisciplines() {
  return useReactiveQuery(() =>
    db.disciplines.toArraySync().sort((a, b) => a.order - b.order),
  );
}

export function useTopics() {
  return useReactiveQuery(() => db.topics.toArraySync());
}

export function useSessions() {
  return useReactiveQuery(() => db.sessions.toArraySync().filter(s => !isRetiredPlannedSession(s)));
}

export function useQuestionLogs() {
  return useReactiveQuery(() => db.questionLogs.toArraySync());
}

export function useErrorNotes() {
  return useReactiveQuery(() => db.errorNotes.toArraySync());
}

export function useReviews() {
  return useReactiveQuery(() => db.reviews.toArraySync());
}

export function useMockExams() {
  return useReactiveQuery(() => db.mockExams.toArraySync());
}

export function useSettings() {
  return useReactiveQuery(() => db.settings.getSync(SETTINGS_ID));
}

/** `null` quando não há cronômetro ativo. */
export function useActiveTimer() {
  return useReactiveQuery(() => db.timer.getSync(ACTIVE_TIMER_ID) ?? null);
}

/** Instante atual, atualizado periodicamente (apenas para re-renderização). */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
  return now;
}

/** Data de hoje (America/Bahia), atualizada na virada do dia. */
export function useToday(): string {
  const now = useNow(30_000);
  return todayKey(now);
}
