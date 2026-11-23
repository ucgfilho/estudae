import { describe, it, expect } from 'vitest';
import { computeRank, missPenalty, rankIndexForXp, RANKS, XP } from '../../domain/rank';
import type { ReviewTask, StudySession } from '../../db/types';
import { addDays } from '../../lib/dates';

const settings = { dailyGoalMinutes: 120 };

function sess(date: string, minutes: number, status: StudySession['status'] = 'concluida', id?: string): StudySession {
  return {
    id: id ?? `${date}-${minutes}-${status}`,
    date,
    disciplineId: 'd',
    topicId: null,
    plannedStart: null,
    plannedMinutes: Math.max(minutes, 30),
    actualSeconds: minutes * 60,
    status,
    objective: '',
    notes: '',
    origin: 'avulsa',
    startedAt: null,
    endedAt: null,
    recoveredFromId: null,
    history: [],
    createdAt: '',
    updatedAt: '',
  };
}

const planned = (date: string, id?: string) => sess(date, 0, 'planejada', id);

function review(id: string, completedAt: string, errorNoteId: string | null = null, intervalDays = 1): ReviewTask {
  return {
    id,
    disciplineId: 'd',
    topicId: null,
    errorNoteId,
    title: 'Revisão',
    dueDate: completedAt.slice(0, 10),
    intervalDays,
    status: 'concluida',
    completedAt,
    createdAt: completedAt,
  };
}

const run = (sessions: StudySession[], today: string, reviews: ReviewTask[] = []) =>
  computeRank({ sessions, reviews, settings, today });

