import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, NotebookPen, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Alert, Badge, Card, DisciplineDot } from '../ui/Display';
import { Checkbox } from '../ui/Form';
import { ErrorNoteModal } from '../modals/ErrorNoteModal';
import { useErrorNotes } from '../../hooks/useData';
import { createExamErrorNotebooks, wrongQuestionsByDiscipline } from '../../services/mockExams';
import { errorMessage } from '../../lib/utils';
import type { Discipline, MockExam } from '../../db/types';

export function ExamErrorNotebooks({ exam, disciplines }: { exam: MockExam; disciplines: Discipline[] }) {
  const notes = useErrorNotes();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);

  const wrong = useMemo(() => wrongQuestionsByDiscipline(exam), [exam]);
  const existing = useMemo(
    () => new Set(notes.filter((n) => n.mockExamId === exam.id).map((n) => n.disciplineId)),
    [notes, exam.id],
  );
  const rows = disciplines.filter((d) => wrong.has(d.id));
  const pendingIds = [...selected].filter((id) => !existing.has(id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await createExamErrorNotebooks(exam.id, pendingIds);
      setCreated(made.length);
      setSelected(new Set());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      actions={
        <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setManualOpen(true)}>
          Adicionar caderno de erros
        </Button>
      }
      title="Cadernos de erros desta prova"
      description="Crie um caderno por matéria com as questões que você errou. As revisões espaçadas são agendadas automaticamente e aparecem no cronograma."
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {created > 0 && (
          <Alert tone="success" onClose={() => setCreated(0)}>
            {created} caderno(s) criado(s) com revisões agendadas. <Link className="underline" to="/erros">Abrir Caderno de erros</Link>
          </Alert>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Não há erros associados a uma matéria neste simulado. Defina as faixas de questões por disciplina ao criar o simulado para usar este recurso.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Matérias com erros</legend>
            {rows.map((d) => {
              const count = wrong.get(d.id)?.length ?? 0;
              const done = existing.has(d.id);
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <DisciplineDot color={d.color} />
                    <Checkbox
                      label={d.name}
                      description={`${count} erro(s)`}
                      disabled={done}
                      checked={done || selected.has(d.id)}
                      onChange={(e) => toggle(d.id, e.target.checked)}
                    />
                  </div>
                  {done && (
                    <Badge tone="success" icon={<CheckCircle2 className="size-3" aria-hidden />}>
                      Caderno criado
                    </Badge>
                  )}
                </div>
              );
            })}
          </fieldset>
        )}
        {rows.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="primary"
              icon={<NotebookPen className="size-4" />}
              disabled={pendingIds.length === 0 || busy}
              onClick={() => void submit()}
            >
              Criar {pendingIds.length > 0 ? `${pendingIds.length} ` : ''}caderno(s) de erros
            </Button>
          </div>
        )}
      </div>
      <ErrorNoteModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        mockExam={{ id: exam.id, title: exam.title }}
        defaultDate={exam.date}
        onSaved={() => setCreated((n) => n + 1)}
      />
    </Card>
  );
}
