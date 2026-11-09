import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:brightness-95 border border-transparent shadow-2xs',
  secondary: 'bg-surface text-fg border border-border-strong hover:bg-surface-muted active:bg-surface-muted/80',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg active:bg-surface-muted/80 border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-85 border border-transparent',
  subtle: 'bg-primary-soft text-primary hover:brightness-95 active:brightness-90 border border-transparent dark:hover:brightness-115',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {(loading || icon) && (
        <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden={loading || undefined}>
          {loading ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            icon
          )}
        </span>
      )}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
}

/** Botão somente com ícone; `label` é obrigatório para leitores de tela. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        size === 'sm' ? 'size-7' : 'size-9',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
