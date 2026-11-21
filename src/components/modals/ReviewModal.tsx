import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert, Badge } from '../ui/Display';
import { Field, Input, Select } from '../ui/Form';
import { useDisciplines, useTopics } from '../../hooks/useData';
import { scheduleTopicReviews, postponeReviewToDate } from '../../services/performance';
import type { ReviewTask } from '../../db/types';
import {
  todayKey,
  formatDate,
  formatMonthYear,
  addDays,
  addMonths,
  diffDays,
  startOfMonth,
  monthGrid,
  isSameMonth,
  WEEKDAY_LABELS,
  type DateKey,
} from '../../lib/dates';
import { cn, errorMessage } from '../../lib/utils';
import { DateInput } from '../ui/DateInput';

interface CreateReviewModalProps {
  open: boolean;
  onClose: () => void;
  defaultDisciplineId?: string;
  defaultTopicId?: string | null;
  onCreated?: (count: number) => void;
}

export function CreateReviewModal({
  open,
  onClose,
  defaultDisciplineId,
  defaultTopicId,
  onCreated,
}: CreateReviewModalProps) {
  const disciplines = useDisciplines();
  const topics = useTopics();

  const [disciplineId, setDisciplineId] = useState(defaultDisciplineId || (disciplines[0]?.id ?? ''));
  const [topicId, setTopicId] = useState(defaultTopicId || '');
  const [title, setTitle] = useState('');
  const [baseDate, setBaseDate] = useState(todayKey());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredTopics = topics.filter(
    (t) => t.disciplineId === disciplineId && t.active && !t.parentTopicId
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!disciplineId) {
      setError('Selecione uma disciplina.');
      return;
    }
    if (!title.trim()) {
      setError('Informe o assunto da revisão.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const count = await scheduleTopicReviews(
        disciplineId,
        topicId || null,
        title.trim(),
        baseDate
      );
      onCreated?.(count);
      onClose();
      setTitle('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Agendar Ciclo de Revisões"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-review-form" loading={loading}>
            Criar Revisões
          </Button>
        </>
      }
    >
      <form id="create-review-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Field label="Disciplina" required>
          <Select
            value={disciplineId}
            onChange={(e) => {
              setDisciplineId(e.target.value);
              setTopicId('');
            }}
            required
          >
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tópico" hint="Opcional">
          <Select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            disabled={!disciplineId || filteredTopics.length === 0}
          >
            <option value="">Geral / Sem tópico</option>
            {filteredTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Assunto / Título da revisão" required>
          <Input
            type="text"
            placeholder="Ex: Revisar conceitos de Scrum e papéis"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>

        <Field label="Data base" hint="A partir de quando calcular os intervalos (1d, 7d, 30d)">
          <DateInput
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
            required
          />
        </Field>
      </form>
    </Dialog>
  );
}

interface PostponeReviewModalProps {
  open: boolean;
  onClose: () => void;
  review: ReviewTask | null;
  onPostponed?: () => void;
}

const PRESETS = [
  { label: '+1 dia', days: 1 },
  { label: '+3 dias', days: 3 },
  { label: '+7 dias (1 sem)', days: 7 },
  { label: '+15 dias', days: 15 },
  { label: '+30 dias (1 mês)', days: 30 },
];

export function PostponeReviewModal({
  open,
  onClose,
  review,
  onPostponed,
}: PostponeReviewModalProps) {
  const today = todayKey();
  const baseDate = review ? (review.dueDate < today ? today : review.dueDate) : today;

  const [selectedDate, setSelectedDate] = useState<DateKey>(() => addDays(baseDate, 3));
  const [viewMonth, setViewMonth] = useState<DateKey>(() => startOfMonth(addDays(baseDate, 3)));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (review && open) {
      const b = review.dueDate < todayKey() ? todayKey() : review.dueDate;
      const initial = addDays(b, 3);
      setSelectedDate(initial);
      setViewMonth(startOfMonth(initial));
      setError(null);
    }
  }, [review, open]);

  const monthDays = useMemo(() => monthGrid(viewMonth), [viewMonth]);

  if (!review) return null;

  const handlePrevMonth = () => {
    setViewMonth((prev) => addMonths(prev, -1));
  };

  const handleNextMonth = () => {
    setViewMonth((prev) => addMonths(prev, 1));
  };

  const handlePresetClick = (daysToAdd: number) => {
    const target = addDays(baseDate, daysToAdd);
    setSelectedDate(target);
    setViewMonth(startOfMonth(target));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedDate < today) {
      setError('A nova data da revisão deve ser hoje ou uma data futura.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await postponeReviewToDate(review.id, selectedDate);
      onPostponed?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const daysPostponed = diffDays(selectedDate, review.dueDate);
  const daysFromToday = diffDays(selectedDate, today);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adiar Revisão"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="postpone-form"
            loading={loading}
            icon={<CalendarIcon className="size-4" />}
          >
            Confirmar Novo Prazo
          </Button>
        </>
      }
    >
      <form id="postpone-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Review Context Header */}
        <div className="rounded-lg bg-surface-muted/40 p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs uppercase font-semibold text-fg-subtle">Tarefa</span>
              <p className="font-semibold text-fg wrap-anywhere">{review.title}</p>
            </div>
            {review.dueDate < today ? (
              <Badge tone="danger" className="shrink-0 text-[11px]">
                Vencida há {diffDays(today, review.dueDate)} dia(s)
              </Badge>
            ) : (
              <Badge tone="neutral" className="shrink-0 text-[11px]">
                Pendente
              </Badge>
            )}
          </div>
          <div className="mt-2 text-xs text-fg-muted flex items-center gap-1.5">
            <Clock className="size-3.5 text-fg-subtle" />
            <span>Prazo atual programado:</span>
            <strong className="text-fg">{formatDate(review.dueDate)}</strong>
          </div>
        </div>

        {/* Quick Presets */}
        <div>
          <label className="text-xs font-semibold uppercase text-fg-subtle block mb-1.5">
            Atalhos rápidos de adiamento
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const target = addDays(baseDate, p.days);
              const isActive = selectedDate === target;
              return (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => handlePresetClick(p.days)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 max-lg:px-3 max-lg:py-2 max-lg:min-h-9 text-xs font-medium transition-all cursor-pointer',
                    isActive
                      ? 'bg-brand text-primary-fg font-semibold shadow-xs'
                      : 'bg-surface hover:bg-surface-muted text-fg '
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Calendar Picker Card */}
        <div className="rounded-xl bg-surface p-3.5 shadow-xs">
          {/* Calendar Month Navigation Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="inline-flex size-7 max-lg:size-9 items-center justify-center rounded-md hover:bg-surface-muted text-fg transition-colors cursor-pointer"
                aria-label="Mês anterior"
                title="Mês anterior"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold capitalize text-fg min-w-[120px] sm:min-w-[130px] text-center">
                {formatMonthYear(viewMonth)}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="inline-flex size-7 max-lg:size-9 items-center justify-center rounded-md hover:bg-surface-muted text-fg transition-colors cursor-pointer"
                aria-label="Próximo mês"
                title="Próximo mês"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setViewMonth(startOfMonth(today))}
              className="text-xs font-medium text-primary hover:underline cursor-pointer flex items-center gap-1 max-lg:px-2 max-lg:py-1.5"
            >
              <RotateCcw className="size-3" /> Mês atual
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="text-[11px] font-semibold text-fg-subtle py-0.5">
                {w}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((dayKey) => {
              const dayNum = parseInt(dayKey.slice(8, 10), 10);
              const isCurrentMonth = isSameMonth(dayKey, viewMonth);
              const isPast = dayKey < today;
              const isToday = dayKey === today;
              const isOriginal = dayKey === review.dueDate;
              const isSelected = dayKey === selectedDate;

              return (
                <button
                  key={dayKey}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelectedDate(dayKey)}
                  className={cn(
                    'relative h-9 w-full rounded-md text-xs transition-all flex flex-col items-center justify-center cursor-pointer',
                    isPast && 'opacity-25 text-fg-subtle cursor-not-allowed hover:bg-transparent',
                    !isPast && !isSelected && isCurrentMonth && 'text-fg hover:bg-surface-muted',
                    !isPast && !isSelected && !isCurrentMonth && 'text-fg-subtle/50 hover:bg-surface-muted/50',
                    isSelected && 'bg-brand text-primary-fg font-bold shadow-xs scale-102 z-10',
                    isOriginal && !isSelected && 'bg-accent-soft text-accent font-semibold',
                  )}
                  title={`${formatDate(dayKey)}${isOriginal ? ' (Data atual)' : ''}${isToday ? ' (Hoje)' : ''}`}
                >
                  <span>{dayNum}</span>
                  {isToday && !isSelected && (
                    <span className="size-1 rounded-full bg-primary absolute bottom-1" />
                  )}
                  {isOriginal && !isSelected && (
                    <span className="text-[8px] leading-none text-accent absolute bottom-0.5">orig</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Callout */}
        <div className="bg-primary-soft/30 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon className="size-4 text-primary shrink-0" />
            <div className="min-w-0">
              <span className="text-fg-muted">Novo prazo selecionado: </span>
              <strong className="text-fg">
                {formatDate(selectedDate, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </strong>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-primary whitespace-nowrap">
            {daysPostponed > 0 ? `+${daysPostponed}d do original` : `${daysFromToday}d a partir de hoje`}
          </span>
        </div>
      </form>
    </Dialog>
  );
}
