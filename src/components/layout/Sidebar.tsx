import { useEffect } from 'react';
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
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from '../ui/Button';
import { BnbLogo } from '../ui/BnbLogo';
import { useReviews, useErrorNotes, useActiveTimer, useToday, useSettings } from '../../hooks/useData';
import { reviewBuckets } from '../../domain/metrics';
import { reconcileReviewsAndErrorNotes } from '../../services/performance';
import type { UserContestProfile } from '../../services/contests';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeContest?: UserContestProfile;
  contestCount?: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSwitchContestScreen?: () => void;
}

export const NAV_ITEMS = [
  { to: '/', label: 'Visão geral', shortLabel: 'Início', icon: LayoutDashboard, section: 'Execução e agenda' },
  { to: '/calendario', label: 'Calendário', shortLabel: 'Agenda', icon: Calendar },
  { to: '/cronograma', label: 'Ciclo de estudos', shortLabel: 'Ciclo', icon: CalendarClock },
  { to: '/estudar-agora', label: 'Estudar agora', shortLabel: 'Estudar', icon: Timer },
  { to: '/questoes', label: 'Questões', icon: CheckSquare, section: 'Prática e retenção' },
  { to: '/erros', label: 'Caderno de erros', icon: AlertOctagon },
  { to: '/revisoes', label: 'Revisões', icon: RotateCcw },
  { to: '/simulados', label: 'Simulados', icon: ClipboardList },
  { to: '/disciplinas', label: 'Disciplinas e conteúdos', shortLabel: 'Edital', icon: BookMarked, section: 'Base e acompanhamento' },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  activeContest,
  contestCount = 1,
  collapsed,
  onToggleCollapsed,
  onSwitchContestScreen,
}: SidebarProps) {
  const today = useToday();
  const reviews = useReviews();
  const errorNotes = useErrorNotes();
  const timer = useActiveTimer();
  const settings = useSettings();

  // Mantém Revisões e Caderno de Erros sincronizados (mesma contagem) em qualquer tela.
  useEffect(() => {
    if (reviews.length === 0 && errorNotes.length === 0) return;
    void reconcileReviewsAndErrorNotes();
  }, [reviews.length, errorNotes]);

  const buckets = reviewBuckets(reviews, today);
  const pendingReviewsCount = buckets.overdue.length + buckets.today.length;
  const pendingErrorsCount = errorNotes.length;
  const isTimerRunning = Boolean(timer && timer.status === 'running');
  const dailyGoal = settings?.dailyGoalMinutes ?? 120;
  const weeklyGoal = settings?.weeklyGoalMinutes ?? 840;
  const timeGoalsDisabled = dailyGoal === 0 && weeklyGoal === 0;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden animate-fade-in"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        id="main-navigation"
        data-collapsed={collapsed}
        className={cn(
          'fixed inset-y-0 left-0 z-40 max-lg:z-50 flex shrink-0 max-lg:w-80 max-lg:max-w-[90vw] max-lg:shadow-2xl max-lg:pt-[env(safe-area-inset-top)] max-lg:pb-[env(safe-area-inset-bottom)] flex-col navigation-chrome bg-surface transition-[width,translate,visibility] duration-240 ease-emphasized motion-reduce:transition-none lg:static lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-60 xl:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full max-lg:invisible max-lg:transition-discrete',
        )}
        aria-label="Navegação principal"
      >
        {/* Branding header: estudaê */}
        <div className="flex h-14 shrink-0 items-center justify-between overflow-hidden px-4">
          <div className="sidebar-label flex min-w-0 items-center gap-2.5 overflow-hidden lg:whitespace-nowrap">
            <BnbLogo className="size-7 shrink-0 rounded-md" />
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-fg max-lg:wrap-anywhere leading-tight">
                estudaê
              </p>
            </div>
          </div>
          <IconButton
            label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            icon={collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            onClick={onToggleCollapsed}
            aria-controls="sidebar-links"
            aria-expanded={!collapsed}
            className="ml-auto max-lg:hidden"
            size="sm"
          />
          <IconButton
            label="Fechar menu lateral"
            icon={<X className="size-4" />}
            onClick={onCloseMobile}
            className="lg:hidden"
            size="sm"
          />
        </div>

        {/* Navigation list */}
        <nav id="sidebar-links" aria-label="Menu principal" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const isReviews = item.to === '/revisoes';
            const isErrors = item.to === '/erros';
            const isStudy = item.to === '/estudar-agora';

            return (
              <div key={item.to}>
                {item.section && (
                  <div
                    className={cn(
                      'px-2.5 pb-1 text-[11px] font-medium text-fg-subtle select-none',
                      idx > 0 && 'mt-3 pt-2',
                    )}
                  >
                    <span className="sidebar-label block truncate">{item.section}</span>
                  </div>
                )}
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  aria-label={item.label}
                  title={collapsed ? item.label : undefined}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 max-lg:min-h-12 max-lg:gap-3 text-sm font-medium transition-[color,background-color,padding] duration-200',
                      collapsed && 'lg:pl-3.5 lg:pr-0',
                      isActive
                        ? 'nav-selected font-semibold'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sidebar-label min-w-0 flex-1 max-lg:wrap-anywhere lg:truncate">{item.label}</span>

                  {/* Indicadores discretos e relevantes (Regra 3: sem piscar durante o estudo) */}
                  {isStudy && isTimerRunning && (
                    <span
                      className="sidebar-label inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                      title="Cronômetro em andamento"
                    >
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                      Ativo
                    </span>
                  )}
                  {isReviews && pendingReviewsCount > 0 && (
                    <span
                      className={cn(
                        'sidebar-label shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none',
                        buckets.overdue.length > 0
                          ? 'bg-danger text-status-fg'
                          : 'bg-warning-soft text-warning',
                      )}
                      title={`${pendingReviewsCount} revisão(ões) pendente(s)`}
                    >
                      {pendingReviewsCount}
                    </span>
                  )}
                  {isErrors && pendingErrorsCount > 0 && (
                    <span
                      className="sidebar-label shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-fg-muted tabular-nums leading-none"
                      title={`${pendingErrorsCount} erro(s) registrado(s)`}
                    >
                      {pendingErrorsCount}
                    </span>
                  )}
                </NavLink>
              </div>
            );
          })}
        </nav>

        {/* Botão de Trocar Concurso na parte inferior */}
        {onSwitchContestScreen && (
          <div className="p-2.5">
            <button
              type="button"
              data-testid="sidebar-switch-contest-button"
              onClick={() => {
                onCloseMobile();
                onSwitchContestScreen();
              }}
              aria-label="Trocar concurso"
              title={contestCount && contestCount > 1 ? `Trocar concurso (${contestCount} disponíveis)` : 'Trocar concurso'}
              className="group flex w-full cursor-pointer items-center overflow-hidden rounded-lg bg-surface-muted/40 p-2.5 text-left transition-colors hover:bg-surface-muted lg:px-[7px]"
            >
              <div className="sidebar-label min-w-0 flex-1 lg:whitespace-nowrap">
                <div className="text-xs font-semibold text-fg group-hover:text-primary transition-colors max-lg:wrap-anywhere lg:truncate">
                  {activeContest ? activeContest.name : 'Concurso ativo'}
                </div>
                <div className="text-[11px] text-fg-subtle max-lg:wrap-anywhere lg:truncate mt-0.5">
                  {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
                </div>
                {!timeGoalsDisabled && <div className="mt-1 text-[11px] text-fg-muted lg:truncate tabular-nums">
                  {dailyGoal > 0 ? `Meta: ${dailyGoal} min/dia · ` : ''}{weeklyGoal} min/sem
                </div>}
              </div>
              <div className="flex size-7 items-center justify-center rounded-md bg-surface text-fg-muted group-hover:text-primary transition-colors shrink-0 max-lg:ml-2">
                <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              </div>
            </button>
          </div>
        )}

        {!onSwitchContestScreen && (
          <div className="sidebar-label p-3 text-[11px] text-fg-subtle">
            <div className="font-semibold text-fg lg:truncate">
              {activeContest ? activeContest.name : 'Concurso ativo'}
            </div>
            <div className="max-lg:wrap-anywhere lg:truncate">
              {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
            </div>
            {!timeGoalsDisabled && <div className="mt-1 text-fg-muted tabular-nums">{dailyGoal > 0 ? `Meta: ${dailyGoal} min/dia · ` : ''}{weeklyGoal} min/sem</div>}
          </div>
        )}
      </aside>
    </>
  );
}
