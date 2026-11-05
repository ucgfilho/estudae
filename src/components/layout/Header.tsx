import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
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
import { SearchModal } from './SearchModal';
import { ProfileModal } from '../profile/ProfileModal';
import { useSettings, useActiveTimer, useNow } from '../../hooks/useData';
import { updateSettings } from '../../services/settings';
import { getAuthSession, setAuthSession, subscribeAuth } from '../../services/auth';
import { db } from '../../db/db';
import { todayKey, formatLongDate } from '../../lib/dates';
import { daysUntil } from '../../domain/metrics';
import { elapsedSeconds } from '../../domain/timer';
import { formatClock } from '../../lib/format';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authUser, setAuthUser] = useState(() => getAuthSession()?.user ?? null);
  const settings = useSettings();
  const timer = useActiveTimer();
  const now = useNow(1000, Boolean(timer && timer.status === 'running'));
  const today = todayKey(now);
  const navigate = useNavigate();

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

  // Global keyboard shortcut: Ctrl+K or /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
        (e.key === '/' &&
          (e.target as HTMLElement).tagName !== 'INPUT' &&
          (e.target as HTMLElement).tagName !== 'TEXTAREA')
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <IconButton
            label="Abrir menu de navegação"
            icon={<Menu className="size-5" />}
            onClick={onToggleMobileMenu}
            className="lg:hidden shrink-0"
          />

          <BnbLogo className="size-7 shrink-0 lg:hidden rounded-lg" />

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
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-primary/30 bg-primary-soft px-2.5 sm:px-3 py-1 text-xs font-semibold text-primary transition-colors hover:brightness-95 animate-pulse"
              title="Sessão de estudo em andamento — Clique para abrir o cronômetro"
            >
              <TimerIcon className="size-3.5" />
              <span className="hidden sm:inline">
                {timer.status === 'paused' ? 'Pausado' : 'Estudando'}
              </span>
              <span className="tabular-nums font-mono">{formatClock(timerSeconds)}</span>
            </button>
          )}

          {authUser && (
            <button
              type="button"
              data-testid="header-profile-button"
              onClick={() => setProfileOpen(true)}
              title={`Editar perfil (${authUser.name} · ${authUser.email})`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-muted/70 hover:bg-surface-muted hover:border-primary/40 px-2 sm:px-2.5 text-xs font-medium text-fg transition cursor-pointer"
            >
              <Avatar name={authUser.name || authUser.email} src={authUser.avatarUrl} size="sm" />
              <span className="hidden md:inline-block max-w-32 truncate font-semibold text-fg">
                {authUser.name}
              </span>
              <Pencil className="hidden sm:block size-3 text-fg-subtle shrink-0" />
            </button>
          )}

          <IconButton
            label="Buscar conteúdo (Ctrl+K ou /)"
            icon={<Search className="size-4" />}
            onClick={() => setSearchOpen(true)}
          />

          <IconButton
            label={`Alterar tema (atual: ${settings?.theme ?? 'sistema'})`}
            icon={themeIcon}
            onClick={cycleTheme}
          />

          <Link to="/configuracoes">
            <IconButton label="Configurações" icon={<SettingsIcon className="size-4" />} />
          </Link>

          <IconButton
            label="Sair da conta"
            icon={<LogOut className="size-4" />}
            onClick={handleLogout}
          />
        </div>
      </header>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
