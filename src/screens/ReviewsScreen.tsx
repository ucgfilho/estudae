import { useState, useMemo, useEffect } from 'react';
import { PageHeader, Alert, Card, DisciplineDot } from '../components/ui/Display';
import { Button } from '../components/ui/Button';
import {
  useDisciplines,
  useReviews,
  useErrorNotes,
  useToday,
} from '../hooks/useData';
import {
  completeReview,
  reconcileReviewsAndErrorNotes,
  resolveReviewDisplayTitle,
} from '../services/performance';
import { reviewBuckets } from '../domain/metrics';
import type { ReviewTask } from '../db/types';
import { errorMessage } from '../lib/utils';
import { formatDate, toDateKey } from '../lib/dates';
import { FlashcardDeck } from '../components/reviews/FlashcardDeck';
import { useSuccessToast } from '../components/ui/Toast';

const HISTORY_PAGE_SIZE = 10;

export function ReviewsScreen() {
  const today = useToday();

  const disciplines = useDisciplines();
  const reviews = useReviews();
  const errorNotes = useErrorNotes();

  const [ready, setReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
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
  const history = useMemo(() => reviews
    .filter(review => review.status === 'concluida')
    .map(review => ({
      review,
      completedAt: review.completedAt ? Date.parse(review.completedAt) : NaN,
    }))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), [reviews]);

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

      <Card title="Histórico de revisões">
        {history.length === 0 ? (
          <p className="text-sm text-fg-muted">As revisões concluídas aparecerão aqui.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {history.slice(0, historyLimit).map(({ review, completedAt }) => {
                const discipline = discMap.get(review.disciplineId);
                const note = review.errorNoteId ? errorNoteMap.get(review.errorNoteId) : undefined;
                const stats = review.flashcardStats;

                return (
                  <li key={review.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-lg bg-surface-muted px-3 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-medium text-fg wrap-anywhere">{resolveReviewDisplayTitle(review, note)}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                        {discipline && (
                          <span className="inline-flex min-w-0 items-center gap-1.5 wrap-anywhere">
                            <DisciplineDot color={discipline.color} />
                            {discipline.name}
                          </span>
                        )}
                        <span>Intervalo de {review.intervalDays} {review.intervalDays === 1 ? 'dia' : 'dias'}</span>
                        {stats && <span>{stats.hits} {stats.hits === 1 ? 'acerto' : 'acertos'} · {stats.misses} {stats.misses === 1 ? 'erro' : 'erros'}</span>}
                      </p>
                    </div>
                    {Number.isFinite(completedAt) && (
                      <time dateTime={toDateKey(completedAt)} className="text-xs text-fg-muted tabular-nums">
                        {formatDate(toDateKey(completedAt))}
                      </time>
                    )}
                  </li>
                );
              })}
            </ul>
            {history.length > historyLimit && (
              <Button size="sm" className="mt-4" onClick={() => setHistoryLimit(limit => limit + HISTORY_PAGE_SIZE)}>
                Mostrar mais revisões
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
