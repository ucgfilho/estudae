/**
 * Sistema de patentes (XP competitivo, estilo CS2).
 *
 * O XP é DERIVADO do histórico (sessões + revisões) por uma simulação
 * determinística dia a dia. Não há XP armazenado, portanto não existe valor
 * para adulterar nem estado para sincronizar; o resultado é idêntico em
 * qualquer dispositivo.
 *
 * Regras (por dia fechado, simulado em ordem cronológica):
 * - Dia estudado (>= 30 min ou meta diária): +100 XP; meta diária cumprida: +50 XP;
 *   cada revisão concluída: +30 XP (máx. 10 por dia).
 * - Dia sem estudar: 1º -250 XP; 2º, 3º e 4º consecutivos -400 XP; depois, sem penalidade.
 * - XP nunca fica negativo. Hoje só gera ganhos (o dia ainda não terminou).
 * - Streak Freeze: perdoa 1 ausência a cada 30 dias (automático).
 * - Modo Recuperação: após 3 dias seguidos de estudo, devolve 50% do XP perdido no último ciclo.
 * - Escudo de Patente: ganho a cada 7 dias seguidos (máx. 1); absorve 1 rebaixamento.
 * - Entradas inválidas (datas futuras, duração > 24 h) são ignoradas.
 */
import type { ReviewTask, Settings, StudySession } from '../db/types';
import { addDays, toDateKey, type DateKey } from '../lib/dates';
import { sessionStudyDate } from './metrics';

export interface Rank {
  id: string;
  name: string;
  minXp: number;
}

export const RANKS: readonly Rank[] = [
  { id: 'recruta', name: 'Recruta', minXp: 0 },
  { id: 'aspirante', name: 'Aspirante', minXp: 300 },
  { id: 'soldado', name: 'Soldado', minXp: 500 },
  { id: 'cabo', name: 'Cabo', minXp: 700 },
  { id: 'sargento', name: 'Sargento', minXp: 1000 },
  { id: 'oficial', name: 'Oficial', minXp: 1400 },
  { id: 'tenente', name: 'Tenente', minXp: 1800 },
  { id: 'capitao', name: 'Capitão', minXp: 2300 },
  { id: 'major', name: 'Major', minXp: 2800 },
  { id: 'coronel', name: 'Coronel', minXp: 3500 },
  { id: 'estudioso', name: 'Estudioso', minXp: 4200 },
  { id: 'erudito', name: 'Erudito', minXp: 5000 },
  { id: 'especialista', name: 'Especialista', minXp: 6000 },
  { id: 'mestre-editais', name: 'Mestre dos Editais', minXp: 7500 },
  { id: 'aguia-concursos', name: 'Águia dos Concursos', minXp: 9000 },
  { id: 'aguia-suprema', name: 'Águia Suprema', minXp: 11000 },
  { id: 'lenda', name: 'Lenda dos Concursos', minXp: 14000 },
  { id: 'aprovado-elite', name: 'Aprovado de Elite', minXp: 18000 },
];

export const XP = {
  studyDay: 100,
  dailyGoal: 50,
  review: 30,
  reviewsPerDayCap: 10,
  firstMiss: 250,
  nextMisses: 400,
  /** Penalidade só vale até a 4ª ausência consecutiva. */
  maxPenalizedMisses: 4,
  validMinutes: 30,
  freezeCooldownDays: 30,
  recoveryStudyDays: 3,
  recoveryRatio: 0.5,
  shieldEveryStudyDays: 7,
} as const;

const MAX_DAY_SECONDS = 24 * 3600;

export function rankIndexForXp(xp: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].minXp) idx = i;
  return idx;
}

/** Penalidade da n-ésima ausência consecutiva (1-based). */
export function missPenalty(consecutiveMisses: number): number {
  if (consecutiveMisses < 1 || consecutiveMisses > XP.maxPenalizedMisses) return 0;
  return consecutiveMisses === 1 ? XP.firstMiss : XP.nextMisses;
}

export type RankEventType = 'study' | 'penalty' | 'freeze' | 'recovery' | 'shield-used' | 'shield-earned';

