import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, resetDatabase } from '../../db/db';
import { ErrorNoteModal } from '../../components/modals/ErrorNoteModal';
import { ReviewsScreen } from '../../screens/ReviewsScreen';
import { ToastProvider } from '../../components/ui/Toast';
import { createMockExam, submitMockExam } from '../../services/mockExams';
import { saveErrorNote } from '../../services/performance';
import { todayKey } from '../../lib/dates';

describe('ErrorNoteModal - Dropdown de simulados', () => {
  beforeEach(async () => {
    await resetDatabase(db);
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

    const select = screen.getByLabelText(/Simulado de referência \(Prova\)/i) as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThanOrEqual(3); // Nenhum + 2 simulados

    const optionsText = Array.from(select.options).map((o) => o.textContent);
    expect(optionsText.some((t) => t?.includes('Prova BNB 2022 Perfil 1'))).toBe(true);
    expect(optionsText.some((t) => t?.includes('Simulado BNB 2024 Geral'))).toBe(true);

    // Seleciona o primeiro simulado
    await userEvent.selectOptions(select, exam1.id);
    expect(select.value).toBe(exam1.id);
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
      const select = screen.getByLabelText(/Simulado de referência \(Prova\)/i) as HTMLSelectElement;
      expect(select.value).toBe(exam.id);
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

    await waitFor(() => {
      expect(screen.getByText('Erro: prova bnb 2022 perfil 1 · questão 54')).toBeInTheDocument();
    });

    await waitFor(async () => {
      const healed = await db.reviews.get('stale-review-54');
      expect(healed?.title).toBe('Erro: prova bnb 2022 perfil 1 · questão 54');
    });
  });
});
