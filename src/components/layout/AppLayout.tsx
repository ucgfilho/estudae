import { useEffect, useState, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BookMarked,
  Calendar,
  CalendarClock,
  FolderPlus,
  LayoutDashboard,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CelebrationLayer } from '../motivation/CelebrationLayer';
import { NewContestModal } from '../modals/NewContestModal';
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

const BASE_TITLE = 'estudaê — Sua Plataforma de Estudos para Concursos';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newContestModalOpen, setNewContestModalOpen] = useState(false);
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
    { to: '/cronograma', label: '24 sem.', icon: CalendarClock },
    { to: '/calendario', label: 'Agenda', icon: Calendar },
    { to: '/disciplinas', label: 'Edital', icon: BookMarked },
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-fg">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        activeContest={activeContest}
        contestCount={contestCount}
        onOpenNewContest={() => setNewContestModalOpen(true)}
        onSwitchContestScreen={onSwitchContestScreen}
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          activeContest={activeContest}
          onSwitchContestScreen={onSwitchContestScreen}
        />
        <main
          className="flex-1 overflow-y-auto p-3 sm:p-6 pb-20 lg:pb-6 focus:outline-hidden"
          tabIndex={-1}
        >
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Barra inferior de acesso rápido em dispositivos Mobile */}
        <nav
          aria-label="Acesso rápido mobile"
          className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-center justify-around border-t border-border bg-surface/95 backdrop-blur-md px-1 py-1.5 shadow-lg"
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
                    'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] font-medium transition min-w-[58px]',
                    isActive ? 'text-primary font-semibold' : 'text-fg-muted hover:text-fg',
                  )
                }
              >
                <Icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setNewContestModalOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary-soft/30 transition min-w-[58px]"
          >
            <FolderPlus className="size-4" />
            <span>+ Concurso</span>
          </button>
        </nav>
      </div>
      <CelebrationLayer />

      <NewContestModal
        open={newContestModalOpen}
        onClose={() => setNewContestModalOpen(false)}
        onCreated={() => {
          setNewContestModalOpen(false);
          setActiveContest(getActiveContestProfile());
          setContestCount(getUserContests().length);
        }}
      />
    </div>
  );
}
