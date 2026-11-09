import { useEffect, useMemo, useState } from 'react';
import { Award, BadgeCheck, BookOpen, Compass, ChevronsUp, Flag, Flame, Footprints, GraduationCap, Medal, ScrollText, Shield, ShieldCheck, Snowflake, Star, Swords, Target, TrendingDown, TrendingUp, Trophy, HeartPulse, Bird, Gem, type LucideIcon } from 'lucide-react';
import { Card } from '../ui/Display';
import { computeRank, RANKS, XP, type RankEventType, type RankInput } from '../../domain/rank';
import { formatInteger } from '../../lib/format';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/utils';

const STORAGE_KEY = 'bnb:rank:last-seen';

/** Ícone por patente (índice em RANKS), na mesma ordem. */
const RANK_ICONS: LucideIcon[] = [
  Footprints, ChevronsUp, Shield, Swords, ShieldCheck, BadgeCheck,
  Medal, Star, Flag, Compass, BookOpen, GraduationCap,
  Target, ScrollText, Bird, Gem, Flame, Trophy,
];

/** Emblema e cor por faixa de patente (índice em RANKS). */
function tierOf(index: number): { icon: LucideIcon; color: string; ring: string } {
  const icon = RANK_ICONS[index] ?? Trophy;
  if (index < 4) return { icon, color: 'text-fg-muted', ring: 'ring-border-strong' };
  if (index < 8) return { icon, color: 'text-info', ring: 'ring-info' };
  if (index < 12) return { icon, color: 'text-warning', ring: 'ring-warning' };
  if (index < 15) return { icon, color: 'text-accent', ring: 'ring-accent' };
  if (index < 17) return { icon, color: 'text-primary', ring: 'ring-primary' };
  return { icon, color: 'text-primary', ring: 'ring-primary' };
}

const EVENT_STYLE: Record<RankEventType, { icon: LucideIcon; tone: string }> = {
  study: { icon: TrendingUp, tone: 'text-success' },
  penalty: { icon: TrendingDown, tone: 'text-danger' },
  freeze: { icon: Snowflake, tone: 'text-info' },
  recovery: { icon: HeartPulse, tone: 'text-success' },
  'shield-used': { icon: ShieldCheck, tone: 'text-info' },
  'shield-earned': { icon: ShieldCheck, tone: 'text-info' },
};

