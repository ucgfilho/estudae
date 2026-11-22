import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ProgressRingProps {
  value: number;
  max: number;
  /** Rótulo acessível (ex.: "Tempo estudado hoje em relação à meta"). */
  label: string;
  size?: number;
  stroke?: number;
  tone?: 'primary' | 'success' | 'accent';
  className?: string;
  /** Conteúdo central (ex.: percentual ou relógio). */
  children?: ReactNode;
}

const toneStroke = { primary: 'stroke-primary', success: 'stroke-success', accent: 'stroke-accent' } as const;

/**
 * Anel de progresso acessível (role="progressbar"). Torna a distância até a
 * meta sempre visível (efeito goal-gradient). Fica verde ao concluir, de modo
 * que a cor nunca é o único indicador: o texto central também muda.
 */
export function ProgressRing({ value, max, label, size = 120, stroke = 10, tone = 'primary', className, children }: ProgressRingProps) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.max(0, Math.min(1, ratio));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = ratio >= 1;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.round(max))}
      aria-valuenow={Math.round(Math.min(value, max))}
      aria-valuetext={`${Math.round(ratio * 100)}%`}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn('transition-[stroke-dashoffset] duration-400 ease-emphasized', done ? 'stroke-success' : toneStroke[tone])}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
