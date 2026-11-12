import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Arrastar para reordenar listas verticais com a mesma mecânica do cronograma:
 * ponteiro + fantasma clonado (levanta, inclina e acompanha o cursor), irmãos
 * deslizam com translate3d abrindo espaço, encaixe animado ao soltar, Esc cancela,
 * auto-rolagem nas bordas e, em toques, só a alça `[data-drag-handle]` inicia o arrasto.
 *
 * Marcação: cada item tem `data-sort-id` e fica dentro de um contêiner com
 * `data-sort-group="<chave>"`. `onReorder` recebe o id solto e o id do irmão
 * que passa a ficar logo depois dele (`null` = fim da lista).
 */
export function useSortableDrag(onReorder: (draggedId: string, beforeId: string | null, group: string) => void) {
  const cancelRef = useRef<(() => void) | null>(null);
  const latest = useRef(onReorder);
  latest.current = onReorder;

  useEffect(() => () => cancelRef.current?.(), []);

  return useCallback((e: ReactPointerEvent<HTMLElement>, id: string, group: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (cancelRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;
    if (e.pointerType !== 'mouse' && !target.closest('[data-drag-handle]')) return;

    const sourceEl = e.currentTarget;
    const container = sourceEl.closest<HTMLElement>(`[data-sort-group="${CSS.escape(group)}"]`);
    if (!container) return;
    const scroller = (container.closest('main') as HTMLElement | null) ?? null;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const rect = sourceEl.getBoundingClientRect();
    const d = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      left: rect.left,
      top: rect.top,
      lastX: e.clientX,
      lastY: e.clientY,
      active: false,
      ghost: null as HTMLElement | null,
      raf: null as number | null,
      scroll0: scroller?.scrollTop ?? 0,
      others: [] as { el: HTMLElement; id: string; top: number; bottom: number }[],
      srcIdx: 0,
      idx: 0,
      step: 0,
      gap: 0,
      prevCursor: '',
      prevSelect: '',
    };

    const applyShifts = () => {
      d.others.forEach((o, i) => {
        let shift = 0;
        if (i >= d.srcIdx && i < d.idx) shift = -d.step;
        else if (i < d.srcIdx && i >= d.idx) shift = d.step;
        o.el.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : 'translate3d(0, 0, 0)';
      });
    };

    const updateTarget = () => {
      const center = d.lastY - d.offsetY + rect.height / 2 + (scroller?.scrollTop ?? 0);
      let idx = 0;
      for (const o of d.others) {
        const mid = (o.top + o.bottom) / 2;
        if (center > mid) idx += 1;
      }
      if (idx !== d.idx) {
        d.idx = idx;
        applyShifts();
      }
    };

    const moveGhost = () => {
      if (!d.ghost) return;
      const dx = d.lastX - d.offsetX - d.left;
      const dy = d.lastY - d.offsetY - d.top;
      d.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(1.5deg) scale(1.03)`;
    };

    const autoScroll = () => {
      d.raf = null;
      if (!d.active) return;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const edge = 72;
        let speed = 0;
        if (d.lastY < r.top + edge) speed = -Math.ceil(((r.top + edge - d.lastY) / edge) * 16);
        else if (d.lastY > r.bottom - edge) speed = Math.ceil(((d.lastY - (r.bottom - edge)) / edge) * 16);
        if (speed !== 0) {
          const before = scroller.scrollTop;
          scroller.scrollTop += speed;
          if (scroller.scrollTop !== before) updateTarget();
        }
      }
      d.raf = requestAnimationFrame(autoScroll);
    };

    const startDrag = () => {
      d.active = true;
      const siblings = Array.from(container.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement && c.dataset.sortId !== undefined,
      );
      d.srcIdx = siblings.findIndex((c) => c === sourceEl);
      siblings.forEach((el) => {
        if (el === sourceEl) return;
        const r = el.getBoundingClientRect();
        d.others.push({ el, id: el.dataset.sortId as string, top: r.top + d.scroll0, bottom: r.bottom + d.scroll0 });
      });
      d.idx = d.srcIdx;
      const next = siblings[d.srcIdx + 1];
      const prev = siblings[d.srcIdx - 1];
      d.gap = next
        ? next.getBoundingClientRect().top - rect.bottom
        : prev
        ? rect.top - prev.getBoundingClientRect().bottom
        : 0;
      d.step = rect.height + d.gap;

      d.others.forEach((o) => {
        o.el.style.transition = reduce ? 'none' : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        o.el.style.willChange = 'transform';
      });

      const ghost = sourceEl.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-sort-id');
      ghost.removeAttribute('id');
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${d.left}px`,
        top: `${d.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        zIndex: '80',
        pointerEvents: 'none',
        cursor: 'grabbing',
        opacity: '0.96',
        transformOrigin: `${d.offsetX}px ${d.offsetY}px`,
        boxShadow: '0 18px 36px -12px rgba(0,0,0,0.45)',
        willChange: 'transform',
      });
      document.body.appendChild(ghost);
      d.ghost = ghost;
      sourceEl.style.visibility = 'hidden';
      d.prevCursor = document.body.style.cursor;
      d.prevSelect = document.body.style.userSelect;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      (document.activeElement as HTMLElement | null)?.blur?.();
      moveGhost();
      if (!reduce && typeof ghost.animate === 'function') {
        ghost.animate(
          [
            { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
            { transform: ghost.style.transform, boxShadow: '0 18px 36px -12px rgba(0,0,0,0.45)' },
          ],
          { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
      }
      d.raf = requestAnimationFrame(autoScroll);
    };

    const cleanup = () => {
      d.others.forEach((o) => {
        o.el.style.transition = '';
        o.el.style.transform = '';
        o.el.style.willChange = '';
      });
      sourceEl.style.visibility = '';
      d.ghost?.remove();
    };

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (d.raf !== null) cancelAnimationFrame(d.raf);
      d.raf = null;
      if (d.active) {
        document.body.style.cursor = d.prevCursor;
        document.body.style.userSelect = d.prevSelect;
      }
      window.removeEventListener('keydown', onKey);
      cancelRef.current = null;
    };

    const animateGhostTo = (dx: number, dy: number, done: () => void) => {
      const ghost = d.ghost;
      if (!ghost || reduce || typeof ghost.animate !== 'function') return done();
      const a = ghost.animate(
        [
          { transform: ghost.style.transform },
          { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(1)`, boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
        ],
        { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
      );
      a.onfinish = done;
      a.oncancel = done;
    };

    const finish = (cancelled: boolean) => {
      const wasActive = d.active;
      detach();
      if (!wasActive) return;
      const scrollDelta = (scroller?.scrollTop ?? 0) - d.scroll0;
      const changed = d.idx !== d.srcIdx;
      if (cancelled || !changed) {
        d.others.forEach((o) => (o.el.style.transform = 'translate3d(0, 0, 0)'));
        animateGhostTo(0, scrollDelta ? -scrollDelta : 0, cleanup);
        return;
      }
      let slotTop: number;
      if (d.idx <= d.srcIdx) slotTop = d.others[d.idx].top - d.scroll0;
      else slotTop = d.others[d.idx - 1].bottom - d.scroll0 - d.step + d.gap;
      slotTop -= scrollDelta;
      const beforeId = d.idx < d.others.length ? d.others[d.idx].id : null;
      animateGhostTo(0, slotTop - d.top, () => {
        cleanup();
        latest.current(id, beforeId, group);
      });
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return;
      d.lastX = ev.clientX;
      d.lastY = ev.clientY;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 5) return;
        startDrag();
      }
      ev.preventDefault();
      moveGhost();
      updateTarget();
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === d.pointerId) finish(false);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === d.pointerId) finish(true);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') finish(true);
    };

    cancelRef.current = () => finish(true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  }, []);
}
