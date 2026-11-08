/**
 * Lógica pura de simulados: leitura do gabarito, correção e análise de desempenho.
 * Sem acesso a banco ou rede, o que a torna totalmente testável.
 */

/** Marcador de questão anulada no gabarito. */
export const ANNULLED = 'X';

export const DEFAULT_OPTION_COUNT = 5;
export const TRUE_FALSE_OPTION_COUNT = 2;
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
export const TRUE_FALSE_LETTERS = ['C', 'E'] as const;
export const TRUE_FALSE_LABELS: Record<string, string> = {
  C: 'Certo',
  E: 'Errado',
};

/** Número da questão (1..n) → letra correta (ou `ANNULLED`). */
export type AnswerKey = Record<number, string>;
/** Número da questão → letra marcada (ou `null`/ausente = em branco). */
export type Responses = Record<number, string | null | undefined>;

export interface DisciplineRange {
  from: number;
  to: number;
  disciplineId: string;
}

export interface ParsedAnswerKey {
  /** Gabarito em ordem crescente de questão. */
  key: AnswerKey;
  questionCount: number;
  warnings: string[];
}

/* ------------------------------ Gabarito ------------------------------ */

const ANNULLED_WORD = /^(anulada|anulado|nula|nulo|x|\*)$/i;
const TRUE_WORD = /^(certo|certa|verdadeiro|verdadeira|v)$/i;
const FALSE_WORD = /^(errado|errada|falso|falsa|f)$/i;

function normalizeAnswer(raw: string, optionCount?: number): string | null {
  const token = raw.trim();
  if (ANNULLED_WORD.test(token)) return ANNULLED;
  if (TRUE_WORD.test(token)) return 'C';
  if (FALSE_WORD.test(token)) return 'E';
  if (optionCount === TRUE_FALSE_OPTION_COUNT) {
    if (/^[CcEe]$/.test(token)) return token.toUpperCase();
    return null;
  }
  if (/^[A-Ea-e]$/.test(token)) return token.toUpperCase();
  return null;
}

/**
 * Lê um gabarito em texto livre. Formatos aceitos:
 *  - pares número/letra: `1 A`, `1-A`, `01) B`, `3: C`, `4.D`, `5=E`, `1 Certo`, `2 Errado`;
 *  - tabela em duas linhas (números e depois letras/respostas);
 *  - sequência de letras (`ABCDE…`, `CCEE…` ou `A, B, C…`), numerada a partir de 1.
 * `X`, `*` ou `ANULADA` marcam questão anulada.
 */
export const MAX_ANSWER_KEY_TEXT_LENGTH = 500_000;

export function parseAnswerKey(text: string, optionCount?: number): ParsedAnswerKey {
  const warnings: string[] = [];
  const boundedText = text.length > MAX_ANSWER_KEY_TEXT_LENGTH ? text.slice(0, MAX_ANSWER_KEY_TEXT_LENGTH) : text;
  const normalizedText = boundedText.replace(/\r/g, '\n');
  const found = new Map<number, string>();

  const register = (num: number, answer: string) => {
    if (num < 1 || num > 500) return;
    if (found.has(num) && found.get(num) !== answer) {
      warnings.push(`Questão ${num} aparece mais de uma vez com respostas diferentes; foi mantida a última.`);
    }
    found.set(num, answer);
  };

  // 1) Tabela: linha só de números seguida de linha só de respostas, com o mesmo tamanho.
  const lines = normalizedText.split('\n').map((l) => l.trim()).filter(Boolean);
  const splitCells = (line: string) => line.split(/[\s,;|]+/).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const nums = splitCells(lines[i]);
    const answers = splitCells(lines[i + 1]);
    if (
      nums.length >= 2 &&
      nums.length === answers.length &&
      nums.every((n) => /^\d{1,3}$/.test(n)) &&
      answers.every((a) => normalizeAnswer(a, optionCount) !== null)
    ) {
      nums.forEach((n, idx) => register(Number(n), normalizeAnswer(answers[idx], optionCount) as string));
      i++;
    }
  }

  // 2) Pares número/resposta.
  if (found.size === 0) {
    const pair =
      /(?:^|[^\dA-Za-z])0*(\d{1,3})\s*[-–—.):=\s]+\s*(anulada|anulado|nula|nulo|certo|certa|errado|errada|verdadeiro|verdadeira|falso|falsa|[A-Ea-eVvFfXx*])(?![A-Za-z])/gi;
    let m: RegExpExecArray | null;
    while ((m = pair.exec(normalizedText)) !== null) {
      const normalized = normalizeAnswer(m[2], optionCount);
      if (normalized) register(Number(m[1]), normalized);
    }
  }

  // 3) Sequência de letras sem numeração.
  if (found.size === 0) {
    const compact = normalizedText.replace(/[\s,;|-]+/g, '');
    const compactPattern = optionCount === TRUE_FALSE_OPTION_COUNT ? /^[CcEeVvFfXx*]+$/ : /^[A-Ea-eVvFfXx*]+$/;
    const tokens = compactPattern.test(compact)
      ? compact.split('')
      : lines.flatMap(splitCells).every((t) => normalizeAnswer(t, optionCount) !== null)
        ? lines.flatMap(splitCells)
        : [];
    tokens.forEach((t, idx) => {
      const answer = normalizeAnswer(t, optionCount);
      if (answer) register(idx + 1, answer);
    });
  }

  const numbers = [...found.keys()].sort((a, b) => a - b);
  if (numbers.length === 0) {
    return { key: {}, questionCount: 0, warnings: ['Nenhuma questão com resposta foi encontrada no gabarito.'] };
  }

  const questionCount = numbers[numbers.length - 1];
  const missing: number[] = [];
  for (let n = 1; n <= questionCount; n++) if (!found.has(n)) missing.push(n);
  if (missing.length > 0) {
    const preview = missing.slice(0, 10).join(', ');
    warnings.push(
      `Faltam respostas para ${missing.length} questão(ões): ${preview}${missing.length > 10 ? '…' : ''}. Elas serão desconsideradas na correção.`,
    );
  }

  const key: AnswerKey = {};
  for (const n of numbers) key[n] = found.get(n) as string;
  return { key, questionCount, warnings };
}

