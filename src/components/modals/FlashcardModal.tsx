import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { Field, Radio, Textarea } from '../ui/Form';
import { addFlashcard } from '../../services/performance';
import type { ErrorFlashcard, ErrorNote } from '../../db/types';
import { errorMessage } from '../../lib/utils';

interface FlashcardModalProps {
  open: boolean;
  onClose: () => void;
  note: ErrorNote | null;
  onSaved?: (card: ErrorFlashcard) => void;
}

export function FlashcardModal({ open, onClose, note, onSaved }: FlashcardModalProps) {
  const [statement, setStatement] = useState('');
  const [answer, setAnswer] = useState<'certo' | 'errado'>('certo');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatement('');
    setAnswer('certo');
    setExplanation('');
    setError(null);
  }, [open, note?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note) return;
    setError(null);
    setLoading(true);
    try {
      const saved = await addFlashcard(note.id, {
        statement,
        answer,
        explanation,
      });
      onSaved?.(saved);
      onClose();
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
      title="Criar flashcard"
      description={
        note?.sourceReference
          ? `Vinculado ao erro "${note.sourceReference}". O flashcard aparecerá na tela de revisões no dia programado para revisar este erro.`
          : 'O flashcard aparecerá na tela de revisões no dia programado para revisar este erro.'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="flashcard-form" loading={loading}>
            Salvar flashcard
          </Button>
        </>
      }
    >
      <form id="flashcard-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Field label="Enunciado" required>
          <Textarea
            rows={4}
            placeholder="Escreva a assertiva ou enunciado exatamente como deseja revisar..."
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            required
          />
        </Field>

        <Field label="Gabarito" required>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border border-border bg-surface-muted/30 p-3">
              <Radio
                name="flashcard-answer"
                value="certo"
                checked={answer === 'certo'}
                onChange={() => setAnswer('certo')}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-success" />
                    Certo
                  </span>
                }
              />
            </div>
            <div className="rounded-lg border border-border bg-surface-muted/30 p-3">
              <Radio
                name="flashcard-answer"
                value="errado"
                checked={answer === 'errado'}
                onChange={() => setAnswer('errado')}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <XCircle className="size-4 text-danger" />
                    Errado
                  </span>
                }
              />
            </div>
          </div>
        </Field>

        <Field label="Explicação" required>
          <Textarea
            rows={4}
            placeholder="Adicione a justificativa ou definição correta do enunciado..."
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            required
          />
        </Field>
      </form>
    </Dialog>
  );
}
