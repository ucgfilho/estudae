import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Plus,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { TOPIC_PROGRESS_REPORTS } from '../components/reports/topicProgressReports';
import {
  Card,
  PageHeader,
  StatCard,
  ProgressBar,
  Badge,
  DisciplineDot,
  Alert,
} from '../components/ui/Display';
import { SessionModal } from '../components/modals/SessionModal';
import { QuestionModal } from '../components/modals/QuestionModal';
import { ErrorNoteModal } from '../components/modals/ErrorNoteModal';
import { DailyMissionCard } from '../components/motivation/DailyMissionCard';
import { RankCard } from '../components/motivation/RankCard';
import {
  useDisciplines,
  useTopics,
  useSessions,
  useQuestionLogs,
  useReviews,
  useErrorNotes,
  useSettings,
  useToday,
  useActiveTimer,
} from '../hooks/useData';
import {
  weekScheduleMetrics,
  sumQuestions,
  studyStreak,
  topicProgress,
  reviewBuckets,
  supersededSessionIds,
} from '../domain/metrics';
import { formatMinutes, formatPercent, formatInteger } from '../lib/format';
import { startOfWeek, endOfWeek, formatDate } from '../lib/dates';
import { startCycleTimer, startPlannedTimer } from '../services/timer';
import { resolveReviewDisplayTitle } from '../services/performance';
import { errorMessage } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';

const reportActionClass = 'flex w-fit min-h-9 items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 max-lg:px-2';

function TopicProgressLink({ metric }: { metric: keyof typeof TOPIC_PROGRESS_REPORTS }) {
  const { id, label } = TOPIC_PROGRESS_REPORTS[metric];
  const actionLabel = 'Acompanhar evolução';
  return (
    <Link
      to={`/relatorios#${id}`}
      aria-label={`${actionLabel} — ${label}`}
      className={`ms-auto ${reportActionClass}`}
    >
      <BarChart3 className="size-3" aria-hidden="true" />
      {actionLabel}
    </Link>
  );
}