/** Números das questões que realmente têm resposta no gabarito. */
export function keyedQuestions(key: AnswerKey, questionCount: number): number[] {
  const result: number[] = [];
  for (let n = 1; n <= questionCount; n++) if (key[n] !== undefined) result.push(n);
  return result;
}

export function isTrueFalseExam(optionCount: number): boolean {
  return Math.round(optionCount) === TRUE_FALSE_OPTION_COUNT;
}

export function optionLetters(optionCount: number): string[] {
  const count = Math.min(Math.max(Math.round(optionCount), 2), OPTION_LETTERS.length);
  if (count === TRUE_FALSE_OPTION_COUNT) {
    return [...TRUE_FALSE_LETTERS];
  }
  return OPTION_LETTERS.slice(0, count) as unknown as string[];
}

export function optionLabel(letter: string, optionCount: number): string {
  if (isTrueFalseExam(optionCount)) {
    return TRUE_FALSE_LABELS[letter] ?? letter;
  }
  return letter;
}

/* ------------------------- Faixas por disciplina ------------------------- */

export function validateRanges(ranges: DisciplineRange[], questionCount: number): string[] {
  const errors: string[] = [];
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  sorted.forEach((r, idx) => {
    if (!Number.isInteger(r.from) || !Number.isInteger(r.to)) {
      errors.push('Os limites das faixas devem ser números inteiros.');
      return;
    }
    if (r.from < 1 || r.to > questionCount) {
      errors.push(`A faixa ${r.from}–${r.to} está fora das questões 1–${questionCount}.`);
    }
    if (r.from > r.to) errors.push(`A faixa ${r.from}–${r.to} é inválida (início maior que o fim).`);
    if (!r.disciplineId) errors.push(`Escolha a disciplina da faixa ${r.from}–${r.to}.`);
    const prev = sorted[idx - 1];
    if (prev && r.from <= prev.to) errors.push(`As faixas ${prev.from}–${prev.to} e ${r.from}–${r.to} se sobrepõem.`);
  });
  return [...new Set(errors)];
}

export function disciplineOfQuestion(question: number, ranges: DisciplineRange[]): string | null {
  const range = ranges.find((r) => question >= r.from && question <= r.to);
  return range ? range.disciplineId : null;
}

/* ------------------------------- Correção ------------------------------- */

export type QuestionOutcome = 'correct' | 'wrong' | 'blank' | 'annulled';

export interface QuestionResult {
  number: number;
  correctAnswer: string;
  marked: string | null;
  outcome: QuestionOutcome;
  disciplineId: string | null;
}

export interface ExamTotals {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  annulled: number;
  /** Questões válidas para pontuação (total − anuladas). */
  scored: number;
  /** 0–100, `null` se não houver questão válida. */
  accuracy: number | null;
}

export interface GroupStats {
  key: string;
  label?: string;
  correct: number;
  wrong: number;
  blank: number;
  scored: number;
  accuracy: number | null;
}

export interface GradedExam {
  results: QuestionResult[];
  totals: ExamTotals;
}

