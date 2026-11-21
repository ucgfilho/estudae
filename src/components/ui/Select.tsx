import { usePresence } from '../../lib/usePresence';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
  type ReactNode,
  type ReactElement,
  isValidElement,
  Children,
  type SelectHTMLAttributes,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
  placeholder?: string;
  options?: SelectOption[];
  onValueChange?: (value: string) => void;
}

/** Extrai recursivamente opções passadas via <option> children para construir a lista customizada. */
function parseChildrenOptions(children: ReactNode): SelectOption[] {
  const result: SelectOption[] = [];

  const traverse = (node: ReactNode) => {
    if (node === null || node === undefined || typeof node === 'boolean') return;

    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    if (isValidElement(node)) {
      const element = node as ReactElement<{
        value?: string | number;
        disabled?: boolean;
        children?: ReactNode;
      }>;

      if (element.type === 'option') {
        const val = element.props.value !== undefined ? String(element.props.value) : '';
        let label: string;
        const c = element.props.children;
        if (typeof c === 'string' || typeof c === 'number') {
          label = String(c);
        } else if (Array.isArray(c)) {
          label = c.map((part) => (typeof part === 'string' || typeof part === 'number' ? part : '')).join('');
        } else {
          label = val;
        }

        result.push({
          value: val,
          label: label || val,
          disabled: !!element.props.disabled,
        });
      } else if (element.props && element.props.children) {
        Children.forEach(element.props.children, traverse);
      }
    }
  };

  Children.forEach(children, traverse);
  return result;
}

/**
 * Dropdown customizado oficial da plataforma (UI-UX Pro Max).
 * Substitui o template nativo do navegador por um popover estilizado de acordo
 * com a paleta, tipografia, contraste e microinterações do app, com acessibilidade WAI-ARIA
 * e compatibilidade total com formulários e testes.
 */
