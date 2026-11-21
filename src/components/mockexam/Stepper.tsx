import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ExamStep = 1 | 2 | 3;

const STEPS = ['Enviar arquivos', 'Marcar respostas', 'Ver resultado'] as const;

/** Indicador de progresso do fluxo do simulado. */
export function Stepper({ current }: { current: ExamStep }) {
  return (
    <nav aria-label="Etapas do simulado">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, idx) => {
          const step = (idx + 1) as ExamStep;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? 'step' : undefined}>
              <span
                className={cn(
                  'flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done && 'bg-success text-status-fg',
                  active && 'bg-brand text-primary-fg',
                  !done && !active && 'bg-surface-muted text-fg-muted',
                )}
              >
                {done ? <Check className="size-3.5 sm:size-4" aria-hidden /> : step}
              </span>
              <span className={cn('wrap-anywhere text-xs sm:text-sm', active ? 'font-semibold text-fg' : 'text-fg-muted')}>
                {label}
                {done && <span className="sr-only"> (concluída)</span>}
              </span>
              {step < 3 && <span className={cn('hidden sm:block h-px flex-1', done ? 'bg-success' : 'bg-border')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
