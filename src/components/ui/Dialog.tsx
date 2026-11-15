import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePresence } from '../../lib/usePresence';
import { IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

/**
 * Diálogo modal baseado no elemento nativo <dialog> (foco preso, Esc para
 * fechar e retorno de foco ao elemento de origem).
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  const { render, state } = usePresence(open, 180);

  // O <dialog> nativo só é fechado depois da animação de saída.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (render && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!render && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [render]);

  return (
    <dialog
      ref={ref}
      data-state={state}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={cn(
        'm-auto w-[calc(100%-1.5rem)] rounded-xl border border-border bg-surface p-0 text-fg shadow-lg',
        'max-h-[calc(100dvh-2rem)]',
        sizes[size],
        // Smartphones: folha inferior (bottom sheet) ocupando toda a largura.
        'max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:max-h-[92dvh]',
      )}
    >
      {render && (
        <div className="flex max-h-[calc(100dvh-2rem)] max-sm:max-h-[92dvh] flex-col">
          <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
          <div className="relative flex items-start justify-between gap-4 border-b border-border px-5 py-4 pr-12 max-sm:px-4 max-sm:pt-2 max-sm:pr-14">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-0.5 text-sm text-fg-muted">
                  {description}
                </div>
              )}
            </div>
            <IconButton
              label="Fechar"
              icon={<X className="size-4" />}
              onClick={onClose}
              size="sm"
              className="absolute top-3.5 right-3.5 max-sm:top-1 max-sm:right-2"
            />
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4 max-sm:px-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 max-sm:px-4 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:[&>*]:flex-1">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
