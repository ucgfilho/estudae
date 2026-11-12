import { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  CheckCircle,
  Clock,
  CalendarDays,
  Trash2,
  Check,
  Undo2,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { PageHeader, Segmented, Badge, EmptyState, DisciplineDot, Alert } from '../components/ui/Display';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { CreateReviewModal, PostponeReviewModal } from '../components/modals/ReviewModal';
import {
  useDisciplines,
  useTopics,
  useReviews,
  useErrorNotes,
  useToday,
} from '../hooks/useData';
import {
  completeReview,
  reopenReview,
  deleteReview,
  resolveReviewDisplayTitle,
} from '../services/performance';
import { db } from '../db/db';
import { reviewBuckets } from '../domain/metrics';
import { formatDate } from '../lib/dates';
import type { ReviewTask } from '../db/types';
import { errorMessage, cn } from '../lib/utils';
import { FormattedText } from '../components/ui/RichText';
import { useSuccessToast } from '../components/ui/Toast';

type ReviewTab = 'overdue' | 'today' | 'upcoming' | 'completed';

export function ReviewsScreen() {
  const today = useToday();

  const disciplines = useDisciplines();
  const topics = useTopics();
  const reviews = useReviews();

  const [activeTab, setActiveTab] = useState<ReviewTab>('today');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [postponeModalOpen, setPostponeModalOpen] = useState(false);
  const [reviewToPostpone, setReviewToPostpone] = useState<ReviewTask | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState<ReviewTask | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();


  const errorNotes = useErrorNotes();
  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const errorNoteMap = useMemo(() => new Map(errorNotes.map((e) => [e.id, e])), [errorNotes]);

  // Sincroniza automaticamente revisões antigas cujo caderno de erros foi atualizado com o número da questão
  useEffect(() => {
    if (reviews.length === 0 || errorNoteMap.size === 0) return;
    const toHeal: ReviewTask[] = [];
    for (const r of reviews) {
      if (!r.errorNoteId) continue;
      const linked = errorNoteMap.get(r.errorNoteId);
      if (!linked) continue;
      const expectedTitle = resolveReviewDisplayTitle(r, linked);
      if (r.title !== expectedTitle) {
        toHeal.push({ ...r, title: expectedTitle });
      }
    }
    if (toHeal.length > 0) {
      void db.reviews.bulkPut(toHeal);
    }
  }, [reviews, errorNoteMap]);

  const buckets = useMemo(() => reviewBuckets(reviews, today), [reviews, today]);
  const completedReviews = useMemo(() => {
    return reviews
      .filter((r) => r.status === 'concluida')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  }, [reviews]);

  const currentList = useMemo(() => {
    if (activeTab === 'overdue') return buckets.overdue;
    if (activeTab === 'today') return buckets.today;
    if (activeTab === 'upcoming') return buckets.upcoming;
    return completedReviews;
  }, [activeTab, buckets, completedReviews]);

  const handleComplete = async (review: ReviewTask) => {
    setActionError(null);
    try {
      await completeReview(review.id);
      setActionSuccess('Revisão marcada como concluída.');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleReopen = async (review: ReviewTask) => {
    setActionError(null);
    try {
      await reopenReview(review.id);
      setActionSuccess('Revisão reaberta .');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!reviewToDelete) return;
    setActionError(null);
    try {
      await deleteReview(reviewToDelete.id);
      setDeleteConfirmOpen(false);
      setReviewToDelete(null);
      setActionSuccess('Revisão excluída .');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const openPostpone = (review: ReviewTask) => {
    setReviewToPostpone(review);
    setPostponeModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisões Espaçadas"
        description="Fixação de conteúdo a longo prazo através de repetições espaçadas programadas."
        actions={
          <Button
            variant={currentList.some((r) => r.status === 'pendente') ? 'secondary' : 'primary'}
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => setCreateModalOpen(true)}
          >
            Agendar Revisão
          </Button>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Tabs bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <Segmented
          label="Categoria de revisões"
          value={activeTab}
          onChange={(v) => setActiveTab(v)}
          options={[
            { value: 'overdue', label: `Atrasadas (${buckets.overdue.length})` },
            { value: 'today', label: `Para Hoje (${buckets.today.length})` },
            { value: 'upcoming', label: `Próximas (${buckets.upcoming.length})` },
            { value: 'completed', label: `Concluídas (${completedReviews.length})` },
          ]}
        />
      </div>

      {/* List Card */}
      <div className="space-y-3">
        {currentList.length > 0 ? (
          currentList.map((review) => {
            const d = discMap.get(review.disciplineId);
            const t = review.topicId ? topicMap.get(review.topicId) : null;
            const linkedErrorNote = review.errorNoteId ? errorNoteMap.get(review.errorNoteId) : undefined;
            const displayTitle = resolveReviewDisplayTitle(review, linkedErrorNote);
            const isOverdue = review.status === 'pendente' && review.dueDate < today;
            const isToday = review.dueDate === today;

            return (
              <div
                key={review.id}
                className={cn(
                  'flex flex-col sm:flex-row sm:items-start justify-between gap-4 rounded-xl border p-4 bg-surface transition-all',
                  isOverdue
                    ? 'border-danger/30 bg-danger-soft/10'
                    : isToday
                    ? 'border-warning/40 bg-warning-soft/10'
                    : 'border-border'
                )}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {d && <DisciplineDot color={d.color} />}
                    <span className="font-semibold text-fg">{d?.name}</span>
                    {t && <Badge tone="neutral">{t.title}</Badge>}
                    <Badge tone="neutral" className="text-xs">
                      Ciclo de {review.intervalDays}d
                    </Badge>
                    {review.errorNoteId && (
                      <Badge tone="warning" className="text-xs">
                        Vinculada a erro
                      </Badge>
                    )}
                  </div>

                  <p className="font-medium text-sm text-fg">{displayTitle}</p>

                  <div className="text-xs text-fg-subtle flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" />
                      Prevista para: <strong>{formatDate(review.dueDate)}</strong>
                    </span>
                    {review.completedAt && (
                      <span className="text-success font-medium">
                        Concluída em {formatDate(review.completedAt.slice(0, 10))}
                      </span>
                    )}
                  </div>

                  {linkedErrorNote && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-warning hover:underline font-medium select-none">
                        Ver diagnóstico do erro vinculado
                      </summary>
                      <div className="mt-1.5 p-3 rounded-lg bg-surface-muted/60 border border-border text-xs text-fg space-y-1.5">
                        <div>
                          <span className="text-fg-subtle font-semibold">Fonte/Questão:</span>{' '}
                          {linkedErrorNote.sourceReference || '—'}
                        </div>
                        <div>
                          <span className="text-fg-subtle font-semibold">Diagnóstico:</span>
                          <FormattedText text={linkedErrorNote.explanation ?? ''} className="mt-1" />
                        </div>
                      </div>
                    </details>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                  {review.status === 'pendente' ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Check className="size-4" />}
                        onClick={() => handleComplete(review)}
                      >
                        Concluir
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Clock className="size-3.5" />}
                        onClick={() => openPostpone(review)}
                      >
                        Adiar
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Undo2 className="size-3.5" />}
                      onClick={() => handleReopen(review)}
                    >
                      Reabrir
                    </Button>
                  )}

                  <IconButton
                    label="Excluir revisão"
                    variant="secondary"
                    size="sm"
                    icon={<Trash2 className="size-3.5" />}
                    className="text-fg-muted hover:text-danger hover:border-danger/40 hover:bg-danger-soft/20"
                    onClick={() => {
                      setReviewToDelete(review);
                      setDeleteConfirmOpen(true);
                    }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={<CheckCircle className="size-8" />}
            title={
              activeTab === 'overdue'
                ? 'Nenhuma revisão em atraso'
                : activeTab === 'today'
                ? 'Todas as revisões de hoje estão em dia'
                : activeTab === 'upcoming'
                ? 'Nenhuma revisão futura agendada'
                : 'Nenhuma revisão concluída ainda'
            }
            description={
              activeTab === 'today'
                ? 'Seus ciclos de memória estão em dia.'
                : 'Cadastre tarefas de repetição espaçada para reter os tópicos estudados.'
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => setCreateModalOpen(true)}
              >
                Agendar Novo Ciclo
              </Button>
            }
          />
        )}
      </div>

      {/* Modals */}
      <CreateReviewModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(cnt) => setActionSuccess(`${cnt} tarefa(s) de revisão agendada(s) .`)}
      />

      <PostponeReviewModal
        open={postponeModalOpen}
        onClose={() => setPostponeModalOpen(false)}
        review={reviewToPostpone}
        onPostponed={() => setActionSuccess('Revisão adiada .')}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir Tarefa de Revisão"
        message="Tem certeza que deseja excluir esta revisão programada?"
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}
