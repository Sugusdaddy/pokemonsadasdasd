import { describe, expect, it } from 'vitest';
import { ARENA, RULES, TICK_RATE } from '../src/config';
import { cardAtLevel, getCard } from '../src/data/cards';
import { typeMultiplier } from '../src/data/typeChart';
import { Bot, Match, Rng, runBotMatch, runReplay, type SimEvent, type SimUnit } from '../src/sim';
import { AI_BY_ARENA, STARTER_DECK } from '../src';
import { matchWith, mirrorY, run, setup } from './helpers';

const RIVER_TOP = ARENA.riverY - ARENA.riverHalf;
const RIVER_BOT = ARENA.riverY + ARENA.riverHalf;

/** Ejecuta hasta que se cumpla la condición (o se acabe el tope) acumulando eventos. */
function until(m: Match, cond: (ev: SimEvent[]) => boolean, max = 2000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && !m.over; i++) {
    const ev = m.step();
    all.push(...ev);
    if (cond(ev)) break;
  }
  return all;
}

describe('daño y niveles', () => {
  it('escala vida y daño un 8 % por nivel desde el nivel inicial de la rareza', () => {
    const base = getCard('bulbasaur');
    expect(cardAtLevel('bulbasaur', 1).hp).toBe(760);
    expect(cardAtLevel('bulbasaur', 3).hp).toBe(Math.round(760 * 1.08 * 1.08));
    expect(cardAtLevel('bulbasaur', 3).dmg).toBe(Math.round(85 * 1.08 * 1.08));
    // por debajo del nivel inicial se queda en el inicial
    expect(cardAtLevel('pikachu', 1).level).toBe(3);
    expect(base.hp).toBe(760);
  });

  it('un golpe resta exactamente el daño de la carta (sin tipo de por medio)', () => {
    const m = matchWith({ blue: ['eevee'], red: ['eevee'] });
    for (const t of m.towers) t.active = false; // que solo peleen las tropas
    m.step([
      { t: 'play', team: 'blue', card: 'eevee', x: 360, y: 640 },
      { t: 'play', team: 'red', card: 'eevee', x: 360, y: 500 },
    ]);
    const ev = until(m, (e) => e.some((x) => x.e === 'damage'));
    const dmg = ev.find((x) => x.e === 'damage') as Extract<SimEvent, { e: 'damage' }>;
    expect(dmg.amount).toBe(getCard('eevee').dmg);
    expect(dmg.mult).toBe(1);
  });
});

describe('tipos', () => {
  it('tabla de efectividad', () => {
    expect(typeMultiplier('electric', ['water'])).toBe(RULES.typeMult.super);
    expect(typeMultiplier('electric', ['grass'])).toBe(RULES.typeMult.weak);
    expect(typeMultiplier('electric', ['ground'])).toBe(RULES.typeMult.immune);
    expect(typeMultiplier('fire', ['grass', 'bug'])).toBe(RULES.typeMult.super * RULES.typeMult.super);
    expect(typeMultiplier('normal', ['normal'])).toBe(1);
    expect(typeMultiplier('', ['water'])).toBe(1);
  });

  it('Pikachu hace ×1,5 a Squirtle y ×0,75 a Bulbasaur en la partida', () => {
    for (const [foe, mult] of [
      ['squirtle', 1.5],
      ['bulbasaur', 0.75],
    ] as const) {
      const m = matchWith({ blue: ['pikachu'], red: [foe] });
      m.step([
        { t: 'play', team: 'blue', card: 'pikachu', x: 360, y: 700 },
        { t: 'play', team: 'red', card: foe, x: 360, y: 440 },
      ]);
      const foeId = m.units.find((u) => u.team === 'red')!.id;
      const ev = until(m, (e) => e.some((x) => x.e === 'damage' && x.id === foeId && x.mult !== 1));
      const hit = ev.find((x) => x.e === 'damage' && x.id === foeId && x.mult !== 1) as Extract<
        SimEvent,
        { e: 'damage' }
      >;
      expect(hit.mult).toBe(mult);
      expect(hit.amount).toBeCloseTo(getCard('pikachu').dmg * mult, 6);
    }
  });

  it('las torres atacan sin tipo, para que los dos lados sean iguales', () => {
    const m = matchWith({ red: ['bulbasaur'] });
    m.step([{ t: 'play', team: 'red', card: 'bulbasaur', x: 140, y: 520 }]);
    const id = m.units[0].id;
    const ev = until(m, (e) => e.some((x) => x.e === 'damage' && x.id === id));
    const hit = ev.find((x) => x.e === 'damage' && x.id === id) as Extract<SimEvent, { e: 'damage' }>;
    expect(hit.mult).toBe(1);
  });

  it('quemadura: Charmander deja daño continuo', () => {
    const m = matchWith({ blue: ['charmander'], red: ['bulbasaur'] });
    m.step([
      { t: 'play', team: 'blue', card: 'charmander', x: 360, y: 700 },
      { t: 'play', team: 'red', card: 'bulbasaur', x: 360, y: 440 },
    ]);
    const red = m.units.find((u) => u.team === 'red')!;
    until(m, () => red.burnT > 0);
    expect(red.burnT).toBeGreaterThan(0);
    expect(red.burnDps).toBeCloseTo(getCard('charmander').dmg * 0.06, 6);
  });
});

