import { describe, expect, it } from 'vitest';
import { freshProfile, applyBattle, rollSeason, claimSeasonReward, EconError } from '../src/meta/economy';
import { seasonAt, previousSeasonId, softReset, tierFor, SEASON, SEASON_TIERS } from '../src/meta/season';
import { Rng } from '../src/sim/rng';

const OCT = Date.UTC(2026, 9, 21, 12);
const NOV = Date.UTC(2026, 10, 1, 0, 0, 1);
const rnd = () => {
  const r = new Rng(9);
  return () => r.next();
};

describe('temporadas', () => {
  it('una temporada por mes natural (UTC)', () => {
    const s = seasonAt(OCT);
    expect(s.id).toBe('2026-10');
    expect(s.startsAt).toBe(Date.UTC(2026, 9, 1));
    expect(s.endsAt).toBe(Date.UTC(2026, 10, 1));
    expect(seasonAt(Date.UTC(2026, 11, 31, 23, 59)).id).toBe('2026-12');
    expect(seasonAt(Date.UTC(2027, 0, 1)).id).toBe('2027-01');
    expect(previousSeasonId('2027-01')).toBe('2026-12');
  });

  it('reinicio suave: se pierde la mitad de lo que pasa del umbral', () => {
    expect(softReset(1000)).toBe(1000);
    expect(softReset(SEASON.resetAbove)).toBe(SEASON.resetAbove);
    expect(softReset(SEASON.resetAbove + 400)).toBe(SEASON.resetAbove + 200);
    expect(tierFor(0)).toBe(SEASON_TIERS[0]);
    expect(tierFor(1150).trophies).toBe(1100);
    expect(tierFor(99999)).toBe(SEASON_TIERS.at(-1));
  });

  it('al cambiar de mes: reinicio de trofeos y recompensa por el máximo, una sola vez', () => {
    const s = freshProfile(OCT);
    s.trophies = 1980;
    applyBattle(s, 'win', 3, rnd()); // juega y sube el máximo
    const best = s.trophies;
    s.trophies -= 50; // luego baja un poco
    expect(rollSeason(s, OCT)).toBe(false); // misma temporada: nada
    expect(rollSeason(s, NOV, 7)).toBe(true);
    expect(s.pendingSeason).toMatchObject({ seasonId: '2026-10', best, rank: 7, trophiesBefore: best - 50 });
    expect(s.pendingSeason!.tier.trophies).toBe(1600);
    expect(s.trophies).toBe(softReset(best - 50));
    expect(s.season).toEqual({ id: '2026-11', best: s.trophies, battles: 0 });
    expect(rollSeason(s, NOV)).toBe(false);

    const gold = s.gold, gems = s.gems;
    const r = claimSeasonReward(s, rnd());
    expect(s.gold).toBeGreaterThanOrEqual(gold + 2000);
    expect(s.gems).toBeGreaterThanOrEqual(gems + 80);
    expect(r.ball?.type).toBe('ultra');
    expect(() => claimSeasonReward(s, rnd())).toThrow(EconError);
  });

  it('sin partidas en la temporada no hay recompensa (pero sí reinicio)', () => {
    const s = freshProfile(OCT);
    s.trophies = 2400;
    rollSeason(s, NOV);
    expect(s.pendingSeason ?? null).toBeNull();
    expect(s.trophies).toBe(softReset(2400));
  });

  it('las cuentas anteriores a las temporadas empiezan la suya sin recompensa', () => {
    const s = freshProfile(OCT);
    delete s.season;
    expect(rollSeason(s, OCT)).toBe(true);
    expect(s.season?.id).toBe('2026-10');
    expect(s.pendingSeason ?? null).toBeNull();
  });
});
