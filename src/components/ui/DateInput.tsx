import { useCallback, useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePresence } from '../../lib/usePresence';
import {
  WEEKDAY_LABELS,
  addMonths,
  formatMonthYear,
  isSameMonth,
  isValidDateKey,
  monthGrid,
  startOfMonth,
  todayKey,
} from '../../lib/dates';

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value?: string };

const toDisplay = (key: string) => (isValidDateKey(key) ? `${key.slice(8)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '');

/** Aplica a máscara dd/mm/aaaa enquanto o usuário digita. */
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** dd/mm/aaaa -> aaaa-mm-dd (somente datas reais), senão null. */
function parseDisplay(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const key = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidDateKey(key) && toDisplay(key) === text ? key : null;
}

/**
 * Campo de data no formato brasileiro (dd/mm/aaaa) com calendário próprio e animado.
 * O seletor nativo do navegador segue o idioma do navegador (mm/dd/yyyy) e não é estilizável,
 * por isso o campo é um texto mascarado. `onChange` continua recebendo `e.target.value` em
 * aaaa-mm-dd (ou '' quando vazio); datas incompletas/inválidas não disparam onChange.
 */
export function DateInput({ className, disabled, min, max, value, onChange, onBlur, ...rest }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfMonth(todayKey()));
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const presence = usePresence(open, 120);

  const [text, setText] = useState(() => toDisplay(value ?? ''));
  const [lastValue, setLastValue] = useState(value ?? '');
  if ((value ?? '') !== lastValue) {
    setLastValue(value ?? '');
    if (parseDisplay(text) !== (value ?? '') ) setText(toDisplay(value ?? ''));
  }

  const emit = (iso: string) => {
    onChange?.({ target: { value: iso }, currentTarget: { value: iso } } as unknown as ChangeEvent<HTMLInputElement>);
  };

  const selected = value && isValidDateKey(value) ? value : null;

  const place = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    const up = window.innerHeight - rect.bottom < 330 && rect.top > window.innerHeight - rect.bottom;
    setPos({
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onScroll = (e: Event) => {
      if (!popRef.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  const toggle = () => {
    if (disabled) return;
    if (!open) setView(startOfMonth(selected ?? todayKey()));
    setOpen((o) => !o);
  };

  const pick = (key: string) => {
    setText(toDisplay(key));
    setLastValue(key);
    emit(key);
    setOpen(false);
  };

  const today = todayKey();
  const isOutOfRange = (k: string) => (!!min && k < String(min)) || (!!max && k > String(max));

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        pattern="\d{2}/\d{2}/\d{4}"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const masked = maskDate(e.target.value);
          setText(masked);
          const iso = masked === '' ? '' : parseDisplay(masked);
          if (iso !== null) {
            setLastValue(iso);
            emit(iso);
          }
        }}
        onBlur={(e) => {
          // Texto incompleto/inválido ao sair do campo: volta para a última data válida.
          if (text !== '' && parseDisplay(text) === null) setText(toDisplay(value ?? ''));
          onBlur?.(e);
        }}
        className={cn('input-base control-height pr-10 max-lg:pr-11', className)}
        {...rest}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-label="Abrir calendário"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="absolute inset-y-0 right-0 flex w-9 max-lg:w-11 items-center justify-center rounded-r-md text-fg-subtle hover:text-primary disabled:opacity-50"
      >
        <CalendarDays className="size-4" aria-hidden />
      </button>

      {presence.render &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="Calendário"
            data-state={presence.state}
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: 280 }}
            className={cn(
              'z-[60] rounded-xl bg-surface p-3 text-fg shadow-xl shadow-black/30',
              presence.state === 'open' ? 'animate-popover-in' : 'animate-popover-out pointer-events-none',
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => setView((v) => addMonths(v, -1))}
                className="rounded p-1.5 max-lg:p-2.5 text-fg-muted hover:bg-surface-muted"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold capitalize">{formatMonthYear(view)}</span>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => setView((v) => addMonths(v, 1))}
                className="rounded p-1.5 max-lg:p-2.5 text-fg-muted hover:bg-surface-muted"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w} className="py-1 text-[10px] font-semibold uppercase text-fg-subtle">
                  {w.slice(0, 3)}
                </span>
              ))}
              {monthGrid(view).map((k) => {
                const isSel = k === selected;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={isOutOfRange(k)}
                    onClick={() => pick(k)}
                    aria-label={k}
                    aria-pressed={isSel}
                    className={cn(
                      'h-8 max-lg:h-9 max-lg:text-sm rounded-md text-xs transition-colors disabled:opacity-30',
                      isSel
                        ? 'bg-brand font-semibold text-primary-fg'
                        : isSameMonth(k, view)
                          ? 'text-fg hover:bg-surface-muted'
                          : 'text-fg-subtle hover:bg-surface-muted',
                      k === today && !isSel && 'ring-1 ring-primary/60',
                    )}
                  >
                    {Number(k.slice(8))}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between pt-2 text-xs">
              <button type="button" onClick={() => pick(today)} className="font-medium text-primary hover:underline max-lg:px-2 max-lg:py-2 max-lg:text-sm">
                Hoje
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-fg-muted hover:underline max-lg:px-2 max-lg:py-2 max-lg:text-sm">
                Fechar
              </button>
            </div>
          </div>,
          wrapRef.current?.closest('dialog') ?? document.body,
        )}
    </div>
  );
}
