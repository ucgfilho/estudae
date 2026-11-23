import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Sparkles, Flame, Layers, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '../ui/Button';
import { FormattedText } from '../ui/RichText';
import { Badge, DisciplineDot, EmptyState } from '../ui/Display';
import { cn } from '../../lib/utils';
import { todayKey } from '../../lib/dates';
import { useCelebrationsEnabled } from '../../hooks/useCelebrationPrefs';
import { Confetti } from '../motivation/Confetti';
import { getActiveContestScopeId, getAuthSession } from '../../services/auth';
import { db } from '../../db/db';
import { updateSettings } from '../../services/settings';
import { SETTINGS_ID } from '../../db/types';
import { resolveReviewDisplayTitle } from '../../services/performance';
import type { Discipline, ErrorFlashcard, ErrorNote, ReviewTask } from '../../db/types';

interface Props {
  reviews: ReviewTask[];
  notes: Map<string, ErrorNote>;
  disciplines: Map<string, Discipline>;
  onComplete: (review: ReviewTask, stats?: { hits: number; misses: number }) => Promise<void>;
}

interface MissedFlashcard {
  reviewId: string;
  card: ErrorFlashcard;
  disciplineId: string;
  displayTitle: string;
  intervalDays: number;
}

interface Progress {
  version: 3;
  reviewIds: string[];
  activeReview: ReviewTask | null;
  completedReviewIds: string[];
  cardIndex: number;
  reviewStats: { hits: number; misses: number };
  streak: number;
  totalHits: number;
  totalCardsAnswered: number;
  picked: 'certo' | 'errado' | null;
  missedFlashcards: MissedFlashcard[];
  redoMode: boolean;
  redoQueue: MissedFlashcard[];
  redoDone: number;
  sessionCompleted: boolean;
}

const storageKey = () => `flashcard-deck-progress-${todayKey()}:${getAuthSession()?.user.id ?? 'local'}:${getActiveContestScopeId()}`;
function initialProgress(reviews: ReviewTask[]): Progress {
  return {
    version: 3, reviewIds: reviews.map(r => r.id), activeReview: null,
    completedReviewIds: [], cardIndex: 0,
    reviewStats: { hits: 0, misses: 0 }, streak: 0, totalHits: 0,
    totalCardsAnswered: 0, picked: null, missedFlashcards: [],
    redoMode: false, redoQueue: [], redoDone: 0, sessionCompleted: false,
  };
}

function firstPassFinished(state: Progress): boolean {
  return !state.activeReview && state.reviewIds.length > 0 &&
    state.reviewIds.every(id => state.completedReviewIds.includes(id));
}

function loadProgress(reviews: ReviewTask[], notes: ReadonlyMap<string, ErrorNote>): Progress {
  const initial = initialProgress(reviews);
  try {
    const remoteDraft = db.settings.getSync(SETTINGS_ID)?.flashcardDraft;
    const saved = JSON.parse(remoteDraft?.date === todayKey()
      ? remoteDraft.progress
      : localStorage.getItem(storageKey()) ?? 'null');
    if ((saved?.version === 2 || saved?.version === 3) &&
        Array.isArray(saved.completedReviewIds) &&
        Array.isArray(saved.missedFlashcards) && Array.isArray(saved.redoQueue)) {
      // v2 did not record session membership. Preserve active cards and retry
      // summaries, but do not carry its counters into a fresh pending queue.
      if (saved.version === 2 && !saved.activeReview && reviews.length > 0) return initial;
      const restored: Progress = {
        ...initial, ...saved, version: 3,
        reviewIds: saved.version === 3 && Array.isArray(saved.reviewIds)
          ? saved.reviewIds : [...new Set([...saved.completedReviewIds, ...initial.reviewIds])],
      };
      if (remoteDraft?.date === todayKey()) {
        const cards = new Map<string, ErrorFlashcard>();
        for (const note of notes.values()) {
          for (const card of note.flashcards ?? []) cards.set(card.id, card);
        }
        const restoreCards = (items: MissedFlashcard[]) => items.flatMap((item) => {
          const card = cards.get(item.card.id);
          return card ? [{ ...item, card }] : [];
        });
        restored.missedFlashcards = restoreCards(restored.missedFlashcards);
        restored.redoQueue = restoreCards(restored.redoQueue);
      }
      // Pending tasks after a finished round belong to a new session, including
      // a task explicitly reopened with the same ID.
      if (firstPassFinished(restored) && reviews.length > 0) return initial;
      return restored;
    }
  } catch { /* Storage is optional. */ }
  return initial;
}

