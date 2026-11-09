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
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from '../ui/Button';
import { BnbLogo } from '../ui/BnbLogo';
import { useReviews, useErrorNotes, useActiveTimer, useToday, useSettings } from '../../hooks/useData';
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
  { to: '/', label: 'Visão geral', shortLabel: 'Início', icon: LayoutDashboard, section: 'Execução e agenda' },
  { to: '/calendario', label: 'Calendário', shortLabel: 'Agenda', icon: Calendar },
  { to: '/cronograma', label: 'Cronograma', shortLabel: '24 sem.', icon: CalendarClock },
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
  onOpenNewContest: _onOpenNewContest,
  onSwitchContestScreen,
}: SidebarProps) {
  const today = useToday();
  const reviews = useReviews();
  const errorNotes = useErrorNotes();
  const timer = useActiveTimer();
  const settings = useSettings();

  const buckets = reviewBuckets(reviews, today);
  const pendingReviewsCount = buckets.overdue.length + buckets.today.length;
  const pendingErrorsCount = errorNotes.filter((e) => e.status === 'revisar').length;
  const isTimerRunning = Boolean(timer && timer.status === 'running');
  const dailyGoal = settings?.dailyGoalMinutes ?? 120;
  const weeklyGoal = settings?.weeklyGoalMinutes ?? 840;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navegação principal"
      >
        {/* Branding header: estudaê */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <BnbLogo className="size-7 shrink-0 rounded-md" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-fg truncate leading-tight">
                estudaê
              </h1>
              <p className="text-[11px] text-fg-subtle truncate leading-none mt-0.5">
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

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
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
                    )}
                  >
                    {item.section}
                  </div>
                )}
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary-soft text-primary font-semibold'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate flex-1">{item.label}</span>

                  {/* Indicadores discretos e relevantes (Regra 3: sem piscar durante o estudo) */}
                  {isStudy && isTimerRunning && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
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
                      className="rounded-full bg-surface-muted border border-border px-1.5 py-0.5 text-[10px] font-medium text-fg-muted tabular-nums leading-none"
                      title={`${pendingErrorsCount} erro(s) a revisar`}
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
          <div className="border-t border-border p-2.5">
            <button
              type="button"
              data-testid="sidebar-switch-contest-button"
              onClick={() => {
                onCloseMobile();
                onSwitchContestScreen();
              }}
              title={contestCount && contestCount > 1 ? `Trocar concurso (${contestCount} disponíveis)` : 'Trocar concurso'}
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/40 hover:bg-surface-muted p-2.5 text-left transition-colors group cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-fg group-hover:text-primary transition-colors truncate">
                  {activeContest ? activeContest.name : 'Concurso Ativo'}
                </div>
                <div className="text-[11px] text-fg-subtle truncate mt-0.5">
                  {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
                </div>
                <div className="mt-1 text-[11px] text-fg-muted tabular-nums">
                  Meta: {dailyGoal} min/dia ({weeklyGoal} min/sem)
                </div>
              </div>
              <div className="flex size-7 items-center justify-center rounded-md border border-border bg-surface text-fg-muted group-hover:text-primary transition-colors shrink-0">
                <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              </div>
            </button>
          </div>
        )}

        {!onSwitchContestScreen && (
          <div className="border-t border-border p-3 text-[11px] text-fg-subtle">
            <div className="font-semibold text-fg">
              {activeContest ? activeContest.name : 'Concurso Ativo'}
            </div>
            <div className="truncate">
              {activeContest ? activeContest.role : 'Analista de Sistemas — Desenvolvimento'}
            </div>
            <div className="mt-1 text-fg-muted tabular-nums">Meta: {dailyGoal} min/dia ({weeklyGoal} min/sem)</div>
          </div>
        )}
      </aside>
    </>
  );
}
