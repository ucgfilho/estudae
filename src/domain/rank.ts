/**
 * Sistema de patentes e progressão gamificada.
 *
 * O XP é DERIVADO do histórico (sessões + revisões) por uma simulação
 * determinística dia a dia no fuso America/Bahia. Não há XP armazenado,
 * portanto não existe valor para adulterar nem estado para sincronizar;
 * o resultado é idempotente e idêntico em qualquer dispositivo.
 *
 * Regras (por dia fechado, simulado em ordem cronológica):
 * - Dia estudado (>= 30 min ou meta diária): +100 XP; meta diária cumprida: +50 XP;
 *   cada revisão concluída: +30 XP (máx. 4 por dia).
 * - Ausências consecutivas (em dias com sessão prevista/registrada):
 *   1º dia -250 XP; 2º dia -400 XP; 3º dia -400 XP; 4º dia em diante -400 XP/dia.
 * - XP nunca fica negativo e não acumula dívidas. Hoje só gera ganhos (o dia ainda não fechou).
 * - Streak Freeze: protege 1 dia de ausência a cada 30 dias (impede quebra da sequência e penalidade).
 * - Escudo de Patente: ganho a cada 7 dias válidos seguidos (máx. 1); impede 1 perda de patente.
 * - Bônus de Retorno: +50 XP ao concluir uma sessão válida após pelo menos 2 dias consecutivos de ausência.
 * - Entradas inválidas ou duplicadas (mesmo ID, datas futuras, duração > 24 h) são ignoradas.
 */
import type { ReviewTask, Settings, StudySession } from '../db/types';
import { addDays, isValidDateKey, toDateKey, type DateKey } from '../lib/dates';
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
  reviewsPerDayCap: 4,
  firstMiss: 250,
  nextMisses: 400,
  returnBonus: 50,
  returnBonusMinMisses: 2,
  validMinutes: 30,
  freezeCooldownDays: 30,
  shieldEveryStudyDays: 7,
} as const;

const MAX_DAY_SECONDS = 24 * 3600;

export function rankIndexForXp(xp: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].minXp) idx = i;
  return idx;
}

