import { useState } from 'react';
import { CheckCircle2, XCircle, Sparkles, Flame, Layers } from 'lucide-react';
import { Button } from '../ui/Button';
import { FormattedText } from '../ui/RichText';
import { Badge, DisciplineDot } from '../ui/Display';
import { cn } from '../../lib/utils';
import { resolveReviewDisplayTitle } from '../../services/performance';
import type { Discipline, ErrorFlashcard, ErrorNote, ReviewTask } from '../../db/types';

interface Props {
  reviews: ReviewTask[];
  notes: Map<string, ErrorNote>;
  disciplines: Map<string, Discipline>;
  onComplete: (review: ReviewTask, stats?: { hits: number; misses: number }) => Promise<void>;
}

/** Baralho de flashcards: um por vez, vira ao responder (Certo/Errado) e só avança depois. */
export function FlashcardDeck({ reviews, notes, disciplines, onComplete }: Props) {
  const [totalReviews] = useState(reviews.length);
  const [doneReviews, setDoneReviews] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [reviewStats, setReviewStats] = useState({ hits: 0, misses: 0 });
  const [streak, setStreak] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const [totalCardsAnswered, setTotalCardsAnswered] = useState(0);
  const [picked, setPicked] = useState<'certo' | 'errado' | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [animating, setAnimating] = useState(false);

  const current = reviews[0];
  const note = current?.errorNoteId ? notes.get(current.errorNoteId) : undefined;
  const cards: ErrorFlashcard[] = note?.flashcards ?? [];
  const card: ErrorFlashcard | undefined = cards[cardIndex];

  if (!current) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success-soft/20 p-10 text-center space-y-2">
        <Sparkles className="mx-auto size-10 text-success" />
        <h3 className="text-xl font-bold text-fg">Sessão concluída!</h3>
        <p className="text-sm text-fg-muted">
          {totalCardsAnswered > 0
            ? `Você acertou ${totalHits} de ${totalCardsAnswered} flashcards.`
            : 'Todas as revisões de hoje foram concluídas.'}
        </p>
      </div>
    );
  }

  const d = disciplines.get(current.disciplineId);
  const displayTitle = resolveReviewDisplayTitle(current, note);
  const correct = animating ? lastCorrect : (picked !== null && card ? picked === card.answer : false);
  const progress = totalReviews > 0 ? Math.round((doneReviews / totalReviews) * 100) : 0;

  const answer = (choice: 'certo' | 'errado') => {
    if (picked || !card) return;
    const isCorrect = choice === card.answer;
    setPicked(choice);
    setLastCorrect(isCorrect);
    setTotalCardsAnswered((n) => n + 1);
    if (isCorrect) {
      setTotalHits((h) => h + 1);
      setStreak((s) => s + 1);
      setReviewStats((s) => ({ ...s, hits: s.hits + 1 }));
    } else {
      setStreak(0);
      setReviewStats((s) => ({ ...s, misses: s.misses + 1 }));
    }
  };

  const next = async () => {
    if (cardIndex + 1 < cards.length) {
      setAnimating(true);
      setPicked(null);
      // Wait for flip animation to complete before changing card
      setTimeout(() => {
        setCardIndex((i) => i + 1);
        setAnimating(false);
      }, 700);
      return;
    }
    await onComplete(current, reviewStats);
    setDoneReviews((n) => n + 1);
    setCardIndex(0);
    setReviewStats({ hits: 0, misses: 0 });
    setPicked(null);
    setAnimating(false);
  };

  const completeWithoutFlashcard = async () => {
    await onComplete(current);
    setDoneReviews((n) => n + 1);
    setCardIndex(0);
    setReviewStats({ hits: 0, misses: 0 });
    setPicked(null);
    setAnimating(false);
  };

  const face = 'absolute inset-0 flex flex-col rounded-2xl border p-6 sm:p-8 [backface-visibility:hidden]';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-fg">
            Revisão {Math.min(doneReviews + 1, totalReviews)} de {totalReviews}
            {cards.length > 1 ? ` · Flashcard ${cardIndex + 1} de ${cards.length}` : ''}
          </span>
          <span className="flex items-center gap-1 font-semibold text-warning">
            <Flame className="size-4" /> {streak} em sequência
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
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
              <span className="text-xs text-fg-muted truncate">{displayTitle}</span>
            </div>
            <div className="my-4 flex-1 overflow-y-auto">
              {card ? (
                <FormattedText text={card.statement} className="text-lg leading-relaxed" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-fg-muted">
                  <Layers className="size-8 text-fg-subtle" />
                  <p>
                    {note
                      ? 'Nenhum flashcard cadastrado para este erro ainda. Crie um flashcard no Caderno de Erros para revisar.'
                      : 'Esta revisão não possui flashcard vinculado.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void completeWithoutFlashcard()}>
                      Concluir sem flashcard
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                disabled={!card}
                onClick={() => answer('certo')}
                icon={<CheckCircle2 className="size-5" />}
              >
                Certo
              </Button>
              <Button
                variant="secondary"
                disabled={!card}
                onClick={() => answer('errado')}
                icon={<XCircle className="size-5" />}
              >
                Errado
              </Button>
            </div>
          </div>

          <div
            className={cn(
              face,
              '[transform:rotateY(180deg)]',
              correct ? 'border-success bg-success text-white' : 'border-danger bg-danger text-white',
            )}
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
              {cardIndex + 1 < cards.length ? 'Próximo flashcard' : 'Próximo card'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
