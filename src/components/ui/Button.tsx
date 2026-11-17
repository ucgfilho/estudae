import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:brightness-95 border border-transparent shadow-2xs',
  secondary: 'bg-surface text-fg border border-border-strong hover:bg-surface-muted active:bg-surface-muted/80',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg active:bg-surface-muted/80 border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-85 border border-transparent',
  subtle: 'bg-primary-soft text-primary hover:brightness-95 active:brightness-90 border border-transparent',
};

// A mesma escala de altura é usada por campos, selects e botões.
const sizes: Record<Size, string> = {
  sm: 'control-height-sm px-3 text-sm gap-1.5',
  md: 'control-height px-4 text-sm gap-2',
  lg: 'control-height-lg px-5 text-sm gap-2',
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
        'inline-flex max-w-full shrink-0 items-center justify-center rounded-lg font-medium leading-5 text-center transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {(loading || icon) && (
        <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
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
  size?: 'xs' | Size;
}

const iconSizes: Record<'xs' | Size, string> = {
  xs: 'size-6 max-lg:size-11',
  sm: 'size-8 max-lg:size-11',
  md: 'size-10 max-lg:size-11',
  lg: 'size-11 max-lg:size-12',
};

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
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        iconSizes[size],
        className,
      )}
      {...rest}
    >
      <span className="inline-flex" aria-hidden="true">{icon}</span>
    </button>
  );
});
