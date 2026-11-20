import { useEffect, useRef } from 'react';
import { Coffee, Minimize2, Pause, Play, Square } from 'lucide-react';
import { Button } from '../ui/Button';
import { DisciplineDot } from '../ui/Display';
import { StudyTimerDisplay } from './StudyTimerDisplay';
import type { TimerState } from '../../db/types';

interface FocusModeProps {
  timer: TimerState;
  elapsed: number;
  disciplineName: string;
  disciplineColor: string;
  topicTitle?: string | null;
  loading: boolean;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onExit: () => void;
  showTimeGoal?: boolean;
}

/**
 * Modo Foco: tela cheia com apenas o essencial (cronômetro, objetivo e
 * controles). Reduz carga cognitiva estranha e estímulos concorrentes
 * (Sweller; Mark et al. sobre custo de interrupções). Esc sai do modo.
 */
export function FocusMode({ timer, elapsed, disciplineName, disciplineColor, topicTitle, loading, onPause, onResume, onFinish, onExit, showTimeGoal = true }: FocusModeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const running = timer.status === 'running';
  const planned = timer.plannedSeconds;
  const reached = showTimeGoal && planned > 0 && elapsed >= planned;
  const remainingMin = Math.max(0, Math.ceil((planned - elapsed) / 60));

  useEffect(() => {
    const el = ref.current;
    const previousFocus = document.activeElement;
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onExit]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Modo foco"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-surface px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg-muted">Modo foco</p>
        <Button variant="ghost" icon={<Minimize2 className="size-4" aria-hidden />} onClick={onExit}>
          Sair do modo foco
        </Button>
      </header>

      <div className="mx-auto my-auto flex w-full max-w-2xl flex-col items-center gap-7 py-8 text-center sm:gap-9">
        <div className="max-w-md space-y-1">
          <p className="mb-3 text-xs font-medium text-fg-muted">{running ? 'Em foco' : 'Sessão pausada'}</p>
          <h2 className="flex items-center justify-center gap-2 text-base font-semibold text-fg sm:text-lg">
            <DisciplineDot color={disciplineColor} />
            {disciplineName}
          </h2>
          {topicTitle && <p className="text-sm text-fg-muted">{topicTitle}</p>}
          {timer.objective && timer.objective.trim() !== topicTitle && (
            <p className="text-sm text-fg-muted">{timer.objective}</p>
          )}
        </div>

        <StudyTimerDisplay elapsed={elapsed} planned={planned} showGoal={showTimeGoal} />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            data-autofocus
            variant="primary"
            icon={running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            onClick={running ? onPause : onResume}
          >
            {running ? 'Pausar' : 'Continuar'}
          </Button>
          <Button variant="secondary" icon={<Square className="size-4" aria-hidden />} onClick={onFinish} loading={loading}>
            Finalizar e salvar
          </Button>
        </div>

        <p className="min-h-5 text-sm font-medium text-fg-muted" aria-live="polite">
          {reached ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Coffee className="size-4" aria-hidden /> Meta atingida. Faça uma pausa de 5 min antes do próximo bloco.
            </span>
          ) : showTimeGoal && remainingMin <= 5 && planned > 0 ? (
            `Reta final: faltam ${remainingMin} min.`
          ) : null}
        </p>
      </div>

      <p className="hidden shrink-0 text-center text-xs text-fg-subtle lg:block">
        <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px]">Espaço</kbd> pausa/retoma ·{' '}
        <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px]">Esc</kbd> sai do modo foco
      </p>
    </div>
  );
}
