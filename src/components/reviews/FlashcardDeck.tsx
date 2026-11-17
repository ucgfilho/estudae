import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, XCircle, Sparkles, Flame, Layers, RotateCcw, CheckCircle } from 'lucide-react';
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

interface SavedProgress {
  totalReviews?: number;
  doneReviews: number;
  cardIndex: number;
  reviewStats: { hits: number; misses: number };
  streak: number;
  totalHits: number;
  totalCardsAnswered: number;
  reviewIds: string[];
  date: string;
}

interface MissedFlashcard {
  reviewId: string;
  reviewIndex: number;
  cardIndex: number;
  card: ErrorFlashcard;
  note: ErrorNote | undefined;
  disciplineId: string;
  displayTitle: string;
  intervalDays: number;
}

const STORAGE_KEY_PREFIX = 'flashcard-deck-progress-';
const getTodayKey = () => {
  const today = new Date();
  return `${STORAGE_KEY_PREFIX}${today.toISOString().split('T')[0]}`;
};

/** Baralho de flashcards: um por vez, vira ao responder (Certo/Errado) e só avança depois. */
export function FlashcardDeck({ reviews, notes, disciplines, onComplete }: Props) {
  const [totalReviews, setTotalReviews] = useState(reviews.length);
  const [doneReviews, setDoneReviews] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [reviewStats, setReviewStats] = useState({ hits: 0, misses: 0 });
  const [streak, setStreak] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const [totalCardsAnswered, setTotalCardsAnswered] = useState(0);
  const [picked, setPicked] = useState<'certo' | 'errado' | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  // Redo mode state
  const [redoMode, setRedoMode] = useState(false);
  const [missedFlashcards, setMissedFlashcards] = useState<MissedFlashcard[]>([]);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Ensure totalReviews is properly set when reviews are loaded
  useEffect(() => {
    if (totalReviews === 0 && reviews.length > 0) {
      setTotalReviews(reviews.length);
    }
  }, [reviews.length, totalReviews]);

  // Create a unique identifier for the current review list to validate saved progress
  const reviewIds = useMemo(() => reviews.map(r => r.id), [reviews]);

  // Load saved progress on mount
  useEffect(() => {
    const key = getTodayKey();
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const progress: SavedProgress = JSON.parse(saved);
        // Validate that the saved progress matches current reviews
        if (progress.date === new Date().toISOString().split('T')[0] &&
            progress.reviewIds.length === reviewIds.length &&
            progress.reviewIds.every((id, i) => id === reviewIds[i])) {
          setTotalReviews(progress.totalReviews ?? (progress.doneReviews + reviews.length));
          setDoneReviews(progress.doneReviews);
          setCardIndex(progress.cardIndex);
          setReviewStats(progress.reviewStats);
          setStreak(progress.streak);
          setTotalHits(progress.totalHits);
          setTotalCardsAnswered(progress.totalCardsAnswered);
        } else {
          // Clear invalid progress
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore parse errors
    }
    setProgressLoaded(true);
  }, [reviewIds]);

  // Save progress whenever relevant state changes
  useEffect(() => {
    if (!progressLoaded) return;
    const key = getTodayKey();
    const progress: SavedProgress = {
      totalReviews,
      doneReviews,
      cardIndex,
      reviewStats,
      streak,
      totalHits,
      totalCardsAnswered,
      reviewIds,
      date: new Date().toISOString().split('T')[0],
    };
    localStorage.setItem(key, JSON.stringify(progress));
  }, [totalReviews, doneReviews, cardIndex, reviewStats, streak, totalHits, totalCardsAnswered, reviewIds, progressLoaded]);

  // Clear progress when all reviews are done (but not in redo mode)
  useEffect(() => {
    if (progressLoaded && doneReviews >= totalReviews && totalReviews > 0 && !redoMode) {
      localStorage.removeItem(getTodayKey());
    }
  }, [doneReviews, totalReviews, progressLoaded, redoMode]);

  // Current item to review (in normal mode reviews[0] is next as reviews drop; in redoMode index by doneReviews)
  const current = redoMode ? missedFlashcards[doneReviews] : reviews[0];

  // Get note and cards for current item - type narrowing
  let note: ErrorNote | undefined;
  let cards: ErrorFlashcard[] = [];
  let displayTitle = '';
  let d: Discipline | undefined;

  if (!redoMode && current) {
    const review = current as ReviewTask;
    note = review.errorNoteId ? notes.get(review.errorNoteId) : undefined;
    cards = note?.flashcards ?? [];
    d = disciplines.get(review.disciplineId);
    displayTitle = resolveReviewDisplayTitle(review, note);
  } else if (redoMode && current) {
    const missed = current as MissedFlashcard;
    note = missed.note;
    cards = [missed.card];
    d = disciplines.get(missed.disciplineId);
    displayTitle = missed.displayTitle;
  }
  const card = cards[cardIndex];

  // Completion screen - show when all items done
  if (!current) {
    if (redoMode) {
      // All missed flashcards completed in redo mode
      return (
        <div className="rounded-2xl border border-success/40 bg-success-soft/20 p-10 text-center space-y-4">
          <CheckCircle className="mx-auto size-12 text-success" />
          <h3 className="text-xl font-bold text-fg">Revisão do dia concluída!</h3>
          <p className="text-sm text-fg-muted">
            Você acertou todos os flashcards em revisão. Ótimo trabalho!
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="primary" onClick={() => {}} disabled>
              Finalizar
            </Button>
          </div>
        </div>
      );
    }

    // First pass completed - show summary and offer redo
    if (!sessionCompleted && missedFlashcards.length > 0) {
      return (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 max-w-md mx-auto">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="size-8 text-primary" />
            <h3 className="text-xl font-bold text-fg">Primeira rodada concluída!</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-surface-muted rounded-xl">
            <div className="text-center">
              <div className="text-3xl font-bold text-success">{totalHits}</div>
              <div className="text-sm text-fg-muted">Acertos</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-danger">{totalCardsAnswered - totalHits}</div>
              <div className="text-sm text-fg-muted">Erros</div>
            </div>
          </div>

          <p className="text-sm text-fg-muted text-center">
            Você errou {missedFlashcards.length} flashcard{missedFlashcards.length !== 1 ? 's' : ''}.
            Deseja revisar apenas os que errou até acertar todos?
          </p>

          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" onClick={() => handleStartRedo()}>
              <RotateCcw className="size-4 mr-2" />
              Refazer os que errei ({missedFlashcards.length})
            </Button>
            <Button variant="secondary" size="lg" onClick={() => handleFinishSession()}>
              Finalizar mesmo assim
            </Button>
          </div>
        </div>
      );
    }

    // Final completion screen
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

  const correct = animating ? lastCorrect : (picked !== null && card ? picked === card.answer : false);
  const currentTotalItems = redoMode ? missedFlashcards.length : Math.max(totalReviews, doneReviews);
  const progress = currentTotalItems > 0 ? Math.min(100, Math.max(0, Math.round((doneReviews / currentTotalItems) * 100))) : 0;

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
      // Track missed flashcard for redo mode
      if (!redoMode) {
        const review = current as ReviewTask;
        setMissedFlashcards((prev) => [
          ...prev,
          {
            reviewId: review.id,
            reviewIndex: doneReviews,
            cardIndex,
            card,
            note,
            disciplineId: review.disciplineId,
            displayTitle,
            intervalDays: review.intervalDays,
          },
        ]);
      }
    }
  };

  function handleStartRedo() {
    setRedoMode(true);
    setDoneReviews(0);
    setCardIndex(0);
    setReviewStats({ hits: 0, misses: 0 });
    setSessionCompleted(true);
  }

  function handleFinishSession() {
    setSessionCompleted(true);
  }

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

    // Last card of current item - flip back then advance
    setAnimating(true);
    setPicked(null); // Start flip-back animation
    // Wait for flip-back to complete, then advance to next item
    setTimeout(async () => {
      if (!redoMode) {
        const review = current as ReviewTask;
        await onComplete(review, reviewStats);
      }
      setDoneReviews((n) => n + 1);
      setCardIndex(0);
      setReviewStats({ hits: 0, misses: 0 });
      // Now on front face of next item's first card, no flip needed
      setAnimating(false);
    }, 700);
  };

  const completeWithoutFlashcard = async () => {
    setAnimating(true);
    setPicked(null); // Start flip-back animation
    // Wait for flip-back to complete, then advance to next item
    setTimeout(async () => {
      if (!redoMode) {
        const review = current as ReviewTask;
        await onComplete(review);
      }
      setDoneReviews((n) => n + 1);
      setCardIndex(0);
      setReviewStats({ hits: 0, misses: 0 });
      // Now on front face of next item's first card, no flip needed
      setAnimating(false);
    }, 700);
  };

  const face = 'absolute inset-0 flex flex-col rounded-2xl border p-6 sm:p-8 [backface-visibility:hidden]';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-fg">
            {redoMode
              ? `Revisão de erros ${doneReviews + 1} de ${currentTotalItems}`
              : `Revisão ${Math.min(doneReviews + 1, currentTotalItems)} de ${currentTotalItems}`}
            {!redoMode && cards.length > 1 ? ` · Flashcard ${cardIndex + 1} de ${cards.length}` : ''}
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
              {redoMode
                ? doneReviews + 1 < currentTotalItems
                  ? 'Próximo erro'
                  : 'Finalizar revisão de erros'
                : cardIndex + 1 < cards.length
                ? 'Próximo flashcard'
                : 'Próximo card'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
