import { useMemo, useState } from 'react';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Bar, BarChart, XAxis, YAxis, Legend, CartesianGrid } from 'recharts';
import { Check, CircleMinus, Minus, TrendingUp, Trophy, Undo2, X as XIcon } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { Card, StatCard } from '../ui/Display';
import { analyzeExam, isTrueFalseExam, optionLabel, statsByDiscipline, statsByThird } from '../../domain/mockExam';
import { gradeStoredExam, reopenMockExam } from '../../services/mockExams';
import { formatDate } from '../../lib/dates';
import { formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { Discipline, MockExam } from '../../db/types';

const COLORS = { correct: '#16a34a', wrong: '#dc2626', blank: '#a3a3a3' };

interface ExamResultProps {
  exam: MockExam;
  disciplines: Discipline[];
  accuracyGoal: number;
}

export function ExamResult({ exam, disciplines, accuracyGoal }: ExamResultProps) {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const graded = useMemo(() => gradeStoredExam(exam), [exam]);
  const names = useMemo(() => Object.fromEntries(disciplines.map((d) => [d.id, d.name])), [disciplines]);
  const analysis = useMemo(
    () => analyzeExam(graded, { accuracyGoal, disciplineNames: names, optionCount: exam.optionCount }),
    [graded, accuracyGoal, names, exam.optionCount],
  );
  const { totals, results } = graded;
  const trueFalse = isTrueFalseExam(exam.optionCount);
  const fmtAnswer = (ans: string) =>
    ans === 'X' ? 'anulada' : trueFalse ? `${optionLabel(ans, exam.optionCount)} (${ans})` : ans;

  const pieData = [
    { name: 'Acertos', value: totals.correct, color: COLORS.correct },
    { name: 'Erros', value: totals.wrong, color: COLORS.wrong },
    { name: 'Em branco', value: totals.blank, color: COLORS.blank },
  ].filter((d) => d.value > 0);

  const groups = statsByDiscipline(results);
  const barData = (groups.length > 0 ? groups : statsByThird(results)).map((g) => ({
    name: g.label ?? names[g.key] ?? g.key,
    Acertos: g.correct,
    Erros: g.wrong,
    'Em branco': g.blank,
  }));

  return (
    <Card
      title="Seu resultado"
      description={`${exam.title}${exam.date ? ` · realizado em ${formatDate(exam.date)}` : ''} — enviado em ${new Date(exam.submittedAt ?? exam.updatedAt).toLocaleString('pt-BR')}`}
      actions={
        <Button size="sm" icon={<Undo2 className="size-4" />} onClick={() => void reopenMockExam(exam.id)}>
          Reabrir folha
        </Button>
      }
    >
      <div className="flex flex-col gap-6" data-testid="exam-result">
        {totals.accuracy !== null && !bannerDismissed && (
          <div
            className={cn(
              'relative flex items-center gap-4 rounded-xl border p-4 pr-11',
              totals.accuracy >= accuracyGoal ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
            )}
          >
            <Trophy className={cn('size-8 shrink-0', totals.accuracy >= accuracyGoal ? 'text-success' : 'text-warning')} aria-hidden />
            <div>
              <p className="text-base font-semibold text-fg">
                {totals.accuracy >= accuracyGoal ? 'Meta atingida!' : 'Ainda abaixo da meta'}
              </p>
              <p className="text-sm text-fg-muted">
                Você acertou {totals.correct} de {totals.scored} questões ({formatPercent(totals.accuracy)}). Sua meta é {accuracyGoal}%.
              </p>
            </div>
            <IconButton
              label="Fechar aviso"
              icon={<XIcon className="size-4" />}
              size="sm"
              onClick={() => setBannerDismissed(true)}
              className="absolute top-2.5 right-2.5 shrink-0 opacity-75 hover:opacity-100"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Acertos" value={<span data-testid="stat-correct">{totals.correct}</span>} />
          <StatCard label="Erros" value={<span data-testid="stat-wrong">{totals.wrong}</span>} />
          <StatCard label="Em branco" value={<span data-testid="stat-blank">{totals.blank}</span>} />
          <StatCard
            label="Aproveitamento"
            value={<span data-testid="stat-accuracy">{formatPercent(totals.accuracy)}</span>}
            hint={totals.annulled > 0 ? `${totals.annulled} anulada(s) desconsiderada(s)` : undefined}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <figure className="h-64" aria-label="Gráfico de acertos, erros e questões em branco">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </figure>
          <figure className="h-64" aria-label={groups.length > 0 ? 'Desempenho por disciplina' : 'Desempenho por trecho da prova'}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Acertos" stackId="a" fill={COLORS.correct} />
                <Bar dataKey="Erros" stackId="a" fill={COLORS.wrong} />
                <Bar dataKey="Em branco" stackId="a" fill={COLORS.blank} />
              </BarChart>
            </ResponsiveContainer>
          </figure>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-fg">Questão a questão</h3>
          <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1"><Check className="size-3.5 text-success" aria-hidden /> Acerto</span>
            <span className="inline-flex items-center gap-1"><XIcon className="size-3.5 text-danger" aria-hidden /> Erro (sua resposta → correta)</span>
            <span className="inline-flex items-center gap-1"><Minus className="size-3.5" aria-hidden /> Em branco</span>
            <span className="inline-flex items-center gap-1"><CircleMinus className="size-3.5" aria-hidden /> Anulada</span>
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {results.map((r) => (
              <li
                key={r.number}
                title={`Questão ${r.number}: gabarito ${fmtAnswer(r.correctAnswer)}, marcada ${r.marked ? fmtAnswer(r.marked) : 'em branco'}`}
                className={cn(
                  'flex h-11 min-w-14 flex-col items-center justify-center rounded-md border px-1.5 text-[11px] leading-tight tabular-nums',
                  r.outcome === 'correct' && 'border-success/40 bg-success/10 text-success',
                  r.outcome === 'wrong' && 'border-danger/40 bg-danger/10 text-danger',
                  r.outcome === 'blank' && 'border-border bg-surface-muted text-fg-muted',
                  r.outcome === 'annulled' && 'border-border bg-surface text-fg-subtle line-through',
                )}
              >
                <span className="font-semibold">{r.number}</span>
                <span className="inline-flex items-center gap-0.5">
                  {r.outcome === 'correct' && <Check className="size-3" aria-label="acerto" />}
                  {r.outcome === 'wrong' && <XIcon className="size-3" aria-label="erro" />}
                  {r.outcome === 'blank' && <Minus className="size-3" aria-label="em branco" />}
                  {r.outcome === 'annulled' && <CircleMinus className="size-3" aria-label="anulada" />}
                  {r.marked ?? ''}
                  {r.outcome === 'wrong' ? `→${r.correctAnswer}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="strengths-title" className="rounded-xl border border-success/30 bg-success/5 p-4">
            <h3 id="strengths-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
              <Trophy className="size-4" aria-hidden />
              Pontos fortes
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
              {analysis.strengths.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="improvements-title" className="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <h3 id="improvements-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning">
              <TrendingUp className="size-4" aria-hidden />
              O que melhorar
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
              {analysis.improvements.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Card>
  );
}
