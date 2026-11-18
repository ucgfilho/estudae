/**
 * Utilitários de data.
 *
 * Decisão: todas as datas "de calendário" são representadas como `DateKey`
 * (string `YYYY-MM-DD`) calculadas no fuso America/Bahia. A aritmética de dias
 * é feita sobre meia-noite UTC da chave, o que evita erros por fuso/horário de
 * verão. Instantes (início/fim de cronômetro) são timestamps ISO/epoch.
 */

export const TIMEZONE = 'America/Bahia';
export const LOCALE = 'pt-BR';

/** Data de calendário no formato YYYY-MM-DD. */
export type DateKey = string;

const keyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

const monthYearFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Converte um instante para a data de calendário em America/Bahia. */
export function toDateKey(value: Date | number | string = Date.now()): DateKey {
  return keyFormatter.format(new Date(value));
}

export function todayKey(now: number = Date.now()): DateKey {
  return toDateKey(now);
}

/** Horário HH:mm de um instante em America/Bahia. */
export function toTimeOfDay(value: Date | number | string): string {
  return timeFormatter.format(new Date(value));
}

export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  const d = keyToUTCDate(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function keyToUTCDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00Z`);
}

function utcDateToKey(d: Date): DateKey {
  return d.toISOString().slice(0, 10);
}

export function addDays(key: DateKey, days: number): DateKey {
  return utcDateToKey(new Date(keyToUTCDate(key).getTime() + days * DAY_MS));
}

/** Diferença em dias (a - b). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((keyToUTCDate(a).getTime() - keyToUTCDate(b).getTime()) / DAY_MS);
}

/** Índice do dia da semana com domingo = 0 e sábado = 6 (padrão de calendário). */
export function weekdayIndex(key: DateKey): number {
  return keyToUTCDate(key).getUTCDay();
}

/** Semana começa sempre no domingo e termina no sábado. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

export function endOfWeek(key: DateKey): DateKey {
  return addDays(startOfWeek(key), 6);
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DateKey): DateKey {
  const d = keyToUTCDate(startOfMonth(key));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return utcDateToKey(d);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const d = keyToUTCDate(startOfMonth(key));
  d.setUTCMonth(d.getUTCMonth() + months);
  return utcDateToKey(d);
}

/** Lista inclusiva de dias entre start e end. */
export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const days: DateKey[] = [];
  const total = diffDays(end, start);
  for (let i = 0; i <= total; i++) days.push(addDays(start, i));
  return days;
}

/** Grade mensal de 6 semanas iniciando no domingo. */
export function monthGrid(key: DateKey): DateKey[] {
  const first = startOfWeek(startOfMonth(key));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function isSameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function isWithin(key: DateKey, start: DateKey, end: DateKey): boolean {
  return key >= start && key <= end;
}

/** Formata uma DateKey em pt-BR. */
export function formatDate(key: DateKey, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
  if (!isValidDateKey(key)) return '—';
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(keyToUTCDate(key));
}

export function formatLongDate(key: DateKey): string {
  return formatDate(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatShortDate(key: DateKey): string {
  return isValidDateKey(key) ? shortDateFormatter.format(keyToUTCDate(key)) : '—';
}

export function formatMonthYear(key: DateKey): string {
  return isValidDateKey(key) ? monthYearFormatter.format(keyToUTCDate(key)) : '—';
}

export function formatWeekdayShort(key: DateKey): string {
  return formatDate(key, { weekday: 'short' }).replace('.', '');
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Instante (epoch ms) correspondente a uma data/hora em America/Bahia. */
export function zonedDateTimeToEpoch(key: DateKey, time: string): number {
  // America/Bahia não adota horário de verão desde 2012 (UTC-03:00).
  return new Date(`${key}T${time}:00-03:00`).getTime();
}
