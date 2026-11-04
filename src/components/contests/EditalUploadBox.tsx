import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Lock,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  getContestCatalogItem,
  parseEditalVerticalizado,
} from '../../domain/contests';
import { cn, errorMessage } from '../../lib/utils';
import { readFileText } from '../../services/fileText';

interface EditalUploadBoxProps {
  contestId: string;
  customContestName?: string;
  editalText: string;
  onEditalTextChange: (text: string) => void;
  editalFileName: string | null;
  onEditalFileNameChange: (name: string | null) => void;
  disabled?: boolean;
}

export function EditalUploadBox({
  contestId,
  customContestName,
  editalText,
  onEditalTextChange,
  editalFileName,
  onEditalFileNameChange,
  disabled = false,
}: EditalUploadBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showTextEditor, setShowTextEditor] = useState(false);

  const isUnlocked = Boolean(contestId);
  const template = useMemo(
    () => (contestId ? getContestCatalogItem(contestId) : undefined),
    [contestId],
  );

  const effectiveContestName =
    contestId === 'custom'
      ? customContestName?.trim() || 'Concurso Personalizado'
      : template?.name || 'Concurso Selecionado';

  const parsedPreview = useMemo(() => {
    if (!isUnlocked) return null;
    if (editalText.trim().length > 0) {
      const parsed = parseEditalVerticalizado(editalText, contestId);
      return {
        source: 'uploaded' as const,
        disciplineCount: parsed.disciplines.length,
        topicCount: parsed.topics.length,
        disciplines: parsed.disciplines,
      };
    }
    if (template) {
      const totalTopics = template.disciplines.reduce(
        (sum, d) => sum + d.topics.length,
        0,
      );
      return {
        source: 'template' as const,
        disciplineCount: template.disciplines.length,
        topicCount: contestId === 'bnb-ti' ? 148 : totalTopics,
        disciplines: template.disciplines,
      };
    }
    return null;
  }, [isUnlocked, editalText, template, contestId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setReadingFile(true);
    try {
      const text = await readFileText(file);
      if (!text.trim()) {
        throw new Error('O arquivo enviado está vazio ou não possui texto extraível.');
      }
      onEditalTextChange(text);
      onEditalFileNameChange(file.name);
    } catch (err) {
      setFileError(errorMessage(err));
    } finally {
      setReadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadTemplateText = () => {
    if (!template) return;
    const formatted = template.disciplines
      .map((d) => `${d.name}:\n${d.topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
      .join('\n\n');
    onEditalTextChange(formatted);
    onEditalFileNameChange(`edital-verticalizado-${template.id}.txt`);
    setShowTextEditor(true);
  };

  if (!isUnlocked) {
    return (
      <div
        data-testid="edital-upload-locked"
        className="rounded-xl border border-dashed border-border-strong bg-surface-muted/40 p-4 text-center space-y-1.5 opacity-75"
      >
        <div className="mx-auto size-9 rounded-full bg-surface-muted flex items-center justify-center text-fg-subtle">
          <Lock className="size-4" />
        </div>
        <div className="text-xs font-semibold text-fg">
          Envio do Edital Verticalizado Bloqueado
        </div>
        <p className="text-[11px] text-fg-muted max-w-sm mx-auto leading-relaxed">
          Escolha primeiro qual concurso você deseja prestar no menu acima para liberar o envio do seu Edital Verticalizado.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="edital-upload-unlocked"
      className="rounded-xl border border-primary/35 bg-primary-soft/10 p-3.5 space-y-3 animate-fade-in"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <FileText className="size-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-fg">
              Edital Verticalizado — {effectiveContestName}
            </div>
            <div className="text-[11px] text-fg-muted">
              Envie seu PDF/TXT/CSV ou cole os tópicos para gerar seu cronograma de 24 semanas
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || readingFile}
            onClick={() => setShowTextEditor((prev) => !prev)}
            className="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-surface-muted transition"
          >
            {showTextEditor ? 'Ocultar editor' : 'Colar texto do edital'}
          </button>
          {template && !editalText && (
            <button
              type="button"
              disabled={disabled || readingFile}
              onClick={handleLoadTemplateText}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 transition"
            >
              <Wand2 className="size-3" />
              Usar edital base
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.csv,.md,application/pdf,text/plain,text/csv"
        onChange={handleFileChange}
        disabled={disabled || readingFile}
        className="hidden"
        data-testid="edital-file-input"
      />

      {editalFileName ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success-soft/20 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="size-4 text-success shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-fg truncate">{editalFileName}</div>
              <div className="text-[11px] text-fg-muted">
                Edital processado: {parsedPreview?.disciplineCount ?? 0} disciplinas e{' '}
                {parsedPreview?.topicCount ?? 0} tópicos mapeados para as 24 semanas
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onEditalTextChange('');
              onEditalFileNameChange(null);
            }}
            className="p-1 rounded-md text-fg-muted hover:text-danger hover:bg-surface transition"
            aria-label="Remover arquivo de edital"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || readingFile}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'w-full flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-surface/80 hover:bg-surface px-4 py-3.5 text-center transition cursor-pointer',
            (disabled || readingFile) && 'opacity-60 cursor-not-allowed',
          )}
        >
          <Upload className="size-5 text-primary" />
          <div className="text-xs font-semibold text-fg">
            {readingFile
              ? 'Extraindo disciplinas e tópicos do arquivo...'
              : 'Clique para enviar seu Edital Verticalizado (PDF, TXT, CSV ou MD)'}
          </div>
          <div className="text-[11px] text-fg-muted">
            Opcional: se não enviar arquivo agora, usaremos o edital estruturado de{' '}
            <strong>{effectiveContestName}</strong> ({parsedPreview?.disciplineCount ?? 0}{' '}
            disciplinas / {parsedPreview?.topicCount ?? 0} tópicos)
          </div>
        </button>
      )}

      {fileError && (
        <div className="rounded-lg border border-danger/40 bg-danger-soft/30 px-3 py-2 text-[11px] text-danger">
          {fileError}
        </div>
      )}

      {showTextEditor && (
        <div className="space-y-1.5 animate-fade-in">
          <label className="block text-[11px] font-medium text-fg">
            Conteúdo do Edital Verticalizado (Disciplinas e Tópicos)
          </label>
          <textarea
            rows={5}
            value={editalText}
            onChange={(e) => {
              onEditalTextChange(e.target.value);
              if (!editalFileName && e.target.value.trim()) {
                onEditalFileNameChange('edital-verticalizado-colado.txt');
              } else if (!e.target.value.trim()) {
                onEditalFileNameChange(null);
              }
            }}
            placeholder={`Exemplo:\nLíngua Portuguesa:\n1. Compreensão e interpretação de textos\n2. Ortografia oficial\n\nConhecimentos Específicos:\n1. Arquitetura de Software\n2. Banco de Dados`}
            className="w-full rounded-lg border border-border-strong bg-surface p-2.5 text-xs text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none font-mono"
          />
        </div>
      )}

      {parsedPreview && (
        <div className="flex items-start gap-2 rounded-lg bg-surface/90 border border-border px-3 py-2 text-[11px] text-fg-muted">
          <Sparkles className="size-3.5 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-fg">Resumo do edital:</span> As{' '}
            <strong className="text-fg">{parsedPreview.disciplineCount} disciplinas</strong> e{' '}
            <strong className="text-fg">{parsedPreview.topicCount} tópicos</strong> serão
            distribuídos nas 24 semanas, com revisões e simulados aos sábados.
          </div>
        </div>
      )}
    </div>
  );
}
