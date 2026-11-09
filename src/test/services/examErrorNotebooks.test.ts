import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDatabase } from '../../db/db';
import { createExamErrorNotebooks, createMockExam, setMockExamAnswer, submitMockExam } from '../../services/mockExams';
import { ValidationError } from '../../services/sessions';

describe('createExamErrorNotebooks', () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  async function submittedExam() {
    const [d1, d2] = await db.disciplines.toArray();
    const exam = await createMockExam({
      title: 'Prova X',
      answerKey: { 1: 'A', 2: 'B', 3: 'C' },
      questionCount: 3,
      optionCount: 4,
      ranges: [
        { from: 1, to: 2, disciplineId: d1.id },
        { from: 3, to: 3, disciplineId: d2.id },
      ],
    });
    await setMockExamAnswer(exam.id, 1, 'D');
    await setMockExamAnswer(exam.id, 2, 'B');
    await setMockExamAnswer(exam.id, 3, 'A');
    await submitMockExam(exam.id);
    return { exam, d1, d2 };
  }

  it('creates tagged notebooks per discipline with scheduled reviews, once', async () => {
    const { exam, d1, d2 } = await submittedExam();
    const created = await createExamErrorNotebooks(exam.id, [d1.id, d2.id]);
    expect(created).toHaveLength(2);
    expect(created.every((n) => n.mockExamId === exam.id && n.mockExamTitle === 'Prova X')).toBe(true);
    const reviews = await db.reviews.filter((r) => r.errorNoteId === created[0].id).toArray();
    expect(reviews.length).toBeGreaterThan(0);
    expect(created[0].nextReviewDate).not.toBeNull();
    await expect(createExamErrorNotebooks(exam.id, [d1.id])).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects exams not yet submitted', async () => {
    const exam = await createMockExam({ title: 'P', answerKey: { 1: 'A' }, questionCount: 1, optionCount: 4 });
    await expect(createExamErrorNotebooks(exam.id, [])).rejects.toBeInstanceOf(ValidationError);
  });
});
