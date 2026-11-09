import { db } from '../db/db';
import type { ErrorNote, MockExam, MockExamRange, StudySession } from '../db/types';
import {
  keyedQuestions,
  normalizeMarked,
  validateRanges,
  gradeExam,
  type AnswerKey,
  type GradedExam,
  type QuestionResult,
  type Responses,
} from '../domain/mockExam';
import { buildReviewTasks, nextPendingDate } from '../domain/reviews';
import { SIMULADO_DISCIPLINE_ID } from '../domain/schedule';
import { formatDate, isValidDateKey, todayKey, type DateKey } from '../lib/dates';
import { createId, nowIso } from '../lib/utils';
import { ValidationError, syncWeeklyPlansWithSessions } from './sessions';
import { getSettings } from './settings';

export const MOCK_EXAM_SESSION_MINUTES = 180; // 3 horas

export interface CreateMockExamInput {
  title: string;
  date?: DateKey;
  examFileName?: string | null;
  keyFileName?: string | null;
  answerKey: AnswerKey;
  questionCount: number;
  optionCount: number;
  ranges?: MockExamRange[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function keyToRecord(key: AnswerKey): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [n, a] of Object.entries(key)) {
    const num = Number(n);
    if (Number.isInteger(num) && num >= 1 && num <= 500 && !FORBIDDEN_KEYS.has(n)) {
      record[String(num)] = a;
    }
  }
  return record;
}

export function recordToKey(record: Record<string, string>): AnswerKey {
  const key: AnswerKey = {};
  for (const [n, a] of Object.entries(record)) {
    const num = Number(n);
    if (Number.isInteger(num) && num >= 1 && num <= 500 && !FORBIDDEN_KEYS.has(n)) {
      key[num] = a;
    }
  }
  return key;
}

export function recordToResponses(record: Record<string, string | null>): Responses {
  const responses: Responses = {};
  for (const [n, a] of Object.entries(record)) {
    const num = Number(n);
    if (Number.isInteger(num) && num >= 1 && num <= 500 && !FORBIDDEN_KEYS.has(n)) {
      responses[num] = a;
    }
  }
  return responses;
}

export function gradeStoredExam(exam: MockExam): GradedExam {
  return gradeExam(recordToKey(exam.answerKey), recordToResponses(exam.responses), exam.questionCount, exam.ranges);
}

const sanitizeFileName = (name: string | null | undefined): string | null => {
  if (!name) return null;
  const cleaned = name.replace(/[\0\r\n]/g, '').trim().slice(0, 255);
  return cleaned || null;
};

export async function createMockExam(input: CreateMockExamInput): Promise<MockExam> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new ValidationError('Informe um nome para o simulado.');
  const date = input.date ?? todayKey();
  if (!isValidDateKey(date)) throw new ValidationError('Informe uma data válida para o simulado.');
  if (keyedQuestions(input.answerKey, input.questionCount).length === 0) {
    throw new ValidationError('O gabarito não possui questões.');
  }
  const ranges = input.ranges ?? [];
  const rangeErrors = validateRanges(ranges, input.questionCount);
  if (rangeErrors.length > 0) throw new ValidationError(rangeErrors[0]);

  const now = nowIso();
  const sessionId = createId();
  const examId = createId();
  const questionCount = Math.min(Math.max(Math.round(input.questionCount), 0), 500);
  const optionCount = Math.min(Math.max(Math.round(input.optionCount), 2), 5);

  return db.transaction('rw', db.mockExams, db.sessions, db.weeklyPlans, async () => {
    const count = await db.sessions.where('date').equals(date).count();
    const session: StudySession = {
      id: sessionId,
      date,
      disciplineId: SIMULADO_DISCIPLINE_ID,
      topicId: null,
      plannedStart: null,
      plannedMinutes: MOCK_EXAM_SESSION_MINUTES,
      actualSeconds: 0,
      status: 'planejada',
      objective: `Simulado: ${title} (${questionCount} questões)`,
      notes: '',
      origin: 'planejada',
      isManual: true,
      order: count,
      startedAt: null,
      endedAt: null,
      recoveredFromId: null,
      history: [{ at: now, type: 'criada', description: `Sessão de simulado (3h) criada ao registrar "${title}".` }],
      createdAt: now,
      updatedAt: now,
    };

    const exam: MockExam = {
      id: examId,
      title,
      date,
      sessionId,
      examFileName: sanitizeFileName(input.examFileName),
      keyFileName: sanitizeFileName(input.keyFileName),
      questionCount,
      optionCount,
      answerKey: keyToRecord(input.answerKey),
      ranges,
      responses: {},
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.sessions.add(session);
    await db.mockExams.add(exam);
    await syncWeeklyPlansWithSessions();
    return exam;
  });
}

