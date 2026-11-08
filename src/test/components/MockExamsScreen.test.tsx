import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { db, ensureSeed, resetDatabase } from '../../db/db';
import { setAuthSession, TEST_BYPASS_TOKEN } from '../../services/auth';

async function openScreen() {
  window.location.hash = '#/simulados';
  render(<App />);
  await screen.findByRole('heading', { name: 'Simulados', level: 1 });
}

describe('Simulados screen', () => {
  beforeEach(async () => {
    setAuthSession({
      token: TEST_BYPASS_TOKEN,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        id: 'test-user',
        name: 'Analista Teste',
        email: 'analista.teste@exemplo.local',
        createdAt: '2026-10-28T00:00:00.000Z',
      },
    });
    await resetDatabase(db);
    await ensureSeed();
  });

  it('is listed in the sidebar right after Revisões', async () => {
    window.location.hash = '#/';
    render(<App />);
    await screen.findByRole('heading', { name: /visão geral/i });
    const labels = screen.getAllByRole('link').map((l) => l.textContent);
    const idx = labels.findIndex((t) => /revisões/i.test(t ?? ''));
    expect(labels[idx + 1]).toMatch(/simulados/i);
  });

  it('shows the empty history and requires a name and a readable key', async () => {
    const user = userEvent.setup();
    await openScreen();
    expect(screen.getByText(/nenhum simulado ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar folha de respostas/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), 'sem gabarito aqui');
    expect(await screen.findByText(/nenhuma questão com resposta/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar folha de respostas/i })).toBeDisabled();
  });

  it('keeps the create button disabled and lists what is missing', async () => {
    const user = userEvent.setup();
    await openScreen();
    const create = screen.getByRole('button', { name: /gerar folha de respostas/i });
    expect(create).toBeDisabled();
    const checklist = screen.getByRole('list', { name: /o que falta/i });
    expect(within(checklist).getByText(/dê um nome/i)).toBeInTheDocument();
    expect(within(checklist).getByText(/envie ou cole o gabarito/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome do simulado/i), 'Teste');
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A');
    expect(create).toBeEnabled();
  });

  it('suggests the exam name from the exam file name', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.upload(screen.getByLabelText('Prova'), new File(['%PDF'], 'Prova BNB 2024.pdf', { type: 'application/pdf' }));
    expect(screen.getByLabelText(/nome do simulado/i)).toHaveValue('Prova BNB 2024');
    expect(screen.getByText('Prova BNB 2024.pdf')).toBeInTheDocument();
  });

  it('does not overwrite a name already typed', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Meu nome');
    await user.upload(screen.getByLabelText('Prova'), new File(['%PDF'], 'outra.pdf', { type: 'application/pdf' }));
    expect(screen.getByLabelText(/nome do simulado/i)).toHaveValue('Meu nome');
  });

  it('accepts a file dropped on the dropzone and can remove it', async () => {
    const user = userEvent.setup();
    await openScreen();
    const file = new File(['1 A\n2 B'], 'gab.txt', { type: 'text/plain' });
    const dropzone = screen.getByText('PDF, TXT ou CSV com as respostas certas').closest('label') as HTMLElement;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(await screen.findByText(/2 questões identificadas/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remover gabarito/i }));
    await waitFor(() => expect(screen.queryByText(/questões identificadas/i)).not.toBeInTheDocument());
  });

  it('shows the step indicator moving through the flow', async () => {
    const user = userEvent.setup();
    await openScreen();
    const steps = screen.getByRole('navigation', { name: /etapas do simulado/i });
    expect(within(steps).getByText('Enviar arquivos').closest('li')).toHaveAttribute('aria-current', 'step');
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Etapas');
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A');
    await user.click(screen.getByRole('button', { name: /gerar folha de respostas/i }));
    await screen.findByRole('heading', { name: /marque suas respostas/i });
    expect(within(steps).getByText('Marcar respostas').closest('li')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('radio', { name: 'Questão 1 alternativa A' }));
    await user.click(screen.getByRole('button', { name: /enviar respostas/i }));
    await screen.findByTestId('exam-result');
    expect(within(steps).getByText('Ver resultado').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('reads a key from an uploaded text file', async () => {
    const user = userEvent.setup();
    await openScreen();
    const file = new File(['1 A\n2 B\n3 C'], 'gabarito.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Gabarito'), file);
    expect(await screen.findByText(/3 questões identificadas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gabarito \(texto\)/i)).toHaveValue('1 A\n2 B\n3 C');
  });

  it('shows an error when the uploaded file format is unsupported', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await openScreen();
    const file = new File(['x'], 'gabarito.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Gabarito'), file);
    expect(await screen.findByText(/formato não suportado/i)).toBeInTheDocument();
  });

  it('runs the full flow: upload, mark answers, submit and see the analysis', async () => {
    const user = userEvent.setup();
    await openScreen();

    await user.type(screen.getByLabelText(/nome do simulado/i), 'Simulado BNB 01');
    await user.upload(screen.getByLabelText('Prova'), new File(['%PDF'], 'prova.pdf', { type: 'application/pdf' }));
    await user.upload(
      screen.getByLabelText('Gabarito'),
      new File(['1-A\n2-B\n3-C\n4-D\n5-E\n6-A'], 'gabarito.txt', { type: 'text/plain' }),
    );
    expect(await screen.findByText(/6 questões identificadas/i)).toBeInTheDocument();

    // Faixa por disciplina: 1–6 → primeira disciplina
    await user.click(screen.getByText(/opcional: informar as disciplinas/i));
    await user.click(screen.getByRole('button', { name: /adicionar faixa/i }));
    await user.click(screen.getByRole('button', { name: /gerar folha de respostas/i }));

    // Folha de respostas: somente números e letras
    expect(await screen.findByRole('heading', { name: /marque suas respostas/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(6);
    expect(within(screen.getByRole('radiogroup', { name: 'Questão 1' })).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    const first = (await db.disciplines.orderBy('order').first())!;
    expect(screen.getByRole('heading', { name: new RegExp(`${first.name}.*questões 1–6`) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar respostas/i })).toBeInTheDocument();

    const pick = (q: number, letter: string) => user.click(screen.getByRole('radio', { name: `Questão ${q} alternativa ${letter}` }));
    await pick(1, 'A'); // certa
    await pick(2, 'C'); // errada
    await pick(3, 'C'); // certa
    await pick(3, 'C'); // desmarca
    await pick(3, 'C'); // marca de novo
    await pick(4, 'A'); // errada
    // 5 e 6 em branco

    expect(screen.getByRole('radio', { name: 'Questão 1 alternativa A' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Questão 1 alternativa B' })).not.toBeChecked();
    expect(await screen.findByText(/4 de 6 marcadas/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 questão\(ões\) ficarão em branco/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /enviar respostas/i }));
    // Há questões em branco: o app pede confirmação antes de enviar.
    expect(await screen.findByText(/enviar com questões em branco/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enviar mesmo assim/i }));

    const result = await screen.findByTestId('exam-result');
    expect(within(result).getByTestId('stat-correct')).toHaveTextContent('2');
    expect(within(result).getByTestId('stat-wrong')).toHaveTextContent('2');
    expect(within(result).getByTestId('stat-blank')).toHaveTextContent('2');
    expect(within(result).getByTestId('stat-accuracy')).toHaveTextContent('33,3%');
    expect(screen.getByRole('heading', { name: /pontos fortes/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /o que melhorar/i })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /o que melhorar/i })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /enviar respostas/i })).not.toBeInTheDocument();

    const stored = await db.mockExams.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].submittedAt).not.toBeNull();
    expect(stored[0].ranges).toHaveLength(1);
  });

  it('reopens the answer sheet keeping the marked answers', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Reabrir');
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A, 2 B');
    await user.click(await screen.findByRole('button', { name: /gerar folha de respostas/i }));
    await user.click(await screen.findByRole('radio', { name: 'Questão 1 alternativa A' }));
    await user.click(screen.getByRole('button', { name: /enviar respostas/i }));
    await user.click(await screen.findByRole('button', { name: /enviar mesmo assim/i }));
    await screen.findByTestId('exam-result');

    await user.click(screen.getByRole('button', { name: /reabrir folha/i }));
    expect(await screen.findByRole('radio', { name: 'Questão 1 alternativa A' })).toBeChecked();
  });

  it('limits the sheet to 4 alternatives when selected', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Quatro');
    await user.selectOptions(screen.getByLabelText(/alternativas por questão/i), '4');
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A');
    await user.click(await screen.findByRole('button', { name: /gerar folha de respostas/i }));
    const group = await screen.findByRole('radiogroup', { name: 'Questão 1' });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
  });

  it('supports Certo ou Errado (C–E) exams end-to-end', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Simulado Cebraspe');
    await user.selectOptions(screen.getByLabelText(/alternativas por questão/i), '2');
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 Certo\n2 Errado\n3 C');
    expect(await screen.findByText(/3 questões identificadas/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /gerar folha de respostas/i }));

    expect(await screen.findByText(/3 questões · Certo ou Errado/i)).toBeInTheDocument();
    const group = await screen.findByRole('radiogroup', { name: 'Questão 1' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['C', 'E']);

    await user.click(screen.getByRole('radio', { name: 'Questão 1 alternativa C (Certo)' }));
    await user.click(screen.getByRole('radio', { name: 'Questão 2 alternativa C (Certo)' }));
    await user.click(screen.getByRole('radio', { name: 'Questão 3 alternativa C (Certo)' }));
    await user.click(screen.getByRole('button', { name: /enviar respostas/i }));

    const result = await screen.findByTestId('exam-result');
    expect(within(result).getByTestId('stat-correct')).toHaveTextContent('2');
    expect(within(result).getByTestId('stat-wrong')).toHaveTextContent('1');
    expect(within(result).getByTestId('stat-blank')).toHaveTextContent('0');
  });

  it('blocks creation when the name is missing', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A');
    expect(await screen.findByText(/1 questões identificadas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar folha de respostas/i })).toBeDisabled();
    expect(await db.mockExams.count()).toBe(0);
  });

  it('validates overlapping discipline ranges and disables creation', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A, 2 B, 3 C');
    await screen.findByText(/3 questões identificadas/i);
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Faixas');
    await user.click(screen.getByText(/opcional: informar as disciplinas/i));
    await user.click(screen.getByRole('button', { name: /adicionar faixa/i }));
    await user.click(screen.getByRole('button', { name: /adicionar faixa/i }));
    // Segunda faixa começa em 3 (3–3); força sobreposição com a primeira (1–3)
    const froms = screen.getAllByLabelText(/^da questão/i);
    await user.clear(froms[1]);
    await user.type(froms[1], '2');
    expect(await screen.findByText(/se sobrepõem/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar folha de respostas/i })).toBeDisabled();
    await user.click(screen.getAllByRole('button', { name: /remover faixa/i })[1]);
    await waitFor(() => expect(screen.getByRole('button', { name: /gerar folha de respostas/i })).toBeEnabled());
  });

  it('lists previous exams, reopens them and deletes them', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText(/nome do simulado/i), 'Histórico');
    await user.type(screen.getByLabelText(/gabarito \(texto\)/i), '1 A');
    await user.click(await screen.findByRole('button', { name: /gerar folha de respostas/i }));
    await screen.findByRole('heading', { name: /marque suas respostas/i });

    await user.click(screen.getByRole('button', { name: /novo simulado/i }));
    expect(await screen.findByText('Em andamento')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^histórico/i }));
    expect(await screen.findByRole('heading', { name: /marque suas respostas/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /novo simulado/i }));
    await user.click(await screen.findByRole('button', { name: /excluir histórico/i }));
    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));
    await waitFor(async () => expect(await db.mockExams.count()).toBe(0));
    expect(await screen.findByText(/nenhum simulado ainda/i)).toBeInTheDocument();
  });
});
