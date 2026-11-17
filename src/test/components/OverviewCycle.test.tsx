import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../../components/ui/Toast';
import { OverviewScreen } from '../../screens/OverviewScreen';
import { db, resetDatabase } from '../../db/db';
import { cycleCompletions, nextCycleActivity } from '../../domain/schedule';
import { discardTimer, finishTimer, pauseTimer, startCycleTimer } from '../../services/timer';
import { createSession } from '../../services/sessions';
import { todayKey } from '../../lib/dates';

function next() {
  return nextCycleActivity({ disciplines: db.disciplines.toArraySync(), topics: db.topics.toArraySync(),
    sessions: db.sessions.toArraySync(), settings: db.settings.toArraySync()[0], questionLogs: [], errorNotes: [] });
}
function renderOverview() {
  return render(<ToastProvider><MemoryRouter><Routes>
    <Route path="/" element={<OverviewScreen />} />
    <Route path="/estudar-agora" element={<p>Cronômetro aberto</p>} />
    <Route path="/disciplinas" element={<p>Configuração de disciplinas</p>} />
    <Route path="/cronograma" element={<p>Ciclo completo</p>} />
  </Routes></MemoryRouter></ToastProvider>);
}
beforeEach(async () => { await resetDatabase(); });

describe('ciclo contínuo na visão geral', () => {
  it('prioriza o ciclo mesmo com sessão manual planejada e inicia o cronômetro do ciclo', async () => {
    const expected = next()!;
    await createSession({ date: todayKey(), disciplineId: expected.discipline.id, topicId: null,
      plannedStart: null, plannedMinutes: 15, objective: 'Compromisso manual', notes: '' });
    renderOverview();
    expect(screen.getByText('Próxima atividade do ciclo')).toBeInTheDocument();
    expect(screen.queryByText('Blocos de hoje')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Próximas atividades do ciclo' }).children).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar estudo do ciclo' }));
    expect(await screen.findByText('Cronômetro aberto')).toBeInTheDocument();
    const timer = await db.timer.get('active');
    expect(timer).toMatchObject({ cycleStudy: true, disciplineId: expected.discipline.id,
      topicId: expected.topic?.id ?? null, plannedSeconds: expected.minutes * 60, sessionId: null });
  });

  it('retoma uma sessão pausada sem criar outro cronômetro', async () => {
    await startCycleTimer(25);
    await pauseTimer();
    const previous = await db.timer.get('active');
    renderOverview();
    expect(screen.getByText('Sessão em andamento')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retomar sessão em andamento' }));
    expect(await screen.findByText('Cronômetro aberto')).toBeInTheDocument();
    expect(await db.timer.get('active')).toEqual(previous);
    expect(await db.timer.count()).toBe(1);
  });

  it('atualiza a sequência e o total diário apenas após concluir uma sessão do ciclo', async () => {
    renderOverview();
    const started = Date.now() - 60000;
    await act(async () => { await startCycleTimer(25, started); await discardTimer(); });
    expect(screen.getByText('Sessão 1')).toBeInTheDocument();
    expect(screen.getByText('0 sessões do ciclo concluídas hoje')).toBeInTheDocument();
    await act(async () => { await startCycleTimer(25, started); await finishTimer(started + 60000); });
    await waitFor(() => expect(screen.getByText('Sessão 2')).toBeInTheDocument());
    expect(screen.getByText('1 sessão do ciclo concluída hoje')).toBeInTheDocument();
    expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(1);
    const queue = screen.getByRole('list', { name: 'Próximas atividades do ciclo' });
    expect(within(queue).getByText('3.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver ciclo de estudos' }));
    expect(await screen.findByText('Ciclo completo')).toBeInTheDocument();
  });

  it('orienta a configurar disciplinas quando nenhuma está ativa', async () => {
    for (const discipline of db.disciplines.toArraySync()) await db.disciplines.update(discipline.id, { active: false });
    renderOverview();
    expect(screen.getByText('Seu ciclo começa com uma disciplina')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Próximas atividades do ciclo' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Configurar disciplinas' }));
    expect(await screen.findByText('Configuração de disciplinas')).toBeInTheDocument();
  });
});
