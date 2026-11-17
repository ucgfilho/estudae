import { useMemo } from 'react';
import { Flame, Play, Clock, ArrowRight, Repeat2, Target, CheckCircle2 } from 'lucide-react';
import { Card, DisciplineDot, ProgressBar, Badge } from '../ui/Display';
import { Button } from '../ui/Button';
import { ProgressRing } from './ProgressRing';
import { dailyProgress, progressFraming } from '../../domain/motivation';
import { cycleCompletions, previewCycle } from '../../domain/schedule';
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
  const next = queue[0];
  const timeGoalsDisabled = settings?.dailyGoalMinutes === 0 && settings?.weeklyGoalMinutes === 0;
  const queueOffset = timer && !timer.cycleStudy ? 0 : 1;
  const completed = useMemo(() => cycleCompletions(sessions), [sessions]);
  const completedToday = completed.filter(s => s.date === today).length;
  const activeDiscipline = timer ? disciplines.find(d => d.id === timer.disciplineId) : null;
  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  const pct = Math.round(p.ratio * 100);
  const goalDone = p.goalMinutes > 0 && p.ratio >= 1;
  const nameOf = (id: string) => discMap.get(id)?.name ?? (id === 'simulado' ? 'Simulado Geral BNB' : 'Disciplina');

  return (
    <Card
      title="Missão de hoje"
      description={progressFraming(p.studiedMinutes, p.goalMinutes)}
      className="border-border-strong shadow-2xs"
    >
      <div className="space-y-6">
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-6">
          <section className="flex min-w-0 flex-col rounded-xl border border-primary/25 bg-primary-soft/60 p-5 max-sm:p-4 sm:p-6" aria-label="Sua próxima sessão">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg">
                  <Play className="size-4" aria-hidden="true" />
                </span>
                {timer ? 'Sessão em andamento' : 'Próxima atividade do ciclo'}
              </p>
              {!timer && next && <Badge tone="primary">Sessão {completed.length + 1}</Badge>}
            </div>

            <div className="my-6 max-sm:my-4 space-y-3">
              <div className="flex items-start gap-2.5">
                {(timer || next) && <span className="mt-2.5 shrink-0"><DisciplineDot color={timer ? activeDiscipline?.color ?? '#1E40AF' : next.discipline.color} className="size-3" /></span>}
                <h3 className="min-w-0 text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-3xl">
                  {timer ? nameOf(timer.disciplineId) : next?.discipline.name ?? 'Seu ciclo começa com uma disciplina'}
                </h3>
              </div>
              <p className="text-base leading-relaxed text-fg-muted">
                {timer ? timer.objective || 'Continue sua sessão de estudo.'
                  : next ? next.topic?.title ?? 'Estude a disciplina ou cadastre um assunto para orientar a sessão.'
                    : 'Adicione ou ative as disciplinas do seu edital para começar.'}
              </p>
              {(timer || next) && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
                {(timer || (next && !timeGoalsDisabled)) && <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-fg">
                  <Clock className="size-4 text-primary" aria-hidden="true" />
                  {timer ? timer.plannedSeconds / 60 : next.minutes} min
                </span>}
                {next && !timer && <span>{next.discipline.kind === 'technical' ? 'Conhecimentos específicos' : 'Conhecimentos básicos'}</span>}
              </div>}
            </div>

            <div className="mt-auto border-t border-primary/15 pt-5">
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
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-fg-muted">
                <Repeat2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Continue de onde parou. Sua posição no ciclo fica salva.
              </p>
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-border bg-surface p-5 max-sm:p-4 sm:p-6" aria-labelledby="mission-progress-title">
            <h3 id="mission-progress-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Target className="size-4 text-primary" aria-hidden="true" />
              Seu progresso hoje
            </h3>
            <div className="my-5 flex items-center gap-4">
              {p.goalMinutes > 0 && <ProgressRing
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
                {p.goalMinutes > 0 && <p className="text-xs text-fg-muted">{goalDone ? 'Meta diária cumprida' : `Meta diária: ${formatMinutes(p.goalMinutes)}`}</p>}
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-baseline justify-between gap-2">
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
                  className="!bg-surface-muted !ring-0"
                  showOverflow
                />
              ) : (
                <button type="button" onClick={onOpenSettings} className="min-h-11 text-left text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                  Definir meta diária de questões
                </button>
              )}
            </div>

            <div className="mt-5 space-y-3 rounded-lg bg-surface-muted p-3.5">
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

        <section className="border-t border-border pt-5" aria-labelledby="mission-queue-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <h3 id="mission-queue-title" className="text-sm font-semibold text-fg">Na sequência do ciclo</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">Uma atividade por vez, no seu ritmo.</p>
            </div>
            <button type="button" onClick={onOpenCycle} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              Ver ciclo de estudos <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          {next ? <ol className="grid gap-3 md:grid-cols-3" aria-label="Próximas atividades do ciclo">
            {queue.slice(queueOffset, queueOffset + 3).map((activity, index) => <li key={index} className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface-muted/40 p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold tabular-nums text-fg-muted">{completed.length + index + queueOffset + 1}.</span>
              <div className="min-w-0 space-y-1.5">
                <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-fg">
                  <span className="mt-1 shrink-0"><DisciplineDot color={activity.discipline.color} /></span>
                  {activity.discipline.name}
                </p>
                {activity.topic && <p className="text-xs leading-relaxed text-fg-muted">{activity.topic.title}</p>}
              </div>
            </li>)}
          </ol> : <p className="rounded-lg bg-surface-muted p-4 text-sm text-fg-muted">Ao ativar suas disciplinas, as próximas atividades aparecem aqui.</p>}
        </section>
      </div>
    </Card>
  );
}
