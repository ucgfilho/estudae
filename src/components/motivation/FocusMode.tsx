import { useEffect, useRef } from 'react';
import { Coffee, Minimize2, Pause, Play, Square } from 'lucide-react';
import { Button } from '../ui/Button';
import { DisciplineDot } from '../ui/Display';
import { ProgressRing } from './ProgressRing';
import type { TimerState } from '../../db/types';
import { formatClock, formatMinutes } from '../../lib/format';

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
}

/**
 * Modo Foco: tela cheia com apenas o essencial (cronômetro, objetivo e
 * controles). Reduz carga cognitiva estranha e estímulos concorrentes
 * (Sweller; Mark et al. sobre custo de interrupções). Esc sai do modo.
 */
export function FocusMode({ timer, elapsed, disciplineName, disciplineColor, topicTitle, loading, onPause, onResume, onFinish, onExit }: FocusModeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const running = timer.status === 'running';
  const planned = timer.plannedSeconds;
  const reached = planned > 0 && elapsed >= planned;
  const remainingMin = Math.max(0, Math.ceil((planned - elapsed) / 60));

  useEffect(() => {
    const el = ref.current;
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
    return () => document.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Modo foco"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-canvas p-6 text-center animate-fade-in"
    >
      <div className="space-y-1">
        <div className="flex items-center justify-center gap-2 text-base font-semibold text-fg">
          <DisciplineDot color={disciplineColor} />
          {disciplineName}
        </div>
        {topicTitle && <p className="text-sm text-fg-muted">{topicTitle}</p>}
        {timer.objective && <p className="mx-auto max-w-lg text-sm text-fg-muted">{timer.objective}</p>}
      </div>

      <ProgressRing
        value={elapsed}
        max={planned || 1}
        label="Tempo decorrido da sessão em relação ao planejado"
        size={Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 64 : 320)}
        stroke={14}
      >
        <div>
          <div className="font-mono text-5xl font-bold tracking-tight text-fg tabular-nums sm:text-6xl">{formatClock(elapsed)}</div>
          <div className="mt-1 text-xs text-fg-subtle">
            {running ? 'Em foco' : 'Pausado'} · meta {formatMinutes(Math.round(planned / 60))}
          </div>
        </div>
      </ProgressRing>

      <p className="min-h-5 text-sm font-medium text-fg-muted" aria-live="polite">
        {reached ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Coffee className="size-4" aria-hidden /> Meta atingida. Pausa de 5 min recomendada antes do próximo bloco.
          </span>
        ) : remainingMin <= 5 && planned > 0 ? (
          `Reta final: faltam ${remainingMin} min.`
        ) : null}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {running ? (
          <Button data-autofocus variant="secondary" icon={<Pause className="size-4" aria-hidden />} onClick={onPause}>
            Pausar
          </Button>
        ) : (
          <Button data-autofocus variant="primary" icon={<Play className="size-4" aria-hidden />} onClick={onResume}>
            Continuar
          </Button>
        )}
        <Button variant="primary" icon={<Square className="size-4" aria-hidden />} onClick={onFinish} loading={loading}>
          Finalizar e Salvar
        </Button>
        <Button variant="ghost" icon={<Minimize2 className="size-4" aria-hidden />} onClick={onExit}>
          Sair do modo foco
        </Button>
      </div>

      <p className="text-[11px] text-fg-subtle">
        <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">Espaço</kbd> pausa/retoma ·{' '}
        <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd> sai do modo foco
      </p>
    </div>
  );
}
