import { useEffect, useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Calendar,
  CalendarClock,
  LayoutDashboard,
  Menu,
  Timer,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CelebrationLayer } from '../motivation/CelebrationLayer';
import { useActiveTimer, useDisciplines, useSettings } from '../../hooks/useData';
import { elapsedSeconds } from '../../domain/timer';
import { formatClock } from '../../lib/format';
import {
  getActiveContestProfile,
  getUserContests,
  subscribeContests,
  type UserContestProfile,
} from '../../services/contests';
import { cn } from '../../lib/utils';

const BASE_TITLE = 'estudaê';

interface AppLayoutProps {
  onSwitchContestScreen?: () => void;
}

/**
 * Tique a cada segundo a partir de um Web Worker: timers da thread principal
 * são limitados pelo navegador em abas em segundo plano; os de workers não.
 */
function useWorkerTick(enabled: boolean): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setTick(Date.now());
    if (typeof Worker === 'undefined') {
      const id = window.setInterval(() => setTick(Date.now()), 1000);
      return () => window.clearInterval(id);
    }
    const url = URL.createObjectURL(
      new Blob(['setInterval(() => postMessage(0), 1000)'], { type: 'text/javascript' }),
    );
    const worker = new Worker(url);
    worker.onmessage = () => setTick(Date.now());
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  }, [enabled]);
  return tick;
}

export function AppLayout({ onSwitchContestScreen }: AppLayoutProps) {
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('estudae_sidebar_collapsed') === 'true',
  );

  useEffect(() => {
    window.localStorage.setItem('estudae_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  const activeTimer = useActiveTimer();
  const disciplines = useDisciplines();
  const settings = useSettings();
  const now = useWorkerTick(Boolean(activeTimer && activeTimer.status === 'running'));

  const [activeContest, setActiveContest] = useState<UserContestProfile>(() =>
    getActiveContestProfile(),
  );
  const [contestCount, setContestCount] = useState<number>(() => getUserContests().length);

  useEffect(() => {
    const sync = () => {
      setActiveContest(getActiveContestProfile());
      setContestCount(getUserContests().length);
    };
    sync();
    return subscribeContests(sync);
  }, [settings?.contestId, settings?.contestName, disciplines.length]);

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  // Mostra o tempo do cronômetro no rótulo da aba do navegador: tempo decorrido - "nome da disciplina"
  useEffect(() => {
    if (!activeTimer) {
      document.title = activeContest
        ? `estudaê — ${activeContest.name} (${activeContest.role})`
        : BASE_TITLE;
      return;
    }
    const clock = formatClock(elapsedSeconds(activeTimer, now));
    const disc = discMap.get(activeTimer.disciplineId);
    const disciplineName =
      disc?.name ??
      (activeTimer.disciplineId === 'simulado'
        ? 'Simulado Geral'
        : activeTimer.disciplineId || 'estudaê');
    const statusIcon = activeTimer.status === 'running' ? '▶' : '⏸';
    document.title = `${statusIcon} ${clock} - ${disciplineName}`;
  }, [activeTimer, now, discMap, activeContest]);

  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    [],
  );

  const mobileQuickLinks = [
    { to: '/', label: 'Início', icon: LayoutDashboard },
    { to: '/estudar-agora', label: 'Estudar', icon: Timer },
    { to: '/cronograma', label: 'Ciclo', icon: CalendarClock },
    { to: '/calendario', label: 'Agenda', icon: Calendar },
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-fg">
      <a href="#main-content" className="skip-link" onClick={(event) => {
        event.preventDefault();
        document.getElementById('main-content')?.focus();
      }}>
        Pular para o conteúdo principal
      </a>
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        activeContest={activeContest}
        contestCount={contestCount}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onSwitchContestScreen={onSwitchContestScreen}
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 lg:bg-[var(--navigation-background)]">
        <Header
          activeContest={activeContest}
          timerNow={now}
        />
        <main
          id="main-content"
          className="flex-1 bg-canvas lg:rounded-tl-xl overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-20 focus:outline-hidden"
          tabIndex={-1}
        >
          <div key={pathname} className="mx-auto w-full min-w-0 max-w-7xl motion-safe:animate-fade-in">
            <Outlet context={now} />
          </div>
        </main>

        {/* Barra inferior de acesso rápido em dispositivos Mobile */}
        <nav
          aria-label="Acesso rápido mobile"
          className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch gap-1 bg-surface px-[max(0.5rem,env(safe-area-inset-left))] pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgb(15_23_42/0.04)]"
        >
          {mobileQuickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-xs font-medium transition-colors active:bg-primary-soft',
                    isActive ? 'text-primary font-semibold bg-primary-soft' : 'text-fg-muted hover:text-fg',
                  )
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full wrap-anywhere">{item.label}</span>
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu completo"
            aria-expanded={mobileMenuOpen}
            aria-controls="main-navigation"
            className={cn(
              'flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-xs font-medium transition-colors hover:text-fg active:bg-primary-soft',
              mobileQuickLinks.some((item) => item.to === pathname) ? 'text-fg-muted' : 'bg-primary-soft text-primary font-semibold',
            )}
          >
            <Menu className="size-5" aria-hidden="true" />
            <span className="max-w-full wrap-anywhere">Mais</span>
          </button>
        </nav>
      </div>
      <CelebrationLayer />

    </div>
  );
}
