import { describe, expect, it } from 'vitest';
import { ARENA, RULES, T, TICK_RATE } from '../src/config';
import { getCard } from '../src/data/cards';
import { Match, runBotMatch, runReplay, type SimEvent, type SimUnit, type Team } from '../src/sim';
import { matchWith, run, setup } from './helpers';

const sec = (s: number) => Math.round(s * TICK_RATE);

/** Juega una carta (input normal, como un jugador) y avanza un tick. */
function play(m: Match, team: Team, card: string, x: number, y: number): SimEvent[] {
  if (!m.cycles[team].hand.includes(card)) m.cycles[team].hand[0] = card;
  m.elixir[team] = 10;
  return m.step([{ t: 'play', team, card, x, y }]);
}

/** Avanza recogiendo los eventos. */
function collect(m: Match, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n && !m.over; i++) out.push(...m.step());
  return out;
}

const unitsOf = (m: Match, team: Team, key: string): SimUnit[] =>
  m.units.filter((u) => u.alive && u.team === team && u.card.key === key);

describe('edificios', () => {
  it('no se mueve y se gasta solo en su tiempo de vida', () => {
    const m = matchWith();
    play(m, 'blue', 'forretress', 360, 820);
    const [b] = unitsOf(m, 'blue', 'forretress');
    expect(b.building).toBe(true);
    run(m, sec(RULES.deployTime + 15));
    expect(b.alive).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp * 0.55);
    expect([b.x, b.y]).toEqual([360, 820]);
    run(m, sec(16));
    expect(b.alive).toBe(false);
  });

  it('el defensivo dispara a las tropas de tierra a tiro y no a las voladoras', () => {
    const m = matchWith();
    play(m, 'blue', 'forretress', 140, 700);
    run(m, sec(1.2));
    play(m, 'red', 'pidgey', 140, 640);
    run(m, sec(1.5));
    const [f] = unitsOf(m, 'blue', 'forretress');
    expect(f.target).toBeNull();
    play(m, 'red', 'bulbasaur', 140, 520);
    const ev = collect(m, sec(4));
    expect(ev.some((e) => e.e === 'attack' && e.id === f.id)).toBe(true);
    expect(f.target && (f.target as SimUnit).card.key).toBe('bulbasaur');
  });

  it('las tropas que van a por torres se desvían a por un edificio cercano, que no se deja empujar', () => {
    const m = matchWith();
    play(m, 'blue', 'forretress', 300, 760);
    run(m, sec(1.2));
    play(m, 'red', 'golem', 260, 300);
    const [b] = unitsOf(m, 'blue', 'forretress');
    let hit = false;
    for (let i = 0; i < sec(25) && !hit; i++) {
      m.step();
      const [g] = unitsOf(m, 'red', 'golem');
      if (g?.target === b) hit = true;
    }
    expect(hit).toBe(true);
    expect([b.x, b.y]).toEqual([300, 760]);
  });

  it('no se puede poner un edificio encima de otro', () => {
    const m = matchWith();
    play(m, 'blue', 'forretress', 360, 820);
    expect(m.canDeploy('blue', getCard('magneton'), 365, 822)).toBe(false);
    expect(m.canDeploy('blue', getCard('magneton'), 200, 700)).toBe(true);
    expect(m.canDeploy('blue', getCard('pikachu'), 365, 822)).toBe(true);
  });

  it('el generador saca tropas delante, con el nivel equivalente al suyo', () => {
    const m = new Match(setup({}));
    m.setup.players.blue.levels.vespiquen = getCard('vespiquen').level + 2;
    play(m, 'blue', 'vespiquen', 360, 860);
    run(m, sec(RULES.deployTime + 12));
    const bees = unitsOf(m, 'blue', 'combee');
    expect(bees.length).toBeGreaterThanOrEqual(2);
    expect(bees[0].card.level).toBe(getCard('combee').level + 2);
    expect(bees.every((b) => b.y < 860)).toBe(true);
  });

  it('el de elixir da +1 cada elixirEvery mientras dura', () => {
    const m = matchWith();
    play(m, 'blue', 'chansey', 360, 900);
    const gains = collect(m, sec(RULES.deployTime + 20)).filter((e) => e.e === 'elixirGain' && e.team === 'blue');
    expect(gains).toHaveLength(Math.floor(20 / getCard('chansey').elixirEvery));
  });
});