export function OverviewScreen() {
  const navigate = useNavigate();
  const today = useToday();

  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const questionLogs = useQuestionLogs();
  const reviews = useReviews();
  const errorNotes = useErrorNotes();
  const settings = useSettings();
  const timer = useActiveTimer();
  const [startingCycle, setStartingCycle] = useState(false);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();

  const errorNoteMap = useMemo(() => new Map(errorNotes.map((e) => [e.id, e])), [errorNotes]);

  const weeklyGoal = settings?.weeklyGoalMinutes ?? 840;
  const weeklyGoalEnabled = weeklyGoal > 0;

  // Limites da semana atual
  const currentWeekStart = useMemo(() => startOfWeek(today), [today]);
  const currentWeekEnd = useMemo(() => endOfWeek(today), [today]);

  // Métricas essenciais de execução
  const currentWeekMetrics = useMemo(
    () => weekScheduleMetrics(sessions, currentWeekStart, currentWeekEnd),
    [sessions, currentWeekStart, currentWeekEnd],
  );
  const weekDoneMinutes = currentWeekMetrics.doneMinutes;
  const weekPlannedMinutes = currentWeekMetrics.plannedMinutes;

  const questionTotals = useMemo(() => sumQuestions(questionLogs), [questionLogs]);
  const streak = useMemo(() => studyStreak(sessions, today), [sessions, today]);
  const topicsProg = useMemo(() => topicProgress(topics), [topics]);
  const approached = topicsProg.completed + topicsProg.inProgress;
  const revBuckets = useMemo(() => reviewBuckets(reviews, today), [reviews, today]);

  const superseded = useMemo(() => supersededSessionIds(sessions), [sessions]);
  const overdueSessionsInWeek = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.status === 'planejada' &&
          !superseded.has(s.id) &&
          s.date >= currentWeekStart &&
          s.date < today,
      ),
    [sessions, superseded, currentWeekStart, today],
  );

  const urgentReviews = useMemo(
    () => [...revBuckets.overdue, ...revBuckets.today],
    [revBuckets.overdue, revBuckets.today],
  );
  const totalUrgentReviews = urgentReviews.length;

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  const handleStartBlock = async (sessionId: string) => {
    setActionError(null);
    try {
      await startPlannedTimer(sessionId);
      navigate('/estudar-agora');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleStartCycle = async () => {
    setActionError(null);
    setStartingCycle(true);
    try {
      await startCycleTimer();
      navigate('/estudar-agora');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setStartingCycle(false);
    }
  };

  return (
    <div className="page-stack @container">
      <PageHeader
        title="Visão geral"
        description={
          settings?.contestName
            ? `Acompanhe sua rotina diária para ${settings.contestName}${settings.contestRole ? ` (${settings.contestRole})` : ''}.`
            : 'Veja sua próxima tarefa, acompanhe a meta de hoje e avance no ciclo de estudos.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setSessionModalOpen(true)}
            >
              Planejar sessão
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCircle className="size-4" aria-hidden="true" />}
              onClick={() => setQuestionModalOpen(true)}
            >
              Registrar questões
            </Button>
          </div>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Não foi possível concluir a ação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Prioridades #1, #2 e #3: Próxima Tarefa, Meta Diária e Tempo Estudado Hoje */}
      <DailyMissionCard
        sessions={sessions}
        logs={questionLogs}
        settings={settings}
        disciplines={disciplines}
        today={today}
        streak={streak}
        topics={topics}
        timer={timer}
        starting={startingCycle}
        onStartCycle={() => void handleStartCycle()}
        onOpenCycle={() => navigate('/cronograma')}
        onConfigureDisciplines={() => navigate('/disciplinas')}
        onStudyNow={() => navigate('/estudar-agora')}
        onOpenSettings={() => navigate('/configuracoes')}
      />

      {/* Prioridades #4 e #5: Revisões realmente pendentes e Pendências importantes do calendário */}
      <div className="grid gap-5 @min-[48rem]:grid-cols-2 @min-[48rem]:gap-y-0">
        {/* Revisões realmente pendentes (vencidas + hoje) */}
        <Card
          className="@min-[48rem]:row-span-2 @min-[48rem]:grid @min-[48rem]:grid-rows-subgrid"
          title="Revisões pendentes"
          description={
            totalUrgentReviews > 0
              ? totalUrgentReviews === 1
                ? '1 revisão pendente para manter o conteúdo em dia.'
                : `${totalUrgentReviews} revisões pendentes para manter o conteúdo em dia.`
              : 'Nenhuma revisão atrasada ou prevista para hoje.'
          }
          actions={
            <button
              type="button"
              onClick={() => navigate('/revisoes')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline max-lg:min-h-9 max-lg:px-2"
            >
              Ir para revisões <ArrowRight className="size-3" aria-hidden="true" />
            </button>
          }
        >
          {urgentReviews.length > 0 ? (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-3">
              {urgentReviews.map((rev) => {
                const disc = discMap.get(rev.disciplineId);
                const linkedNote = rev.errorNoteId ? errorNoteMap.get(rev.errorNoteId) : undefined;
                const displayTitle = resolveReviewDisplayTitle(rev, linkedNote);
                const isOverdue = rev.dueDate < today;
                const openReviewNote = () => {
                  const targetNote =
                    linkedNote ??
                    errorNotes.find(
                      (n) =>
                        n.disciplineId === rev.disciplineId &&
                        n.sourceReference &&
                        rev.title.toLowerCase().includes(n.sourceReference.toLowerCase())
                    );
                  if (targetNote) {
                    navigate(`/erros?noteId=${encodeURIComponent(targetNote.id)}`);
                  } else {
                    const query = rev.title.replace(/^Erro:\s*/i, '').trim();
                    navigate(
                      `/erros?disciplineId=${encodeURIComponent(rev.disciplineId)}&q=${encodeURIComponent(query)}`
                    );
                  }
                };
                return (
                  <li key={rev.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-lg bg-surface-muted px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {disc && <DisciplineDot color={disc.color} />}
                        <span className="font-medium text-fg-muted wrap-anywhere">{disc?.name ?? 'Disciplina'}</span>
                        <Badge tone={isOverdue ? 'danger' : 'warning'}>
                          {isOverdue ? 'Vencida' : 'Para hoje'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 wrap-anywhere text-sm font-medium text-fg">{displayTitle}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0 max-sm:self-end text-primary"
                      onClick={openReviewNote}
                    >
                      Ver revisão
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="control-height-lg flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-3.5 py-3 text-sm">
              <span className="flex items-center gap-2 text-fg-muted">
                <CheckCircle className="size-4 text-success shrink-0" aria-hidden="true" />
                Nenhuma revisão pendente para hoje.
              </span>
              {revBuckets.upcoming.length > 0 && (
                <span className="text-xs text-fg-subtle tabular-nums">
                  {revBuckets.upcoming.length === 1
                    ? '1 próxima agendada'
                    : `${revBuckets.upcoming.length} próximas agendadas`}
                </span>
              )}
            </div>
          )}
        </Card>

        {/* Pendências importantes do calendário */}
        <Card
          className="@min-[48rem]:row-span-2 @min-[48rem]:grid @min-[48rem]:grid-rows-subgrid"
          title="Sessões planejadas no calendário"
          description={
            overdueSessionsInWeek.length > 0
              ? overdueSessionsInWeek.length === 1
                ? '1 sessão de dias anteriores aguarda conclusão.'
                : `${overdueSessionsInWeek.length} sessões de dias anteriores aguardam conclusão.`
              : 'Nenhuma sessão atrasada nesta semana.'
          }
          actions={
            <button
              type="button"
              onClick={() => navigate('/calendario')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline max-lg:min-h-9 max-lg:px-2"
            >
              Abrir calendário <ArrowRight className="size-3" aria-hidden="true" />
            </button>
          }
        >
          {overdueSessionsInWeek.length > 0 ? (
            <ul className="space-y-2">
              {overdueSessionsInWeek.slice(0, 3).map((s) => {
                const disc = discMap.get(s.disciplineId);
                return (
                  <li key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-lg bg-surface-muted px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {disc && <DisciplineDot color={disc.color} />}
                        <span className="font-semibold text-fg wrap-anywhere">
                          {disc?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão')}
                        </span>
                        <span className="text-warning font-medium tabular-nums">
                          {formatDate(s.date)} · {s.plannedMinutes} min
                        </span>
                      </div>
                      {s.objective && (
                        <p className="mt-0.5 wrap-anywhere text-xs text-fg-muted">{s.objective}</p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="max-sm:self-end"
                      onClick={() => void handleStartBlock(s.id)}
                    >
                      Iniciar
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="control-height-lg flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-3.5 py-3 text-sm">
              <span className="flex items-center gap-2 text-fg-muted">
                <Calendar className="size-4 text-primary shrink-0" aria-hidden="true" />
                {currentWeekMetrics.totalSessions > 0
                  ? `${currentWeekMetrics.completedSessions} de ${currentWeekMetrics.totalSessions} blocos da semana concluídos.`
                  : 'Nenhuma sessão planejada para esta semana.'}
              </span>
              <button
                type="button"
                onClick={() => navigate('/calendario')}
                className="shrink-0 text-xs font-medium text-fg-muted hover:text-fg max-lg:py-2"
              >
                Ver agenda
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* Resumo enxuto de ritmo e progresso (Informações Progressivas — sem gráficos pesados no painel de execução) */}
      <div className="stats-grid">
        {weeklyGoalEnabled && <StatCard
          label="Ritmo na semana"
          value={formatMinutes(weekDoneMinutes)}
          hint={`Meta: ${formatMinutes(weeklyGoal)} · Planejado: ${formatMinutes(weekPlannedMinutes)}`}
          icon={<Clock className="size-4" />}
          alignRows
        >
          <ProgressBar
            value={weekDoneMinutes}
            max={weeklyGoal}
            label="Tempo estudado na semana em relação à meta semanal"
            tone={weekDoneMinutes >= weeklyGoal ? 'success' : 'primary'}
            showOverflow
          />
        </StatCard>}

        <StatCard
          label="Taxa de acerto"
          value={formatPercent(questionTotals.accuracy)}
          hint={`${formatInteger(questionTotals.correct)} acertos em ${formatInteger(questionTotals.total)} resolvidas`}
          icon={<TrendingUp className="size-4" />}
          alignRows
          footer={
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
              <span>Meta: {settings?.accuracyGoal ?? 80}%</span>
              <button
                type="button"
                onClick={() => navigate('/relatorios')}
                className={`ms-auto ${reportActionClass}`}
              >
                <BarChart3 className="size-3" aria-hidden="true" />
                Acompanhar evolução
              </button>
            </div>
          }
        />

        <StatCard
          label="Cobertura do edital"
          value={formatPercent(topicsProg.percent)}
          hint={<span title="Tópicos concluídos ou dominados">{topicsProg.completed} de {topicsProg.total} tópicos</span>}
          icon={<BookOpenCheck className="size-4" />}
          alignRows
          footer={<TopicProgressLink metric="coverage" />}
        >
          <ProgressBar value={topicsProg.completed} max={topicsProg.total || 1} label="Cobertura do edital" tone="success" />
        </StatCard>
        <StatCard
          label="Tópicos em abordagem"
          value={formatPercent(topicsProg.approachedPercent)}
          hint={<span title="Tópicos em andamento, concluídos ou dominados">{approached} de {topicsProg.total} tópicos</span>}
          icon={<BookOpen className="size-4" />}
          alignRows
          footer={<TopicProgressLink metric="approached" />}
        >
          <ProgressBar value={approached} max={topicsProg.total || 1} label="Tópicos em abordagem" tone="success" />
        </StatCard>
      </div>

      {/* Gamificação em expansão progressiva para não competir com a execução do dia */}
      <details className="group rounded-xl bg-surface">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-fg-muted hover:text-fg select-none">
          <span className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" aria-hidden="true" />
            <span>Patente, constância e regras de XP</span>
          </span>
          <span className="text-xs text-fg-subtle group-open:hidden">Expandir</span>
          <span className="text-xs text-fg-subtle hidden group-open:inline">Recolher</span>
        </summary>
        <div className="p-4">
          <RankCard sessions={sessions} reviews={reviews} settings={settings} today={today} />
        </div>
      </details>

      {/* Modals */}
      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        defaultDate={today}
        onSaved={() => setActionSuccess('Sessão planejada.')}
      />
      <QuestionModal
        open={questionModalOpen}
        onClose={() => setQuestionModalOpen(false)}
        defaultDate={today}
        onSaved={() => setActionSuccess('Questões registradas.')}
      />
      <ErrorNoteModal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        defaultDate={today}
        onSaved={() => setActionSuccess('Anotação de erro salva.')}
      />
    </div>
  );
}
