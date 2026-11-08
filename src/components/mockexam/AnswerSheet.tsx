import { useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { Alert, Card, DisciplineDot, ProgressBar } from '../ui/Display';
import { ConfirmModal } from '../ui/ConfirmModal';
import { cn, errorMessage } from '../../lib/utils';
import { disciplineOfQuestion, isTrueFalseExam, keyedQuestions, optionLabel, optionLetters } from '../../domain/mockExam';
import { recordToKey, setMockExamAnswer, submitMockExam } from '../../services/mockExams';
import type { Discipline, MockExam } from '../../db/types';

/**
 * Uma questão: grupo de rádios nativos (setas do teclado funcionam) com bolhas
 * grandes. Clicar na alternativa já marcada a limpa.
 */
function QuestionRow({
  exam,
  number,
  letters,
  onMark,
}: {
  exam: MockExam;
  number: number;
  letters: string[];
  onMark: (question: number, letter: string) => void;
}) {
  const current = exam.responses[String(number)];
  const trueFalse = isTrueFalseExam(exam.optionCount);
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
        current ? 'border-primary/30 bg-primary-soft/40' : 'border-border bg-surface',
      )}
    >
      <span className="w-8 text-right text-sm font-semibold tabular-nums text-fg">{number}</span>
      <div role="radiogroup" aria-label={`Questão ${number}`} className="flex flex-wrap gap-2">
        {letters.map((letter) => {
          const labelText = optionLabel(letter, exam.optionCount);
          const ariaLabel = trueFalse
            ? `Questão ${number} alternativa ${letter} (${labelText})`
            : `Questão ${number} alternativa ${letter}`;
          return (
            <label key={letter} className="relative cursor-pointer" title={trueFalse ? labelText : undefined}>
              <input
                type="radio"
                name={`q-${number}`}
                value={letter}
                checked={current === letter}
                aria-label={ariaLabel}
                onChange={() => undefined}
                onClick={() => onMark(number, letter)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  trueFalse
                    ? 'flex h-10 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors'
                    : 'flex size-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  'border-border-strong bg-surface text-fg-muted hover:bg-surface-muted',
                  'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-fg',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2',
                )}
              >
                <span>{letter}</span>
                {trueFalse && <span className="text-xs font-medium opacity-90">{labelText}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function AnswerSheet({ exam, disciplines }: { exam: MockExam; disciplines: Discipline[] }) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const letters = optionLetters(exam.optionCount);
  const answerable = useMemo(() => keyedQuestions(recordToKey(exam.answerKey), exam.questionCount), [exam]);
  const marked = answerable.filter((n) => exam.responses[String(n)]).length;
  const blanks = answerable.length - marked;
  const disciplineById = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  // Agrupa questões consecutivas da mesma disciplina sob um subtítulo.
  const groups = useMemo(() => {
    const result: { key: string; discipline: Discipline | null; questions: number[] }[] = [];
    for (let n = 1; n <= exam.questionCount; n++) {
      const id = disciplineOfQuestion(n, exam.ranges);
      const last = result[result.length - 1];
      if (last && (last.discipline?.id ?? null) === id) last.questions.push(n);
      else result.push({ key: `${n}`, discipline: id ? (disciplineById.get(id) ?? null) : null, questions: [n] });
    }
    return result;
  }, [exam.questionCount, exam.ranges, disciplineById]);

  const mark = async (question: number, letter: string) => {
    setError(null);
    try {
      const current = exam.responses[String(question)];
      await setMockExamAnswer(exam.id, question, current === letter ? null : letter);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await submitMockExam(exam.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const requestSubmit = () => (blanks > 0 ? setConfirming(true) : void submit());

  return (
    <Card
      title="Marque suas respostas"
      description={
        isTrueFalseExam(exam.optionCount)
          ? 'Toque em Certo (C) ou Errado (E) em cada questão. Toque de novo para desmarcar. Suas marcações são salvas automaticamente.'
          : 'Toque na letra que você escolheu em cada questão. Toque de novo para desmarcar. Suas marcações são salvas automaticamente.'
      }
    >
      <div className="flex flex-col gap-5">
        <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-1.5 rounded-lg bg-surface/95 px-1 py-2 backdrop-blur-sm">
          <p className="text-sm font-medium text-fg" aria-live="polite">
            {marked} de {answerable.length} marcadas
          </p>
          <ProgressBar value={marked} max={Math.max(answerable.length, 1)} label="Progresso das marcações" />
        </div>

        {groups.map((group) => (
          <section key={group.key} aria-label={group.discipline ? group.discipline.name : undefined} className="flex flex-col gap-2">
            {group.discipline && (
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <DisciplineDot color={group.discipline.color} />
                {group.discipline.name}
                <span className="text-xs font-normal text-fg-subtle">
                  questões {group.questions[0]}–{group.questions[group.questions.length - 1]}
                </span>
              </h3>
            )}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.questions.map((n) => (
                <QuestionRow key={n} exam={exam} number={n} letters={letters} onMark={(q, l) => void mark(q, l)} />
              ))}
            </div>
          </section>
        ))}

        {error && <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert>}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button variant="primary" icon={<Send className="size-4" />} loading={sending} onClick={requestSubmit}>
            Enviar respostas
          </Button>
          {blanks > 0 && <span className="text-xs text-fg-muted">{blanks} questão(ões) ficarão em branco.</span>}
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        title="Enviar com questões em branco?"
        message={`Você deixou ${blanks} questão(ões) sem resposta. Elas serão contadas como em branco no resultado.`}
        confirmLabel="Enviar mesmo assim"
        cancelLabel="Voltar e marcar"
        variant="primary"
        loading={sending}
        onConfirm={submit}
        onClose={() => setConfirming(false)}
      />
    </Card>
  );
}
