import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  BookOpen,
  Calendar,
  Plus,
  ArrowRight,
  TrendingUp,
  Check,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
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
} from '../hooks/useData';
import {
  weekScheduleMetrics,
  sumQuestions,
  studyStreak,
  topicProgress,
  nextPlannedSession,
  reviewBuckets,
  supersededSessionIds,
} from '../domain/metrics';
import { formatMinutes, formatPercent, formatInteger } from '../lib/format';
import { startOfWeek, endOfWeek, formatDate } from '../lib/dates';
import { startPlannedTimer } from '../services/timer';
import { completeReview, resolveReviewDisplayTitle } from '../services/performance';
import { errorMessage } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';

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

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();

  const errorNoteMap = useMemo(() => new Map(errorNotes.map((e) => [e.id, e])), [errorNotes]);

  const weeklyGoal = settings?.weeklyGoalMinutes ?? 840;

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
  const nextSession = useMemo(() => nextPlannedSession(sessions), [sessions]);
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
    () => [...revBuckets.overdue, ...revBuckets.today].slice(0, 4),
    [revBuckets.overdue, revBuckets.today],
  );
  const totalUrgentReviews = revBuckets.overdue.length + revBuckets.today.length;

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

  const handleCompleteUrgentReview = async (reviewId: string) => {
    setActionError(null);
    try {
      await completeReview(reviewId);
      setActionSuccess('Revisão concluída.');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão Geral"
        description={
          settings?.contestName
            ? `Painel diário de execução para ${settings.contestName}${settings.contestRole ? ` (${settings.contestRole})` : ''}.`
            : 'Painel diário de execução — identifique sua próxima tarefa e avance no cronograma.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setSessionModalOpen(true)}
            >
              Planejar Sessão
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCircle className="size-4" aria-hidden="true" />}
              onClick={() => setQuestionModalOpen(true)}
            >
              Lançar Questões
            </Button>
          </div>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
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
        nextPlanned={nextSession}
        onStartBlock={handleStartBlock}
        onStudyNow={() => navigate('/estudar-agora')}
        onOpenSettings={() => navigate('/configuracoes')}
      />

      {/* Prioridades #4 e #5: Revisões realmente pendentes e Pendências importantes do cronograma */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Revisões realmente pendentes (vencidas + hoje) */}
        <Card
          title="Revisões Pendentes"
          description={
            totalUrgentReviews > 0
              ? `${totalUrgentReviews} revisão(ões) exigem atenção hoje`
              : 'Ciclo de retenção em dia — nenhuma revisão vencida ou prevista para hoje'
          }
          actions={
            <button
              type="button"
              onClick={() => navigate('/revisoes')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver todas <ArrowRight className="size-3" aria-hidden="true" />
            </button>
          }
        >
          {urgentReviews.length > 0 ? (
            <ul className="divide-y divide-border">
              {urgentReviews.map((rev) => {
                const disc = discMap.get(rev.disciplineId);
                const linkedNote = rev.errorNoteId ? errorNoteMap.get(rev.errorNoteId) : undefined;
                const displayTitle = resolveReviewDisplayTitle(rev, linkedNote);
                const isOverdue = rev.dueDate < today;
                return (
                  <li key={rev.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        {disc && <DisciplineDot color={disc.color} />}
                        <span className="font-medium text-fg-muted truncate">{disc?.name ?? 'Disciplina'}</span>
                        <Badge tone={isOverdue ? 'danger' : 'warning'}>
                          {isOverdue ? 'Vencida' : 'Para hoje'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-fg">{displayTitle}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      icon={<Check className="size-3.5 text-success" aria-hidden="true" />}
                      onClick={() => void handleCompleteUrgentReview(rev.id)}
                    >
                      Concluir
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-surface-muted/50 px-3.5 py-3 text-sm">
              <span className="flex items-center gap-2 text-fg-muted">
                <CheckCircle className="size-4 text-success shrink-0" aria-hidden="true" />
                Nenhuma revisão pendente para hoje.
              </span>
              {revBuckets.upcoming.length > 0 && (
                <span className="text-xs text-fg-subtle tabular-nums">
                  {revBuckets.upcoming.length} próxima(s) agendada(s)
                </span>
              )}
            </div>
          )}
        </Card>

        {/* Pendências importantes do cronograma */}
        <Card
          title="Pendências do Cronograma"
          description={
            overdueSessionsInWeek.length > 0
              ? `${overdueSessionsInWeek.length} bloco(s) de dias anteriores aguardam execução nesta semana`
              : 'Cronograma da semana sem blocos atrasados'
          }
          actions={
            <button
              type="button"
              onClick={() => navigate('/cronograma')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Abrir cronograma <ArrowRight className="size-3" aria-hidden="true" />
            </button>
          }
        >
          {overdueSessionsInWeek.length > 0 ? (
            <ul className="divide-y divide-border">
              {overdueSessionsInWeek.slice(0, 3).map((s) => {
                const disc = discMap.get(s.disciplineId);
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        {disc && <DisciplineDot color={disc.color} />}
                        <span className="font-semibold text-fg truncate">
                          {disc?.name ?? (s.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão')}
                        </span>
                        <span className="text-warning font-medium tabular-nums">
                          {formatDate(s.date)} · {s.plannedMinutes} min
                        </span>
                      </div>
                      {s.objective && (
                        <p className="mt-0.5 truncate text-xs text-fg-muted">{s.objective}</p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleStartBlock(s.id)}
                    >
                      Iniciar
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-surface-muted/50 px-3.5 py-3 text-sm">
              <span className="flex items-center gap-2 text-fg-muted">
                <Calendar className="size-4 text-primary shrink-0" aria-hidden="true" />
                {currentWeekMetrics.totalSessions > 0
                  ? `${currentWeekMetrics.completedSessions} de ${currentWeekMetrics.totalSessions} blocos da semana concluídos.`
                  : 'Nenhuma sessão planejada para esta semana.'}
              </span>
              <button
                type="button"
                onClick={() => navigate('/calendario')}
                className="text-xs font-medium text-fg-muted hover:text-fg"
              >
                Ver agenda
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* Resumo enxuto de ritmo e progresso (Informações Progressivas — sem gráficos pesados no painel de execução) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Ritmo na semana"
          value={formatMinutes(weekDoneMinutes)}
          hint={`Meta: ${formatMinutes(weeklyGoal)} · Planejado: ${formatMinutes(weekPlannedMinutes)}`}
          icon={<Clock className="size-4" />}
        >
          <ProgressBar
            value={weekDoneMinutes}
            max={weeklyGoal}
            label="Tempo estudado na semana em relação à meta semanal"
            tone={weekDoneMinutes >= weeklyGoal ? 'success' : 'primary'}
            showOverflow
          />
        </StatCard>

        <StatCard
          label="Precisão em questões"
          value={formatPercent(questionTotals.accuracy)}
          hint={`${formatInteger(questionTotals.correct)} acertos em ${formatInteger(questionTotals.total)} resolvidas`}
          icon={<TrendingUp className="size-4" />}
        >
          <div className="flex items-center justify-between text-xs text-fg-subtle">
            <span>Meta: {settings?.accuracyGoal ?? 80}%</span>
            <button
              type="button"
              onClick={() => navigate('/relatorios')}
              className="font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              <BarChart3 className="size-3" aria-hidden="true" />
              Ver gráficos
            </button>
          </div>
        </StatCard>

        <StatCard
          label="Cobertura do edital"
          value={formatPercent(topicsProg.percent)}
          hint={`${topicsProg.completed} de ${topicsProg.total} tópicos concluídos`}
          icon={<BookOpen className="size-4" />}
        >
          <ProgressBar
            value={topicsProg.completed}
            max={topicsProg.total || 1}
            label="Progresso geral de tópicos"
            tone="success"
          />
        </StatCard>
      </div>

      {/* Gamificação em expansão progressiva para não competir com a execução do dia */}
      <details className="group rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-fg-muted hover:text-fg select-none">
          <span className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" aria-hidden="true" />
            <span>Patente, constância e regras de XP</span>
          </span>
          <span className="text-xs text-fg-subtle group-open:hidden">Expandir</span>
          <span className="text-xs text-fg-subtle hidden group-open:inline">Recolher</span>
        </summary>
        <div className="border-t border-border p-4">
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
