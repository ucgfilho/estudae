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
import { Field, Input, Select, Checkbox } from '../components/ui/Form';
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
import type { ThemePreference } from '../db/types';
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
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'builtin' | 'gemini'>('builtin');

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
      setTheme(settings.theme);
      setGeminiApiKey(settings.geminiApiKey ?? '');
      setAiProvider(settings.aiProvider ?? 'builtin');
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
      setActionError('A meta diária de estudos deve ser um valor positivo em minutos.');
      return;
    }
    if (isNaN(weekly) || weekly < 1) {
      setActionError('A meta semanal de estudos deve ser um valor positivo em minutos.');
      return;
    }
    if (isNaN(accuracy) || accuracy < 1 || accuracy > 100) {
      setActionError('A meta de acertos deve ser uma porcentagem entre 1 e 100.');
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
        theme,
        geminiApiKey: geminiApiKey.trim(),
        aiProvider,
      });
      setActionSuccess('Configurações e metas salvas com sucesso!');
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
      setActionSuccess('Backup exportado com sucesso!');
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
      setActionSuccess('Backup restaurado com sucesso! Seus dados foram atualizados.');
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
      setActionSuccess('O sistema foi reiniciado. As disciplinas padrão foram restauradas.');
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
    <div className="space-y-6">
      <PageHeader
        title="Configurações e Metas"
        description="Ajuste suas metas de preparação, intervalos de revisão, tema da interface e gerenciamento de backup."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Save className="size-4" />}
            onClick={handleSaveSettings}
            loading={loading}
          >
            Salvar Alterações
          </Button>
        }
      />

      {actionError && (
        <Alert tone="danger" title="Erro" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}


      {/* Section 1: Study Goals */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <span>Metas Operacionais de Estudo</span>
          </div>
        }
        description="Parâmetros de comparação utilizados nos painéis do dashboard e relatórios"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Meta Diária de Estudo (minutos)" required hint="Padrão: 120 minutos (2 horas)">
            <Input
              type="number"
              min="1"
              max="1440"
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(e.target.value)}
              required
            />
          </Field>

          <Field label="Meta Semanal de Estudo (minutos)" required hint="Padrão: 840 minutos (14 horas)">
            <Input
              type="number"
              min="1"
              max="10080"
              value={weeklyGoalMinutes}
              onChange={(e) => setWeeklyGoalMinutes(e.target.value)}
              required
            />
          </Field>

          <Field label="Meta Operacional de Acerto (%)" required hint="Padrão: 80% de acerto em questões">
            <Input
              type="number"
              min="1"
              max="100"
              value={accuracyGoal}
              onChange={(e) => setAccuracyGoal(e.target.value)}
              required
            />
          </Field>

          <Field label="Meta Diária de Questões" hint="Opcional (deixe em branco se não quiser meta fixa)">
            <Input
              type="number"
              min="1"
              placeholder="Ex: 30"
              value={dailyQuestionGoal}
              onChange={(e) => setDailyQuestionGoal(e.target.value)}
            />
          </Field>

          <Field label="Meta de Conclusão do Edital (%)" hint="Opcional (ex: 90% dos tópicos finalizados)">
            <Input
              type="number"
              min="1"
              max="100"
              placeholder="Ex: 90"
              value={topicCompletionGoal}
              onChange={(e) => setTopicCompletionGoal(e.target.value)}
            />
          </Field>

          <Field label="Data Prevista da Prova" hint="Opcional (não assume data fixa automaticamente)">
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
            <span>Repetição Espaçada e Interface</span>
          </div>
        }
        description="Ajuste os intervalos para geração automática de revisões e preferência visual"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Intervalos de Revisão (dias)"
            hint="Valores padrão editáveis separados por vírgula (ex: 1, 7, 30)"
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

          <Field label="Tema Visual da Interface">
            <Select value={theme} onChange={(e) => setTheme(e.target.value as ThemePreference)}>
              <option value="system">Padrão do Sistema Operacional</option>
              <option value="light">Tema Claro (Light)</option>
              <option value="dark">Tema Escuro (Dark)</option>
            </Select>
          </Field>

          <Checkbox
            className="sm:col-span-2"
            checked={celebrationsEnabled}
            onChange={(e) => setCelebrationsEnabled(e.target.checked)}
            label="Animações de celebração ao concluir metas"
            description="Confete ao finalizar sessões, bater a meta do dia, completar o cronograma ou ir bem nas questões. Os avisos de conquista continuam aparecendo mesmo desativado. Aplicado imediatamente."
          />
        </div>
      </Card>

      {/* Section 3: Inteligência Artificial (IA) */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span>Inteligência Artificial (IA) e Modelos</span>
          </div>
        }
        description="Configure o motor de IA para geração do cronograma de 24 semanas e assistente de estudos BNB"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Motor de IA Padrão"
            hint="Escolha entre o motor especialista integrado no navegador ou a API do Google Gemini."
          >
            <Select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as 'builtin' | 'gemini')}
            >
              <option value="builtin">IA Integrada Especialista BNB (Local e Imediato)</option>
              <option value="gemini">Google Gemini AI (API Key do Google AI Studio)</option>
            </Select>
          </Field>

          <Field
            label="Chave de API do Google Gemini (API Key)"
            hint={
              <span className="inline-flex items-center gap-1">
                <span>Opcional se usar IA Integrada.</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
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
            <span>Persistência, Privacidade e Backup</span>
          </div>
        }
        description="Seus dados ficam 100% sincronizados na nuvem do MongoDB. Você pode acessar de qualquer dispositivo."
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4">
            <div>
              <div className="font-semibold text-sm text-fg">Exportar Cópia de Segurança (JSON)</div>
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
              Baixar Backup JSON
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-surface-muted/30 p-4">
            <div>
              <div className="font-semibold text-sm text-fg">Restaurar Cópia de Segurança</div>
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
                Selecionar Arquivo JSON
              </Button>
            </div>
          </div>

          <details className="group rounded-lg border border-danger/30 bg-danger-soft/5 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-danger select-none flex items-center justify-between">
              <span>Zona de risco — Reinicialização e exclusão permanente de dados</span>
              <span className="text-[11px] font-normal text-fg-muted group-open:hidden">Expandir opções</span>
            </summary>
            <div className="mt-4 space-y-3 border-t border-danger/20 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-danger/25 bg-surface p-3.5">
                <div>
                  <div className="font-semibold text-sm text-fg">Reiniciar o Sistema</div>
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
                  Reiniciar Sistema
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-danger/25 bg-surface p-3.5">
                <div>
                  <div className="font-semibold text-sm text-fg">
                    Excluir Minha Conta e Dados Pessoais (LGPD — Art. 18, VI)
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
                  Excluir Conta e Dados
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
          title="Confirmar Restauração de Backup?"
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
          confirmLabel="Restaurar e Sobrescrever"
          variant="danger"
          onConfirm={handleConfirmRestore}
          loading={loading}
        />
      )}

      {/* Confirmation Modal for System Reset */}
      <ConfirmModal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reiniciar o Sistema e Apagar Todos os Dados?"
        message="Esta ação é permanente e irreversível. Todos os seus tópicos, sessões estudadas, baterias de questões e anotações de erros serão excluídos. O banco será recriado apenas com as 8 disciplinas iniciais."
        confirmLabel="Sim, Reiniciar Tudo"
        variant="danger"
        onConfirm={handleConfirmReset}
        loading={loading}
      />

      {/* Confirmation Modal for LGPD Account Deletion */}
      <ConfirmModal
        open={deleteAccountConfirmOpen}
        onClose={() => setDeleteAccountConfirmOpen(false)}
        title="Excluir Permanentemente Sua Conta e Dados Pessoais?"
        message="Em conformidade com o Art. 18, VI da LGPD (Lei nº 13.709/2018), esta ação eliminará de forma definitiva e irreversível a sua conta de usuário e todos os seus dados de estudo vinculados no banco de dados."
        confirmLabel="Sim, Excluir Minha Conta"
        variant="danger"
        onConfirm={handleConfirmDeleteAccount}
        loading={loading}
      />
    </div>
  );
}
