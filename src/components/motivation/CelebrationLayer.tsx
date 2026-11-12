import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Flame, NotebookPen, Play, Sparkles, Target, Trophy, X, type LucideIcon } from 'lucide-react';
import { useActiveTimer, useDisciplines, useQuestionLogs, useSessions, useSettings, useToday } from '../../hooks/useData';
import { useCelebrationsEnabled } from '../../hooks/useCelebrationPrefs';
import {
  comparedToYesterday,
  detectAchievements,
  formatAchievementMessage,
  nextPendingToday,
  primaryAchievement,
  snapshot,
  type Achievement,
  type AchievementKind,
  type MotivationSnapshot,
} from '../../domain/motivation';
import { startPlannedTimer } from '../../services/timer';
import { Button, IconButton } from '../ui/Button';
import { Confetti } from './Confetti';
import { cn } from '../../lib/utils';

const ICONS: Record<AchievementKind, LucideIcon> = {
  'session-complete': CheckCircle2,
  'daily-goal': Target,
  'schedule-complete': Trophy,
  'question-goal': Target,
  'questions-great': Sparkles,
  'questions-perfect': Trophy,
  'personal-best': Trophy,
  'streak-milestone': Flame,
  'questions-logged': NotebookPen,
};

const SHORT_LABEL: Partial<Record<AchievementKind, string>> = {
  'daily-goal': 'Meta diária batida',
  'schedule-complete': 'Cronograma do dia completo',
  'question-goal': 'Meta de questões batida',
  'personal-best': 'Recorde pessoal',
  'questions-perfect': '100% de acerto',
};

/** Conquistas de nível "dia" só são celebradas uma vez por data (mesmo após recarregar). */
const ONCE_PER_DAY: AchievementKind[] = ['daily-goal', 'schedule-complete', 'question-goal'];

function alreadyCelebrated(kind: AchievementKind, today: string): boolean {
  try {
    const key = `motivation:celebrated:${kind}:${today}`;
    if (localStorage.getItem(key)) return true;
    localStorage.setItem(key, '1');
  } catch {
    // sem armazenamento: celebra normalmente
  }
  return false;
}

interface Celebration {
  id: number;
  list: Achievement[];
  primary: Achievement;
  title: string;
  body: string;
  extra: string | null;
}

/**
 * Camada global de reforço positivo. Observa os dados (Dexie) e detecta
 * transições — sessão concluída, meta diária, cronograma do dia completo,
 * bom desempenho/recorde em questões, marcos de sequência — exibindo um
 * aviso breve com recompensa visual proporcional à raridade do evento.
 */
export function CelebrationLayer() {
  const navigate = useNavigate();
  const today = useToday();
  const disciplines = useDisciplines();
  const activeTimer = useActiveTimer();
  const [enabled] = useCelebrationsEnabled();

  const sessions = useSessions();
  const logs = useQuestionLogs();
  const settings = useSettings();

  const prevRef = useRef<MotivationSnapshot | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [burst, setBurst] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const next = snapshot(sessions, logs, settings, today);
    const prev = prevRef.current;
    prevRef.current = next;
    if (!prev) return;

    const list = detectAchievements(prev, next, sessions, logs, settings?.accuracyGoal ?? 80).filter(
      (a) => !ONCE_PER_DAY.includes(a.kind) || !alreadyCelebrated(a.kind, today),
    );
    const primary = primaryAchievement(list);
    if (!primary) return;

    const discName = primary.disciplineId ? disciplines.find((d) => d.id === primary.disciplineId)?.name : undefined;
    const studiedMinutes = primary.kind === 'session-complete' || primary.kind === 'daily-goal'
      ? sessions.find((s) => s.id === primary.detail?.replace('+', '').replace(' min', ''))?.actualSeconds
      : undefined;
    const streakDays = primary.kind === 'streak-milestone' ? parseInt(primary.detail?.replace(' dias seguidos', '') ?? '', 10) : undefined;

    const { title, body } = formatAchievementMessage(primary.kind, primary.detail, discName, studiedMinutes, streakDays);
    const showsTime = list.some((a) => a.kind === 'session-complete' || a.kind === 'daily-goal');
    setCelebration({ id: Date.now(), list, primary, title, body, extra: showsTime ? comparedToYesterday(sessions, today) : null });
    if (primary.tier !== 'info') setBurst((b) => b + 1);
  }, [sessions, logs, settings, today, disciplines]);

  // Fecha sozinho (mais tempo para marcos), pausando enquanto o aluno interage.
  useEffect(() => {
    if (!celebration || hovered) return;
    const ms = celebration.primary.tier === 'big' ? 9000 : 6000;
    const t = window.setTimeout(() => setCelebration(null), ms);
    return () => window.clearTimeout(t);
  }, [celebration, hovered]);

  const discName = useMemo(() => new Map(disciplines.map((d) => [d.id, d.name])), [disciplines]);
  const nextBlock = sessions ? nextPendingToday(sessions, today) : null;

  if (!celebration) return <Confetti burst={0} />;

  const { primary, list } = celebration;
  const Icon = ICONS[primary.kind];
  const isBig = primary.tier === 'big';
  const isInfo = primary.tier === 'info';

  const chips = [
    ...list.filter((a) => a !== primary && SHORT_LABEL[a.kind]).map((a) => SHORT_LABEL[a.kind]!),
    ...list
      .filter((a) => a.detail)
      .map((a) => (a.disciplineId && discName.get(a.disciplineId) ? `${discName.get(a.disciplineId)} · ${a.detail}` : a.detail!)),
    ...(celebration.extra ? [celebration.extra] : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const isQuestion = primary.kind.startsWith('questions') || primary.kind === 'personal-best';
  const cta =
    isInfo
      ? { label: 'Abrir Caderno de Erros', icon: <NotebookPen className="size-4" aria-hidden />, run: () => navigate('/erros') }
      : !isQuestion && nextBlock && !activeTimer
        ? {
            label: 'Iniciar próximo bloco',
            icon: <Play className="size-4" aria-hidden />,
            run: async () => {
              try {
                await startPlannedTimer(nextBlock.id);
              } finally {
                navigate('/estudar-agora');
              }
            },
          }
        : null;

  return (
    <>
      {enabled && <Confetti burst={burst} intensity={isBig ? 'big' : 'small'} />}
      <div
        key={celebration.id}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={cn(
          'fixed inset-x-4 bottom-4 z-50 rounded-xl border bg-surface p-4 shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96',
          enabled && 'animate-celebrate-in',
          isBig ? 'border-success/50' : isInfo ? 'border-border' : 'border-primary/30',
        )}
      >
        <div className="flex items-start gap-3 pr-6">
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full',
              isBig ? 'bg-success-soft text-success' : isInfo ? 'bg-info-soft text-info' : 'bg-primary-soft text-primary',
              enabled && !isInfo && 'animate-pop',
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{celebration.title}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{celebration.body}</p>
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Detalhes da conquista">
            {chips.map((c) => (
              <li key={c} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted tabular-nums">
                {c}
              </li>
            ))}
          </ul>
        )}

        {cta && (
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant={isInfo ? 'secondary' : 'primary'}
              icon={cta.icon}
              onClick={() => {
                setCelebration(null);
                void cta.run();
              }}
            >
              {cta.label}
            </Button>
          </div>
        )}

        <IconButton
          label="Fechar aviso de conquista"
          icon={<X className="size-4" />}
          onClick={() => setCelebration(null)}
          className="absolute top-1.5 right-1.5"
        />
      </div>
    </>
  );
}