describe('puentes y río', () => {
  it('las tropas de tierra solo cruzan el río por los puentes', () => {
    const m = matchWith({ blue: ['bulbasaur'] });
    m.step([{ t: 'play', team: 'blue', card: 'bulbasaur', x: 360, y: 700 }]);
    const u = m.units[0] as SimUnit;
    let crossed = false;
    for (let i = 0; i < 1500 && u.alive; i++) {
      m.step();
      if (u.y > RIVER_TOP && u.y < RIVER_BOT) {
        const nearBridge = ARENA.bridges.some((b) => Math.abs(u.x - b) <= ARENA.bridgeHalf);
        expect(nearBridge).toBe(true);
      }
      if (u.y < RIVER_TOP - 10) crossed = true;
    }
    expect(crossed).toBe(true);
  });

  it('las tropas voladoras cruzan por cualquier sitio', () => {
    const m = matchWith({ blue: ['pidgey'] });
    m.step([{ t: 'play', team: 'blue', card: 'pidgey', x: 360, y: 700 }]);
    const u = m.units[0];
    let overWater = false;
    for (let i = 0; i < 600; i++) {
      m.step();
      if (u.y > RIVER_TOP && u.y < RIVER_BOT && ARENA.bridges.every((b) => Math.abs(u.x - b) > ARENA.bridgeHalf))
        overWater = true;
    }
    expect(overWater).toBe(true);
  });

  it('una tropa desplegada en el agua aparece en la orilla', () => {
    const m = matchWith({ blue: ['bulbasaur'] });
    // se despliega justo en el borde de su zona; la formación no la mete en el río
    m.step([{ t: 'play', team: 'blue', card: 'bulbasaur', x: 360, y: RIVER_BOT + 8 }]);
    expect(m.units[0].y).toBeGreaterThanOrEqual(RIVER_BOT);
  });
});

