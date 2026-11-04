import {
  forwardRef,
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Select, type SelectProps, type SelectOption } from './Select';

export { Select, type SelectProps, type SelectOption };

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Um único controle (Input, Select, Textarea) que receberá id e atributos ARIA. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }>;
}

/** Associa rótulo, dica e mensagem de validação ao controle (acessibilidade). */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input-base h-9', className)} {...rest} />;
}

interface InputWithIconProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: ReactNode;
}

/** Campo com ícone fixo à esquerda. O ícone fica fora do fluxo e o texto nunca passa por baixo dele. */
export const InputWithIcon = forwardRef<HTMLInputElement, InputWithIconProps>(function InputWithIcon(
  { icon, className, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-fg-subtle [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <input ref={ref} className={cn('input-base input-with-icon h-10', className)} {...rest} />
    </div>
  );
});

export function Textarea({ className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn('input-base resize-y', className)} {...rest} />;
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

/** Template oficial de Checkbox baseado no design system da plataforma */
export function Checkbox({ label, description, className, id: customId, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const id = customId || generatedId;
  return (
    <label htmlFor={id} className={cn('group flex items-start gap-2.5 cursor-pointer select-none', className)}>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        {...rest}
      />
      <div
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded border border-border-strong bg-surface transition-all flex items-center justify-center',
          'group-hover:border-primary/70',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-surface',
          'peer-checked:bg-primary peer-checked:border-primary peer-checked:text-primary-fg',
          'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed'
        )}
        aria-hidden="true"
      >
        <Check className="size-3 stroke-[3] opacity-0 peer-checked:opacity-100 transition-opacity" />
      </div>
      <div className="text-sm text-fg">
        <span className="font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-subtle mt-0.5">{description}</span>}
      </div>
    </label>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

/** Template oficial de Radio button baseado no design system da plataforma */
export function Radio({ label, description, className, id: customId, ...rest }: RadioProps) {
  const generatedId = useId();
  const id = customId || generatedId;
  return (
    <label htmlFor={id} className={cn('group flex items-start gap-2.5 cursor-pointer select-none', className)}>
      <input
        id={id}
        type="radio"
        className="peer sr-only"
        {...rest}
      />
      <div
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded-full border border-border-strong bg-surface transition-all flex items-center justify-center',
          'group-hover:border-primary/70',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-surface',
          'peer-checked:border-primary peer-checked:bg-primary/10',
          'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed'
        )}
        aria-hidden="true"
      >
        <span className="size-2 rounded-full bg-primary opacity-0 scale-0 transition-all peer-checked:opacity-100 peer-checked:scale-100" />
      </div>
      <div className="text-sm text-fg">
        <span className="font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-subtle mt-0.5">{description}</span>}
      </div>
    </label>
  );
}
