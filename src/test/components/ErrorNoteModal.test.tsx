import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, resetDatabase } from '../../db/db';
import { ErrorNoteModal } from '../../components/modals/ErrorNoteModal';
import { createMockExam, submitMockExam } from '../../services/mockExams';

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
});
