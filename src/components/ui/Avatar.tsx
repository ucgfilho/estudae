import { cn } from '../../lib/utils';

interface AvatarProps {
  name: string;
  src?: string | null;
  /** Tamanhos fixos para evitar que o avatar mude de dimensão entre telas. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-14 text-lg',
  xl: 'size-24 text-3xl',
} as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary',
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={`Foto de ${name}`} className="size-full object-cover" draggable={false} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}
