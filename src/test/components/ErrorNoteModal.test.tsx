import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, resetDatabase } from '../../db/db';
import { ErrorNoteModal } from '../../components/modals/ErrorNoteModal';
import { FlashcardModal } from '../../components/modals/FlashcardModal';
import { ReviewsScreen } from '../../screens/ReviewsScreen';
import { ToastProvider } from '../../components/ui/Toast';
import { createMockExam, submitMockExam } from '../../services/mockExams';
import { saveErrorNote } from '../../services/performance';
import { todayKey } from '../../lib/dates';

describe('ErrorNoteModal - Dropdown de simulados', () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('preserva a explicação em andamento quando os dados do caderno são atualizados', async () => {
    const { rerender } = render(<ErrorNoteModal open onClose={() => {}} />);

    const explanation = screen.getByPlaceholderText(/explique com suas palavras/i);
    await userEvent.type(explanation, 'Explicação em andamento');

    await act(async () => {
      await createMockExam({
        title: 'Novo simulado',
        questionCount: 1,
        optionCount: 4,
        answerKey: { 1: 'A' },
      });
    });

    expect(explanation).toHaveValue('Explicação em andamento');

    rerender(<ErrorNoteModal open={false} onClose={() => {}} />);
    rerender(<ErrorNoteModal open onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/explique com suas palavras/i)).toHaveValue('');
  });

  it('renders dropdown with completed mock exams and allows selection', async () => {
    const exam1 = await createMockExam({
      title: 'Prova BNB 2022 Perfil 1',
      date: '2026-11-06',
      answerKey: { 1: 'A' },
      questionCount: 1,
      optionCount: 4,
    });
    await submitMockExam(exam1.id);

    const exam2 = await createMockExam({
      title: 'Simulado BNB 2024 Geral',
      date: '2026-11-08',
      answerKey: { 1: 'B' },
      questionCount: 1,
      optionCount: 4,
    });
    await submitMockExam(exam2.id);

    render(
      <ErrorNoteModal
        open={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Simulado de referência \(Prova\)/i)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox', { name: /Simulado de referência \(Prova\)/i });
    await userEvent.click(select);
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('option', { name: /Simulado BNB 2024 Geral/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Prova BNB 2022 Perfil 1/ }));
    expect(select).toHaveTextContent('Prova BNB 2022 Perfil 1');
  });

  it('pre-selects the mock exam when passed via props', async () => {
    const exam = await createMockExam({
      title: 'Prova BNB 2022 Perfil 1',
      date: '2026-11-06',
      answerKey: { 1: 'A' },
      questionCount: 1,
      optionCount: 4,
    });
    await submitMockExam(exam.id);

    render(
      <ErrorNoteModal
        open={true}
        onClose={() => {}}
        mockExam={{ id: exam.id, title: exam.title }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Simulado de referência \(Prova\)/i })).toHaveTextContent(exam.title);
    });
  });

  it('syncs linked review titles when an error note is edited to include the question number', async () => {
    const disciplines = await db.disciplines.toArray();
    const note = await saveErrorNote(
      {
        disciplineId: disciplines[0].id,
        topicId: null,
        questionLogId: null,
        sourceReference: 'prova bnb 2022 perfil 1',
        errorType: 'falta-conteudo',
        explanation: 'Complemento de dois em 8 bits.',
        errorDate: todayKey(),
        status: 'revisar',
        nextReviewDate: null,
      },
      { scheduleReviews: true },
    );

    await saveErrorNote(
      {
        disciplineId: disciplines[0].id,
        topicId: null,
        questionLogId: null,
        sourceReference: 'prova bnb 2022 perfil 1 · questão 54',
        errorType: 'falta-conteudo',
        explanation: 'Complemento de dois em 8 bits.',
        errorDate: note.errorDate,
        status: 'revisar',
        nextReviewDate: note.nextReviewDate,
      },
      { id: note.id },
    );

    const linkedReviews = await db.reviews.where('errorNoteId').equals(note.id).toArray();
    expect(linkedReviews.length).toBeGreaterThan(0);
    expect(linkedReviews.every((r) => r.title === 'Erro: prova bnb 2022 perfil 1 · questão 54')).toBe(true);
  });

  it('heals and displays the question number in ReviewsScreen for existing stale reviews', async () => {
    const today = todayKey();
    const disciplines = await db.disciplines.toArray();
    const note = await saveErrorNote(
      {
        disciplineId: disciplines[0].id,
        topicId: null,
        questionLogId: null,
        sourceReference: 'prova bnb 2022 perfil 1 · questão 54',
        errorType: 'falta-conteudo',
        explanation: 'Intervalo de inteiro com sinal.',
        errorDate: today,
        status: 'revisar',
        nextReviewDate: today,
      },
      { scheduleReviews: false },
    );

    // Simula revisão antiga no banco cujo título ficou sem o número da questão
    await db.reviews.add({
      id: 'stale-review-54',
      disciplineId: disciplines[0].id,
      topicId: null,
      errorNoteId: note.id,
      title: 'Erro: prova bnb 2022 perfil 1',
      dueDate: today,
      intervalDays: 1,
      status: 'pendente',
      completedAt: null,
      createdAt: new Date().toISOString(),
    });

    render(
      <ToastProvider>
        <ReviewsScreen />
      </ToastProvider>,
    );

    await waitFor(async () => {
      const healed = await db.reviews.get('stale-review-54');
      expect(healed?.title).toBe('Erro: prova bnb 2022 perfil 1 · questão 54');
    });
  });

  it('creates multiple manual flashcards for an error note and shows them in ReviewsScreen on due date without filter tabs', async () => {
    const today = todayKey();
    const disciplines = await db.disciplines.toArray();
    const note = await saveErrorNote(
      {
        disciplineId: disciplines[0].id,
        topicId: null,
        questionLogId: null,
        sourceReference: 'prova bnb 2022 · questão 10',
        errorType: 'falta-conteudo',
        explanation: 'Explicação base.',
        errorDate: today,
        status: 'revisar',
        nextReviewDate: today,
      },
      { scheduleReviews: true },
    );

    const { rerender, unmount } = render(
      <FlashcardModal open={true} onClose={() => {}} note={note} />,
    );

    expect(screen.getByRole('button', { name: /Salvar flashcard/i })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/Escreva a assertiva/i), 'Enunciado flashcard 1');
    await userEvent.click(screen.getByLabelText(/Certo/i));
    await userEvent.type(screen.getByPlaceholderText(/Adicione a justificativa/i), 'Definição flashcard 1');
    expect(screen.getByRole('button', { name: /Salvar flashcard/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /Salvar flashcard/i }));

    await waitFor(async () => {
      const updated = await db.errorNotes.get(note.id);
      expect(updated?.flashcards?.length).toBe(1);
    });

    const updatedNote = (await db.errorNotes.get(note.id))!;
    rerender(<FlashcardModal open={false} onClose={() => {}} note={updatedNote} />);
    rerender(<FlashcardModal open={true} onClose={() => {}} note={updatedNote} />);

    await userEvent.type(screen.getByPlaceholderText(/Escreva a assertiva/i), 'Enunciado flashcard 2');
    await userEvent.click(screen.getByLabelText(/Errado/i));
    await userEvent.type(screen.getByPlaceholderText(/Adicione a justificativa/i), 'Definição flashcard 2');
    await userEvent.click(screen.getByRole('button', { name: /Salvar flashcard/i }));

    await waitFor(async () => {
      const finalNote = await db.errorNotes.get(note.id);
      expect(finalNote?.flashcards?.length).toBe(2);
    });

    unmount();

    render(
      <ToastProvider>
        <ReviewsScreen />
      </ToastProvider>,
    );

    expect(screen.queryByText(/Atrasadas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Próximas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Concluídas/i)).not.toBeInTheDocument();

    expect(await screen.findByText('Enunciado flashcard 1')).toBeInTheDocument();
  });

  it('lists related flashcards inside ErrorNoteModal when editing and allows editing a flashcard', async () => {
    const today = todayKey();
    const disciplines = await db.disciplines.toArray();
    const note = await saveErrorNote(
      {
        disciplineId: disciplines[0].id,
        topicId: null,
        questionLogId: null,
        sourceReference: 'prova bnb 2022 · questão 22',
        errorType: 'falta-conteudo',
        explanation: 'Explicação base.',
        errorDate: today,
        status: 'revisar',
        nextReviewDate: today,
      },
      { scheduleReviews: false },
    );

    const { addFlashcard } = await import('../../services/performance');
    await addFlashcard(note.id, {
      statement: 'Enunciado original',
      answer: 'certo',
      explanation: 'Explicação original',
    });

    const latestNote = (await db.errorNotes.get(note.id))!;

    render(
      <ErrorNoteModal open={true} onClose={() => {}} noteToEdit={latestNote} />,
    );

    expect(await screen.findByText('Flashcards relacionados (1)')).toBeInTheDocument();
    expect(screen.getByText('Enunciado original')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const statementInput = await screen.findByDisplayValue('Enunciado original');
    await userEvent.clear(statementInput);
    await userEvent.type(statementInput, 'Enunciado editado');
    await userEvent.click(screen.getByRole('button', { name: /Salvar flashcard/i }));

    await waitFor(async () => {
      const updated = await db.errorNotes.get(note.id);
      expect(updated?.flashcards?.[0].statement).toBe('Enunciado editado');
    });
  });
});