describe('patentes e sistema de gamificação', () => {
  it('mantém os 18 níveis de patentes e limites de XP', () => {
    expect(RANKS).toHaveLength(18);
    expect(RANKS[rankIndexForXp(0)].name).toBe('Recruta');
    expect(RANKS[rankIndexForXp(299)].name).toBe('Recruta');
    expect(RANKS[rankIndexForXp(300)].name).toBe('Aspirante');
    expect(RANKS[rankIndexForXp(500)].name).toBe('Soldado');
    expect(RANKS[rankIndexForXp(700)].name).toBe('Cabo');
    expect(RANKS[rankIndexForXp(1000)].name).toBe('Sargento');
    expect(RANKS[rankIndexForXp(1400)].name).toBe('Oficial');
    expect(RANKS[rankIndexForXp(18000)].name).toBe('Aprovado de Elite');
  });

  it('calcula penalidades progressivas: 1º -250 XP, 2º em diante -400 XP por dia', () => {
    expect(missPenalty(0)).toBe(0);
    expect([1, 2, 3, 4, 5, 6].map(missPenalty)).toEqual([250, 400, 400, 400, 400, 400]);
  });

  it('concede XP por dia estudado (+100), meta diária (+50) e revisões (+30 até o limite de 4/dia)', () => {
    expect(run([sess('2026-10-10', 30)], '2026-10-10').xp).toBe(100);
    expect(run([sess('2026-10-10', 120)], '2026-10-10').xp).toBe(150);

    const revs = Array.from({ length: 6 }, (_, i) => review(`r-${i}`, '2026-10-10T15:00:00Z'));
    // 100 (dia estudado) + 4 * 30 (limite de 4 revisões recompensadas por dia) = 220 XP
    expect(XP.reviewsPerDayCap).toBe(4);
    const state = run([sess('2026-10-10', 30)], '2026-10-10', revs);
    expect(state.xp).toBe(220);
    expect(state.events).toMatchObject([{ label: 'dia estudado + 6 revisões (4 com XP)', delta: 220 }]);
  });

  it('menos de 30 min não é estudo válido', () => {
    expect(run([sess('2026-10-10', 29)], '2026-10-10').xp).toBe(0);
  });

  it('ignora datas futuras e hoje sem estudo não penaliza', () => {
    expect(run([sess('2026-10-12', 60)], '2026-10-10').xp).toBe(0);
    const s = run([sess('2026-10-09', 30)], '2026-10-10');
    expect(s.xp).toBe(100);
    expect(s.atRiskPenalty).toBe(0);
  });

  it('1. primeira ausência não protegida desconta 250 XP e reinicia a sequência', () => {
    // Dia 1: estuda (150 XP); Dia 2: usa Streak Freeze; Dia 3: estuda (300 XP, streak 2); Dia 4: 1ª ausência sem freeze -> -250 XP
    const s = run(
      [
        sess('2026-10-01', 120),
        planned('2026-10-02'),
        sess('2026-10-03', 120),
        planned('2026-10-04'),
      ],
      '2026-10-05',
    );
    expect(s.xp).toBe(50); // 150 + 150 - 250 = 50
    expect(s.missStreak).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.streakHistory).toHaveLength(1);
    expect(s.streakHistory[0].days).toBe(2);
  });

  it('2. ausências consecutivas descontam -250, -400, -400, -400... sem deixar saldo negativo nem acumular dívida', () => {
    // 12 dias de 150 XP => 1800 XP (Tenente) + escudo no 7º dia (segura em 1800 na 1ª falta real)
    // Vamos testar com 6 dias de 150 XP = 900 XP (sem escudo)
    const studyDays = Array.from({ length: 6 }, (_, i) => sess(addDays('2026-09-01', i), 120)); // 900 XP
    const misses = [
      planned('2026-09-07'), // freeze (900 XP)
      planned('2026-09-08'), // 1ª ausência: -250 => 650 XP
      planned('2026-09-09'), // 2ª ausência: -400 => 250 XP
      planned('2026-09-10'), // 3ª ausência: -400 => 0 XP (piso 0)
      planned('2026-09-11'), // 4ª ausência: -400 => 0 XP (sem dívida)
      planned('2026-09-12'), // 5ª ausência: -400 => 0 XP (sem dívida)
    ];
    const afterMisses = run([...studyDays, ...misses], '2026-09-13');
    expect(afterMisses.xp).toBe(0);
    expect(afterMisses.missStreak).toBe(5);

    // Ao voltar a estudar no dia 13 (30 min = +100 XP + 50 XP bônus de retorno), saldo sobe imediatamente para 150 XP (sem dívida acumulada)
    const afterReturn = run([...studyDays, ...misses, sess('2026-09-13', 30)], '2026-09-13');
    expect(afterReturn.xp).toBe(150);
  });

  it('3 e 4. perda de patente por ausência e reconquista de patente ao recuperar XP', () => {
    // 4 dias de 150 XP = 600 XP (Soldado, minXp 500)
    const base = [
      sess('2026-09-01', 120), // 150 (Recruta)
      sess('2026-09-02', 120), // 300 (Aspirante)
      sess('2026-09-03', 120), // 450 (Aspirante)
      sess('2026-09-04', 120), // 600 (Soldado)
      planned('2026-09-05'), // freeze -> mantém 600 XP (Soldado)
      planned('2026-09-06'), // 1ª falta: -250 XP -> 350 XP (cai de Soldado para Aspirante)
    ];
    const demoted = run(base, '2026-09-07');
    expect(demoted.xp).toBe(350);
    expect(demoted.rank.name).toBe('Aspirante');
    expect(demoted.lastChange).toMatchObject({
      direction: 'down',
      from: { name: 'Soldado' },
      to: { name: 'Aspirante' },
    });

    // Reconquista: em 2026-09-07 estuda 120 min (+150 XP) + 50 XP (bônus de retorno após 2 dias ausente) = +200 XP => 550 XP (Soldado!)
    const reconquered = run([...base, sess('2026-09-07', 120)], '2026-09-07');
    expect(reconquered.xp).toBe(550);
    expect(reconquered.rank.name).toBe('Soldado');
    expect(reconquered.lastChange).toMatchObject({
      direction: 'up',
      from: { name: 'Aspirante' },
      to: { name: 'Soldado' },
      reconquered: true,
    });
    expect(reconquered.rankHistory.some((h) => h.direction === 'down' && h.from.name === 'Soldado')).toBe(true);
    expect(reconquered.rankHistory.some((h) => h.direction === 'up' && h.to.name === 'Soldado' && h.reconquered)).toBe(true);
  });

  it('5. utilização do Streak Freeze impede tanto a quebra da sequência quanto a penalidade e respeita cooldown de 30 dias', () => {
    const s = run(
      [
        sess('2026-10-01', 60),
        sess('2026-10-02', 60),
        planned('2026-10-03'), // protegido por Streak Freeze
        sess('2026-10-04', 60),
      ],
      '2026-10-04',
    );
    expect(s.xp).toBe(300); // 3 dias estudados * 100 XP, sem penalidade
    expect(s.streak).toBe(3); // sequência preservada (2 + 1 = 3)
    expect(s.freezeAvailable).toBe(false);
    expect(s.freezeCooldownLeft).toBe(29);
    expect(s.events.some((e) => e.type === 'freeze')).toBe(true);
    expect(s.events.some((e) => e.type === 'penalty')).toBe(false);
  });

  it('não perde XP em dias que não tiverem sessões', () => {
    const s = run([sess('2026-10-01', 30)], '2026-10-10');
    expect(s.xp).toBe(100);
    expect(s.missStreak).toBe(0);
    expect(s.atRiskPenalty).toBe(0);
    expect(s.events.some((e) => e.type === 'penalty')).toBe(false);
  });

  it('6. utilização do escudo de patente: protege contra queda de patente sem ser consumido indevidamente', () => {
    // 7 dias de 120 min (150 XP/dia) = 1050 XP (Sargento, minXp 1000) + escudo conquistado no 7º dia
    const study7 = Array.from({ length: 7 }, (_, i) => sess(addDays('2026-09-01', i), 120));
    const after7 = run(study7, '2026-09-07');
    expect(after7.xp).toBe(1050);
    expect(after7.rank.name).toBe('Sargento');
    expect(after7.shield).toBe(true);

    // Dia 8: falta protegida por Streak Freeze -> escudo NÃO deve ser consumido
    const afterFreeze = run([...study7, planned('2026-09-08')], '2026-09-09');
    expect(afterFreeze.xp).toBe(1050);
    expect(afterFreeze.shield).toBe(true);

    // Dia 9: falta não protegida (-250 XP derrubaria de 1050 para 800, abaixo de Sargento 1000)
    // Escudo é consumido e segura o XP no piso da patente Sargento (1000 XP)!
    const afterShieldUsed = run([...study7, planned('2026-09-08'), planned('2026-09-09')], '2026-09-10');
    expect(afterShieldUsed.xp).toBe(1000);
    expect(afterShieldUsed.rank.name).toBe('Sargento');
    expect(afterShieldUsed.shield).toBe(false);
    expect(afterShieldUsed.events.some((e) => e.type === 'shield-used')).toBe(true);
  });

  it('7. bônus de retorno (+50 XP) após pelo menos 2 dias consecutivos de ausência somente com sessão válida', () => {
    const sessions = [
      sess('2026-09-01', 120), // 150 XP
      sess('2026-09-02', 120), // 300 XP
      planned('2026-09-03'), // 1º dia ausente (freeze) -> 300 XP
      planned('2026-09-04'), // 2º dia ausente (-250 XP) -> 50 XP
    ];

    // Antes de estudar no dia 05, bônus de retorno está pendente (+50 XP em 1 dia válido)
    const beforeReturn = run(sessions, '2026-09-05');
    expect(beforeReturn.xp).toBe(50);
    expect(beforeReturn.recoveryPending).toBe(50);
    expect(beforeReturn.recoveryDaysLeft).toBe(1);

    // Apenas concluir revisão sem sessão válida NÃO concede o bônus de retorno
    const onlyReview = run(sessions, '2026-09-05', [review('rev-1', '2026-09-05T12:00:00Z')]);
    expect(onlyReview.xp).toBe(80); // 50 + 30 da revisão
    expect(onlyReview.events.some((e) => e.type === 'recovery')).toBe(false);

    // Ao concluir sessão válida no dia 05 (30 min = +100 XP), recebe +50 XP do Bônus de Retorno = +150 XP (total 200 XP)
    const afterReturn = run([...sessions, sess('2026-09-05', 30)], '2026-09-05');
    expect(afterReturn.xp).toBe(200);
    expect(afterReturn.events.some((e) => e.type === 'recovery' && e.delta === 50)).toBe(true);
    expect(afterReturn.recoveryDaysLeft).toBeNull();

    // Estudar novamente no mesmo dia ou no dia seguinte NÃO concede segundo bônus para o mesmo período de ausência
    const nextDay = run(
      [...sessions, sess('2026-09-05', 30, 'concluida', 's1'), sess('2026-09-05', 30, 'concluida', 's2'), sess('2026-09-06', 30)],
      '2026-09-06',
    );
    expect(nextDay.events.filter((e) => e.type === 'recovery')).toHaveLength(1);
    expect(nextDay.xp).toBe(300); // 200 + 100 do dia 06
  });

  it('8. impede duplicação de recompensas e penalidades e respeita o fuso America/Bahia', () => {
    const s1 = sess('2026-10-10', 60, 'concluida', 'dup-sess');
    const r1 = review('dup-rev', '2026-10-10T15:00:00Z', 'note-1', 1);
    const r2SameNote = review('dup-rev-2', '2026-10-10T16:00:00Z', 'note-1', 1);

    // Passando a mesma sessão e revisão duplicadas no array
    const state1 = run([s1, s1, { ...s1 }], '2026-10-10', [r1, r1, r2SameNote]);
    expect(state1.xp).toBe(130); // 100 (1 dia estudado, 60 min não bate meta 120) + 30 (1 revisão única)

    // Virada do dia no fuso America/Bahia (UTC-3): 2026-10-11T01:30:00Z ainda é 2026-10-10 às 22:30 na Bahia!
    const lateNightBahia: StudySession = {
      ...sess('2026-10-11', 35, 'concluida', 'late-bahia'),
      startedAt: '2026-10-11T01:30:00.000Z',
    };
    const tzState = run([lateNightBahia], '2026-10-10');
    expect(tzState.xp).toBe(100);
    expect(tzState.todayValid).toBe(true);
  });
});