async function getEditableExam(id: string): Promise<MockExam> {
  const exam = await db.mockExams.get(id);
  if (!exam) throw new ValidationError('Simulado não encontrado.');
  return exam;
}

/** Atualiza a data em que o simulado foi realizado e move/cria a sessão de 3h no cronograma. */
export async function updateMockExamDate(id: string, date: DateKey): Promise<MockExam> {
  if (!isValidDateKey(date)) throw new ValidationError('Informe uma data válida para o simulado.');
  return db.transaction('rw', db.mockExams, db.sessions, db.weeklyPlans, async () => {
    const exam = await getEditableExam(id);
    const now = nowIso();
    let sessionId = exam.sessionId ?? null;
    const existingSession = sessionId ? await db.sessions.get(sessionId) : undefined;

    if (existingSession) {
      if (existingSession.date !== date) {
        const count = await db.sessions.where('date').equals(date).count();
        await db.sessions.put({
          ...existingSession,
          date,
          order: count,
          history: [
            ...existingSession.history,
            {
              at: now,
              type: 'reagendada',
              description: `Data do simulado alterada de ${formatDate(existingSession.date)} para ${formatDate(date)}.`,
            },
          ],
          updatedAt: now,
        });
      }
    } else {
      sessionId = createId();
      const count = await db.sessions.where('date').equals(date).count();
      const isSubmitted = Boolean(exam.submittedAt);
      const newSession: StudySession = {
        id: sessionId,
        date,
        disciplineId: SIMULADO_DISCIPLINE_ID,
        topicId: null,
        plannedStart: null,
        plannedMinutes: MOCK_EXAM_SESSION_MINUTES,
        actualSeconds: isSubmitted ? MOCK_EXAM_SESSION_MINUTES * 60 : 0,
        status: isSubmitted ? 'concluida' : 'planejada',
        objective: `Simulado: ${exam.title} (${exam.questionCount} questões)`,
        notes: '',
        origin: 'planejada',
        isManual: true,
        order: count,
        startedAt: null,
        endedAt: exam.submittedAt,
        recoveredFromId: null,
        history: [{ at: now, type: 'criada', description: `Sessão de simulado (3h) sincronizada em ${formatDate(date)}.` }],
        createdAt: now,
        updatedAt: now,
      };
      await db.sessions.add(newSession);
    }

    const updated: MockExam = { ...exam, date, sessionId, updatedAt: now };
    await db.mockExams.put(updated);
    await syncWeeklyPlansWithSessions();
    return updated;
  });
}

/** Registra (ou limpa, com `null`) a resposta de uma questão antes do envio. */
export async function setMockExamAnswer(id: string, question: number, letter: string | null): Promise<MockExam> {
  const exam = await getEditableExam(id);
  if (exam.submittedAt) throw new ValidationError('Este simulado já foi enviado.');
  if (!Number.isInteger(question) || question < 1 || question > exam.questionCount) {
    throw new ValidationError('Questão inexistente neste simulado.');
  }
  const normalized = normalizeMarked(letter, exam.optionCount);
  if (letter && !normalized) {
    throw new ValidationError('Alternativa inválida para este simulado.');
  }
  const responses = { ...exam.responses };
  if (normalized) responses[String(question)] = normalized;
  else delete responses[String(question)];
  const updated = { ...exam, responses, updatedAt: nowIso() };
  await db.mockExams.put(updated);
  return updated;
}

