import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  Check,
  RotateCcw,
  Calendar as CalendarIcon,
  Trash2,
  Edit2,
  CalendarDays,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader, Segmented, Badge, DisciplineDot, Alert } from '../components/ui/Display';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SessionModal } from '../components/modals/SessionModal';
import { RescheduleModal } from '../components/modals/RescheduleModal';
import {
  useDisciplines,
  useTopics,
  useSessions,
  useSettings,
  useToday,
} from '../hooks/useData';
import {
  todayKey,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  monthGrid,
  formatDate,
  formatMonthYear,
  formatShortDate,
  formatWeekdayShort,
  WEEKDAY_LABELS,
  type DateKey,
} from '../lib/dates';
import { formatMinutes } from '../lib/format';
import { deleteSession, setSessionStatus } from '../services/sessions';
import { startPlannedTimer } from '../services/timer';
import { studiedSecondsByDate } from '../domain/metrics';
import type { StudySession, SessionStatus } from '../db/types';
import { cn, errorMessage } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';

type CalendarView = 'monthly' | 'weekly' | 'daily';

export function CalendarScreen() {
  const navigate = useNavigate();
  const today = useToday();

  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const settings = useSettings();

  const [view, setView] = useState<CalendarView>('monthly');
  const [currentDate, setCurrentDate] = useState<DateKey>(todayKey());

  // Modals state
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<StudySession | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<DateKey>(todayKey());

  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [sessionToReschedule, setSessionToReschedule] = useState<StudySession | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<StudySession | null>(null);

  const [selectedSessionDetail, setSelectedSessionDetail] = useState<StudySession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();


  const dailyGoal = settings?.dailyGoalMinutes ?? 120;
  const examDate = settings?.examDate ?? null;

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const secondsByDate = useMemo(() => studiedSecondsByDate(sessions), [sessions]);

  // Navigation handlers
  const handlePrev = () => {
    if (view === 'monthly') setCurrentDate(addMonths(currentDate, -1));
    else if (view === 'weekly') setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const handleNext = () => {
    if (view === 'monthly') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'weekly') setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(today);
  };

  // Days list according to view
  const visibleDays: DateKey[] = useMemo(() => {
    if (view === 'monthly') return monthGrid(currentDate);
    if (view === 'weekly') {
      const start = startOfWeek(currentDate);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return [currentDate];
  }, [view, currentDate]);

  // Period label
  const periodLabel = useMemo(() => {
    if (view === 'monthly') return formatMonthYear(currentDate);
    if (view === 'weekly') {
      const s = startOfWeek(currentDate);
      const e = endOfWeek(currentDate);
      return `${formatShortDate(s)} a ${formatShortDate(e)}`;
    }
    return formatDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [view, currentDate]);

  // Sessions grouped by date
  const sessionsByDate = useMemo(() => {
    const map = new Map<DateKey, StudySession[]>();
    for (const s of sessions) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions]);

  const handleStartTimer = async (session: StudySession) => {
    setActionError(null);
    try {
      await startPlannedTimer(session.id);
      navigate('/estudar-agora');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleStatusChange = async (session: StudySession, status: SessionStatus) => {
    setActionError(null);
    try {
      await setSessionStatus(session.id, status);
      if (selectedSessionDetail?.id === session.id) {
        setSelectedSessionDetail((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!sessionToDelete) return;
    setActionError(null);
    try {
      await deleteSession(sessionToDelete.id);
      if (selectedSessionDetail?.id === sessionToDelete.id) {
        setSelectedSessionDetail(null);
      }
      setDeleteConfirmOpen(false);
      setSessionToDelete(null);
      setActionSuccess('Sessão excluída com sucesso!');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const openNewSession = (date: DateKey) => {
    setModalDefaultDate(date);
    setSessionToEdit(null);
    setSessionModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendário de Estudos"
        description="Planeje, acompanhe e execute suas sessões diárias e semanais."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Visualização do calendário"
              value={view}
              onChange={(v) => setView(v)}
              options={[
                { value: 'monthly', label: 'Mensal' },
                { value: 'weekly', label: 'Semanal' },
                { value: 'daily', label: 'Diária' },
              ]}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => openNewSession(currentDate)}
            >
              Nova Sessão
            </Button>
          </div>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center gap-2">
          <IconButton
            label="Período anterior"
            icon={<ChevronLeft className="size-4" />}
            onClick={handlePrev}
            size="sm"
          />
          <Button variant="secondary" size="sm" onClick={handleToday}>
            Hoje
          </Button>
          <IconButton
            label="Próximo período"
            icon={<ChevronRight className="size-4" />}
            onClick={handleNext}
            size="sm"
          />
          <h2 className="ml-2 text-base font-semibold capitalize text-fg">{periodLabel}</h2>
        </div>

        {examDate && (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <CalendarDays className="size-4 text-primary" />
            <span>Data da prova: <strong className="text-fg">{formatDate(examDate)}</strong></span>
          </div>
        )}
      </div>

      {/* Main Calendar Views */}
      {view === 'monthly' && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border bg-surface-muted/50 text-center text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-2.5">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border">
            {visibleDays.map((dayKey) => {
              const daySessions = sessionsByDate.get(dayKey) ?? [];
              const studiedSec = secondsByDate.get(dayKey) ?? 0;
              const studiedMin = Math.round(studiedSec / 60);
              const isToday = dayKey === today;
              const isCurMonth = dayKey.slice(0, 7) === currentDate.slice(0, 7);
              const isExamDay = dayKey === examDate;

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'min-h-[105px] p-1.5 transition-colors flex flex-col justify-between group',
                    !isCurMonth && 'bg-surface-muted/20 text-fg-subtle opacity-70',
                    isToday && 'bg-primary-soft/30'
                  )}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full font-medium',
                        isToday && 'bg-primary text-primary-fg font-bold',
                        isExamDay && !isToday && 'bg-danger text-white'
                      )}
                      title={isExamDay ? 'Dia da Prova!' : undefined}
                    >
                      {dayKey.slice(8)}
                    </span>

                    {studiedMin > 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-semibold tabular-nums px-1 rounded',
                          studiedMin >= dailyGoal ? 'text-success bg-success-soft' : 'text-fg-subtle'
                        )}
                        title={`Estudado: ${formatMinutes(studiedMin)} / Meta: ${formatMinutes(dailyGoal)}`}
                      >
                        {formatMinutes(studiedMin)}
                      </span>
                    )}

                    <IconButton
                      label={`Adicionar sessão em ${formatDate(dayKey)}`}
                      icon={<Plus className="size-3" />}
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity !size-5"
                      onClick={() => openNewSession(dayKey)}
                    />
                  </div>

                  {/* Day session chips */}
                  <div className="space-y-1 overflow-y-auto max-h-24 pr-0.5">
                    {daySessions.slice(0, 3).map((s) => {
                      const d = discMap.get(s.disciplineId);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedSessionDetail(s)}
                          className={cn(
                            'w-full text-left rounded px-1.5 py-0.5 text-[11px] truncate block transition-all',
                            s.status === 'concluida'
                              ? 'bg-success-soft text-success line-through opacity-80'
                              : s.status === 'perdida'
                              ? 'bg-danger-soft text-danger'
                              : 'bg-surface-muted hover:bg-surface-muted/80 text-fg'
                          )}
                        >
                          <span className="font-semibold mr-1">{s.plannedMinutes}m</span>
                          <span>{d?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão')}</span>
                        </button>
                      );
                    })}
                    {daySessions.length > 3 && (
                      <div className="text-[10px] text-fg-subtle text-center">
                        +{daySessions.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'weekly' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {visibleDays.map((dayKey) => {
            const daySessions = sessionsByDate.get(dayKey) ?? [];
            const studiedSec = secondsByDate.get(dayKey) ?? 0;
            const studiedMin = Math.round(studiedSec / 60);
            const isToday = dayKey === today;

            return (
              <Card
                key={dayKey}
                className={cn('flex flex-col h-full', isToday && 'border-primary ring-1 ring-primary/30')}
                bodyClassName="flex-1 p-2 space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <div>
                      <div className="text-xs font-semibold uppercase text-fg-subtle">
                        {formatWeekdayShort(dayKey)}
                      </div>
                      <div className={cn('text-sm font-bold', isToday && 'text-primary')}>
                        {formatShortDate(dayKey)}
                      </div>
                    </div>
                    <IconButton
                      label="Adicionar sessão"
                      icon={<Plus className="size-3.5" />}
                      size="sm"
                      onClick={() => openNewSession(dayKey)}
                    />
                  </div>

                  <div className="pt-2 text-[11px] text-fg-muted flex items-center justify-between">
                    <span>Estudado:</span>
                    <strong className={cn(studiedMin >= dailyGoal ? 'text-success' : 'text-fg')}>
                      {formatMinutes(studiedMin)}
                    </strong>
                  </div>

                  {/* Sessions in day */}
                  <div className="mt-2 space-y-1.5">
                    {daySessions.map((s) => {
                      const d = discMap.get(s.disciplineId);
                      return (
                        <div
                          key={s.id}
                          onClick={() => setSelectedSessionDetail(s)}
                          className={cn(
                            'rounded-lg border p-2 text-xs cursor-pointer transition-all hover:shadow-xs',
                            s.status === 'concluida'
                              ? 'border-success/30 bg-success-soft/30'
                              : s.status === 'perdida'
                              ? 'border-danger/30 bg-danger-soft/30'
                              : 'border-border bg-surface'
                          )}
                        >
                          <div className="flex items-center justify-between font-medium">
                            <span className="flex items-center gap-1.5 truncate">
                              {d ? (
                                <DisciplineDot color={d.color} />
                              ) : s.disciplineId === 'simulado' ? (
                                <DisciplineDot color="#A6193C" />
                              ) : null}
                              <span>{d?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão')}</span>
                            </span>
                            <span className="font-semibold text-fg-muted shrink-0">{s.plannedMinutes}m</span>
                          </div>
                          {s.objective && (
                            <p className="mt-1 text-[11px] text-fg-muted line-clamp-2">{s.objective}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {daySessions.length === 0 && (
                  <p className="py-6 text-center text-xs text-fg-subtle">Nenhuma sessão</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {view === 'daily' && (
        <Card
          title={`Sessões para ${formatDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
          description={`Meta diária de estudo: ${formatMinutes(dailyGoal)} | Estudado hoje: ${formatMinutes(Math.round((secondsByDate.get(currentDate) ?? 0) / 60))}`}
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => openNewSession(currentDate)}
            >
              Adicionar Sessão
            </Button>
          }
        >
          {sessionsByDate.get(currentDate)?.length ? (
            <div className="space-y-3">
              {sessionsByDate.get(currentDate)!.map((s) => {
                const d = discMap.get(s.disciplineId);
                const t = s.topicId ? topicMap.get(s.topicId) : null;
                return (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border p-4 bg-surface"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {d ? (
                          <DisciplineDot color={d.color} />
                        ) : s.disciplineId === 'simulado' ? (
                          <DisciplineDot color="#A6193C" />
                        ) : null}
                        <span className="font-semibold text-fg">
                          {d?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão')}
                        </span>
                        {t && <Badge tone="neutral">{t.title}</Badge>}
                        <Badge
                          tone={
                            s.status === 'concluida'
                              ? 'success'
                              : s.status === 'perdida'
                              ? 'danger'
                              : 'primary'
                          }
                        >
                          {s.status === 'concluida'
                            ? 'Concluída'
                            : s.status === 'perdida'
                            ? 'Perdida'
                            : 'Planejada'}
                        </Badge>
                      </div>
                      <p className="text-sm text-fg-muted">{s.objective || 'Sem objetivo registrado'}</p>
                      <div className="text-xs text-fg-subtle flex items-center gap-3">
                        <span>Planejado: {s.plannedMinutes} min</span>
                        {s.actualSeconds > 0 && (
                          <span>Realizado: {Math.round(s.actualSeconds / 60)} min</span>
                        )}
                        {s.plannedStart && <span>Início previsto: {s.plannedStart}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {s.status === 'planejada' && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Play className="size-3.5" />}
                          onClick={() => handleStartTimer(s)}
                        >
                          Estudar
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedSessionDetail(s)}
                      >
                        Detalhes
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-fg-muted">
              <CalendarIcon className="mx-auto size-8 text-fg-subtle mb-2" />
              <p className="font-medium text-fg">Nenhuma sessão agendada para este dia</p>
              <p className="text-xs text-fg-subtle mt-1">
                Adicione uma sessão avulsa ou planeje no cronograma.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Session Details Drawer / Modal */}
      {selectedSessionDetail && (
        <Card
          title="Detalhes da Sessão de Estudo"
          description={`Planejada para ${formatDate(selectedSessionDetail.date)}`}
          onClose={() => setSelectedSessionDetail(null)}
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-fg-muted font-medium">Disciplina</span>
                <div className="font-medium text-fg flex items-center gap-2 mt-0.5">
                  {discMap.get(selectedSessionDetail.disciplineId) ? (
                    <DisciplineDot color={discMap.get(selectedSessionDetail.disciplineId)!.color} />
                  ) : selectedSessionDetail.disciplineId === 'simulado' ? (
                    <DisciplineDot color="#A6193C" />
                  ) : null}
                  {discMap.get(selectedSessionDetail.disciplineId)?.name ??
                    (selectedSessionDetail.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Disciplina')}
                </div>
              </div>

              <div>
                <span className="text-xs text-fg-muted font-medium">Tópico</span>
                <div className="font-medium text-fg mt-0.5">
                  {selectedSessionDetail.topicId
                    ? topicMap.get(selectedSessionDetail.topicId)?.title ?? '—'
                    : 'Geral / Não especificado'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <span className="text-xs text-fg-muted font-medium">Duração planejada</span>
                <div className="font-medium text-fg mt-0.5 tabular-nums">{selectedSessionDetail.plannedMinutes} min</div>
              </div>
              <div>
                <span className="text-xs text-fg-muted font-medium">Tempo realizado</span>
                <div className="font-medium text-fg mt-0.5 tabular-nums">
                  {Math.round(selectedSessionDetail.actualSeconds / 60)} min
                </div>
              </div>
              <div>
                <span className="text-xs text-fg-muted font-medium">Status atual</span>
                <div className="mt-0.5">
                  <Badge
                    tone={
                      selectedSessionDetail.status === 'concluida'
                        ? 'success'
                        : selectedSessionDetail.status === 'perdida'
                        ? 'danger'
                        : 'primary'
                    }
                  >
                    {selectedSessionDetail.status === 'concluida'
                      ? 'Concluída'
                      : selectedSessionDetail.status === 'perdida'
                      ? 'Perdida'
                      : 'Planejada'}
                  </Badge>
                </div>
              </div>
            </div>

            {selectedSessionDetail.objective && (
              <div>
                <span className="text-xs text-fg-muted font-medium">Objetivo da sessão</span>
                <p className="mt-1 text-fg bg-surface-muted/30 p-2.5 rounded-lg border border-border">
                  {selectedSessionDetail.objective}
                </p>
              </div>
            )}

            {selectedSessionDetail.notes && (
              <div>
                <span className="text-xs text-fg-muted font-medium">Anotações</span>
                <p className="mt-1 whitespace-pre-line text-fg-muted bg-surface-muted/30 p-2.5 rounded-lg border border-border">
                  {selectedSessionDetail.notes}
                </p>
              </div>
            )}

            {/* Execution History */}
            {selectedSessionDetail.history?.length > 0 && (
              <details className="group rounded-lg border border-border bg-surface-muted/20 p-2.5">
                <summary className="cursor-pointer text-xs font-medium text-fg-muted select-none">
                  Histórico de alterações ({selectedSessionDetail.history.length})
                </summary>
                <div className="mt-2 space-y-1 text-xs text-fg-muted max-h-32 overflow-y-auto">
                  {selectedSessionDetail.history.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="font-mono text-fg-subtle">
                        {new Date(h.at).toLocaleDateString('pt-BR')} {new Date(h.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>—</span>
                      <span>{h.description}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {selectedSessionDetail.status === 'planejada' && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Play className="size-3.5" />}
                    onClick={() => handleStartTimer(selectedSessionDetail)}
                  >
                    Iniciar Cronômetro
                  </Button>
                )}
                {selectedSessionDetail.status !== 'concluida' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Check className="size-3.5" />}
                    onClick={() => handleStatusChange(selectedSessionDetail, 'concluida')}
                  >
                    Marcar Concluída
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleStatusChange(selectedSessionDetail, 'planejada')}
                  >
                    Reabrir Sessão
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => {
                    setSessionToReschedule(selectedSessionDetail);
                    setRescheduleModalOpen(true);
                  }}
                >
                  Reagendar
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <IconButton
                  label="Editar detalhes"
                  icon={<Edit2 className="size-4" />}
                  onClick={() => {
                    setSessionToEdit(selectedSessionDetail);
                    setSessionModalOpen(true);
                  }}
                />
                <IconButton
                  label="Excluir sessão"
                  icon={<Trash2 className="size-4 text-danger" />}
                  onClick={() => {
                    setSessionToDelete(selectedSessionDetail);
                    setDeleteConfirmOpen(true);
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Modals */}
      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        sessionToEdit={sessionToEdit}
        defaultDate={modalDefaultDate}
        onSaved={(s) => {
          if (selectedSessionDetail?.id === s.id) setSelectedSessionDetail(s);
          setActionSuccess(sessionToEdit ? 'Sessão atualizada com sucesso!' : 'Sessão planejada com sucesso!');
        }}
      />

      <RescheduleModal
        open={rescheduleModalOpen}
        onClose={() => setRescheduleModalOpen(false)}
        session={sessionToReschedule}
        onRescheduled={(s) => {
          setSelectedSessionDetail(s);
          setActionSuccess('Sessão reagendada com sucesso!');
        }}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir Sessão de Estudo"
        message="Tem certeza que deseja excluir esta sessão? Se houver histórico de tempo estudado já vinculado, este será removido."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}
