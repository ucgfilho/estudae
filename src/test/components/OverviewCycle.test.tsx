import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../../components/ui/Toast';
import { OverviewScreen } from '../../screens/OverviewScreen';
import { ScheduleScreen } from '../../screens/ScheduleScreen';
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
  it('mostra e exclui a sessão planejada logo após a atividade atual na fila do ciclo', async () => {
    const activity = next()!;
    const session = await createSession({ date: todayKey(), disciplineId: activity.discipline.id, topicId: null,
      plannedStart: '19:30', plannedMinutes: 35, objective: 'Compromisso manual', notes: '' });
    await db.sessions.update(session.id, { isManual: undefined });
    render(<MemoryRouter><ScheduleScreen /></MemoryRouter>);

    const queue = screen.getByRole('list', { name: 'Próximos estudos do ciclo' });
    const firstItem = within(queue).getAllByRole('listitem')[0];
    expect(within(firstItem).getByText('Criada por você')).toBeInTheDocument();
    expect(within(firstItem).getByText('Compromisso manual')).toBeInTheDocument();
    expect(within(firstItem).getByText(/19:30/)).toBeInTheDocument();
    expect(within(queue).getAllByRole('button', { name: /^Excluir sessão \d/ }).length).toBeGreaterThan(0);
    await userEvent.click(within(firstItem).getByRole('button', { name: 'Excluir sessão planejada: Compromisso manual' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir sessão' }));
    await waitFor(() => expect(within(queue).queryByText('Compromisso manual')).not.toBeInTheDocument());
    expect(await db.sessions.get(session.id)).toBeUndefined();
  });

  it('conclui sessão planejada e sessão do ciclo pela fila contabilizando o tempo previsto', async () => {
    const activity = next()!;
    const manual = await createSession({ date: todayKey(), disciplineId: activity.discipline.id, topicId: null,
      plannedStart: '19:30', plannedMinutes: 20, objective: 'Revisão manual', notes: '' });
    render(<MemoryRouter><ScheduleScreen /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: 'Ver ciclo completo' }));
    const queue = screen.getByRole('list', { name: 'Próximos estudos do ciclo' });
    const plannedCard = within(queue).getByText('Criada por você').closest('li')!;
    const buttons = within(plannedCard).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Concluir sessão planejada: Revisão manual');
    expect(buttons[1]).toHaveAccessibleName('Excluir sessão planejada: Revisão manual');
    expect(buttons[0].className).toContain('text-success');
    expect(buttons[0].className).toContain('action-button');

    await userEvent.click(buttons[0]);
    await waitFor(() => expect(within(queue).queryByText('Revisão manual')).not.toBeInTheDocument());
    const savedManual = await db.sessions.get(manual.id);
    expect(savedManual?.status).toBe('concluida');
    expect(savedManual?.actualSeconds).toBe(20 * 60);

    const completeCycleBtn = within(queue).getAllByRole('button', { name: /^Concluir sessão \d/ })[0];
    await userEvent.click(completeCycleBtn);
    await waitFor(() => expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(1));
    const [cycleDone] = cycleCompletions(db.sessions.toArraySync());
    expect(cycleDone.status).toBe('concluida');
    expect(cycleDone.actualSeconds).toBe(cycleDone.plannedMinutes * 60);
    expect(cycleDone.actualSeconds).toBe(activity.minutes * 60);
  });

  it('conclui e exclui a próxima atividade do ciclo pelo próprio card principal', async () => {
    const first = next()!;
    render(<MemoryRouter><ScheduleScreen /></MemoryRouter>);

    const nextCard = screen.getByRole('heading', { name: 'Próxima atividade do ciclo' }).closest('section')!;
    const completeBtn = within(nextCard).getByRole('button', { name: `Concluir sessão ${first.position} de ${first.discipline.name}` });
    const deleteBtn = within(nextCard).getByRole('button', { name: `Excluir sessão ${first.position} de ${first.discipline.name}` });
    expect(completeBtn.className).toContain('text-success');
    expect(completeBtn.className).toContain('action-button');
    expect(deleteBtn).toBeInTheDocument();

    await userEvent.click(completeBtn);
    await waitFor(() => expect(within(nextCard).getByText('Sessão 2')).toBeInTheDocument());
    expect(cycleCompletions(db.sessions.toArraySync())).toHaveLength(1);
    expect(cycleCompletions(db.sessions.toArraySync())[0].actualSeconds).toBe(first.minutes * 60);

    const second = next()!;
    await userEvent.click(within(nextCard).getByRole('button', { name: `Excluir sessão ${second.position} de ${second.discipline.name}` }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir sessão' }));
    await waitFor(() => expect(within(nextCard).getByText('Sessão 3')).toBeInTheDocument());
  });

  it('prioriza o ciclo mesmo com sessão manual planejada, exibe a sessão manual logo após a atual na Missão de hoje e inicia o cronômetro do ciclo', async () => {
    const expected = next()!;
    await createSession({ date: todayKey(), disciplineId: expected.discipline.id, topicId: null,
      plannedStart: null, plannedMinutes: 15, objective: 'Compromisso manual', notes: '' });
    renderOverview();
    expect(screen.getByText('Próxima atividade do ciclo')).toBeInTheDocument();
    expect(screen.queryByText('Blocos de hoje')).not.toBeInTheDocument();
    const queue = screen.getByRole('list', { name: 'Próximas atividades do ciclo' });
    expect(queue.children).toHaveLength(3);
    const firstUpcoming = within(queue).getAllByRole('listitem')[0];
    expect(within(firstUpcoming).getByText('Criada por você')).toBeInTheDocument();
    expect(within(firstUpcoming).getByText('Compromisso manual')).toBeInTheDocument();
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
    expect(within(queue).getByText('3')).toBeInTheDocument();
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
