import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { Field, Input, Select, Checkbox } from '../ui/Form';
import { RichTextEditor } from '../ui/RichText';
import { useDisciplines, useTopics, useErrorNotes } from '../../hooks/useData';
import { saveErrorNote, type ErrorNoteInput } from '../../services/performance';
import {
  ERROR_TYPE_LABELS,
  ERROR_STATUS_LABELS,
  type ErrorNote,
  type ErrorType,
  type ErrorStatus,
} from '../../db/types';
import { todayKey } from '../../lib/dates';
import { errorMessage } from '../../lib/utils';
import { DateInput } from '../ui/DateInput';

interface ErrorNoteModalProps {
  open: boolean;
  onClose: () => void;
  noteToEdit?: ErrorNote | null;
  defaultDate?: string;
  defaultDisciplineId?: string;
  defaultTopicId?: string | null;
  questionLogId?: string | null;
  /** Simulado ao qual o novo caderno será vinculado automaticamente. */
  mockExam?: { id: string; title: string } | null;
  onSaved?: (saved: ErrorNote) => void;
}

export function ErrorNoteModal({
  open,
  onClose,
  noteToEdit,
  defaultDate,
  defaultDisciplineId,
  defaultTopicId,
  questionLogId,
  mockExam,
  onSaved,
}: ErrorNoteModalProps) {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const errorNotes = useErrorNotes();

  const effectiveNote = useMemo(() => {
    if (noteToEdit) return noteToEdit;
    if (questionLogId) {
      return errorNotes.find((n) => n.questionLogId === questionLogId) ?? null;
    }
    return null;
  }, [noteToEdit, questionLogId, errorNotes]);

  const [disciplineId, setDisciplineId] = useState(defaultDisciplineId || '');
  const [topicId, setTopicId] = useState(defaultTopicId || '');
  const [sourceReference, setSourceReference] = useState('');
  const [errorType, setErrorType] = useState<ErrorType>('falta-conteudo');
  const [explanation, setExplanation] = useState('');
  const [errorDate, setErrorDate] = useState(defaultDate || todayKey());
  const [status, setStatus] = useState<ErrorStatus>('revisar');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [scheduleReviews, setScheduleReviews] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (effectiveNote) {
      setDisciplineId(effectiveNote.disciplineId);
      setTopicId(effectiveNote.topicId || '');
      setSourceReference(effectiveNote.sourceReference);
      setErrorType(effectiveNote.errorType);
      setExplanation(effectiveNote.explanation);
      setErrorDate(effectiveNote.errorDate);
      setStatus(effectiveNote.status);
      setNextReviewDate(effectiveNote.nextReviewDate || '');
      setScheduleReviews(false);
    } else {
      setDisciplineId(defaultDisciplineId || (disciplines[0]?.id ?? ''));
      setTopicId(defaultTopicId || '');
      setSourceReference(mockExam?.title ?? '');
      setErrorType('falta-conteudo');
      setExplanation('');
      setErrorDate(defaultDate || todayKey());
      setStatus('revisar');
      setNextReviewDate('');
      setScheduleReviews(true);
    }
    setError(null);
  }, [open, effectiveNote, defaultDate, defaultDisciplineId, defaultTopicId, disciplines, mockExam?.title]);

  const filteredTopics = topics.filter(
    (t) => t.disciplineId === disciplineId && t.active && !t.parentTopicId
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!disciplineId) {
      setError('Selecione uma disciplina.');
      return;
    }
    if (!sourceReference.trim() && !explanation.trim()) {
      setError('Informe a referência da questão ou a explicação do aprendizado.');
      return;
    }

    const input: ErrorNoteInput = {
      disciplineId,
      topicId: topicId || null,
      questionLogId: effectiveNote?.questionLogId || questionLogId || null,
      sourceReference: sourceReference.trim(),
      errorType,
      explanation: explanation.trim(),
      errorDate,
      status,
      nextReviewDate: nextReviewDate.trim() || null,
      ...(mockExam && !effectiveNote ? { mockExamId: mockExam.id, mockExamTitle: mockExam.title } : {}),
    };

    setLoading(true);
    try {
      const saved = await saveErrorNote(input, {
        id: effectiveNote?.id,
        scheduleReviews: !effectiveNote && scheduleReviews,
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
      title={effectiveNote ? 'Editar Anotação de Erro' : 'Adicionar ao Caderno de Erros'}
      description={mockExam && !effectiveNote ? `Será vinculado ao simulado "${mockExam.title}".` : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="error-note-form" loading={loading}>
            {effectiveNote ? 'Salvar Alterações' : 'Salvar no Caderno'}
          </Button>
        </>
      }
    >
      <form id="error-note-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Disciplina" required>
            <Select
              value={disciplineId}
              onChange={(e) => {
                setDisciplineId(e.target.value);
                setTopicId('');
              }}
              required
            >
              <option value="" disabled>Selecione uma disciplina</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tópico" hint="Opcional">
            <Select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!disciplineId || filteredTopics.length === 0}
            >
              <option value="">Geral / Sem tópico</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Motivo do erro">
            <Select value={errorType} onChange={(e) => setErrorType(e.target.value as ErrorType)}>
              {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((type) => (
                <option key={type} value={type}>
                  {ERROR_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ErrorStatus)}>
              {(Object.keys(ERROR_STATUS_LABELS) as ErrorStatus[]).map((st) => (
                <option key={st} value={st}>
                  {ERROR_STATUS_LABELS[st]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Referência ou identificação da questão" hint="Ex: Q12345 QConcursos, CESPE 2024 BNB Q45">
          <Input
            type="text"
            placeholder="Ex: CESPE 2024 BNB - Questão sobre Clean Architecture"
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
          />
        </Field>

        <Field label="Explicação correta / Resumo do aprendizado" required hint="Qual era a pegadinha ou conceito fundamental que causou o erro?">
          <RichTextEditor
            rows={6}
            placeholder="Explique com suas palavras o porquê da alternativa correta e o que você aprendeu com o erro..."
            value={explanation}
            onChange={setExplanation}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data do erro">
            <DateInput
              value={errorDate}
              onChange={(e) => setErrorDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Próxima data de revisão" hint={scheduleReviews ? 'Calculada automaticamente se repetição ativa' : 'Opcional'}>
            <DateInput
              value={nextReviewDate}
              onChange={(e) => setNextReviewDate(e.target.value)}
              disabled={scheduleReviews}
            />
          </Field>
        </div>

        {!noteToEdit && (
          <div className="rounded-lg border border-border bg-surface-muted/30 p-3">
            <Checkbox
              checked={scheduleReviews}
              onChange={(e) => setScheduleReviews(e.target.checked)}
              label="Agendar revisões espaçadas automaticamente"
              description="Cria lembretes de revisão futuros (1, 7 e 30 dias após a data do erro, ou conforme configurado)."
            />
          </div>
        )}
      </form>
    </Dialog>
  );
}
