import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db, resetDatabase } from '../../db/db';
import { ExamErrorNotebooks } from '../../components/mockexam/ExamErrorNotebooks';
import { createMockExam, submitMockExam } from '../../services/mockExams';
import { saveErrorNote } from '../../services/performance';

describe('ExamErrorNotebooks - Exibição de cadernos associados', () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  async function setupExamWithNote() {
    const disciplines = await db.disciplines.toArray();
    const exam = await createMockExam({
      title: 'Prova BNB 2022 Perfil 1',
      date: '2026-11-06',
      answerKey: { 1: 'A' },
      questionCount: 1,
      optionCount: 4,
    });
    await submitMockExam(exam.id);

    // Salva uma anotação de erro vinculada a este simulado
    const note = await saveErrorNote({
      disciplineId: disciplines[0].id,
      topicId: null,
      questionLogId: null,
      sourceReference: 'Prova BNB 2022 Perfil 1 · Questão 1',
      errorType: 'falta-conteudo',
      explanation: 'Errei o conceito de Clean Architecture.',
      errorDate: '2026-11-06',
      status: 'revisar',
      nextReviewDate: '2026-11-07',
      mockExamId: exam.id,
      mockExamTitle: exam.title,
    });

    return { exam, disciplines, note };
  }

  it('renders associated error notebooks for the mock exam', async () => {
    const { exam, disciplines } = await setupExamWithNote();

    render(
      <MemoryRouter>
        <ExamErrorNotebooks exam={exam} disciplines={disciplines} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Cadernos vinculados a esta prova \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Errei o conceito de Clean Architecture\./i)).toBeInTheDocument();
      expect(screen.getByText(/Prova BNB 2022 Perfil 1 · Questão 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Revisar/i)).toBeInTheDocument();
    });
  });

  it('allows marking as reviewed directly from the exam screen', async () => {
    const { exam, disciplines, note } = await setupExamWithNote();

    render(
      <MemoryRouter>
        <ExamErrorNotebooks exam={exam} disciplines={disciplines} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Marcar Revisado/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Marcar Revisado/i }));

    await waitFor(async () => {
      const updated = await db.errorNotes.get(note.id);
      expect(updated?.status).toBe('revisado');
    });
  });

  it('shows helpful empty state when no notebooks exist and no ranges configured', async () => {
    const disciplines = await db.disciplines.toArray();
    const exam = await createMockExam({
      title: 'Simulado sem erros',
      date: '2026-11-06',
      answerKey: { 1: 'A' },
      questionCount: 1,
      optionCount: 4,
    });
    await submitMockExam(exam.id);

    render(
      <MemoryRouter>
        <ExamErrorNotebooks exam={exam} disciplines={disciplines} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Nenhum caderno de erros vinculado a esta prova ainda/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Criar Primeiro Caderno de Erros/i })).toBeInTheDocument();
    });
  });
});