/** Review tasks and retry attempts have separate progress; retries never reschedule tasks. */
export function FlashcardDeck({ reviews, notes, disciplines, onComplete }: Props) {
  const [state, setState] = useState(() => loadProgress(reviews, notes));
  const lastSavedState = useRef(state);
  const [animating, setAnimating] = useState(false);
  const busy = useRef(false);
  const enabled = useCelebrationsEnabled();
  const { cardIndex, reviewStats, streak, totalHits,
    totalCardsAnswered, picked, missedFlashcards, redoQueue,
    redoDone, sessionCompleted } = state;
  // Start a fresh round if new tasks arrive while the finished deck remains
  // mounted. Ignore stale props for tasks just completed by this component.
  if (!busy.current && firstPassFinished(state) &&
      reviews.some(r => !state.completedReviewIds.includes(r.id))) {
    setState(initialProgress(reviews.filter(r => !state.completedReviewIds.includes(r.id))));
  }
  const completedReviewIds = state.completedReviewIds;
  const pending = reviews.filter(r => !completedReviewIds.includes(r.id));
  const review = state.activeReview ?? pending[0];
  const redoMode = state.redoMode && !review;
  const current = redoMode ? redoQueue[0] : review;
  const note = !redoMode && review?.errorNoteId ? notes.get(review.errorNoteId) : undefined;
  const cards = redoMode ? (current ? [(current as MissedFlashcard).card] : []) : note?.flashcards ?? [];
  const card = cards[cardIndex];
  const d = current ? disciplines.get(current.disciplineId) : undefined;
  const displayTitle = redoMode ? (current as MissedFlashcard | undefined)?.displayTitle ?? ''
    : review ? resolveReviewDisplayTitle(review, note) : '';
  const doneReviews = redoMode ? redoDone : completedReviewIds.length;
  const currentTotalItems = redoMode ? redoDone + redoQueue.length : completedReviewIds.length + pending.length + Number(!!review && !pending.some(r => r.id === review.id));
  const progress = currentTotalItems ? Math.round(doneReviews / currentTotalItems * 100) : 0;
  const correct = !!picked && picked === card?.answer;

  useEffect(() => {
    if (state === lastSavedState.current) return;
    lastSavedState.current = state;
    const progress = JSON.stringify(state);
    try { localStorage.setItem(storageKey(), progress); }
    catch { /* Continue reviewing when browser storage is unavailable. */ }
    if (getAuthSession()) {
      const cardReferences = (items: MissedFlashcard[]) => items.map((item) => ({
        ...item, card: { id: item.card.id },
      }));
      const remoteProgress = JSON.stringify({
        ...state,
        missedFlashcards: cardReferences(state.missedFlashcards),
        redoQueue: cardReferences(state.redoQueue),
      });
      void updateSettings({ flashcardDraft: { date: todayKey(), progress: remoteProgress } })
        .catch((error: unknown) => console.error('Falha ao sincronizar o progresso dos flashcards:', error));
    }
  }, [state]);

  const answer = (choice: 'certo' | 'errado') => {
    if (picked || !card || busy.current) return;
    const isCorrect = choice === card.answer;
    setState(s => ({
      ...s, reviewIds: [...new Set([...s.reviewIds, ...reviews.map(r => r.id)])], activeReview: redoMode ? s.activeReview : review, picked: choice, totalCardsAnswered: s.totalCardsAnswered + 1,
      totalHits: s.totalHits + Number(isCorrect), streak: isCorrect ? s.streak + 1 : 0,
      reviewStats: { hits: s.reviewStats.hits + Number(isCorrect), misses: s.reviewStats.misses + Number(!isCorrect) },
      missedFlashcards: !isCorrect && !redoMode ? [...s.missedFlashcards, {
        reviewId: review.id, card, disciplineId: review.disciplineId,
        displayTitle, intervalDays: review.intervalDays,
      }] : s.missedFlashcards,
    }));
  };

  const advance = async () => {
    if (busy.current || (card && !picked)) return;
    busy.current = true;
    setAnimating(true);
    try {
      if (!redoMode && cardIndex + 1 >= cards.length) {
        setState(s => ({ ...s, activeReview: review, reviewIds: [...new Set([...s.reviewIds, ...reviews.map(r => r.id)])] }));
        await onComplete(review, card ? reviewStats : undefined);
      }
      setState(s => {
        if (redoMode) {
          const [item, ...rest] = s.redoQueue;
          return { ...s, picked: null, reviewStats: { hits: 0, misses: 0 },
            // A wrong answer returns to the end of the queue until mastered.
            redoQueue: correct ? rest : [...rest, item], redoDone: s.redoDone + Number(correct) };
        }
        if (cardIndex + 1 < cards.length) return { ...s, cardIndex: s.cardIndex + 1, picked: null };
        return { ...s, activeReview: null, redoMode: false, completedReviewIds: [...new Set([...s.completedReviewIds, review.id])],
          cardIndex: 0, picked: null, reviewStats: { hits: 0, misses: 0 }, sessionCompleted: false };
      });
    } catch {
      // Keep the answer for retry, including when local persistence succeeded
      // but the server has not confirmed the review yet. The parent shows why.
    } finally {
      busy.current = false;
      setAnimating(false);
    }
  };

  if (animating) return <div role="status" className="p-10 text-center text-fg-muted">Salvando revisão…</div>;

  if (!current) {
    if (!redoMode && missedFlashcards.length > 0 && !sessionCompleted) {
      return (
        <div className="mx-auto max-w-md space-y-4 rounded-2xl bg-surface p-6">
          <Sparkles className="mx-auto size-8 text-primary" aria-hidden />
          <h3 className="text-center text-xl font-bold text-fg">Primeira rodada concluída!</h3>
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-muted p-4 text-center">
            <div><div className="text-3xl font-bold text-success">{totalHits}</div><div className="text-sm text-fg-muted">Acertos</div></div>
            <div><div className="text-3xl font-bold text-danger">{totalCardsAnswered - totalHits}</div><div className="text-sm text-fg-muted">Erros</div></div>
          </div>
          <p className="text-center text-sm text-fg-muted">Você errou {missedFlashcards.length} flashcard{missedFlashcards.length !== 1 ? 's' : ''}. Deseja revisar apenas os que errou até acertar todos?</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => setState(s => ({ ...s, redoMode: true, redoQueue: s.missedFlashcards, redoDone: 0, cardIndex: 0, picked: null, reviewStats: { hits: 0, misses: 0 } }))}>
              <RotateCcw className="mr-2 size-4" />Refazer os que errei ({missedFlashcards.length})
            </Button>
            <Button variant="secondary" onClick={() => setState(s => ({ ...s, sessionCompleted: true }))}>Finalizar mesmo assim</Button>
          </div>
        </div>
      );
    }
    const mastered = totalCardsAnswered > 0 && (redoMode || missedFlashcards.length === 0);
    if (mastered) return (
      <div role="status" className={cn('mx-auto max-w-3xl space-y-4 rounded-2xl bg-success-soft/20 p-10 text-center', enabled && 'animate-celebrate-in')}>
        {enabled && <Confetti burst={1} intensity="big" />}
        <div className={cn('mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success', enabled && 'animate-pop')}><Trophy className="size-12" aria-hidden /></div>
        <Badge tone="success">Conquista desbloqueada · Meta de revisão</Badge>
        <h3 className="text-2xl font-bold text-fg">Revisão do dia concluída!</h3>
        <p className="text-fg-muted">Você acertou todos os flashcards em revisão. Ótimo trabalho!</p>
        <p className="text-sm font-semibold text-success">{completedReviewIds.length} revisões concluídas · Todos os desafios superados</p>
      </div>
    );
    return <EmptyState icon={<CheckCircle2 className="size-8" />} title={sessionCompleted ? 'Sessão concluída!' : 'Todas as revisões de hoje estão em dia'} description={sessionCompleted ? 'Suas revisões foram salvas. Continue praticando os erros na próxima sessão.' : 'As próximas revisões aparecerão aqui na data agendada.'} />;
  }

  // Mantém a mesma face durante a resposta e reinicia a virada na próxima tentativa.
  const attemptIndex = totalCardsAnswered - Number(!!picked);
  const face = 'absolute inset-0 flex flex-col rounded-2xl p-6 sm:p-8 [backface-visibility:hidden]';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-fg">
            {redoMode
              ? `Revisão de erros ${doneReviews + 1} de ${currentTotalItems}`
              : `Revisão ${Math.min(doneReviews + 1, currentTotalItems)} de ${currentTotalItems}`}
            {!redoMode && cards.length > 1 ? ` · Flashcard ${cardIndex + 1} de ${cards.length}` : ''}
          </span>
          {card?.generatedByAi && <Badge tone="info">Gerado por IA</Badge>}
          {streak > 0 && (
            <span className="ml-auto flex items-center gap-1 font-semibold text-warning">
              <Flame className="size-4" aria-hidden /> {streak} em sequência
            </span>
          )}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label={redoMode ? "Erros superados nesta rodada" : "Revisões concluídas nesta sessão"}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-emphasized" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div key={`${card?.id ?? review?.id}:${attemptIndex}`} className="animate-fade-in [perspective:1400px]">
        <div
          className="relative h-[26rem] transition-transform duration-400 ease-emphasized [transform-style:preserve-3d]"
          style={{ transform: picked ? 'rotateY(180deg)' : 'none' }}
        >
          <div inert={!!picked} className={cn(face, 'bg-surface')}>
            <div className="flex flex-wrap items-center gap-2">
              {d && <DisciplineDot color={d.color} />}
              <span className="text-sm font-semibold text-fg">{d?.name}</span>
              <Badge tone="neutral">Ciclo de {current.intervalDays}d</Badge>
              <span className="text-xs text-fg-muted wrap-anywhere">{displayTitle}</span>
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
                    <Button size="sm" variant="secondary" disabled={animating} onClick={() => void advance()}>
                      Concluir sem flashcard
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                disabled={!card || animating}
                onClick={() => answer('certo')}
                icon={<CheckCircle2 className="size-5" />}
              >
                Certo
              </Button>
              <Button
                variant="secondary"
                disabled={!card || animating}
                onClick={() => answer('errado')}
                icon={<XCircle className="size-5" />}
              >
                Errado
              </Button>
            </div>
          </div>

          {picked && <div
            className={cn(
              face,
              '[transform:rotateY(180deg)]',
              'text-fg shadow-xl',
              correct ? 'bg-success-soft' : 'bg-danger-soft',
            )}
            aria-live="polite"
          >
            <div className={cn("flex items-center gap-2 text-xl font-bold", correct ? "text-success" : "text-danger")}>
              {correct ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
              {correct ? 'Você acertou!' : 'Você errou'}
            </div>
            <div className="my-4 flex-1 space-y-3 overflow-y-auto">
              <p className="text-base">
                <strong>Gabarito:</strong> {card?.answer === 'certo' ? 'Certo' : 'Errado'}
              </p>
              <div className="text-sm text-fg-muted">
                <strong>Definição correta:</strong>
                <FormattedText text={card?.explanation ?? ''} className="mt-1 text-fg" />
              </div>
            </div>
            <Button variant="secondary" disabled={!picked || animating} onClick={() => void advance()}>
              {redoMode
                ? doneReviews + 1 < currentTotalItems
                  ? 'Próximo erro'
                  : 'Finalizar revisão de erros'
                : cardIndex + 1 < cards.length
                ? 'Próximo flashcard'
                : pending.every(r => r.id === review.id)
                  ? 'Finalizar'
                  : 'Próximo card'}
            </Button>
          </div>}
        </div>
      </div>
    </div>
  );
}
