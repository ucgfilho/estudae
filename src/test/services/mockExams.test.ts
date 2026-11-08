import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDatabase } from '../../db/db';
import {
  createMockExam,
  deleteMockExam,
  gradeStoredExam,
  keyToRecord,
  recordToKey,
  reopenMockExam,
  setMockExamAnswer,
  submitMockExam,
} from '../../services/mockExams';
import { createBackup, restoreBackup, validateBackup } from '../../services/backup';
import { isPdf, itemsToLines, readFileText, UnsupportedFileError } from '../../services/fileText';
import { ValidationError } from '../../services/sessions';

const baseInput = {
  title: 'Simulado 01',
  answerKey: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' },
  questionCount: 4,
  optionCount: 4,
};

describe('services/mockExams', () => {
  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('converts keys between record and numeric forms', () => {
    expect(keyToRecord({ 1: 'A', 2: 'B' })).toEqual({ '1': 'A', '2': 'B' });
    expect(recordToKey({ '1': 'A', '2': 'B' })).toEqual({ 1: 'A', 2: 'B' });
  });

  it('creates and persists a mock exam', async () => {
    const exam = await createMockExam({ ...baseInput, title: '  Simulado 01  ', examFileName: 'prova.pdf', keyFileName: 'gab.pdf' });
    const stored = await db.mockExams.get(exam.id);
    expect(stored).toMatchObject({
      title: 'Simulado 01',
      examFileName: 'prova.pdf',
      keyFileName: 'gab.pdf',
      questionCount: 4,
      optionCount: 4,
      submittedAt: null,
      responses: {},
      answerKey: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
    });
  });

  it('rejects an empty name, an empty key and invalid ranges', async () => {
    await expect(createMockExam({ ...baseInput, title: '  ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createMockExam({ ...baseInput, answerKey: {}, questionCount: 0 })).rejects.toThrow(/não possui questões/);
    await expect(
      createMockExam({ ...baseInput, ranges: [{ from: 1, to: 9, disciplineId: 'portugues' }] }),
    ).rejects.toThrow(/fora das questões/);
    expect(await db.mockExams.count()).toBe(0);
  });

  it('clamps the option count between 2 and 5', async () => {
    expect((await createMockExam({ ...baseInput, optionCount: 9 })).optionCount).toBe(5);
    expect((await createMockExam({ ...baseInput, optionCount: 0 })).optionCount).toBe(2);
  });

  it('marks, changes and clears answers', async () => {
    const { id } = await createMockExam(baseInput);
    await setMockExamAnswer(id, 1, 'a');
    await setMockExamAnswer(id, 2, 'C');
    expect((await db.mockExams.get(id))?.responses).toEqual({ '1': 'A', '2': 'C' });
    await setMockExamAnswer(id, 2, 'D');
    expect((await db.mockExams.get(id))?.responses['2']).toBe('D');
    await setMockExamAnswer(id, 1, null);
    expect((await db.mockExams.get(id))?.responses).toEqual({ '2': 'D' });
  });

  it('rejects invalid questions, letters and unknown exams', async () => {
    const { id } = await createMockExam(baseInput);
    await expect(setMockExamAnswer(id, 0, 'A')).rejects.toThrow(/Questão inexistente/);
    await expect(setMockExamAnswer(id, 5, 'A')).rejects.toThrow(/Questão inexistente/);
    await expect(setMockExamAnswer(id, 1.5, 'A')).rejects.toThrow(/Questão inexistente/);
    await expect(setMockExamAnswer(id, 1, 'E')).rejects.toThrow(/Alternativa inválida/);
    await expect(setMockExamAnswer(id, 1, 'Z')).rejects.toThrow(/Alternativa inválida/);
    await expect(setMockExamAnswer('nao-existe', 1, 'A')).rejects.toThrow(/não encontrado/);
  });

  it('supports Certo/Errado (2 options) exams and rejects A/B/D answers on them', async () => {
    const { id } = await createMockExam({
      title: 'Cebraspe CE',
      answerKey: { 1: 'C', 2: 'E' },
      questionCount: 2,
      optionCount: 2,
    });
    await setMockExamAnswer(id, 1, 'C');
    await setMockExamAnswer(id, 2, 'errado');
    expect((await db.mockExams.get(id))?.responses).toEqual({ '1': 'C', '2': 'E' });
    await expect(setMockExamAnswer(id, 1, 'A')).rejects.toThrow(/Alternativa inválida/);
    await expect(setMockExamAnswer(id, 1, 'B')).rejects.toThrow(/Alternativa inválida/);
  });

  it('submits and grades the exam', async () => {
    const { id } = await createMockExam({ ...baseInput, ranges: [{ from: 1, to: 4, disciplineId: 'portugues' }] });
    await setMockExamAnswer(id, 1, 'A');
    await setMockExamAnswer(id, 2, 'A');
    await setMockExamAnswer(id, 3, 'C');
    const { exam, graded } = await submitMockExam(id);
    expect(exam.submittedAt).not.toBeNull();
    expect(graded.totals).toMatchObject({ correct: 2, wrong: 1, blank: 1, accuracy: 50 });
    expect(gradeStoredExam((await db.mockExams.get(id))!).totals).toEqual(graded.totals);
  });

  it('locks the exam after submission and rejects double submission', async () => {
    const { id } = await createMockExam(baseInput);
    await submitMockExam(id);
    await expect(setMockExamAnswer(id, 1, 'A')).rejects.toThrow(/já foi enviado/);
    await expect(submitMockExam(id)).rejects.toThrow(/já foi enviado/);
  });

  it('reopens a submitted exam keeping the answers', async () => {
    const { id } = await createMockExam(baseInput);
    await setMockExamAnswer(id, 1, 'A');
    await submitMockExam(id);
    const reopened = await reopenMockExam(id);
    expect(reopened.submittedAt).toBeNull();
    expect(reopened.responses).toEqual({ '1': 'A' });
    await setMockExamAnswer(id, 2, 'B');
    await expect(reopenMockExam('nao-existe')).rejects.toBeInstanceOf(ValidationError);
  });

  it('deletes an exam', async () => {
    const { id } = await createMockExam(baseInput);
    await deleteMockExam(id);
    expect(await db.mockExams.count()).toBe(0);
  });

  it('includes mock exams in backups and restores them', async () => {
    const { id } = await createMockExam(baseInput);
    await setMockExamAnswer(id, 1, 'A');
    await submitMockExam(id);
    const backup = await createBackup();
    expect(backup.data.mockExams).toHaveLength(1);

    const validation = validateBackup(JSON.stringify(backup));
    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.counts.mockExams).toBe(1);

    await resetDatabase(db);
    expect(await db.mockExams.count()).toBe(0);
    await restoreBackup(backup);
    const restored = await db.mockExams.get(id);
    expect(restored?.responses).toEqual({ '1': 'A' });
    expect(restored?.submittedAt).not.toBeNull();
  });

  it('accepts version 1 backups without the mockExams table', async () => {
    const backup = await createBackup();
    const legacy = JSON.parse(JSON.stringify({ ...backup, schemaVersion: 1 }));
    delete legacy.data.mockExams;
    const validation = validateBackup(JSON.stringify(legacy));
    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.backup.data.mockExams).toEqual([]);
  });

  it('rejects corrupted mock exams in backups', async () => {
    const { id } = await createMockExam(baseInput);
    const backup = await createBackup();
    const broken = JSON.parse(JSON.stringify(backup));
    broken.data.mockExams[0].optionCount = 99;
    expect(validateBackup(JSON.stringify(broken)).ok).toBe(false);

    const maliciousKey = JSON.parse(JSON.stringify(backup));
    maliciousKey.data.mockExams[0].answerKey = { '1': '<script>alert(1)</script>' };
    expect(validateBackup(JSON.stringify(maliciousKey)).ok).toBe(false);

    const outOfRangeKey = JSON.parse(JSON.stringify(backup));
    outOfRangeKey.data.mockExams[0].answerKey = { '999': 'A' };
    expect(validateBackup(JSON.stringify(outOfRangeKey)).ok).toBe(false);

    expect(id).toBeTruthy();
  });
});

describe('services/fileText', () => {
  it('detects PDF files by type or extension', () => {
    expect(isPdf({ name: 'a.bin', type: 'application/pdf' })).toBe(true);
    expect(isPdf({ name: 'GABARITO.PDF', type: '' })).toBe(true);
    expect(isPdf({ name: 'a.txt', type: 'text/plain' })).toBe(false);
  });

  it('groups PDF fragments into ordered lines', () => {
    const lines = itemsToLines([
      { str: 'A', x: 50, y: 700 },
      { str: '1', x: 10, y: 701 },
      { str: '2', x: 10, y: 680 },
      { str: 'C', x: 50, y: 680 },
      { str: '   ', x: 90, y: 680 },
    ]);
    expect(lines).toEqual(['1 A', '2 C']);
  });

  it('reads text files', async () => {
    const file = new File(['1 A\n2 B'], 'gabarito.txt', { type: 'text/plain' });
    expect(await readFileText(file)).toBe('1 A\n2 B');
  });

  it('rejects unsupported formats with a helpful message', async () => {
    const file = new File(['x'], 'gabarito.png', { type: 'image/png' });
    await expect(readFileText(file)).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it('reports unreadable PDFs', async () => {
    const file = new File(['isto não é um pdf'], 'gabarito.pdf', { type: 'application/pdf' });
    await expect(readFileText(file)).rejects.toBeInstanceOf(UnsupportedFileError);
  });
});
