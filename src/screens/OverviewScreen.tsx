import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import {
  Clock,
  CheckCircle,
  BookOpen,
  Calendar,
  AlertCircle,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, StatCard, ProgressBar, EmptyState, Badge, DisciplineDot, Alert } from '../components/ui/Display';
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
  useSettings,
  useToday,
} from '../hooks/useData';
import {
  studiedMinutesInRange,
  weekScheduleMetrics,
  sumQuestions,
  studyStreak,
  topicProgress,
  nextPlannedSession,
  reviewBuckets,
  accuracyByDiscipline,
  studyTimeSeries,
  accuracySeries,
} from '../domain/metrics';
import { formatMinutes, formatPercent, formatInteger } from '../lib/format';
import { startOfWeek, endOfWeek, addDays, formatDate } from '../lib/dates';
import { startPlannedTimer } from '../services/timer';
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
  const settings = useSettings();

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();


  const dailyGoal = settings?.dailyGoalMinutes ?? 120;
  const weeklyGoal = settings?.weeklyGoalMinutes ?? 840;

  // Week bounds
  const currentWeekStart = useMemo(() => startOfWeek(today), [today]);
  const currentWeekEnd = useMemo(() => endOfWeek(today), [today]);

  // Metrics
  const todayDoneMinutes = useMemo(
    () => studiedMinutesInRange(sessions, today, today),
    [sessions, today]
  );
  const currentWeekMetrics = useMemo(
    () => weekScheduleMetrics(sessions, currentWeekStart, currentWeekEnd),
    [sessions, currentWeekStart, currentWeekEnd]
  );
  const weekDoneMinutes = currentWeekMetrics.doneMinutes;
  const weekPlannedMinutes = currentWeekMetrics.plannedMinutes;

  const questionTotals = useMemo(() => sumQuestions(questionLogs), [questionLogs]);
  const streak = useMemo(() => studyStreak(sessions, today), [sessions, today]);
  const topicsProg = useMemo(() => topicProgress(topics), [topics]);
  const nextSession = useMemo(() => nextPlannedSession(sessions), [sessions]);
  const revBuckets = useMemo(() => reviewBuckets(reviews, today), [reviews, today]);

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const nextSessionDiscipline = nextSession
    ? (discMap.get(nextSession.disciplineId) ??
      (nextSession.disciplineId === 'simulado'
        ? { id: 'simulado', name: 'Simulado Geral BNB', color: '#A6193C', active: true, order: 99, kind: 'technical' as const }
        : null))
    : null;

  // Chart data: 14 days time series
  const last14DaysStart = useMemo(() => addDays(today, -13), [today]);
  const studyChartData = useMemo(
    () => studyTimeSeries(sessions, last14DaysStart, today, 'day'),
    [sessions, last14DaysStart, today]
  );

  // Chart data: accuracy by discipline
  const discAccData = useMemo(
    () =>
      accuracyByDiscipline(questionLogs, disciplines).map((d) => ({
        name: d.name,
        fullName: d.name,
        accuracy: d.accuracy ?? 0,
        hasQuestions: d.accuracy !== null,
        total: d.total,
        color: d.color,
      })),
    [questionLogs, disciplines]
  );

  // Chart data: accuracy evolution
  const accuracyEvolutionData = useMemo(
    () =>
      accuracySeries(questionLogs, last14DaysStart, today, 'day').filter(
        (p) => p.accuracy !== null
      ),
    [questionLogs, last14DaysStart, today]
  );

  const handleStartNextSession = async () => {
    if (!nextSession) return;
    await handleStartBlock(nextSession.id);
  };

  const handleStartBlock = async (sessionId: string) => {
    setActionError(null);
    try {
      await startPlannedTimer(sessionId);
      navigate('/estudar-agora');
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
            ? `Acompanhamento do seu desempenho para ${settings.contestName}${settings.contestRole ? ` (${settings.contestRole})` : ''}.`
            : 'Acompanhamento do seu desempenho para o concurso do BNB (Analista de Sistemas — Desenvolvimento).'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => setSessionModalOpen(true)}
            >
              Planejar Sessão
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCircle className="size-4" />}
              onClick={() => setQuestionModalOpen(true)}
            >
              Lançar Questões
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Clock className="size-4" />}
              onClick={() => navigate('/estudar-agora')}
            >
              Estudar Agora
            </Button>
          </div>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Daily mission: goal-gradient + today's checklist + next step */}
      <DailyMissionCard
        sessions={sessions}
        logs={questionLogs}
        settings={settings}
        disciplines={disciplines}
        today={today}
        streak={streak}
        onStartBlock={handleStartBlock}
        onStudyNow={() => navigate('/estudar-agora')}
        onOpenSettings={() => navigate('/configuracoes')}
      />

      <RankCard sessions={sessions} reviews={reviews} settings={settings} today={today} />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Metric 1: Today study time */}
        <StatCard
          label="Tempo Hoje"
          value={formatMinutes(todayDoneMinutes)}
          hint={`Meta diária: ${formatMinutes(dailyGoal)}`}
          icon={<Clock className="size-4" />}
        >
          <ProgressBar
            value={todayDoneMinutes}
            max={dailyGoal}
            label="Tempo estudado hoje em relação à meta diária"
            tone={todayDoneMinutes >= dailyGoal ? 'success' : 'primary'}
            showOverflow
          />
        </StatCard>

        {/* Metric 2: Week study time */}
        <StatCard
          label="Tempo na Semana"
          value={formatMinutes(weekDoneMinutes)}
          hint={`Meta: ${formatMinutes(weeklyGoal)} • Planejado: ${formatMinutes(weekPlannedMinutes)}`}
          icon={<Calendar className="size-4" />}
        >
          <ProgressBar
            value={weekDoneMinutes}
            max={weeklyGoal}
            label="Tempo estudado na semana em relação à meta semanal"
            tone={weekDoneMinutes >= weeklyGoal ? 'success' : 'primary'}
            showOverflow
          />
        </StatCard>

        {/* Metric 3: Question accuracy */}
        <StatCard
          label="Desempenho em Questões"
          value={formatPercent(questionTotals.accuracy)}
          hint={`${formatInteger(questionTotals.correct)} acertos / ${formatInteger(questionTotals.incorrect)} erros (${formatInteger(questionTotals.total)} total)`}
          icon={<TrendingUp className="size-4" />}
        >
          <div className="text-xs text-fg-subtle">
            Meta operacional: {settings?.accuracyGoal ?? 80}%
          </div>
        </StatCard>
      </div>

      {/* Next Planned Session Banner */}
      <Card
        title="Próxima Sessão Planejada"
        description="Foco recomendado para o seu próximo bloco de estudo"
        actions={
          nextSession && (
            <Button
              variant="primary"
              size="sm"
              icon={<Clock className="size-4" />}
              onClick={handleStartNextSession}
            >
              Iniciar Esta Sessão
            </Button>
          )
        }
      >
        {nextSession ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {nextSessionDiscipline && (
                  <DisciplineDot color={nextSessionDiscipline.color} />
                )}
                <span className="font-semibold text-fg">
                  {nextSessionDiscipline?.name ?? 'Disciplina'}
                </span>
                <Badge tone="primary">{nextSession.plannedMinutes} min</Badge>
                {nextSession.plannedStart && (
                  <Badge tone="neutral">às {nextSession.plannedStart}</Badge>
                )}
                <Badge tone="neutral">{formatDate(nextSession.date)}</Badge>
              </div>
              <p className="text-sm text-fg-muted">
                {nextSession.objective || 'Nenhum objetivo específico registrado para esta sessão.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/calendario')}
              >
                Ver no Calendário
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Calendar className="size-6" />}
            title="Nenhuma sessão futura planejada"
            description="Organize seus blocos no calendário ou gere o cronograma de 24 semanas para manter a consistência."
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => setSessionModalOpen(true)}
              >
                Planejar uma Sessão
              </Button>
            }
          />
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 1: Study time (last 14 days) */}
        <Card
          title="Tempo de Estudo — Últimos 14 Dias"
          description="Comparação entre tempo efetivamente realizado e tempo planejado (minutos)"
        >
          {studyChartData.some((d) => d.studiedMinutes > 0 || d.plannedMinutes > 0) ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} />
                  <YAxis tickLine={false} width={44} />
                  <Tooltip
                    formatter={(value) => [`${value} min`, '']}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Bar
                    dataKey="studiedMinutes"
                    name="Realizado"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="plannedMinutes"
                    name="Planejado"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<Clock className="size-6" />}
              title="Sem dados de estudo nos últimos 14 dias"
              description="Quando você concluir sessões no cronômetro ou registrar tempo estudado, o gráfico exibirá seu ritmo aqui."
            />
          )}
        </Card>

        {/* Chart 2: Accuracy by Discipline */}
        <Card
          title="Percentual de Acerto por Disciplina"
          description="Desempenho apurado a partir das questões resolvidas e corrigidas"
        >
          {discAccData.some((d) => d.hasQuestions) ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={discAccData.filter((d) => d.hasQuestions)}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    width={200}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [formatPercent(Number(value)), 'Acerto']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                  />
                  <Bar dataKey="accuracy" name="% Acerto" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="size-6" />}
              title="Nenhuma questão lançada ainda"
              description="Registre suas baterias de questões para visualizar a distribuição de acertos por disciplina."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="size-4" />}
                  onClick={() => setQuestionModalOpen(true)}
                >
                  Lançar Questões
                </Button>
              }
            />
          )}
        </Card>
      </div>

      {/* Secondary Row: Accuracy Evolution & Topic Progress */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Evolution Chart (2 cols) */}
        <Card
          as="section"
          className="lg:col-span-2"
          title="Evolução do Desempenho ao Longo do Tempo"
          description="Percentual de acerto diário nas baterias de questões respondidas"
        >
          {accuracyEvolutionData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accuracyEvolutionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tickLine={false} width={48} />
                  <Tooltip formatter={(value) => [formatPercent(Number(value)), 'Acerto']} />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="% Acerto"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="size-6" />}
              title="Sem histórico de acertos no período recente"
              description="Lançamentos diários de questões construirão a sua curva de evolução."
            />
          )}
        </Card>

        {/* Topic Progress & Pending Reviews (1 col) */}
        <div className="space-y-6">
          <Card
            title="Progresso dos Tópicos"
            description="Status dos conteúdos cadastrados no edital"
            actions={
              <button
                type="button"
                onClick={() => navigate('/disciplinas')}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                Gerenciar <ArrowRight className="size-3" />
              </button>
            }
          >
            {topicsProg.total > 0 ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold tabular-nums text-fg">
                    {formatPercent(topicsProg.percent)}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {topicsProg.completed} de {topicsProg.total} tópicos concluídos
                  </span>
                </div>
                <ProgressBar
                  value={topicsProg.completed}
                  max={topicsProg.total}
                  label="Progresso geral de tópicos"
                  tone="success"
                />
                <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-fg-subtle">
                  <div>• Em andamento: {topicsProg.inProgress}</div>
                  <div>• Dominados: {topicsProg.mastered}</div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<BookOpen className="size-5" />}
                title="Nenhum tópico cadastrado"
                description="Cadastre tópicos ou importe o checklist das disciplinas."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/disciplinas')}
                  >
                    Ir para Conteúdos
                  </Button>
                }
              />
            )}
          </Card>

          <Card
            title="Revisões Espaçadas"
            description="Status do ciclo de retenção da memória"
            actions={
              <button
                type="button"
                onClick={() => navigate('/revisoes')}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                Ver todas <ArrowRight className="size-3" />
              </button>
            }
          >
            <div className="space-y-2 text-sm">
              <button
                type="button"
                onClick={() => navigate('/revisoes')}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-muted/40 hover:bg-surface-muted/80 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-danger font-medium">
                  <AlertCircle className="size-4" /> Vencidas / Atrasadas
                </span>
                <div className="flex items-center gap-1.5 font-bold tabular-nums">
                  <span>{revBuckets.overdue.length}</span>
                  <ArrowRight className="size-3.5 text-fg-subtle" />
                </div>
              </button>
              <button
                type="button"
                onClick={() => navigate('/revisoes')}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-muted/40 hover:bg-surface-muted/80 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-warning font-medium">
                  <Clock className="size-4" /> Para Hoje
                </span>
                <div className="flex items-center gap-1.5 font-bold tabular-nums">
                  <span>{revBuckets.today.length}</span>
                  <ArrowRight className="size-3.5 text-fg-subtle" />
                </div>
              </button>
              <button
                type="button"
                onClick={() => navigate('/revisoes')}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-muted/40 hover:bg-surface-muted/80 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-fg-muted font-medium">
                  <Calendar className="size-4" /> Próximas
                </span>
                <div className="flex items-center gap-1.5 font-bold tabular-nums">
                  <span>{revBuckets.upcoming.length}</span>
                  <ArrowRight className="size-3.5 text-fg-subtle" />
                </div>
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        defaultDate={today}
        onSaved={() => setActionSuccess('Sessão planejada com sucesso!')}
      />
      <QuestionModal
        open={questionModalOpen}
        onClose={() => setQuestionModalOpen(false)}
        defaultDate={today}
        onSaved={() => setActionSuccess('Questões registradas com sucesso!')}
      />
      <ErrorNoteModal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        defaultDate={today}
        onSaved={() => setActionSuccess('Anotação de erro salva com sucesso!')}
      />
    </div>
  );
}
