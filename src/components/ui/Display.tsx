import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-fg-muted border-border',
  primary: 'bg-primary-soft text-primary border-transparent',
  accent: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', toneClasses[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Card({
  title,
  description,
  actions,
  onClose,
  children,
  className,
  bodyClassName,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={cn('relative rounded-xl border border-border bg-surface', className)}>
      {(title || actions || onClose) && (
        <header
          className={cn(
            'relative flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3',
            onClose && 'pr-11',
          )}
        >
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2.5 right-2.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="size-4" />
            </button>
          )}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Tag>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
  showOverflow?: boolean;
}

/** Barra de progresso acessível (role="progressbar"). */
export function ProgressBar({ value, max, label, tone = 'primary', className, showOverflow = false }: ProgressBarProps) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const bar = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.round(max))}
      aria-valuenow={Math.round(Math.min(value, Math.max(max, value)))}
      aria-valuetext={`${Math.round(ratio * 100)}%`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', bar, showOverflow && ratio > 1 && 'bg-success')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center', className)}>
      {icon && <div className="text-fg-subtle" aria-hidden>{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <div className="max-w-md text-sm text-fg-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Carregando…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-sm text-fg-muted', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

function getAlertStorageKey(dismissKey?: string, title?: string, tone?: string): string | null {
  if (dismissKey) return `alert_dismissed:${dismissKey}`;
  if (title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 60);
    return `alert_dismissed:${tone || 'info'}_${slug}`;
  }
  return null;
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  action,
  onClose,
  dismissKey,
  once = false,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
  onClose?: () => void;
  dismissKey?: string;
  once?: boolean;
}) {
  const storageKey = getAlertStorageKey(dismissKey, title, tone);

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const handleClose = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, 'true');
      } catch {
        // ignore storage errors
      }
    }
    setDismissed(true);
    if (onClose) {
      onClose();
    }
  }, [storageKey, onClose]);

  // If once=true, mark as seen so it only displays once and never re-appears on reload or tab switch
  useEffect(() => {
    if (once && storageKey && !dismissed) {
      try {
        localStorage.setItem(storageKey, 'true');
      } catch {
        // ignore
      }
    }
  }, [once, storageKey, dismissed]);

  // Success messages auto-dismiss after 5 seconds
  useEffect(() => {
    if (tone === 'success' && !dismissed) {
      const timer = setTimeout(() => {
        handleClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [tone, dismissed, handleClose]);

  if (dismissed) return null;

  const Icon = alertIcons[tone];

  return (
    <div
      className={cn(
        'relative flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 pr-9 text-sm',
        toneClasses[tone],
        className,
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5 opacity-90' : 'font-medium')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-2 right-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-current/80 hover:text-current hover:bg-black/10 dark:hover:bg-white/15 transition-all focus:outline-none focus:ring-2 focus:ring-current cursor-pointer"
        aria-label="Fechar mensagem"
        title="Fechar mensagem"
      >
        <X className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg leading-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-fg-muted leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {icon && <span className="text-fg-subtle" aria-hidden="true">{icon}</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight text-fg tabular-nums leading-none">{value}</p>
      {hint && <div className="text-xs text-fg-subtle">{hint}</div>}
      {children}
    </div>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Grupo de opções exclusivas (botões com aria-pressed). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: SegmentedOption<T>[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DisciplineDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} aria-hidden />;
}