/** Penalidade da n-ésima ausência consecutiva não protegida (1-based). */
export function missPenalty(consecutiveMisses: number): number {
  if (!Number.isFinite(consecutiveMisses) || consecutiveMisses < 1) return 0;
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

export interface RankChange {
  date: DateKey;
  direction: 'up' | 'down';
  from: Rank;
  to: Rank;
  /** Indica se a promoção foi uma reconquista de patente já alcançada antes. */
  reconquered?: boolean;
  reason?: string;
}

export interface StreakRecord {
  startDate: DateKey;
  endDate: DateKey;
  days: number;
  active: boolean;
  freezesUsed: DateKey[];
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
  /** Sequência atual de dias válidos de estudo (preservada por Streak Freeze). */
  streak: number;
  /** Maior sequência de dias válidos alcançada. */
  bestStreak: number;
  /** Histórico de sequências de estudo. */
  streakHistory: StreakRecord[];
  /** Ausências consecutivas não protegidas já fechadas (antes de hoje). */
  missStreak: number;
  /** Total de dias consecutivos de ausência (incluindo dia congelado) antes de hoje. */
  absentDays: number;
  /** Penalidade que seria aplicada à meia-noite se hoje não for válido (0 = nenhuma/protegido). */
  atRiskPenalty: number;
  freezeAvailable: boolean;
  /** Dias até o Streak Freeze voltar (0 = disponível). */
  freezeCooldownLeft: number;
  shield: boolean;
  /** Dias válidos consecutivos que faltam para receber o Bônus de Retorno (null = não elegível). */
  recoveryDaysLeft: number | null;
  /** Valor do Bônus de Retorno disponível ao retomar os estudos (+50 XP após >= 2 ausências). */
  recoveryPending: number;
  /** Último movimento de patente por rebaixamento/promoção/reconquista. */
  lastChange: RankChange | null;
  /** Histórico completo de patentes conquistadas, perdidas e reconquistadas. */
  rankHistory: RankChange[];
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

function deduplicateSessions(sessions: readonly StudySession[]): StudySession[] {
  const seen = new Set<string>();
  const result: StudySession[] = [];
  for (const s of sessions) {
    if (!s || typeof s.id !== 'string') continue;
    const key = s.id.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}

function collectActivity(sessions: readonly StudySession[], reviews: readonly ReviewTask[], today: DateKey): Map<DateKey, DayActivity> {
  const map = new Map<DateKey, DayActivity>();
  const get = (k: DateKey) => {
    let a = map.get(k);
    if (!a) map.set(k, (a = { minutes: 0, reviews: 0 }));
    return a;
  };

  for (const s of sessions) {
    if (!(s.actualSeconds > 0) || !Number.isFinite(s.actualSeconds)) continue;
    const k = sessionStudyDate(s);
    if (!isValidDateKey(k) || k > today) continue;
    get(k).minutes += Math.min(s.actualSeconds, MAX_DAY_SECONDS) / 60;
  }

  const seenReviewIds = new Set<string>();
  const seenReviewKeys = new Set<string>();
  for (const r of reviews) {
    if (!r || r.status !== 'concluida' || !r.completedAt) continue;
    if (r.id) {
      if (seenReviewIds.has(r.id)) continue;
      seenReviewIds.add(r.id);
    }
    const t = Date.parse(r.completedAt);
    if (Number.isNaN(t)) continue;
    const k = toDateKey(t);
    if (!isValidDateKey(k) || k > today) continue;
    if (r.errorNoteId) {
      const compositeKey = `${k}:${r.errorNoteId}:${r.intervalDays ?? 0}`;
      if (seenReviewKeys.has(compositeKey)) continue;
      seenReviewKeys.add(compositeKey);
    }
    get(k).reviews += 1;
  }

  for (const a of map.values()) a.minutes = Math.min(a.minutes, MAX_DAY_SECONDS / 60);
  return map;
}

export function computeRank(input: RankInput): RankState {
  const { today } = input;
  const goal = input.settings?.dailyGoalMinutes ?? 120;
  const goalMin = goal > 0 ? goal : Infinity;
  const uniqueSessions = deduplicateSessions(input.sessions);
  const activity = collectActivity(uniqueSessions, input.reviews, today);
  const isValid = (a?: DayActivity) => !!a && (a.minutes >= XP.validMinutes || a.minutes >= goalMin);

  const daysWithSessions = new Set<DateKey>();
  for (const s of uniqueSessions) {
    if (s.date && isValidDateKey(s.date)) daysWithSessions.add(s.date);
    const studyDate = sessionStudyDate(s);
    if (studyDate && isValidDateKey(studyDate)) daysWithSessions.add(studyDate);
  }
  const hasSessionOnDay = (day: DateKey) => daysWithSessions.has(day);

  let xp = 0;
  let missStreak = 0;
  let absentDays = 0;
  let studyRun = 0;
  let bestStreak = 0;
  let streakStart: DateKey | null = null;
  let streakEnd: DateKey | null = null;
  let streakFreezes: DateKey[] = [];
  const streakHistory: StreakRecord[] = [];
  let shield = false;
  let lastFreeze: DateKey | null = null;
  let highestRankIndex = 0;
  let lastChange: RankChange | null = null;
  const rankHistory: RankChange[] = [];
  let todayXp = 0;
  const events: RankEvent[] = [];

  const freezeFree = (day: DateKey) => lastFreeze === null || daysBetween(lastFreeze, day) >= XP.freezeCooldownDays;

  const apply = (date: DateKey, type: RankEventType, delta: number, label: string) => {
    const before = rankIndexForXp(xp);
    const next = Math.max(0, xp + delta);
    const effective = next - xp;
    xp = next;
    const after = rankIndexForXp(xp);
    let finalLabel = label;

    if (after !== before) {
      const direction = after > before ? 'up' : 'down';
      const reconquered = direction === 'up' && after <= highestRankIndex;
      const reason =
        direction === 'down'
          ? `Perda de patente (${RANKS[before].name} → ${RANKS[after].name}) por falta de consistência`
          : reconquered
            ? `Patente ${RANKS[after].name} reconquistada`
            : `Patente ${RANKS[after].name} conquistada`;
      const change: RankChange = {
        date,
        direction,
        from: RANKS[before],
        to: RANKS[after],
        reconquered,
        reason,
      };
      rankHistory.push(change);
      lastChange = change;
      if (after > highestRankIndex) highestRankIndex = after;

      if (direction === 'down') {
        finalLabel = `${label} · caiu para ${RANKS[after].name}`;
      } else if (reconquered) {
        finalLabel = `${label} · reconquistou ${RANKS[after].name}`;
      } else {
        finalLabel = `${label} · subiu para ${RANKS[after].name}`;
      }
    }

    if (effective !== 0 || type !== 'penalty') {
      events.push({ date, type, delta: effective, label: finalLabel });
    }
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
      if (absentDays >= XP.returnBonusMinMisses) {
        const bonusEff = apply(day, 'recovery', XP.returnBonus, `Bônus de retorno após ${absentDays} ausências`);
        if (day === today) todayXp += bonusEff;
      }

      if (studyRun === 0) {
        streakStart = day;
        streakFreezes = [];
      }
      missStreak = 0;
      absentDays = 0;
      studyRun++;
      streakEnd = day;
      if (studyRun > bestStreak) bestStreak = studyRun;

      if (studyRun % XP.shieldEveryStudyDays === 0 && !shield) {
        shield = true;
        apply(day, 'shield-earned', 0, `${XP.shieldEveryStudyDays} dias seguidos: Escudo de Patente conquistado`);
      }
    } else if (closed && hasSessionOnDay(day) && (studyRun > 0 || xp > 0 || absentDays > 0)) {
      absentDays++;
      const n = missStreak + 1;
      if (n === 1 && freezeFree(day)) {
        lastFreeze = day;
        if (studyRun > 0) streakFreezes.push(day);
        apply(day, 'freeze', 0, 'Streak Freeze protegeu esta ausência');
        // Dia protegido: preserva a sequência (studyRun) e impede a penalidade.
        continue;
      }

      if (studyRun > 0 && streakStart && streakEnd) {
        streakHistory.push({
          startDate: streakStart,
          endDate: streakEnd,
          days: studyRun,
          active: false,
          freezesUsed: [...streakFreezes],
        });
      }
      studyRun = 0;
      streakStart = null;
      streakEnd = null;
      streakFreezes = [];
      missStreak = n;

      const penalty = missPenalty(n);
      if (penalty > 0) {
        const before = rankIndexForXp(xp);
        let hit = penalty;
        if (shield && before > 0 && rankIndexForXp(Math.max(0, xp - penalty)) < before) {
          // Escudo: segura a patente (XP cai só até o piso da patente atual).
          hit = Math.max(0, xp - RANKS[before].minXp);
          shield = false;
          apply(day, 'shield-used', 0, `Escudo de Patente impediu perda de ${RANKS[before].name}`);
        }
        apply(day, 'penalty', -hit, `Dia sem estudar (${n}ª ausência seguida)`);
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
    const eligibleForReturnBonus = absentDays >= XP.returnBonusMinMisses && !todayValid;

    const fullStreakHistory: StreakRecord[] =
      studyRun > 0 && streakStart && streakEnd
        ? [
            ...streakHistory,
            {
              startDate: streakStart,
              endDate: streakEnd,
              days: studyRun,
              active: true,
              freezesUsed: [...streakFreezes],
            },
          ]
        : [...streakHistory];

    return {
      xp,
      rankIndex,
      rank,
      nextRank,
      progress: nextRank ? Math.min(1, (xp - rank.minXp) / span) : 1,
      xpToNext: nextRank ? nextRank.minXp - xp : 0,
      todayXp,
      todayValid,
      streak: studyRun,
      bestStreak,
      streakHistory: fullStreakHistory,
      missStreak,
      absentDays,
      atRiskPenalty:
        todayValid || frozen || !hasSessionOnDay(today) || xp === 0 || events.length === 0
          ? 0
          : missPenalty(wouldBeMiss),
      freezeAvailable: freezeFree(today),
      freezeCooldownLeft: lastFreeze === null ? 0 : Math.max(0, XP.freezeCooldownDays - daysBetween(lastFreeze, today)),
      shield,
      recoveryDaysLeft: eligibleForReturnBonus ? 1 : null,
      recoveryPending: eligibleForReturnBonus ? XP.returnBonus : 0,
      lastChange,
      rankHistory,
      events: events.slice(-12).reverse(),
    };
  }
}

function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
