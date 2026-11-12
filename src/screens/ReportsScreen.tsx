import { useState, useMemo } from 'react';
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
import {
  sumQuestions,
  accuracyByDiscipline,
  worstTopics,
  studyTimeSeries,
  accuracySeries,
  topicProgress,
  reviewBuckets,
  type Granularity,
} from '../domain/metrics';
import { formatMinutes, formatPercent, formatInteger, EMPTY_VALUE } from '../lib/format';
import { addDays, type DateKey } from '../lib/dates';
import { toCsv, downloadFile } from '../services/backup';

const REPORTS_STORAGE_KEY = 'bnb:reports:preferences';

function loadReportsPreferences(): { timeGranularity: Granularity; periodDays: '30' | '60' | '90' | 'all' } {
  try {
    const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.timeGranularity && parsed.periodDays) {
        return {
          timeGranularity: parsed.timeGranularity,
          periodDays: parsed.periodDays,
        };
      }
    }
  } catch {
    /* armazenamento indisponível ou corrompido: usa padrões */
  }
  return { timeGranularity: 'week', periodDays: '60' };
}

function saveReportsPreferences(timeGranularity: Granularity, periodDays: '30' | '60' | '90' | 'all') {
  try {
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify({ timeGranularity, periodDays }));
  } catch {
    /* armazenamento indisponível: silencia */
  }
}

