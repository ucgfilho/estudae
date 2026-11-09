import { useState, useMemo, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Trash2,
  Plus,
  Calendar,
  Sparkles,
  CheckCircle,
  X,
  Maximize2,
  Flame,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Card, PageHeader, ProgressBar, Badge, Alert, DisciplineDot } from '../components/ui/Display';
import { Field, Input, Select, Textarea } from '../components/ui/Form';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { TopicModal } from '../components/modals/TopicModal';
import { QuestionModal } from '../components/modals/QuestionModal';
import { ErrorNoteModal } from '../components/modals/ErrorNoteModal';
import { FocusMode } from '../components/motivation/FocusMode';
import {
  useDisciplines,
  useTopics,
  useSessions,
  useQuestionLogs,
  useSettings,
  useActiveTimer,
  useNow,
} from '../hooks/useData';
import {
  startAdHocTimer,
  startPlannedTimer,
  pauseTimer,
  resumeTimer,
  finishTimer,
  discardTimer,
  updateTimerNotes,
} from '../services/timer';
import { elapsedSeconds, hasReachedGoal } from '../domain/timer';
import { studyStreak } from '../domain/metrics';
import { dailyProgress, nextPendingToday } from '../domain/motivation';
import { formatClock, formatMinutes } from '../lib/format';
import type { StudySession } from '../db/types';
import { errorMessage, cn } from '../lib/utils';
import { todayKey } from '../lib/dates';