/** Envia as respostas: após isso o simulado fica travado, o resultado é calculado e a sessão de 3h é concluída no cronograma. */
export async function submitMockExam(id: string): Promise<{ exam: MockExam; graded: GradedExam }> {
  return db.transaction('rw', db.mockExams, db.sessions, db.weeklyPlans, async () => {
    const exam = await getEditableExam(id);
    if (exam.submittedAt) throw new ValidationError('Este simulado já foi enviado.');
    const now = nowIso();
    const graded = gradeStoredExam({ ...exam, submittedAt: now });
    const examDate = exam.date && isValidDateKey(exam.date) ? exam.date : todayKey();
    let sessionId = exam.sessionId ?? null;
    const existingSession = sessionId ? await db.sessions.get(sessionId) : undefined;
    const summaryNote = `Resultado do simulado: ${graded.totals.correct}/${graded.totals.scored} acertos (${graded.totals.accuracy ?? 0}%).`;

    if (existingSession) {
      await db.sessions.put({
        ...existingSession,
        status: 'concluida',
        actualSeconds: MOCK_EXAM_SESSION_MINUTES * 60,
        endedAt: now,
        notes: existingSession.notes ? `${existingSession.notes}\n${summaryNote}` : summaryNote,
        history: [
          ...existingSession.history,
          { at: now, type: 'executada', description: `Simulado enviado e concluído (3h). ${summaryNote}` },
        ],
        updatedAt: now,
      });
    } else {
      sessionId = createId();
      const count = await db.sessions.where('date').equals(examDate).count();
      await db.sessions.add({
        id: sessionId,
        date: examDate,
        disciplineId: SIMULADO_DISCIPLINE_ID,
        topicId: null,
        plannedStart: null,
        plannedMinutes: MOCK_EXAM_SESSION_MINUTES,
        actualSeconds: MOCK_EXAM_SESSION_MINUTES * 60,
        status: 'concluida',
        objective: `Simulado: ${exam.title} (${exam.questionCount} questões)`,
        notes: summaryNote,
        origin: 'planejada',
        isManual: true,
        order: count,
        startedAt: null,
        endedAt: now,
        recoveredFromId: null,
        history: [{ at: now, type: 'executada', description: `Simulado enviado e concluído (3h). ${summaryNote}` }],
        createdAt: now,
        updatedAt: now,
      });
    }

    const updated: MockExam = { ...exam, date: examDate, sessionId, submittedAt: now, updatedAt: now };
    await db.mockExams.put(updated);
    await syncWeeklyPlansWithSessions();
    return { exam: updated, graded };
  });
}

/** Reabre o simulado para novas marcações (descarta o resultado, mantém as respostas e retorna a sessão para planejada). */
export async function reopenMockExam(id: string): Promise<MockExam> {
  return db.transaction('rw', db.mockExams, db.sessions, db.weeklyPlans, async () => {
    const exam = await getEditableExam(id);
    const now = nowIso();
    if (exam.sessionId) {
      const existingSession = await db.sessions.get(exam.sessionId);
      if (existingSession) {
        await db.sessions.put({
          ...existingSession,
          status: 'planejada',
          actualSeconds: 0,
          endedAt: null,
          history: [
            ...existingSession.history,
            { at: now, type: 'status', description: 'Folha do simulado reaberta; sessão voltou para Planejada.' },
          ],
          updatedAt: now,
        });
      }
    }
    const updated = { ...exam, submittedAt: null, updatedAt: now };
    await db.mockExams.put(updated);
    await syncWeeklyPlansWithSessions();
    return updated;
  });
}

