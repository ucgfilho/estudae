import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  Sun,
  Moon,
  Monitor,
  Settings as SettingsIcon,
  Timer as TimerIcon,
  CalendarDays,
  LogOut,
  Pencil,
} from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Badge } from '../ui/Display';
import { Avatar } from '../ui/Avatar';
import { ProfileModal } from '../profile/ProfileModal';
import { tierOf } from '../motivation/RankCard';
import { useSettings, useActiveTimer, useNow, useSessions, useReviews } from '../../hooks/useData';
import { updateSettings } from '../../services/settings';
import { getAuthSession, setAuthSession, subscribeAuth } from '../../services/auth';
import { db } from '../../db/db';
import { todayKey, formatLongDate } from '../../lib/dates';
import { daysUntil } from '../../domain/metrics';
import { computeRank } from '../../domain/rank';
import { elapsedSeconds } from '../../domain/timer';
import { formatClock } from '../../lib/format';
import { cn } from '../../lib/utils';
import { BnbLogo } from '../ui/BnbLogo';
import type { ThemePreference } from '../../db/types';
import type { UserContestProfile } from '../../services/contests';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  activeContest?: UserContestProfile;
}

export function Header({
  onToggleMobileMenu,
  activeContest: _activeContest,
}: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [authUser, setAuthUser] = useState(() => getAuthSession()?.user ?? null);
  const settings = useSettings();
  const sessions = useSessions();
  const reviews = useReviews();
  const timer = useActiveTimer();
  const now = useNow(1000, Boolean(timer && timer.status === 'running'));
  const today = todayKey(now);
  const navigate = useNavigate();

  const rankState = useMemo(
    () => computeRank({ sessions, reviews, settings, today }),
    [sessions, reviews, settings, today],
  );
  const rankTier = tierOf(rankState.rankIndex);
  const RankIcon = rankTier.icon;

  useEffect(() => {
    return subscribeAuth(() => {
      setAuthUser(getAuthSession()?.user ?? null);
    });
  }, []);

  const themePreference = settings?.theme;

  // Apply theme class to documentElement
  useEffect(() => {
    if (!themePreference) return;
    const isDark =
      themePreference === 'dark' ||
      (themePreference === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themePreference]);

  const cycleTheme = async () => {
    const next: Record<ThemePreference, ThemePreference> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };
    const current = settings?.theme ?? 'system';
    await updateSettings({ theme: next[current] });
  };

  const handleLogout = () => {
    db.clearMemory();
    setAuthSession(null);
  };

  const themeIcon = {
    light: <Sun className="size-4" />,
    dark: <Moon className="size-4" />,
    system: <Monitor className="size-4" />,
  }[settings?.theme ?? 'system'];

  const examDaysLeft = daysUntil(settings?.examDate ?? null, today);

  const timerSeconds = timer ? elapsedSeconds(timer, now) : 0;

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 max-lg:h-[calc(3.5rem+env(safe-area-inset-top))] max-lg:pt-[env(safe-area-inset-top)] shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <IconButton
            label="Abrir menu de navegação"
            icon={<Menu className="size-5" />}
            onClick={onToggleMobileMenu}
            className="lg:hidden shrink-0"
          />

          <BnbLogo className={cn('size-7 shrink-0 lg:hidden rounded-lg', timer && 'max-sm:hidden')} />

          <div className="hidden md:flex items-center gap-2">
            <CalendarDays className="size-4 text-fg-subtle" />
            <span className="text-xs sm:text-sm font-medium text-fg capitalize truncate">
              {formatLongDate(today)}
            </span>
          </div>

          {examDaysLeft !== null && (
            <Badge
              tone={examDaysLeft <= 14 ? 'danger' : examDaysLeft <= 30 ? 'warning' : 'primary'}
              className="hidden xl:inline-flex"
            >
              {examDaysLeft > 0
                ? `${examDaysLeft} dias até a prova`
                : examDaysLeft === 0
                  ? 'Dia da prova hoje!'
                  : `Prova realizada há ${Math.abs(examDaysLeft)} dias`}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {timer && (
            <button
              type="button"
              onClick={() => navigate('/estudar-agora')}
              className="inline-flex control-height items-center gap-1.5 sm:gap-2 rounded-lg border border-primary/30 bg-primary-soft px-2 text-xs font-semibold text-primary transition-colors hover:brightness-95"
              title="Sessão de estudo em andamento — Clique para abrir o cronômetro"
            >
              <TimerIcon className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">
                {timer.status === 'paused' ? 'Pausado' : 'Em foco'}
              </span>
              <span className="tabular-nums font-mono">{formatClock(timerSeconds)}</span>
            </button>
          )}

          {authUser && (
            <button
              type="button"
              data-testid="header-profile-button"
              onClick={() => setProfileOpen(true)}
              title={`Editar perfil (${authUser.name} · Patente: ${rankState.rank.name} · ${rankState.xp} XP)`}
              className="inline-flex control-height items-center gap-2 rounded-lg border border-border bg-surface hover:bg-surface-muted px-2.5 max-sm:px-2 py-1.5 text-xs font-medium text-fg transition-colors cursor-pointer"
              aria-label="Editar perfil"
            >
              <span
                data-testid="header-rank-icon"
                title={`Patente atual: ${rankState.rank.name} (${rankState.xp} XP)`}
                className={cn(
                  'hidden sm:inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-muted ring-1',
                  rankTier.ring,
                )}
              >
                <RankIcon className={cn('size-3.5', rankTier.color)} aria-hidden="true" />
              </span>
              <Avatar name={authUser.name || authUser.email} src={authUser.avatarUrl} size="xs" />
              <span className="hidden md:inline-block max-w-24 truncate font-medium text-fg">
                {authUser.name}
              </span>
              <Pencil className="hidden sm:block size-3 text-fg-subtle shrink-0" aria-hidden="true" />
            </button>
          )}

          <IconButton
            label={`Alterar tema (atual: ${{ light: 'claro', dark: 'escuro', system: 'sistema' }[settings?.theme ?? 'system']})`}
            icon={themeIcon}
            onClick={cycleTheme}
          />

          <Link to="/configuracoes" aria-label="Configurações" title="Configurações" className="hidden size-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg lg:inline-flex">
            <SettingsIcon className="size-4" aria-hidden="true" />
          </Link>

          <IconButton
            label="Sair da conta"
            icon={<LogOut className="size-4" />}
            onClick={handleLogout}
          />
        </div>
      </header>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
