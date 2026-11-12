import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  NotebookPen,
  Plus,
  BookOpen,
  Clock,
  Check,
  RotateCcw,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { Alert, Badge, Card, DisciplineDot } from '../ui/Display';
import { Checkbox } from '../ui/Form';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ErrorNoteModal } from '../modals/ErrorNoteModal';
import { FormattedText } from '../ui/RichText';
import { useErrorNotes, useReviews, useTopics } from '../../hooks/useData';
import { createExamErrorNotebooks, wrongQuestionsByDiscipline } from '../../services/mockExams';
import { deleteErrorNote, setErrorStatus } from '../../services/performance';
import { formatDate } from '../../lib/dates';
import { errorMessage, cn } from '../../lib/utils';
import {
  ERROR_STATUS_LABELS,
  ERROR_TYPE_LABELS,
  type Discipline,
  type ErrorNote,
  type ErrorStatus,
  type MockExam,
} from '../../db/types';

export function ExamErrorNotebooks({ exam, disciplines }: { exam: MockExam; disciplines: Discipline[] }) {
  const notes = useErrorNotes();
  const reviews = useReviews();
  const topics = useTopics();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [manualOpen, setManualOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<ErrorNote | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<ErrorNote | null>(null);

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  // Cadernos vinculados a esta prova (por ID, título ou referência)
  const associatedNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (n.mockExamId && n.mockExamId === exam.id) return true;
        if (n.mockExamTitle && n.mockExamTitle === exam.title) return true;
        if (exam.title && n.sourceReference.startsWith(exam.title)) return true;
        return false;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notes, exam.id, exam.title]);

  const existingDisciplineIds = useMemo(
    () => new Set(associatedNotes.map((n) => n.disciplineId)),
    [associatedNotes],
  );

  const wrong = useMemo(() => wrongQuestionsByDiscipline(exam), [exam]);
  const rows = disciplines.filter((d) => wrong.has(d.id));
  const pendingIds = [...selected].filter((id) => !existingDisciplineIds.has(id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submitBatch = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await createExamErrorNotebooks(exam.id, pendingIds);
      setSuccessMsg(`${made.length} caderno(s) criado(s) com revisões agendadas.`);
      setSelected(new Set());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (noteId: string, newStatus: ErrorStatus) => {
    setError(null);
    try {
      await setErrorStatus(noteId, newStatus);
      setSuccessMsg('Status do caderno de erro atualizado.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!noteToDelete) return;
    setError(null);
    try {
      await deleteErrorNote(noteToDelete.id);
      setNoteToDelete(null);
      setSuccessMsg('Caderno de erro excluído com sucesso.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card
      actions={
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={() => setManualOpen(true)}
        >
          Adicionar caderno de erros
        </Button>
      }
      title="Cadernos de erros desta prova"
      description="Cadernos de erros associados a este simulado com revisões espaçadas automáticas no cronograma."
    >
      <div className="flex flex-col gap-5">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert tone="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}{' '}
            <Link className="underline font-medium" to="/erros">
              Abrir Caderno de erros
            </Link>
          </Alert>
        )}

        {/* 1. Cadernos de erros já criados / vinculados a este simulado */}
        {associatedNotes.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
                <BookOpen className="size-3.5" />
                <span>Cadernos vinculados a esta prova ({associatedNotes.length})</span>
              </h4>
              <Link to="/erros" className="text-xs text-primary hover:underline font-medium">
                Ver todos na seção Caderno de Erros →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {associatedNotes.map((note) => {
                const d = discMap.get(note.disciplineId);
                const t = note.topicId ? topicMap.get(note.topicId) : null;
                const noteReviews = reviews.filter((r) => r.errorNoteId === note.id);
                const pendingReviews = noteReviews.filter((r) => r.status === 'pendente');

                return (
                  <div
                    key={note.id}
                    className={cn(
                      'rounded-xl border border-border p-4 bg-surface transition-all flex flex-col gap-3',
                      note.status === 'revisar'
                        ? 'border-l-4 border-l-warning'
                        : note.status === 'revisado'
                        ? 'border-l-4 border-l-info'
                        : 'border-l-4 border-l-success'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {d && <DisciplineDot color={d.color} />}
                        <span className="font-semibold text-sm text-fg">{d?.name ?? 'Disciplina'}</span>
                        {t && <Badge tone="neutral">{t.title}</Badge>}
                        <Badge tone="neutral" className="text-xs">
                          {ERROR_TYPE_LABELS[note.errorType]}
                        </Badge>
                        <Badge
                          tone={
                            note.status === 'revisar'
                              ? 'warning'
                              : note.status === 'revisado'
                              ? 'info'
                              : 'success'
                          }
                        >
                          {ERROR_STATUS_LABELS[note.status]}
                        </Badge>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {note.status !== 'dominado' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Check className="size-3.5 text-success" />}
                            onClick={() =>
                              handleStatusChange(
                                note.id,
                                note.status === 'revisar' ? 'revisado' : 'dominado'
                              )
                            }
                          >
                            {note.status === 'revisar' ? 'Marcar Revisado' : 'Marcar Dominado'}
                          </Button>
                        )}
                        {note.status === 'dominado' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<RotateCcw className="size-3.5" />}
                            onClick={() => handleStatusChange(note.id, 'revisar')}
                          >
                            Voltar a Revisar
                          </Button>
                        )}
                        <IconButton
                          label="Editar anotação"
                          variant="secondary"
                          size="sm"
                          icon={<Edit2 className="size-3.5" />}
                          onClick={() => setNoteToEdit(note)}
                        />
                        <IconButton
                          label="Excluir anotação"
                          variant="secondary"
                          size="sm"
                          icon={<Trash2 className="size-3.5" />}
                          className="text-fg-muted hover:text-danger hover:border-danger/40 hover:bg-danger-soft/20"
                          onClick={() => setNoteToDelete(note)}
                        />
                      </div>
                    </div>

                    {note.sourceReference && (
                      <div className="text-xs text-fg-subtle flex items-center gap-1.5 font-medium">
                        <BookOpen className="size-3.5 shrink-0" />
                        <span>{note.sourceReference}</span>
                      </div>
                    )}

                    <div className="rounded-lg bg-surface-muted/40 p-3 text-xs text-fg border border-border/60">
                      <FormattedText text={note.explanation} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle pt-1 border-t border-border/60">
                      <div className="flex items-center gap-3">
                        <span>Data: <strong>{formatDate(note.errorDate)}</strong></span>
                        {note.nextReviewDate && (
                          <span className="flex items-center gap-1 text-primary">
                            <Clock className="size-3.5" />
                            Próxima revisão: <strong>{formatDate(note.nextReviewDate)}</strong>
                          </span>
                        )}
                      </div>
                      <div>
                        {pendingReviews.length > 0 ? (
                          <Badge tone="warning">
                            {pendingReviews.length} revisão(ões) pendente(s)
                          </Badge>
                        ) : (
                          <Badge tone="success">Revisões em dia</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-3 bg-surface-muted/20">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
                <NotebookPen className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-fg">Nenhum caderno de erros vinculado a esta prova ainda</p>
                <p className="text-xs text-fg-muted max-w-md mx-auto mt-1">
                  Clique no botão <strong>+ Adicionar caderno de erros</strong> no topo para registrar questões erradas desta prova por matéria e programar suas revisões espaçadas.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => setManualOpen(true)}
              >
                Criar Primeiro Caderno de Erros
              </Button>
            </div>
          )
        )}

        {/* 2. Criação em lote por matérias com erros (quando há faixas configuradas) */}
        {rows.length > 0 && (
          <div className="pt-2 border-t border-border space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                Gerar cadernos em lote pelas matérias com erros
              </h4>
              <p className="text-xs text-fg-muted mt-0.5">
                Selecione as disciplinas para criar cadernos agrupando todas as questões erradas detectadas no gabarito.
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Matérias com erros</legend>
              {rows.map((d) => {
                const count = wrong.get(d.id)?.length ?? 0;
                const done = existingDisciplineIds.has(d.id);
                return (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/30 p-3"
                  >
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

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                icon={<NotebookPen className="size-4" />}
                disabled={pendingIds.length === 0 || busy}
                onClick={() => void submitBatch()}
              >
                Criar {pendingIds.length > 0 ? `${pendingIds.length} ` : ''}caderno(s) em lote
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal para criar caderno avulso ou editar existente */}
      <ErrorNoteModal
        open={manualOpen || noteToEdit !== null}
        onClose={() => {
          setManualOpen(false);
          setNoteToEdit(null);
        }}
        noteToEdit={noteToEdit}
        mockExam={{ id: exam.id, title: exam.title }}
        defaultDate={exam.date}
        onSaved={() => {
          setSuccessMsg(
            noteToEdit ? 'Caderno de erros atualizado.' : 'Caderno de erros criado.'
          );
        }}
      />

      {/* Confirmação de exclusão */}
      <ConfirmModal
        open={noteToDelete !== null}
        onClose={() => setNoteToDelete(null)}
        title="Excluir Caderno de Erros"
        message={`Deseja realmente excluir este caderno de erros (${discMap.get(noteToDelete?.disciplineId ?? '')?.name ?? 'anotação'})? As revisões pendentes vinculadas também serão removidas.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