export function RankCard(input: RankInput) {
  const { sessions, reviews, settings, today } = input;
  const state = useMemo(() => computeRank({ sessions, reviews, settings, today }), [sessions, reviews, settings, today]);
  const [anim, setAnim] = useState<'up' | 'down' | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Anima promoção/rebaixamento comparando com a última patente vista neste dispositivo.
  useEffect(() => {
    let prev: number | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      prev = raw === null ? null : Number.parseInt(raw, 10);
      localStorage.setItem(STORAGE_KEY, String(state.rankIndex));
    } catch {
      /* armazenamento indisponível: sem animação */
    }
    if (prev !== null && Number.isInteger(prev) && prev !== state.rankIndex) setAnim(state.rankIndex > prev ? 'up' : 'down');
  }, [state.rankIndex]);

  const { rank, nextRank } = state;
  const tier = tierOf(state.rankIndex);
  const Icon = tier.icon;
  const pct = Math.round(state.progress * 100);
  const events = showAll ? state.events : state.events.slice(0, 4);

  return (
    <Card
      title="Patente"
      description="Estudar gera XP; faltar gera penalidade; consistência protege sua patente."
      actions={
        anim && (
          <span
            role="status"
            className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', anim === 'up' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}
          >
            {anim === 'up' ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
            {anim === 'up' ? 'Promovido!' : 'Rebaixado'}
          </span>
        )
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="flex items-center gap-4">
          <div
            key={rank.id}
            className={cn(
              'grid size-20 shrink-0 place-items-center rounded-2xl bg-surface-muted ring-2',
              tier.ring,
              anim === 'up' && 'animate-pop',
              anim === 'down' && 'animate-rank-drop',
            )}
          >
            <Icon className={cn('size-10', tier.color)} aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium text-fg-muted">Patente atual</p>
            <p className="text-xl font-bold text-fg">{rank.name}</p>
            <p className="text-sm tabular-nums text-fg-muted">{formatInteger(state.xp)} XP</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div
              role="progressbar"
              aria-label={nextRank ? `Progresso para ${nextRank.name}` : 'Patente máxima'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-3 w-full overflow-hidden rounded-full bg-surface-muted"
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-fg-muted">
              <span>{rank.name} · {formatInteger(rank.minXp)}</span>
              <span>{nextRank ? `${nextRank.name} · ${formatInteger(nextRank.minXp)} (faltam ${formatInteger(state.xpToNext)} XP)` : 'Patente máxima alcançada'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 font-medium text-success">
              <TrendingUp className="size-3" aria-hidden /> Hoje: {state.todayXp >= 0 ? '+' : ''}{state.todayXp} XP
            </span>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium', state.freezeAvailable ? 'bg-info-soft text-info' : 'bg-surface-muted text-fg-muted')}>
              <Snowflake className="size-3" aria-hidden />
              {state.freezeAvailable ? 'Streak Freeze disponível' : `Streak Freeze volta em ${state.freezeCooldownLeft} d`}
            </span>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium', state.shield ? 'bg-info-soft text-info' : 'bg-surface-muted text-fg-muted')}>
              <ShieldCheck className="size-3" aria-hidden />
              {state.shield ? 'Escudo de Patente ativo' : `Escudo: a cada ${XP.shieldEveryStudyDays} dias seguidos`}
            </span>
            {state.recoveryDaysLeft !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 font-medium text-warning">
                <HeartPulse className="size-3" aria-hidden /> Recuperação: +{formatInteger(state.recoveryPending)} XP em {state.recoveryDaysLeft} {state.recoveryDaysLeft === 1 ? 'dia' : 'dias'}
              </span>
            )}
          </div>

          {state.atRiskPenalty > 0 && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <Flame className="size-4 shrink-0" aria-hidden />
              Estude {XP.validMinutes} min hoje para evitar −{state.atRiskPenalty} XP à meia-noite.
            </p>
          )}
          {state.todayValid && <p className="text-xs text-success">Dia válido: patente protegida hoje.</p>}
        </div>
      </div>

      <details className="mt-4 group">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-fg-muted hover:text-fg">
          <Swords className="size-3.5" aria-hidden /> Escada de patentes e histórico
        </summary>
        <ol className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6" aria-label="Patentes">
          {RANKS.map((r, i) => {
            const t = tierOf(i);
            const TIcon = t.icon;
            const reached = i <= state.rankIndex;
            return (
              <li
                key={r.id}
                aria-current={i === state.rankIndex ? 'step' : undefined}
                className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs', i === state.rankIndex ? 'border-primary bg-primary-soft font-semibold text-fg' : reached ? 'border-border text-fg' : 'border-border text-fg-subtle opacity-70')}
              >
                <TIcon className={cn('size-3.5 shrink-0', reached ? t.color : 'text-fg-subtle')} aria-hidden />
                <span className="truncate">{r.name}</span>
                <span className="ml-auto tabular-nums text-[10px] text-fg-subtle">{formatInteger(r.minXp)}</span>
              </li>
            );
          })}
        </ol>
        {state.events.length > 0 && (
          <>
            <ul className="mt-3 space-y-1 text-xs">
              {events.map((e, i) => {
                const st = EVENT_STYLE[e.type];
                const EIcon = st.icon;
                return (
                  <li key={`${e.date}-${e.type}-${i}`} className="flex items-center gap-2 text-fg-muted">
                    <EIcon className={cn('size-3.5 shrink-0', st.tone)} aria-hidden />
                    <span className="tabular-nums">{formatDate(e.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    {e.delta !== 0 && <span className={cn('font-semibold tabular-nums', e.delta > 0 ? 'text-success' : 'text-danger')}>{e.delta > 0 ? '+' : '−'}{Math.abs(e.delta)}</span>}
                  </li>
                );
              })}
            </ul>
            {state.events.length > 4 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs font-medium text-primary hover:underline">
                {showAll ? 'Ver menos' : 'Ver mais'}
              </button>
            )}
          </>
        )}
        <div className="mt-3 space-y-1 text-[11px] text-fg-subtle">
          <p className="flex items-center gap-1 font-medium text-fg-muted">
            <Award className="size-3" aria-hidden /> Como funciona o XP
          </p>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            <li><span className="font-semibold text-success">+{XP.studyDay} XP</span> por dia estudado (≥{XP.validMinutes} min ou meta batida)</li>
            <li><span className="font-semibold text-success">+{XP.dailyGoal} XP</span> bônus por bater a meta do dia</li>
            <li><span className="font-semibold text-success">+{XP.review} XP</span> por cada revisão feita</li>
            <li><span className="font-semibold text-danger">−{XP.firstMiss} XP</span> na 1ª falta seguida</li>
            <li><span className="font-semibold text-danger">−{XP.nextMisses} XP</span> em cada falta seguinte (até a 4ª)</li>
          </ul>
        </div>
      </details>
    </Card>
  );
}