export interface RankEvent {
  date: DateKey;
  type: RankEventType;
  /** Variação efetiva de XP (já considerando o piso em 0). */
  delta: number;
  label: string;
}

export interface RankState {
  xp: number;
  rankIndex: number;
  rank: Rank;
  nextRank: Rank | null;
  /** 0..1 de progresso até a próxima patente. */
  progress: number;
  xpToNext: number;
  /** XP ganho hoje. */
  todayXp: number;
  todayValid: boolean;
  /** Ausências consecutivas já fechadas (antes de hoje). */
  missStreak: number;
  /** Penalidade que seria aplicada à meia-noite se hoje não for válido (0 = nenhuma/protegido). */
  atRiskPenalty: number;
  freezeAvailable: boolean;
  /** Dias até o Streak Freeze voltar (0 = disponível). */
  freezeCooldownLeft: number;
  shield: boolean;
  /** Dias válidos consecutivos que faltam para ativar o Modo Recuperação (null = sem XP a recuperar). */
  recoveryDaysLeft: number | null;
  recoveryPending: number;
  /** Último movimento de patente por rebaixamento/promoção (para animação). */
  lastChange: { date: DateKey; direction: 'up' | 'down'; from: Rank; to: Rank } | null;
  events: RankEvent[];
}

export interface RankInput {
  sessions: readonly StudySession[];
  reviews: readonly ReviewTask[];
  settings: Pick<Settings, 'dailyGoalMinutes'> | undefined;
  today: DateKey;
}

interface DayActivity {
  minutes: number;
  reviews: number;
}

function collectActivity(input: RankInput): Map<DateKey, DayActivity> {
  const map = new Map<DateKey, DayActivity>();
  const get = (k: DateKey) => {
    let a = map.get(k);
    if (!a) map.set(k, (a = { minutes: 0, reviews: 0 }));
    return a;
  };
  for (const s of input.sessions) {
    if (!(s.actualSeconds > 0) || !Number.isFinite(s.actualSeconds)) continue;
    const k = sessionStudyDate(s);
    if (k > input.today) continue;
    get(k).minutes += Math.min(s.actualSeconds, MAX_DAY_SECONDS) / 60;
  }
  for (const r of input.reviews) {
    if (r.status !== 'concluida' || !r.completedAt) continue;
    const t = Date.parse(r.completedAt);
    if (Number.isNaN(t)) continue;
    const k = toDateKey(t);
    if (k > input.today) continue;
    get(k).reviews += 1;
  }
  for (const a of map.values()) a.minutes = Math.min(a.minutes, MAX_DAY_SECONDS / 60);
  return map;
}

