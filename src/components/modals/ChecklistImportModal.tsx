import { useState, useMemo } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { Field, Textarea } from '../ui/Form';
import { parseChecklist, countParsed } from '../../domain/checklist';
import { importTopics } from '../../services/topics';
import { errorMessage } from '../../lib/utils';
import { ListChecks } from 'lucide-react';

interface ChecklistImportModalProps {
  open: boolean;
  onClose: () => void;
  disciplineId: string;
  disciplineName: string;
  onImported?: (count: number) => void;
}

export function ChecklistImportModal({
  open,
  onClose,
  disciplineId,
  disciplineName,
  onImported,
}: ChecklistImportModalProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parsed = useMemo(() => parseChecklist(text), [text]);
  const counts = useMemo(() => countParsed(parsed), [parsed]);

  const handleImport = async () => {
    if (parsed.length === 0) {
      setError('Nenhum tópico identificado no texto informado.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const importedCount = await importTopics(disciplineId, parsed);
      onImported?.(importedCount);
      onClose();
      setText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Importar Conteúdo — ${disciplineName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={parsed.length === 0 || loading}
            loading={loading}
          >
            Importar {counts.topics} {counts.topics === 1 ? 'tópico' : 'tópicos'} e {counts.subtopics}{' '}
            {counts.subtopics === 1 ? 'subtópico' : 'subtópicos'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <p className="text-sm text-fg-muted">
          Cole a lista de conteúdos do edital ou do seu plano. Linhas com numeração secundária (ex: <code>1.1</code>) ou com recuo (espaços/tab) serão interpretadas como subtópicos.
        </p>

        <Field label="Texto do edital / checklist" hint="Exemplo: 1. Algoritmos | 1.1 Ordenação | 1.2 Busca em Grafos">
          <Textarea
            rows={6}
            placeholder={`1. Engenharia de Requisitos\n  1.1 Elicitação e Análise\n  1.2 Especificação e Validação\n2. Metodologias Ágeis\n  2.1 Scrum e Kanban`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
              <ListChecks className="size-4" /> Prévia da Importação
            </span>
            <span className="text-xs font-medium text-fg-muted">
              {counts.topics} {counts.topics === 1 ? 'tópico' : 'tópicos'} | {counts.subtopics}{' '}
              {counts.subtopics === 1 ? 'subtópico' : 'subtópicos'}
            </span>
          </div>

          {parsed.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-subtle">
              Digite ou cole o conteúdo acima para visualizar a prévia aqui antes de salvar.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto mt-2 rounded-lg border border-border bg-surface-muted/50 p-3 space-y-2 text-sm">
              {parsed.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="font-semibold text-fg flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    {item.title}
                  </div>
                  {item.subtopics.length > 0 && (
                    <div className="pl-5 space-y-0.5 text-xs text-fg-muted">
                      {item.subtopics.map((sub, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-1.5">
                          <span className="text-fg-subtle">•</span>
                          {sub}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
