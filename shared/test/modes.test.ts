import { describe, expect, it } from 'vitest';
import { RULES } from '../src/config';
import { getCard } from '../src/data/cards';
import { EconError, freshProfile, startChallenge, recordChallenge, claimTournamentPrize } from '../src/meta/economy';
import {
  CHALLENGE_MAX_LOSSES,
  CHALLENGE_REWARDS,
  challengeOfDay,
  rankStandings,
  rulesOf,
  tournamentHasPrizes,
  type TournamentStanding,
} from '../src/meta/modes';
import { DRAFT_ROUNDS, autoPick, draftDeck, draftDone, draftPick, makeDraft } from '../src/meta/draft';
import { Match } from '../src/sim';
import { Rng } from '../src/sim/rng';
import { matchWith, run, setup } from './helpers';

const NOW = Date.UTC(2026, 9, 21, 12);
const rand = (seed = 3) => {
  const r = new Rng(seed);
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

describe('reglas especiales', () => {
  it('elixir doble y triple: se recarga más rápido desde el principio', () => {
    const elixirAfter = (mult?: number) => {
      const m = new Match(setup({ rules: mult ? { elixir: mult } : undefined }));
      m.elixir.blue = 0;
      run(m, 20 * 3);
      return m.elixir.blue;
    };
    const base = elixirAfter();
    expect(elixirAfter(2)).toBeCloseTo(base * 2, 6);
    expect(elixirAfter(3)).toBeCloseTo(base * 3, 6);
    expect(base).toBeCloseTo(3 / RULES.elixirRegen, 6);
  });

  it('muerte súbita: la primera torre que cae acaba la partida', () => {
    const m = matchWith({ blue: ['rockslide'] }, { rules: { suddenDeath: true } });
    const t = m.towersBy.red.left;
    t.hp = 10;
    const events = [];
    events.push(...m.step([{ t: 'play', team: 'blue', card: 'rockslide', x: t.x, y: t.y }]));
    for (let i = 0; i < 40 && !m.over; i++) events.push(...m.step());
    expect(m.over).toBe(true);
    expect(m.winner).toBe('blue');
    expect(events.some((e) => e.e === 'end' && e.reason === 'sudden')).toBe(true);
  });

  it('cada conjunto de reglas se traduce a reglas de la simulación', () => {
    expect(rulesOf('classic')).toEqual({ rules: {}, draft: false });
    expect(rulesOf('triple').rules.elixir).toBe(3);
    expect(rulesOf('draft').draft).toBe(true);
  });
});

describe('desafío del día', () => {
  it('rota cada día UTC', () => {
    const a = challengeOfDay(NOW),
      b = challengeOfDay(NOW + 86_400_000);
    expect(a.period).toBe('2026-10-21');
    expect(a.rules).not.toBe(b.rules);
  });

  it('premios por victorias, una vez al día aunque repitas, y se acaba con 3 derrotas', () => {
    const s = freshProfile(NOW);
    const { period } = challengeOfDay(NOW);
    expect(recordChallenge(s, period, true)).toBeNull(); // sin empezar no cuenta
    startChallenge(s, NOW);
    const gold = s.gold;
    const first = recordChallenge(s, period, true, rand())!;
    expect(first.rewards).toHaveLength(1);
    expect(s.gold).toBe(gold + (CHALLENGE_REWARDS[0].reward.gold ?? 0));
    recordChallenge(s, period, true, rand());
    const third = recordChallenge(s, period, true, rand())!;
    expect(third.rewards).toHaveLength(1); // premio de 3 victorias
    for (let i = 0; i < CHALLENGE_MAX_LOSSES - 1; i++) expect(recordChallenge(s, period, false)!.ended).toBe(false);
    const last = recordChallenge(s, period, false)!;
    expect(last.ended).toBe(true);
    expect(s.challenge!.active).toBe(false);
    // otro intento el mismo día: lo ya cobrado no se repite
    startChallenge(s, NOW);
    expect(s.challenge).toMatchObject({ wins: 0, losses: 0, paid: 3, active: true });
    for (let i = 0; i < 3; i++) expect(recordChallenge(s, period, true, rand())!.rewards).toHaveLength(0);
    expect(recordChallenge(s, period, true, rand())!.rewards).toHaveLength(0); // 4: sin premio
    expect(recordChallenge(s, period, true, rand())!.rewards).toHaveLength(1); // 5: gemas
    // una partida que empezó con el desafío de ayer no cuenta
    expect(recordChallenge(s, '2026-10-20', true)).toBeNull();
  });
});

describe('draft', () => {
  it('16 cartas distintas, con tropas de sobra, y cada uno acaba con 8 sin repetir', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = makeDraft(rand(seed));
      const all = [...d.pairs.blue.flat(), ...d.pairs.red.flat()];
      expect(new Set(all).size).toBe(16);
      expect(all.filter((k) => getCard(k).type === 'spell').length).toBeLessThanOrEqual(4);
      expect(all.filter((k) => getCard(k).type === 'building').length).toBeLessThanOrEqual(2);
      for (let r = 0; r < DRAFT_ROUNDS; r++) {
        expect(draftPick(d, 'blue', r % 2)).toBe(true);
        expect(draftPick(d, 'blue', 0)).toBe(false); // ya ha elegido esta ronda
        expect(d.round).toBe(r);
        expect(draftPick(d, 'red', 1)).toBe(true);
      }
      expect(draftDone(d)).toBe(true);
      const blue = draftDeck(d, 'blue'),
        red = draftDeck(d, 'red');
      expect(blue).toHaveLength(8);
      expect(new Set([...blue, ...red]).size).toBe(16);
      // lo que no elige uno se lo lleva el otro
      expect(red).toContain(d.pairs.blue[0][1]);
    }
  });

  it('elección automática: mejor rareza y, si empatan, la más cara', () => {
    expect(autoPick(['rattata', 'mewtwo'])).toBe(1);
    expect(autoPick(['machop', 'rattata'])).toBe(0);
  });
});

