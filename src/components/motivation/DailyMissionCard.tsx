import { useMemo } from 'react';
import { CheckCircle2, Circle, Flame, Play, Clock, ArrowRight } from 'lucide-react';
import { Card, DisciplineDot, ProgressBar, Badge } from '../ui/Display';
import { Button } from '../ui/Button';
import { ProgressRing } from './ProgressRing';
import { dailyProgress, nextPendingToday, progressFraming } from '../../domain/motivation';
import type { Discipline, QuestionLog, Settings, StudySession } from '../../db/types';
import { formatInteger, formatMinutes } from '../../lib/format';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/utils';

interface DailyMissionCardProps {
  sessions: readonly StudySession[];
  logs: readonly QuestionLog[];
  settings: Settings | undefined;
  disciplines: readonly Discipline[];
  today: string;
  streak: number;
  nextPlanned?: StudySession | null;
  onStartBlock: (sessionId: string) => void;
  onStudyNow: () => void;
  onOpenSettings: () => void;
}

const MAX_ITEMS = 5;

/**
 * "Missão de Hoje": painel central de execução do dia (Regra dos 3 segundos).
 * - Destaca em primeiro plano a próxima tarefa de estudo com a única ação primária da tela;
 * - Anel de tempo estudado hoje em relação à meta diária;
 * - Checklist enxuto dos blocos programados para hoje.
 */
export function DailyMissionCard({
  sessions,
  logs,
  settings,
  disciplines,
  today,
  streak,
  nextPlanned,
  onStartBlock,
  onStudyNow,
  onOpenSettings,
}: DailyMissionCardProps) {
  const p = useMemo(() => dailyProgress(sessions, logs, settings, today), [sessions, logs, settings, today]);
  const nextToday = useMemo(() => nextPendingToday(sessions, today), [sessions, today]);
  const primaryTask = nextToday ?? nextPlanned ?? null;
  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  const pct = Math.round(p.ratio * 100);
  const goalDone = p.ratio >= 1;
  const scheduleDone = p.scheduled.length > 0 && p.scheduledDone === p.scheduled.length;
  const pendingBlocks = p.scheduled.length - p.scheduledDone;
  const nameOf = (id: string) => discMap.get(id)?.name ?? (id === 'simulado' ? 'Simulado Geral BNB' : 'Disciplina');
  const colorOf = (id: string) => discMap.get(id)?.color ?? '#A6193C';

  return (
    <Card
      title="Missão de Hoje"
      description={progressFraming(p.studiedMinutes, p.goalMinutes)}
      className="border-border-strong shadow-2xs"
    >
      <div className="space-y-5">
        {/* Prioridade #1: Próxima Tarefa de Estudo (Regra dos 3 segundos + Uma ação principal) */}
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/25 bg-primary-soft/35 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-primary">
                {nextToday
                  ? 'Próxima tarefa de hoje'
                  : primaryTask
                    ? `Próxima sessão (${formatDate(primaryTask.date)})`
                    : 'Execução imediata'}
              </span>
              {primaryTask && (
                <Badge tone="neutral" className="tabular-nums">
                  <Clock className="size-3" aria-hidden="true" />
                  {primaryTask.plannedMinutes} min
                </Badge>
              )}
              {primaryTask?.plannedStart && (
                <Badge tone="neutral" className="tabular-nums">
                  às {primaryTask.plannedStart}
                </Badge>
              )}
            </div>

            {primaryTask ? (
              <>
                <div className="flex items-center gap-2 text-base sm:text-lg font-bold text-fg">
                  <DisciplineDot color={colorOf(primaryTask.disciplineId)} className="size-3" />
                  <span className="truncate">{nameOf(primaryTask.disciplineId)}</span>
                </div>
                <p className="text-sm text-fg-muted line-clamp-1">
                  {primaryTask.objective || 'Bloco programado no seu plano de estudos.'}
                </p>
              </>
            ) : (
              <>
                <div className="text-base sm:text-lg font-bold text-fg">
                  {goalDone ? 'Meta diária cumprida' : 'Iniciar bloco de estudo'}
                </div>
                <p className="text-sm text-fg-muted">
                  {goalDone
                    ? 'Meta do dia atingida. Inicie uma sessão extra se quiser aprofundar.'
                    : 'Nenhuma sessão pendente agendada. Inicie um estudo avulso com cronômetro.'}
                </p>
              </>
            )}
          </div>

          <div className="shrink-0">
            {primaryTask ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                icon={<Play className="size-4" aria-hidden="true" />}
                onClick={() => onStartBlock(primaryTask.id)}
              >
                Começar próximo bloco
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                icon={<Play className="size-4" aria-hidden="true" />}
                onClick={onStudyNow}
              >
                {goalDone ? 'Estudar mais' : 'Estudar agora'}
              </Button>
            )}
          </div>
        </div>

        {/* Prioridades #2 e #3: Meta Diária, Tempo no Dia e Blocos do Dia */}
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

          {/* Checklist do cronograma de hoje */}
          <div className="min-w-0 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg-muted">Blocos de hoje</h3>
              {p.scheduled.length > 0 && (
                <span className={cn('text-xs font-medium tabular-nums', scheduleDone ? 'text-success' : 'text-fg-muted')}>
                  {p.scheduledDone} de {p.scheduled.length} concluídos
                </span>
              )}
            </div>
            {p.scheduled.length > 0 ? (
              <>
                <ProgressBar
                  value={p.scheduledDone}
                  max={p.scheduled.length}
                  label="Blocos do cronograma de hoje concluídos"
                  tone={scheduleDone ? 'success' : 'primary'}
                />
                <ul className="space-y-1 pt-1">
                  {p.scheduled.slice(0, MAX_ITEMS).map((s) => {
                    const done = s.status === 'concluida';
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-muted/50">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {done ? (
                            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                          ) : (
                            <Circle className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                          )}
                          <DisciplineDot color={colorOf(s.disciplineId)} />
                          <span className={cn('min-w-0 flex-1 truncate', done ? 'text-fg-muted line-through' : 'text-fg font-medium')}>
                            {nameOf(s.disciplineId)}
                          </span>
                        </div>
                        {done ? (
                          <span className="shrink-0 text-xs font-medium text-success">Feito</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onStartBlock(s.id)}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fg-muted hover:text-primary transition-colors tabular-nums"
                            title="Iniciar este bloco"
                          >
                            <span>{s.plannedMinutes} min</span>
                            <ArrowRight className="size-3" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {p.scheduled.length > MAX_ITEMS && (
                  <p className="text-xs text-fg-subtle">+{p.scheduled.length - MAX_ITEMS} blocos programados hoje</p>
                )}
                {pendingBlocks > 0 && (
                  <p className="text-xs text-fg-muted">
                    {pendingBlocks === 1 ? 'Falta 1 bloco para fechar o dia.' : `Faltam ${pendingBlocks} blocos para fechar o dia.`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-fg-muted">
                Nenhum bloco agendado para hoje. Qualquer sessão estudada contabiliza na sua meta diária.
              </p>
            )}
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
                <button type="button" onClick={onOpenSettings} className="text-xs font-medium text-primary hover:underline">
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
