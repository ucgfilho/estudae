import { useState, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  BrainCircuit,
  Key,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea, Checkbox } from '../ui/Form';
import { Alert } from '../ui/Display';
import { generateSchedule } from '../../services/schedule';
import { updateSettings } from '../../services/settings';
import { useSettings } from '../../hooks/useData';
import type { DateKey } from '../../lib/dates';
import { errorMessage } from '../../lib/utils';
import { DateInput } from '../ui/DateInput';

interface AiScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  defaultStartDate: DateKey;
}

const GENERATION_STEPS = [
  'Carregando Edital Verticalizado BNB 2022 (Especialista Técnico — Analista de Sistemas — Perfil 1: Desenvolvimento de Sistemas)...',
  'Mapeando 100% dos 148 tópicos oficiais de Conhecimentos Gerais e Conhecimentos Específicos de TI...',
  'Distribuindo carga diária rigorosa de 2 horas (120 minutos) sem sobrecarga...',
  'Estruturando sábados exclusivos para questões e simulados sobre os tópicos do edital estudados na semana...',
  'Organizando progressão pedagógica fiel ao PDF do Edital Verticalizado ao longo das 24 semanas...',
  'Finalizando persistência do cronograma inteligente...',
];

export function AiScheduleModal({
  open,
  onClose,
  onSuccess,
  defaultStartDate,
}: AiScheduleModalProps) {
  const settings = useSettings();

  const [startDate, setStartDate] = useState<DateKey>(defaultStartDate);
  const [provider, setProvider] = useState<'builtin' | 'gemini'>('builtin');
  const [apiKey, setApiKey] = useState<string>('');
  const [saveApiKey, setSaveApiKey] = useState<boolean>(true);
  const [customInstructions, setCustomInstructions] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza dados com configurações persistidas quando modal abre
  useEffect(() => {
    if (open) {
      setError(null);
      if (settings) {
        setStartDate((prev) => (!prev ? settings.scheduleStartDate ?? defaultStartDate : prev));
        if (settings.geminiApiKey) {
          setApiKey((prev) => prev || settings.geminiApiKey || '');
          setProvider((prev) => (prev === 'builtin' ? 'gemini' : prev));
        } else {
          setProvider((prev) => prev || settings.aiProvider || 'builtin');
        }
      }
    }
  }, [open, settings?.scheduleStartDate, settings?.geminiApiKey, settings?.aiProvider, defaultStartDate]);

  const handleGenerate = async () => {
    setError(null);
    if (!startDate) {
      setError('Por favor, selecione uma data de início para o cronograma.');
      return;
    }

    if (provider === 'gemini' && !apiKey.trim() && !settings?.geminiApiKey) {
      setError('Informe a sua Chave de API do Google Gemini ou selecione a IA Integrada Especialista BNB.');
      return;
    }

    setLoading(true);
    setCurrentStepIndex(0);

    // Animação de progresso da IA
    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < GENERATION_STEPS.length - 1 ? prev + 1 : prev));
    }, 450);

    try {
      if (provider === 'gemini' && apiKey.trim() && saveApiKey) {
        await updateSettings({
          geminiApiKey: apiKey.trim(),
          aiProvider: 'gemini',
        });
      }

      const result = await generateSchedule(startDate, undefined, {
        provider,
        apiKey: apiKey.trim() || undefined,
        customInstructions: customInstructions.trim() || undefined,
      });

      clearInterval(interval);
      const providerLabel = result.providerUsed === 'gemini' ? 'Google Gemini AI' : 'IA Integrada Especialista BNB';
      onSuccess(`Cronograma de 24 semanas gerado com sucesso exclusivamente por IA (${providerLabel})!`);
      onClose();
    } catch (err) {
      clearInterval(interval);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !loading && onClose()}
      title="Gerar Cronograma de 24 Semanas com IA"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerate}
            loading={loading}
            icon={<Sparkles className="size-4" />}
          >
            {loading ? 'Gerando com IA...' : 'Gerar Cronograma com IA'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Banner de Especificação Dinâmica do Concurso / Edital Verticalizado */}
        <div className="rounded-xl border border-primary/30 bg-primary-soft/15 p-4 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-primary text-sm">
            <div className="flex items-center gap-2">
              <BrainCircuit className="size-4.5 shrink-0" />
              <span>
                {settings?.contestName
                  ? `Geração Exclusiva por IA — Edital Verticalizado: ${settings.contestName} (${settings.contestRole || 'Cargo Selecionado'})`
                  : 'Geração Exclusiva por Inteligência Artificial — Edital Verticalizado BNB 2022 (Perfil 1)'}
              </span>
            </div>
            {settings?.editalFileName && (
              <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                Edital: {settings.editalFileName}
              </span>
            )}
          </div>
          <p className="text-fg-muted leading-relaxed">
            A IA adapta o prompt e gera seu planejamento de 24 semanas seguindo{' '}
            <strong>
              rigorosamente 100% dos tópicos do{' '}
              {settings?.contestName
                ? `Edital Verticalizado enviado para ${settings.contestName}`
                : 'PDF do Edital Verticalizado BNB 2022'}
            </strong>
            , sem fugir do edital:
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-fg font-medium pt-1">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Foco em TI (Maior Peso):</strong> Priorização inteligente das disciplinas específicas do edital (80% dos dias úteis) + Conhecimentos Gerais (20%).
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>2 Horas por Dia:</strong> Limite diário estrito de 120 minutos, garantindo ritmo sustentável sem sobrecarga.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>Sábados Exclusivos:</strong> Resolução de questões e simulados sobre os exatos tópicos do edital estudados na semana (120 min).</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>Domingos Livres:</strong> Descanso mental semanal completo para retenção e equilíbrio.</span>
            </li>
          </ul>
        </div>

        {error && (
          <Alert tone="danger" title="Não foi possível gerar com IA" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="py-8 px-4 rounded-xl border border-border bg-surface-muted/40 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
            <div className="relative">
              <div className="size-12 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
              <Bot className="size-6 text-primary absolute inset-0 m-auto" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <div className="text-sm font-semibold text-fg">Inteligência Artificial em Execução</div>
              <p className="text-xs text-primary font-medium animate-pulse">
                {GENERATION_STEPS[currentStepIndex]}
              </p>
            </div>
            <div className="w-48 h-1.5 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((currentStepIndex + 1) / GENERATION_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Data de Início do Cronograma" required hint="Primeiro dia de estudos (a semana sempre inicia no domingo correspondente)">
                <DateInput
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </Field>

              <Field label="Motor de Inteligência Artificial" required hint="Escolha o modelo de geração">
                <Select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'builtin' | 'gemini')}
                >
                  <option value="builtin">IA Integrada Especialista BNB (Sem necessidade de chave)</option>
                  <option value="gemini">Google Gemini AI (Requer API Key)</option>
                </Select>
              </Field>
            </div>

            {provider === 'gemini' && (
              <div className="rounded-xl border border-border bg-surface-muted/20 p-3.5 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                    <Key className="size-3.5 text-primary" />
                    <span>Configuração da Google Gemini API</span>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    Obter chave gratuita no Google AI Studio
                    <ExternalLink className="size-3" />
                  </a>
                </div>

                <Field
                  label="Chave de API Gemini (API Key)"
                  required
                  hint="Sua chave fica armazenada com segurança e criptografia no seu perfil na nuvem."
                >
                  <Input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </Field>

                <Checkbox
                  label="Salvar chave de API nas configurações do sistema"
                  description="Evita ter que digitar a chave novamente nas próximas gerações."
                  checked={saveApiKey}
                  onChange={(e) => setSaveApiKey(e.target.checked)}
                />
              </div>
            )}

            <Field
              label="Preferências ou Orientações Extras para a IA (Opcional)"
              hint="Ex: Focar mais em Spring Boot e Microsserviço, reforçar Governança de dados (DAMA-DMBoK) nas semanas finais, etc."
            >
              <Textarea
                rows={2}
                placeholder="Ex: Gostaria de dar mais atenção em Análise por pontos de função (IFPUG e NESMA) e Noções de administração de SGBD (IBM DB2, MS SQL Server e PostgreSQL)..."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2 text-[11px] text-fg-subtle pt-1">
              <ShieldCheck className="size-3.5 text-success shrink-0" />
              <span>Sessões manuais pré-existentes ou já estudadas são preservadas integralmente sem substituição.</span>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
