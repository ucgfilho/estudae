import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, GraduationCap, Search, Sparkles, X } from 'lucide-react';
import {
  CONTEST_CATALOG,
  getContestCatalogItem,
  type ContestCatalogItem,
} from '../../domain/contests';
import { cn } from '../../lib/utils';

interface ContestSearchSelectProps {
  value: string;
  onChange: (contestId: string, template: ContestCatalogItem | undefined) => void;
  customName?: string;
  onCustomNameChange?: (name: string) => void;
  customRole?: string;
  onCustomRoleChange?: (role: string) => void;
  disabled?: boolean;
  label?: string;
}

export function ContestSearchSelect({
  value,
  onChange,
  customName = '',
  onCustomNameChange,
  customRole = '',
  onCustomRoleChange,
  disabled = false,
  label = 'Qual concurso você vai prestar?',
}: ContestSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedTemplate = useMemo(
    () => (value ? getContestCatalogItem(value) : undefined),
    [value],
  );

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  const filteredContests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CONTEST_CATALOG;
    return CONTEST_CATALOG.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sigla.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.banca.toLowerCase().includes(q),
    );
  }, [query]);

  const groupedContests = useMemo(() => {
    const map = new Map<string, ContestCatalogItem[]>();
    for (const item of filteredContests) {
      const group = map.get(item.category) ?? [];
      group.push(item);
      map.set(item.category, group);
    }
    return Array.from(map.entries());
  }, [filteredContests]);

  return (
    <div ref={containerRef} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-fg">
          {label} <span className="text-danger">*</span>
        </label>
        {selectedTemplate && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            <Check className="size-3" />
            Concurso selecionado
          </span>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="contest-dropdown-trigger"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition',
            selectedTemplate
              ? 'border-primary/50 bg-primary-soft/15 text-fg'
              : 'border-border-strong bg-surface text-fg-muted hover:border-primary/40',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="size-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-xs"
              style={{
                backgroundColor: selectedTemplate ? selectedTemplate.color : '#a6193c',
              }}
            >
              {selectedTemplate ? (
                selectedTemplate.sigla.slice(0, 4)
              ) : (
                <GraduationCap className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              {selectedTemplate ? (
                <>
                  <div className="font-semibold text-fg truncate text-xs sm:text-sm">
                    {selectedTemplate.name}
                  </div>
                  <div className="text-[11px] text-fg-muted truncate">
                    {selectedTemplate.role} · Banca {selectedTemplate.banca}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium text-fg text-xs sm:text-sm">
                    Selecione ou pesquise o seu concurso...
                  </div>
                  <div className="text-[11px] text-fg-subtle truncate">
                    Bancários, TI, Policiais, Fiscais, Tribunais, Administrativos ou Personalizado
                  </div>
                </>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'size-4 text-fg-subtle shrink-0 transition-transform',
              open && 'rotate-180 text-primary',
            )}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute z-50 mt-1.5 w-full rounded-xl border border-border-strong bg-surface-elevated shadow-lg overflow-hidden animate-fade-in"
          >
            <div className="p-2 border-b border-border bg-surface-muted/40">
              <div className="relative flex items-center">
                <Search className="size-4 text-fg-subtle absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pesquisar concurso, órgão, cargo ou banca (ex: BB, PF, Receita, BNB)..."
                  data-testid="contest-search-input"
                  className="w-full rounded-lg border border-border bg-surface pl-8 pr-8 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 text-fg-subtle hover:text-fg"
                    aria-label="Limpar busca"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto p-1.5 space-y-2">
              {groupedContests.length === 0 ? (
                <div className="p-3 text-center space-y-2">
                  <p className="text-xs text-fg-muted">
                    Nenhum concurso pré-cadastrado encontrado para &ldquo;{query}&rdquo;.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const customTpl = getContestCatalogItem('custom');
                      onChange('custom', customTpl);
                      if (onCustomNameChange && query.trim()) {
                        onCustomNameChange(query.trim());
                      }
                      setOpen(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary-hover"
                  >
                    <Sparkles className="size-3.5" />
                    Usar &ldquo;{query.trim()}&rdquo; como Concurso Personalizado
                  </button>
                </div>
              ) : (
                groupedContests.map(([category, items]) => (
                  <div key={category} className="space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                      {category}
                    </div>
                    {items.map((item) => {
                      const isSelected = item.id === value;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-testid={`contest-option-${item.id}`}
                          onClick={() => {
                            onChange(item.id, item);
                            setOpen(false);
                          }}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition',
                            isSelected
                              ? 'bg-primary-soft text-primary font-semibold'
                              : 'text-fg hover:bg-surface-muted',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="size-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: item.color }}
                            >
                              {item.sigla.slice(0, 3)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{item.name}</div>
                              <div className="text-[11px] text-fg-muted truncate">
                                {item.role} · {item.banca}
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="size-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {value === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 animate-fade-in">
          <div>
            <label className="block text-[11px] font-medium text-fg mb-1">
              Nome do Concurso / Órgão <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => onCustomNameChange?.(e.target.value)}
              placeholder="Ex: Petrobras, Sefaz-CE, MP-SP..."
              className="w-full h-9 rounded-lg border border-border-strong bg-surface px-3 text-xs text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-fg mb-1">
              Cargo / Área Pretendida
            </label>
            <input
              type="text"
              value={customRole}
              onChange={(e) => onCustomRoleChange?.(e.target.value)}
              placeholder="Ex: Analista de Sistemas, Auditor..."
              className="w-full h-9 rounded-lg border border-border-strong bg-surface px-3 text-xs text-fg focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