describe('torneos', () => {
  const p = (
    accountId: string,
    wins: number,
    losses: number,
    crowns = 0,
    joinedAt = '2026-10-21T10:00',
  ): TournamentStanding => ({
    accountId,
    name: accountId,
    wins,
    losses,
    crowns,
    joinedAt,
  });

  it('clasificación: victorias, menos derrotas, coronas y antigüedad', () => {
    const r = rankStandings([
      p('a', 3, 2),
      p('b', 3, 1),
      p('c', 5, 4),
      p('d', 3, 1, 0, '2026-10-21T09:00'),
      p('e', 3, 1, 4),
    ]);
    expect(r.map((x) => x.accountId)).toEqual(['c', 'e', 'd', 'b', 'a']);
  });

  it('solo hay premios con 4 jugadores que hayan jugado de verdad, y uno al día', () => {
    expect(tournamentHasPrizes([p('a', 3, 0), p('b', 2, 1), p('c', 1, 2), p('d', 0, 2)])).toBe(false);
    expect(tournamentHasPrizes([p('a', 3, 0), p('b', 2, 1), p('c', 1, 2), p('d', 0, 3)])).toBe(true);
    const s = freshProfile(NOW);
    const gold = s.gold;
    expect(claimTournamentPrize(s, NOW, 1)).toBe(500);
    expect(s.gold).toBe(gold + 500);
    expect(code(() => claimTournamentPrize(s, NOW + 3600_000, 2))).toBe('econ.prizeToday');
    expect(code(() => claimTournamentPrize(s, NOW + 86_400_000, 4))).toBe('econ.noPrize');
    expect(claimTournamentPrize(s, NOW + 86_400_000, 3)).toBe(150);
  });
});