describe('despliegue y elixir', () => {
  it('valida mano, elixir y zona', () => {
    const m = matchWith({ blue: ['pikachu', 'rockslide'] });
    expect(m.canPlay('blue', 'pikachu', 360, 800)).toBe('ok');
    expect(m.canPlay('blue', 'pikachu', 360, 300)).toBe('zone'); // campo rival
    expect(m.canPlay('blue', 'pikachu', 360, ARENA.riverY)).toBe('zone'); // río
    expect(m.canPlay('blue', 'rockslide', 360, 300)).toBe('ok'); // los hechizos van a cualquier sitio
    expect(m.canPlay('blue', 'mewtwo', 360, 800)).toBe('hand');
    expect(m.canPlay('blue', 'pikachu', NaN, 800)).toBe('zone');
    m.elixir.blue = 2;
    expect(m.canPlay('blue', 'pikachu', 360, 800)).toBe('elixir');
    // el input inválido se ignora
    m.step([{ t: 'play', team: 'blue', card: 'pikachu', x: 360, y: 800 }]);
    expect(m.units.length).toBe(0);
    expect(m.log.length).toBe(0);
  });

  it('cobra el elixir y rota la carta al final de la cola', () => {
    const m = matchWith({ blue: ['pikachu'] });
    const next = m.cycles.blue.next;
    m.step([{ t: 'play', team: 'blue', card: 'pikachu', x: 360, y: 800 }]);
    expect(m.elixir.blue).toBeCloseTo(10 - 3 + 1 / TICK_RATE / RULES.elixirRegen, 6);
    expect(m.cycles.blue.hand).not.toContain('pikachu');
    expect(m.cycles.blue.hand).toContain(next);
    expect(m.cycles.blue.queue.at(-1)).toBe('pikachu');
  });

  it('regenera 1 de elixir cada 2,8 s y el doble en el último minuto', () => {
    const m = new Match(setup());
    run(m, 56);
    expect(m.elixir.blue).toBeCloseTo(RULES.elixirStart + 1, 6);
    const m2 = new Match(setup());
    const ev = until(m2, (e) => e.some((x) => x.e === 'doubleElixir'), 5000);
    expect(ev.some((x) => x.e === 'doubleElixir')).toBe(true);
    expect(m2.timeLeft).toBeCloseTo(RULES.doubleElixirAt, 6);
    m2.elixir.blue = 0;
    run(m2, 28);
    expect(m2.elixir.blue).toBeCloseTo(1, 6);
  });

  it('se puede desplegar en el "bolsillo" cuando cae la torre de esa línea', () => {
    const m = matchWith({ blue: ['bulbasaur'] });
    expect(m.canPlay('blue', 'bulbasaur', 140, 450)).toBe('zone');
    m.towersBy.red.left.alive = false;
    expect(m.canPlay('blue', 'bulbasaur', 140, 450)).toBe('ok');
    expect(m.canPlay('blue', 'bulbasaur', 580, 450)).toBe('zone');
  });
});

describe('coronas y torre del rey', () => {
  it('golpear al rey lo despierta', () => {
    const m = matchWith({ blue: ['rockslide'] });
    const king = m.towersBy.red.king;
    expect(king.active).toBe(false);
    m.step([{ t: 'play', team: 'blue', card: 'rockslide', x: king.x, y: king.y }]);
    const ev = until(m, (e) => e.some((x) => x.e === 'kingAwake'));
    expect(ev.some((x) => x.e === 'kingAwake' && x.team === 'red')).toBe(true);
    expect(king.active).toBe(true);
  });

  it('tirar una princesa da 1 corona y despierta al rey', () => {
    const m = matchWith({ blue: ['rockslide'] });
    const left = m.towersBy.red.left;
    left.hp = 50;
    m.step([{ t: 'play', team: 'blue', card: 'rockslide', x: left.x, y: left.y }]);
    const ev = until(m, (e) => e.some((x) => x.e === 'towerDestroyed'));
    expect(left.alive).toBe(false);
    expect(m.crowns).toEqual({ blue: 1, red: 0 });
    expect(m.towersBy.red.king.active).toBe(true);
    expect(ev.some((x) => x.e === 'crown' && x.team === 'blue' && x.crowns === 1)).toBe(true);
    expect(m.over).toBe(false);
  });

  it('tirar al rey son 3 coronas y fin de la partida', () => {
    const m = matchWith({ blue: ['rockslide'] });
    const king = m.towersBy.red.king;
    king.hp = 50;
    m.step([{ t: 'play', team: 'blue', card: 'rockslide', x: king.x, y: king.y }]);
    const ev = until(m, () => m.over);
    expect(m.over).toBe(true);
    expect(m.winner).toBe('blue');
    expect(m.crowns.blue).toBe(3);
    expect(ev.find((x) => x.e === 'end')).toEqual({ e: 'end', winner: 'blue', reason: 'king' });
    // ya no avanza
    const t = m.tick;
    m.step();
    expect(m.tick).toBe(t);
  });

  it('rendirse da la victoria al rival', () => {
    const m = new Match(setup());
    m.step([{ t: 'surrender', team: 'blue' }]);
    expect(m.winner).toBe('red');
    expect(m.crowns.red).toBe(3);
  });
});

