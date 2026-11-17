import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Clock3, ArrowRight, BookOpen, Repeat2, CheckCircle2 } from 'lucide-react';
import { useDisciplines, useTopics, useSessions, useSettings, useReviews, useActiveTimer } from '../hooks/useData';
import { cycleCompletions, nextCycleActivity, previewCycle } from '../domain/schedule';
import { startCycleTimer } from '../services/timer';
import { todayKey } from '../lib/dates';
import { errorMessage } from '../lib/utils';
import { Card, Alert, DisciplineDot, Badge } from './ui/Display';
import { Button } from './ui/Button';
import { Input } from './ui/Form';

export function CycleRecommendation({ showQueue = false }: { showQueue?: boolean }) {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const settings = useSettings();
  const reviews = useReviews();
  const timer = useActiveTimer();
  const navigate = useNavigate();
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!settings) return null;
  const input = { disciplines, topics, sessions, questionLogs: [], errorNotes: [], settings };
  const next = nextCycleActivity(input);
  const completed = cycleCompletions(sessions).length;
  const due = reviews.filter(r => r.status === 'pendente' && r.dueDate <= todayKey()).length;
  const queue = showQueue ? previewCycle(input, 6).slice(1) : [];
  const hasBothAreas = disciplines.some(d => d.active && d.kind === 'technical') && disciplines.some(d => d.active && d.kind === 'general');
  async function start() {
    setError(null);
    setLoading(true);
    try {
      await startCycleTimer(minutes === '' ? undefined : Number(minutes));
      navigate('/estudar-agora');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  return <div className="space-y-5">
    {due > 0 && <Alert tone="warning" title="Reserve um momento para revisar">
      <Link to="/revisoes" className="underline">{due === 1 ? '1 revisão para fazer' : `${due} revisões para fazer`}</Link>. Depois, continue seu ciclo daqui.
    </Alert>}
    {error && <Alert tone="danger" title="Não foi possível iniciar">{error}</Alert>}
    {!next ? <Card title="Seu ciclo começa com uma disciplina">
      <p className="mb-4 text-sm text-fg-muted">Adicione ou ative as disciplinas do seu edital para começar.</p>
      <Button onClick={() => navigate('/disciplinas')}>Configurar disciplinas</Button>
    </Card> : <>
      <div className={showQueue ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(16rem,1fr)]' : ''}>
        <section className="min-w-0 overflow-hidden rounded-xl border border-primary/25 bg-surface" aria-labelledby="cycle-next">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-primary-soft/40 px-[var(--panel-padding)] py-4">
            <h2 id="cycle-next" className="section-title flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-fg"><Play className="size-3.5" aria-hidden /></span>Próxima atividade do ciclo</h2>
            <Badge tone="primary">Sessão {completed + 1}</Badge>
          </div>
          <div className="panel-padding space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">{next.discipline.kind === 'technical' ? 'Conhecimentos específicos' : 'Conhecimentos básicos'}</p>
              <div className="flex items-start gap-3"><span className="mt-2 shrink-0"><DisciplineDot color={next.discipline.color} /></span><h3 className="min-w-0 text-2xl font-semibold leading-tight text-fg sm:text-3xl">{next.discipline.name}</h3></div>
              <p className="flex items-start gap-2 text-sm leading-relaxed text-fg-muted"><BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />{next.topic?.title ?? 'Nenhum assunto ativo. Você pode estudar a disciplina ou cadastrar um assunto.'}</p>
            </div>
            <div className="border-t border-border pt-5">
              <fieldset className="min-w-0">
                <legend className="text-sm font-medium text-fg">Tempo de estudo</legend>
                <p className="mt-1 text-xs text-fg-muted">Escolha quanto tempo você tem agora.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[25, 45, 60].map(value => <button type="button" key={value} aria-pressed={Number(minutes || next.minutes) === value} onClick={() => setMinutes(String(value))} className={`min-h-11 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${Number(minutes || next.minutes) === value ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg-muted hover:bg-surface-muted'}`}>{value} min</button>)}
                  <div className="flex items-center gap-2"><Input aria-label="Duração personalizada em minutos" type="number" min={1} max={720} className="w-24" value={minutes} placeholder={String(next.minutes)} onChange={e => setMinutes(e.target.value)} /><span className="text-xs text-fg-muted">min</span></div>
                </div>
              </fieldset>
              <Button variant="primary" size="lg" className="mt-5 w-full sm:w-auto" icon={<Play className="size-4" aria-hidden />} onClick={() => timer ? navigate('/estudar-agora') : void start()} loading={loading}>{timer ? 'Retomar sessão em andamento' : 'Iniciar estudo do ciclo'}</Button>
              <p className="mt-3 flex items-center gap-2 text-xs leading-relaxed text-fg-muted"><Repeat2 className="size-4 shrink-0" aria-hidden />Ao finalizar, a próxima sessão fica disponível. Sua posição fica salva.</p>
            </div>
          </div>
        </section>
        {showQueue && <aside className="space-y-5">
          <Card title="Como seu estudo é dividido">
            <div className="flex items-baseline justify-between gap-3"><span className="text-4xl font-semibold tracking-tight text-primary">80<span className="text-xl">%</span></span><span className="text-sm text-fg-muted">Específicos</span></div>
            <div className="my-4 flex h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden><div className="w-4/5 bg-primary" /><div className="w-1/5 bg-fg-muted" /></div>
            <div className="flex justify-between gap-3 text-sm"><span className="font-semibold text-fg">20% Básicos</span><span className="text-fg-muted">1 a cada 5 sessões</span></div>
            <p className="mt-4 text-xs leading-relaxed text-fg-muted">Quatro sessões de específicos e uma de básicos. As disciplinas se alternam dentro de cada área.</p>
            {!hasBothAreas && <p className="mt-3 text-xs text-warning">Seu edital tem apenas uma área ativa. Ela ocupa todas as sessões disponíveis.</p>}
          </Card>
          <div className="flex items-center gap-3 rounded-xl border border-border px-5 py-4"><CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden /><div><p className="text-sm font-semibold text-fg">{completed} {completed === 1 ? 'sessão concluída' : 'sessões concluídas'}</p><p className="mt-0.5 text-xs text-fg-muted">Cada sessão é um passo no seu edital.</p></div></div>
        </aside>}
      </div>
      {showQueue && <Card title="Na sequência" description="Estas atividades ficam disponíveis conforme você conclui as sessões.">
        <ol className="divide-y divide-border">{queue.map((activity, index) => <li key={index} className="flex min-w-0 items-center gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-sm font-semibold tabular-nums text-fg-muted">{String(index + 2).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><DisciplineDot color={activity.discipline.color} /><p className="text-sm font-semibold text-fg">{activity.discipline.name}</p></div><p className="mt-1 text-xs leading-relaxed text-fg-muted">{activity.topic?.title ?? 'Estudo da disciplina'} · {activity.discipline.kind === 'technical' ? 'Específicos' : 'Básicos'}</p></div>
          <span className="hidden items-center gap-1 text-xs text-fg-muted sm:flex"><Clock3 className="size-3.5" aria-hidden />{activity.minutes} min</span>
        </li>)}</ol>
        <Link to="/disciplinas" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">Organizar disciplinas e assuntos<ArrowRight className="size-4" aria-hidden /></Link>
      </Card>}
    </>}
  </div>;
}
