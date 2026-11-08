import { describe, it, expect } from 'vitest';
import {
  ANNULLED,
  analyzeExam,
  disciplineOfQuestion,
  gradeExam,
  isTrueFalseExam,
  keyedQuestions,
  longestWrongStreak,
  normalizeMarked,
  optionLabel,
  optionLetters,
  parseAnswerKey,
  percent,
  statsByDiscipline,
  statsByThird,
  validateRanges,
  type AnswerKey,
  type Responses,
} from '../../domain/mockExam';

const keyOf = (letters: string): AnswerKey => Object.fromEntries(letters.split('').map((l, i) => [i + 1, l]));
const answersOf = (letters: string): Responses =>
  Object.fromEntries(letters.split('').map((l, i) => [i + 1, l === '-' ? null : l]));

describe('domain/mockExam › parseAnswerKey', () => {
  it.each([
    ['1-A\n2-C\n3-B', { 1: 'A', 2: 'C', 3: 'B' }],
    ['1 A, 2 C, 3 B', { 1: 'A', 2: 'C', 3: 'B' }],
    ['01) A\n02) C\n03) B', { 1: 'A', 2: 'C', 3: 'B' }],
    ['1: a 2: c 3: b', { 1: 'A', 2: 'C', 3: 'B' }],
    ['1.A 2.C 3.B', { 1: 'A', 2: 'C', 3: 'B' }],
    ['1=A;2=C;3=B', { 1: 'A', 2: 'C', 3: 'B' }],
    ['Questão 1 A\nQuestão 2 C\nQuestão 3 B', { 1: 'A', 2: 'C', 3: 'B' }],
  ])('reads number/letter pairs: %j', (text, expected) => {
    const parsed = parseAnswerKey(text);
    expect(parsed.key).toEqual(expected);
    expect(parsed.questionCount).toBe(3);
    expect(parsed.warnings).toEqual([]);
  });

  it('reads a two-line table (numbers then letters)', () => {
    const parsed = parseAnswerKey('1 2 3 4\nA B C D\n5 6\nE A');
    expect(parsed.key).toEqual({ 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'A' });
    expect(parsed.questionCount).toBe(6);
  });

  it('reads an unnumbered sequence of letters', () => {
    expect(parseAnswerKey('ABCDE').key).toEqual({ 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' });
    expect(parseAnswerKey('A, B, C').key).toEqual({ 1: 'A', 2: 'B', 3: 'C' });
    expect(parseAnswerKey('a\nb\nc').questionCount).toBe(3);
  });

  it('marks annulled questions', () => {
    const parsed = parseAnswerKey('1 A\n2 X\n3 ANULADA\n4 *');
    expect(parsed.key).toEqual({ 1: 'A', 2: ANNULLED, 3: ANNULLED, 4: ANNULLED });
  });

  it('keeps the last answer and warns about conflicting duplicates', () => {
    const parsed = parseAnswerKey('1 A\n1 B');
    expect(parsed.key[1]).toBe('B');
    expect(parsed.warnings[0]).toMatch(/Questão 1 aparece mais de uma vez/);
  });

  it('does not warn about identical duplicates', () => {
    expect(parseAnswerKey('1 A\n1 A').warnings).toEqual([]);
  });

  it('warns about missing questions and leaves them out of the key', () => {
    const parsed = parseAnswerKey('1 A\n3 C');
    expect(parsed.questionCount).toBe(3);
    expect(parsed.key[2]).toBeUndefined();
    expect(parsed.warnings[0]).toMatch(/Faltam respostas para 1 questão\(ões\): 2/);
    expect(keyedQuestions(parsed.key, parsed.questionCount)).toEqual([1, 3]);
  });

  it('truncates the list of missing questions in the warning', () => {
    const parsed = parseAnswerKey('1 A\n30 B');
    expect(parsed.warnings[0]).toContain('…');
  });

  it('returns an empty result with a warning for unreadable text', () => {
    for (const text of ['', '   ', 'texto sem gabarito algum']) {
      const parsed = parseAnswerKey(text);
      expect(parsed.questionCount).toBe(0);
      expect(parsed.key).toEqual({});
      expect(parsed.warnings[0]).toMatch(/Nenhuma questão/);
    }
  });

  it('ignores question numbers outside 1–500', () => {
    expect(parseAnswerKey('0 A\n1 B\n501 C').key).toEqual({ 1: 'B' });
  });

  it('handles Windows line breaks', () => {
    expect(parseAnswerKey('1 A\r\n2 B\r\n').key).toEqual({ 1: 'A', 2: 'B' });
  });

  it('does not read letters glued to words as answers', () => {
    expect(parseAnswerKey('1 Alternativa').questionCount).toBe(0);
  });

  it('reads Certo/Errado answer keys (C/E, Certo/Errado, V/F)', () => {
    const parsedWords = parseAnswerKey('1 Certo\n2 Errado\n3 Certa\n4 Errada\n5 Anulada', 2);
    expect(parsedWords.key).toEqual({ 1: 'C', 2: 'E', 3: 'C', 4: 'E', 5: ANNULLED });
    expect(parsedWords.questionCount).toBe(5);

    const parsedVF = parseAnswerKey('1-V, 2-F, 3-Verdadeiro, 4-Falso', 2);
    expect(parsedVF.key).toEqual({ 1: 'C', 2: 'E', 3: 'C', 4: 'E' });

    const parsedTable = parseAnswerKey('1 2 3 4\nC E C E', 2);
    expect(parsedTable.key).toEqual({ 1: 'C', 2: 'E', 3: 'C', 4: 'E' });

    const parsedSeq = parseAnswerKey('CEECC', 2);
    expect(parsedSeq.key).toEqual({ 1: 'C', 2: 'E', 3: 'E', 4: 'C', 5: 'C' });

    // In Certo/Errado mode (optionCount = 2), letters A, B, D are rejected
    expect(parseAnswerKey('1 A\n2 B\n3 D', 2).questionCount).toBe(0);
  });
});

describe('domain/mockExam › options and helpers', () => {
  it('lists option letters within 2–5 (using C/E for 2 options)', () => {
    expect(optionLetters(2)).toEqual(['C', 'E']);
    expect(optionLetters(4)).toEqual(['A', 'B', 'C', 'D']);
    expect(optionLetters(5)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(optionLetters(1)).toEqual(['C', 'E']);
    expect(optionLetters(9)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(isTrueFalseExam(2)).toBe(true);
    expect(isTrueFalseExam(5)).toBe(false);
    expect(optionLabel('C', 2)).toBe('Certo');
    expect(optionLabel('E', 2)).toBe('Errado');
    expect(optionLabel('C', 5)).toBe('C');
  });

  it('normalizes marked letters', () => {
    expect(normalizeMarked('b')).toBe('B');
    expect(normalizeMarked(' c ')).toBe('C');
    expect(normalizeMarked('certo', 2)).toBe('C');
    expect(normalizeMarked('Errado', 2)).toBe('E');
    expect(normalizeMarked('A', 2)).toBeNull();
    expect(normalizeMarked('Z')).toBeNull();
    expect(normalizeMarked('')).toBeNull();
    expect(normalizeMarked(null)).toBeNull();
    expect(normalizeMarked(undefined)).toBeNull();
  });

  it('computes percentages with one decimal and null for empty wholes', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(3, 4)).toBe(75);
    expect(percent(0, 5)).toBe(0);
    expect(percent(0, 0)).toBeNull();
  });
});

describe('domain/mockExam › ranges', () => {
  it('accepts valid ranges', () => {
    expect(validateRanges([{ from: 1, to: 5, disciplineId: 'a' }, { from: 6, to: 10, disciplineId: 'b' }], 10)).toEqual([]);
    expect(validateRanges([], 10)).toEqual([]);
  });

  it('rejects out-of-bounds, inverted, overlapping, unassigned and non-integer ranges', () => {
    expect(validateRanges([{ from: 0, to: 5, disciplineId: 'a' }], 10)[0]).toMatch(/fora das questões/);
    expect(validateRanges([{ from: 1, to: 11, disciplineId: 'a' }], 10)[0]).toMatch(/fora das questões/);
    expect(validateRanges([{ from: 6, to: 3, disciplineId: 'a' }], 10).join()).toMatch(/inválida/);
    expect(validateRanges([{ from: 1, to: 5, disciplineId: 'a' }, { from: 5, to: 8, disciplineId: 'b' }], 10)[0]).toMatch(/se sobrepõem/);
    expect(validateRanges([{ from: 1, to: 5, disciplineId: '' }], 10)[0]).toMatch(/Escolha a disciplina/);
    expect(validateRanges([{ from: 1.5, to: 5, disciplineId: 'a' }], 10)[0]).toMatch(/inteiros/);
  });

  it('finds the discipline of a question', () => {
    const ranges = [{ from: 1, to: 3, disciplineId: 'a' }, { from: 5, to: 6, disciplineId: 'b' }];
    expect(disciplineOfQuestion(2, ranges)).toBe('a');
    expect(disciplineOfQuestion(5, ranges)).toBe('b');
    expect(disciplineOfQuestion(4, ranges)).toBeNull();
  });
});

describe('domain/mockExam › gradeExam', () => {
  it('counts correct, wrong and blank answers', () => {
    const graded = gradeExam(keyOf('ABCDE'), answersOf('AB-EA'), 5);
    expect(graded.totals).toEqual({ total: 5, correct: 2, wrong: 2, blank: 1, annulled: 0, scored: 5, accuracy: 40 });
    expect(graded.results.map((r) => r.outcome)).toEqual(['correct', 'correct', 'blank', 'wrong', 'wrong']);
  });

  it('treats absent and invalid responses as blank', () => {
    const graded = gradeExam(keyOf('AB'), { 1: 'A', 2: 'Z' }, 2);
    expect(graded.totals.blank).toBe(1);
    const graded2 = gradeExam(keyOf('AB'), {}, 2);
    expect(graded2.totals).toMatchObject({ correct: 0, blank: 2, accuracy: 0 });
  });

  it('is case-insensitive for marked letters', () => {
    expect(gradeExam(keyOf('A'), { 1: 'a' }, 1).totals.correct).toBe(1);
  });

  it('excludes annulled questions from the score', () => {
    const graded = gradeExam({ 1: 'A', 2: ANNULLED, 3: 'C' }, { 1: 'A', 2: 'B', 3: 'D' }, 3);
    expect(graded.totals).toMatchObject({ total: 3, correct: 1, wrong: 1, annulled: 1, scored: 2, accuracy: 50 });
    expect(graded.results[1].outcome).toBe('annulled');
  });

  it('returns a null accuracy when every question is annulled', () => {
    const graded = gradeExam({ 1: ANNULLED }, {}, 1);
    expect(graded.totals.accuracy).toBeNull();
    expect(graded.totals.scored).toBe(0);
  });

  it('skips questions without an answer in the key', () => {
    const graded = gradeExam({ 1: 'A', 3: 'C' }, { 1: 'A', 2: 'B', 3: 'C' }, 3);
    expect(graded.results.map((r) => r.number)).toEqual([1, 3]);
    expect(graded.totals.total).toBe(2);
  });

  it('assigns disciplines from ranges', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('AAAA'), 4, [{ from: 1, to: 2, disciplineId: 'x' }]);
    expect(graded.results.map((r) => r.disciplineId)).toEqual(['x', 'x', null, null]);
  });
});