export function normalizeMarked(value: string | null | undefined, optionCount?: number): string | null {
  if (!value) return null;
  const token = value.trim();
  if (TRUE_WORD.test(token)) return 'C';
  if (FALSE_WORD.test(token)) return 'E';
  const letter = token.toUpperCase();
  if (optionCount !== undefined) {
    return optionLetters(optionCount).includes(letter) ? letter : null;
  }
  return /^[A-E]$/.test(letter) ? letter : null;
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function gradeExam(
  key: AnswerKey,
  responses: Responses,
  questionCount: number,
  ranges: DisciplineRange[] = [],
): GradedExam {
  const results: QuestionResult[] = [];
  for (const number of keyedQuestions(key, questionCount)) {
    const correctAnswer = key[number];
    const marked = normalizeMarked(responses[number]);
    let outcome: QuestionOutcome;
    if (correctAnswer === ANNULLED) outcome = 'annulled';
    else if (marked === null) outcome = 'blank';
    else outcome = marked === correctAnswer ? 'correct' : 'wrong';
    results.push({ number, correctAnswer, marked, outcome, disciplineId: disciplineOfQuestion(number, ranges) });
  }

  const count = (o: QuestionOutcome) => results.filter((r) => r.outcome === o).length;
  const correct = count('correct');
  const wrong = count('wrong');
  const blank = count('blank');
  const annulled = count('annulled');
  const scored = results.length - annulled;
  return {
    results,
    totals: { total: results.length, correct, wrong, blank, annulled, scored, accuracy: percent(correct, scored) },
  };
}

function groupStats(key: string, items: QuestionResult[], label?: string): GroupStats {
  const valid = items.filter((r) => r.outcome !== 'annulled');
  const correct = valid.filter((r) => r.outcome === 'correct').length;
  const wrong = valid.filter((r) => r.outcome === 'wrong').length;
  const blank = valid.filter((r) => r.outcome === 'blank').length;
  return { key, label, correct, wrong, blank, scored: valid.length, accuracy: percent(correct, valid.length) };
}

/** Desempenho por disciplina (somente questões dentro de alguma faixa). */
export function statsByDiscipline(results: QuestionResult[]): GroupStats[] {
  const groups = new Map<string, QuestionResult[]>();
  for (const r of results) {
    if (!r.disciplineId) continue;
    groups.set(r.disciplineId, [...(groups.get(r.disciplineId) ?? []), r]);
  }
  return [...groups.entries()].map(([id, items]) => groupStats(id, items)).filter((g) => g.scored > 0);
}

/** Desempenho por terço da prova (início, meio e fim), útil para detectar cansaço. */
export function statsByThird(results: QuestionResult[]): GroupStats[] {
  if (results.length < 3) return [];
  const size = Math.ceil(results.length / 3);
  const labels = ['Início da prova', 'Meio da prova', 'Fim da prova'];
  return labels
    .map((label, idx) => groupStats(`third-${idx}`, results.slice(idx * size, (idx + 1) * size), label))
    .filter((g) => g.scored > 0);
}

/** Maior sequência de erros consecutivos (ignora brancos e anuladas no meio da sequência). */
export function longestWrongStreak(results: QuestionResult[]): { length: number; from: number; to: number } | null {
  type Streak = { length: number; from: number; to: number };
  let best: Streak | null = null;
  let current: Streak | null = null;
  for (const r of results) {
    if (r.outcome === 'wrong') {
      const next: Streak = current
        ? { from: current.from, length: current.length + 1, to: r.number }
        : { length: 1, from: r.number, to: r.number };
      current = next;
      if (!best || next.length > best.length) best = next;
    } else if (r.outcome === 'correct') {
      current = null;
    }
  }
  return best;
}

/* -------------------------------- Análise -------------------------------- */

export interface ExamAnalysis {
  strengths: string[];
  improvements: string[];
}

export interface AnalyzeOptions {
  /** Meta de acerto (0–100). */
  accuracyGoal?: number;
  /** Nome legível de cada disciplina (por id). */
  disciplineNames?: Record<string, string>;
  /** Quantidade de alternativas por questão (2 = Certo/Errado). */
  optionCount?: number;
}

const fmt = (value: number | null) => (value === null ? '—' : `${String(value).replace('.', ',')}%`);

/**
 * Gera a análise textual do desempenho, de forma determinística e local
 * (nenhum dado da prova sai do navegador).
 */
export function analyzeExam(graded: GradedExam, options: AnalyzeOptions = {}): ExamAnalysis {
  const { accuracyGoal = 70, disciplineNames = {}, optionCount = DEFAULT_OPTION_COUNT } = options;
  const { totals, results } = graded;
  const strengths: string[] = [];
  const improvements: string[] = [];
  const name = (id: string) => disciplineNames[id] ?? id;

  if (totals.scored === 0) {
    return { strengths, improvements: ['O gabarito não possui questões válidas para correção.'] };
  }

  const accuracy = totals.accuracy as number;
  if (accuracy >= accuracyGoal) {
    strengths.push(`Aproveitamento geral de ${fmt(accuracy)}, acima da sua meta de ${accuracyGoal}%.`);
  } else {
    improvements.push(
      `Aproveitamento geral de ${fmt(accuracy)}, abaixo da sua meta de ${accuracyGoal}% (faltaram ${Math.max(
        1,
        Math.ceil((accuracyGoal / 100) * totals.scored) - totals.correct,
      )} acerto(s) para atingi-la).`,
    );
  }

  // Disciplinas
  const disciplines = statsByDiscipline(results);
  for (const g of [...disciplines].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))) {
    const text = `${name(g.key)}: ${g.correct} de ${g.scored} (${fmt(g.accuracy)})`;
    if ((g.accuracy ?? 0) >= accuracyGoal) strengths.push(`${text} — ponto forte.`);
  }
  for (const g of [...disciplines].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))) {
    if ((g.accuracy ?? 0) < accuracyGoal) {
      const extra = g.blank > 0 ? `, com ${g.blank} em branco` : '';
      improvements.push(`${name(g.key)}: ${g.correct} de ${g.scored} (${fmt(g.accuracy)})${extra} — priorize a revisão desta disciplina.`);
    }
  }
  if (disciplines.length >= 2) {
    const sorted = [...disciplines].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.key !== worst.key && (best.accuracy ?? 0) - (worst.accuracy ?? 0) >= 20) {
      improvements.push(
        `Desempenho desigual: ${fmt(best.accuracy)} em ${name(best.key)} contra ${fmt(worst.accuracy)} em ${name(worst.key)}.`,
      );
    }
  }

  // Questões em branco
  const blankRate = totals.blank / totals.scored;
  if (totals.blank === 0) {
    strengths.push('Nenhuma questão em branco: você respondeu toda a prova.');
  } else if (blankRate >= 0.1) {
    improvements.push(
      `${totals.blank} questão(ões) em branco (${fmt(percent(totals.blank, totals.scored))}). Revise a gestão de tempo e o critério de chute.`,
    );
  }

  // Erros × chute
  if (totals.wrong > 0 && totals.wrong >= totals.correct && totals.blank === 0) {
    improvements.push('Há mais erros do que acertos e nenhuma questão em branco: considere deixar em branco as que você não domina, se a prova penalizar erros.');
  }

  // Fadiga
  const thirds = statsByThird(results);
  if (thirds.length === 3) {
    const [first, , last] = thirds;
    if ((first.accuracy ?? 0) - (last.accuracy ?? 0) >= 15) {
      improvements.push(
        `Queda de rendimento ao longo da prova: ${fmt(first.accuracy)} no início contra ${fmt(last.accuracy)} no fim. Treine resistência com simulados completos.`,
      );
    } else if ((last.accuracy ?? 0) - (first.accuracy ?? 0) >= 15) {
      improvements.push(
        `Início de prova mais fraco (${fmt(first.accuracy)}) que o final (${fmt(last.accuracy)}): melhore a concentração nas primeiras questões.`,
      );
    } else if (Math.abs((last.accuracy ?? 0) - (first.accuracy ?? 0)) <= 5 && accuracy >= accuracyGoal) {
      strengths.push('Rendimento constante do início ao fim da prova.');
    }
  }

  // Sequência de erros
  const streak = longestWrongStreak(results);
  if (streak && streak.length >= 4) {
    improvements.push(`Sequência de ${streak.length} erros seguidos (questões ${streak.from} a ${streak.to}) — vale rever esse trecho com atenção.`);
  }

  // Viés de marcação nos erros
  const wrongs = results.filter((r) => r.outcome === 'wrong');
  if (wrongs.length >= 5) {
    const counts = new Map<string, number>();
    for (const r of wrongs) counts.set(r.marked as string, (counts.get(r.marked as string) ?? 0) + 1);
    const [letter, qty] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const biasThreshold = isTrueFalseExam(optionCount) ? 0.7 : 0.4;
    if (qty / wrongs.length >= biasThreshold) {
      const displayLetter = isTrueFalseExam(optionCount) ? `${optionLabel(letter, optionCount)} (${letter})` : `a alternativa ${letter}`;
      improvements.push(`Em ${qty} dos ${wrongs.length} erros você marcou ${displayLetter}: cuidado com o viés de chute.`);
    }
  }

  // Anuladas
  if (totals.annulled > 0) {
    strengths.push(`${totals.annulled} questão(ões) anulada(s) foram desconsideradas do cálculo.`);
  }

  if (strengths.length === 0) strengths.push('Ainda não há pontos fortes claros neste simulado — continue praticando.');
  if (improvements.length === 0) improvements.push('Nenhum ponto crítico identificado neste simulado. Mantenha a rotina de revisão.');
  return { strengths, improvements };
}
