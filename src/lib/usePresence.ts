import { useEffect, useState } from 'react';

/**
 * Mantém o elemento montado durante a animação de saída.
 * `render` indica se deve ser renderizado; `state` ('open' | 'closed') alimenta o data-state.
 */
export function usePresence(open: boolean, exitMs = 160) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, mounted, exitMs]);

  return { render: open || mounted, state: open ? ('open' as const) : ('closed' as const) };
}