describe('domain/mockExam › statistics', () => {
  const ranges = [
    { from: 1, to: 4, disciplineId: 'port' },
    { from: 5, to: 8, disciplineId: 'bd' },
  ];

  it('groups results by discipline and ignores annulled questions', () => {
    const graded = gradeExam({ ...keyOf('AAAAAAAA'), 4: ANNULLED }, answersOf('AAAB-ABB'), 8, ranges);
    const stats = statsByDiscipline(graded.results);
    expect(stats).toEqual([
      { key: 'port', label: undefined, correct: 3, wrong: 0, blank: 0, scored: 3, accuracy: 100 },
      { key: 'bd', label: undefined, correct: 1, wrong: 2, blank: 1, scored: 4, accuracy: 25 },
    ]);
  });

  it('omits questions outside any range', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('AAAA'), 4, [{ from: 1, to: 2, disciplineId: 'x' }]);
    expect(statsByDiscipline(graded.results)).toHaveLength(1);
  });

  it('splits the exam into thirds', () => {
    const graded = gradeExam(keyOf('AAAAAA'), answersOf('AABBBB'), 6);
    const thirds = statsByThird(graded.results);
    expect(thirds.map((t) => t.label)).toEqual(['Início da prova', 'Meio da prova', 'Fim da prova']);
    expect(thirds.map((t) => t.accuracy)).toEqual([100, 0, 0]);
  });

  it('returns no thirds for very short exams', () => {
    expect(statsByThird(gradeExam(keyOf('AA'), answersOf('AA'), 2).results)).toEqual([]);
  });

  it('finds the longest streak of wrong answers', () => {
    const graded = gradeExam(keyOf('AAAAAAAAAA'), answersOf('ABBA-BBBAB'), 10);
    expect(longestWrongStreak(graded.results)).toEqual({ length: 3, from: 6, to: 8 });
  });

  it('returns null when there are no wrong answers', () => {
    expect(longestWrongStreak(gradeExam(keyOf('AA'), answersOf('AA'), 2).results)).toBeNull();
  });

  it('ignores blanks inside a streak of wrong answers', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('B-BB'), 4);
    expect(longestWrongStreak(graded.results)).toEqual({ length: 3, from: 1, to: 4 });
  });
});

