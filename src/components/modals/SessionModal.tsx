import { useState, useEffect, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { Field, Input, Select, Textarea } from '../ui/Form';
import { useDisciplines, useTopics } from '../../hooks/useData';
import { createSession, updateSession, type SessionInput } from '../../services/sessions';
import type { StudySession } from '../../db/types';
import { todayKey } from '../../lib/dates';
import { errorMessage } from '../../lib/utils';
import { DateInput } from '../ui/DateInput';
import { TimeInput } from '../ui/TimeInput';

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
  sessionToEdit?: StudySession | null;
  defaultDate?: string;
  defaultDisciplineId?: string;
  onSaved?: (session: StudySession) => void;
}

export function SessionModal({
  open,
  onClose,
  sessionToEdit,
  defaultDate,
  defaultDisciplineId,
  onSaved,
}: SessionModalProps) {
  const disciplines = useDisciplines();
  const topics = useTopics();

  const [date, setDate] = useState(defaultDate || todayKey());
  const [disciplineId, setDisciplineId] = useState(defaultDisciplineId || '');
  const [topicId, setTopicId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedMinutes, setPlannedMinutes] = useState('60');
  const [objective, setObjective] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionToEdit) {
      setDate(sessionToEdit.date);
      setDisciplineId(sessionToEdit.disciplineId);
      setTopicId(sessionToEdit.topicId || '');
      setPlannedStart(sessionToEdit.plannedStart || '');
      setPlannedMinutes(String(sessionToEdit.plannedMinutes));
      setObjective(sessionToEdit.objective);
      setNotes(sessionToEdit.notes);
    } else {
      setDate(defaultDate || todayKey());
      setDisciplineId(defaultDisciplineId || (disciplines[0]?.id ?? ''));
      setTopicId('');
      setPlannedStart('');
      setPlannedMinutes('60');
      setObjective('');
      setNotes('');
    }
    setError(null);
  }, [open, sessionToEdit, defaultDate, defaultDisciplineId, disciplines]);

  const filteredTopics = topics.filter(
    (t) => t.disciplineId === disciplineId && t.active && !t.parentTopicId
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const minutes = parseInt(plannedMinutes, 10);
    if (isNaN(minutes) || minutes <= 0) {
      setError('Informe uma duração planejada válida em minutos.');
      return;
    }

    const input: SessionInput = {
      date,
      disciplineId,
      topicId: topicId || null,
      plannedStart: plannedStart.trim() || null,
      plannedMinutes: minutes,
      objective: objective.trim(),
      notes: notes.trim(),
    };

    setLoading(true);
    try {
      if (sessionToEdit) {
        await updateSession(sessionToEdit.id, input);
      } else {
        const created = await createSession(input);
        onSaved?.(created);
      }
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
      title={sessionToEdit ? 'Editar sessão de estudo' : 'Planejar nova sessão'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="session-form" loading={loading}>
            {sessionToEdit ? 'Salvar alterações' : 'Criar sessão'}
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data" required>
            <DateInput
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Horário previsto" hint="Opcional (ex: 19:30)">
            <TimeInput
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
            />
          </Field>
        </div>

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
              <option value="">Nenhum tópico selecionado</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Duração pretendida (minutos)" required>
          <Input
            type="number"
            min="1"
            max="720"
            value={plannedMinutes}
            onChange={(e) => setPlannedMinutes(e.target.value)}
            required
          />
        </Field>

        <Field label="Objetivo da sessão" hint="Ex: Resolver 20 questões sobre POO / Revisar sintaxe SQL">
          <Input
            type="text"
            placeholder="Qual a meta para este bloco de estudo?"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </Field>

        <Field label="Observações">
          <Textarea
            rows={2}
            placeholder="Anotações gerais, links de material ou foco de atenção..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