export function computeRank(input: RankInput): RankState {
  const { today } = input;
  const goal = input.settings?.dailyGoalMinutes ?? 120;
  const goalMin = goal > 0 ? goal : Infinity;
  const activity = collectActivity(input);
  const isValid = (a?: DayActivity) => !!a && (a.minutes >= XP.validMinutes || a.minutes >= goalMin);

  let xp = 0;
  let missStreak = 0;
  let studyRun = 0; // dias válidos consecutivos
  let shield = false;
  let lastFreeze: DateKey | null = null;
  let lostPending = 0; // XP perdido no ciclo atual, ainda não recuperado
  let recoveredCycle = false;
  let lastChange: RankState['lastChange'] = null;
  let todayXp = 0;
  const events: RankEvent[] = [];

  const freezeFree = (day: DateKey) => lastFreeze === null || daysBetween(lastFreeze, day) >= XP.freezeCooldownDays;

  const apply = (date: DateKey, type: RankEventType, delta: number, label: string) => {
    const before = rankIndexForXp(xp);
    const next = Math.max(0, xp + delta);
    const effective = next - xp;
    xp = next;
    const after = rankIndexForXp(xp);
    if (after !== before) {
      lastChange = { date, direction: after > before ? 'up' : 'down', from: RANKS[before], to: RANKS[after] };
    }
    if (effective !== 0 || type !== 'penalty') events.push({ date, type, delta: effective, label });
    return effective;
  };

  const days = [...activity.keys()].sort();
  if (days.length === 0) return buildState();
  const first = days[0];

  for (let day = first; day <= today; day = addDays(day, 1)) {
    const a = activity.get(day);
    const valid = isValid(a);
    const closed = day < today;

    if (valid || (a && a.reviews > 0)) {
      let gain = 0;
      const parts: string[] = [];
      if (valid) {
        gain += XP.studyDay;
        parts.push('dia estudado');
        if (a!.minutes >= goalMin) {
          gain += XP.dailyGoal;
          parts.push('meta diária');
        }
      }
      const rv = Math.min(a!.reviews, XP.reviewsPerDayCap);
      if (rv > 0) {
        gain += rv * XP.review;
        parts.push(rv === 1 ? '1 revisão' : `${rv} revisões`);
      }
      const eff = apply(day, 'study', gain, parts.join(' + '));
      if (day === today) todayXp += eff;
    }

    if (valid) {
      missStreak = 0;
      studyRun++;
      if (studyRun % XP.shieldEveryStudyDays === 0 && !shield) {
        shield = true;
        apply(day, 'shield-earned', 0, `${XP.shieldEveryStudyDays} dias seguidos: Escudo de Patente conquistado`);
      }
      if (lostPending > 0 && !recoveredCycle && studyRun >= XP.recoveryStudyDays) {
        const back = Math.floor(lostPending * XP.recoveryRatio);
        apply(day, 'recovery', back, 'Modo Recuperação: 50% do XP perdido devolvido');
        recoveredCycle = true;
        lostPending = 0;
      }
    } else if (closed) {
      studyRun = 0;
      const n = missStreak + 1;
      if (n === 1 && freezeFree(day)) {
        lastFreeze = day;
        apply(day, 'freeze', 0, 'Streak Freeze protegeu esta ausência');
        // Congelado: não conta como falta nem como estudo.
        continue;
      }
      missStreak = n;
      const penalty = missPenalty(n);
      if (penalty > 0) {
        recoveredCycle = false;
        const before = rankIndexForXp(xp);
        let hit = penalty;
        if (shield && rankIndexForXp(Math.max(0, xp - penalty)) < before) {
          // Escudo: segura a patente (XP cai só até o piso da patente atual).
          hit = Math.max(0, xp - RANKS[before].minXp);
          shield = false;
          apply(day, 'shield-used', 0, `Escudo de Patente impediu rebaixamento de ${RANKS[before].name}`);
        }
        const lost = -apply(day, 'penalty', -hit, `Dia sem estudar (${n}ª ausência seguida)`);
        lostPending += lost;
      }
    }
  }

  return buildState();

  function buildState(): RankState {
    const rankIndex = rankIndexForXp(xp);
    const rank = RANKS[rankIndex];
    const nextRank = RANKS[rankIndex + 1] ?? null;
    const span = nextRank ? nextRank.minXp - rank.minXp : 1;
    const todayValid = isValid(activity.get(today));
    const wouldBeMiss = missStreak + 1;
    const frozen = wouldBeMiss === 1 && freezeFree(today);
    const studyRunNow = todayValid ? studyRun : 0;
    return {
      xp,
      rankIndex,
      rank,
      nextRank,
      progress: nextRank ? Math.min(1, (xp - rank.minXp) / span) : 1,
      xpToNext: nextRank ? nextRank.minXp - xp : 0,
      todayXp,
      todayValid,
      missStreak,
      atRiskPenalty: todayValid || frozen || events.length === 0 ? 0 : missPenalty(wouldBeMiss),
      freezeAvailable: freezeFree(today),
      freezeCooldownLeft: lastFreeze === null ? 0 : Math.max(0, XP.freezeCooldownDays - daysBetween(lastFreeze, today)),
      shield,
      recoveryDaysLeft: lostPending > 0 && !recoveredCycle ? Math.max(0, XP.recoveryStudyDays - studyRunNow) : null,
      recoveryPending: Math.floor(lostPending * XP.recoveryRatio),
      lastChange,
      events: events.slice(-12).reverse(),
    };
  }
}

function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
