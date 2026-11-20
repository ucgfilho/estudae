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
        className={cn(
          'fixed inset-y-0 left-0 z-40 max-lg:z-50 flex shrink-0 max-lg:w-80 max-lg:max-w-[90vw] max-lg:shadow-2xl max-lg:pt-[env(safe-area-inset-top)] max-lg:pb-[env(safe-area-inset-bottom)] flex-col navigation-chrome bg-surface transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-60 xl:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full max-lg:invisible',
        )}
        aria-label="Navegação principal"
      >
        {/* Branding header: estudaê */}
        <div className={cn('flex h-14 shrink-0 items-center justify-between px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <div className={cn('flex items-center gap-2.5 min-w-0', collapsed && 'lg:hidden')}>
            <BnbLogo className="size-7 shrink-0 rounded-md" />
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-fg wrap-anywhere leading-tight">
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
            className="max-lg:hidden"
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
                      idx > 0 && 'mt-3 pt-2 border-t border-border/60',
                      collapsed && (idx === 0 ? 'lg:hidden' : 'lg:mt-2 lg:pt-0'),
                    )}
                  >
                    <span className={collapsed ? 'lg:hidden' : undefined}>{item.section}</span>
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
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 max-lg:min-h-12 max-lg:gap-3 text-sm font-medium transition-colors',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-white text-[#1e3a8a] font-semibold'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className={cn('wrap-anywhere flex-1', collapsed && 'lg:hidden')}>{item.label}</span>

                  {/* Indicadores discretos e relevantes (Regra 3: sem piscar durante o estudo) */}
                  {isStudy && isTimerRunning && (
                    <span
                      className={cn('inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary', collapsed && 'lg:hidden')}
                      title="Cronômetro em andamento"
                    >
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                      Ativo
                    </span>
                  )}
                  {isReviews && pendingReviewsCount > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none',
                        collapsed && 'lg:hidden',
                        buckets.overdue.length > 0
                          ? 'bg-danger text-white'
                          : 'bg-warning-soft text-warning',
                      )}
                      title={`${pendingReviewsCount} revisão(ões) pendente(s)`}
                    >
                      {pendingReviewsCount}
                    </span>
                  )}
                  {isErrors && pendingErrorsCount > 0 && (
                    <span
                      className={cn('rounded-full bg-surface-muted border border-border px-1.5 py-0.5 text-[10px] font-medium text-fg-muted tabular-nums leading-none', collapsed && 'lg:hidden')}
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
              className={cn('w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/40 hover:bg-surface-muted p-2.5 text-left transition-colors group cursor-pointer', collapsed && 'lg:justify-center lg:p-1')}
            >
              <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
                <div className="text-xs font-semibold text-fg group-hover:text-primary transition-colors wrap-anywhere">
                  {activeContest ? activeContest.name : 'Concurso ativo'}
                </div>
                <div className="text-[11px] text-fg-subtle wrap-anywhere mt-0.5">
                  {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
                </div>
                {!timeGoalsDisabled && <div className="mt-1 text-[11px] text-fg-muted tabular-nums">
                  {dailyGoal > 0 ? `Meta: ${dailyGoal} min/dia · ` : ''}{weeklyGoal} min/sem
                </div>}
              </div>
              <div className="flex size-7 items-center justify-center rounded-md border border-border bg-surface text-fg-muted group-hover:text-primary transition-colors shrink-0">
                <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              </div>
            </button>
          </div>
        )}

        {!onSwitchContestScreen && (
          <div className={cn('border-t border-border p-3 text-[11px] text-fg-subtle wrap-anywhere', collapsed && 'lg:hidden')}>
            <div className="font-semibold text-fg">
              {activeContest ? activeContest.name : 'Concurso ativo'}
            </div>
            <div className="wrap-anywhere">
              {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
            </div>
            {!timeGoalsDisabled && <div className="mt-1 text-fg-muted tabular-nums">{dailyGoal > 0 ? `Meta: ${dailyGoal} min/dia · ` : ''}{weeklyGoal} min/sem</div>}
          </div>
        )}
      </aside>
    </>
  );
}
