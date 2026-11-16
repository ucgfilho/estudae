import { useState, useMemo, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { PageHeader, EmptyState, Alert } from '../components/ui/Display';
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

  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const errorNoteMap = useMemo(() => new Map(errorNotes.map((e) => [e.id, e])), [errorNotes]);

  // Sincroniza rigorosamente revisões com o Caderno de Erros e remove revisões futuras duplicadas
  useEffect(() => {
    if (reviews.length === 0 && errorNotes.length === 0) return;
    void reconcileReviewsAndErrorNotes();
  }, [reviews.length, errorNotes]);

  const buckets = useMemo(() => reviewBuckets(reviews, today), [reviews, today]);
  const dueList = useMemo(() => [...buckets.overdue, ...buckets.today], [buckets]);

  const handleComplete = async (review: ReviewTask, stats?: { hits: number; misses: number }) => {
    setActionError(null);
    try {
      await completeReview(review.id, stats);
      if (!stats) setActionSuccess('Revisão marcada como concluída.');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
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
        {dueList.length > 0 ? (
          <FlashcardDeck
            reviews={dueList}
            notes={errorNoteMap}
            disciplines={discMap}
            onComplete={handleComplete}
          />
        ) : (
          <EmptyState
            icon={<CheckCircle className="size-8" />}
            title="Todas as revisões de hoje estão em dia"
            description="Seus ciclos de memória estão em dia."
          />
        )}
      </div>
    </div>
  );
}
