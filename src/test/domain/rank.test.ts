import { describe, it, expect } from 'vitest';
import { computeRank, missPenalty, rankIndexForXp, RANKS } from '../../domain/rank';
import type { ReviewTask, StudySession } from '../../db/types';
import { addDays } from '../../lib/dates';

const settings = { dailyGoalMinutes: 120 };

function sess(date: string, minutes: number, status: StudySession['status'] = 'concluida'): StudySession {
  return {
    id: `${date}-${minutes}-${status}`, date, disciplineId: 'd', topicId: null, plannedStart: null, plannedMinutes: Math.max(minutes, 30),
    actualSeconds: minutes * 60, status, objective: '', notes: '', origin: 'avulsa', startedAt: null,
    endedAt: null, recoveredFromId: null, history: [], createdAt: '', updatedAt: '',
  };
}
const planned = (date: string) => sess(date, 0, 'planejada');
const run = (sessions: StudySession[], today: string, reviews: ReviewTask[] = []) =>
  computeRank({ sessions, reviews, settings, today });

describe('patentes', () => {
  it('limites de XP', () => {
    expect(RANKS).toHaveLength(18);
    expect(RANKS[rankIndexForXp(0)].name).toBe('Recruta');
    expect(RANKS[rankIndexForXp(299)].name).toBe('Recruta');
    expect(RANKS[rankIndexForXp(300)].name).toBe('Aspirante');
    expect(RANKS[rankIndexForXp(18000)].name).toBe('Aprovado de Elite');
  });

  it('penalidades', () => {
    expect([1, 2, 3, 4, 5].map(missPenalty)).toEqual([250, 400, 400, 400, 0]);
  });

  it('dia estudado +100, meta +50, revisão +30', () => {
    expect(run([sess('2026-10-10', 30)], '2026-10-10').xp).toBe(100);
    expect(run([sess('2026-10-10', 120)], '2026-10-10').xp).toBe(150);
    const rev = { id: 'r', status: 'concluida', completedAt: '2026-10-10T15:00:00Z' } as ReviewTask;
    expect(run([sess('2026-10-10', 30)], '2026-10-10', [rev]).xp).toBe(130);
  });

  it('menos de 30 min não é estudo válido', () => {
    expect(run([sess('2026-10-10', 29)], '2026-10-10').xp).toBe(0);
  });

  it('ignora datas futuras e hoje sem estudo não penaliza', () => {
    expect(run([sess('2026-10-12', 60)], '2026-10-10').xp).toBe(0);
    const s = run([sess('2026-10-09', 30)], '2026-10-10');
    expect(s.xp).toBe(100);
    expect(s.atRiskPenalty).toBe(0); // freeze disponível protege a 1ª ausência
  });

  it('XP nunca negativo e freeze só 1x/30 dias', () => {
    // estuda dia 1, falta nos dias com sessão planejada: dia 2 congelado, 3 -250 (piso 0)
    const s = run([sess('2026-10-01', 30), planned('2026-10-02'), planned('2026-10-03')], '2026-10-10');
    expect(s.xp).toBeGreaterThanOrEqual(0);
    expect(s.events.some((e) => e.type === 'freeze')).toBe(true);
  });

  it('não perde XP em dias que não tiverem sessões', () => {
    // estuda dia 1, dias 2..9 sem nenhuma sessão -> mantém 100 XP sem penalidade nem consumo de freeze
    const s = run([sess('2026-10-01', 30)], '2026-10-10');
    expect(s.xp).toBe(100);
    expect(s.missStreak).toBe(0);
    expect(s.atRiskPenalty).toBe(0);
    expect(s.events.some((e) => e.type === 'penalty')).toBe(false);
  });

  it('rebaixamento e escudo', () => {
    // 10 dias de 150 XP => 1500 (+ escudo conquistado no 7º dia), depois ausência de 4 dias com sessões planejadas
    const days = Array.from({ length: 10 }, (_, i) => addDays('2026-09-01', i));
    const missDays = Array.from({ length: 5 }, (_, i) => addDays('2026-09-11', i));
    const base = [...days.map((d) => sess(d, 120)), ...missDays.map((d) => planned(d))];
    const afterStudy = run(days.map((d) => sess(d, 120)), '2026-09-10');
    expect(afterStudy.xp).toBe(1500);
    expect(afterStudy.shield).toBe(true);
    // 11º dia: freeze; 12º: -250 (escudo não precisa); ...
    const later = run(base, '2026-09-15');
    expect(later.xp).toBeLessThan(1500);
    expect(later.missStreak).toBeGreaterThan(0);
  });

  it('modo recuperação devolve 50% após 3 dias', () => {
    const study = (d: string) => sess(d, 120);
    const sessions = [
      ...[0, 1, 2].map((i) => study(addDays('2026-09-01', i))), // 450
      // 09-04 freeze, 09-05 -250, 09-06 -400 (dias com sessão planejada não cumprida)
      planned('2026-09-04'),
      planned('2026-09-05'),
      planned('2026-09-06'),
      ...[0, 1, 2].map((i) => study(addDays('2026-09-08', i))), // +450, recupera
    ];
    const s = run(sessions, '2026-09-10');
    expect(s.events.some((e) => e.type === 'recovery')).toBe(true);
  });
});