describe('tiempo extra', () => {
  it('con empate de coronas hay tiempo extra y luego desempate por vida', () => {
    const m = new Match(setup());
    const ev = until(m, (e) => e.some((x) => x.e === 'overtime'), 5000);
    expect(ev.some((x) => x.e === 'overtime')).toBe(true);
    expect(m.tick).toBe(RULES.matchTime * TICK_RATE);
    expect(m.overtime).toBe(true);
    expect(m.over).toBe(false);
    expect(m.timeLeft).toBeCloseTo(RULES.overtime, 6);
    // la torre roja con menos vida decide el desempate
    m.towersBy.red.right.hp -= 100;
    const end = until(m, () => m.over, 5000);
    expect(end.find((x) => x.e === 'end')).toEqual({ e: 'end', winner: 'blue', reason: 'tiebreak' });
  });

  it('sin daño a nadie es empate', () => {
    const m = new Match(setup());
    run(m, (RULES.matchTime + RULES.overtime) * TICK_RATE + 5);
    expect(m.winner).toBe('draw');
  });

  it('con más coronas al final del tiempo normal gana sin tiempo extra', () => {
    const m = new Match(setup());
    run(m, 10);
    m.crowns.red = 1;
    const ev = until(m, () => m.over, 5000);
    expect(ev.find((x) => x.e === 'end')).toEqual({ e: 'end', winner: 'red', reason: 'time' });
  });

  it('en tiempo extra (muerte súbita) la primera torre que cae decide', () => {
    const m = matchWith({ blue: ['rockslide'] });
    m.overtime = true;
    m.ticksLeft = RULES.overtime * TICK_RATE;
    const t = m.towersBy.red.right;
    t.hp = 10;
    m.step([{ t: 'play', team: 'blue', card: 'rockslide', x: t.x, y: t.y }]);
    const ev = until(m, () => m.over);
    expect(ev.find((x) => x.e === 'end')).toEqual({ e: 'end', winner: 'blue', reason: 'overtime' });
  });
});

describe('determinismo', () => {
  const s = setup({ seed: 12345 });

  it('misma semilla y mismos inputs → misma partida', () => {
    const a = runBotMatch(s);
    const b = runBotMatch(s);
    expect(a.match.hash()).toBe(b.match.hash());
    expect(a.replay.inputs).toEqual(b.replay.inputs);
    expect(a.match.winner).toBe(b.match.winner);
  });

  it('la repetición (semilla + inputs) reproduce la partida exacta', () => {
    const { match, replay } = runBotMatch(s);
    const r = runReplay(JSON.parse(JSON.stringify(replay)));
    expect(r.match.tick).toBe(match.tick);
    expect(r.match.hash()).toBe(match.hash());
    expect(r.winner).toBe(match.winner);
  });

  it('otra semilla → otra partida', () => {
    const a = runBotMatch(s);
    const b = runBotMatch({ ...s, seed: 54321 });
    expect(a.match.hash()).not.toBe(b.match.hash());
  });

  it('el RNG es reproducible', () => {
    const a = new Rng(7),
      b = new Rng(7);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('es simétrica: el mismo bot jugando arriba o abajo hace la partida reflejada', () => {
    const mk = () => {
      const m = new Match(setup({ seed: 3 }));
      m.cycles.red.hand = [...m.cycles.blue.hand];
      m.cycles.red.queue = [...m.cycles.blue.queue];
      return m;
    };
    const A = mk(),
      B = mk();
    const botA = new Bot('blue', AI_BY_ARENA(0), new Rng(9));
    const botB = new Bot('red', AI_BY_ARENA(0), new Rng(9));
    for (let i = 0; i < 1500 && !A.over; i++) {
      A.step(botA.update(A));
      B.step(botB.update(B));
      expect(B.units.length).toBe(A.units.length);
      A.units.forEach((u, k) => {
        expect(B.units[k].x).toBeCloseTo(u.x, 6);
        expect(mirrorY(B.units[k].y)).toBeCloseTo(u.y, 6);
        expect(B.units[k].hp).toBeCloseTo(u.hp, 6);
      });
    }
    expect(A.towers.map((t) => t.hp)).toEqual([...B.towers.slice(3), ...B.towers.slice(0, 3)].map((t) => t.hp));
  });

  it('una partida bot contra bot termina en un tiempo razonable', () => {
    const { match } = runBotMatch(
      setup({
        seed: 77,
        players: {
          blue: { deck: STARTER_DECK, levels: {}, kingLevel: 3 },
          red: { deck: STARTER_DECK, levels: {}, kingLevel: 3 },
        },
      }),
    );
    expect(match.over).toBe(true);
    expect(match.tick).toBeLessThanOrEqual((RULES.matchTime + RULES.overtime) * TICK_RATE + 1);
  });
});
