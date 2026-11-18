import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../App';
import { db, ensureSeed } from '../../db/db';
import { setAuthSession, TEST_LOCAL_SESSION_ID } from '../../services/auth';
import { todayKey } from '../../lib/dates';
import type { StudySession } from '../../db/types';

function completedSession(id: string, minutes: number): StudySession {
  const now = new Date().toISOString();
  return {
    id,
    date: todayKey(),
    disciplineId: 'banco-dados',
    topicId: null,
    plannedStart: null,
    plannedMinutes: minutes,
    actualSeconds: minutes * 60,
    status: 'concluida',
    objective: '',
    notes: '',
    origin: 'avulsa',
    startedAt: now,
    endedAt: now,
    recoveredFromId: null,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('Celebration layer and daily mission', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureSeed();
    localStorage.clear();
    setAuthSession({
      sessionId: TEST_LOCAL_SESSION_ID,
      expiresIn: 3600,
      user: {
        id: 'test-user',
        name: 'Analista Teste',
        email: 'analista.teste@exemplo.local',
        createdAt: '2026-10-28T00:00:00.000Z',
      },
    });
    window.location.hash = '#/';
  });

  it('shows the daily mission card on the overview', async () => {
    render(<App />);
    // O painel e a rota são imports separados; a transformação inicial no Vitest pode exceder 1 s.
    expect(await screen.findByRole('heading', { name: /missão de hoje/i }, { timeout: 3000 })).toBeInTheDocument();
    const progressBars = screen.getAllByRole('progressbar', { name: /tempo estudado hoje em relação à meta diária/i });
    expect(progressBars.length).toBeGreaterThanOrEqual(1);
  });

  it('does not celebrate pre-existing data on load, but celebrates new achievements', async () => {
    await db.sessions.add(completedSession('old', 30));
    render(<App />);
    await screen.findByRole('heading', { name: /missão de hoje/i }, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /fechar aviso de conquista/i })).not.toBeInTheDocument();

    // Aguarda carregar dados iniciais antes de disparar nova conquista
    await waitFor(async () => {
      const all = await db.sessions.toArray();
      expect(all).toHaveLength(1);
    });
    // Aguarda um ciclo de render
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Completa mais 100 min: sessão concluída + meta diária (120 min) batida.
    await db.sessions.add(completedSession('new', 100));
    const close = await screen.findByRole('button', { name: /fechar aviso de conquista/i });
    expect(close).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('list', { name: /detalhes da conquista/i })).toHaveTextContent(/\+100 min/));
    expect(localStorage.getItem(`motivation:celebrated:daily-goal:${todayKey()}`)).toBe('1');
  });
});
