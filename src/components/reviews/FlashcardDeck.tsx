import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Sparkles, Flame, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { FormattedText } from '../ui/RichText';
import { Badge, DisciplineDot } from '../ui/Display';
import { cn } from '../../lib/utils';
import { ensureFlashcard } from '../../services/flashcards';
import type { Discipline, ErrorFlashcard, ErrorNote, ReviewTask } from '../../db/types';

interface Props {
  reviews: ReviewTask[];
  notes: Map<string, ErrorNote>;
  disciplines: Map<string, Discipline>;
  onComplete: (review: ReviewTask, result?: 'acerto' | 'erro') => Promise<void>;
}

/** Baralho de flashcards: um por vez, vira ao responder (Certo/Errado) e só avança depois. */
export function FlashcardDeck({ reviews, notes, disciplines, onComplete }: Props) {
  const [total] = useState(reviews.length);
  const [done, setDone] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hits, setHits] = useState(0);
  const [picked, setPicked] = useState<'certo' | 'errado' | null>(null);

  const current = reviews[0];
  const note = current?.errorNoteId ? notes.get(current.errorNoteId) : undefined;
  const card: ErrorFlashcard | null | undefined = note?.flashcard;
  const noteId = note?.id;

  const [genError, setGenError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setGenError(null);
    if (!noteId || card) return;
    let cancelled = false;
    void ensureFlashcard(noteId).then((r) => {
      if (!cancelled && r.error) setGenError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [noteId, card, attempt]);

  if (!current) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success-soft/20 p-10 text-center space-y-2">
        <Sparkles className="mx-auto size-10 text-success" />
        <h3 className="text-xl font-bold text-fg">Sessão concluída!</h3>
        <p className="text-sm text-fg-muted">
          {done > 0 ? `Você acertou ${hits} de ${done} flashcards.` : 'Nenhum flashcard pendente agora.'}
        </p>
      </div>
    );
  }

  const d = disciplines.get(current.disciplineId);
  const correct = picked !== null && card ? picked === card.answer : false;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const answer = (choice: 'certo' | 'errado') => {
    if (picked || !card) return;
    setPicked(choice);
    if (choice === card.answer) {
      setHits((h) => h + 1);
      setStreak((s) => s + 1);
    } else setStreak(0);
  };

  const next = async () => {
    await onComplete(current, picked === card?.answer ? 'acerto' : 'erro');
    setDone((n) => n + 1);
    setPicked(null);
  };

  const face = 'absolute inset-0 flex flex-col rounded-2xl border p-6 sm:p-8 [backface-visibility:hidden]';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-fg">
            Card {Math.min(done + 1, total)} de {total}
          </span>
          <span className="flex items-center gap-1 font-semibold text-warning">
            <Flame className="size-4" /> {streak} em sequência
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="[perspective:1400px]">
        <div
          className="relative h-[26rem] transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:duration-0"
          style={{ transform: picked ? 'rotateY(180deg)' : 'none' }}
        >
          <div className={cn(face, 'border-border bg-surface')}>
            <div className="flex flex-wrap items-center gap-2">
              {d && <DisciplineDot color={d.color} />}
              <span className="text-sm font-semibold text-fg">{d?.name}</span>
              <Badge tone="neutral">Ciclo de {current.intervalDays}d</Badge>
            </div>
            <div className="my-4 flex-1 overflow-y-auto">
              {card ? (
                <FormattedText text={card.statement} className="text-lg leading-relaxed" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-fg-muted">
                  {genError || !note ? (
                    <>
                      <p role="alert" className="text-danger">
                        {note ? `Não foi possível gerar o flashcard: ${genError}` : 'Esta revisão não está vinculada a um erro.'}
                      </p>
                      {note && (
                        <Button size="sm" variant="primary" onClick={() => setAttempt((n) => n + 1)}>
                          Tentar novamente
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Loader2 className="size-6 animate-spin" />
                      Gerando flashcard com o Gemini…
                    </>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => void onComplete(current).then(() => setDone((n) => n + 1))}>
                    Concluir sem flashcard
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={!card} onClick={() => answer('certo')} icon={<CheckCircle2 className="size-5" />}>
                Certo
              </Button>
              <Button variant="secondary" disabled={!card} onClick={() => answer('errado')} icon={<XCircle className="size-5" />}>
                Errado
              </Button>
            </div>
          </div>

          <div
            className={cn(face, '[transform:rotateY(180deg)]', correct ? 'border-success bg-success text-white' : 'border-danger bg-danger text-white')}
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-xl font-bold">
              {correct ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
              {correct ? 'Você acertou!' : 'Você errou'}
            </div>
            <div className="my-4 flex-1 space-y-3 overflow-y-auto">
              <p className="text-base">
                <strong>Gabarito:</strong> {card?.answer === 'certo' ? 'Certo' : 'Errado'}
              </p>
              <div className="text-sm opacity-95">
                <strong>Definição correta:</strong>
                <FormattedText text={card?.explanation ?? ''} className="mt-1 text-white" />
              </div>
            </div>
            <Button variant="secondary" onClick={() => void next()}>
              Próximo card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