describe('domain/mockExam › analyzeExam', () => {
  const names = { port: 'Português', bd: 'Banco de Dados' };

  it('reports strengths and weaknesses by discipline', () => {
    const graded = gradeExam(
      keyOf('AAAAAAAAAA'),
      answersOf('AAAAABBBBB'),
      10,
      [{ from: 1, to: 5, disciplineId: 'port' }, { from: 6, to: 10, disciplineId: 'bd' }],
    );
    const { strengths, improvements } = analyzeExam(graded, { accuracyGoal: 70, disciplineNames: names });
    expect(strengths.join('\n')).toMatch(/Português: 5 de 5 \(100%\) — ponto forte/);
    expect(improvements.join('\n')).toMatch(/Banco de Dados: 0 de 5 \(0%\)/);
    expect(improvements.join('\n')).toMatch(/Desempenho desigual: 100% em Português contra 0% em Banco de Dados/);
    expect(improvements.join('\n')).toMatch(/abaixo da sua meta de 70%/);
  });

  it('mentions the goal as a strength when reached', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('AAAA'), 4);
    const { strengths, improvements } = analyzeExam(graded, { accuracyGoal: 80 });
    expect(strengths[0]).toMatch(/100%, acima da sua meta de 80%/);
    expect(strengths.join('\n')).toMatch(/Nenhuma questão em branco/);
    expect(improvements).toEqual(['Nenhum ponto crítico identificado neste simulado. Mantenha a rotina de revisão.']);
  });

  it('computes how many correct answers are missing to reach the goal', () => {
    const graded = gradeExam(keyOf('AAAAAAAAAA'), answersOf('AAAAAABBBB'), 10);
    const { improvements } = analyzeExam(graded, { accuracyGoal: 80 });
    expect(improvements[0]).toMatch(/faltaram 2 acerto\(s\)/);
  });

  it('flags a high rate of blank questions', () => {
    const graded = gradeExam(keyOf('AAAAAAAAAA'), answersOf('AAAAAAA---'), 10);
    const { improvements } = analyzeExam(graded);
    expect(improvements.join('\n')).toMatch(/3 questão\(ões\) em branco \(30%\)/);
  });

  it('does not flag a small number of blanks', () => {
    const graded = gradeExam(keyOf('AAAAAAAAAAAAAAAAAAAAAAAAA'), answersOf('AAAAAAAAAAAAAAAAAAAAAAAA-'), 25);
    const text = analyzeExam(graded).improvements.join('\n');
    expect(text).not.toMatch(/em branco/);
  });

  it('detects fatigue (performance drop) and weak starts', () => {
    const tired = analyzeExam(gradeExam(keyOf('AAAAAAAAA'), answersOf('AAABBBBBB'), 9), { accuracyGoal: 10 });
    expect(tired.improvements.join('\n')).toMatch(/Queda de rendimento/);
    const slow = analyzeExam(gradeExam(keyOf('AAAAAAAAA'), answersOf('BBBBBBAAA'), 9), { accuracyGoal: 10 });
    expect(slow.improvements.join('\n')).toMatch(/Início de prova mais fraco/);
  });

  it('praises a constant performance', () => {
    const graded = gradeExam(keyOf('AAAAAAAAA'), answersOf('AAAAAAAAA'), 9);
    expect(analyzeExam(graded).strengths.join('\n')).toMatch(/Rendimento constante/);
  });

  it('flags long streaks of wrong answers', () => {
    const graded = gradeExam(keyOf('AAAAAAAAAA'), answersOf('AAABBBBAAA'), 10);
    expect(analyzeExam(graded).improvements.join('\n')).toMatch(/Sequência de 4 erros seguidos \(questões 4 a 7\)/);
  });

  it('detects a bias toward one alternative in wrong answers', () => {
    const graded = gradeExam(keyOf('AAAAAAAAAA'), answersOf('CCCCBAAAAA'), 10);
    expect(analyzeExam(graded).improvements.join('\n')).toMatch(/Em 4 dos 5 erros você marcou a alternativa C/);
  });

  it('uses a higher bias threshold (70%) and Certo/Errado labels for 2-option exams', () => {
    const gradedBalanced = gradeExam(keyOf('EEECC'), answersOf('CCCEE'), 5);
    // 3 out of 5 errors are C (60% < 70%) -> should NOT flag bias in a 2-option exam
    expect(analyzeExam(gradedBalanced, { optionCount: 2 }).improvements.join('\n')).not.toMatch(/viés/);

    const gradedBiased = gradeExam(keyOf('EEEEC'), answersOf('CCCCE'), 5);
    // 4 out of 5 errors are C (80% >= 70%) -> should flag bias with Certo (C)
    expect(analyzeExam(gradedBiased, { optionCount: 2 }).improvements.join('\n')).toMatch(/Em 4 dos 5 erros você marcou Certo \(C\)/);
  });

  it('does not report a bias with few wrong answers', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('CCAA'), 4);
    expect(analyzeExam(graded).improvements.join('\n')).not.toMatch(/viés/);
  });

  it('warns when there are more errors than correct answers and no blanks', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('ABBB'), 4);
    expect(analyzeExam(graded).improvements.join('\n')).toMatch(/mais erros do que acertos/);
  });

  it('mentions annulled questions', () => {
    const graded = gradeExam({ 1: 'A', 2: ANNULLED }, { 1: 'A' }, 2);
    expect(analyzeExam(graded).strengths.join('\n')).toMatch(/1 questão\(ões\) anulada\(s\)/);
  });

  it('handles exams without scorable questions', () => {
    const graded = gradeExam({ 1: ANNULLED }, {}, 1);
    const analysis = analyzeExam(graded);
    expect(analysis.strengths).toEqual([]);
    expect(analysis.improvements[0]).toMatch(/não possui questões válidas/);
  });

  it('falls back to the discipline id when the name is unknown', () => {
    const graded = gradeExam(keyOf('AA'), answersOf('BB'), 2, [{ from: 1, to: 2, disciplineId: 'desconhecida' }]);
    expect(analyzeExam(graded).improvements.join('\n')).toMatch(/desconhecida: 0 de 2/);
  });

  it('always returns at least one bullet in each list', () => {
    const graded = gradeExam(keyOf('AAAA'), answersOf('BBBB'), 4);
    const { strengths } = analyzeExam(graded);
    expect(strengths.length).toBeGreaterThan(0);
  });
});
