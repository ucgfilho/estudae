import { useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

type TimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value?: string };

const isValidTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/**
 * Campo de horário 24h (HH:MM). O seletor nativo muda de formato conforme o idioma do
 * navegador (AM/PM); este campo mantém o padrão brasileiro. `onChange` recebe
 * `e.target.value` como 'HH:MM' ou '' (horários incompletos/inválidos não disparam).
 */
export function TimeInput({ className, value, onChange, onBlur, ...rest }: TimeInputProps) {
  const [text, setText] = useState(value ?? '');
  const [lastValue, setLastValue] = useState(value ?? '');
  if ((value ?? '') !== lastValue) {
    setLastValue(value ?? '');
    if (text !== (value ?? '')) setText(value ?? '');
  }

  const emit = (v: string) =>
    onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLInputElement>);

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        maxLength={5}
        value={text}
        onChange={(e) => {
          const masked = maskTime(e.target.value);
          setText(masked);
          if (masked === '' || isValidTime(masked)) {
            setLastValue(masked);
            emit(masked);
          }
        }}
        onBlur={(e) => {
          if (text !== '' && !isValidTime(text)) setText(value ?? '');
          onBlur?.(e);
        }}
        className={cn('input-base h-9 pr-9 max-lg:h-11', className)}
        {...rest}
      />
      <Clock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}
