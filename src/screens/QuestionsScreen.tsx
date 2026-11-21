import { useState, useMemo } from 'react';
import {
  CheckSquare,
  Plus,
  Filter,
  Trash2,
  Edit2,
  TrendingUp,
  AlertOctagon,
  X,
  BookOpen,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader, StatCard, EmptyState, DisciplineDot, Alert } from '../components/ui/Display';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { QuestionModal } from '../components/modals/QuestionModal';
import { ErrorNoteModal } from '../components/modals/ErrorNoteModal';
import { Field, Input, Select } from '../components/ui/Form';
import {
  useDisciplines,
  useTopics,
  useQuestionLogs,
  useErrorNotes,
  useSettings,
  useToday,
} from '../hooks/useData';
import {
  sumQuestions,
  filterQuestionLogs,
  accuracyByDiscipline,
} from '../domain/metrics';
import { deleteQuestionLog } from '../services/performance';
import { formatDate, addDays } from '../lib/dates';
import { formatInteger, formatPercent, EMPTY_VALUE } from '../lib/format';
import type { QuestionLog, ErrorNote } from '../db/types';
import { errorMessage } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';
import { DateInput } from '../components/ui/DateInput';

export function QuestionsScreen() {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const questionLogs = useQuestionLogs();
  const errorNotes = useErrorNotes();
  const settings = useSettings();
  const today = useToday();

  // Filters state
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterDisciplineId, setFilterDisciplineId] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('');
  const [filterSource, setFilterSource] = useState('');

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [logToEdit, setLogToEdit] = useState<QuestionLog | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<QuestionLog | null>(null);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedLogForError, setSelectedLogForError] = useState<QuestionLog | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();


  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const notesByLogId = useMemo(() => {
    const map = new Map<string, ErrorNote>();
    for (const note of errorNotes) {
      if (note.questionLogId) {
        map.set(note.questionLogId, note);
      }
    }
    return map;
  }, [errorNotes]);

  // Quick date presets
  const activeDatePreset = useMemo<'all' | 'today' | '7d' | '30d' | 'custom'>(() => {
    if (!filterStartDate && !filterEndDate) return 'all';
    if (filterStartDate === today && filterEndDate === today) return 'today';
    if (filterStartDate === addDays(today, -6) && filterEndDate === today) return '7d';
    if (filterStartDate === addDays(today, -29) && filterEndDate === today) return '30d';
    return 'custom';
  }, [filterStartDate, filterEndDate, today]);

  const applyDatePreset = (preset: 'all' | 'today' | '7d' | '30d') => {
    if (preset === 'all') {
      setFilterStartDate('');
      setFilterEndDate('');
    } else if (preset === 'today') {
      setFilterStartDate(today);
      setFilterEndDate(today);
    } else if (preset === '7d') {
      setFilterStartDate(addDays(today, -6));
      setFilterEndDate(today);
    } else if (preset === '30d') {
      setFilterStartDate(addDays(today, -29));
      setFilterEndDate(today);
    }
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return filterQuestionLogs(questionLogs, {
      start: filterStartDate || null,
      end: filterEndDate || null,
      disciplineId: filterDisciplineId || null,
      topicId: filterTopicId || null,
      source: filterSource || null,
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [questionLogs, filterStartDate, filterEndDate, filterDisciplineId, filterTopicId, filterSource]);

  // Filtered metrics
  const totals = useMemo(() => sumQuestions(filteredLogs), [filteredLogs]);
  const discAcc = useMemo(() => accuracyByDiscipline(filteredLogs, disciplines), [filteredLogs, disciplines]);

  const hasActiveFilters = Boolean(
    filterStartDate || filterEndDate || filterDisciplineId || filterTopicId || filterSource
  );

  const handleClearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterDisciplineId('');
    setFilterTopicId('');
    setFilterSource('');
  };

  const handleDelete = async () => {
    if (!logToDelete) return;
    setActionError(null);
    try {
      await deleteQuestionLog(logToDelete.id);
      setDeleteConfirmOpen(false);
      setLogToDelete(null);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const openNewLog = () => {
    setLogToEdit(null);
    setModalOpen(true);
  };

  const openEditLog = (log: QuestionLog) => {
    setLogToEdit(log);
    setModalOpen(true);
  };

  const openAddErrorForLog = (log: QuestionLog) => {
    setSelectedLogForError(log);
    setErrorModalOpen(true);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Banco de questões"
        description="Registre suas listas de exercícios para acompanhar sua taxa de acerto por disciplina."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={openNewLog}
          >
            Registrar questões
          </Button>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Não foi possível concluir a ação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* KPI Cards */}
      <div className="stats-grid">
        <StatCard
          label="Questões resolvidas"
          value={formatInteger(totals.total)}
          icon={<CheckSquare className="size-4" />}
        />
        <StatCard
          label="Acertos"
          value={formatInteger(totals.correct)}
          hint={`${totals.total > 0 ? formatPercent((totals.correct / totals.total) * 100) : '0%'} do total`}
        />
        <StatCard
          label="Erros"
          value={formatInteger(totals.incorrect)}
          hint="Oportunidades de revisão"
        />
        <StatCard
          label="Em branco"
          value={formatInteger(totals.blank)}
          hint="Não entram na taxa de acerto"
        />
        <StatCard
          label="Taxa de acerto"
          value={formatPercent(totals.accuracy)}
          hint={`Meta: ${settings?.accuracyGoal ?? 80}%`}
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      {/* Filters Bar */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-fg-subtle" />
            <span>Filtros</span>
          </div>
        }
        actions={
          hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="size-3.5" />}
              onClick={handleClearFilters}
            >
              Limpar filtros
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <span className="text-xs font-medium text-fg-subtle mr-1">Período:</span>
            {[
              { id: 'all', label: 'Todo o período' },
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: 'Últimos 7 dias' },
              { id: '30d', label: 'Últimos 30 dias' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={activeDatePreset === p.id}
                onClick={() => applyDatePreset(p.id as 'all' | 'today' | '7d' | '30d')}
                className={`rounded-full px-2.5 py-1 max-lg:px-3.5 max-lg:py-2 max-lg:min-h-11 text-xs font-medium transition-colors ${
                  activeDatePreset === p.id
                    ? 'bg-brand text-primary-fg shadow-sm'
                    : 'bg-surface-muted text-fg-muted hover:bg-surface-muted/80 hover:text-fg'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="filter-grid">
            <Field label="Data inicial">
              <DateInput
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </Field>

            <Field label="Data final">
              <DateInput
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </Field>

            <Field label="Disciplina">
              <Select
                value={filterDisciplineId}
                onChange={(e) => {
                  setFilterDisciplineId(e.target.value);
                  setFilterTopicId('');
                }}
              >
                <option value="">Todas as disciplinas</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tópico">
              <Select
                value={filterTopicId}
                onChange={(e) => setFilterTopicId(e.target.value)}
                disabled={!filterDisciplineId}
              >
                <option value="">Todos os tópicos</option>
                {topics
                  .filter((t) => t.disciplineId === filterDisciplineId && !t.parentTopicId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Banca ou fonte">
                <Input
                  type="text"
                  placeholder="Ex: Cebraspe, FCC..."
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                />
            </Field>
          </div>
        </div>
      </Card>

      {/* Accuracy by Discipline Breakdown */}
      <Card
        title="Desempenho por disciplina"
        description="Selecione uma disciplina para filtrar os registros. Questões em branco não entram na taxa de acerto."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {discAcc.map((d) => {
            const isSelected = filterDisciplineId === d.disciplineId;
            return (
              <button
                key={d.disciplineId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setFilterDisciplineId(isSelected ? '' : d.disciplineId);
                  setFilterTopicId('');
                }}
                className={`rounded-lg text-left p-3 space-y-1.5 transition-all ${
                  isSelected
                    ? 'bg-primary-soft'
                    : 'bg-surface-muted hover:bg-primary-soft/50'
                }`}
                title={isSelected ? 'Clique para remover o filtro' : `Filtrar por ${d.name}`}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-medium">
                  <span className="flex items-center gap-1.5 min-w-0 flex-1">
                    <DisciplineDot color={d.color} />
                    <span className="wrap-anywhere">{d.name}</span>
                  </span>
                  <span className="font-bold tabular-nums shrink-0">
                    {d.accuracy !== null ? formatPercent(d.accuracy) : EMPTY_VALUE}
                  </span>
                </div>
                <div className="text-[11px] text-fg-subtle flex justify-between items-center">
                  <span>{d.total} respondidas</span>
                  {isSelected ? (
                    <span className="font-semibold text-primary">Filtrado ✓</span>
                  ) : (
                    <span>{d.correct}A / {d.incorrect}E</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Questions Log Table */}
      <Card
        title={`Registros de questões (${filteredLogs.length})`}
        description="Listas de questões que você registrou."
      >
        {filteredLogs.length > 0 ? (
          <>
            {/* Mobile Card List (< md) */}
            <div className="md:hidden space-y-2.5">
              {filteredLogs.map((log) => {
                const d = discMap.get(log.disciplineId);
                const t = log.topicId ? topicMap.get(log.topicId) : null;
                const graded = log.correct + log.incorrect;
                const acc = graded > 0 ? (log.correct / graded) * 100 : null;

                return (
                  <div
                    key={log.id}
                    className="rounded-xl bg-surface p-3.5 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-semibold text-sm text-fg">
                          {d && <DisciplineDot color={d.color} />}
                          <span className="wrap-anywhere">{d?.name ?? '—'}</span>
                        </div>
                        {t && <div className="mt-0.5 text-xs text-fg-subtle wrap-anywhere">{t.title}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] font-medium text-fg-subtle tabular-nums">
                          {formatDate(log.date)}
                        </span>
                        {acc !== null && (
                          <span
                            className={`font-bold text-sm tabular-nums ${
                              acc >= (settings?.accuracyGoal ?? 80)
                                ? 'text-success'
                                : acc < 60
                                ? 'text-danger'
                                : 'text-warning'
                            }`}
                          >
                            {formatPercent(acc)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted/40 px-2.5 py-2 tabular-nums">
                      <span>
                        Total: <strong className="text-fg">{log.total}</strong>
                      </span>
                      <span className="text-fg-subtle">·</span>
                      <span className="text-success font-medium">
                        Acertos: <strong>{log.correct}</strong>
                      </span>
                      <span className="text-fg-subtle">·</span>
                      <span className="text-danger font-medium">
                        Erros: <strong>{log.incorrect}</strong>
                      </span>
                      {(log.blank ?? 0) > 0 && (
                        <>
                          <span className="text-fg-subtle">·</span>
                          <span className="text-fg-muted">Branco: {log.blank}</span>
                        </>
                      )}
                      {notesByLogId.has(log.id) && (
                        <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" role="img" aria-label="Anotação registrada no Caderno de Erros" title="Anotação registrada no Caderno de Erros" />
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-fg-muted wrap-anywhere">
                        {log.source ? `Fonte: ${log.source}` : 'Sem banca/fonte'}
                      </span>
                      <div className="inline-flex shrink-0 items-center justify-end gap-1">
                        {log.incorrect > 0 && (
                          <IconButton
                            label={
                              notesByLogId.has(log.id)
                                ? 'Ver/Editar anotação no Caderno de Erros'
                                : 'Registrar aprendizado no Caderno de Erros'
                            }
                            icon={
                              notesByLogId.has(log.id) ? (
                                <BookOpen className="size-4 text-primary" />
                              ) : (
                                <AlertOctagon className="size-4 text-warning" />
                              )
                            }
                            size="sm"
                            onClick={() => openAddErrorForLog(log)}
                          />
                        )}
                        <IconButton
                          label="Editar lançamento"
                          icon={<Edit2 className="size-4" />}
                          size="sm"
                          onClick={() => openEditLog(log)}
                        />
                        <IconButton
                          label="Excluir lançamento"
                          icon={<Trash2 className="size-4" />}
                          className="text-fg-muted hover:text-danger hover:bg-danger-soft/20"
                          size="sm"
                          onClick={() => {
                            setLogToDelete(log);
                            setDeleteConfirmOpen(true);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted/40 text-xs font-semibold text-fg-muted">
                <tr>
                  <th className="py-2.5 px-1.5 xl:px-3">Data</th>
                  <th className="py-2.5 px-1.5 xl:px-3">Disciplina / Conteúdo</th>
                  <th className="py-2.5 px-1.5 xl:px-3">Banca/Fonte</th>
                  <th className="py-2.5 px-1.5 xl:px-3 text-center">Total</th>
                  <th className="py-2.5 px-1.5 xl:px-3 text-center">Acertos</th>
                  <th className="py-2.5 px-1.5 xl:px-3 text-center">Erros</th>
                  <th className="hidden xl:table-cell py-2.5 px-3 text-center">Branco</th>
                  <th className="py-2.5 px-1.5 xl:px-3 text-center whitespace-nowrap">% Acerto</th>
                  <th className="py-2.5 px-1.5 xl:px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const d = discMap.get(log.disciplineId);
                  const t = log.topicId ? topicMap.get(log.topicId) : null;
                  const graded = log.correct + log.incorrect;
                  const acc = graded > 0 ? (log.correct / graded) * 100 : null;

                  return (
                    <tr key={log.id} className="even:bg-surface-muted/60 hover:bg-surface-muted transition-colors">
                      <td className="py-2.5 px-2 xl:px-3 whitespace-nowrap font-medium text-xs tabular-nums">
                        {formatDate(log.date)}
                      </td>
                      <td className="py-2.5 px-2 xl:px-3 max-w-[165px] xl:max-w-[280px]">
                        <div className="flex items-center gap-1.5 font-medium text-fg">
                          {d && <DisciplineDot color={d.color} />}
                          <span className="wrap-anywhere">{d?.name ?? '—'}</span>
                        </div>
                        {t && <div className="text-xs text-fg-subtle wrap-anywhere">{t.title}</div>}
                      </td>
                      <td className="py-2.5 px-2 xl:px-3 text-xs text-fg-muted max-w-[105px] xl:max-w-[220px]">
                        <div className="wrap-anywhere">{log.source || '—'}</div>
                      </td>
                      <td className="py-2.5 px-1.5 xl:px-3 text-center font-semibold tabular-nums">
                        {log.total}
                      </td>
                      <td className="py-2.5 px-1.5 xl:px-3 text-center text-success font-semibold tabular-nums">
                        {log.correct}
                      </td>
                      <td className="py-2.5 px-1.5 xl:px-3 text-center text-danger font-semibold tabular-nums">
                        <div className="inline-flex items-center justify-center gap-1">
                          <span>{log.incorrect}</span>
                          {notesByLogId.has(log.id) && (
                            <span
                              role="img"
                              aria-label="Anotação registrada no Caderno de Erros"
                              title="Anotação registrada no Caderno de Erros"
                              className="size-1.5 shrink-0 rounded-full bg-primary"
                            />
                          )}
                        </div>
                      </td>
                      <td className="hidden xl:table-cell py-2.5 px-3 text-center text-fg-subtle tabular-nums">
                        {log.blank || '0'}
                      </td>
                      <td className="py-2.5 px-1.5 xl:px-3 text-center font-bold tabular-nums whitespace-nowrap">
                        {acc !== null ? (
                          <span
                            className={
                              acc >= (settings?.accuracyGoal ?? 80)
                                ? 'text-success'
                                : acc < 60
                                ? 'text-danger'
                                : 'text-warning'
                            }
                          >
                            {formatPercent(acc)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-2 xl:px-3 text-right whitespace-nowrap">
                        <div className="inline-flex shrink-0 items-center justify-end gap-0.5 xl:gap-1">
                          {log.incorrect > 0 && (
                            <IconButton
                              label={
                                notesByLogId.has(log.id)
                                  ? 'Ver/Editar anotação no Caderno de Erros'
                                  : 'Registrar aprendizado no Caderno de Erros'
                              }
                              icon={
                                notesByLogId.has(log.id) ? (
                                  <BookOpen className="size-3.5 text-primary" />
                                ) : (
                                  <AlertOctagon className="size-3.5 text-warning" />
                                )
                              }
                              size="sm"
                              onClick={() => openAddErrorForLog(log)}
                            />
                          )}
                          <IconButton
                            label="Editar lançamento"
                            icon={<Edit2 className="size-3.5" />}
                            size="sm"
                            onClick={() => openEditLog(log)}
                          />
                          <IconButton
                            label="Excluir lançamento"
                            icon={<Trash2 className="size-3.5" />}
                            className="text-fg-muted hover:text-danger hover:bg-danger-soft/20"
                            size="sm"
                            onClick={() => {
                              setLogToDelete(log);
                              setDeleteConfirmOpen(true);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <EmptyState
            icon={<CheckSquare className="size-8" />}
            title={hasActiveFilters ? 'Nenhum lançamento com os filtros aplicados' : 'Nenhuma questão registrada ainda'}
            description={
              hasActiveFilters
                ? 'Tente ajustar ou limpar os filtros de busca acima.'
                : 'Registre os resultados das suas baterias para acompanhar a evolução e identificar pontos fracos.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={openNewLog}>
                  Registrar questões
                </Button>
              )
            }
          />
        )}
      </Card>

      {/* Modals */}
      <QuestionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        logToEdit={logToEdit}
      />

      <ErrorNoteModal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        noteToEdit={selectedLogForError ? notesByLogId.get(selectedLogForError.id) : null}
        defaultDate={selectedLogForError?.date}
        defaultDisciplineId={selectedLogForError?.disciplineId}
        defaultTopicId={selectedLogForError?.topicId}
        questionLogId={selectedLogForError?.id}
        onSaved={() => setActionSuccess('Anotação salva no Caderno de Erros.')}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir registro de questões?"
        message="Os acertos e erros deste lançamento serão removidos do seu histórico."
        confirmLabel="Excluir registro"
        onConfirm={handleDelete}
      />
    </div>
  );
}
