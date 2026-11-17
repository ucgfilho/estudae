import { useEffect, useRef } from 'react';

interface ConfettiProps {
  /** Incrementar este valor dispara uma nova explosão. 0 = nada. */
  burst: number;
  intensity?: 'small' | 'big';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
}

const DURATION_MS = 1800;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cores da identidade BNB lidas dos tokens. */
function paletteFromTokens(): string[] {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return [read('--primary', '#1e40af'), read('--accent', '#d97706'), read('--success', '#07a684'), read('--info', '#0996b6'), '#ffcb05'];
}

/**
 * Confete leve em canvas (sem dependências), curto e não bloqueante:
 * `pointer-events: none`, oculto de leitores de tela e desativado quando o
 * usuário prefere movimento reduzido.
 */
export function Confetti({ burst, intensity = 'small' }: ConfettiProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!burst || prefersReducedMotion()) return;
    const canvas = ref.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext('2d') ?? null;
    } catch {
      ctx = null;
    }
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const colors = paletteFromTokens();
    const count = intensity === 'big' ? 140 : 60;
    // Origem: canto inferior direito (onde aparece o aviso) e, se "big", também à esquerda.
    const origins = intensity === 'big' ? [width * 0.2, width * 0.8] : [Math.max(width - 200, width * 0.6)];
    const particles: Particle[] = Array.from({ length: count }, (_, i) => {
      const ox = origins[i % origins.length];
      const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 1.3;
      const speed = 9 + Math.random() * (intensity === 'big' ? 9 : 6);
      return {
        x: ox,
        y: height + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        color: colors[i % colors.length],
      };
    });

    const start = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const elapsed = t - start;
      ctx!.clearRect(0, 0, width, height);
      const fade = Math.max(0, 1 - elapsed / DURATION_MS);
      for (const p of particles) {
        p.vy += 0.28; // gravidade
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx!.save();
        ctx!.globalAlpha = fade;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx!.restore();
      }
      if (elapsed < DURATION_MS) raf = requestAnimationFrame(frame);
      else ctx!.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx?.clearRect(0, 0, width, height);
    };
  }, [burst, intensity]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
