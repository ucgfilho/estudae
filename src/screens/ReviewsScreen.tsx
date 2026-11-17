import { useState, useMemo, useEffect } from 'react';
import { PageHeader, Alert } from '../components/ui/Display';
import {
  useDisciplines,
  useReviews,
  useErrorNotes,
  useToday,
} from '../hooks/useData';
import {
  completeReview,
  reconcileReviewsAndErrorNotes,
} from '../services/performance';
import { reviewBuckets } from '../domain/metrics';
import type { ReviewTask } from '../db/types';
import { errorMessage } from '../lib/utils';
import { FlashcardDeck } from '../components/reviews/FlashcardDeck';
import { useSuccessToast } from '../components/ui/Toast';

export function ReviewsScreen() {
  const today = useToday();

  const disciplines = useDisciplines();
  const reviews = useReviews();
  const errorNotes = useErrorNotes();

  const [ready, setReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const errorNoteMap = useMemo(() => new Map(errorNotes.map((e) => [e.id, e])), [errorNotes]);

  // Reconcile on entry before accepting answers. Running it on each note
  // update can race with completion and restore an outdated pending task.
  useEffect(() => {
    let active = true;
    void reconcileReviewsAndErrorNotes()
      .catch(err => { if (active) setActionError(errorMessage(err)); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const buckets = useMemo(() => reviewBuckets(reviews, today), [reviews, today]);
  const dueList = useMemo(() => [...buckets.overdue, ...buckets.today], [buckets]);

  const handleComplete = async (review: ReviewTask, stats?: { hits: number; misses: number }) => {
    setActionError(null);
    try {
      await completeReview(review.id, stats);
      if (!stats) setActionSuccess('Revisão marcada como concluída.');
    } catch (err) {
      setActionError(errorMessage(err));
      throw err;
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Revisões espaçadas"
        description="Revise no intervalo ideal para fixar o conteúdo na memória de longo prazo."
      />

      {actionError && (
        <Alert tone="danger" title="Não foi possível concluir a ação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <div className="space-y-3">
        {ready ? (
          <FlashcardDeck
            key={today}
            reviews={dueList}
            notes={errorNoteMap}
            disciplines={discMap}
            onComplete={handleComplete}
          />
        ) : (
          <p role="status" className="text-sm text-fg-muted">Preparando revisões…</p>
        )}
      </div>
    </div>
  );
}
