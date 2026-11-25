import { useMemo } from 'react';
import { Flame, Play, Clock, ArrowRight, Repeat2, Target, CheckCircle2 } from 'lucide-react';
import { Card, DisciplineDot, ProgressBar, Badge } from '../ui/Display';
import { Button } from '../ui/Button';
import { ProgressRing } from './ProgressRing';
import { dailyProgress, progressFraming } from '../../domain/motivation';
import { cycleCompletions, manualPlannedSessions, previewCycle } from '../../domain/schedule';
import type { Discipline, QuestionLog, Settings, StudySession, Topic, TimerState } from '../../db/types';
import { formatInteger, formatMinutes } from '../../lib/format';
import { cn } from '../../lib/utils';

interface DailyMissionCardProps {
  sessions: readonly StudySession[];
  logs: readonly QuestionLog[];
  settings: Settings | undefined;
  disciplines: readonly Discipline[];
  today: string;
  streak: number;
  topics: readonly Topic[];
  timer: TimerState | null;
  starting: boolean;
  onStartCycle: () => void;
  onOpenCycle: () => void;
  onConfigureDisciplines: () => void;
  onStudyNow: () => void;
  onOpenSettings: () => void;
}

/** Progresso diário e continuação do ciclo, sem compromissos por data. */
export function DailyMissionCard({
  sessions,
  logs,
  settings,
  disciplines,
  today,
  streak,
  topics,
  timer,
  starting,
  onStartCycle,
  onOpenCycle,
  onConfigureDisciplines,
  onStudyNow,
  onOpenSettings,
}: DailyMissionCardProps) {
  const p = useMemo(() => dailyProgress(sessions, logs, settings, today), [sessions, logs, settings, today]);
  const queue = useMemo(() => settings ? previewCycle({ disciplines, topics, sessions,
    settings, questionLogs: logs, errorNotes: [] }, 4) : [], [disciplines, topics, sessions, settings, logs]);
  const planned = useMemo(() => manualPlannedSessions(sessions), [sessions]);
  const next = queue[0];
  const hasActiveDiscipline = disciplines.some(discipline => discipline.active);
  const timeGoalsDisabled = settings?.dailyGoalMinutes === 0 && settings?.weeklyGoalMinutes === 0;
  const queueOffset = timer && !timer.cycleStudy ? 0 : 1;
  const upcomingEntries = useMemo(() => {
    const manualItems = planned.map(session => ({ kind: 'manual' as const, session }));
    const autoItems = queue.slice(queueOffset).map(activity => ({ kind: 'automatic' as const, activity }));
    return [...manualItems, ...autoItems].slice(0, 3);
  }, [planned, queue, queueOffset]);
  const completed = useMemo(() => cycleCompletions(sessions), [sessions]);
  const completedToday = completed.filter(s => s.date === today).length;
  const activeDiscipline = timer ? disciplines.find(d => d.id === timer.disciplineId) : null;
  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const pct = Math.round(p.ratio * 100);
  const goalDone = p.goalMinutes > 0 && p.ratio >= 1;
  const nameOf = (id: string) => discMap.get(id)?.name ?? (id === 'simulado' ? 'Simulado Geral BNB' : 'Disciplina');

  return (
    <Card
      title="Missão de hoje"
      description={progressFraming(p.studiedMinutes, p.goalMinutes)}
      className="shadow-2xs"
      bodyClassName="@container"
    >
      <div className="space-y-6">
        <div className="grid gap-4 @min-[42rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @min-[42rem]:gap-6">
          <section className="panel-padding flex min-w-0 flex-col gap-5 rounded-xl bg-primary-soft/60" aria-label="Sua próxima sessão">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-fg">
                  <Play className="size-4" aria-hidden="true" />
                </span>
                {timer ? 'Sessão em andamento' : 'Próxima atividade do ciclo'}
              </p>
              {!timer && next && <Badge tone="primary">Sessão {next.position}</Badge>}
            </div>

            <div className="space-y-3">
              <h3 className="flex items-start gap-2.5 text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-3xl">
                {(timer || next) && <span className="grid h-[1lh] shrink-0 place-items-center"><DisciplineDot color={timer ? activeDiscipline?.color ?? '#1E40AF' : next.discipline.color} className="size-3" /></span>}
                <span className="min-w-0">
                  {timer ? nameOf(timer.disciplineId) : next?.discipline.name ??
                    (hasActiveDiscipline ? 'Nenhum tópico pendente no ciclo' : 'Seu ciclo começa com uma disciplina')}
                </span>
              </h3>
              <p className="text-base leading-relaxed text-fg-muted">
                {timer ? timer.objective || 'Continue sua sessão de estudo.'
                  : next ? next.topic?.title ?? 'Estude a disciplina ou cadastre um assunto para orientar a sessão.'
                    : hasActiveDiscipline ? 'Os tópicos disponíveis já foram concluídos ou dominados.'
                      : 'Adicione ou ative as disciplinas do seu edital para começar.'}
              </p>
              {(timer || next) && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
                {(timer || next) && !timeGoalsDisabled && <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-fg">
                  <Clock className="size-4 text-primary" aria-hidden="true" />
                  {timer ? timer.plannedSeconds / 60 : next.minutes} min
                </span>}
                {next && !timer && <span>{next.discipline.kind === 'technical' ? 'Conhecimentos específicos' : 'Conhecimentos básicos'}</span>}
              </div>}
            </div>

            <div className="mt-auto space-y-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                loading={starting}
                disabled={!settings && !timer}
                icon={<Play className="size-4" aria-hidden="true" />}
                onClick={timer ? onStudyNow : next ? onStartCycle : onConfigureDisciplines}
              >
                {timer ? 'Retomar sessão em andamento' : next ? 'Iniciar estudo do ciclo' : 'Configurar disciplinas'}
              </Button>
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-muted">
                <Repeat2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Continue de onde parou. Sua posição no ciclo fica salva.
              </p>
            </div>
          </section>

          <section className="panel-padding flex min-w-0 flex-col gap-5 rounded-xl bg-surface-muted" aria-labelledby="mission-progress-title">
            <h3 id="mission-progress-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <span className="grid size-8 shrink-0 place-items-center"><Target className="size-4 text-primary" aria-hidden="true" /></span>
              Seu progresso hoje
            </h3>
            <div className="flex items-center gap-4">
              {!timeGoalsDisabled && p.goalMinutes > 0 && <ProgressRing
                value={p.studiedMinutes}
                max={p.goalMinutes}
                label="Tempo estudado hoje em relação à meta diária"
                size={88}
                stroke={7}
              >
                <span className="text-xl font-semibold tabular-nums text-fg">{Math.min(pct, 999)}%</span>
              </ProgressRing>}
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-fg-muted">Tempo estudado</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums text-fg">{formatMinutes(p.studiedMinutes)}</p>
                {!timeGoalsDisabled && p.goalMinutes > 0 && <p className="text-xs text-fg-muted">{goalDone ? 'Meta diária cumprida' : `Meta diária: ${formatMinutes(p.goalMinutes)}`}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium text-fg">Questões hoje</h4>
                <span className="text-sm font-semibold tabular-nums text-fg">
                  {formatInteger(p.questionsToday)}
                  {p.questionGoal ? <span className="font-normal text-fg-muted"> / {formatInteger(p.questionGoal)}</span> : null}
                </span>
              </div>
              {p.questionGoal ? (
                <ProgressBar
                  value={p.questionsToday}
                  max={p.questionGoal}
                  label="Questões resolvidas hoje em relação à meta diária"
                  tone={p.questionsToday >= p.questionGoal ? 'success' : 'primary'}
                  className="bg-surface-inset!"
                  showOverflow
                />
              ) : (
                <button type="button" onClick={onOpenSettings} className="min-h-11 text-left text-xs font-medium text-primary hover:underline">
                  Definir meta diária de questões
                </button>
              )}
            </div>

            <div className="mt-auto space-y-3 rounded-lg bg-surface-inset p-3.5">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className={cn('mt-0.5 size-4 shrink-0', completedToday > 0 ? 'text-success' : 'text-fg-muted')} aria-hidden="true" />
                <p className="text-xs font-medium leading-relaxed text-fg">
                  {completedToday === 1 ? '1 sessão do ciclo concluída hoje' : `${completedToday} sessões do ciclo concluídas hoje`}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Flame className={cn('mt-0.5 size-4 shrink-0', streak > 0 ? 'text-accent' : 'text-fg-muted')} aria-hidden="true" />
                <div className="space-y-0.5 text-xs leading-relaxed">
                  <p className="font-medium tabular-nums text-fg">{streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}</p>
                  <p className="text-fg-muted">
                    {p.studiedMinutes > 0 ? 'Sequência mantida hoje.' : streak > 0 ? 'Estude hoje para manter a sequência.' : 'Comece sua sequência hoje.'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section aria-labelledby="mission-queue-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <h3 id="mission-queue-title" className="text-sm font-semibold text-fg">Na sequência do ciclo</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">Uma atividade por vez, no seu ritmo.</p>
            </div>
            <button type="button" onClick={onOpenCycle} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Ver ciclo de estudos <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          {(next || upcomingEntries.length > 0) ? <ol className="grid gap-3 @min-[36rem]:grid-cols-3" aria-label="Próximas atividades do ciclo">
            {upcomingEntries.map((entry) => {
              if (entry.kind === 'manual') {
                const { session } = entry;
                const disc = discMap.get(session.disciplineId);
                const topicTitle = session.topicId ? topicMap.get(session.topicId)?.title : null;
                const subtitle = topicTitle ?? (session.objective || 'Estudo da disciplina');
                return (
                  <li key={`manual-${session.id}`} className="flex min-w-0 items-start gap-3 rounded-lg bg-surface-muted p-4">
                    <Badge tone="info" className="shrink-0">Criada por você</Badge>
                    <div className="min-w-0 space-y-1.5">
                      <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-fg">
                        {disc && <span className="mt-1 shrink-0"><DisciplineDot color={disc.color} /></span>}
                        {disc?.name ?? (session.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão de estudo')}
                      </p>
                      {subtitle && <p className="text-xs leading-relaxed text-fg-muted">{subtitle}</p>}
                    </div>
                  </li>
                );
              }
              const { activity } = entry;
              return (
                <li key={`cycle-${activity.position}`} className="flex min-w-0 items-start gap-3 rounded-lg bg-surface-muted p-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold tabular-nums text-fg-muted">{activity.position}</span>
                  <div className="min-w-0 space-y-1.5">
                    <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-fg">
                      <span className="mt-1 shrink-0"><DisciplineDot color={activity.discipline.color} /></span>
                      {activity.discipline.name}
                    </p>
                    {activity.topic && <p className="text-xs leading-relaxed text-fg-muted">{activity.topic.title}</p>}
                  </div>
                </li>
              );
            })}
          </ol> : <p className="rounded-lg bg-surface-muted p-4 text-sm text-fg-muted">
            {hasActiveDiscipline ? 'Nenhuma atividade automática pendente.' : 'Ao ativar suas disciplinas, as próximas atividades aparecem aqui.'}
          </p>}
        </section>
      </div>
    </Card>
  );
}
