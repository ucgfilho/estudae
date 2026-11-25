import { useState, useMemo, useRef } from 'react';
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
  Legend,
} from 'recharts';
import {
  Download,
  AlertTriangle,
  Clock,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { updateSettings } from '../services/settings';
import { errorMessage } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, StatCard, Segmented, EmptyState, DisciplineDot, Badge } from '../components/ui/Display';
import {
  useDisciplines,
  useTopics,
  useSessions,
  useQuestionLogs,
  useReviews,
  useSettings,
  useToday,
} from '../hooks/useData';
import { RankCard } from '../components/motivation/RankCard';
import { TopicProgressCharts } from '../components/reports/TopicProgressCharts';
import {
  sumQuestions,
  accuracyByDiscipline,
  worstTopics,
  studyTimeSeries,
  accuracySeries,
  topicProgress,
  topicProgressSeries,
  reviewBuckets,
  type Granularity,
} from '../domain/metrics';
import { formatMinutes, formatPercent, formatInteger, plural } from '../lib/format';
import { addDays, type DateKey } from '../lib/dates';
import { toCsv, downloadFile } from '../services/backup';
import type { Settings } from '../db/types';

type ReportPreferences = Pick<Settings, 'reportTimeGranularity' | 'reportPeriodDays'>;
const CHART_ANIMATION_MS = 250;

