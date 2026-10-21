import { describe, expect, it } from 'vitest';
import {
  EconError,
  freshProfile,
  claimMission,
  claimMissionBonus,
  completeTutorial,
  TUTORIAL_REWARD,
} from '../src/meta/economy';
import {
  MISSION_BONUS,
  MISSIONS_PER_PERIOD,
  battleStats,
  missionPeriodId,
  msToNextMissions,
  rollMissions,
  trackBattle,
  trackMission,
} from '../src/meta/missions';
import { Rng } from '../src/sim/rng';
import type { TimedInput } from '../src/sim/types';

const NOW = Date.UTC(2026, 9, 21, 15, 30); // miércoles 21-10-2026, 15:30 UTC
const rand = () => {
  const r = new Rng(7);
  return () => r.next();
};
const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof EconError ? e.code : 'other';
  }
};

describe('misiones', () => {
  it('periodos: día UTC y semana de lunes a domingo', () => {
    expect(missionPeriodId('daily', NOW)).toBe('2026-10-21');
    const monday = Date.UTC(2026, 9, 19),
      sunday = Date.UTC(2026, 9, 25, 23, 59),
      nextMonday = Date.UTC(2026, 9, 26);
    expect(missionPeriodId('weekly', monday)).toBe(missionPeriodId('weekly', sunday));
    expect(missionPeriodId('weekly', nextMonday)).not.toBe(missionPeriodId('weekly', sunday));
    expect(msToNextMissions('daily', NOW)).toBe(Date.UTC(2026, 9, 22) - NOW);
    expect(msToNextMissions('weekly', NOW)).toBe(nextMonday - NOW);
  });

  it('reparte 3 de cada periodo sin repetir clase, y no las cambia hasta el periodo siguiente', () => {
    const s = freshProfile(NOW);
    expect(rollMissions(s, NOW, rand())).toBe(true);
    for (const p of ['daily', 'weekly'] as const) {
      const kinds = s.missions![p].list.map((m) => m.kind);
      expect(kinds).toHaveLength(MISSIONS_PER_PERIOD);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
    const before = JSON.stringify(s.missions);
    expect(rollMissions(s, NOW + 3600_000, rand())).toBe(false);
    expect(JSON.stringify(s.missions)).toBe(before);
    // día siguiente: diarias nuevas, semanales iguales
    const weekly = JSON.stringify(s.missions!.weekly);
    expect(rollMissions(s, NOW + 86_400_000, rand())).toBe(true);
    expect(s.missions!.daily.period).toBe('2026-10-22');
    expect(JSON.stringify(s.missions!.weekly)).toBe(weekly);
  });

  it('el progreso no pasa del objetivo y lo cobrado ya no suma', () => {
    const s = freshProfile(NOW);
    rollMissions(s, NOW, rand());
    const m = s.missions!.daily.list[0];
    trackMission(s, m.kind, m.target + 50);
    expect(m.progress).toBe(m.target);
    claimMission(s, 'daily', m.id);
    trackMission(s, m.kind, 1);
    expect(m.progress).toBe(m.target);
  });

  it('estadísticas de una partida desde los inputs aceptados', () => {
    const log: TimedInput[] = [
      { tick: 10, input: { t: 'play', team: 'blue', card: 'charmander', x: 100, y: 900 } },
      { tick: 20, input: { t: 'play', team: 'red', card: 'charmander', x: 100, y: 300 } },
      { tick: 30, input: { t: 'play', team: 'blue', card: 'flamespell', x: 100, y: 300 } },
      { tick: 40, input: { t: 'emote', team: 'blue', id: 1 } },
    ];
    const st = battleStats(log, 'blue', 'win', 3);
    expect(st).toMatchObject({ outcome: 'win', crowns: 3, spells: 1, units: 1 });
    expect(st.elixir).toBeGreaterThan(0);
    const s = freshProfile(NOW);
    s.missions = {
      daily: {
        period: missionPeriodId('daily', NOW),
        bonusClaimed: false,
        list: (['wins', 'spells', 'crowns'] as const).map((kind) => ({
          id: kind,
          kind,
          target: 10,
          progress: 0,
          claimed: false,
          reward: { gold: 1 },
        })),
      },
      weekly: { period: missionPeriodId('weekly', NOW), bonusClaimed: false, list: [] },
    };
    trackBattle(s, st);
    expect(s.missions.daily.list.map((m) => m.progress)).toEqual([1, 1, 3]);
  });

  it('cobrar: solo completas, una vez, y el premio extra al cobrar las tres', () => {
    const s = freshProfile(NOW);
    rollMissions(s, NOW, rand());
    const [a, b, c] = s.missions!.daily.list;
    expect(code(() => claimMission(s, 'daily', a.id))).toBe('econ.missionUndone');
    expect(code(() => claimMission(s, 'daily', 'nope'))).toBe('econ.mission');
    expect(code(() => claimMission(s, 'monthly', a.id))).toBe('econ.mission');
    for (const m of [a, b, c]) trackMission(s, m.kind, m.target);
    const gold = s.gold;
    const r = claimMission(s, 'daily', a.id);
    expect(s.gold).toBe(gold + r.gold);
    expect(code(() => claimMission(s, 'daily', a.id))).toBe('econ.claimed');
    expect(code(() => claimMissionBonus(s, 'daily'))).toBe('econ.missionUndone');
    claimMission(s, 'daily', b.id);
    claimMission(s, 'daily', c.id);
    const gems = s.gems;
    const bonus = claimMissionBonus(s, 'daily', rand());
    expect(bonus.ball?.type).toBe(MISSION_BONUS.daily.ball);
    expect(s.gems).toBe(gems + (MISSION_BONUS.daily.gems ?? 0) + (bonus.ball?.gems ?? 0));
    expect(code(() => claimMissionBonus(s, 'daily'))).toBe('econ.claimed');
  });

  it('tutorial: el premio se cobra una sola vez', () => {
    const s = freshProfile(NOW);
    const gold = s.gold;
    expect(completeTutorial(s)).toEqual(TUTORIAL_REWARD);
    expect(s.gold).toBe(gold + TUTORIAL_REWARD.gold);
    expect(s.tutorialDone).toBe(true);
    expect(code(() => completeTutorial(s))).toBe('econ.claimed');
  });
});
