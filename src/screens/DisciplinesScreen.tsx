import { useState, useMemo } from 'react';
import {
  BookMarked,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Upload,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Search,
  X,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader, Badge, ProgressBar, EmptyState, DisciplineDot, Alert } from '../components/ui/Display';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Dialog } from '../components/ui/Dialog';
import { TopicModal } from '../components/modals/TopicModal';
import { ChecklistImportModal } from '../components/modals/ChecklistImportModal';
import { Input, Select } from '../components/ui/Form';
import { useDisciplines, useTopics } from '../hooks/useData';
import {
  setTopicStatus,
  setTopicActive,
  deleteTopic,
  deleteAllTopics,
  moveTopic,
  reorderTopic,
} from '../services/topics';
import {
  TOPIC_STATUS_LABELS,
  type Topic,
  type TopicStatus,
} from '../db/types';
import { formatPercent } from '../lib/format';
import { errorMessage, cn } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';

export function DisciplinesScreen() {
  const disciplines = useDisciplines();
  const topics = useTopics();

  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string>(
    disciplines[0]?.id ?? 'portugues'
  );

  // Modals state
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicToEdit, setTopicToEdit] = useState<Topic | null>(null);
  const [modalParentTopicId, setModalParentTopicId] = useState<string | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);

  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllScope, setDeleteAllScope] = useState<'current' | 'all'>('current');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();
  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);


  const currentDiscipline = useMemo(
    () => disciplines.find((d) => d.id === selectedDisciplineId) ?? disciplines[0],
    [disciplines, selectedDisciplineId]
  );

  // Topics for current discipline
  const disciplineTopics = useMemo(() => {
    return topics
      .filter((t) => t.disciplineId === currentDiscipline?.id && !t.parentTopicId)
      .sort((a, b) => a.order - b.order);
  }, [topics, currentDiscipline]);

  // Subtopics mapping: parentId -> Topic[]
  const subtopicsByParent = useMemo(() => {
    const map = new Map<string, Topic[]>();
    for (const t of topics) {
      if (t.parentTopicId && t.disciplineId === currentDiscipline?.id) {
        const list = map.get(t.parentTopicId) ?? [];
        list.push(t);
        map.set(t.parentTopicId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return map;
  }, [topics, currentDiscipline]);

  const [topicSearch, setTopicSearch] = useState('');

  const filteredDisciplineTopics = useMemo(() => {
    if (!topicSearch.trim()) return disciplineTopics;
    const q = topicSearch.toLowerCase();
    return disciplineTopics.filter((t) => {
      const matchParent = t.title.toLowerCase().includes(q);
      const sub = subtopicsByParent.get(t.id) ?? [];
      const matchSub = sub.some((s) => s.title.toLowerCase().includes(q));
      return matchParent || matchSub;
    });
  }, [disciplineTopics, topicSearch, subtopicsByParent]);

  // Progress metrics for current discipline
  const discMetrics = useMemo(() => {
    const all = topics.filter((t) => t.disciplineId === currentDiscipline?.id && t.active);
    const completed = all.filter((t) => t.status === 'concluido' || t.status === 'dominado').length;
    const percent = all.length > 0 ? (completed / all.length) * 100 : null;
    return { total: all.length, completed, percent };
  }, [topics, currentDiscipline]);

  const toggleExpand = (topicId: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const handleStatusChange = async (topicId: string, status: TopicStatus) => {
    setActionError(null);
    try {
      await setTopicStatus(topicId, status);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleActiveToggle = async (topic: Topic) => {
    setActionError(null);
    try {
      await setTopicActive(topic.id, !topic.active);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleMove = async (topicId: string, direction: -1 | 1) => {
    setActionError(null);
    try {
      await moveTopic(topicId, direction);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const currentDisciplineAllTopicsCount = useMemo(
    () => topics.filter((t) => t.disciplineId === currentDiscipline?.id).length,
    [topics, currentDiscipline]
  );
  const totalTopicsCount = topics.length;

  const handleDelete = async () => {
    if (!topicToDelete) return;
    setActionError(null);
    try {
      await deleteTopic(topicToDelete.id);
      setDeleteConfirmOpen(false);
      setTopicToDelete(null);
      setActionSuccess('Tópico excluído com sucesso!');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleDeleteAll = async () => {
    setActionError(null);
    setIsDeletingAll(true);
    try {
      const scopeDisciplineId = deleteAllScope === 'current' ? currentDiscipline?.id : null;
      const count = await deleteAllTopics(scopeDisciplineId);
      setDeleteAllConfirmOpen(false);
      setActionSuccess(
        deleteAllScope === 'current'
          ? `${count} tópico(s) de ${currentDiscipline?.name} excluído(s) com sucesso!`
          : `${count} tópico(s) excluído(s) de todas as disciplinas com sucesso!`
      );
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setIsDeletingAll(false);
    }
  };

  const openAddTopic = (parentTopicId: string | null = null) => {
    setTopicToEdit(null);
    setModalParentTopicId(parentTopicId);
    setTopicModalOpen(true);
  };

  const openEditTopic = (topic: Topic) => {
    setTopicToEdit(topic);
    setModalParentTopicId(topic.parentTopicId);
    setTopicModalOpen(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedTopicId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedTopicId;
    setDraggedTopicId(null);
    if (!sourceId || sourceId === targetId) return;

    setActionError(null);
    try {
      await reorderTopic(sourceId, targetId);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disciplinas e Conteúdos"
        description="Organize os tópicos e acompanhe o que já foi estudado em cada disciplina do seu concurso."
        actions={
          currentDiscipline && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-fg-muted hover:text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  setDeleteAllScope('current');
                  setDeleteAllConfirmOpen(true);
                }}
                disabled={topics.length === 0}
              >
                Excluir Todos os Tópicos
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="size-4" />}
                onClick={() => setImportModalOpen(true)}
              >
                Importar Checklist
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => openAddTopic(null)}
              >
                Novo Tópico
              </Button>
            </div>
          )
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro na operação" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Disciplines Selection Tabs */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1.5 p-1 rounded-xl border border-border bg-surface">
          {disciplines.map((d) => {
            const isSelected = d.id === currentDiscipline?.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDisciplineId(d.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all shrink-0',
                  isSelected
                    ? 'bg-primary text-primary-fg shadow-xs font-semibold'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                )}
              >
                <DisciplineDot color={d.color} className="size-2" />
                <span className="truncate max-w-[180px]">{d.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {currentDiscipline && (
        <div className="space-y-4">
          {/* Header of selected discipline with Progress */}
          <Card
            title={
              <div className="flex items-center gap-2">
                <DisciplineDot color={currentDiscipline.color} className="size-3" />
                <span>{currentDiscipline.name}</span>
                <Badge tone={currentDiscipline.kind === 'technical' ? 'primary' : 'neutral'}>
                  {currentDiscipline.kind === 'technical' ? 'Específica / Técnica' : 'Conhecimentos Gerais'}
                </Badge>
              </div>
            }
            description="Reorganize com as setas ou arrastando; marque o progresso à medida que avança na matéria."
          >
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-fg">Progresso dos Tópicos Ativos</span>
                <span className="text-fg-subtle">
                  {discMetrics.completed} de {discMetrics.total} concluídos ({formatPercent(discMetrics.percent)})
                </span>
              </div>
              <ProgressBar
                value={discMetrics.completed}
                max={discMetrics.total || 1}
                label="Progresso da disciplina"
                tone="success"
              />
            </div>
          </Card>

          {/* Topics Search and Filter Bar */}
          {disciplineTopics.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Input
                  type="text"
                  placeholder="Buscar tópico por palavra-chave..."
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  className="pr-9"
                />
                {topicSearch ? (
                  <button
                    type="button"
                    onClick={() => setTopicSearch('')}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-fg-subtle hover:text-fg"
                    aria-label="Limpar busca"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-fg-subtle">
                    <Search className="size-4" />
                  </span>
                )}
              </div>
              <span className="text-xs text-fg-subtle">
                Exibindo {filteredDisciplineTopics.length} de {disciplineTopics.length} tópicos
              </span>
            </div>
          )}

          {/* Topics and Subtopics Tree */}
          <div className="space-y-2">
            {filteredDisciplineTopics.length > 0 ? (
              filteredDisciplineTopics.map((topic, index) => {
                const subtopics = subtopicsByParent.get(topic.id) ?? [];
                const isExpanded = expandedTopics.has(topic.id);

                return (
                  <div
                    key={topic.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, topic.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, topic.id)}
                    className={cn(
                      'rounded-xl border border-border bg-surface transition-all',
                      !topic.active && 'opacity-60 bg-surface-muted/20'
                    )}
                  >
                    {/* Main Topic Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span title="Arrastar para reordenar" className="cursor-grab">
                          <GripVertical className="size-4 text-fg-subtle shrink-0" />
                        </span>

                        {subtopics.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(topic.id)}
                            className="p-1 rounded hover:bg-surface-muted text-fg-subtle"
                            title={isExpanded ? 'Recolher subtópicos' : 'Expandir subtópicos'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        ) : (
                          <span className="size-6 shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-fg">{topic.title}</span>
                            <Badge
                              tone={
                                topic.status === 'concluido' || topic.status === 'dominado'
                                  ? 'success'
                                  : topic.status === 'em-andamento'
                                  ? 'warning'
                                  : 'neutral'
                              }
                              className="text-[11px]"
                            >
                              {TOPIC_STATUS_LABELS[topic.status]}
                            </Badge>
                            {!topic.active && <Badge tone="danger">Desativado</Badge>}
                          </div>
                          {topic.notes && (
                            <p className="mt-0.5 text-xs text-fg-muted line-clamp-1">{topic.notes}</p>
                          )}
                        </div>
                      </div>

                      {/* Topic Actions */}
                      <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                        <div className="w-32">
                          <Select
                            size="sm"
                            value={topic.status}
                            onChange={(e) => handleStatusChange(topic.id, e.target.value as TopicStatus)}
                            aria-label={`Status de ${topic.title}`}
                          >
                            {(Object.keys(TOPIC_STATUS_LABELS) as TopicStatus[]).map((st) => (
                              <option key={st} value={st}>
                                {TOPIC_STATUS_LABELS[st]}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <IconButton
                          label="Adicionar subtópico"
                          icon={<Plus className="size-3.5" />}
                          size="sm"
                          onClick={() => openAddTopic(topic.id)}
                        />

                        <IconButton
                          label={topic.active ? 'Desativar tópico' : 'Ativar tópico'}
                          icon={topic.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-danger" />}
                          size="sm"
                          onClick={() => handleActiveToggle(topic)}
                        />

                        <IconButton
                          label="Mover para cima"
                          icon={<ArrowUp className="size-3.5" />}
                          size="sm"
                          disabled={index === 0}
                          onClick={() => handleMove(topic.id, -1)}
                        />

                        <IconButton
                          label="Mover para baixo"
                          icon={<ArrowDown className="size-3.5" />}
                          size="sm"
                          disabled={index === disciplineTopics.length - 1}
                          onClick={() => handleMove(topic.id, 1)}
                        />

                        <IconButton
                          label="Editar tópico"
                          icon={<Edit2 className="size-3.5" />}
                          size="sm"
                          onClick={() => openEditTopic(topic)}
                        />

                        <IconButton
                          label="Excluir tópico"
                          icon={<Trash2 className="size-3.5 text-danger" />}
                          size="sm"
                          onClick={() => {
                            setTopicToDelete(topic);
                            setDeleteConfirmOpen(true);
                          }}
                        />
                      </div>
                    </div>

                    {/* Subtopics List (nested) */}
                    {isExpanded && subtopics.length > 0 && (
                      <div className="border-t border-border bg-surface-muted/30 px-6 py-2 space-y-1.5">
                        {subtopics.map((sub, sIdx) => (
                          <div
                            key={sub.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, sub.id)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, sub.id)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-surface p-2 border border-border/70 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className="size-3 text-fg-subtle cursor-grab shrink-0" />
                              <span className="font-medium text-fg truncate">{sub.title}</span>
                              <Badge
                                tone={
                                  sub.status === 'concluido' || sub.status === 'dominado'
                                    ? 'success'
                                    : sub.status === 'em-andamento'
                                    ? 'warning'
                                    : 'neutral'
                                }
                                className="text-[10px]"
                              >
                                {TOPIC_STATUS_LABELS[sub.status]}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                              <div className="w-28">
                                <Select
                                  size="sm"
                                  value={sub.status}
                                  onChange={(e) => handleStatusChange(sub.id, e.target.value as TopicStatus)}
                                  aria-label={`Status de ${sub.title}`}
                                >
                                  {(Object.keys(TOPIC_STATUS_LABELS) as TopicStatus[]).map((st) => (
                                    <option key={st} value={st}>
                                      {TOPIC_STATUS_LABELS[st]}
                                    </option>
                                  ))}
                                </Select>
                              </div>

                              <IconButton
                                label="Mover para cima"
                                icon={<ArrowUp className="size-3" />}
                                size="sm"
                                disabled={sIdx === 0}
                                onClick={() => handleMove(sub.id, -1)}
                              />
                              <IconButton
                                label="Mover para baixo"
                                icon={<ArrowDown className="size-3" />}
                                size="sm"
                                disabled={sIdx === subtopics.length - 1}
                                onClick={() => handleMove(sub.id, 1)}
                              />
                              <IconButton
                                label="Editar subtópico"
                                icon={<Edit2 className="size-3" />}
                                size="sm"
                                onClick={() => openEditTopic(sub)}
                              />
                              <IconButton
                                label="Excluir subtópico"
                                icon={<Trash2 className="size-3 text-danger" />}
                                size="sm"
                                onClick={() => {
                                  setTopicToDelete(sub);
                                  setDeleteConfirmOpen(true);
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={<BookMarked className="size-8" />}
                title="Nenhum tópico cadastrado nesta disciplina"
                description="Cadastre tópicos manualmente ou importe o checklist estruturado do edital."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Upload className="size-4" />}
                      onClick={() => setImportModalOpen(true)}
                    >
                      Importar Checklist
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus className="size-4" />}
                      onClick={() => openAddTopic(null)}
                    >
                      Cadastrar Tópico
                    </Button>
                  </div>
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <TopicModal
        open={topicModalOpen}
        onClose={() => setTopicModalOpen(false)}
        disciplineId={currentDiscipline?.id ?? ''}
        parentTopicId={modalParentTopicId}
        topicToEdit={topicToEdit}
        onSaved={() => setActionSuccess('Tópico salvo com sucesso!')}
      />

      <ChecklistImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        disciplineId={currentDiscipline?.id ?? ''}
        disciplineName={currentDiscipline?.name ?? ''}
        onImported={(cnt) => setActionSuccess(`${cnt} tópico(s) importado(s) com sucesso!`)}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir Tópico"
        message="Tem certeza que deseja excluir este tópico? Todos os seus subtópicos também serão excluídos. Sessões e questões associadas permanecerão registradas e serão desvinculadas do tópico."
        confirmLabel="Excluir Tópico"
        onConfirm={handleDelete}
      />

      {/* Delete All Topics Dialog */}
      <Dialog
        open={deleteAllConfirmOpen}
        onClose={() => setDeleteAllConfirmOpen(false)}
        title="Excluir Todos os Tópicos"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteAllConfirmOpen(false)}
              disabled={isDeletingAll}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              loading={isDeletingAll}
              onClick={handleDeleteAll}
            >
              Confirmar Exclusão
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <Alert tone="danger" title="Atenção: Ação irreversível!">
            Todos os tópicos selecionados serão permanentemente excluídos. Suas sessões de estudo, histórico de tempo, registros de questões e notas do Caderno de Erros continuarão intactos (apenas desvinculados do tópico).
          </Alert>

          <div>
            <label className="text-xs font-semibold uppercase text-fg-subtle block mb-2">
              Escolha o escopo da exclusão:
            </label>
            <div className="space-y-2">
              <label
                className={cn(
                  'group flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  deleteAllScope === 'current'
                    ? 'border-danger/60 bg-danger/5 ring-1 ring-danger/40'
                    : 'border-border bg-surface hover:bg-surface-muted/50'
                )}
              >
                <input
                  type="radio"
                  name="delete-topics-scope"
                  value="current"
                  checked={deleteAllScope === 'current'}
                  onChange={() => setDeleteAllScope('current')}
                  className="peer sr-only"
                />
                <div
                  className={cn(
                    'mt-0.5 size-4 shrink-0 rounded-full border border-border-strong bg-surface transition-all flex items-center justify-center',
                    deleteAllScope === 'current'
                      ? 'border-danger bg-danger/10'
                      : 'group-hover:border-fg-subtle'
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'size-2 rounded-full bg-danger transition-all',
                      deleteAllScope === 'current' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg flex items-center gap-2">
                    {currentDiscipline && <DisciplineDot color={currentDiscipline.color} />}
                    <span>Apenas da disciplina atual: {currentDiscipline?.name}</span>
                  </div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Excluirá {currentDisciplineAllTopicsCount} tópico(s) e subtópico(s) de {currentDiscipline?.name}. Os tópicos das outras disciplinas não serão afetados.
                  </p>
                </div>
              </label>

              <label
                className={cn(
                  'group flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  deleteAllScope === 'all'
                    ? 'border-danger/60 bg-danger/5 ring-1 ring-danger/40'
                    : 'border-border bg-surface hover:bg-surface-muted/50'
                )}
              >
                <input
                  type="radio"
                  name="delete-topics-scope"
                  value="all"
                  checked={deleteAllScope === 'all'}
                  onChange={() => setDeleteAllScope('all')}
                  className="peer sr-only"
                />
                <div
                  className={cn(
                    'mt-0.5 size-4 shrink-0 rounded-full border border-border-strong bg-surface transition-all flex items-center justify-center',
                    deleteAllScope === 'all'
                      ? 'border-danger bg-danger/10'
                      : 'group-hover:border-fg-subtle'
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'size-2 rounded-full bg-danger transition-all',
                      deleteAllScope === 'all' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg">
                    Todas as 8 disciplinas ({totalTopicsCount} tópicos no total)
                  </div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Limpará completamente a lista de tópicos de todo o edital (útil para reiniciar ou reimportar todos os checklists).
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
