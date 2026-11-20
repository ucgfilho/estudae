import { formatClock, formatMinutes } from '../../lib/format';

interface StudyTimerDisplayProps {
  elapsed: number;
  planned: number;
  showGoal?: boolean;
}

export function StudyTimerDisplay({ elapsed, planned, showGoal = true }: StudyTimerDisplayProps) {
  const progress = planned > 0 ? Math.min(elapsed / planned, 1) : 0;

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div
        role="timer"
        aria-label="Tempo de estudo"
        className="tabular-nums whitespace-nowrap text-[clamp(2.75rem,12vw,7rem)] leading-none font-light tracking-[-0.045em] text-fg"
      >
        {formatClock(elapsed)}
      </div>
      {showGoal && planned > 0 && (
        <div className="mx-auto w-full max-w-64 space-y-2">
          <progress
            aria-label="Progresso da meta da sessão"
            value={progress}
            max={1}
            className="study-timer-progress block w-full"
          />
          <p className="text-xs font-medium text-fg-muted">
            Meta de {formatMinutes(Math.round(planned / 60))}
          </p>
        </div>
      )}
    </div>
  );
}