export function ReportsScreen() {
  const today = useToday();

  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const questionLogs = useQuestionLogs();
  const reviews = useReviews();
  const settings = useSettings();

  const initialPrefs = useMemo(() => loadReportsPreferences(), []);
  const [timeGranularity, setTimeGranularity] = useState<Granularity>(initialPrefs.timeGranularity);
  const [periodDays, setPeriodDays] = useState<'30' | '60' | '90' | 'all'>(initialPrefs.periodDays);

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

  // Accuracy by discipline (ordenado em formato de ranking decrescente por taxa de acerto)
  const discAccuracy = useMemo(() => {
    const list = accuracyByDiscipline(questionLogs, disciplines);
    return [...list].sort((a, b) => {
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
    <div className="space-y-6">
      <PageHeader
        title="Relatórios e Diagnóstico de Desempenho"
        description="Análise aprofundada de horas estudadas, consistência e precisão em questões."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet className="size-4" />}
              onClick={handleExportSessionsCsv}
            >
              Exportar Sessões (CSV)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="size-4" />}
              onClick={handleExportQuestionsCsv}
            >
              Exportar Questões (CSV)
            </Button>
          </div>
        }
      />

      {/* Global Summary Statistics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total de Horas Estudadas"
          value={formatMinutes(sessions.reduce((acc, s) => acc + s.actualSeconds / 60, 0))}
          hint={`${sessions.filter((s) => s.status === 'concluida').length} sessões concluídas`}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Questões Totais"
          value={formatInteger(questionTotals.total)}
          hint={`${formatInteger(questionTotals.correct)} acertos (${formatPercent(questionTotals.accuracy)})`}
          icon={<CheckCircle className="size-4" />}
        />
        <StatCard
          label="Tópicos Dominados"
          value={formatInteger(topicsProg.mastered)}
          hint={`${topicsProg.completed} concluídos de ${topicsProg.total} cadastrados`}
        />
        <StatCard
          label="Revisões Pendentes"
          value={formatInteger(revBuckets.overdue.length + revBuckets.today.length)}
          hint={`${revBuckets.overdue.length} em atraso`}
          icon={<AlertTriangle className="size-4 text-warning" />}
        />
      </div>

      {/* Granularity & Time Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">Agrupamento:</span>
          <Segmented
            label="Agrupamento do relatório"
            value={timeGranularity}
            onChange={(v) => {
              setTimeGranularity(v);
              saveReportsPreferences(v, periodDays);
            }}
            options={[
              { value: 'day', label: 'Diário' },
              { value: 'week', label: 'Semanal' },
              { value: 'month', label: 'Mensal' },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">Janela:</span>
          <Segmented
            label="Período do relatório"
            value={periodDays}
            onChange={(v) => {
              const next = v as '30' | '60' | '90' | 'all';
              setPeriodDays(next);
              saveReportsPreferences(timeGranularity, next);
            }}
            options={[
              { value: '30', label: '30 dias' },
              { value: '60', label: '60 dias' },
              { value: '90', label: '90 dias' },
              { value: 'all', label: 'Tudo' },
            ]}
          />
        </div>
      </div>

      {/* Chart 1: Planned vs Done Time */}
      <Card
        title="Tempo Planejado versus Tempo Realizado"
        description="Evolução da carga horária de estudos pelo agrupamento selecionado (minutos)"
      >
        {studyData.some((d) => d.studiedMinutes > 0 || d.plannedMinutes > 0) ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} />
                <YAxis tickLine={false} width={44} />
                <Tooltip formatter={(value) => [`${value} min`, '']} />
                <Legend />
                <Bar
                  dataKey="studiedMinutes"
                  name="Tempo Realizado"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="plannedMinutes"
                  name="Tempo Planejado"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={<Clock className="size-8" />}
            title="Sem dados de tempo para o período selecionado"
            description="Os dados aparecerão à medida que você estudar com o cronômetro ou agendar sessões."
          />
        )}
      </Card>

      {/* Chart 2: Accuracy Evolution */}
      <Card
        title="Evolução da Taxa de Acerto (%)"
        description="Percentual de acerto calculado em cada período com base em questões resolvidas"
      >
        {accuracyData.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            icon={<CheckCircle className="size-8" />}
            title="Sem dados de acerto no período selecionado"
            description="Cadastre questões respondidas para visualizar sua curva de evolução."
          />
        )}
      </Card>

      {/* Two columns: Accuracy by Discipline & Worst Performing Topics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Disciplines Accuracy */}
        <Card
          title="Ranking de Desempenho por Disciplina"
          description="Classificação decrescente por taxa de acerto apurada"
        >
          <div className="space-y-2.5">
            {discAccuracy.map((d, index) => {
              const position = index + 1;
              const isTop1 = position === 1 && (d.accuracy ?? 0) > 0;
              const isTop2 = position === 2 && (d.accuracy ?? 0) > 0;
              const isTop3 = position === 3 && (d.accuracy ?? 0) > 0;

              return (
                <div
                  key={d.disciplineId}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface transition-colors hover:border-border-strong hover:bg-surface-elevated/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                        isTop1
                          ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/40'
                          : isTop2
                          ? 'bg-slate-400/15 text-slate-300 ring-1 ring-slate-400/40'
                          : isTop3
                          ? 'bg-amber-700/15 text-amber-600 ring-1 ring-amber-700/40'
                          : 'bg-surface-muted text-fg-subtle'
                      }`}
                    >
                      {position}º
                    </span>
                    <DisciplineDot color={d.color} />
                    <span className="font-medium text-sm text-fg truncate">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="text-fg-subtle">{d.total} resolvidas</span>
                    <span
                      className={`font-mono font-bold tabular-nums text-sm ${
                        d.accuracy !== null
                          ? d.accuracy >= 80
                            ? 'text-success'
                            : d.accuracy >= 65
                            ? 'text-fg'
                            : 'text-warning'
                          : 'text-fg-subtle'
                      }`}
                    >
                      {d.accuracy !== null ? formatPercent(d.accuracy) : EMPTY_VALUE}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Worst Performing Topics */}
        <Card
          title="Conteúdos com Pior Desempenho (Pontos de Atenção)"
          description="Tópicos que demandam mais reforço teórico e resolução de questões"
        >
          {worstPerforming.length > 0 ? (
            <div className="space-y-3">
              {worstPerforming.map((item) => {
                const d = discMap.get(item.disciplineId);
                return (
                  <div
                    key={item.topicId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-danger/30 bg-danger-soft/10 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-fg flex items-center gap-1.5">
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
              description="Quando você lançar questões associadas a tópicos específicos, os pontos de menor rendimento serão listados aqui para priorização."
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