export async function deleteMockExam(id: string): Promise<void> {
  await db.transaction('rw', db.mockExams, db.sessions, db.timer, db.weeklyPlans, async () => {
    const exam = await db.mockExams.get(id);
    if (exam?.sessionId) {
      const timer = await db.timer.get('active');
      if (timer?.sessionId !== exam.sessionId) {
        await db.sessions.delete(exam.sessionId);
      }
    }
    await db.mockExams.delete(id);
    await syncWeeklyPlansWithSessions();
  });
}

/** Questões erradas do simulado agrupadas por disciplina (anuladas e em branco ficam de fora). */
export function wrongQuestionsByDiscipline(exam: MockExam): Map<string, QuestionResult[]> {
  const map = new Map<string, QuestionResult[]>();
  for (const r of gradeStoredExam(exam).results) {
    if (r.outcome !== 'wrong' || !r.disciplineId) continue;
    map.set(r.disciplineId, [...(map.get(r.disciplineId) ?? []), r]);
  }
  return map;
}

/**
 * Cria um caderno de erros por disciplina escolhida a partir de um simulado corrigido.
 * Cada caderno entra no Caderno de Erros e já recebe as revisões espaçadas padrão
 * (que aparecem em Revisões e no cronograma). Disciplinas que já têm caderno desta prova são ignoradas.
 */
export async function createExamErrorNotebooks(examId: string, disciplineIds: string[]): Promise<ErrorNote[]> {
  const settings = await getSettings();
  return db.transaction('rw', db.mockExams, db.errorNotes, db.reviews, db.disciplines, async () => {
    const exam = await db.mockExams.get(examId);
    if (!exam?.submittedAt) throw new ValidationError('Envie o simulado para correção antes de criar cadernos de erros.');
    const wrong = wrongQuestionsByDiscipline(exam);
    const existing = await db.errorNotes.filter((n) => n.mockExamId === examId).toArray();
    const done = new Set(existing.map((n) => n.disciplineId));
    const baseDate = todayKey();
    const now = nowIso();
    const created: ErrorNote[] = [];
    for (const disciplineId of new Set(disciplineIds)) {
      const items = wrong.get(disciplineId);
      if (!items?.length || done.has(disciplineId)) continue;
      const discipline = await db.disciplines.get(disciplineId);
      const qNums = items.map((r) => r.number);
      const qSummary =
        qNums.length === 1
          ? `questão ${qNums[0]}`
          : `questões ${qNums.join(', ')}`;
      const lines = items.map((r) => `• Questão ${r.number}: você marcou ${r.marked ?? '—'}; gabarito ${r.correctAnswer}.`);
      const sourceRef = `${exam.title}${discipline ? ` · ${discipline.name}` : ''} · ${qSummary}`;
      const note: ErrorNote = {
        id: createId(),
        questionLogId: null,
        disciplineId,
        topicId: null,
        sourceReference: sourceRef,
        errorType: 'falta-conteudo',
        explanation: `Erros do simulado "${exam.title}" (${items.length}):\n${lines.join('\n')}`,
        errorDate: exam.date ?? baseDate,
        status: 'revisar',
        nextReviewDate: null,
        mockExamId: exam.id,
        mockExamTitle: exam.title,
        createdAt: now,
        updatedAt: now,
      };
      const tasks = buildReviewTasks(
        { disciplineId, topicId: null, errorNoteId: note.id, title: `Caderno de erros: ${sourceRef}` },
        baseDate,
        settings.reviewIntervals,
      );
      await db.reviews.bulkAdd(tasks);
      note.nextReviewDate = nextPendingDate(tasks);
      await db.errorNotes.add(note);
      created.push(note);
    }
    if (created.length === 0) throw new ValidationError('Nenhum caderno novo foi criado: as disciplinas escolhidas não têm erros ou já possuem caderno.');
    return created;
  });
}