export function ReportsScreen() {
  const today = useToday();

  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const questionLogs = useQuestionLogs();
  const reviews = useReviews();
  const settings = useSettings();

  const [pendingPreferences, setPendingPreferences] = useState<ReportPreferences>({});
  const latestSave = useRef<Partial<Record<keyof ReportPreferences, symbol>>>({});
  const timeGranularity: Granularity = pendingPreferences.reportTimeGranularity ?? settings?.reportTimeGranularity ?? 'week';
  const periodDays = pendingPreferences.reportPeriodDays ?? settings?.reportPeriodDays ?? '60';
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  async function saveReportPreference<K extends keyof ReportPreferences>(key: K, value: NonNullable<ReportPreferences[K]>) {
    const request = Symbol();
    latestSave.current[key] = request;
    const patch = { [key]: value };
    setPendingPreferences((pending) => ({ ...pending, ...patch }));
    setPreferenceError(null);
    try {
      await updateSettings(patch);
    } catch (error) {
      if (latestSave.current[key] === request) setPreferenceError(errorMessage(error));
    } finally {
      if (latestSave.current[key] === request) {
        delete latestSave.current[key];
        setPendingPreferences((pending) => {
          const remaining = { ...pending };
          delete remaining[key];
          return remaining;
        });
      }
    }
  }

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  // Date window
  const startDate: DateKey = useMemo(() => {
    if (periodDays === '30') return addDays(today, -30);
    if (periodDays === '60') return addDays(today, -60);
    if (periodDays === '90') return addDays(today, -90);
    return '2024-01-01';
  }, [periodDays, today]);

  // General Totals
  const questionTotals = useMemo(() => sumQuestions(questionLogs), [questionLogs]);
  const topicsProg = useMemo(() => topicProgress(topics), [topics]);
  const history = settings?.topicProgressHistory;
  const topicData = useMemo(
    () => topicProgressSeries(history ?? [], topicsProg, startDate, today, timeGranularity),
    [history, topicsProg, startDate, today, timeGranularity],
  );
  const revBuckets = useMemo(() => reviewBuckets(reviews, today), [reviews, today]);

  // Study time comparison series
  const studyData = useMemo(() => {
    return studyTimeSeries(sessions, startDate, today, timeGranularity);
  }, [sessions, startDate, today, timeGranularity]);

  // Accuracy evolution series
  const accuracyData = useMemo(() => {
    return accuracySeries(questionLogs, startDate, today, timeGranularity).filter(
      (p) => p.accuracy !== null
    );
  }, [questionLogs, startDate, today, timeGranularity]);

  const discAccuracy = useMemo(() => {
    return accuracyByDiscipline(questionLogs, disciplines).sort((a, b) => {
      const accA = a.accuracy ?? -1;
      const accB = b.accuracy ?? -1;
      if (accB !== accA) return accB - accA;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [questionLogs, disciplines]);

  // Worst performing topics
  const worstPerforming = useMemo(() => {
    return worstTopics(questionLogs, topics, 6);
  }, [questionLogs, topics]);

  // CSV Export functions
  const handleExportQuestionsCsv = () => {
    const headers = ['ID', 'Data', 'Disciplina', 'Topico', 'Banca_Fonte', 'Total', 'Acertos', 'Erros', 'Branco', 'TempoMin', 'Observacoes'];
    const rows = questionLogs.map((q) => {
      const d = discMap.get(q.disciplineId)?.name ?? q.disciplineId;
      const t = q.topicId ? topics.find((x) => x.id === q.topicId)?.title ?? '' : '';
      return [q.id, q.date, d, t, q.source, q.total, q.correct, q.incorrect, q.blank, q.durationMinutes ?? '', q.notes];
    });
    const csv = toCsv(headers, rows);
    downloadFile(`questoes_bnb_${today}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const handleExportSessionsCsv = () => {
    const headers = ['ID', 'Data', 'Disciplina', 'Topico', 'Status', 'PlanejadoMin', 'RealizadoSeg', 'Objetivo', 'Observacoes'];
    const rows = sessions.map((s) => {
      const d = discMap.get(s.disciplineId)?.name ?? s.disciplineId;
      const t = s.topicId ? topics.find((x) => x.id === s.topicId)?.title ?? '' : '';
      return [s.id, s.date, d, t, s.status, s.plannedMinutes, s.actualSeconds, s.objective, s.notes];
    });
    const csv = toCsv(headers, rows);
    downloadFile(`sessoes_bnb_${today}.csv`, csv, 'text/csv;charset=utf-8');
  };

  return (
    <div className="page-stack @container">
      <PageHeader
        title="Relatórios"
        description="Acompanhe seu progresso no edital, suas horas de estudo e sua taxa de acerto por matéria."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet className="size-4" />}
              onClick={handleExportSessionsCsv}
            >
              Exportar sessões (CSV)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="size-4" />}
              onClick={handleExportQuestionsCsv}
            >
              Exportar questões (CSV)
            </Button>
          </div>
        }
      />

      {/* Global Summary Statistics */}
      <div className="stats-grid">
        <StatCard
          label="Tempo estudado"
          value={formatMinutes(sessions.reduce((acc, s) => acc + s.actualSeconds / 60, 0))}
          hint={`${sessions.filter((s) => s.status === 'concluida').length} sessões concluídas`}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Questões resolvidas"
          value={formatInteger(questionTotals.total)}
          hint={`${formatInteger(questionTotals.correct)} acertos (${formatPercent(questionTotals.accuracy)})`}
          icon={<CheckCircle className="size-4" />}
        />
        <StatCard
          label="Tópicos dominados"
          value={formatInteger(topicsProg.mastered)}
          hint={`${topicsProg.completed} concluídos de ${topicsProg.total} cadastrados`}
        />
        <StatCard
          label="Revisões pendentes"
          value={formatInteger(revBuckets.overdue.length + revBuckets.today.length)}
          hint={`${revBuckets.overdue.length} em atraso`}
          icon={<AlertTriangle className="size-4 text-warning" />}
        />
      </div>

      {preferenceError && <p role="alert" className="text-sm text-danger">{preferenceError}</p>}
      {/* Granularity & Time Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">Agrupamento:</span>
          <Segmented
            label="Agrupamento do relatório"
            value={timeGranularity}
            onChange={(value) => {
              if (value !== timeGranularity) void saveReportPreference('reportTimeGranularity', value);
            }}
            options={[
              { value: 'day', label: 'Diário' },
              { value: 'week', label: 'Semanal' },
              { value: 'month', label: 'Mensal' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">Período:</span>
          <Segmented
            label="Período do relatório"
            value={periodDays}
            onChange={(value) => {
              if (value !== periodDays) void saveReportPreference('reportPeriodDays', value);
            }}
            options={[
              { value: '30', label: '30 dias' },
              { value: '60', label: '60 dias' },
              { value: '90', label: '90 dias' },
              { value: 'all', label: 'Todo o período' },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-6 @min-[52rem]:grid-cols-2 @min-[52rem]:gap-y-0">
        {/* Chart 1: Planned vs Done Time */}
        <Card
          className="@min-[52rem]:row-span-2 @min-[52rem]:grid @min-[52rem]:grid-rows-subgrid"
          title="Tempo planejado e realizado"
          description="Compare o tempo planejado e o estudado, em minutos."
        >
          {studyData.some((d) => d.studiedMinutes > 0 || d.plannedMinutes > 0) ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} width={44} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value} min`, '']} />
                  <Legend />
                  <Bar
                    dataKey="studiedMinutes"
                    name="Tempo Realizado"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive
                    animationDuration={CHART_ANIMATION_MS}
                  />
                  <Bar
                    dataKey="plannedMinutes"
                    name="Tempo Planejado"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive
                    animationDuration={CHART_ANIMATION_MS}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              className="h-full"
              icon={<Clock className="size-8" />}
              title="Sem dados de tempo para o período selecionado"
              description="Os dados aparecerão à medida que você estudar com o cronômetro ou agendar sessões."
            />
          )}
        </Card>

        {/* Chart 2: Accuracy Evolution */}
        <Card
          className="@min-[52rem]:row-span-2 @min-[52rem]:grid @min-[52rem]:grid-rows-subgrid"
          title="Evolução da taxa de acerto"
          description="Acompanhe a taxa de acerto no período selecionado."
        >
          {accuracyData.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accuracyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit="%" tickLine={false} width={52} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [formatPercent(Number(value)), 'Acerto']} />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="% Acerto"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive
                    animationDuration={CHART_ANIMATION_MS}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              className="h-full"
              icon={<CheckCircle className="size-8" />}
              title="Sem dados de acerto no período selecionado"
              description="Cadastre questões respondidas para visualizar sua curva de evolução."
            />
          )}
        </Card>
      </div>

      <TopicProgressCharts data={topicData} />

      {/* Two columns: Accuracy by Discipline & Worst Performing Topics */}
      <div className="grid gap-6 @min-[48rem]:grid-cols-2">
        {/* Disciplines Accuracy */}
        <Card
          title="Desempenho por disciplina"
          description="Taxa de acerto e questões resolvidas em todo o histórico."
        >
          {discAccuracy.some((d) => d.total > 0) ? (
            <ul role="list" className="space-y-2">
              {discAccuracy.map((d) => (
                <li key={d.disciplineId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-lg bg-surface-muted px-3 py-3.5">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-0.5">
                    <DisciplineDot color={d.color} className="mt-1.5" />
                    <h3 className="text-sm font-semibold text-fg [text-wrap:wrap]">{d.name}</h3>
                    <p className="col-start-2 text-xs text-fg-muted">
                      {d.total > 0
                        ? plural(d.total, 'questão resolvida', 'questões resolvidas')
                        : 'Sem questões registradas'}
                    </p>
                  </div>
                  {d.accuracy !== null ? (
                    <>
                      <span className="text-right text-base leading-5 font-bold tabular-nums text-fg">
                        <span className="sr-only">Taxa de acerto </span>
                        {formatPercent(d.accuracy)}
                      </span>
                      <div aria-hidden="true" className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${d.accuracy}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="text-right text-xs leading-5 text-fg-muted">
                      <span className="sr-only">Sem taxa de acerto</span>
                      <span aria-hidden="true">—</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<CheckCircle className="size-6" />}
              title="Sem questões registradas"
              description="Registre questões para acompanhar a taxa de acerto de cada disciplina."
            />
          )}
        </Card>

        {/* Worst Performing Topics */}
        <Card
          title="Conteúdos para reforçar"
          description="Priorize os tópicos com menor taxa de acerto."
          className="@min-[48rem]:grid @min-[48rem]:grid-rows-[auto_minmax(0,1fr)] @min-[48rem]:[contain:size]"
          bodyClassName="@min-[48rem]:overflow-y-auto"
        >
          {worstPerforming.length > 0 ? (
            <div className="space-y-3">
              {worstPerforming.map((item) => {
                const d = discMap.get(item.disciplineId);
                return (
                  <div
                    key={item.topicId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-danger-soft/10 text-xs"
                  >
                    <div className="min-w-0 wrap-anywhere">
                      <div className="flex items-start gap-1.5 font-semibold text-fg">
                        <AlertTriangle className="size-3.5 text-danger shrink-0" />
                        <span>{item.title}</span>
                      </div>
                      <div className="text-fg-muted mt-0.5">{d?.name}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span className="text-fg-subtle">
                        {item.correct}A / {item.incorrect}E
                      </span>
                      <Badge tone="danger" className="font-bold">
                        {formatPercent(item.accuracy)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle className="size-6" />}
              title="Nenhum ponto crítico identificado"
              description="Registre questões com um tópico para descobrir quais conteúdos precisam de reforço."
            />
          )}
        </Card>
      </div>

      {/* Gamification & Consistency Progression (Acompanhamento) */}
      <RankCard
        sessions={sessions}
        reviews={reviews}
        settings={settings}
        today={today}
      />
    </div>
  );
}
