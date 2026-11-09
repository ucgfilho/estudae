import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle,
  Clock,
  Edit,
  Sliders,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ClipboardList,
  Check,
  Trash2,
  Plus,
  GripVertical,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import {
  Card,
  PageHeader,
  StatCard,
  ProgressBar,
  Badge,
  Alert,
  DisciplineDot,
} from '../components/ui/Display';
import { Dialog } from '../components/ui/Dialog';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { QuestionModal } from '../components/modals/QuestionModal';
import { ErrorNoteModal } from '../components/modals/ErrorNoteModal';
import { SessionModal } from '../components/modals/SessionModal';
import { AiScheduleModal } from '../components/modals/AiScheduleModal';
import { Field, Input, Select, Textarea } from '../components/ui/Form';
import {
  useDisciplines,
  useWeeklyPlans,
  useSessions,
  useSettings,
  useToday,
} from '../hooks/useData';
import {
  applyDistributionToWeek,
  updateWeeklyPlan,
  saveDistribution,
  clearSchedule,
  syncWeeklyPlansWithSessions,
  type WeeklyPlanInput,
} from '../services/schedule';
import {
  deleteSession,
  recoverSession,
  setSessionStatus,
  moveSession,
  compareSessionsInDay,
} from '../services/sessions';
import { startPlannedTimer } from '../services/timer';
import {
  weekScheduleMetrics,
  supersededSessionIds,
} from '../domain/metrics';
import { detectOverload, sumDistribution } from '../domain/schedule';
import {
  todayKey,
  startOfWeek,
  addDays,
  formatDate,
  formatShortDate,
  formatWeekdayShort,
} from '../lib/dates';
import { formatMinutes, formatPercent } from '../lib/format';
import { useNavigate } from 'react-router-dom';
import type { WeeklyPlan, WeeklyPlanStatus, StudySession } from '../db/types';
import { WEEKLY_PLAN_STATUS_LABELS } from '../db/types';
import { errorMessage, cn } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';
import { DateInput } from '../components/ui/DateInput';

