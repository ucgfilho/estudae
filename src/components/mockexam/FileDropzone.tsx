import { useId, useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, UploadCloud, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FileDropzoneProps {
  label: string;
  hint: string;
  accept?: string;
  file: File | null;
  required?: boolean;
  onFile: (file: File | null) => void;
}

/**
 * Área de envio de arquivo: clicável, com suporte a arrastar e soltar.
 * O `<input type="file">` nativo continua sendo o controle (teclado/leitor de tela);
 * arrastar é apenas um atalho.
 */
export function FileDropzone({ label, hint, accept, file, required, onFile }: FileDropzoneProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </span>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          aria-label={label}
          className="peer sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2',
            file ? 'border-success/50 bg-success/5' : dragging ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface hover:bg-surface-muted',
          )}
        >
          {file ? (
            <>
              <CheckCircle2 className="size-6 text-success" aria-hidden />
              <span className="max-w-full truncate text-sm font-medium text-fg">{file.name}</span>
              <span className="text-xs text-fg-muted">Clique para trocar o arquivo</span>
            </>
          ) : (
            <>
              <UploadCloud className="size-6 text-fg-subtle" aria-hidden />
              <span className="text-sm font-medium text-fg">Clique ou arraste o arquivo aqui</span>
              <span className="text-xs text-fg-muted">{hint}</span>
            </>
          )}
        </label>
        {file && (
          <button
            type="button"
            aria-label={`Remover ${label.toLowerCase()}`}
            title="Remover arquivo"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = '';
              onFile(null);
            }}
            className="absolute top-2 right-2 inline-flex size-8 max-lg:size-10 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
