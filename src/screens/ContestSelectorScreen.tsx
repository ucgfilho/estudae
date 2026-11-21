import { ThemeToggle } from '../components/ui/ThemeToggle';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarRange,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { BnbLogo } from '../components/ui/BnbLogo';
import { Avatar } from '../components/ui/Avatar';
import {
  deleteContestProfile,
  getActiveContestScopeId,
  getUserContests,
  subscribeContests,
  switchActiveContest,
  type UserContestProfile,
} from '../services/contests';
import { getAuthSession, logoutUser, subscribeAuth } from '../services/auth';
import { CONTEST_LIMIT_MESSAGE, MAX_USER_CONTESTS } from '../domain/contestLimit';
import { cn } from '../lib/utils';

import { LoadingState } from '../components/ui/Display';
import { useToast } from '../components/ui/Toast';

const ProfileModal = lazy(() =>
  import('../components/profile/ProfileModal').then((mod) => ({ default: mod.ProfileModal }))
);
const NewContestModal = lazy(() =>
  import('../components/modals/NewContestModal').then((mod) => ({ default: mod.NewContestModal }))
);

interface ContestSelectorScreenProps {
  initializing?: boolean;
  onSelectContest: (contest: UserContestProfile) => void;
}

export function ContestSelectorScreen({ onSelectContest, initializing = false }: ContestSelectorScreenProps) {
  const [authUser, setAuthUser] = useState(() => getAuthSession()?.user ?? null);
  const [contests, setContests] = useState<UserContestProfile[]>(() => getUserContests());
  const [pendingContest, setPendingContest] = useState<UserContestProfile | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const toast = useToast();

  const atContestLimit = contests.length >= MAX_USER_CONTESTS;
  const activeScopeId = getActiveContestScopeId();

  useEffect(() => {
    setContests(getUserContests());
    const unsubContests = subscribeContests(() => {
      setContests(getUserContests());
    });
    const unsubAuth = subscribeAuth(() => {
      setAuthUser(getAuthSession()?.user ?? null);
    });
    return () => {
      unsubContests();
      unsubAuth();
    };
  }, []);

  const handleChoose = useCallback(async (contest: UserContestProfile) => {
    if (loadingId) return;
    if (initializing) {
      setPendingContest(contest);
      return;
    }
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
  }, [initializing, loadingId, onSelectContest]);

  useEffect(() => {
    if (!initializing && pendingContest) {
      setPendingContest(null);
      void handleChoose(pendingContest);
    }
  }, [initializing, pendingContest, handleChoose]);

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
      className="contest-selector-screen relative isolate min-h-screen flex flex-col justify-between overflow-hidden bg-canvas text-fg"
    >
      <div className="contest-selector-glow contest-selector-glow-primary" aria-hidden="true" />
      <div className="contest-selector-glow contest-selector-glow-secondary" aria-hidden="true" />
      {/* Topo com Logo estudaê e botão Sair */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 max-w-6xl w-full mx-auto">
        <div className="flex min-w-0 items-center gap-3 max-sm:gap-2">
          <BnbLogo className="size-10 rounded-xl shadow-md" />
          <div>
            <div className="text-lg sm:text-xl font-bold tracking-tight text-fg flex items-center gap-1.5">
              <span>estudaê</span>
            </div>
            <div className="text-[11px] text-fg-muted max-sm:hidden">
              Seus concursos e ciclos de estudo
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {authUser && (
            <button
              type="button"
              data-testid="selector-profile-button"
              disabled={initializing}
              onClick={() => setProfileOpen(true)}
              title="Editar perfil"
              className="inline-flex control-height items-center gap-2 rounded-lg border border-border-strong bg-surface px-2.5 text-xs font-medium text-fg hover:border-primary/40 transition cursor-pointer"
            >
              <Avatar name={authUser.name || authUser.email} src={authUser.avatarUrl} size="sm" />
              <span className="hidden sm:inline-block max-w-36 wrap-anywhere font-semibold text-fg">
                {authUser.name}
              </span>
              <Pencil className="size-3 text-fg-subtle shrink-0" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void logoutUser().catch(() => toast.error('Não foi possível encerrar a sessão. Tente novamente.'));
            }}
            className="inline-flex control-height items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-xs font-medium text-fg-muted hover:text-danger hover:border-danger/40 transition cursor-pointer"
          >
            <LogOut className="size-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Central estilo Netflix Profiles */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-6 sm:py-10 max-w-5xl w-full mx-auto text-center">
        <div className="space-y-2 mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg">
            Qual concurso você vai estudar agora?
          </h1>
          <p className="text-sm leading-relaxed text-fg-muted max-w-xl mx-auto">
            Escolha um concurso para continuar seus estudos ou adicione um novo edital.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-danger/40 bg-danger-soft/30 px-4 py-2.5 text-xs text-danger max-w-md">
            {errorMsg}
          </div>
        )}

        {/* Grade de Perfis de Concursos (Estilo Netflix) */}
        <div aria-busy={initializing} className="flex flex-wrap items-stretch justify-center gap-4 sm:gap-6 w-full max-w-5xl">
          {contests.map((contest) => {
            const isLoading = loadingId === contest.id || pendingContest?.id === contest.id;
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
                  'group relative w-full max-w-[260px] min-[440px]:w-[calc(50%_-_0.5rem)] min-[440px]:max-w-[208px] sm:w-52 rounded-xl border bg-surface p-5 flex flex-col items-center text-center transition-colors duration-150 cursor-pointer select-none',
                  'hover:border-primary hover:bg-surface-muted/20',
                  isCurrent
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border',
                  isLoading && 'opacity-75 pointer-events-none',
                )}
              >
                {manageMode && contests.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, contest)}
                    title="Excluir concurso"
                    className="absolute top-2.5 right-2.5 size-7 max-lg:size-9 rounded-full bg-danger/10 text-danger hover:bg-danger hover:text-status-fg flex items-center justify-center transition"
                  >
                    <Trash2 className="size-3.5 max-lg:size-4" />
                  </button>
                )}

                {/* Emblema do concurso */}
                <div
                  className="w-20 sm:w-24 min-h-20 sm:min-h-24 p-2 rounded-xl flex flex-col items-center justify-center text-white font-bold mb-3.5 wrap-anywhere"
                  style={{
                    backgroundColor: contest.accentColor || '#1E40AF',
                  }}
                >
                  <span className="text-xl sm:text-2xl tracking-tight">
                    {contest.shortName}
                  </span>
                </div>

                <div className="w-full wrap-anywhere font-semibold text-base text-fg group-hover:text-primary transition-colors">
                  {contest.name}
                </div>
                <div className="w-full wrap-anywhere text-sm leading-relaxed text-fg-muted mt-1">{contest.role}</div>

                <div className="mt-3 pt-3 border-t border-border w-full flex items-center justify-center gap-3 text-[11px] text-fg-subtle">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3 text-primary" />
                    {contest.disciplineCount} disc.
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange className="size-3 text-accent" />
                    Ciclo
                  </span>
                </div>

                <div className="h-4 mt-1 flex items-center justify-center">
                  {isLoading && (
                    <span className="text-[11px] font-semibold text-primary animate-pulse">
                      Abrindo painel...
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Card "+ Novo concurso" */}
          <button
            type="button"
            data-testid="new-contest-card-button"
            disabled={initializing || atContestLimit}
            aria-describedby={atContestLimit ? "contest-limit" : undefined}
            onClick={() => setShowNewModal(true)}
            className="group w-full max-w-[260px] min-[440px]:w-[calc(50%_-_0.5rem)] min-[440px]:max-w-[208px] sm:w-52 rounded-xl border border-dashed border-border-strong hover:border-primary bg-surface/50 hover:bg-primary-soft/15 p-5 flex flex-col items-center justify-center text-center transition-colors duration-150 cursor-pointer min-h-[210px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="size-20 sm:size-24 rounded-xl bg-surface-muted group-hover:bg-primary/15 text-fg-muted group-hover:text-primary flex items-center justify-center mb-3.5 transition-colors duration-150">
              <Plus className="size-9 stroke-[2]" />
            </div>
            <div className="font-bold text-sm sm:text-base text-fg group-hover:text-primary transition">
              Novo concurso
            </div>
            <div className="text-xs text-fg-muted mt-0.5">
              {atContestLimit ? "Limite atingido" : "Adicionar à minha conta"}
            </div>
          </button>
        </div>

        {atContestLimit && (
          <p id="contest-limit" role="status" className="mt-4 text-sm text-fg-muted">{CONTEST_LIMIT_MESSAGE}</p>
        )}

        {contests.length > 1 && (
          <div className="mt-8">
            <button
              type="button"
              disabled={initializing}
              onClick={() => setManageMode((prev) => !prev)}
              className="rounded-lg border border-border-strong bg-surface px-4 py-2 max-lg:py-2.5 max-lg:min-h-11 text-xs font-semibold text-fg-muted hover:text-fg hover:border-primary/40 transition"
            >
              {manageMode ? 'Concluir gerenciamento' : 'Gerenciar concursos'}
            </button>
          </div>
        )}
      </main>

      <footer className="relative z-10 py-4 text-center text-[11px] text-fg-subtle">
        estudaê · Ciclos contínuos de estudos a partir do seu edital verticalizado
      </footer>

      {showNewModal && (
        <Suspense fallback={<LoadingState label="Carregando novo concurso..." />}>
          <NewContestModal
            open={showNewModal}
            onClose={() => setShowNewModal(false)}
            onCreated={(created) => {
              setShowNewModal(false);
              onSelectContest(created);
            }}
          />
        </Suspense>
      )}

      {profileOpen && (
        <Suspense fallback={<LoadingState label="Carregando perfil..." />}>
          <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
