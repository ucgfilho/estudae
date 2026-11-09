import { useState, useMemo } from 'react';
import {
  AlertOctagon,
  Plus,
  Trash2,
  Edit2,
  Clock,
  Filter,
  Check,
  RotateCcw,
  BookOpen,
  FileText,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader, Badge, EmptyState, DisciplineDot, Alert } from '../components/ui/Display';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ErrorNoteModal } from '../components/modals/ErrorNoteModal';
import { Select, Input } from '../components/ui/Form';
import { Search, X } from 'lucide-react';
import {
  useDisciplines,
  useTopics,
  useErrorNotes,
  useReviews,
} from '../hooks/useData';
import {
  setErrorStatus,
  deleteErrorNote,
} from '../services/performance';
import { formatDate } from '../lib/dates';
import {
  ERROR_TYPE_LABELS,
  ERROR_STATUS_LABELS,
  type ErrorNote,
  type ErrorStatus,
  type ErrorType,
} from '../db/types';
import { errorMessage, cn } from '../lib/utils';
import { FormattedText } from '../components/ui/RichText';
import { useSuccessToast } from '../components/ui/Toast';

export function ErrorNotebookScreen() {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const errorNotes = useErrorNotes();
  const reviews = useReviews();

  // Filters
  const [filterDisciplineId, setFilterDisciplineId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState('');

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<ErrorNote | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<ErrorNote | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();


  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    return errorNotes
      .filter((n) => {
        if (filterDisciplineId && n.disciplineId !== filterDisciplineId) return false;
        if (filterStatus && n.status !== filterStatus) return false;
        if (filterType && n.errorType !== filterType) return false;
        if (filterSearch) {
          const q = filterSearch.toLowerCase();
          const matchExpl = n.explanation.toLowerCase().includes(q);
          const matchSource = n.sourceReference.toLowerCase().includes(q) || (n.mockExamTitle ?? '').toLowerCase().includes(q);
          const matchTopic = n.topicId ? (topicMap.get(n.topicId)?.title ?? '').toLowerCase().includes(q) : false;
          if (!matchExpl && !matchSource && !matchTopic) return false;
        }
        return true;
      })
      .sort((a, b) => b.errorDate.localeCompare(a.errorDate) || b.createdAt.localeCompare(a.createdAt));
  }, [errorNotes, filterDisciplineId, filterStatus, filterType, filterSearch, topicMap]);

  const counts = useMemo(() => {
    return {
      total: errorNotes.length,
      revisar: errorNotes.filter((n) => n.status === 'revisar').length,
      revisado: errorNotes.filter((n) => n.status === 'revisado').length,
      dominado: errorNotes.filter((n) => n.status === 'dominado').length,
    };
  }, [errorNotes]);

  const handleStatusChange = async (id: string, status: ErrorStatus) => {
    setActionError(null);
    try {
      await setErrorStatus(id, status);
      setActionSuccess('Status da anotação atualizado com sucesso!');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!noteToDelete) return;
    setActionError(null);
    try {
      await deleteErrorNote(noteToDelete.id);
      setDeleteConfirmOpen(false);
      setNoteToDelete(null);
      setActionSuccess('Anotação excluída com sucesso!');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const openNewNote = () => {
    setNoteToEdit(null);
    setModalOpen(true);
  };

  const openEditNote = (note: ErrorNote) => {
    setNoteToEdit(note);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caderno de Erros e Aprendizados"
        description="Transforme suas dúvidas e erros em pontos fortes por meio de diagnósticos e revisões ativas."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={openNewNote}
          >
            Adicionar Anotação de Erro
          </Button>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Interactive Status Filter Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="tablist" aria-label="Filtrar por status">
        <button
          type="button"
          onClick={() => setFilterStatus('')}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filterStatus === ''
              ? 'border-primary bg-surface shadow-xs ring-2 ring-primary/40'
              : 'border-border bg-surface hover:bg-surface-muted/60'
          )}
        >
          <div className="text-xs font-semibold uppercase text-fg-subtle">Total de Registros</div>
          <div className="text-2xl font-bold text-fg mt-1 tabular-nums">{counts.total}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === 'revisar' ? '' : 'revisar')}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filterStatus === 'revisar'
              ? 'border-warning bg-warning-soft/40 shadow-xs ring-2 ring-warning/50'
              : 'border-warning/30 bg-warning-soft/20 hover:bg-warning-soft/30'
          )}
        >
          <div className="text-xs font-semibold uppercase text-warning">A Revisar</div>
          <div className="text-2xl font-bold text-warning mt-1 tabular-nums">{counts.revisar}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === 'revisado' ? '' : 'revisado')}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filterStatus === 'revisado'
              ? 'border-info bg-info-soft/40 shadow-xs ring-2 ring-info/50'
              : 'border-info/30 bg-info-soft/20 hover:bg-info-soft/30'
          )}
        >
          <div className="text-xs font-semibold uppercase text-info">Revisados</div>
          <div className="text-2xl font-bold text-info mt-1 tabular-nums">{counts.revisado}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === 'dominado' ? '' : 'dominado')}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filterStatus === 'dominado'
              ? 'border-success bg-success-soft/40 shadow-xs ring-2 ring-success/50'
              : 'border-success/30 bg-success-soft/20 hover:bg-success-soft/30'
          )}
        >
          <div className="text-xs font-semibold uppercase text-success">Dominados</div>
          <div className="text-2xl font-bold text-success mt-1 tabular-nums">{counts.dominado}</div>
        </button>
      </div>

      {/* Filters Bar */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-fg-subtle" />
            <span>Filtros do Caderno</span>
          </div>
        }
        actions={
          (filterDisciplineId || filterStatus || filterType || filterSearch) && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="size-3.5" />}
              onClick={() => {
                setFilterDisciplineId('');
                setFilterStatus('');
                setFilterType('');
                setFilterSearch('');
              }}
            >
              Limpar Filtros
            </Button>
          )
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-fg-subtle block mb-1">Buscar por palavra</label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Explicação, questão, tópico..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-fg-subtle">
                <Search className="size-3.5" />
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-fg-subtle block mb-1">Disciplina</label>
            <Select
              value={filterDisciplineId}
              onChange={(e) => setFilterDisciplineId(e.target.value)}
            >
              <option value="">Todas as disciplinas</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-fg-subtle block mb-1">Status</label>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              {(Object.keys(ERROR_STATUS_LABELS) as ErrorStatus[]).map((st) => (
                <option key={st} value={st}>
                  {ERROR_STATUS_LABELS[st]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-fg-subtle block mb-1">Motivo do Erro</label>
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Todos os motivos</option>
              {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((type) => (
                <option key={type} value={type}>
                  {ERROR_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Error Notes List */}
      <div className="space-y-4">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => {
            const d = discMap.get(note.disciplineId);
            const t = note.topicId ? topicMap.get(note.topicId) : null;
            const linkedReviews = reviews.filter((r) => r.errorNoteId === note.id);
            const pendingReviews = linkedReviews.filter((r) => r.status === 'pendente');

            return (
              <Card
                key={note.id}
                className={cn(
                  'border-l-4 transition-all',
                  note.status === 'revisar'
                    ? 'border-l-warning'
                    : note.status === 'revisado'
                    ? 'border-l-info'
                    : 'border-l-success'
                )}
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    {d && <DisciplineDot color={d.color} />}
                    <span className="font-semibold text-fg">{d?.name}</span>
                    {t && <Badge tone="neutral">{t.title}</Badge>}
                    {note.mockExamTitle && (
                      <Badge tone="primary" icon={<FileText className="size-3" aria-hidden />} className="max-w-64">
                        <span className="truncate">Prova: {note.mockExamTitle}</span>
                      </Badge>
                    )}
                    <Badge tone="neutral" className="text-xs">
                      {ERROR_TYPE_LABELS[note.errorType]}
                    </Badge>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-1.5">
                    {note.status !== 'dominado' && (
                      <Button
                        variant="ghost"
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
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw className="size-3.5" />}
                        onClick={() => handleStatusChange(note.id, 'revisar')}
                      >
                        Voltar a Revisar
                      </Button>
                    )}
                    <IconButton
                      label="Editar anotação"
                      icon={<Edit2 className="size-4" />}
                      onClick={() => openEditNote(note)}
                    />
                    <IconButton
                      label="Excluir anotação"
                      icon={<Trash2 className="size-4 text-danger" />}
                      onClick={() => {
                        setNoteToDelete(note);
                        setDeleteConfirmOpen(true);
                      }}
                    />
                  </div>
                }
              >
                <div className="space-y-3 text-sm">
                  {note.sourceReference && (
                    <div className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5">
                      <BookOpen className="size-3.5" />
                      <span>Referência: {note.sourceReference}</span>
                    </div>
                  )}

                  <div className="rounded-lg bg-surface-muted/40 p-3 text-fg border border-border/60">
                    <div className="text-xs font-semibold uppercase text-fg-subtle mb-1">
                      Explicação Correta e Aprendizado:
                    </div>
                    <FormattedText text={note.explanation} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle pt-1 border-t border-border">
                    <div className="flex items-center gap-4">
                      <span>Data do erro: <strong>{formatDate(note.errorDate)}</strong></span>
                      {note.nextReviewDate && (
                        <span className="flex items-center gap-1 text-primary">
                          <Clock className="size-3.5" />
                          Próxima revisão: <strong>{formatDate(note.nextReviewDate)}</strong>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {pendingReviews.length > 0 ? (
                        <Badge tone="warning">
                          {pendingReviews.length} revisão(ões) pendente(s)
                        </Badge>
                      ) : (
                        <Badge tone="success">Revisões em dia</Badge>
                      )}
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
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon={<AlertOctagon className="size-8" />}
            title="Nenhum registro encontrado no Caderno de Erros"
            description="Cadastre questões que errou ou geraram dúvidas para agendar revisões espaçadas automáticas."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={openNewNote}
              >
                Cadastrar Primeiro Erro
              </Button>
            }
          />
        )}
      </div>

      {/* Modals */}
      <ErrorNoteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        noteToEdit={noteToEdit}
        onSaved={() => setActionSuccess('Anotação salva com sucesso!')}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir Anotação do Caderno de Erros"
        message="Tem certeza que deseja excluir esta anotação? Todas as tarefas de revisão pendentes vinculadas a ela também serão removidas."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}
