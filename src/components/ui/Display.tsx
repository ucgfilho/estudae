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
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-5 break-words', toneClasses[tone], className)}>
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
    <Tag className={cn('relative min-w-0 rounded-xl border border-border bg-surface', className)}>
      {(title || actions || onClose) && (
        <header
          className={cn(
            'relative flex flex-wrap items-start justify-between gap-3 border-b border-border px-[var(--panel-padding)] py-4',
            onClose && 'pr-14',
          )}
        >
          <div className="min-w-0 flex-1 basis-48">
            {title && <h2 className="section-title">{title}</h2>}
            {description && <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 max-lg:top-2 max-lg:right-2 inline-flex size-8 max-lg:size-11 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="size-4" />
            </button>
          )}
        </header>
      )}
      <div className={cn('panel-padding min-w-0', bodyClassName)}>{children}</div>
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
    <div className={cn('flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-5 py-10 text-center', className)}>
      {icon && <div className="text-fg-subtle" aria-hidden>{icon}</div>}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <div className="max-w-md text-sm leading-relaxed text-fg-muted">{description}</div>}
      {action && <div className="mt-1 max-w-full">{action}</div>}
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
        'relative flex items-start gap-3 rounded-xl p-4 pr-14 text-sm leading-relaxed max-sm:flex-wrap',
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
      {action && <div className="shrink-0 max-sm:basis-full max-sm:pl-6.5">{action}</div>}
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-2 right-2 inline-flex size-8 max-lg:size-11 shrink-0 items-center justify-center rounded-lg text-current/80 hover:text-current hover:bg-black/10 dark:hover:bg-white/15 transition-colors focus-visible:ring-2 focus-visible:ring-current"
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
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0 flex-1 basis-72 space-y-2">
        <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-fg leading-tight">{title}</h1>
        {description && <p className="max-w-prose text-sm text-fg-muted leading-relaxed">{description}</p>}
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-2 max-sm:w-full [&>*]:max-w-full">{actions}</div>
      )}
    </header>
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
    <div className="panel-padding flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {icon && <span className="text-fg-subtle" aria-hidden="true">{icon}</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight text-fg tabular-nums leading-tight break-words">{value}</p>
      {hint && <div className="text-xs leading-relaxed text-fg-muted">{hint}</div>}
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
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-8 max-lg:min-h-11 rounded-lg px-3 whitespace-nowrap text-sm font-medium transition-colors',
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
