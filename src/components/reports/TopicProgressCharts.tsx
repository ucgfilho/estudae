import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, EmptyState } from '../ui/Display';
import type { topicProgressSeries } from '../../domain/metrics';
import { formatPercent } from '../../lib/format';
import { formatDate } from '../../lib/dates';
import { TOPIC_PROGRESS_REPORTS } from './topicProgressReports';

const metrics = [
  {
    key: 'coverage',
    backupKey: 'backupCoverage',
    title: 'Evolução da cobertura do edital',
    description: 'Percentual de tópicos ativos concluídos ou dominados.',
  },
  {
    key: 'approached',
    backupKey: 'backupApproached',
    title: 'Evolução dos tópicos em abordagem',
    description: 'Percentual de tópicos ativos em andamento, concluídos ou dominados.',
  },
] as const;

export function TopicProgressCharts({ data }: { data: ReturnType<typeof topicProgressSeries> }) {
  const { hash } = useLocation();

  useEffect(() => {
    const report = Object.values(TOPIC_PROGRESS_REPORTS).find(({ id }) => hash === `#${id}`);
    if (!report) return;
    const section = document.getElementById(report.id);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView?.({ block: 'start' });
  }, [hash]);

  return (
    <div className="grid gap-6 @min-[52rem]:grid-cols-2">
      {metrics.map(({ key, backupKey, title, description }) => {
        const { id, label } = TOPIC_PROGRESS_REPORTS[key];
        const chartData = data
          .map((point) => ({ ...point, value: point[key] ?? point[backupKey] }))
          .filter((point) => point.value !== null);
        const hasBackups = chartData.some((point) => point.backupDate);
        const current = data.at(-1)?.[key] ?? null;
        return (
          <section key={key} id={id} aria-label={title} tabIndex={-1} className="min-w-0 scroll-mt-5 rounded-xl">
            <Card as="div" title={title} description={description} className="h-full" bodyClassName="space-y-2">
              {chartData.length > 0 ? (
                <>
                  <p className="text-sm text-fg-muted">
                    Atual <strong className="tabular-nums text-fg">{formatPercent(current)}</strong>
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} unit="%" tickLine={false} width={52} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(value, name) => [formatPercent(Number(value)), name]}
                          labelFormatter={(period, entries) => {
                            const backupDate = entries[0]?.payload?.backupDate;
                            return backupDate ? formatDate(backupDate) : period;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          name={label}
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          isAnimationActive
                          animationDuration={250}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {hasBackups ? (
                    <p className="text-xs text-fg-muted">Os pontos anteriores ao registro automático foram recuperados de backups.</p>
                  ) : chartData.length === 1 && (
                    <p className="text-xs text-fg-muted">O gráfico mostra o primeiro ponto disponível para este período.</p>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<BarChart3 className="size-8" />}
                  title="Sem dados de progresso no período"
                  description="O gráfico será preenchido conforme houver tópicos ativos no edital."
                />
              )}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
