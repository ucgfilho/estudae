import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Clock3, ArrowRight, BookOpen, Repeat2, CheckCircle2, Trash2 } from 'lucide-react';
import { useDisciplines, useTopics, useSessions, useSettings, useReviews, useActiveTimer } from '../hooks/useData';
import { cycleCompletions, previewCycle, type CycleActivity } from '../domain/schedule';
import { compareSessions } from '../domain/metrics';
import { startCycleTimer } from '../services/timer';
import { getSettings, updateSettings } from '../services/settings';
import { completeCycleActivity, deleteSession, setSessionStatus } from '../services/sessions';
import type { StudySession } from '../db/types';
import { formatDate, todayKey } from '../lib/dates';
import { errorMessage } from '../lib/utils';
import { Card, Alert, DisciplineDot, Badge } from './ui/Display';
import { Button, IconButton } from './ui/Button';
import { ConfirmModal } from './ui/ConfirmModal';
import { Input } from './ui/Form';
import { CycleBookAnimation } from './CycleBookAnimation';

type QueueEntry = { kind: 'automatic'; activity: CycleActivity } | { kind: 'manual'; session: StudySession };

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
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<QueueEntry | null>(null);
  const [removing, setRemoving] = useState(false);
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  if (!settings) return null;
  const input = { disciplines, topics, sessions, questionLogs: [], errorNotes: [], settings };
  const timeGoalsDisabled = settings.dailyGoalMinutes === 0 && settings.weeklyGoalMinutes === 0;
  const completed = cycleCompletions(sessions).length;
  const due = reviews.filter(r => r.status === 'pendente' && r.dueDate <= todayKey()).length;
  const technical = disciplines.filter(d => d.active && d.kind === 'technical').length;
  const general = disciplines.filter(d => d.active && d.kind === 'general').length;
  const hasBothAreas = technical > 0 && general > 0;
  const rotationSize = hasBothAreas ? 5 * Math.max(Math.ceil(technical / 4), general) : technical + general;
  const [next, ...queue] = previewCycle(input, showQueue ? (expanded ? Math.max(10, rotationSize) + 1 : 6) : 1);
  const planned = showQueue ? sessions.filter(session => session.status === 'planejada' &&
    (session.isManual ?? session.history.some(entry => entry.type === 'criada' && entry.description === 'Sessão planejada criada pelo usuário.')))
    .sort(compareSessions) : [];
  const entries: QueueEntry[] = [
    ...(expanded ? planned.map(session => ({ kind: 'manual' as const, session })) : []),
    ...queue.map(activity => ({ kind: 'automatic' as const, activity })),
  ];

  async function completeEntry(entry: QueueEntry, entryKey: string) {
    if (completingKey) return;
    setCompletingKey(entryKey);
    setCompletionError(null);
    try {
      if (entry.kind === 'manual') {
        await setSessionStatus(entry.session.id, 'concluida', entry.session.plannedMinutes);
      } else {
        await completeCycleActivity(entry.activity);
      }
    } catch (err) {
      setCompletionError(errorMessage(err));
    } finally {
      setCompletingKey(null);
    }
  }
  async function removeActivity() {
    if (!pendingRemoval || removing) return;
    setRemoving(true);
    setRemovalError(null);
    try {
      if (pendingRemoval.kind === 'manual') {
        await deleteSession(pendingRemoval.session.id);
      } else {
        const { skippedCycleActivities = [] } = await getSettings();
        const { position, discipline, topic } = pendingRemoval.activity;
        if (!skippedCycleActivities.some(activity => activity.position === position)) {
          await updateSettings({ skippedCycleActivities: [
            ...skippedCycleActivities,
            { position, disciplineId: discipline.id, topicId: topic?.id ?? null },
          ] });
        }
      }
      setPendingRemoval(null);
    } catch (err) {
      setRemovalError(errorMessage(err));
      setPendingRemoval(null);
    } finally {
      setRemoving(false);
    }
  }
  async function start() {
    setError(null);
    setLoading(true);
    try {
      await startCycleTimer(minutes === '' ? undefined : Number(minutes));
      navigate('/estudar-agora');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  return <div className="@container space-y-5">
    {due > 0 && <Alert tone="warning" title="Reserve um momento para revisar">
      <Link to="/revisoes" className="underline">{due === 1 ? '1 revisão para fazer' : `${due} revisões para fazer`}</Link>. Depois, continue seu ciclo daqui.
    </Alert>}
    {error && <Alert tone="danger" title="Não foi possível iniciar">{error}</Alert>}
    {!next ? <Card title={technical + general > 0 ? 'Nenhum tópico pendente no ciclo' : 'Seu ciclo começa com uma disciplina'}>
      <p className="mb-4 text-sm text-fg-muted">{technical + general > 0
        ? 'Os tópicos disponíveis já foram concluídos ou dominados.'
        : 'Adicione ou ative as disciplinas do seu edital para começar.'}</p>
      <Button onClick={() => navigate(timer ? '/estudar-agora' : '/disciplinas')}>{timer ? 'Retomar sessão em andamento' : 'Configurar disciplinas'}</Button>
    </Card> : <>
      <div className={showQueue ? 'grid gap-5 @min-[56rem]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]' : ''}>
        <section className="@container flex min-w-0 flex-col overflow-hidden rounded-xl bg-surface" aria-labelledby="cycle-next">
          <header className="flex flex-wrap items-center justify-between gap-3 bg-primary-soft/40 px-(--panel-padding) py-4">
            <h2 id="cycle-next" className="section-title flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-primary-fg"><Play className="size-3.5" aria-hidden /></span>
              <span>Próxima atividade do ciclo</span>
            </h2>
            <Badge tone="primary">Sessão {next.position}</Badge>
          </header>
          <div className="panel-padding grid flex-1 content-between gap-5 @min-[32rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">{next.discipline.kind === 'technical' ? 'Conhecimentos específicos' : 'Conhecimentos básicos'}</p>
              <h3 className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-2xl font-semibold leading-tight text-fg sm:text-3xl">
                <span className="grid h-[1lh] place-items-center"><DisciplineDot color={next.discipline.color} /></span>
                <span>{next.discipline.name}</span>
              </h3>
              <p className="flex items-start gap-2 text-sm leading-relaxed text-fg-muted">
                <BookOpen className="mt-0.5 size-4" aria-hidden />
                <span>{next.topic?.title ?? 'Nenhum assunto ativo. Você pode estudar a disciplina ou cadastrar um assunto.'}</span>
              </p>
            </div>
            {timeGoalsDisabled ? (
              <div className="hidden items-center justify-center @min-[32rem]:col-start-2 @min-[32rem]:row-span-2 @min-[32rem]:row-start-1 @min-[32rem]:flex">
                <CycleBookAnimation />
              </div>
            ) : (
              <fieldset className="min-w-0">
                <legend className="text-sm font-medium text-fg">Tempo de estudo</legend>
                <p className="mt-1 text-xs text-fg-muted">Escolha quanto tempo você tem agora.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[25, 45, 60].map(value => <button type="button" key={value} aria-pressed={Number(minutes || next.minutes) === value} onClick={() => setMinutes(String(value))} className={`control-height rounded-lg px-3 text-sm font-medium transition-colors ${Number(minutes || next.minutes) === value ? 'bg-primary-soft text-primary' : 'bg-field text-fg-muted hover:bg-surface-muted'}`}>{value} min</button>)}
                  <div className="flex items-center gap-2"><Input aria-label="Duração personalizada em minutos" type="number" min={1} max={720} className="w-24" value={minutes} placeholder={String(next.minutes)} onChange={e => setMinutes(e.target.value)} /><span className="text-xs text-fg-muted">min</span></div>
                </div>
              </fieldset>
            )}
            <div className={timeGoalsDisabled ? 'space-y-3' : 'space-y-3 @min-[32rem]:col-span-2'}>
              <Button variant="primary" size="lg" className="w-full sm:w-auto" icon={<Play className="size-4" aria-hidden />} onClick={() => timer ? navigate('/estudar-agora') : void start()} loading={loading}>
                {timer ? 'Retomar sessão em andamento' : 'Iniciar estudo do ciclo'}
              </Button>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
                <Repeat2 className="mt-0.5 size-4" aria-hidden />
                <span>Ao finalizar, a próxima sessão fica disponível. Sua posição fica salva.</span>
              </p>
            </div>
          </div>
        </section>
        {showQueue && <aside className="flex min-w-0 flex-col gap-5">
          <Card title="Como seu estudo é dividido" className="flex flex-1 flex-col" bodyClassName="flex flex-1 flex-col justify-center gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="text-4xl font-semibold tracking-tight text-primary">80<span className="text-xl">%</span></span><span className="text-sm text-fg-muted">Específicos</span></div>
            <div className="flex h-2 shrink-0 overflow-hidden rounded-full bg-surface-muted" aria-hidden><div className="w-4/5 bg-primary" /></div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><span className="font-semibold text-fg">20% Básicos</span><span className="text-fg-muted">1 a cada 5 sessões</span></div>
            <p className="text-xs leading-relaxed text-fg-muted">Quatro sessões de específicos e uma de básicos. As disciplinas se alternam dentro de cada área.</p>
            {!hasBothAreas && <p className="text-xs text-warning">Seu edital tem apenas uma área ativa. Ela ocupa todas as sessões disponíveis.</p>}
          </Card>
          <div className="flex items-center gap-3 rounded-xl bg-surface px-(--panel-padding) py-4"><CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden /><div><p className="text-sm font-semibold text-fg">{completed} {completed === 1 ? 'sessão concluída' : 'sessões concluídas'}</p><p className="mt-0.5 text-xs text-fg-muted">Cada sessão é um passo no seu edital.</p></div></div>
        </aside>}
      </div>
    </>}
    {removalError && <Alert tone="danger" title="Não foi possível excluir a sessão" onClose={() => setRemovalError(null)}>{removalError}</Alert>}
    {completionError && <Alert tone="danger" title="Não foi possível concluir a sessão" onClose={() => setCompletionError(null)}>{completionError}</Alert>}
    {showQueue && (next || planned.length > 0) && <Card title="Na sequência" description="Aqui você encontra as próximas atividades do ciclo e, na visualização completa, suas sessões planejadas.">
      <div id="cycle-queue">
        {entries.length > 0 && <ol
          aria-label="Próximos estudos do ciclo"
          tabIndex={0}
          className={expanded
            ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
            : 'grid grid-flow-col auto-cols-[minmax(13rem,1fr)] gap-4 overflow-x-auto overscroll-x-contain snap-x snap-proximity rounded-lg pb-3'}
        >
          {entries.map(entry => {
            const entryKey = entry.kind === 'manual' ? `manual-${entry.session.id}` : `cycle-${entry.activity.position}`;
            const session = entry.kind === 'manual' ? entry.session : null;
            const activity = entry.kind === 'automatic' ? entry.activity : null;
            const discipline = activity?.discipline ?? disciplines.find(item => item.id === session?.disciplineId);
            const title = activity?.topic?.title ?? topics.find(item => item.id === session?.topicId)?.title ??
              (session?.objective || 'Estudo da disciplina');
            const minutes = session?.plannedMinutes ?? activity?.minutes;
            return (
              <li key={entryKey} className="flex min-w-0 snap-start flex-col gap-4 rounded-xl bg-surface-muted p-4">
                <div className="flex min-h-9 items-center">
                  {entry.kind === 'manual' ? <Badge tone="info">Criada por você</Badge> : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold tabular-nums text-primary">
                      {String(entry.activity.position).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-start gap-2">
                    {discipline && <DisciplineDot color={discipline.color} className="mt-1.5" />}
                    <h3 className="min-w-0 text-sm font-semibold leading-relaxed text-fg">{discipline?.name ?? 'Sessão de estudo'}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-fg-muted">{title}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-fg-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    {session ? (
                      <time dateTime={session.plannedStart ? `${session.date}T${session.plannedStart}` : session.date}>
                        {formatDate(session.date)}{session.plannedStart && ` às ${session.plannedStart}`}
                      </time>
                    ) : <span>{discipline?.kind === 'technical' ? 'Específicos' : 'Básicos'}</span>}
                    {(session || !timeGoalsDisabled) && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock3 className="size-3.5" aria-hidden />{minutes} min</span>}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton
                      className="action-button text-success hover:bg-success-soft hover:text-success active:bg-success-soft active:brightness-95"
                      size="sm"
                      disabled={completingKey === entryKey}
                      label={entry.kind === 'manual' ? `Concluir sessão planejada: ${title}` : `Concluir sessão ${entry.activity.position} de ${entry.activity.discipline.name}`}
                      icon={<CheckCircle2 className="size-4" />}
                      onClick={() => void completeEntry(entry, entryKey)}
                    />
                    <IconButton
                      className="hover:bg-danger-soft hover:text-danger"
                      size="sm"
                      label={entry.kind === 'manual' ? `Excluir sessão planejada: ${title}` : `Excluir sessão ${entry.activity.position} de ${entry.activity.discipline.name}`}
                      icon={<Trash2 className="size-4" />}
                      onClick={() => setPendingRemoval(entry)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>}
      </div>
      <Button className="mt-5" variant="subtle" aria-controls="cycle-queue" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Recolher ciclo completo' : 'Ver ciclo completo'}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
      <ConfirmModal
        open={pendingRemoval !== null}
        title={pendingRemoval?.kind === 'manual' ? 'Excluir sessão planejada?' : 'Excluir sessão do ciclo?'}
        message={pendingRemoval?.kind === 'manual'
          ? 'A sessão será removida do planejamento e do calendário.'
          : pendingRemoval && `A sessão ${pendingRemoval.activity.position} de ${pendingRemoval.activity.discipline.name} será pulada nesta passagem do ciclo.`}
        confirmLabel="Excluir sessão"
        loading={removing}
        onClose={() => { if (!removing) setPendingRemoval(null); }}
        onConfirm={removeActivity}
      />
    </Card>}
  </div>;
}