describe('hechizos nuevos', () => {
  it('congelación: las tropas y torres de dentro se quedan quietas y sin atacar', () => {
    const m = matchWith();
    play(m, 'red', 'bulbasaur', 140, 480);
    run(m, sec(1.5));
    const [u] = unitsOf(m, 'red', 'bulbasaur');
    play(m, 'blue', 'freeze', u.x, u.y);
    run(m, sec(RULES.spellDelay + 0.1));
    expect(u.frozenT).toBeGreaterThan(3);
    const [x, y] = [u.x, u.y];
    run(m, sec(3));
    expect([u.x, u.y]).toEqual([x, y]);
    run(m, sec(1.5));
    expect(u.y).not.toBe(y);
    // torre congelada: no dispara aunque tenga a tiro
    const tower = m.towersBy.red.left;
    play(m, 'blue', 'freeze', tower.x, tower.y);
    run(m, sec(RULES.spellDelay + 0.1));
    play(m, 'blue', 'bulbasaur', tower.x, ARENA.riverY + 40);
    const ev = collect(m, sec(3));
    expect(tower.frozenT).toBeGreaterThan(0);
    expect(ev.some((e) => e.e === 'attack' && e.id === tower.id)).toBe(false);
  });

  it('veneno: reparte su daño en toda la duración (menos a las torres)', () => {
    const m = matchWith();
    const t = m.towersBy.red.left;
    const hp0 = t.hp;
    play(m, 'blue', 'poison', t.x, t.y);
    const c = m.cardFor('blue', 'poison');
    run(m, sec(RULES.spellDelay + 1));
    expect(m.areas).toHaveLength(1);
    expect(hp0 - t.hp).toBeLessThan(c.dmg * c.towerDmg * 0.5);
    run(m, sec(c.duration + 1));
    expect(m.areas).toHaveLength(0);
    expect(hp0 - t.hp).toBeCloseTo(c.dmg * c.towerDmg, 3);
  });

  it('curación: cura a las tropas propias hasta su vida máxima', () => {
    const m = matchWith();
    play(m, 'blue', 'snorlax', 360, 900);
    const [u] = unitsOf(m, 'blue', 'snorlax');
    u.hp = u.maxHp - 300;
    play(m, 'blue', 'heal', u.x, u.y);
    const ev = collect(m, sec(RULES.spellDelay + 3.2));
    expect(ev.some((e) => e.e === 'heal' && e.id === u.id)).toBe(true);
    expect(u.hp).toBe(u.maxHp);
  });

  it('furia: dentro del área las tropas propias van más rápido', () => {
    const distIn = (rage: boolean) => {
      const m = matchWith();
      play(m, 'blue', 'bulbasaur', 140, 1000);
      run(m, sec(RULES.deployTime + 0.2));
      const [u] = unitsOf(m, 'blue', 'bulbasaur');
      if (rage) play(m, 'blue', 'rage', u.x, u.y - 40);
      else m.step();
      run(m, sec(RULES.spellDelay + 0.1));
      const y0 = u.y;
      run(m, sec(1));
      return y0 - u.y;
    };
    expect(distIn(true)).toBeGreaterThan(distIn(false) * (1 + RULES.rageBoost) * 0.95);
  });
});

describe('determinismo con las cartas nuevas', () => {
  it('partida bot contra bot con edificios y hechizos nuevos: la repetición da el mismo resultado', () => {
    const deck = ['forretress', 'vespiquen', 'magneton', 'chansey', 'freeze', 'poison', 'heal', 'rage'];
    const units = ['golem', 'pikachu', 'combee', 'machop'];
    const s = setup({
      seed: 42,
      arena: 4,
      players: {
        blue: { deck: [...deck.slice(0, 4), ...units], levels: {}, kingLevel: 3 },
        red: { deck: [...deck.slice(4), ...units], levels: {}, kingLevel: 3 },
      },
    });
    const a = runBotMatch(s);
    const b = runBotMatch(s);
    expect(a.match.hash()).toBe(b.match.hash());
    const r = runReplay(JSON.parse(JSON.stringify(a.replay)));
    expect(r.match.hash()).toBe(a.match.hash());
    const played = new Set(a.replay.inputs.flatMap((i) => (i.input.t === 'play' ? [i.input.card] : [])));
    // el bot usa las cartas nuevas
    expect(['forretress', 'vespiquen', 'magneton', 'chansey'].some((k) => played.has(k))).toBe(true);
    expect(T).toBe(40);
  });
});
