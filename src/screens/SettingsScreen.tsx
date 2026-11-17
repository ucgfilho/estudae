import { useState, useEffect, useRef } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Save,
  Database,
  Target,
  Sparkles,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, Alert } from '../components/ui/Display';
import { Field, Input, Checkbox } from '../components/ui/Form';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useSettings } from '../hooks/useData';
import { useCelebrationsEnabled } from '../hooks/useCelebrationPrefs';
import { updateSettings } from '../services/settings';
import { deleteUserAccount } from '../services/auth';
import {
  createBackup,
  validateBackup,
  restoreBackup,
  downloadFile,
  type BackupFile,
  type DataTableName,
} from '../services/backup';
import { db, resetDatabase } from '../db/db';
import { parseIntervals } from '../domain/reviews';
import { todayKey, formatDate } from '../lib/dates';
import { errorMessage } from '../lib/utils';
import { useSuccessToast } from '../components/ui/Toast';
import { DateInput } from '../components/ui/DateInput';

export function SettingsScreen() {
  const settings = useSettings();
  const [celebrationsEnabled, setCelebrationsEnabled] = useCelebrationsEnabled();

  // Settings form states
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('120');
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState('840');
  const [dailyQuestionGoal, setDailyQuestionGoal] = useState('');
  const [accuracyGoal, setAccuracyGoal] = useState('80');
  const [topicCompletionGoal, setTopicCompletionGoal] = useState('');
  const [reviewIntervalsText, setReviewIntervalsText] = useState('1, 7, 30');
  const [examDate, setExamDate] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  // Backup & Restore states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<{
    backup: BackupFile;
    counts: Record<DataTableName, number>;
  } | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  // Reset states
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteAccountConfirmOpen, setDeleteAccountConfirmOpen] = useState(false);

  // Messages
  const [actionError, setActionError] = useState<string | null>(null);
  const setActionSuccess = useSuccessToast();
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    if (settings) {
      setDailyGoalMinutes(String(settings.dailyGoalMinutes));
      setWeeklyGoalMinutes(String(settings.weeklyGoalMinutes));
      setDailyQuestionGoal(settings.dailyQuestionGoal ? String(settings.dailyQuestionGoal) : '');
      setAccuracyGoal(String(settings.accuracyGoal));
      setTopicCompletionGoal(
        settings.topicCompletionGoal ? String(settings.topicCompletionGoal) : ''
      );
      setReviewIntervalsText(settings.reviewIntervals.join(', '));
      setExamDate(settings.examDate ?? '');
      setGeminiApiKey(settings.geminiApiKey ?? '');
    }
  }, [settings]);

  const handleSaveSettings = async () => {
    setActionError(null);
    setActionSuccess(null);

    const daily = parseInt(dailyGoalMinutes, 10);
    const weekly = parseInt(weeklyGoalMinutes, 10);
    const accuracy = parseInt(accuracyGoal, 10);
    const dailyQuestions = dailyQuestionGoal.trim() ? parseInt(dailyQuestionGoal, 10) : null;
    const topicGoal = topicCompletionGoal.trim() ? parseInt(topicCompletionGoal, 10) : null;

    if (isNaN(daily) || daily < 1) {
      setActionError('Informe uma meta diária de pelo menos 1 minuto.');
      return;
    }
    if (isNaN(weekly) || weekly < 1) {
      setActionError('Informe uma meta semanal de pelo menos 1 minuto.');
      return;
    }
    if (isNaN(accuracy) || accuracy < 1 || accuracy > 100) {
      setActionError('Informe uma meta de acertos entre 1% e 100%.');
      return;
    }

    const intervalsParsed = parseIntervals(reviewIntervalsText);
    if (!intervalsParsed.ok) {
      setActionError(intervalsParsed.error);
      return;
    }

    setLoading(true);
    try {
      await updateSettings({
        dailyGoalMinutes: daily,
        weeklyGoalMinutes: weekly,
        accuracyGoal: accuracy,
        dailyQuestionGoal: dailyQuestions,
        topicCompletionGoal: topicGoal,
        reviewIntervals: intervalsParsed.value,
        examDate: examDate.trim() || null,
        geminiApiKey: geminiApiKey.trim(),
      });
      setActionSuccess('Configurações e metas salvas.');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Export JSON Backup
  const handleExportBackup = async () => {
    setActionError(null);
    try {
      const backup = await createBackup();
      const json = JSON.stringify(backup, null, 2);
      downloadFile(`backup_estudos_bnb_${todayKey()}.json`, json, 'application/json');
      setActionSuccess('Backup exportado.');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  // Import JSON Backup (Step 1: Parse and Validate)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionError(null);
    setActionSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const validation = validateBackup(text);
      if (!validation.ok) {
        setActionError(`Arquivo de backup inválido: ${validation.errors.join('; ')}`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setPendingBackup({ backup: validation.backup, counts: validation.counts });
      setRestoreConfirmOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setActionError('Falha ao ler o arquivo selecionado.');
    };
    reader.readAsText(file);
  };

  // Restore Backup (Step 2: Confirm and overwrite)
  const handleConfirmRestore = async () => {
    if (!pendingBackup) return;
    setActionError(null);
    setLoading(true);
    try {
      await restoreBackup(pendingBackup.backup);
      setRestoreConfirmOpen(false);
      setPendingBackup(null);
      setActionSuccess('Backup restaurado. Seus dados foram atualizados.');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Reset System (Delete all records and reseed)
  const handleConfirmReset = async () => {
    setActionError(null);
    setLoading(true);
    try {
      await resetDatabase();
      setResetConfirmOpen(false);
      setActionSuccess('Sistema reiniciado. Disciplinas padrão restauradas.');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Delete Account and all personal data (LGPD Art. 18, VI)
  const handleConfirmDeleteAccount = async () => {
    setActionError(null);
    setLoading(true);
    try {
      await deleteUserAccount();
      db.clearMemory();
      setDeleteAccountConfirmOpen(false);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Configurações e metas"
        description="Ajuste suas metas de estudo, intervalos de revisão e cópias de segurança."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Save className="size-4" />}
            onClick={handleSaveSettings}
            loading={loading}
          >
            Salvar alterações
          </Button>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Não foi possível salvar" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Section 1: Study Goals */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <span>Metas de estudo</span>
          </div>
        }
        description="Defina as metas que acompanham seu progresso."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Meta diária de estudo (min)" required hint="Padrão: 120 minutos (2 horas)">
            <Input
              type="number"
              min="1"
              max="1440"
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(e.target.value)}
              required
            />
          </Field>

          <Field label="Meta semanal de estudo (min)" required hint="Padrão: 840 minutos (14 horas)">
            <Input
              type="number"
              min="1"
              max="10080"
              value={weeklyGoalMinutes}
              onChange={(e) => setWeeklyGoalMinutes(e.target.value)}
              required
            />
          </Field>

          <Field label="Meta de acerto (%)" required hint="Padrão: 80% de acerto em questões">
            <Input
              type="number"
              min="1"
              max="100"
              value={accuracyGoal}
              onChange={(e) => setAccuracyGoal(e.target.value)}
              required
            />
          </Field>

          <Field label="Meta diária de questões" hint="Opcional. Deixe em branco para estudar sem uma meta fixa.">
            <Input
              type="number"
              min="1"
              placeholder="Ex: 30"
              value={dailyQuestionGoal}
              onChange={(e) => setDailyQuestionGoal(e.target.value)}
            />
          </Field>

          <Field label="Meta de conclusão do edital (%)" hint="Opcional. Exemplo: concluir 90% dos tópicos.">
            <Input
              type="number"
              min="1"
              max="100"
              placeholder="Ex: 90"
              value={topicCompletionGoal}
              onChange={(e) => setTopicCompletionGoal(e.target.value)}
            />
          </Field>

          <Field label="Data da prova" hint="Opcional. Defina quando a data for confirmada.">
            <DateInput
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* Section 2: Spaced Repetition & Interface */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 text-primary" />
            <span>Revisões e celebrações</span>
          </div>
        }
        description="Escolha quando revisar e como celebrar suas conquistas."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Intervalos de revisão (dias)"
            hint="Separe os intervalos por vírgula. Exemplo: 1, 7, 30."
            required
          >
            <Input
              type="text"
              value={reviewIntervalsText}
              onChange={(e) => setReviewIntervalsText(e.target.value)}
              placeholder="1, 7, 30"
              required
            />
          </Field>

          <Checkbox
            className="sm:col-span-2"
            checked={celebrationsEnabled}
            onChange={(e) => setCelebrationsEnabled(e.target.checked)}
            label="Animações de celebração ao concluir metas"
            description="Mostra confetes nas conquistas. Os avisos continuam ativos sem as animações. A mudança é aplicada na hora."
          />
        </div>
      </Card>

      {/* Section 3: Inteligência Artificial (IA) */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span>Assistente de estudos</span>
          </div>
        }
        description="Adicione sua chave do Google Gemini para usar o assistente."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Chave de API do Google Gemini"
            hint={
              <span className="inline-flex flex-wrap items-center gap-1">
                <span>Opcional para o assistente de estudos.</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5 max-lg:min-h-9 max-lg:px-1"
                >
                  Obter chave gratuita
                  <ExternalLink className="size-2.5" />
                </a>
              </span>
            }
          >
            <Input
              type="password"
              placeholder="AIzaSy..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* Section 4: Persistence, Privacy & Backup */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <span>Dados e cópias de segurança</span>
          </div>
        }
        description="Seus dados são salvos automaticamente e você pode exportar ou restaurar uma cópia de segurança a qualquer momento."
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4">
            <div>
              <div className="font-semibold text-sm text-fg">Exportar cópia de segurança</div>
              <p className="text-xs text-fg-muted mt-0.5">
                Gera um arquivo com todas as suas disciplinas, tópicos, sessões, questões e caderno de erros.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="size-4" />}
              onClick={handleExportBackup}
            >
              Baixar cópia (JSON)
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4">
            <div>
              <div className="font-semibold text-sm text-fg">Restaurar cópia de segurança</div>
              <p className="text-xs text-fg-muted mt-0.5">
                Importa um arquivo JSON previamente salvo. Os dados serão validados antes de qualquer sobrescrita.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileSelected}
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="size-4" />}
                onClick={() => fileInputRef.current?.click()}
              >
                Selecionar arquivo JSON
              </Button>
            </div>
          </div>

          <details className="group rounded-lg border border-danger/30 bg-danger-soft/5 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-danger select-none flex items-center justify-between">
              <span>Excluir dados ou conta</span>
              <span className="text-[11px] font-normal text-fg-muted group-open:hidden">Expandir opções</span>
            </summary>
            <div className="mt-4 space-y-3 border-t border-danger/20 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-danger/25 bg-surface p-3.5">
                <div>
                  <div className="font-semibold text-sm text-fg">Reiniciar a plataforma</div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Apaga todos os registros de estudo, questões e sessões e recria as disciplinas iniciais.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RotateCcw className="size-4 text-danger" />}
                  onClick={() => setResetConfirmOpen(true)}
                  className="text-danger border-danger/30 hover:bg-danger-soft/30"
                >
                  Reiniciar plataforma
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-danger/25 bg-surface p-3.5">
                <div>
                  <div className="font-semibold text-sm text-fg">
                    Excluir conta e dados pessoais
                  </div>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Elimina permanentemente seu cadastro e todos os dados vinculados no banco de dados.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 className="size-4 text-danger" />}
                  onClick={() => setDeleteAccountConfirmOpen(true)}
                  className="text-danger border-danger/30 hover:bg-danger-soft/30"
                >
                  Excluir conta e dados
                </Button>
              </div>
            </div>
          </details>
        </div>
      </Card>

      {/* Confirmation Modal for Restore */}
      {pendingBackup && (
        <ConfirmModal
          open={restoreConfirmOpen}
          onClose={() => {
            setRestoreConfirmOpen(false);
            setPendingBackup(null);
          }}
          title="Restaurar cópia de segurança?"
          message={
            <div className="space-y-2">
              <p>
                O arquivo de backup de <strong>{formatDate(pendingBackup.backup.exportedAt.slice(0, 10))}</strong> é válido.
              </p>
              <div className="rounded-lg bg-surface-muted p-2 text-xs space-y-1">
                <div>• Disciplinas: {pendingBackup.counts.disciplines}</div>
                <div>• Tópicos: {pendingBackup.counts.topics}</div>
                <div>• Sessões de estudo: {pendingBackup.counts.sessions}</div>
                <div>• Lançamentos de questões: {pendingBackup.counts.questionLogs}</div>
                <div>• Caderno de erros: {pendingBackup.counts.errorNotes}</div>
                <div>• Revisões: {pendingBackup.counts.reviews}</div>
              </div>
              <p className="text-danger font-medium text-xs">
                Atenção: Os dados atuais serão substituídos integralmente pelo conteúdo do backup.
              </p>
            </div>
          }
          confirmLabel="Substituir dados e restaurar"
          variant="danger"
          onConfirm={handleConfirmRestore}
          loading={loading}
        />
      )}

      {/* Confirmation Modal for System Reset */}
      <ConfirmModal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reiniciar o sistema e apagar os dados?"
        message="Todos os seus tópicos, sessões, questões e anotações de erros serão excluídos permanentemente. Apenas as disciplinas iniciais do concurso serão mantidas."
        confirmLabel="Reiniciar sistema"
        variant="danger"
        onConfirm={handleConfirmReset}
        loading={loading}
      />

      {/* Confirmation Modal for LGPD Account Deletion */}
      <ConfirmModal
        open={deleteAccountConfirmOpen}
        onClose={() => setDeleteAccountConfirmOpen(false)}
        title="Excluir sua conta e dados pessoais?"
        message="Sua conta e todos os seus registros de estudo serão excluídos permanentemente (LGPD, Art. 18, VI). Esta ação não pode ser desfeita."
        confirmLabel="Excluir minha conta"
        variant="danger"
        onConfirm={handleConfirmDeleteAccount}
        loading={loading}
      />
    </div>
  );
}