export function StudyNowScreen() {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const questionLogs = useQuestionLogs();
  const settings = useSettings();
  const activeTimer = useActiveTimer();

  const now = useNow(1000, Boolean(activeTimer && activeTimer.status === 'running'));

  // Form states for ad-hoc session
  const [adHocDisciplineId, setAdHocDisciplineId] = useState('');
  const [adHocTopicId, setAdHocTopicId] = useState('');
  const [adHocObjective, setAdHocObjective] = useState('');
  const [adHocPlannedMinutes, setAdHocPlannedMinutes] = useState('60');
  const [adHocNotes, setAdHocNotes] = useState('');

  // Selected planned session
  const [selectedPlannedSessionId, setSelectedPlannedSessionId] = useState('');

  // Modals state
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  // Finished session state (for post-session actions)
  const [justFinishedSession, setJustFinishedSession] = useState<StudySession | null>(null);
  const [goalBannerDismissed, setGoalBannerDismissed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set default discipline when loaded
  useEffect(() => {
    if (disciplines.length > 0 && !adHocDisciplineId) {
      setAdHocDisciplineId(disciplines[0].id);
    }
  }, [disciplines, adHocDisciplineId]);

  // Candidates for planned sessions (planned sessions for today or future)
  const today = todayKey();
  const plannedCandidates = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'planejada')
      .sort((a, b) => a.date.localeCompare(b.date) || (a.plannedStart ?? '').localeCompare(b.plannedStart ?? ''));
  }, [sessions]);

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const filteredTopics = useMemo(() => {
    return topics.filter(
      (t) => t.disciplineId === adHocDisciplineId && t.active && !t.parentTopicId
    );
  }, [topics, adHocDisciplineId]);

  // Preselect today's planned session if available
  useEffect(() => {
    if (!selectedPlannedSessionId && plannedCandidates.length > 0) {
      const todaySession = plannedCandidates.find((s) => s.date === today);
      if (todaySession) {
        setSelectedPlannedSessionId(todaySession.id);
      }
    }
  }, [plannedCandidates, today, selectedPlannedSessionId]);

  // Spacebar keyboard shortcut to pause/resume timer
  useEffect(() => {
    if (!activeTimer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        (e.target as HTMLElement).tagName !== 'INPUT' &&
        (e.target as HTMLElement).tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        if (activeTimer.status === 'running') {
          void pauseTimer();
        } else {
          void resumeTimer();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTimer]);

  // Timer calculations
  const elapsed = activeTimer ? elapsedSeconds(activeTimer, now) : 0;
  const reached = activeTimer ? hasReachedGoal(elapsed, activeTimer.plannedSeconds) : false;

  // Daily progress (post-session summary)
  const dailyGoal = settings?.dailyGoalMinutes ?? 120;
  const dayProgress = useMemo(() => dailyProgress(sessions, questionLogs, settings, today), [sessions, questionLogs, settings, today]);
  const todayMinutes = dayProgress.studiedMinutes;
  const streak = useMemo(() => studyStreak(sessions, today), [sessions, today]);
  const nextBlock = useMemo(() => nextPendingToday(sessions, today), [sessions, today]);

  // Leave focus mode automatically when the timer ends
  useEffect(() => {
    if (!activeTimer) setFocusMode(false);
  }, [activeTimer]);

  // Handle start ad-hoc
  const handleStartAdHoc = async () => {
    setError(null);
    const minutes = parseInt(adHocPlannedMinutes, 10);
    if (isNaN(minutes) || minutes < 1) {
      setError('Informe uma duração planejada válida.');
      return;
    }
    setLoading(true);
    try {
      await startAdHocTimer({
        disciplineId: adHocDisciplineId,
        topicId: adHocTopicId || null,
        objective: adHocObjective.trim(),
        plannedMinutes: minutes,
        notes: adHocNotes,
      });
      setJustFinishedSession(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Handle start planned
  const handleStartPlanned = async () => {
    if (!selectedPlannedSessionId) {
      setError('Selecione uma sessão planejada para iniciar.');
      return;
    }
    await startPlannedFrom(selectedPlannedSessionId);
  };

  const startPlannedFrom = async (sessionId: string) => {
    setError(null);
    setLoading(true);
    try {
      await startPlannedTimer(sessionId);
      setJustFinishedSession(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    setError(null);
    try {
      await pauseTimer();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleResume = async () => {
    setError(null);
    try {
      await resumeTimer();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleFinish = async () => {
    setError(null);
    setLoading(true);
    try {
      const saved = await finishTimer();
      if (saved) {
        setJustFinishedSession(saved);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = async () => {
    setError(null);
    setLoading(true);
    try {
      await discardTimer();
      setDiscardConfirmOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNotesChange = async (val: string) => {
    try {
      await updateTimerNotes(val);
    } catch {
      // non-critical
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estudar Agora"
        description="Foco total e cronômetro de precisão para suas sessões de estudo."
      />

      {error && (
        <Alert tone="danger" title="Atenção" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ACTIVE RUNNING TIMER VIEW */}
      {activeTimer ? (
        <div className="space-y-6">
          <Card
            title={
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex size-2.5 rounded-full',
                    activeTimer.status === 'running' ? 'bg-primary' : 'bg-warning'
                  )}
                  aria-hidden
                />
                <span>
                  {activeTimer.status === 'running' ? 'Sessão em Andamento' : 'Sessão Pausada'}
                </span>
              </div>
            }
            actions={
              <div className="flex items-center gap-2">
                <Badge tone={activeTimer.status === 'running' ? 'primary' : 'warning'}>
                  {activeTimer.sessionId ? 'Sessão Planejada' : 'Sessão Avulsa'}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Maximize2 className="size-4" aria-hidden />}
                  onClick={() => setFocusMode(true)}
                >
                  Modo foco
                </Button>
              </div>
            }
          >
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              {/* Discipline and Topic badge */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {discMap.get(activeTimer.disciplineId) ? (
                  <div className="flex items-center gap-1.5 font-semibold text-fg text-base">
                    <DisciplineDot color={discMap.get(activeTimer.disciplineId)!.color} />
                    {discMap.get(activeTimer.disciplineId)!.name}
                  </div>
                ) : activeTimer.disciplineId === 'simulado' ? (
                  <div className="flex items-center gap-1.5 font-semibold text-fg text-base">
                    <DisciplineDot color="#A6193C" />
                    Simulado Geral BNB
                  </div>
                ) : null}
                {activeTimer.topicId && (
                  <Badge tone="neutral">
                    {topicMap.get(activeTimer.topicId)?.title ?? 'Tópico'}
                  </Badge>
                )}
              </div>

              {activeTimer.objective && (
                <p className="max-w-md text-sm text-fg-muted font-medium">
                  {activeTimer.objective}
                </p>
              )}

              {/* Big Digital Clock Display */}
              <div className="py-2">
                <div className="text-6xl sm:text-7xl font-mono font-bold tracking-tight text-fg tabular-nums">
                  {formatClock(elapsed)}
                </div>
                <div className="mt-2 text-xs text-fg-subtle">
                  Meta planejada: {formatMinutes(Math.round(activeTimer.plannedSeconds / 60))} (
                  {formatClock(activeTimer.plannedSeconds)})
                </div>
              </div>

              {/* Progress Bar & Goal Reached Notification */}
              <div className="w-full max-w-md space-y-2">
                <ProgressBar
                  value={elapsed}
                  max={activeTimer.plannedSeconds || 1}
                  label="Tempo decorrido da sessão"
                  tone={reached ? 'success' : 'primary'}
                  showOverflow
                />

                {reached && !goalBannerDismissed && (
                  <div className="relative rounded-lg bg-success-soft p-2.5 pr-9 text-xs font-semibold text-success flex items-center justify-center gap-1.5 animate-pop">
                    <Sparkles className="size-4 shrink-0" aria-hidden />
                    <span>Meta planejada atingida! Finalize agora ou faça uma pausa de 5 min antes de seguir.</span>
                    <IconButton
                      label="Fechar aviso"
                      icon={<X className="size-3.5" />}
                      size="sm"
                      onClick={() => setGoalBannerDismissed(true)}
                      className="absolute top-1.5 right-1.5 shrink-0 text-success opacity-75 hover:opacity-100"
                    />
                  </div>
                )}
              </div>

              {/* Action Controls */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                {activeTimer.status === 'running' ? (
                  <Button
                    variant="secondary"
                    size="md"
                    icon={<Pause className="size-4" />}
                    onClick={handlePause}
                  >
                    Pausar
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Play className="size-4" />}
                    onClick={handleResume}
                  >
                    Continuar
                  </Button>
                )}

                <Button
                  variant="primary"
                  size="md"
                  icon={<Square className="size-4" />}
                  onClick={handleFinish}
                  loading={loading}
                >
                  Finalizar e Salvar
                </Button>

                <Button
                  variant="ghost"
                  size="md"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => setDiscardConfirmOpen(true)}
                  disabled={loading}
                  className="text-fg-muted hover:text-danger"
                >
                  Descartar
                </Button>
              </div>

              <div className="text-[11px] text-fg-subtle">
                Atalho: pressione <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">Espaço</kbd> para pausar ou retomar
              </div>
            </div>

            {/* Quick study notes during session */}
            <div className="mt-6 border-t border-border pt-4">
              <Field label="Notas rápidas durante o estudo" hint="Suas anotações serão salvas junto com o registro da sessão.">
                <Textarea
                  rows={3}
                  placeholder="Escreva pontos-chave, conceitos a reforçar ou dúvidas para tirar mais tarde..."
                  defaultValue={activeTimer.notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>
      ) : (
        /* NO TIMER RUNNING: SHOW LAUNCH INTERFACE */
        <div className="space-y-6">
          {/* Post-Session Summary: progress principle + next step (avoids post-reward reset) */}
          {justFinishedSession && (
            <Card
              title="Sessão finalizada e salva"
              description={`Você estudou ${formatMinutes(Math.round(justFinishedSession.actualSeconds / 60))} nesta sessão.`}
              className="border-success/40 animate-fade-in"
              onClose={() => setJustFinishedSession(null)}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-surface-muted/50 p-3">
                    <p className="text-xs font-medium text-fg-muted">Hoje</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
                      {formatMinutes(todayMinutes)}
                      <span className="text-sm font-normal text-fg-muted"> / {formatMinutes(dailyGoal)}</span>
                    </p>
                    <ProgressBar
                      value={todayMinutes}
                      max={dailyGoal}
                      label="Tempo estudado hoje em relação à meta diária"
                      tone={todayMinutes >= dailyGoal ? 'success' : 'primary'}
                      className="mt-2"
                      showOverflow
                    />
                  </div>
                  <div className="rounded-lg bg-surface-muted/50 p-3">
                    <p className="text-xs font-medium text-fg-muted">Cronograma do dia</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
                      {dayProgress.scheduled.length > 0
                        ? `${dayProgress.scheduledDone} de ${dayProgress.scheduled.length} blocos`
                        : 'Sem blocos planejados'}
                    </p>
                    {dayProgress.scheduled.length > 0 && (
                      <ProgressBar
                        value={dayProgress.scheduledDone}
                        max={dayProgress.scheduled.length}
                        label="Blocos do cronograma de hoje concluídos"
                        tone={dayProgress.scheduledDone === dayProgress.scheduled.length ? 'success' : 'primary'}
                        className="mt-2"
                      />
                    )}
                  </div>
                  <div className="rounded-lg bg-surface-muted/50 p-3">
                    <p className="text-xs font-medium text-fg-muted">Sequência</p>
                    <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-fg">
                      <Flame className="size-4 text-accent" aria-hidden />
                      {streak} {streak === 1 ? 'dia' : 'dias'}
                    </p>
                    <p className="mt-1 text-xs text-fg-muted">Garantida hoje.</p>
                  </div>
                </div>

                <p className="text-sm text-fg-muted">
                  Registre as questões agora, enquanto o conteúdo está fresco: recuperar a informação logo após estudar fortalece a memória.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CheckCircle className="size-4" aria-hidden />}
                    onClick={() => setQuestionModalOpen(true)}
                  >
                    Lançar Questões Desta Sessão
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setErrorModalOpen(true)}
                  >
                    Cadastrar Erro / Aprendizado
                  </Button>
                  {nextBlock && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Play className="size-4" aria-hidden />}
                      onClick={() => {
                        setSelectedPlannedSessionId(nextBlock.id);
                        void startPlannedFrom(nextBlock.id);
                      }}
                    >
                      Próximo bloco: {discMap.get(nextBlock.disciplineId)?.name ?? 'Sessão planejada'}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Option A: Start Planned Session (Prioritized when schedule exists — Decision Reduction) */}
            <Card
              title="Iniciar Sessão Planejada"
              description="Execute o bloco recomendado do seu cronograma sem precisar escolher do zero."
              className={cn(plannedCandidates.length > 0 && 'border-primary/40')}
            >
              {plannedCandidates.length > 0 ? (
                <div className="space-y-4">
                  <Field label="Selecione a sessão planejada" required>
                    <Select
                      value={selectedPlannedSessionId}
                      onChange={(e) => setSelectedPlannedSessionId(e.target.value)}
                    >
                      <option value="">Selecione uma sessão...</option>
                      {plannedCandidates.map((s) => {
                        const d = discMap.get(s.disciplineId);
                        const isSimulado = s.disciplineId === 'simulado';
                        const isToday = s.date === today;
                        const label = d?.name ?? (isSimulado ? 'Simulado Geral BNB' : s.disciplineId);
                        return (
                          <option key={s.id} value={s.id}>
                            {isToday ? '[HOJE]' : `[${s.date}]`} {label} ({s.plannedMinutes} min){' '}
                            {s.objective ? `— ${s.objective}` : ''}
                          </option>
                        );
                      })}
                    </Select>
                  </Field>

                  {selectedPlannedSessionId && (
                    <div className="rounded-lg border border-border bg-surface-muted/30 p-3.5 text-xs space-y-1.5">
                      {(() => {
                        const s = sessions.find((x) => x.id === selectedPlannedSessionId);
                        if (!s) return null;
                        const d = discMap.get(s.disciplineId);
                        const isSimulado = s.disciplineId === 'simulado';
                        return (
                          <>
                            <div className="font-semibold text-sm text-fg flex items-center gap-2">
                              {d ? (
                                <DisciplineDot color={d.color} />
                              ) : isSimulado ? (
                                <DisciplineDot color="#A6193C" />
                              ) : null}
                              {d?.name ?? (isSimulado ? 'Simulado Geral BNB' : s.disciplineId)}
                            </div>
                            <div className="text-fg-muted">Duração planejada: {s.plannedMinutes} min</div>
                            {s.objective && <div className="text-fg-muted">Objetivo: {s.objective}</div>}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <Button
                    variant="primary"
                    className="w-full"
                    icon={<Play className="size-4" />}
                    onClick={handleStartPlanned}
                    disabled={!selectedPlannedSessionId || loading}
                    loading={loading}
                  >
                    Iniciar Sessão Selecionada
                  </Button>
                </div>
              ) : (
                <div className="py-10 text-center space-y-3">
                  <Calendar className="mx-auto size-8 text-fg-subtle" />
                  <p className="text-sm font-medium text-fg">Nenhuma sessão planejada pendente</p>
                  <p className="text-xs text-fg-muted max-w-xs mx-auto">
                    Você pode planejar novas sessões pelo Calendário ou Cronograma, ou iniciar uma sessão avulsa ao lado.
                  </p>
                </div>
              )}
            </Card>

            {/* Option B: Start Ad-Hoc Session */}
            <Card
              title="Iniciar Sessão Avulsa"
              description="Estude livremente qualquer disciplina fora do cronograma do dia."
            >
              <div className="space-y-4">
                <Field label="Disciplina" required>
                  <Select
                    value={adHocDisciplineId}
                    onChange={(e) => {
                      setAdHocDisciplineId(e.target.value);
                      setAdHocTopicId('');
                    }}
                    required
                  >
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-fg">Tópico ou Conteúdo</label>
                    <button
                      type="button"
                      onClick={() => setTopicModalOpen(true)}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Criar Tópico Rápido
                    </button>
                  </div>
                  <Select
                    value={adHocTopicId}
                    onChange={(e) => setAdHocTopicId(e.target.value)}
                    disabled={filteredTopics.length === 0}
                  >
                    <option value="">Geral / Sem tópico específico</option>
                    {filteredTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                  {filteredTopics.length === 0 && adHocDisciplineId && (
                    <p className="text-xs text-fg-subtle">
                      Nenhum tópico cadastrado nesta disciplina.{' '}
                      <button
                        type="button"
                        onClick={() => setTopicModalOpen(true)}
                        className="text-primary hover:underline"
                      >
                        Clique aqui para adicionar um tópico.
                      </button>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Field label="Duração pretendida (min)" required>
                      <Input
                        type="number"
                        min="1"
                        max="720"
                        value={adHocPlannedMinutes}
                        onChange={(e) => setAdHocPlannedMinutes(e.target.value)}
                        required
                      />
                    </Field>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[25, 45, 60, 90, 120].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setAdHocPlannedMinutes(String(mins))}
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                            adHocPlannedMinutes === String(mins)
                              ? 'bg-primary text-primary-fg font-semibold'
                              : 'bg-surface-muted text-fg-muted hover:bg-surface-muted/80 hover:text-fg'
                          )}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Objetivo rápido" hint="Metas específicas rendem mais: o quê e quanto.">
                    <Input
                      type="text"
                      placeholder="Ex: Resolver 15 exercícios de SQL"
                      value={adHocObjective}
                      onChange={(e) => setAdHocObjective(e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Anotações prévias">
                  <Textarea
                    rows={2}
                    placeholder="Material de apoio ou anotações..."
                    value={adHocNotes}
                    onChange={(e) => setAdHocNotes(e.target.value)}
                  />
                </Field>

                <Button
                  variant={plannedCandidates.length > 0 ? 'secondary' : 'primary'}
                  className="w-full"
                  icon={<Play className="size-4" />}
                  onClick={handleStartAdHoc}
                  loading={loading}
                >
                  Começar a Estudar Agora
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Focus Mode overlay */}
      {activeTimer && focusMode && (
        <FocusMode
          timer={activeTimer}
          elapsed={elapsed}
          disciplineName={
            discMap.get(activeTimer.disciplineId)?.name ??
            (activeTimer.disciplineId === 'simulado' ? 'Simulado Geral BNB' : 'Sessão de estudo')
          }
          disciplineColor={discMap.get(activeTimer.disciplineId)?.color ?? '#A6193C'}
          topicTitle={activeTimer.topicId ? topicMap.get(activeTimer.topicId)?.title : null}
          loading={loading}
          onPause={handlePause}
          onResume={handleResume}
          onFinish={handleFinish}
          onExit={() => setFocusMode(false)}
        />
      )}

      {/* Discard Confirmation Modal */}
      <ConfirmModal
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Descartar Sessão em Andamento?"
        message="O tempo decorrido até o momento NÃO será registrado no seu histórico e a sessão será encerrada. Tem certeza que deseja descartar?"
        confirmLabel="Descartar Sessão"
        onConfirm={handleDiscard}
        loading={loading}
      />

      {/* Quick Topic Modal */}
      <TopicModal
        open={topicModalOpen}
        onClose={() => setTopicModalOpen(false)}
        disciplineId={adHocDisciplineId}
        onSaved={(created) => setAdHocTopicId(created.id)}
      />

      {/* Post-session Question Modal */}
      <QuestionModal
        open={questionModalOpen}
        onClose={() => setQuestionModalOpen(false)}
        defaultDate={justFinishedSession?.date}
        defaultDisciplineId={justFinishedSession?.disciplineId}
        defaultTopicId={justFinishedSession?.topicId}
        sessionId={justFinishedSession?.id}
      />

      {/* Post-session Error Modal */}
      <ErrorNoteModal
        open={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        defaultDate={justFinishedSession?.date}
        defaultDisciplineId={justFinishedSession?.disciplineId}
        defaultTopicId={justFinishedSession?.topicId}
      />
    </div>
  );
}