export function Select({
  className,
  children,
  options: explicitOptions,
  value,
  defaultValue,
  onChange,
  onValueChange,
  placeholder,
  size = 'md',
  disabled = false,
  required = false,
  id: customId,
  name,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const listboxId = `${selectId}-listbox`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nativeSelectRef = useRef<HTMLSelectElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const popover = usePresence(isOpen, 120);
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(
    defaultValue !== undefined ? String(defaultValue) : ''
  );
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // Valor ativo (controlado ou não-controlado)
  const currentValue = value !== undefined ? String(value) : uncontrolledValue;

  // Lista consolidada de opções (memoizada para evitar disparos espúrios de efeitos)
  const parsedOptions = useMemo(() => parseChildrenOptions(children), [children]);
  const allOptions = explicitOptions || parsedOptions;

  // Encontra a opção selecionada atualmente
  const selectedOption = allOptions.find((opt) => opt.value === currentValue);

  // Posição flutuante do popover
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    openUp: boolean;
  }>({ left: 0, width: 0, openUp: false });

  const prevIsOpenRef = useRef(false);

  const scrollItemIntoView = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const itemEl = popoverRef.current?.querySelector(`[data-index="${index}"]`);
      if (itemEl && typeof itemEl.scrollIntoView === 'function') {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    });
  }, []);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Se espaço abaixo for menor que 220px e houver mais espaço acima, inverte para cima
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

    let left = rect.left;
    const width = Math.max(rect.width, 160);
    if (left + width > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - 8 - width);
    }

    setCoords({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? viewportHeight - rect.top + 4 : undefined,
      left,
      width,
      openUp,
    });
  }, []);

  // Atualiza posição e fecha em clique fora ou scroll do modal
  useEffect(() => {
    if (!isOpen) return;

    updateCoords();

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleScroll = (e: Event) => {
      // Se scroll ocorrer dentro do próprio popover, ignora completamente para não interferir no scroll
      const targetNode = e.target as Node | null;
      if (
        popoverRef.current &&
        (popoverRef.current === targetNode || popoverRef.current.contains(targetNode))
      ) {
        return;
      }
      updateCoords();
    };

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, updateCoords]);

  // Sincroniza índice destacado e rola até a opção selecionada uma única vez ao abrir
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const idx = allOptions.findIndex((opt) => opt.value === currentValue);
      const targetIdx = idx >= 0 ? idx : 0;
      setHighlightedIndex(targetIdx);
      scrollItemIntoView(targetIdx);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, currentValue, allOptions, scrollItemIntoView]);

  const handleSelectValue = (newValue: string) => {
    if (disabled) return;

    if (value === undefined) {
      setUncontrolledValue(newValue);
    }

    if (nativeSelectRef.current) {
      nativeSelectRef.current.value = newValue;
      const event = new Event('change', { bubbles: true });
      nativeSelectRef.current.dispatchEvent(event);
    }

    onChange?.({
      target: { value: newValue, name: name || '' },
      currentTarget: { value: newValue, name: name || '' },
    } as unknown as ChangeEvent<HTMLSelectElement>);

    onValueChange?.(newValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
    }

    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev + 1;
        while (next < allOptions.length && allOptions[next].disabled) next++;
        const target = next < allOptions.length ? next : prev;
        scrollItemIntoView(target);
        return target;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev - 1;
        while (next >= 0 && allOptions[next].disabled) next--;
        const target = next >= 0 ? next : prev;
        scrollItemIntoView(target);
        return target;
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < allOptions.length) {
        const opt = allOptions[highlightedIndex];
        if (!opt.disabled) {
          handleSelectValue(opt.value);
        }
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const char = e.key.toLowerCase();
      const matchIdx = allOptions.findIndex(
        (opt, i) => i > highlightedIndex && opt.label.toLowerCase().startsWith(char) && !opt.disabled
      );
      const fallbackIdx =
        matchIdx >= 0
          ? matchIdx
          : allOptions.findIndex((opt) => opt.label.toLowerCase().startsWith(char) && !opt.disabled);
      if (fallbackIdx >= 0) {
        setHighlightedIndex(fallbackIdx);
        scrollItemIntoView(fallbackIdx);
      }
    }
  };

  // Texto exibido no botão gatilho
  const displayText = selectedOption
    ? selectedOption.label
    : placeholder || (allOptions.length > 0 && allOptions[0].value === '' ? allOptions[0].label : 'Selecione...');

  const isPlaceholderSelected = !selectedOption || selectedOption.value === '';

  const sizeClasses = {
    sm: 'control-height-sm px-3 text-sm',
    md: 'control-height px-3 text-sm',
  };

  return (
    <div className="relative min-w-0 w-full">
      {/* Select nativo mantido oculto mas presente para compatibilidade com formulários e testes */}
      <select
        ref={nativeSelectRef}
        id={`${selectId}-native`}
        name={name}
        value={currentValue}
        onChange={(e) => {
          if (value === undefined) setUncontrolledValue(e.target.value);
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        disabled={disabled}
        className="sr-only"
        onFocus={() => triggerRef.current?.focus()}
        {...rest}
      >
        {children}
      </select>

      {/* Gatilho oficial da plataforma */}
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'input-base flex w-full items-center justify-between text-left cursor-pointer transition-all select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary',
          isOpen && 'ring-2 ring-primary/40 border-primary shadow-xs',
          sizeClasses[size],
          className
        )}
      >
        <span
          className={cn(
            'min-w-0 whitespace-normal wrap-anywhere mr-2',
            isPlaceholderSelected ? 'text-fg-subtle font-normal' : 'text-fg font-medium'
          )}
        >
          {displayText}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 text-fg-subtle transition-transform duration-200',
            size === 'sm' ? 'size-3.5' : 'size-4',
            isOpen && 'rotate-180 text-primary'
          )}
          aria-hidden="true"
        />
      </button>

      {/* Menu Popover Oficial Renderizado em Portal */}
      {popover.render &&
        createPortal(
          <div
            ref={popoverRef}
            data-state={popover.state}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel || 'Opções'}
            style={{
              position: 'fixed',
              top: coords.top !== undefined ? `${coords.top}px` : 'auto',
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
            className={cn(
              'z-50 max-h-60 max-lg:max-h-[min(20rem,50dvh)] overflow-y-auto overscroll-contain border-t border-border-strong bg-surface p-1 shadow-xl shadow-black/30',
              popover.state === 'open' ? 'animate-popover-in' : 'animate-popover-out pointer-events-none'
            )}
          >
            {allOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-fg-subtle text-center">Nenhuma opção disponível</div>
            ) : (
              allOptions.map((opt, index) => {
                const isSelected = opt.value === currentValue;
                const isHighlighted = index === highlightedIndex;
                const isItemPlaceholder = opt.value === '';

                return (
                  <div
                    key={`${opt.value}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      handleSelectValue(opt.value);
                    }}
                    onMouseEnter={() => {
                      if (!opt.disabled) setHighlightedIndex(index);
                    }}
                    className={cn(
                      'group flex items-center justify-between rounded-md cursor-pointer select-none transition-colors',
                      size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm',
                      'max-lg:min-h-11 max-lg:px-3 max-lg:text-sm',
                      isSelected
                        ? 'bg-primary/15 text-primary font-medium'
                        : isHighlighted
                        ? 'bg-surface-muted text-fg'
                        : isItemPlaceholder
                        ? 'text-fg-subtle italic'
                        : 'text-fg hover:bg-surface-muted',
                      opt.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                    )}
                  >
                    <span className="wrap-anywhere">{opt.label}</span>
                    {isSelected && (
                      <Check
                        className={cn(
                          'shrink-0 text-primary ml-2',
                          size === 'sm' ? 'size-3.5' : 'size-4'
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>,
          // Dentro de um <dialog> modal o popover precisa ficar na mesma camada (top layer).
          triggerRef.current?.closest('dialog') ?? document.body
        )}
    </div>
  );
}
