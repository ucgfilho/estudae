import { ThemeToggle } from '../ui/ThemeToggle';
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
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
import { useSettings, useActiveTimer, useSessions, useReviews } from '../../hooks/useData';
import { getAuthSession, logoutUser, subscribeAuth } from '../../services/auth';
import { todayKey, formatLongDate } from '../../lib/dates';
import { daysUntil } from '../../domain/metrics';
import { computeRank } from '../../domain/rank';
import { elapsedSeconds } from '../../domain/timer';
import { formatClock } from '../../lib/format';
import { cn } from '../../lib/utils';
import { BnbLogo } from '../ui/BnbLogo';
import { useToast } from '../ui/Toast';
import type { UserContestProfile } from '../../services/contests';

interface HeaderProps {
  activeContest?: UserContestProfile;
  timerNow: number;
}

export function Header({
  activeContest,
  timerNow,
}: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [authUser, setAuthUser] = useState(() => getAuthSession()?.user ?? null);
  const settings = useSettings();
  const sessions = useSessions();
  const reviews = useReviews();
  const timer = useActiveTimer();
  const today = todayKey(timerNow);
  const navigate = useNavigate();
  const toast = useToast();

  const rankState = useMemo(
    () => computeRank({ sessions, reviews, settings, today }),
    [sessions, reviews, settings, today],
  );
  const rankTier = tierOf(rankState.rankIndex);
  const RankIcon = rankTier.icon;
  const rankIconColor = rankState.rankIndex < 4 ? 'text-slate-700'
    : rankState.rankIndex < 8 ? 'text-blue-700'
    : rankState.rankIndex < 12 ? 'text-amber-800'
    : rankState.rankIndex < 15 ? 'text-violet-700'
    : 'text-emerald-800';

  useEffect(() => {
    return subscribeAuth(() => {
      setAuthUser(getAuthSession()?.user ?? null);
    });
  }, []);

  const handleLogout = () => {
    void logoutUser().catch(() => toast.error('Não foi possível encerrar a sessão. Tente novamente.'));
  };

  const examDaysLeft = daysUntil(settings?.examDate ?? null, today);

  const timerSeconds = timer ? elapsedSeconds(timer, timerNow) : 0;

  return (
    <>
      <header className="sticky top-0 z-20 flex min-h-14 py-1 max-lg:min-h-[calc(3.5rem+env(safe-area-inset-top))] max-lg:pt-[calc(0.25rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 navigation-chrome bg-surface px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <BnbLogo className={cn('size-7 shrink-0 lg:hidden rounded-lg', timer && 'max-sm:hidden')} />

          <div className={cn('min-w-0 lg:hidden', timer && 'max-sm:hidden')}>
            <p className="text-sm font-bold leading-tight">estudaê</p>
            <p className="max-w-32 wrap-anywhere text-xs text-fg-muted sm:max-w-48">
              {activeContest?.name ?? 'Seu espaço de estudos'}
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
            <span className="text-xs sm:text-sm font-medium text-fg capitalize">
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
          <ThemeToggle />
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
              <span className="tabular-nums">{formatClock(timerSeconds)}</span>
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
                  'hidden sm:inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-primary/20',
                  rankTier.ring,
                )}
              >
                <RankIcon className={cn('size-3.5', rankIconColor)} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <Avatar name={authUser.name || authUser.email} src={authUser.avatarUrl} size="xs" />
              <span className="hidden md:inline-block max-w-24 wrap-anywhere font-medium text-fg">
                {authUser.name}
              </span>
              <Pencil className="hidden sm:block size-3 text-fg-subtle shrink-0" aria-hidden="true" />
            </button>
          )}

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
