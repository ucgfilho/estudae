import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { db, ensureSeed } from '../../db/db';
import { setAuthSession } from '../../services/auth';
import { createSession } from '../../services/sessions';
import { startPlannedTimer } from '../../services/timer';
import { todayKey } from '../../lib/dates';

const TEST_SESSION = {
  token: 'test-jwt-token',
  tokenType: 'Bearer' as const,
  expiresIn: 3600,
  user: {
    id: 'user-test-1',
    name: 'Analista Teste',
    email: 'analista.teste@exemplo.local',
    createdAt: '2026-10-28T00:00:00.000Z',
  },
};

describe('App Navigation, Auth Gate and Screen Integration', () => {
  beforeEach(async () => {
    setAuthSession(null);
    await db.delete();
    await db.open();
    await ensureSeed();
    window.location.hash = '#/';
  });

  it('requires login or registration before entering the platform when unauthenticated', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /acesse sua conta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar na plataforma/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /cadastrar/i }));
    expect(screen.getByRole('heading', { name: /crie sua conta de estudos/i })).toBeInTheDocument();
  });

  it('renders overview screen when authenticated and loads 8 mandatory disciplines', async () => {
    setAuthSession(TEST_SESSION);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /visão geral/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /alterar tema/i })).not.toBeInTheDocument();

    // Check sidebar navigation items
    expect(screen.getByRole('link', { name: /visão geral/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendário/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ciclo de estudos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /estudar agora/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /questões/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /caderno de erros/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /revisões/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /simulados/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /disciplinas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /relatórios/i })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('link', { name: /configurações/i })).toBeInTheDocument();

    const disciplines = await db.disciplines.toArray();
    expect(disciplines).toHaveLength(8);
  });

  it('can navigate to all 10 primary screens without error', async () => {
    setAuthSession(TEST_SESSION);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /visão geral/i })).toBeInTheDocument();
    });

    // 1. Calendário
    await user.click(screen.getByRole('link', { name: /calendário/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /calendário/i })).toBeInTheDocument();
    });

    // 2. Cronograma
    await user.click(screen.getByRole('link', { name: /ciclo de estudos/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /ciclo de estudos/i })).toBeInTheDocument();
    });

    // 3. Estudar agora
    await user.click(screen.getByRole('link', { name: /estudar agora/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /estudar agora/i })).toBeInTheDocument();
    });

    // 4. Questões
    await user.click(screen.getByRole('link', { name: /questões/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /banco de questões/i })).toBeInTheDocument();
    });

    // 5. Caderno de erros
    await user.click(screen.getByRole('link', { name: /caderno de erros/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /caderno de erros/i })).toBeInTheDocument();
    });

    // 6. Revisões
    await user.click(screen.getByRole('link', { name: /revisões/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /revisões espaçadas/i })).toBeInTheDocument();
    });

    // 7. Disciplinas
    await user.click(screen.getByRole('link', { name: /disciplinas/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /disciplinas e conteúdos/i })).toBeInTheDocument();
      expect(screen.getAllByText('Língua Portuguesa').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Lógica de Programação').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Arquitetura de Software').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Engenharia de Software').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Linguagens e Tecnologias de Programação').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Banco de Dados').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Computação em Nuvem').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Raciocínio Lógico e Quantitativo').length).toBeGreaterThanOrEqual(1);
    });

    // 8. Relatórios
    await user.click(screen.getByRole('link', { name: /relatórios/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /relatórios/i })).toBeInTheDocument();
    });

    // 9. Configurações
    await user.click(within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('link', { name: /configurações/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /configurações/i })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Tema da plataforma')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /escuro|seguir o sistema/i })).not.toBeInTheDocument();
  });

  it('opens the continuous cycle without numbered weeks', async () => {
    setAuthSession(TEST_SESSION);
    window.location.hash = '#/cronograma';
    render(<App />);
    expect(await screen.findByRole('heading', { name: /ciclo de estudos/i })).toBeInTheDocument();
    expect(screen.getByText('Próxima atividade do ciclo')).toBeInTheDocument();
    expect(screen.queryByText(/Semana 2/)).not.toBeInTheDocument();
  });

  it('inicia o ciclo pela interface, retoma o cronômetro e salva no histórico', async () => {
    setAuthSession(TEST_SESSION);
    window.location.hash = '#/cronograma';
    const user = userEvent.setup();
    render(<App />);
    const start = await screen.findByRole('button', { name: /iniciar estudo do ciclo/i });
    const clock = vi.spyOn(Date, 'now');
    try {
      const now = Date.now();
      clock.mockReturnValue(now - 60000);
      await user.click(start);
      clock.mockReturnValue(now);
      await user.click(await screen.findByRole('button', { name: /^pausar$/i }));
      await user.click(await screen.findByRole('button', { name: /^continuar$/i }));
      await user.click(screen.getByRole('button', { name: /finalizar e salvar/i }));
      await waitFor(() => expect(db.sessions.toArraySync().filter(s => s.status === 'concluida')).toHaveLength(1));
      expect(await screen.findByRole('button', { name: /iniciar estudo do ciclo/i })).toBeInTheDocument();
      expect(db.timer.toArraySync()).toHaveLength(0);
    } finally { clock.mockRestore(); }
  });

  it('updates document.title with elapsed time and discipline name during an active timer session', async () => {
    setAuthSession(TEST_SESSION);
    const session = await createSession({
      date: todayKey(),
      disciplineId: 'portugues',
      topicId: null,
      plannedStart: null,
      plannedMinutes: 60,
      objective: 'Ortografia',
      notes: '',
    });

    await startPlannedTimer(session.id);

    render(<App />);

    await waitFor(() => {
      expect(document.title).toMatch(/▶ 00:00:00 - Língua Portuguesa/);
    });
  });
});
