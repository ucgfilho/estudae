import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  CalendarClock,
  Timer,
  CheckSquare,
  AlertOctagon,
  RotateCcw,
  ClipboardList,
  BookMarked,
  BarChart3,
  Settings,
  FolderPlus,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from '../ui/Button';
import { BnbLogo } from '../ui/BnbLogo';
import { useReviews, useErrorNotes, useActiveTimer, useToday } from '../../hooks/useData';
import { reviewBuckets } from '../../domain/metrics';
import type { UserContestProfile } from '../../services/contests';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeContest?: UserContestProfile;
  contestCount?: number;
  onOpenNewContest?: () => void;
  onSwitchContestScreen?: () => void;
}

export const NAV_ITEMS = [
  { to: '/', label: 'Visão geral', shortLabel: 'Início', icon: LayoutDashboard },
  { to: '/calendario', label: 'Calendário', shortLabel: 'Agenda', icon: Calendar },
  { to: '/cronograma', label: 'Cronograma', shortLabel: '24 sem.', icon: CalendarClock },
  { to: '/estudar-agora', label: 'Estudar agora', shortLabel: 'Estudar', icon: Timer },
  { to: '/questoes', label: 'Questões', icon: CheckSquare },
  { to: '/erros', label: 'Caderno de erros', icon: AlertOctagon },
  { to: '/revisoes', label: 'Revisões', icon: RotateCcw },
  { to: '/simulados', label: 'Simulados', icon: ClipboardList },
  { to: '/disciplinas', label: 'Disciplinas e conteúdos', shortLabel: 'Edital', icon: BookMarked },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  activeContest,
  contestCount = 1,
  onOpenNewContest,
  onSwitchContestScreen,
}: SidebarProps) {
  const today = useToday();
  const reviews = useReviews();
  const errorNotes = useErrorNotes();
  const timer = useActiveTimer();

  const buckets = reviewBuckets(reviews, today);
  const pendingReviewsCount = buckets.overdue.length + buckets.today.length;
  const pendingErrorsCount = errorNotes.filter((e) => e.status === 'revisar').length;
  const isTimerRunning = Boolean(timer && timer.status === 'running');

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navegação principal"
      >
        {/* Branding header: estudaê */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <BnbLogo className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold tracking-tight text-fg truncate leading-tight">
                estudaê
              </h1>
              <p className="text-[11px] font-medium text-fg-subtle truncate leading-none mt-0.5">
                {activeContest ? `${activeContest.shortName} · ${activeContest.role}` : 'Multi-Concursos'}
              </p>
            </div>
          </div>
          <IconButton
            label="Fechar menu lateral"
            icon={<X className="size-4" />}
            onClick={onCloseMobile}
            className="lg:hidden"
            size="sm"
          />
        </div>

        {/* Painel do Concurso Ativo + Botão "+ Novo concurso" */}
        <div className="px-3 pt-3 pb-1.5 space-y-2 border-b border-border/60">
          {activeContest && (
            <div className="rounded-xl border border-border bg-surface-muted/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-6 rounded-md flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 shadow-xs"
                    style={{ backgroundColor: activeContest.accentColor || '#c20018' }}
                  >
                    {activeContest.shortName.slice(0, 3)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-fg truncate">
                      {activeContest.name}
                    </div>
                    <div className="text-[10px] text-fg-muted truncate">
                      {activeContest.disciplineCount} disc. · {activeContest.topicCount} tópicos
                    </div>
                  </div>
                </div>
                {onSwitchContestScreen && (
                  <button
                    type="button"
                    data-testid="sidebar-switch-contest-button"
                    onClick={() => {
                      onCloseMobile();
                      onSwitchContestScreen();
                    }}
                    title={contestCount && contestCount > 1 ? `Trocar concurso (${contestCount} disponíveis)` : "Trocar concurso"}
                    aria-label="Trocar concurso"
                    className="flex size-7 items-center justify-center rounded-lg border border-border bg-surface text-fg-muted hover:text-primary hover:border-primary/40 hover:bg-primary-soft/30 transition shrink-0 cursor-pointer shadow-2xs"
                  >
                    <ArrowLeftRight className="size-3.5 text-primary" />
                  </button>
                )}
              </div>
            </div>
          )}

          {onOpenNewContest && (
            <button
              type="button"
              data-testid="sidebar-new-contest-button"
              onClick={() => {
                onCloseMobile();
                onOpenNewContest();
              }}
              className="w-full h-9 flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary-soft/40 hover:bg-primary hover:text-primary-fg text-primary font-semibold px-3 text-xs transition shadow-2xs cursor-pointer"
            >
              <FolderPlus className="size-4 shrink-0" />
              <span>+ Novo concurso</span>
            </button>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isReviews = item.to === '/revisoes';
            const isErrors = item.to === '/erros';
            const isStudy = item.to === '/estudar-agora';

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate flex-1">{item.label}</span>

                {/* Live indicators */}
                {isStudy && isTimerRunning && (
                  <span
                    className="flex size-2 rounded-full bg-primary animate-ping"
                    title="Cronômetro em andamento"
                    aria-hidden="true"
                  />
                )}
                {isReviews && pendingReviewsCount > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none',
                      buckets.overdue.length > 0
                        ? 'bg-danger text-white'
                        : 'bg-warning text-canvas',
                    )}
                    title={`${pendingReviewsCount} revisão(ões) pendente(s)`}
                  >
                    {pendingReviewsCount}
                  </span>
                )}
                {isErrors && pendingErrorsCount > 0 && (
                  <span
                    className="rounded-full bg-surface-muted border border-border px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted tabular-nums leading-none"
                    title={`${pendingErrorsCount} erro(s) a revisar`}
                  >
                    {pendingErrorsCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Target role reminder */}
        <div className="border-t border-border p-3 text-[11px] text-fg-subtle">
          <div className="font-semibold text-fg">
            {activeContest ? activeContest.name : 'Concurso Ativo'}
          </div>
          <div className="truncate">
            {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
          </div>
          <div className="mt-1 text-primary font-medium">Meta: 120 min/dia (840 min/sem)</div>
        </div>
      </aside>
    </>
  );
}
