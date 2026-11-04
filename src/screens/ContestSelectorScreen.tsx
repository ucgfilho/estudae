import { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarRange,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BnbLogo } from '../components/ui/BnbLogo';
import { NewContestModal } from '../components/modals/NewContestModal';
import {
  deleteContestProfile,
  getActiveContestScopeId,
  getUserContests,
  subscribeContests,
  switchActiveContest,
  type UserContestProfile,
} from '../services/contests';
import { getAuthSession, setAuthSession } from '../services/auth';
import { cn } from '../lib/utils';

interface ContestSelectorScreenProps {
  onSelectContest: (contest: UserContestProfile) => void;
}

export function ContestSelectorScreen({ onSelectContest }: ContestSelectorScreenProps) {
  const session = getAuthSession();
  const [contests, setContests] = useState<UserContestProfile[]>(() => getUserContests());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeScopeId = getActiveContestScopeId();

  useEffect(() => {
    setContests(getUserContests());
    return subscribeContests(() => {
      setContests(getUserContests());
    });
  }, []);

  const handleChoose = async (contest: UserContestProfile) => {
    if (loadingId) return;
    setErrorMsg(null);
    setLoadingId(contest.id);
    try {
      const activated = await switchActiveContest(contest.id);
      onSelectContest(activated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar concurso.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, contest: UserContestProfile) => {
    e.stopPropagation();
    if (contests.length <= 1) {
      setErrorMsg('Mantenha pelo menos um concurso ativo na sua conta.');
      return;
    }
    try {
      await deleteContestProfile(contest.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível remover o concurso.');
    }
  };

  return (
    <div
      data-testid="contest-selector-screen"
      className="min-h-screen flex flex-col justify-between bg-bg text-fg relative overflow-hidden"
    >
      {/* Fundo decorativo com a paleta estudaê (#c20018 / #a6193c / #f68b1f) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-15 dark:opacity-25"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, #c20018 0%, #a6193c 45%, transparent 75%)',
        }}
      />

      {/* Topo com Logo estudaê e botão Sair */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <BnbLogo className="size-10 rounded-xl shadow-md" />
          <div>
            <div className="text-lg sm:text-xl font-bold tracking-tight text-fg flex items-center gap-1.5">
              <span>estudaê</span>
              <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                Multi-Concursos
              </span>
            </div>
            <div className="text-[11px] text-fg-muted">
              Sua plataforma adaptativa de editais e cronogramas
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {session?.user && (
            <span className="hidden sm:inline-block text-xs text-fg-muted">
              Olá, <strong className="text-fg">{session.user.name}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => setAuthSession(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-danger hover:border-danger/40 transition"
          >
            <LogOut className="size-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Central estilo Netflix Profiles */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-6 sm:py-10 max-w-5xl w-full mx-auto text-center">
        <div className="space-y-2 mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/40 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            <span>Ambientes Isolados por Edital</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-fg">
            Qual concurso vamos estudar agora?
          </h1>
          <p className="text-xs sm:text-sm text-fg-muted max-w-xl mx-auto">
            Escolha um dos seus concursos abaixo para acessar o edital verticalizado, simulados e
            cronograma de 24 semanas, ou adicione um novo concurso.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-danger/40 bg-danger-soft/30 px-4 py-2.5 text-xs text-danger max-w-md">
            {errorMsg}
          </div>
        )}

        {/* Grade de Perfis de Concursos (Estilo Netflix) */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 w-full max-w-4xl justify-items-center">
          {contests.map((contest) => {
            const isLoading = loadingId === contest.id;
            const isCurrent = contest.id === activeScopeId;
            return (
              <div
                key={contest.id}
                role="button"
                tabIndex={0}
                data-testid={`contest-card-${contest.id}`}
                onClick={() => handleChoose(contest)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleChoose(contest);
                  }
                }}
                className={cn(
                  'group relative w-full max-w-[240px] rounded-2xl border bg-surface p-5 flex flex-col items-center text-center transition-all duration-200 cursor-pointer select-none',
                  'hover:-translate-y-1.5 hover:shadow-xl hover:border-primary',
                  isCurrent
                    ? 'border-primary/60 ring-2 ring-primary/20 shadow-md'
                    : 'border-border-strong shadow-xs',
                  isLoading && 'opacity-75 pointer-events-none',
                )}
              >
                {manageMode && contests.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, contest)}
                    title="Excluir concurso"
                    className="absolute top-2.5 right-2.5 size-7 rounded-full bg-danger/10 text-danger hover:bg-danger hover:text-white flex items-center justify-center transition"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}

                {/* Avatar grande estilo Netflix */}
                <div
                  className="size-20 sm:size-24 rounded-2xl flex flex-col items-center justify-center text-white font-extrabold shadow-md mb-3.5 transition-transform duration-200 group-hover:scale-105 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${contest.accentColor} 0%, #a6193c 100%)`,
                  }}
                >
                  <span className="text-xl sm:text-2xl tracking-tight drop-shadow-xs">
                    {contest.shortName}
                  </span>
                  <span className="mt-1 rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                    {contest.examBoard}
                  </span>
                </div>

                <div className="font-bold text-sm sm:text-base text-fg group-hover:text-primary transition line-clamp-1">
                  {contest.name}
                </div>
                <div className="text-xs text-fg-muted line-clamp-1 mt-0.5">{contest.role}</div>

                <div className="mt-3 pt-3 border-t border-border w-full flex items-center justify-center gap-3 text-[11px] text-fg-subtle">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3 text-primary" />
                    {contest.disciplineCount} disc.
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange className="size-3 text-accent" />
                    24 sem.
                  </span>
                </div>

                {isLoading && (
                  <div className="mt-2 text-[11px] font-semibold text-primary animate-pulse">
                    Abrindo painel...
                  </div>
                )}
              </div>
            );
          })}

          {/* Card "+ Novo concurso" estilo Adicionar Perfil Netflix */}
          <button
            type="button"
            data-testid="new-contest-card-button"
            onClick={() => setShowNewModal(true)}
            className="group w-full max-w-[240px] rounded-2xl border-2 border-dashed border-border-strong hover:border-primary bg-surface/50 hover:bg-primary-soft/15 p-5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:-translate-y-1.5 cursor-pointer min-h-[210px]"
          >
            <div className="size-20 sm:size-24 rounded-2xl bg-surface-muted group-hover:bg-primary/15 text-fg-muted group-hover:text-primary flex items-center justify-center mb-3.5 transition-all duration-200 group-hover:scale-105">
              <Plus className="size-10 stroke-[2.2]" />
            </div>
            <div className="font-bold text-sm sm:text-base text-fg group-hover:text-primary transition">
              + Novo concurso
            </div>
            <div className="text-xs text-fg-muted mt-0.5">
              Enviar outro edital verticalizado
            </div>
          </button>
        </div>

        {contests.length > 1 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setManageMode((prev) => !prev)}
              className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg hover:border-primary/40 transition"
            >
              {manageMode ? 'Concluir gerenciamento' : 'Gerenciar concursos'}
            </button>
          </div>
        )}
      </main>

      <footer className="relative z-10 py-4 text-center text-[11px] text-fg-subtle">
        estudaê · Cronogramas inteligentes de 24 semanas adaptados ao seu Edital Verticalizado
      </footer>

      <NewContestModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={(created) => {
          setShowNewModal(false);
          onSelectContest(created);
        }}
      />
    </div>
  );
}
