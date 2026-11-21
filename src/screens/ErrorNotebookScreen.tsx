import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertOctagon,
  Plus,
  Trash2,
  Edit2,
  Filter,
  Check,
  RotateCcw,
  Layers,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader, EmptyState, DisciplineDot, Alert } from '../components/ui/Display';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ErrorNoteModal } from '../components/modals/ErrorNoteModal';
import { FlashcardModal } from '../components/modals/FlashcardModal';
import { Field, Select, Input } from '../components/ui/Form';
import { X } from 'lucide-react';
import {
  useDisciplines,
  useTopics,
  useErrorNotes,
  useReviews,
  useMockExams,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedNoteId = searchParams.get('noteId') || '';

  const disciplines = useDisciplines();
  const topics = useTopics();
  const errorNotes = useErrorNotes();
  const reviews = useReviews();
  const mockExams = useMockExams();

  // Filters
  const [filterDisciplineId, setFilterDisciplineId] = useState(() => searchParams.get('disciplineId') || '');
  const [filterMockExamId, setFilterMockExamId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState(() => searchParams.get('q') || '');

  useEffect(() => {
    const paramDisc = searchParams.get('disciplineId');
    const paramQuery = searchParams.get('q');
    if (paramDisc !== null) setFilterDisciplineId(paramDisc);
    if (paramQuery !== null) setFilterSearch(paramQuery);
  }, [searchParams]);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<ErrorNote | null>(null);
  const [noteForFlashcard, setNoteForFlashcard] = useState<ErrorNote | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<ErrorNote | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();


  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    if (focusedNoteId) {
      const exact = errorNotes.find((n) => n.id === focusedNoteId);
      if (exact) return [exact];
    }
    return errorNotes
      .filter((n) => {
        if (filterDisciplineId && n.disciplineId !== filterDisciplineId) return false;
        if (filterStatus && n.status !== filterStatus) return false;
        if (filterType && n.errorType !== filterType) return false;
        if (filterMockExamId) {
          if (filterMockExamId === '__none__') {
            if (n.mockExamId) return false;
          } else {
            if (n.mockExamId !== filterMockExamId) return false;
          }
        }
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
  }, [errorNotes, focusedNoteId, filterDisciplineId, filterStatus, filterType, filterMockExamId, filterSearch, topicMap]);

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
      setActionSuccess('Status da anotação atualizado.');
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
      setActionSuccess('Anotação excluída.');
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
    <div className="page-stack">
      <PageHeader
        title="Caderno de erros"
        description="Registre questões que você errou para revisar no momento certo."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={openNewNote}
          >
            Adicionar erro
          </Button>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Não foi possível concluir a ação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por status">
        {([
          ['', 'Todos', counts.total],
          ['revisar', 'A revisar', counts.revisar],
          ['revisado', 'Revisados', counts.revisado],
          ['dominado', 'Dominados', counts.dominado],
        ] as const).map(([status, label, count]) => (
          <button key={status} type="button" aria-pressed={filterStatus === status && !focusedNoteId}
            onClick={() => { if (focusedNoteId) setSearchParams({}); setFilterStatus(status); }}
            className={cn('inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              filterStatus === status && !focusedNoteId ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-transparent text-fg-muted hover:bg-surface-muted')}>
            {label}<span className="text-xs tabular-nums">{count}</span>
          </button>
        ))}
      </div>

      <Field label="Buscar no caderno">
        <Input type="search" placeholder="Busque por explicação, questão ou tópico" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
      </Field>
      <details className="group border-t border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-fg focus-visible:outline-2 focus-visible:outline-ring">
          <Filter className="size-4 text-fg-muted" aria-hidden />
          Refinar resultados
          <span className="ml-auto text-xs text-fg-muted">{[filterDisciplineId, filterMockExamId, filterType].filter(Boolean).length || 'Sem'} filtros adicionais</span>
        </summary>
      {/* Filters Bar */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-fg-subtle" />
            <span>Filtros</span>
          </div>
        }
        actions={
          (focusedNoteId || filterDisciplineId || filterStatus || filterType || filterMockExamId || filterSearch) && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="size-3.5" />}
              onClick={() => {
                setSearchParams({});
                setFilterDisciplineId('');
                setFilterStatus('');
                setFilterType('');
                setFilterMockExamId('');
                setFilterSearch('');
              }}
            >
              {focusedNoteId ? 'Ver todos os erros' : 'Limpar filtros'}
            </Button>
          )
        }
      >
        <div className="filter-grid">
          <Field label="Simulado ou prova">
            <Select
              value={filterMockExamId}
              onChange={(e) => setFilterMockExamId(e.target.value)}
            >
              <option value="">Todas as origens</option>
              <option value="__none__">Apenas avulsas (sem prova)</option>
              {mockExams.map((m) => (
                <option key={m.id} value={m.id}>
                  Prova: {m.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Disciplina">
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
          </Field>

          <Field label="Status">
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
          </Field>

          <Field label="Motivo do erro">
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
          </Field>
        </div>
      </Card>

      </details>

      <p className="text-xs text-fg-muted" role="status">{filteredNotes.length} {filteredNotes.length === 1 ? 'registro encontrado' : 'registros encontrados'}</p>

      {/* Error Notes List */}
      <div className="space-y-4">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => {
            const d = discMap.get(note.disciplineId);
            const t = note.topicId ? topicMap.get(note.topicId) : null;
            const linkedReviews = reviews.filter((r) => r.errorNoteId === note.id);
            const pendingReviews = linkedReviews.filter((r) => r.status === 'pendente');

            return (
              <details key={note.id} open={focusedNoteId === note.id || undefined} className="overflow-hidden border-t border-border bg-surface">
                <summary className="cursor-pointer px-[var(--panel-padding)] py-4 text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]">
                  <div className="inline-flex w-[calc(100%-1.5rem)] flex-col gap-2 align-middle">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold">{d && <DisciplineDot color={d.color} />}{d?.name ?? 'Disciplina'}</span>
                      <span className="text-xs font-medium text-fg-muted">{ERROR_STATUS_LABELS[note.status]}</span>
                    </div>
                    <span className="text-sm text-fg-muted">{t?.title || note.sourceReference || 'Anotação de estudo'}</span>
                    <span className="text-xs text-fg-subtle">{formatDate(note.errorDate)} · {pendingReviews.length > 0 ? `${pendingReviews.length} revisões pendentes` : 'Revisões em dia'}</span>
                  </div>
                </summary>
                <div className="space-y-5 border-t border-border panel-padding">
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-muted">
                    <span>{ERROR_TYPE_LABELS[note.errorType]}</span>
                    {note.mockExamTitle && <span>Prova: {note.mockExamTitle}</span>}
                    {(note.flashcards?.length ?? 0) > 0 && <span>{note.flashcards?.length} flashcards</span>}
                    {note.nextReviewDate && <span>Próxima revisão: {formatDate(note.nextReviewDate)}</span>}
                  </div>
                  {note.sourceReference && <p className="text-xs text-fg-muted">Referência: {note.sourceReference}</p>}
                  <div className="space-y-2 text-sm leading-relaxed text-fg">
                    <h3 className="text-sm font-semibold">Aprendizado</h3>
                    <FormattedText text={note.explanation} />
                  </div>
                  <div className="border-t border-border pt-4">
                  <div className="flex flex-wrap shrink-0 items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Layers className="size-3.5 text-primary" />}
                      onClick={() => setNoteForFlashcard(note)}
                    >
                      Criar flashcard
                    </Button>
                    {note.status === 'revisado' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Check className="size-3.5 text-success" />}
                        onClick={() => handleStatusChange(note.id, 'dominado')}
                      >
                        Marcar como dominado
                      </Button>
                    )}
                    {note.status === 'dominado' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RotateCcw className="size-3.5" />}
                        onClick={() => handleStatusChange(note.id, 'revisar')}
                      >
                        Voltar a revisar
                      </Button>
                    )}
                    <IconButton
                      label="Editar anotação"
                      variant="secondary"
                      size="sm"
                      icon={<Edit2 className="size-3.5" />}
                      onClick={() => openEditNote(note)}
                    />
                    <IconButton
                      label="Excluir anotação"
                      variant="secondary"
                      size="sm"
                      icon={<Trash2 className="size-3.5" />}
                      className="text-fg-muted hover:text-danger hover:border-danger/40 hover:bg-danger-soft/20"
                      onClick={() => {
                        setNoteToDelete(note);
                        setDeleteConfirmOpen(true);
                      }}
                    />
                  </div>
                  </div>
                </div>
              </details>
            );
          })
        ) : (
          <EmptyState
            icon={<AlertOctagon className="size-8" />}
            title="Nenhum erro encontrado"
            description="Cadastre questões que errou ou geraram dúvidas para agendar revisões espaçadas automáticas."
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={openNewNote}
              >
                Registrar erro
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
        onSaved={() => setActionSuccess('Anotação salva.')}
      />

      <FlashcardModal
        open={noteForFlashcard !== null}
        onClose={() => setNoteForFlashcard(null)}
        note={noteForFlashcard}
        onSaved={() => setActionSuccess('Flashcard criado.')}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir anotação do caderno de erros?"
        message="Esta anotação e as revisões pendentes vinculadas a ela serão removidas."
        confirmLabel="Excluir anotação"
        onConfirm={handleDelete}
      />
    </div>
  );
}