export function ScheduleScreen() {
  const navigate = useNavigate();
  const today = useToday();

  const disciplines = useDisciplines();
  const weeklyPlans = useWeeklyPlans();
  const sessions = useSessions();
  const settings = useSettings();

  const currentWeekPlan = useMemo(() => {
    return weeklyPlans.find((wp) => today >= wp.weekStart && today <= addDays(wp.weekStart, 6)) ?? null;
  }, [weeklyPlans, today]);

  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(
    () => currentWeekPlan?.weekIndex ?? 1
  );
  const autoSelectedWeekKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentWeekPlan) return;
    const key = `${today}:${currentWeekPlan.id}`;
    if (autoSelectedWeekKeyRef.current !== key) {
      autoSelectedWeekKeyRef.current = key;
      setSelectedWeekIndex(currentWeekPlan.weekIndex);
    }
  }, [currentWeekPlan, today]);

  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateStartDate, setGenerateStartDate] = useState(today);

  const [distributionModalOpen, setDistributionModalOpen] = useState(false);
  const [tempDistribution, setTempDistribution] = useState<Record<string, number>>({});

  const [planEditModalOpen, setPlanEditModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WeeklyPlan | null>(null);
  const [planForm, setPlanForm] = useState<WeeklyPlanInput>({
    objectives: '',
    plannedContent: '',
    plannedMinutes: 840,
    status: 'pendente',
    notes: '',
  });

  const [recoverModalOpen, setRecoverModalOpen] = useState(false);
  const [sessionToRecover, setSessionToRecover] = useState<StudySession | null>(null);
  const [recoverDate, setRecoverDate] = useState(todayKey());

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [justFinishedSession, setJustFinishedSession] = useState<StudySession | null>(null);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionModalDate, setSessionModalDate] = useState<string | undefined>(undefined);
  const [sessionToEdit, setSessionToEdit] = useState<StudySession | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<StudySession | null>(null);

  const openNewSession = (date?: string) => {
    setSessionModalDate(date || todayKey());
    setSessionToEdit(null);
    setSessionModalOpen(true);
  };

  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();
  const [loading, setLoading] = useState(false);


  // Drag and drop state & refs
  const draggedIdRef = useRef<string | null>(null);
  const dragStartRafRef = useRef<number | null>(null);
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ dayKey: string; index: number } | null>(null);
  const [dragOverWeekIndex, setDragOverWeekIndex] = useState<number | null>(null);
  const [optimisticSessions, setOptimisticSessions] = useState<StudySession[] | null>(null);

  useEffect(() => {
    setOptimisticSessions(null);
  }, [sessions]);

  const activeSessions = optimisticSessions ?? sessions;

  const clearDragState = useCallback(() => {
    if (dragStartRafRef.current !== null) {
      cancelAnimationFrame(dragStartRafRef.current);
      dragStartRafRef.current = null;
    }
    draggedIdRef.current = null;
    setDraggedSessionId(null);
    setDropTarget(null);
    setDragOverWeekIndex(null);
  }, []);

  useEffect(() => {
    if (!draggedSessionId) return;
    const onWindowDragEnd = () => clearDragState();
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearDragState();
      }
    };
    window.addEventListener('dragend', onWindowDragEnd);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('dragend', onWindowDragEnd);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [draggedSessionId, clearDragState]);

  const draggedSession = useMemo(
    () => (draggedSessionId ? activeSessions.find((s) => s.id === draggedSessionId) ?? null : null),
    [draggedSessionId, activeSessions]
  );

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  // Current active plan
  const currentPlan = useMemo(() => {
    return weeklyPlans.find((p) => p.weekIndex === selectedWeekIndex) ?? weeklyPlans[0] ?? null;
  }, [weeklyPlans, selectedWeekIndex]);

  const weekStart = currentPlan?.weekStart ?? startOfWeek(today);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const superseded = useMemo(() => supersededSessionIds(activeSessions), [activeSessions]);

  // Week sessions
  const weekSessions = useMemo(() => {
    return activeSessions
      .filter((s) => s.date >= weekStart && s.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || compareSessionsInDay(a, b));
  }, [activeSessions, weekStart, weekEnd]);

  // Overload and metrics
  const dailyGoal = settings?.dailyGoalMinutes ?? 120;
  const weeklyGoal = settings?.weeklyGoalMinutes ?? 840;

  const overloadInfo = useMemo(() => {
    return detectOverload(activeSessions, weekStart, dailyGoal, weeklyGoal);
  }, [activeSessions, weekStart, dailyGoal, weeklyGoal]);

  const weekMetrics = useMemo(
    () => weekScheduleMetrics(activeSessions, weekStart, weekEnd),
    [activeSessions, weekStart, weekEnd]
  );
  const doneMinutes = weekMetrics.doneMinutes;
  const plannedMinutes = weekMetrics.plannedMinutes;
  const compRate = weekMetrics.completionRate;
  const effectivePlannedMinutes =
    weekMetrics.totalSessions > 0 ? weekMetrics.plannedMinutes : (currentPlan?.plannedMinutes ?? 0);
  const effectivePlanStatus: WeeklyPlanStatus = useMemo(() => {
    if (!currentPlan) return 'pendente';
    if (weekMetrics.totalSessions > 0 && weekMetrics.completedSessions === weekMetrics.totalSessions) {
      return 'concluida';
    }
    if (weekMetrics.completedSessions > 0 || weekMetrics.doneMinutes > 0) {
      return 'em-andamento';
    }
    return currentPlan.status;
  }, [currentPlan, weekMetrics]);

  useEffect(() => {
    if (!currentPlan) return;
    const expectedMinutes =
      weekMetrics.totalSessions > 0 ? weekMetrics.plannedMinutes : currentPlan.plannedMinutes;
    if (
      currentPlan.plannedMinutes !== expectedMinutes ||
      currentPlan.status !== effectivePlanStatus
    ) {
      void syncWeeklyPlansWithSessions();
    }
  }, [currentPlan, weekMetrics.totalSessions, weekMetrics.plannedMinutes, effectivePlanStatus]);

  // Overdue sessions in this week (planned, date < today, not completed)
  const overdueSessions = useMemo(() => {
    return weekSessions.filter(
      (s) => s.status === 'planejada' && !superseded.has(s.id) && s.date < today
    );
  }, [weekSessions, superseded, today]);

  // Reapply distribution to current week
  const handleReapplyWeek = async () => {
    setActionError(null);
    setLoading(true);
    try {
      const count = await applyDistributionToWeek(weekStart, today);
      setActionSuccess(`Distribuição reaplicada! ${count} sessão(ões) atualizadas para a semana.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Open distribution modal
  const openDistributionModal = () => {
    setTempDistribution({ ...(settings?.distribution ?? {}) });
    setDistributionModalOpen(true);
  };

  const handleSaveDistribution = async () => {
    setActionError(null);
    try {
      await saveDistribution(tempDistribution);
      setDistributionModalOpen(false);
      setActionSuccess('Distribuição padrão salva com sucesso!');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  // Edit Weekly Plan
  const openEditPlan = (plan: WeeklyPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      objectives: plan.objectives,
      plannedContent: plan.plannedContent,
      plannedMinutes: plan.plannedMinutes,
      status: plan.status,
      notes: plan.notes,
    });
    setPlanEditModalOpen(true);
  };

  const handleSaveWeeklyPlan = async () => {
    if (!editingPlan) return;
    setActionError(null);
    setLoading(true);
    try {
      await updateWeeklyPlan(editingPlan.id, planForm);
      setPlanEditModalOpen(false);
      setEditingPlan(null);
      setActionSuccess('Metas e anotações da semana atualizadas!');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Recover uncompleted session
  const openRecoverModal = (session: StudySession) => {
    setSessionToRecover(session);
    setRecoverDate(todayKey());
    setRecoverModalOpen(true);
  };

  const handleRecoverSession = async () => {
    if (!sessionToRecover) return;
    setActionError(null);
    setLoading(true);
    try {
      await recoverSession(sessionToRecover.id, recoverDate);
      setRecoverModalOpen(false);
      setSessionToRecover(null);
      setActionSuccess('Sessão recuperada com sucesso para a nova data!');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStartTimer = async (session: StudySession) => {
    setActionError(null);
    try {
      await startPlannedTimer(session.id);
      navigate('/estudar-agora');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleClearSchedule = async () => {
    setActionError(null);
    setActionSuccess(null);
    setLoading(true);
    try {
      await clearSchedule();
      setClearConfirmOpen(false);
      setActionSuccess('Cronograma limpo com sucesso! Planos semanais e sessões planejadas foram removidos.');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteDirectly = async (session: StudySession) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const minutes = session.actualSeconds > 0 ? Math.round(session.actualSeconds / 60) : session.plannedMinutes;
      await setSessionStatus(session.id, 'concluida', minutes);
      setJustFinishedSession({
        ...session,
        status: 'concluida',
        actualSeconds: minutes * 60,
      });
      // Scroll to top smoothly so the user sees the confirmation banner immediately
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;
    setActionError(null);
    setActionSuccess(null);
    setLoading(true);
    try {
      await deleteSession(sessionToDelete.id);
      setDeleteConfirmOpen(false);
      setSessionToDelete(null);
      setActionSuccess('Sessão excluída com sucesso!');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const applyOptimisticMove = useCallback(
    (sessionId: string, targetDate: string, targetIndex?: number) => {
      setOptimisticSessions((prev) => {
        const base = prev ?? sessions;
        const moving = base.find((item) => item.id === sessionId);
        if (!moving) return base;

        const targetDayOthers = base
          .filter((item) => item.date === targetDate && item.id !== sessionId)
          .sort(compareSessionsInDay);

        const insertAt =
          targetIndex !== undefined
            ? Math.max(0, Math.min(targetIndex, targetDayOthers.length))
            : targetDayOthers.length;

        const reorderedTarget = [...targetDayOthers];
        reorderedTarget.splice(insertAt, 0, { ...moving, date: targetDate, order: insertAt });

        const orderMap = new Map<string, number>();
        reorderedTarget.forEach((item, idx) => orderMap.set(item.id, idx));

        return base.map((item) => {
          if (item.id === sessionId) {
            return { ...item, date: targetDate, order: orderMap.get(item.id) ?? insertAt };
          }
          if (orderMap.has(item.id)) {
            return { ...item, order: orderMap.get(item.id) };
          }
          return item;
        });
      });
    },
    [sessions]
  );

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, session: StudySession) => {
    draggedIdRef.current = session.id;
    e.dataTransfer.setData('text/plain', session.id);
    e.dataTransfer.effectAllowed = 'move';

    // Defer state update to next animation frame so the browser captures a crisp,
    // full-opacity drag image and never cancels dragstart due to synchronous DOM mutation.
    if (dragStartRafRef.current !== null) {
      cancelAnimationFrame(dragStartRafRef.current);
    }
    dragStartRafRef.current = requestAnimationFrame(() => {
      dragStartRafRef.current = null;
      setDraggedSessionId(session.id);
    });
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const handleDayDragOver = (e: React.DragEvent<HTMLDivElement>, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverWeekIndex !== null) setDragOverWeekIndex(null);

    const cardEls = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[data-session-card-id]')
    );
    let nextIndex = cardEls.length;
    for (let idx = 0; idx < cardEls.length; idx++) {
      const rect = cardEls[idx].getBoundingClientRect();
      if (rect.height > 0 && e.clientY < rect.top + rect.height / 2) {
        nextIndex = idx;
        break;
      }
    }

    setDropTarget((prev) =>
      prev && prev.dayKey === dayKey && prev.index === nextIndex
        ? prev
        : { dayKey, index: nextIndex }
    );
  };

  const handleDayDragLeave = (e: React.DragEvent<HTMLDivElement>, dayKey: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      return;
    }

    setDropTarget((prev) => (prev?.dayKey === dayKey ? null : prev));
  };

  const handleDropOnDay = async (e: React.DragEvent<HTMLDivElement>, targetDate: string) => {
    e.preventDefault();
    const sessionId =
      e.dataTransfer.getData('text/plain') || draggedIdRef.current || draggedSessionId;
    const rawDropIndex = dropTarget?.dayKey === targetDate ? dropTarget.index : undefined;
    clearDragState();
    if (!sessionId) return;

    const s = activeSessions.find((item) => item.id === sessionId);
    if (!s) return;

    const daySessions = activeSessions
      .filter((item) => item.date === targetDate)
      .sort(compareSessionsInDay);

    const isSameDay = s.date === targetDate;
    let effectiveTargetIndex: number | undefined = rawDropIndex;

    if (isSameDay) {
      const sourceIdx = daySessions.findIndex((item) => item.id === sessionId);
      if (
        rawDropIndex === undefined ||
        sourceIdx === -1 ||
        rawDropIndex === sourceIdx ||
        rawDropIndex === sourceIdx + 1
      ) {
        return;
      }
      effectiveTargetIndex = rawDropIndex > sourceIdx ? rawDropIndex - 1 : rawDropIndex;
    }

    setActionError(null);
    applyOptimisticMove(sessionId, targetDate, effectiveTargetIndex);

    try {
      await moveSession(sessionId, targetDate, effectiveTargetIndex);
      const disc = discMap.get(s.disciplineId);
      const discName =
        disc?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : s.disciplineId);
      setActionSuccess(
        isSameDay
          ? `Ordem de "${discName}" atualizada em ${formatWeekdayShort(targetDate)} (${formatDate(targetDate)})!`
          : `Sessão de "${discName}" movida para ${formatWeekdayShort(targetDate)} (${formatDate(targetDate)}) com sucesso!`
      );
    } catch (err) {
      setOptimisticSessions(null);
      setActionError(errorMessage(err));
    }
  };

  const handleDropOnWeek = async (e: React.DragEvent, targetPlan: WeeklyPlan) => {
    e.preventDefault();
    const sessionId =
      e.dataTransfer.getData('text/plain') || draggedIdRef.current || draggedSessionId;
    clearDragState();
    if (!sessionId) return;

    const s = activeSessions.find((item) => item.id === sessionId);
    if (!s) return;

    let dayOffset = 0;
    const baseWeekStart =
      currentPlan && s.date >= currentPlan.weekStart && s.date <= addDays(currentPlan.weekStart, 6)
        ? currentPlan.weekStart
        : startOfWeek(s.date);

    for (let i = 0; i < 7; i++) {
      if (addDays(baseWeekStart, i) === s.date) {
        dayOffset = i;
        break;
      }
    }

    const targetDate = addDays(targetPlan.weekStart, dayOffset);
    if (s.date === targetDate) {
      setSelectedWeekIndex(targetPlan.weekIndex);
      return;
    }

    setActionError(null);
    applyOptimisticMove(sessionId, targetDate);
    setSelectedWeekIndex(targetPlan.weekIndex);

    try {
      await moveSession(sessionId, targetDate);
      const disc = discMap.get(s.disciplineId);
      const discName =
        disc?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : s.disciplineId);
      setActionSuccess(
        `Sessão de "${discName}" movida para Semana ${targetPlan.weekIndex} (${formatWeekdayShort(targetDate)}, ${formatDate(targetDate)}) com sucesso!`
      );
    } catch (err) {
      setOptimisticSessions(null);
      setActionError(errorMessage(err));
    }
  };

  const totalDistMinutes = useMemo(
    () => sumDistribution(tempDistribution, disciplines),
    [tempDistribution, disciplines]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cronograma de Estudos (24 Semanas)"
        description={
          settings?.contestName
            ? `Planejamento semanal adaptado ao edital de ${settings.contestName}${settings.contestRole ? ` (${settings.contestRole})` : ''}.`
            : 'Planejamento estruturado de 24 semanas com blocos diários e revisões práticas.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Sparkles className="size-4 text-primary" />}
              onClick={() => {
                setGenerateStartDate(settings?.scheduleStartDate ?? today);
                setGenerateModalOpen(true);
              }}
            >
              Gerar com IA (24 Semanas)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Sliders className="size-4" />}
              onClick={openDistributionModal}
            >
              Editar Distribuição
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="size-4" />}
              onClick={handleReapplyWeek}
              disabled={!currentPlan}
            >
              Reaplicar na Semana
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-fg-muted hover:text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => setClearConfirmOpen(true)}
              disabled={weeklyPlans.length === 0}
            >
              Limpar Cronograma
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => openNewSession()}
            >
              Planejar Sessão
            </Button>
          </div>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Post-Session Congratulations & Actions (Print 2) */}
      {justFinishedSession && (
        <Card
          title="Sessão Finalizada e Salva com Sucesso!"
          description={`Você estudou ${formatMinutes(Math.round(justFinishedSession.actualSeconds / 60))}.`}
          className="border-success/40 bg-success-soft/20 animate-fade-in"
          onClose={() => setJustFinishedSession(null)}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-fg-muted">
              Aproveite o fim da sessão para registrar questões resolvidas ou incluir aprendizados no seu Caderno de Erros.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<CheckCircle className="size-4" />}
                onClick={() => setQuestionModalOpen(true)}
              >
                Lançar Questões Desta Sessão
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setErrorModalOpen(true)}
              >
                Cadastrar Erro / Aprendizado
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Week Selector Ribbon */}
      {weeklyPlans.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft className="size-4" />}
                disabled={selectedWeekIndex <= 1}
                onClick={() => setSelectedWeekIndex((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={selectedWeekIndex >= weeklyPlans.length}
                onClick={() => setSelectedWeekIndex((prev) => Math.min(weeklyPlans.length, prev + 1))}
              >
                Próxima <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>

            {currentWeekPlan && (
              <Button
                variant={selectedWeekIndex === currentWeekPlan.weekIndex ? 'subtle' : 'secondary'}
                size="sm"
                icon={<Calendar className="size-3.5" />}
                onClick={() => setSelectedWeekIndex(currentWeekPlan.weekIndex)}
              >
                Semana Atual ({currentWeekPlan.weekIndex})
              </Button>
            )}
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex w-max min-w-full gap-1.5 p-1 rounded-xl border border-border bg-surface">
              {weeklyPlans.map((wp) => {
                const isSelected = wp.weekIndex === selectedWeekIndex;
                const isCur = today >= wp.weekStart && today <= addDays(wp.weekStart, 6);
                const isWeekDropTarget = dragOverWeekIndex === wp.weekIndex && !isSelected;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => setSelectedWeekIndex(wp.weekIndex)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dropTarget !== null) setDropTarget(null);
                      if (dragOverWeekIndex !== wp.weekIndex) setDragOverWeekIndex(wp.weekIndex);
                    }}
                    onDragLeave={(e) => {
                      const related = e.relatedTarget as Node | null;
                      if (related && e.currentTarget.contains(related)) return;
                      if (dragOverWeekIndex === wp.weekIndex) setDragOverWeekIndex(null);
                    }}
                    onDrop={(e) => void handleDropOnWeek(e, wp)}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-all shrink-0',
                      isWeekDropTarget &&
                        'ring-2 ring-primary bg-primary-soft/60 text-primary scale-105 border-dashed border-primary shadow-sm',
                      isSelected
                        ? 'bg-primary text-primary-fg shadow-xs font-semibold'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                      isCur && !isSelected && 'ring-1 ring-primary/40'
                    )}
                    title={
                      draggedSessionId
                        ? `Soltar aqui para mover sessão para Semana ${wp.weekIndex}`
                        : undefined
                    }
                  >
                    <span className="pointer-events-none">Semana {wp.weekIndex}</span>
                    <span className="text-[10px] opacity-80 pointer-events-none">
                      {isWeekDropTarget ? 'Soltar aqui' : formatShortDate(wp.weekStart)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <Alert
          tone="warning"
          title="Nenhum cronograma gerado ainda"
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkles className="size-4" />}
              onClick={() => {
                setGenerateStartDate(settings?.scheduleStartDate ?? today);
                setGenerateModalOpen(true);
              }}
            >
              Gerar Cronograma com IA
            </Button>
          }
        >
          O cronograma de 24 semanas é gerado por IA com base no edital do BNB para Analista de Sistemas (TI), com 2h diárias e sábados exclusivos de simulados.
        </Alert>
      )}

      {/* Week Summary Card and Day Columns */}
      <div className="space-y-4">
        {currentPlan ? (
          <Card
            title={`Semana ${currentPlan.weekIndex} — (${formatDate(weekStart)} a ${formatDate(weekEnd)})`}
            description={`Meta planejada: ${formatMinutes(effectivePlannedMinutes)}`}
            actions={
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    effectivePlanStatus === 'concluida'
                      ? 'success'
                      : effectivePlanStatus === 'em-andamento'
                      ? 'warning'
                      : 'neutral'
                  }
                >
                  {WEEKLY_PLAN_STATUS_LABELS[effectivePlanStatus]}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Edit className="size-3.5" />}
                  onClick={() =>
                    openEditPlan({
                      ...currentPlan,
                      plannedMinutes: effectivePlannedMinutes,
                      status: effectivePlanStatus,
                    })
                  }
                >
                  Editar Objetivos
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Tempo Realizado"
                value={formatMinutes(doneMinutes)}
                hint={`Planejado: ${formatMinutes(plannedMinutes)}`}
                icon={<Clock className="size-4" />}
              >
                <ProgressBar
                  value={doneMinutes}
                  max={plannedMinutes || 1}
                  label="Cumprimento da semana"
                  tone={doneMinutes >= plannedMinutes ? 'success' : 'primary'}
                />
              </StatCard>

              <StatCard
                label="Percentual de Cumprimento"
                value={formatPercent(compRate)}
                hint={`${weekMetrics.completedSessions} de ${weekMetrics.totalSessions} sessões concluídas`}
                icon={<CheckCircle className="size-4" />}
              />

              <div className="rounded-xl border border-border bg-surface-muted/30 p-3 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-fg-muted mb-1">
                    Objetivos da semana
                  </div>
                  <p className="text-xs text-fg-muted line-clamp-3">
                    {currentPlan.objectives || 'Nenhum objetivo registrado para esta semana. Clique em "Editar Objetivos" para adicionar.'}
                  </p>
                </div>
                {currentPlan.plannedContent && (
                  <div className="mt-2 text-[11px] text-fg-subtle border-t border-border pt-1.5 truncate">
                    Conteúdo: {currentPlan.plannedContent}
                  </div>
                )}
              </div>
            </div>

            {/* Overdue & Overload Alerts */}
            {overdueSessions.length > 0 && (
              <Alert
                tone="warning"
                title={`${overdueSessions.length} sessão(ões) pendente(s) em datas passadas nesta semana`}
                className="mt-4"
                dismissKey={`schedule-overdue-${selectedWeekIndex}`}
                once
              >
                Você possui blocos que não foram concluídos. Você pode recuperar uma sessão atrasada reagendando-a para hoje ou para os próximos dias sem apagar o histórico original.
              </Alert>
            )}

            {overloadInfo.weekOverloaded && (
              <Alert
                tone="danger"
                title="Atenção: Sobrecarga na semana!"
                className="mt-2"
                dismissKey={`schedule-week-overload-${selectedWeekIndex}`}
                once
              >
                A carga planejada para esta semana ({formatMinutes(overloadInfo.weekMinutes)}) excede a meta semanal estipulada ({formatMinutes(weeklyGoal)}).
              </Alert>
            )}

            {overloadInfo.overloadedDays.length > 0 && (
              <Alert
                tone="warning"
                title="Carga diária acima da meta"
                className="mt-2"
                dismissKey={`schedule-daily-overload-${selectedWeekIndex}`}
                once
              >
                Dias com carga diária acima da meta ({dailyGoal}m):{' '}
                {overloadInfo.overloadedDays.map((d) => `${formatDate(d.date)} (${d.minutes}m)`).join(', ')}.
              </Alert>
            )}
          </Card>
        ) : (
          <Card
            title={`Semana Atual — (${formatDate(weekStart)} a ${formatDate(weekEnd)})`}
            description="Exibindo suas sessões de estudo planejadas para esta semana."
            actions={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => openNewSession()}
              >
                Planejar Sessão
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Tempo Realizado"
                value={formatMinutes(doneMinutes)}
                hint={`Planejado: ${formatMinutes(plannedMinutes)}`}
                icon={<Clock className="size-4" />}
              >
                <ProgressBar
                  value={doneMinutes}
                  max={plannedMinutes || 1}
                  label="Cumprimento da semana"
                  tone={doneMinutes >= plannedMinutes ? 'success' : 'primary'}
                />
              </StatCard>

              <StatCard
                label="Percentual de Cumprimento"
                value={formatPercent(compRate)}
                hint={`${weekMetrics.completedSessions} de ${weekMetrics.totalSessions} sessões concluídas`}
                icon={<CheckCircle className="size-4" />}
              />

              <div className="rounded-xl border border-border bg-surface-muted/30 p-3 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase text-fg-subtle mb-1">
                    Sessões Pré-Criadas
                  </div>
                  <p className="text-xs text-fg-muted">
                    Sessões que você planejar manualmente aparecem aqui e serão respeitadas intactas caso decida gerar o cronograma de 24 semanas.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Days and Sessions List for the selected week */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">
              Programação dos dias da semana
            </h3>
            <span className="text-xs text-fg-muted flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-fg-muted bg-surface-muted px-2 py-0.5 rounded-full">
                <GripVertical className="size-3" />
                Arraste sessões entre dias ou semanas
              </span>
              <span>·</span>
              <span className="tabular-nums">{weekSessions.length} sessão(ões) na semana</span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((dayKey) => {
              const daySessions = weekSessions.filter((s) => s.date === dayKey);
              const isToday = dayKey === today;
              const totalDayPlanned = daySessions.reduce((sum, s) => sum + s.plannedMinutes, 0);

              const isHoveredDay = dropTarget?.dayKey === dayKey && Boolean(draggedSession);
              const isCrossDayHover = isHoveredDay && draggedSession?.date !== dayKey;
              const draggedSourceIdx =
                isHoveredDay && draggedSession?.date === dayKey
                  ? daySessions.findIndex((s) => s.id === draggedSession.id)
                  : -1;
              const isSameDayReorderHover =
                isHoveredDay &&
                draggedSession?.date === dayKey &&
                draggedSourceIdx !== -1 &&
                dropTarget.index !== draggedSourceIdx &&
                dropTarget.index !== draggedSourceIdx + 1;

              const isActiveDropColumn = isCrossDayHover || isSameDayReorderHover;
              const projectedDayMinutes = isCrossDayHover
                ? totalDayPlanned + (draggedSession?.plannedMinutes ?? 0)
                : totalDayPlanned;

              const draggedDisc = draggedSession
                ? discMap.get(draggedSession.disciplineId)
                : undefined;
              const draggedLabel = draggedSession
                ? draggedDisc?.name ??
                  (draggedSession.disciplineId === 'simulado'
                    ? 'Simulado Geral BNB'
                    : draggedSession.disciplineId)
                : '';

              const renderDropPreviewSlot = (slotIdx: number) => {
                if (!isActiveDropColumn || dropTarget?.index !== slotIdx || !draggedSession) {
                  return null;
                }
                return (
                  <div
                    key={`drop-slot-${dayKey}-${slotIdx}`}
                    data-testid={`drop-preview-${dayKey}`}
                    className="pointer-events-none rounded-lg border-2 border-dashed border-primary bg-primary-soft/30 px-2.5 py-2 text-xs font-medium text-primary flex items-center justify-between gap-1.5 shadow-2xs transition-all"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <DisciplineDot color={draggedDisc?.color ?? '#A6193C'} />
                      <span className="truncate">{draggedLabel}</span>
                    </span>
                    <span className="text-[10px] font-bold shrink-0">
                      {draggedSession.plannedMinutes}m
                    </span>
                  </div>
                );
              };

              return (
                <div
                  key={dayKey}
                  data-testid={`day-column-${dayKey}`}
                  onDragOver={(e) => handleDayDragOver(e, dayKey)}
                  onDragEnter={(e) => handleDayDragOver(e, dayKey)}
                  onDragLeave={(e) => handleDayDragLeave(e, dayKey)}
                  onDrop={(e) => void handleDropOnDay(e, dayKey)}
                  className={cn(
                    'rounded-xl border p-3 flex flex-col justify-between min-h-[220px] transition-colors duration-150',
                    isActiveDropColumn
                      ? 'border-primary ring-2 ring-primary/70 bg-primary-soft/15 shadow-md'
                      : isToday
                      ? 'border-primary bg-primary-soft/10 ring-1 ring-primary/40'
                      : 'border-border bg-surface'
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <span className="text-xs font-bold uppercase text-fg-subtle">
                        {formatWeekdayShort(dayKey)}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={cn('text-xs font-semibold', isToday && 'text-primary')}>
                          {formatShortDate(dayKey)}
                        </span>
                        <IconButton
                          label={`Planejar sessão para ${formatWeekdayShort(dayKey)}`}
                          icon={<Plus className="size-3" />}
                          size="sm"
                          className="!size-5 text-fg-subtle hover:text-primary"
                          onClick={() => openNewSession(dayKey)}
                        />
                      </div>
                    </div>

                    <div className="mt-1 text-[11px] text-fg-subtle flex items-center justify-between">
                      <span>Carga:</span>
                      {isCrossDayHover ? (
                        <strong
                          className={cn(
                            'tabular-nums transition-colors',
                            projectedDayMinutes > dailyGoal ? 'text-danger' : 'text-primary'
                          )}
                        >
                          {totalDayPlanned}m → {projectedDayMinutes}m
                        </strong>
                      ) : (
                        <strong className={cn(totalDayPlanned > dailyGoal ? 'text-danger' : 'text-fg')}>
                          {totalDayPlanned}m
                        </strong>
                      )}
                    </div>

                    {/* Sessions in day */}
                    <div className="mt-2 space-y-1.5">
                      {daySessions.map((s, idx) => {
                        const d = discMap.get(s.disciplineId);
                        const isSimulado = s.disciplineId === 'simulado';
                        const isOverdue = s.status === 'planejada' && s.date < today;
                        const isLost = s.status === 'perdida';
                        const canRecover = isOverdue || isLost;
                        const isDragging = draggedSessionId === s.id;

                        return (
                          <div key={s.id} className="space-y-1.5">
                            {renderDropPreviewSlot(idx)}
                            <div
                              data-session-card-id={s.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, s)}
                              onDragEnd={handleDragEnd}
                              title="Arraste para mover para qualquer dia, semana ou posição"
                              className={cn(
                                'group rounded-lg border p-2 text-xs space-y-1 cursor-grab active:cursor-grabbing transition-all select-none',
                                isDragging &&
                                  'opacity-40 border-dashed border-primary ring-1 ring-primary/60 bg-primary-soft/10',
                                isSimulado &&
                                  'border-primary/40 bg-primary-soft/15 ring-1 ring-primary/30',
                                s.status === 'concluida'
                                  ? 'border-success/30 bg-success-soft/30'
                                  : isOverdue
                                  ? 'border-warning/40 bg-warning-soft/40'
                                  : !isSimulado &&
                                    'border-border bg-surface hover:border-primary/50 hover:shadow-xs'
                              )}
                            >
                              <div
                                className={cn(
                                  'flex items-center justify-between gap-1',
                                  Boolean(draggedSessionId) && 'pointer-events-none'
                                )}
                              >
                                <span className="font-semibold flex items-center gap-1.5 truncate">
                                  <GripVertical className="size-3.5 text-fg-subtle shrink-0 group-hover:text-primary transition-colors cursor-grab" />
                                  {d ? (
                                    <DisciplineDot color={d.color} />
                                  ) : isSimulado ? (
                                    <DisciplineDot color="#A6193C" />
                                  ) : null}
                                  <span className="truncate">
                                    {d?.name ?? (isSimulado ? 'Simulado Geral BNB' : s.disciplineId)}
                                  </span>
                                </span>
                                <Badge
                                  tone={isSimulado ? 'primary' : 'neutral'}
                                  className="text-[10px] px-1 py-0 font-bold shrink-0"
                                >
                                  {s.plannedMinutes}m
                                </Badge>
                              </div>

                              {s.objective && (
                                <p
                                  className={cn(
                                    'text-[11px] text-fg-muted truncate',
                                    Boolean(draggedSessionId) && 'pointer-events-none'
                                  )}
                                >
                                  {s.objective}
                                </p>
                              )}

                              <div
                                className={cn(
                                  'flex items-center justify-between pt-1 border-t border-border/50 text-[10px]',
                                  Boolean(draggedSessionId) && 'pointer-events-none'
                                )}
                              >
                                <span
                                  className={cn(
                                    s.status === 'concluida'
                                      ? 'text-success font-semibold'
                                      : isOverdue
                                      ? 'text-warning font-semibold'
                                      : isLost
                                      ? 'text-danger font-semibold'
                                      : 'text-fg-subtle'
                                  )}
                                >
                                  {s.status === 'concluida'
                                    ? 'Concluída'
                                    : isOverdue
                                    ? 'Atrasada'
                                    : isLost
                                    ? 'Perdida'
                                    : ''}
                                </span>

                                <div
                                  className="flex items-center gap-1"
                                  draggable={false}
                                  onDragStart={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {isSimulado && (
                                    <IconButton
                                      label="Ir para tela de Simulados"
                                      icon={<ClipboardList className="size-3 text-primary" />}
                                      size="sm"
                                      className="!size-5"
                                      onClick={() => navigate('/simulados')}
                                    />
                                  )}
                                  {(s.status === 'planejada' || s.status === 'concluida') && (
                                    <>
                                      <IconButton
                                        label="Editar sessão"
                                        icon={<Edit className="size-3 text-fg-subtle hover:text-fg" />}
                                        size="sm"
                                        className="!size-5"
                                        onClick={() => {
                                          setSessionToEdit(s);
                                          setSessionModalDate(s.date);
                                          setSessionModalOpen(true);
                                        }}
                                      />
                                      {s.status === 'planejada' && (
                                        <>
                                          <IconButton
                                            label="Concluir sessão (caso já tenha estudado sem cronômetro)"
                                            icon={<Check className="size-3 text-success" />}
                                            size="sm"
                                            className="!size-5 hover:bg-success-soft"
                                            onClick={() => void handleCompleteDirectly(s)}
                                          />
                                          <IconButton
                                            label="Iniciar cronômetro para esta sessão"
                                            icon={<Play className="size-3" />}
                                            size="sm"
                                            className="!size-5"
                                            onClick={() => handleStartTimer(s)}
                                          />
                                        </>
                                      )}
                                      <IconButton
                                        label="Excluir sessão"
                                        icon={<Trash2 className="size-3 text-fg-subtle hover:text-danger" />}
                                        size="sm"
                                        className="!size-5 hover:bg-danger-soft/40"
                                        onClick={() => {
                                          setSessionToDelete(s);
                                          setDeleteConfirmOpen(true);
                                        }}
                                      />
                                    </>
                                  )}
                                  {canRecover && (
                                    <>
                                      <IconButton
                                        label={isLost ? 'Recuperar sessão perdida' : 'Recuperar sessão atrasada'}
                                        icon={<RotateCcw className="size-3 text-warning" />}
                                        size="sm"
                                        className="!size-5"
                                        onClick={() => openRecoverModal(s)}
                                      />
                                      <IconButton
                                        label={isLost ? 'Excluir sessão perdida' : 'Excluir sessão atrasada'}
                                        icon={<Trash2 className="size-3 text-fg-subtle hover:text-danger" />}
                                        size="sm"
                                        className="!size-5 hover:bg-danger-soft/40"
                                        onClick={() => {
                                          setSessionToDelete(s);
                                          setDeleteConfirmOpen(true);
                                        }}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {renderDropPreviewSlot(daySessions.length)}
                    </div>
                  </div>

                  {daySessions.length === 0 && !isActiveDropColumn && (
                    <p className="py-4 text-center text-xs text-fg-subtle">Livre</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Distribution Modal */}
      <Dialog
        open={distributionModalOpen}
        onClose={() => setDistributionModalOpen(false)}
        title="Distribuição Semanal de Horas por Disciplina"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDistributionModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSaveDistribution}>
              Salvar Distribuição
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Distribuição sugerida: <strong>10 horas (600 min)</strong> para disciplinas técnicas e <strong>4 horas (240 min)</strong> para Língua Portuguesa e Raciocínio Lógico. Total semanal: <strong>840 min (14h)</strong>.
          </p>

          <div className="rounded-lg bg-surface-muted/50 p-3 flex items-center justify-between text-sm">
            <span>Soma da distribuição atual:</span>
            <strong className={cn(totalDistMinutes === 840 ? 'text-success font-bold' : 'text-warning font-bold')}>
              {totalDistMinutes} min ({formatMinutes(totalDistMinutes)})
            </strong>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {disciplines.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <DisciplineDot color={d.color} />
                  <span className="truncate">{d.name}</span>
                  <Badge tone={d.kind === 'technical' ? 'primary' : 'neutral'} className="text-[10px]">
                    {d.kind === 'technical' ? 'Técnica' : 'Geral'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    min="0"
                    step="10"
                    className="w-24 text-right"
                    value={tempDistribution[d.id] ?? 0}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setTempDistribution({
                        ...tempDistribution,
                        [d.id]: isNaN(val) ? 0 : Math.max(0, val),
                      });
                    }}
                  />
                  <span className="text-xs text-fg-subtle">min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {/* Generate Schedule Modal via IA */}
      <AiScheduleModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onSuccess={(msg) => {
          setActionSuccess(msg);
          autoSelectedWeekKeyRef.current = null;
        }}
        defaultStartDate={generateStartDate}
      />

      {/* Edit Weekly Plan Modal */}
      <Dialog
        open={planEditModalOpen}
        onClose={() => setPlanEditModalOpen(false)}
        title={`Editar Metas da Semana ${editingPlan?.weekIndex}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlanEditModalOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSaveWeeklyPlan} loading={loading}>
              Salvar Metas
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Objetivos principais da semana">
            <Textarea
              rows={3}
              placeholder="Ex: Concluir módulo de Arquitetura de Software e resolver 60 questões."
              value={planForm.objectives}
              onChange={(e) => setPlanForm({ ...planForm, objectives: e.target.value })}
            />
          </Field>

          <Field label="Conteúdos programados">
            <Input
              type="text"
              placeholder="Ex: Padrões GoF, SOLID, Microsserviços"
              value={planForm.plannedContent}
              onChange={(e) => setPlanForm({ ...planForm, plannedContent: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Meta de estudo (minutos)">
              <Input
                type="number"
                min="0"
                value={planForm.plannedMinutes}
                onChange={(e) => setPlanForm({ ...planForm, plannedMinutes: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>

            <Field label="Status da semana">
              <Select
                value={planForm.status}
                onChange={(e) => setPlanForm({ ...planForm, status: e.target.value as WeeklyPlanStatus })}
              >
                {(Object.keys(WEEKLY_PLAN_STATUS_LABELS) as WeeklyPlanStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {WEEKLY_PLAN_STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Observações adicionais">
            <Textarea
              rows={2}
              placeholder="Dificuldades encontradas, ajustes de carga ou lembretes..."
              value={planForm.notes}
              onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      {/* Recover Session Modal */}
      <Dialog
        open={recoverModalOpen}
        onClose={() => setRecoverModalOpen(false)}
        title="Recuperar Sessão Não Concluída"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecoverModalOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleRecoverSession} loading={loading}>
              Recuperar Sessão
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            A sessão original de{' '}
            <strong className="text-fg">{sessionToRecover ? formatDate(sessionToRecover.date) : ''}</strong> será marcada como perdida (mantendo seu histórico) e um novo bloco planejado será criado na data escolhida.
          </p>

          <Field label="Agendar recuperação para qual data?" required>
            <DateInput
              value={recoverDate}
              onChange={(e) => setRecoverDate(e.target.value)}
              required
            />
          </Field>
        </div>
      </Dialog>

      {/* Clear Schedule Confirmation Modal */}
      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Limpar Cronograma de Estudos"
        message="Tem certeza que deseja limpar o cronograma? Todos os planos semanais e as sessões planejadas não executadas serão removidos. O histórico de sessões já concluídas será preservado."
        confirmLabel="Limpar Cronograma"
        variant="danger"
        loading={loading}
        onConfirm={handleClearSchedule}
      />

      {/* Delete Session Confirmation Modal */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setSessionToDelete(null);
        }}
        title="Excluir Sessão de Estudo"
        message={`Tem certeza que deseja excluir esta sessão planejada${sessionToDelete?.objective ? ` ("${sessionToDelete.objective}")` : ''}? Esta ação removerá a sessão do cronograma.`}
        confirmLabel="Excluir Sessão"
        variant="danger"
        loading={loading}
        onConfirm={handleDeleteSession}
      />

      {/* Post-session Question Modal */}
      <QuestionModal
        open={questionModalOpen}
        onClose={() => setQuestionModalOpen(false)}
        defaultDate={justFinishedSession?.date}
        defaultDisciplineId={justFinishedSession?.disciplineId}
        defaultTopicId={justFinishedSession?.topicId}
        sessionId={justFinishedSession?.id}
      />

      {/* Post-session Error Modal */}
      <ErrorNoteModal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        defaultDate={justFinishedSession?.date}
        defaultDisciplineId={justFinishedSession?.disciplineId}
        defaultTopicId={justFinishedSession?.topicId}
        onSaved={() => setActionSuccess('Anotação salva no Caderno de Erros com sucesso!')}
      />

      {/* Manual / Planned Session Modal */}
      <SessionModal
        open={sessionModalOpen}
        onClose={() => {
          setSessionModalOpen(false);
          setSessionToEdit(null);
        }}
        sessionToEdit={sessionToEdit}
        defaultDate={sessionModalDate}
        onSaved={(saved) => {
          setSessionModalOpen(false);
          setSessionToEdit(null);
          setActionSuccess('Sessão planejada com sucesso!');
          if (weeklyPlans.length > 0) {
            const targetPlan = weeklyPlans.find(
              (wp) => saved.date >= wp.weekStart && saved.date <= addDays(wp.weekStart, 6),
            );
            if (targetPlan) setSelectedWeekIndex(targetPlan.weekIndex);
          }
        }}
      />
    </div>
  );
}
