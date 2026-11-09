import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
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


  // Drag and drop (pointer events + CSS translate3d): arrasto fluido onde os cards irmãos deslizam suavemente
  const boardRef = useRef<HTMLDivElement>(null);
  const flipRectsRef = useRef<Map<string, { left: number; top: number }>>(new Map());
  const skipNextFlipRef = useRef(false);
  const dropTargetRef = useRef<{ dayKey: string; index: number } | null>(null);
  const dragWeekRef = useRef<number | null>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  const [suppressShiftTransition, setSuppressShiftTransition] = useState(false);
  const [dropTarget, setDropTargetState] = useState<{ dayKey: string; index: number } | null>(null);
  const [dragOverWeekIndex, setDragOverWeekIndexState] = useState<number | null>(null);
  const [optimisticSessions, setOptimisticSessions] = useState<StudySession[] | null>(null);

  const setDropTarget = useCallback((next: { dayKey: string; index: number } | null) => {
    const prev = dropTargetRef.current;
    if (prev?.dayKey === next?.dayKey && prev?.index === next?.index) return;
    dropTargetRef.current = next;
    setDropTargetState(next);
  }, []);

  const setDragOverWeekIndex = useCallback((next: number | null) => {
    if (dragWeekRef.current === next) return;
    dragWeekRef.current = next;
    setDragOverWeekIndexState(next);
  }, []);

  useEffect(() => {
    setOptimisticSessions(null);
  }, [sessions]);

  const activeSessions = optimisticSessions ?? sessions;

  const clearDragState = useCallback(() => {
    dropTargetRef.current = null;
    dragWeekRef.current = null;
    setDraggedSessionId(null);
    setDropTargetState(null);
    setDragOverWeekIndexState(null);
  }, []);

  useEffect(() => {
    if (!draggedSessionId) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDragRef.current?.();
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [draggedSessionId]);

  useEffect(() => () => cancelDragRef.current?.(), []);

  // FLIP: anima os cards quando movidos por teclado (Alt + setas)
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || draggedSessionId) return;
    const skip = skipNextFlipRef.current;
    skipNextFlipRef.current = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const origin = board.getBoundingClientRect();
    const next = new Map<string, { left: number; top: number }>();
    board.querySelectorAll<HTMLElement>('[data-session-card-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const id = el.dataset.sessionCardId as string;
      const pos = { left: r.left - origin.left, top: r.top - origin.top };
      next.set(id, pos);
      const prev = flipRectsRef.current.get(id);
      if (skip || reduce || !prev || typeof el.animate !== 'function') return;
      const dx = prev.left - pos.left;
      const dy = prev.top - pos.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    });
    flipRectsRef.current = next;
  });

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

  // Move (arrasto ou teclado) com atualização otimista. `targetIndex` considera apenas as demais sessões do dia.
  const commitMove = async (sessionId: string, targetDate: string, targetIndex?: number) => {
    const s = activeSessions.find((item) => item.id === sessionId);
    if (!s) return;
    const isSameDay = s.date === targetDate;

    setActionError(null);
    applyOptimisticMove(sessionId, targetDate, targetIndex);

    try {
      await moveSession(sessionId, targetDate, targetIndex);
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

  const dropOnWeek = async (sessionId: string, targetPlan: WeeklyPlan) => {
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

  // Sempre aponta para as versões mais recentes dos closures (usado pelos listeners de janela)
  const latestRef = useRef({ commitMove, dropOnWeek, weeklyPlans, activeSessions, setSelectedWeekIndex });
  latestRef.current = { commitMove, dropOnWeek, weeklyPlans, activeSessions, setSelectedWeekIndex };

  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, session: StudySession) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (cancelDragRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;
    // Em toques, só a alça inicia o arrasto para preservar a rolagem da página
    if (e.pointerType !== 'mouse' && !target.closest('[data-drag-handle]')) return;

    const sourceEl = e.currentTarget;
    const rect = sourceEl.getBoundingClientRect();
    const d = {
      id: session.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      active: false,
      ghost: null as HTMLElement | null,
      raf: null as number | null,
      lastX: e.clientX,
      lastY: e.clientY,
      weekTimer: null as number | null,
      prevBodyCursor: '',
      prevBodySelect: '',
    };

    const board = () => boardRef.current;

    const updateTarget = () => {
      const b = board();
      if (!b) return;
      const { lastX: x, lastY: y } = d;

      // Aba de semana sob o ponteiro
      const under = document.elementFromPoint(x, y) as HTMLElement | null;
      const weekEl = under?.closest<HTMLElement>('[data-week-index]');
      if (weekEl) {
        const idx = Number(weekEl.dataset.weekIndex);
        setDragOverWeekIndex(idx);
        setDropTarget(null);
        if (d.weekTimer === null) {
          // Segurar sobre uma semana a abre, permitindo escolher o dia exato
          d.weekTimer = window.setTimeout(() => {
            d.weekTimer = null;
            if (dragWeekRef.current === idx) latestRef.current.setSelectedWeekIndex(idx);
          }, 700);
        }
        return;
      }
      if (d.weekTimer !== null) {
        clearTimeout(d.weekTimer);
        d.weekTimer = null;
      }
      setDragOverWeekIndex(null);

      const cols = Array.from(b.querySelectorAll<HTMLElement>('[data-day-column]'));
      let found: HTMLElement | null = null;
      for (const col of cols) {
        const r = col.getBoundingClientRect();
        if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 48 && y <= r.bottom + 48) {
          found = col;
          break;
        }
      }
      if (!found) {
        setDropTarget(null);
        return;
      }
      const targetDayKey = found.dataset.dayColumn as string;
      const isSourceColumn = targetDayKey === session.date;
      const step = d.height + 6;
      const cards = Array.from(
        found.querySelectorAll<HTMLElement>('[data-session-card-id]'),
      );
      if (isSourceColumn) {
        const sourceCardIndex = cards.findIndex((c) => c.dataset.sessionCardId === session.id);
        let index = cards.length - 1;
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect();
          const currentShift = Number(cards[i].dataset.shiftY || 0);
          const unshiftedTop = r.top - currentShift;
          const unshiftedMid = unshiftedTop + r.height / 2;
          if (y < unshiftedMid) {
            index = i;
            break;
          }
        }
        if (sourceCardIndex !== -1) {
          index = Math.max(0, Math.min(index, cards.length - 1));
        }
        setDropTarget({ dayKey: targetDayKey, index });
      } else {
        const otherCards = cards.filter((c) => c.dataset.sessionCardId !== session.id);
        let index = otherCards.length;
        for (let i = 0; i < otherCards.length; i++) {
          const r = otherCards[i].getBoundingClientRect();
          const currentShift = Number(otherCards[i].dataset.shiftY || 0);
          const unshiftedTop = r.top - currentShift;
          const unshiftedMid = unshiftedTop + r.height / 2;
          if (y < unshiftedMid + (currentShift > 0 ? step * 0.25 : 0)) {
            index = i;
            break;
          }
        }
        setDropTarget({ dayKey: targetDayKey, index });
      }
    };

    const moveGhost = () => {
      if (!d.ghost) return;
      const dx = d.lastX - d.offsetX - d.left;
      const dy = d.lastY - d.offsetY - d.top;
      d.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(1.5deg) scale(1.03)`;
    };

    const autoScroll = () => {
      d.raf = null;
      if (!d.active) return;
      const scroller = board()?.closest('main') as HTMLElement | null;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const edge = 72;
        let speed = 0;
        if (d.lastY < r.top + edge) speed = -Math.ceil(((r.top + edge - d.lastY) / edge) * 16);
        else if (d.lastY > r.bottom - edge) speed = Math.ceil(((d.lastY - (r.bottom - edge)) / edge) * 16);
        if (speed !== 0) {
          const before = scroller.scrollTop;
          scroller.scrollTop += speed;
          if (scroller.scrollTop !== before) updateTarget();
        }
      }
      d.raf = requestAnimationFrame(autoScroll);
    };

    const startDrag = () => {
      d.active = true;
      const ghost = sourceEl.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-session-card-id');
      ghost.removeAttribute('data-testid');
      ghost.removeAttribute('id');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.removeAttribute('tabindex');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${d.left}px`,
        top: `${d.top}px`,
        width: `${d.width}px`,
        height: `${d.height}px`,
        margin: '0',
        zIndex: '80',
        pointerEvents: 'none',
        cursor: 'grabbing',
        opacity: '0.96',
        transformOrigin: `${d.offsetX}px ${d.offsetY}px`,
        boxShadow: '0 18px 36px -12px rgba(0,0,0,0.45)',
        willChange: 'transform',
        transition: 'box-shadow 160ms ease',
      });
      document.body.appendChild(ghost);
      d.ghost = ghost;
      d.prevBodyCursor = document.body.style.cursor;
      d.prevBodySelect = document.body.style.userSelect;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      (document.activeElement as HTMLElement | null)?.blur?.();

      const idx = latestRef.current.activeSessions
        .filter((s) => s.date === session.date && s.id !== session.id)
        .sort(compareSessionsInDay)
        .filter((s) => compareSessionsInDay(s, session) < 0).length;
      dropTargetRef.current = { dayKey: session.date, index: idx };
      setDragHeight(d.height);
      setDropTarget({ dayKey: session.date, index: idx });
      setDraggedSessionId(session.id);
      moveGhost();
      if (typeof ghost.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        // "Levantar" o card: de parado a flutuando (escala, inclinação e sombra)
        ghost.animate(
          [
            { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
            { transform: ghost.style.transform, boxShadow: '0 18px 36px -12px rgba(0,0,0,0.45)' },
          ],
          { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
      }
      if (d.raf === null) d.raf = requestAnimationFrame(autoScroll);
    };

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (d.raf !== null) cancelAnimationFrame(d.raf);
      d.raf = null;
      if (d.weekTimer !== null) clearTimeout(d.weekTimer);
      d.weekTimer = null;
      if (d.active) {
        document.body.style.cursor = d.prevBodyCursor;
        document.body.style.userSelect = d.prevBodySelect;
      }
      cancelDragRef.current = null;
    };

    const animateGhostTo = (dx: number, dy: number, scale: boolean, done: () => void) => {
      const ghost = d.ghost;
      if (!ghost) return done();
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (reduce || typeof ghost.animate !== 'function') {
        ghost.remove();
        return done();
      }
      const from = ghost.style.transform;
      const anim = ghost.animate(
        [
          { transform: from, boxShadow: '0 18px 36px -12px rgba(0,0,0,0.45)' },
          { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(${scale ? 1 : 1})`, boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
        ],
        { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
      );
      const finish = () => {
        ghost.remove();
        done();
      };
      anim.onfinish = finish;
      anim.oncancel = finish;
    };

    const finishDrag = (cancelled: boolean) => {
      const wasActive = d.active;
      const target = dropTargetRef.current;
      const weekIdx = dragWeekRef.current;
      detach();
      if (!wasActive) return;

      const { weeklyPlans: plans, activeSessions: all, commitMove: move, dropOnWeek: moveToWeek } = latestRef.current;

      // Soltou sobre uma aba de semana
      if (!cancelled && weekIdx !== null) {
        const plan = plans.find((p) => p.weekIndex === weekIdx);
        const ghost = d.ghost;
        const finishWeek = () => {
          flushSync(() => clearDragState());
          if (plan) void moveToWeek(session.id, plan);
        };
        if (ghost?.animate) {
          const a = ghost.animate(
            [{ transform: ghost.style.transform, opacity: 0.96 }, { transform: `${ghost.style.transform} scale(0.6)`, opacity: 0 }],
            { duration: 150, easing: 'ease-in', fill: 'forwards' },
          );
          a.onfinish = () => {
            ghost.remove();
            finishWeek();
          };
        } else {
          ghost?.remove();
          finishWeek();
        }
        return;
      }

      // Soltou numa coluna de dia: o fantasma "encaixa" suavemente no espaço aberto pelos cards irmãos
      if (!cancelled && target) {
        const sameDayOthers = all
          .filter((s) => s.date === target.dayKey && s.id !== session.id)
          .sort(compareSessionsInDay);
        const original = all.find((s) => s.id === session.id);
        const sourceIdx =
          original && original.date === target.dayKey
            ? sameDayOthers.filter((s) => compareSessionsInDay(s, original) < 0).length
            : -1;
        const noop = sourceIdx === target.index;

        let targetLeft = d.left;
        let targetTop = d.top;
        const targetCol = board()?.querySelector<HTMLElement>(
          `[data-day-column="${CSS.escape(target.dayKey)}"]`,
        );
        if (targetCol) {
          const cardsInCol = Array.from(
            targetCol.querySelectorAll<HTMLElement>('[data-session-card-id]'),
          );
          if (target.dayKey === session.date) {
            const slotCard = cardsInCol[target.index];
            if (slotCard) {
              const r = slotCard.getBoundingClientRect();
              const shift = Number(slotCard.dataset.shiftY || 0);
              targetLeft = r.left;
              targetTop = r.top - shift;
            }
          } else {
            const otherCardsInCol = cardsInCol.filter(
              (c) => c.dataset.sessionCardId !== session.id,
            );
            if (target.index < otherCardsInCol.length) {
              const refCard = otherCardsInCol[target.index];
              const r = refCard.getBoundingClientRect();
              const shift = Number(refCard.dataset.shiftY || 0);
              targetLeft = r.left;
              targetTop = r.top - shift;
            } else if (otherCardsInCol.length > 0) {
              const lastCard = otherCardsInCol[otherCardsInCol.length - 1];
              const r = lastCard.getBoundingClientRect();
              const shift = Number(lastCard.dataset.shiftY || 0);
              targetLeft = r.left;
              targetTop = r.top - shift + r.height + 6;
            } else {
              const listEl = targetCol.querySelector<HTMLElement>('[data-day-sessions-list]');
              if (listEl) {
                const r = listEl.getBoundingClientRect();
                targetLeft = r.left;
                targetTop = r.top;
              }
            }
          }
        }

        const apply = () => {
          skipNextFlipRef.current = true;
          flushSync(() => {
            setSuppressShiftTransition(true);
            clearDragState();
            if (!noop) void move(session.id, target.dayKey, target.index);
          });
          requestAnimationFrame(() => {
            setSuppressShiftTransition(false);
          });
        };
        animateGhostTo(targetLeft - d.left, targetTop - d.top, true, apply);
        return;
      }

      // Cancelado ou fora de qualquer coluna: volta para o lugar original
      flushSync(() => clearDragState());
      const back = board()?.querySelector<HTMLElement>(`[data-session-card-id="${CSS.escape(session.id)}"]`);
      if (back) {
        const r = back.getBoundingClientRect();
        animateGhostTo(r.left - d.left, r.top - d.top, true, () => undefined);
      } else {
        d.ghost?.remove();
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return;
      d.lastX = ev.clientX;
      d.lastY = ev.clientY;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 5) return;
        startDrag();
      }
      ev.preventDefault();
      moveGhost();
      updateTarget();
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return;
      finishDrag(false);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return;
      finishDrag(true);
    };

    cancelDragRef.current = () => finishDrag(true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // Alternativa por teclado: Alt + setas move a sessão (↑↓ reordena no dia, ←→ muda de dia)
  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, session: StudySession) => {
    if (!e.altKey || e.target !== e.currentTarget) return;
    const dayList = activeSessions.filter((s) => s.date === session.date).sort(compareSessionsInDay);
    const idx = dayList.findIndex((s) => s.id === session.id);
    let handled = true;
    if (e.key === 'ArrowUp' && idx > 0) void commitMove(session.id, session.date, idx - 1);
    else if (e.key === 'ArrowDown' && idx < dayList.length - 1) void commitMove(session.id, session.date, idx + 1);
    else if (e.key === 'ArrowLeft' && session.date > weekStart) void commitMove(session.id, addDays(session.date, -1));
    else if (e.key === 'ArrowRight' && session.date < weekEnd) void commitMove(session.id, addDays(session.date, 1));
    else handled = e.key.startsWith('Arrow');
    if (handled) e.preventDefault();
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
                    data-week-index={isSelected ? undefined : wp.weekIndex}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-[transform,background-color,color,box-shadow] duration-150 shrink-0',
                      isWeekDropTarget &&
                        'ring-2 ring-primary bg-primary-soft/60 text-primary scale-105 border-dashed border-primary shadow-sm',
                      isSelected
                        ? 'bg-primary text-primary-fg shadow-xs font-semibold'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                      isCur && !isSelected && 'ring-1 ring-primary/40'
                    )}
                    title={
                      draggedSessionId
                        ? `Solte para mover para a Semana ${wp.weekIndex} (mesmo dia da semana) ou segure para abrir a semana`
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

          <div ref={boardRef} className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((dayKey) => {
              const daySessions = weekSessions.filter((s) => s.date === dayKey);
              const isToday = dayKey === today;
              const totalDayPlanned = daySessions.reduce((sum, s) => sum + s.plannedMinutes, 0);

              const isHoveredDay = dropTarget?.dayKey === dayKey && Boolean(draggedSession);
              const isCrossDayHover = isHoveredDay && draggedSession?.date !== dayKey;
              const isActiveDropColumn = isHoveredDay;
              const projectedDayMinutes = isCrossDayHover
                ? totalDayPlanned + (draggedSession?.plannedMinutes ?? 0)
                : totalDayPlanned;

              const step = (dragHeight || 76) + 6;
              const isSourceDay = draggedSession?.date === dayKey;
              const sourceIdxInDay = isSourceDay
                ? daySessions.findIndex((s) => s.id === draggedSessionId)
                : -1;

              return (
                <div
                  key={dayKey}
                  data-testid={`day-column-${dayKey}`}
                  data-day-column={dayKey}
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
                    <div
                      data-day-sessions-list
                      style={{
                        paddingBottom: isCrossDayHover ? `${step}px` : '0px',
                        transition: suppressShiftTransition
                          ? 'none'
                          : 'padding-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                      className="mt-2 flex flex-col gap-1.5"
                    >
                      {daySessions.map((s, idx) => {
                        const d = discMap.get(s.disciplineId);
                        const isSimulado = s.disciplineId === 'simulado';
                        const isOverdue = s.status === 'planejada' && s.date < today;
                        const isLost = s.status === 'perdida';
                        const canRecover = isOverdue || isLost;
                        const isDragging = draggedSessionId === s.id;

                        let shiftY = 0;
                        if (draggedSession && !isDragging) {
                          if (isSourceDay && sourceIdxInDay !== -1) {
                            if (isHoveredDay && dropTarget) {
                              const targetIdx = dropTarget.index;
                              if (targetIdx > sourceIdxInDay && idx > sourceIdxInDay && idx <= targetIdx) {
                                shiftY = -step;
                              } else if (targetIdx < sourceIdxInDay && idx >= targetIdx && idx < sourceIdxInDay) {
                                shiftY = step;
                              }
                            } else if (dropTarget && dropTarget.dayKey !== dayKey) {
                              if (idx > sourceIdxInDay) {
                                shiftY = -step;
                              }
                            }
                          } else if (isHoveredDay && dropTarget) {
                            if (idx >= dropTarget.index) {
                              shiftY = step;
                            }
                          }
                        }

                        return (
                          <div
                            key={s.id}
                            data-session-card-id={s.id}
                            data-dragging={isDragging ? '' : undefined}
                            data-shift-y={shiftY}
                            tabIndex={0}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={(e) => handleCardPointerDown(e, s)}
                            onKeyDown={(e) => handleCardKeyDown(e, s)}
                            title="Arraste para mover (dia, posição ou aba de semana) — ou use Alt + setas"
                            style={{
                              touchAction: 'pan-y',
                              transform: shiftY ? `translate3d(0, ${shiftY}px, 0)` : 'translate3d(0, 0, 0)',
                              transition: suppressShiftTransition
                                ? 'none'
                                : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease',
                            }}
                            className={cn(
                              'group rounded-lg border p-2 text-xs space-y-1 cursor-grab select-none will-change-transform focus-visible:outline-2 focus-visible:outline-primary',
                              isDragging && 'opacity-0 pointer-events-none',
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
                                className="flex items-center justify-between gap-1"
                              >
                                <span className="font-semibold flex items-center gap-1.5 truncate">
                                  <span
                                    data-drag-handle
                                    style={{ touchAction: 'none' }}
                                    className="-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-subtle group-hover:text-primary transition-colors"
                                  >
                                    <GripVertical className="size-3.5" aria-hidden />
                                  </span>
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
                                <p className="text-[11px] text-fg-muted truncate">
                                  {s.objective}
                                </p>
                              )}

                              <div
                                className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]"
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
                        );
                      })}
                    </div>
                  </div>

                  {daySessions.length === 0 && !isHoveredDay && (
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
