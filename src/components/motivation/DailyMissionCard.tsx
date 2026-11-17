import { useMemo } from 'react';
import { Flame, Play, Clock, ArrowRight, Repeat2 } from 'lucide-react';
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
  const queueOffset = timer && !timer.cycleStudy ? 0 : 1;
  const completed = useMemo(() => cycleCompletions(sessions), [sessions]);
  const completedToday = completed.filter(s => s.date === today).length;
  const activeDiscipline = timer ? disciplines.find(d => d.id === timer.disciplineId) : null;
  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  const pct = Math.round(p.ratio * 100);
  const goalDone = p.ratio >= 1;
  const nameOf = (id: string) => discMap.get(id)?.name ?? (id === 'simulado' ? 'Simulado Geral BNB' : 'Disciplina');

  return (
    <Card
      title="Missão de hoje"
      description={progressFraming(p.studiedMinutes, p.goalMinutes)}
      className="border-border-strong shadow-2xs"
    >
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/25 bg-primary-soft/35 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-primary">
                {timer ? 'Sessão em andamento' : 'Próxima atividade do ciclo'}
              </span>
              {(timer || next) && <Badge tone="neutral" className="tabular-nums">
                <Clock className="size-3" aria-hidden="true" />
                {timer ? timer.plannedSeconds / 60 : next.minutes} min
              </Badge>}
              {!timer && next && <Badge tone="primary">Sessão {completed.length + 1}</Badge>}
            </div>
            <div className="flex items-center gap-2 text-base font-bold text-fg sm:text-lg">
              {(timer || next) && <DisciplineDot color={timer ? activeDiscipline?.color ?? '#1E40AF' : next.discipline.color} className="size-3" />}
              <span>{timer ? nameOf(timer.disciplineId) : next?.discipline.name ?? 'Seu ciclo começa com uma disciplina'}</span>
            </div>
            <p className="text-sm text-fg-muted">
              {timer ? timer.objective || 'Continue sua sessão de estudo.'
                : next ? next.topic?.title ?? 'Estude a disciplina ou cadastre um assunto para orientar a sessão.'
                  : 'Adicione ou ative as disciplinas do seu edital para começar.'}
            </p>
            {next && !timer && <p className="text-xs text-fg-muted">{next.reason}</p>}
          </div>
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
        </div>

        {/* Prioridades #2 e #3: Meta diária, tempo estudado e sequência do ciclo */}
        <div className="grid grid-cols-1 gap-6 pt-1 md:grid-cols-[auto_1fr_1fr] md:items-center">
          {/* Anel de tempo */}
          <div className="flex items-center gap-4 md:flex-col md:gap-2">
            <ProgressRing
              value={p.studiedMinutes}
              max={p.goalMinutes}
              label="Tempo estudado hoje em relação à meta diária"
              size={108}
            >
              <div>
                <div className="text-2xl font-bold tabular-nums text-fg">{Math.min(pct, 999)}%</div>
                <div className="text-[11px] text-fg-subtle">{goalDone ? 'meta cumprida' : 'da meta'}</div>
              </div>
            </ProgressRing>
            <div className="text-sm md:text-center">
              <div className="font-semibold tabular-nums text-fg">{formatMinutes(p.studiedMinutes)}</div>
              <div className="text-xs text-fg-muted">meta: {formatMinutes(p.goalMinutes)}</div>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">Seu ciclo contínuo</h3>
              <span className="text-xs font-medium text-success">
                {completedToday === 1 ? '1 sessão do ciclo concluída hoje' : `${completedToday} sessões do ciclo concluídas hoje`}
              </span>
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
              <Repeat2 className="size-4 shrink-0" aria-hidden="true" />
              Sua posição fica salva. A sequência avança a cada sessão do ciclo concluída, no seu ritmo.
            </p>
            {next && <>
              <h4 className="text-xs font-semibold text-fg-muted">Na sequência</h4>
              <ol className="space-y-2" aria-label="Próximas atividades do ciclo">
                {queue.slice(queueOffset, queueOffset + 3).map((activity, index) => <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-xs tabular-nums text-fg-subtle pt-0.5">{completed.length + index + queueOffset + 1}.</span>
                  <span className="mt-1.5"><DisciplineDot color={activity.discipline.color} /></span>
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{activity.discipline.name}</p>
                    {activity.topic && <p className="text-xs text-fg-muted">{activity.topic.title}</p>}
                  </div>
                </li>)}
              </ol>
            </>}
            <button type="button" onClick={onOpenCycle} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ver ciclo de estudos <ArrowRight className="size-3" aria-hidden="true" />
            </button>
          </div>

          {/* Questões hoje e constância */}
          <div className="space-y-3 border-t border-border pt-3 md:border-t-0 md:border-l md:pl-5 md:pt-0">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg-muted">Questões hoje</h3>
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
                  showOverflow
                />
              ) : (
                <button type="button" onClick={onOpenSettings} className="text-xs font-medium text-primary hover:underline max-lg:min-h-9 max-lg:py-2">
                  Definir meta diária de questões
                </button>
              )}
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-surface-muted/60 px-3 py-2">
              <Flame className={cn('size-4 shrink-0', streak > 0 ? 'text-accent' : 'text-fg-subtle')} aria-hidden="true" />
              <div className="text-xs">
                <span className="font-semibold tabular-nums text-fg">
                  {streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}
                </span>
                <span className="block text-fg-muted">
                  {p.studiedMinutes > 0
                    ? 'Sequência mantida hoje.'
                    : streak > 0
                      ? 'Estude hoje para manter a sequência.'
                      : 'Comece sua sequência hoje.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
