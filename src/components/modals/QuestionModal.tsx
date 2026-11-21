import { useState, useEffect, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Form';
import { Alert } from '../ui/Display';
import { useDisciplines, useTopics } from '../../hooks/useData';
import {
  validateQuestionForm,
  emptyQuestionForm,
  questionLogToForm,
  type QuestionFormValues,
} from '../../domain/questions';
import { saveQuestionLog, DuplicateLogError } from '../../services/performance';
import type { QuestionLog } from '../../db/types';
import { todayKey } from '../../lib/dates';
import { errorMessage } from '../../lib/utils';
import { DateInput } from '../ui/DateInput';

interface QuestionModalProps {
  open: boolean;
  onClose: () => void;
  logToEdit?: QuestionLog | null;
  defaultDate?: string;
  defaultDisciplineId?: string;
  defaultTopicId?: string | null;
  sessionId?: string | null;
  onSaved?: (saved: QuestionLog) => void;
}

export function QuestionModal({
  open,
  onClose,
  logToEdit,
  defaultDate,
  defaultDisciplineId,
  defaultTopicId,
  sessionId,
  onSaved,
}: QuestionModalProps) {
  const disciplines = useDisciplines();
  const topics = useTopics();

  const [form, setForm] = useState<QuestionFormValues>(() =>
    emptyQuestionForm(defaultDate || todayKey(), defaultDisciplineId || '', defaultTopicId || '')
  );
  const [duplicateWarning, setDuplicateWarning] = useState<QuestionLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (logToEdit) {
      setForm(questionLogToForm(logToEdit));
    } else {
      setForm(
        emptyQuestionForm(
          defaultDate || todayKey(),
          defaultDisciplineId || (disciplines[0]?.id ?? ''),
          defaultTopicId || ''
        )
      );
    }
    setDuplicateWarning(null);
    setError(null);
    setAttempted(false);
  }, [open, logToEdit, defaultDate, defaultDisciplineId, defaultTopicId, disciplines]);

  const filteredTopics = topics.filter(
    (t) => t.disciplineId === form.disciplineId && t.active && !t.parentTopicId
  );

  const validation = validateQuestionForm(form);
  // Erros de contagem só aparecem depois que o usuário digita algo ou tenta salvar.
  const countsTyped = [form.correct, form.incorrect, form.blank, form.total].some((v) => v !== '');
  const countErrors = attempted || countsTyped ? validation.errors : {};

  const handleSubmit = async (e: FormEvent, allowDuplicate = false) => {
    e.preventDefault();
    setError(null);
    setAttempted(true);

    if (!validation.value) {
      const firstError = Object.values(validation.errors)[0];
      setError(firstError || 'Corrija os campos com erro antes de prosseguir.');
      return;
    }

    setLoading(true);
    try {
      const saved = await saveQuestionLog(validation.value, {
        id: logToEdit?.id,
        sessionId: sessionId || logToEdit?.sessionId,
        allowDuplicate,
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof DuplicateLogError) {
        setDuplicateWarning(err.duplicate);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={logToEdit ? 'Editar lançamento de questões' : 'Registrar resolução de questões'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="question-form" loading={loading}>
            {logToEdit ? 'Salvar alterações' : 'Registrar questões'}
          </Button>
        </>
      }
    >
      <form id="question-form" onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {duplicateWarning && (
          <Alert
            tone="warning"
            title="Lançamento idêntico já cadastrado"
            onClose={() => setDuplicateWarning(null)}
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={(e) => handleSubmit(e, true)}
                loading={loading}
              >
                Salvar mesmo assim
              </Button>
            }
          >
            Existe outro lançamento com a mesma data, disciplina, fonte e pontuação. Deseja cadastrar como duplicata intencional?
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data de resolução" error={validation.errors.date} required>
            <DateInput
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>

          <Field label="Banca ou fonte" hint="Ex: Cespe, FCC, FGV, Gran, QConcursos">
            <Input
              type="text"
              placeholder="Ex: Cebraspe / BNB 2024"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Disciplina" error={validation.errors.disciplineId} required>
            <Select
              value={form.disciplineId}
              onChange={(e) => setForm({ ...form, disciplineId: e.target.value, topicId: '' })}
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
              value={form.topicId}
              onChange={(e) => setForm({ ...form, topicId: e.target.value })}
              disabled={!form.disciplineId || filteredTopics.length === 0}
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

        <div className="rounded-lg bg-surface-muted/30 p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Contagem de Questões
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Acertos" error={countErrors.correct}>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.correct}
                onChange={(e) => setForm({ ...form, correct: e.target.value })}
              />
            </Field>

            <Field label="Erros" error={countErrors.incorrect}>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.incorrect}
                onChange={(e) => setForm({ ...form, incorrect: e.target.value })}
              />
            </Field>

            <Field label="Em branco" hint="Opcional" error={countErrors.blank}>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.blank}
                onChange={(e) => setForm({ ...form, blank: e.target.value })}
              />
            </Field>

            <Field label="Total" hint={validation.totalWasComputed ? 'Auto-calculado' : 'Total'} error={countErrors.total}>
              <Input
                type="number"
                min="0"
                placeholder="Auto"
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
              />
            </Field>
          </div>

          {validation.unclassified > 0 && (
            <Alert tone="warning">
              Há <strong>{validation.unclassified}</strong> questão(ões) não classificada(s) (total informado é maior que a soma de acertos, erros e em branco).
            </Alert>
          )}

          {validation.totalWasComputed && countsTyped && (
            <Alert tone="info">
              O total de questões foi calculado automaticamente a partir dos valores digitados.
            </Alert>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tempo gasto (minutos)" hint="Opcional" error={validation.errors.durationMinutes}>
            <Input
              type="number"
              min="0"
              placeholder="Ex: 45"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </Field>

          <Field label="Observações">
            <Textarea
              rows={2}
              placeholder="Anotações sobre a bateria ou comentários..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
