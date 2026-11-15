import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Send,
  Sparkles,
  X,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useSettings } from '../../hooks/useData';
import {
  processAssistantMessage,
  type AssistantChatMessage,
} from '../../services/aiAssistant';
import { updateSettings } from '../../services/settings';
import { cn, errorMessage } from '../../lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  executedActions?: string[];
  navigateTo?: string;
  isError?: boolean;
}

/** Renderiza texto com formatação limpa: negrito, marcadores e quebras de linha */
function FormattedMessageText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n');
        return (
          <div key={pIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              const isBullet = trimmed.startsWith('•') || trimmed.startsWith('- ') || trimmed.startsWith('* ');
              const cleanLine = isBullet
                ? trimmed.replace(/^[•\-*]\s*/, '')
                : trimmed;

              const isHeading = cleanLine.startsWith('### ') || cleanLine.startsWith('## ') || cleanLine.startsWith('# ');
              const headingText = isHeading ? cleanLine.replace(/^#+\s*/, '') : cleanLine;

              // Separa trechos em negrito (**texto**)
              const parts = (isHeading ? headingText : cleanLine).split(/(\*\*.*?\*\*)/g);
              const renderedParts = parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={i} className="font-semibold text-fg">
                      {part.slice(2, -2)}
                    </strong>
                  );
                }
                return part;
              });

              if (isHeading) {
                return (
                  <div key={lIdx} className="font-semibold text-xs text-primary pt-1">
                    {renderedParts}
                  </div>
                );
              }

              if (isBullet) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-1 text-fg/90">
                    <span className="text-primary font-bold">•</span>
                    <span className="flex-1">{renderedParts}</span>
                  </div>
                );
              }

              return (
                <div key={lIdx} className="text-fg/90">
                  {renderedParts}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const settings = useSettings();
  const hasApiKey = Boolean(settings?.geminiApiKey?.trim());

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Olá! Sou o Assistente IA do estudaê, conectado exclusivamente ao Google Gemini e aos dados reais do seu estudo. Pergunte qualquer coisa sobre seu progresso, revisões, erros, patente, matérias do edital ou peça para executar ações na plataforma.',
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (settings?.geminiApiKey) {
      setApiKeyDraft(settings.geminiApiKey);
    }
  }, [settings?.geminiApiKey]);

  useEffect(() => {
    if (open && typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, showKeyForm]);

  const handleSaveApiKey = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedKey = apiKeyDraft.trim();
    if (!trimmedKey || savingKey) return;
    setSavingKey(true);
    try {
      await updateSettings({
        geminiApiKey: trimmedKey,
        aiProvider: 'gemini',
      });
      setShowKeyForm(false);
    } finally {
      setSavingKey(false);
    }
  };

  const sendPrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const history: AssistantChatMessage[] = messages
      .filter((m) => m.id !== 'welcome' && !m.isError)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await processAssistantMessage(trimmed, { history });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: result.reply,
          executedActions: result.executedActions,
          navigateTo: result.navigateTo,
        },
      ]);
    } catch (err) {
      const msg = errorMessage(err);
      if (msg.toLowerCase().includes('chave')) {
        setShowKeyForm(true);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: msg,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 sm:right-4 lg:bottom-6 lg:right-6 z-40 flex flex-col items-end">
      {open && (
        <section
          aria-label="Assistente IA estudaê"
          data-testid="ai-assistant-panel"
          className="mb-3 flex h-[500px] max-h-[78dvh] w-[calc(100vw-1.5rem)] max-sm:h-[calc(100dvh-11rem-env(safe-area-inset-bottom))] max-sm:max-h-none sm:w-96 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border bg-surface-muted/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-xs">
                <Bot className="size-4.5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-fg flex items-center gap-1.5">
                  Assistente Gemini IA
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                </h2>
                <p className="text-[11px] text-fg-muted">
                  Respostas baseadas nos seus dados reais e no edital
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKeyForm((prev) => !prev)}
                aria-label="Configurar chave da API do Gemini"
                title="Configurar chave da API do Google Gemini"
                className={cn(
                  'rounded-lg p-1.5 max-lg:p-2.5 transition-colors cursor-pointer',
                  hasApiKey
                    ? 'text-fg-muted hover:bg-surface hover:text-fg'
                    : 'text-warning bg-warning-soft/60 hover:bg-warning-soft',
                )}
              >
                <KeyRound className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar assistente IA"
                className="rounded-lg p-1.5 max-lg:p-2.5 text-fg-muted hover:bg-surface hover:text-fg transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {(!hasApiKey || showKeyForm) && (
            <form
              onSubmit={(e) => void handleSaveApiKey(e)}
              className="border-b border-border bg-surface-muted/50 px-3.5 py-2.5 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-fg flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-primary" aria-hidden="true" />
                  Chave da API Google Gemini
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                >
                  Obter chave gratuita
                  <ExternalLink className="size-2.5" aria-hidden="true" />
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder="Cole sua chave AIzaSy..."
                  aria-label="Chave de API do Google Gemini"
                  className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 max-lg:py-2.5 text-xs text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={!apiKeyDraft.trim() || savingKey}
                  className="rounded-lg bg-primary px-2.5 py-1.5 max-lg:px-3.5 max-lg:py-2.5 text-xs font-semibold text-primary-fg disabled:opacity-40 hover:brightness-95 transition-all cursor-pointer"
                >
                  {savingKey ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 space-y-3 text-xs max-lg:text-sm">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col gap-1.5 max-w-[88%] rounded-xl px-3 py-2.5 whitespace-pre-line leading-relaxed',
                  msg.role === 'user'
                    ? 'ml-auto bg-primary text-primary-fg'
                    : msg.isError
                      ? 'mr-auto border border-danger/40 bg-danger-soft/40 text-fg'
                      : 'mr-auto border border-border bg-surface-muted/70 text-fg',
                )}
              >
                {msg.role === 'assistant' && msg.id !== 'welcome' && msg.isError && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
                    <AlertCircle className="size-3.5" aria-hidden="true" /> Atenção
                  </span>
                )}
                {msg.role === 'assistant' &&
                  msg.id !== 'welcome' &&
                  !msg.isError &&
                  msg.executedActions &&
                  msg.executedActions.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" /> Ação executada
                    </span>
                  )}
                {msg.role === 'assistant' ? (
                  <FormattedMessageText text={msg.content} />
                ) : (
                  <div>{msg.content}</div>
                )}
                {msg.navigateTo && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate(msg.navigateTo!);
                    }}
                    className="mt-1 inline-flex items-center gap-1 self-start rounded-md bg-primary-soft px-2 py-1 max-lg:px-3 max-lg:py-2 text-[11px] font-semibold text-primary hover:brightness-95 transition-all cursor-pointer"
                  >
                    Abrir seção <ArrowRight className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}

            {loading && (
              <div className="mr-auto rounded-xl border border-border bg-surface-muted/60 px-3 py-2 text-xs text-fg-muted animate-pulse">
                Consultando seus dados com o Gemini...
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-border bg-surface p-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre seus estudos, edital ou peça uma ação..."
              aria-label="Mensagem para o assistente IA"
              className="flex-1 min-w-0 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 max-lg:py-2.5 text-xs text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Enviar comando para o assistente"
              className="inline-flex size-8 max-lg:size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg disabled:opacity-40 hover:brightness-95 transition-all cursor-pointer"
            >
              <Send className="size-3.5" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        data-testid="ai-assistant-fab"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Abrir Assistente IA"
        title="Assistente IA estudaê"
        className="group relative inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg ring-2 ring-primary/30 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Bot className="size-5.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
