import { Fragment, useRef, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough, Underline, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './Button';

/*
 * Formatação leve (estilo Markdown) para textos como o diagnóstico de erros:
 *   **negrito**  *itálico*  ++sublinhado++  ~~tachado~~  `código`
 *   - lista, 1. lista numerada, > citação
 * Textos antigos (puro) continuam válidos: quebras de linha são preservadas.
 */

// ---------- Renderização ----------

const INLINE_RE = /(\*\*[^*\n]+?\*\*|\+\+[^+\n]+?\+\+|~~[^~\n]+?~~|`[^`\n]+?`|\*[^*\n]+?\*)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_RE).map((part, i) => {
    if (part.length > 3 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{renderInline(part.slice(2, -2))}</strong>;
    if (part.length > 3 && part.startsWith('++') && part.endsWith('++')) return <u key={i}>{renderInline(part.slice(2, -2))}</u>;
    if (part.length > 3 && part.startsWith('~~') && part.endsWith('~~')) return <s key={i}>{renderInline(part.slice(2, -2))}</s>;
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{renderInline(part.slice(1, -1))}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'quote'; lines: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const ul = line.match(/^\s*[-•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const q = line.match(/^\s*>\s?(.*)$/);
    const last = blocks[blocks.length - 1];
    if (ul) {
      if (last?.type === 'ul') last.items.push(ul[1]);
      else blocks.push({ type: 'ul', items: [ul[1]] });
    } else if (ol) {
      if (last?.type === 'ol') last.items.push(ol[1]);
      else blocks.push({ type: 'ol', items: [ol[1]] });
    } else if (q) {
      if (last?.type === 'quote') last.lines.push(q[1]);
      else blocks.push({ type: 'quote', lines: [q[1]] });
    } else if (line.trim() === '') {
      blocks.push({ type: 'p', lines: [] }); // separador de parágrafo
    } else if (last?.type === 'p' && last.lines.length > 0) {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== 'p' || b.lines.length > 0);
}

/** Exibe o texto formatado, preservando a organização escrita pelo usuário. */
export function FormattedText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5 leading-relaxed break-words', className)}>
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={i} className={cn('space-y-0.5 pl-5', b.type === 'ul' ? 'list-disc' : 'list-decimal')}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </Tag>
          );
        }
        if (b.type === 'quote') {
          return (
            <blockquote key={i} className="border-l-2 border-border-strong pl-3 text-fg-muted italic">
              {b.lines.map((l, j) => (
                <div key={j}>{renderInline(l)}</div>
              ))}
            </blockquote>
          );
        }
        if (b.type !== 'p') return null;
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ---------- Editor ----------

interface RichTextEditorProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

interface Tool {
  key: string;
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  run: 'wrap' | 'line';
  mark: string;
}

const TOOLS: Tool[] = [
  { key: 'bold', label: 'Negrito', shortcut: 'Ctrl+B', icon: Bold, run: 'wrap', mark: '**' },
  { key: 'italic', label: 'Itálico', shortcut: 'Ctrl+I', icon: Italic, run: 'wrap', mark: '*' },
  { key: 'underline', label: 'Sublinhado', shortcut: 'Ctrl+U', icon: Underline, run: 'wrap', mark: '++' },
  { key: 'strike', label: 'Tachado', shortcut: 'Ctrl+Shift+X', icon: Strikethrough, run: 'wrap', mark: '~~' },
  { key: 'code', label: 'Código', shortcut: 'Ctrl+E', icon: Code, run: 'wrap', mark: '`' },
  { key: 'ul', label: 'Lista com marcadores', shortcut: 'Ctrl+Shift+8', icon: List, run: 'line', mark: '- ' },
  { key: 'ol', label: 'Lista numerada', shortcut: 'Ctrl+Shift+7', icon: ListOrdered, run: 'line', mark: '1. ' },
  { key: 'quote', label: 'Citação', shortcut: 'Ctrl+Shift+9', icon: Quote, run: 'line', mark: '> ' },
];

/** Textarea com barra de ferramentas (negrito, itálico, listas...) e atalhos de teclado. */
export function RichTextEditor({ value, onChange, className, rows = 6, ...rest }: RichTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (tool: Tool) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    let next: string;
    let selStart = start;
    let selEnd = end;

    if (tool.run === 'wrap') {
      const m = tool.mark;
      const selected = value.slice(start, end);
      const wrapped = selected.startsWith(m) && selected.endsWith(m) && selected.length >= m.length * 2;
      const around = value.slice(start - m.length, start) === m && value.slice(end, end + m.length) === m;
      if (wrapped) {
        next = value.slice(0, start) + selected.slice(m.length, -m.length) + value.slice(end);
        selEnd = end - m.length * 2;
      } else if (around) {
        next = value.slice(0, start - m.length) + selected + value.slice(end + m.length);
        selStart = start - m.length;
        selEnd = end - m.length;
      } else {
        next = value.slice(0, start) + m + selected + m + value.slice(end);
        selStart = start + m.length;
        selEnd = end + m.length;
      }
    } else {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const nl = value.indexOf('\n', end);
      const lineEnd = nl === -1 ? value.length : nl;
      const lines = value.slice(lineStart, lineEnd).split('\n');
      const prefixRe = tool.key === 'ol' ? /^\d+[.)]\s+/ : tool.key === 'ul' ? /^[-•]\s+/ : /^>\s?/;
      const allHave = lines.every((l) => prefixRe.test(l));
      const out = lines.map((l, i) =>
        allHave ? l.replace(prefixRe, '') : (tool.key === 'ol' ? `${i + 1}. ` : tool.mark) + l.replace(prefixRe, ''),
      );
      const block = out.join('\n');
      next = value.slice(0, lineStart) + block + value.slice(lineEnd);
      selStart = lineStart;
      selEnd = lineStart + block.length;
    }

    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    let key: string | undefined;
    if (!e.shiftKey) key = { b: 'bold', i: 'italic', u: 'underline', e: 'code' }[k];
    else key = { x: 'strike', '8': 'ul', '*': 'ul', '7': 'ol', '&': 'ol', '9': 'quote', '(': 'quote' }[k];
    const tool = TOOLS.find((t) => t.key === key);
    if (!tool) return;
    e.preventDefault();
    apply(tool);
  };

  return (
    <div className="min-w-0 rounded-lg border border-border-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      <div role="toolbar" aria-label="Formatação de texto" className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        {TOOLS.map((t) => (
          <IconButton
            key={t.key}
            size="sm"
            label={t.label}
            icon={<t.icon className="size-4" aria-hidden />}
            title={t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
            // evita que o textarea perca a seleção ao clicar no botão
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(t)}
          />
        ))}
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn('block w-full resize-y bg-transparent px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle', className)}
        {...rest}
      />
    </div>
  );
}
