import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../src/data/cards';
import { Lockstep } from '../src/net/lockstep';
import {
  isFriendlyCode,
  parsePlay,
  trophyWindow,
  validateJoin,
  type JoinOptions,
  type StartMsg,
} from '../src/net/protocol';
import { mirrorPoint, mirrorY } from '../src/net/view';
import { runBotMatch } from '../src/sim';
import { setup } from './helpers';

const join = (o: Partial<JoinOptions> = {}): JoinOptions => ({
  name: 'Ana',
  trophies: 100,
  kingLevel: 1,
  deck: [...STARTER_DECK],
  levels: {},
  ...o,
});

describe('protocolo', () => {
  it('valida lo que manda el cliente al unirse', () => {
    expect(validateJoin(join())).toBeNull();
    expect(validateJoin(join({ name: '' }))).toMatch(/err.join.name/);
    expect(validateJoin(join({ deck: STARTER_DECK.slice(0, 7) }))).toMatch(/deckSize/);
    expect(validateJoin(join({ deck: [...STARTER_DECK.slice(0, 7), STARTER_DECK[0]] }))).toMatch(/deckDup/);
    expect(validateJoin(join({ deck: [...STARTER_DECK.slice(0, 7), 'charizardx'] }))).toMatch(/err.join.card/);
    expect(validateJoin(join({ levels: { pikachu: 1 } }))).toMatch(/levels/); // rara: empieza en 3
    expect(validateJoin(join({ levels: { pikachu: 14 } }))).toMatch(/levels/);
    expect(validateJoin(join({ kingLevel: 0 }))).toMatch(/kingLevel/);
    expect(validateJoin(join({ trophies: -5 }))).toMatch(/trophies/);
  });

  it('valida la forma de una carta jugada', () => {
    expect(parsePlay({ card: 'pikachu', x: 100.4, y: 800.6 })).toEqual({ card: 'pikachu', x: 100, y: 801 });
    expect(parsePlay({ card: 'pikachu', x: 'a', y: 1 })).toBeNull();
    expect(parsePlay({ card: 'pikachu', x: Infinity, y: 1 })).toBeNull();
    expect(parsePlay(null)).toBeNull();
  });

  it('la ventana de trofeos crece con la espera hasta un máximo', () => {
    expect(trophyWindow(0)).toBe(100);
    expect(trophyWindow(10_000)).toBe(600);
    expect(trophyWindow(10 * 60_000)).toBe(2000);
  });

  it('códigos amistosos y reflejo del tablero', () => {
    expect(isFriendlyCode('AB2CD')).toBe(true);
    expect(isFriendlyCode('AB0CD')).toBe(false); // sin 0/O ni 1/I
    expect(isFriendlyCode('abcde')).toBe(false);
    expect(mirrorY(mirrorY(123))).toBe(123);
    expect(mirrorPoint(140, 840)).toEqual([140, 300]); // torre azul ↔ torre roja
  });
});

describe('lockstep', () => {
  const s = setup({ seed: 2024 });
  const { match: ref, replay } = runBotMatch(s);
  const start: StartMsg = {
    setup: s,
    you: 'blue',
    mode: 'bot',
    inputDelay: 2,
    startsIn: 0,
    players: {
      blue: { name: 'A', trophies: 0, kingLevel: 1, bot: true },
      red: { name: 'B', trophies: 0, kingLevel: 1, bot: true },
    },
  };
  /** Mensajes de tick como los mandaría el servidor. */
  const ticks = Array.from({ length: ref.tick }, (_, t) => ({
    t,
    i: replay.inputs.filter((x) => x.tick === t).map((x) => x.input),
  }));

  it('reproduce la partida del servidor a partir de los ticks', () => {
    const ls = new Lockstep(start);
    for (const m of ticks) ls.onTick(m);
    ls.drain();
    expect(ls.match.hash()).toBe(ref.hash());
    expect(ls.desyncs).toBe(0);
  });

  it('espera si falta un tick y no simula por delante del servidor', () => {
    const ls = new Lockstep(start);
    ls.onTick(ticks[0]);
    ls.onTick(ticks[2]); // el 1 aún no ha llegado
    ls.drain();
    expect(ls.match.tick).toBe(1);
    ls.onTick(ticks[1]);
    ls.drain();
    expect(ls.match.tick).toBe(3);
  });

  it('tras una reconexión (catchup) se pone al día y sigue', () => {
    const ls = new Lockstep(start);
    for (const m of ticks.slice(0, 50)) ls.onTick(m);
    ls.drain();
    // se corta: se pierden 300 ticks y llega el catchup con todo lo aplicado
    const at = 400;
    ls.catchup({ tick: at, inputs: replay.inputs.filter((x) => x.tick < at) });
    expect(ls.match.tick).toBe(at);
    for (const m of ticks.slice(at)) ls.onTick(m);
    ls.drain();
    expect(ls.match.hash()).toBe(ref.hash());
  });

  it('detecta una desincronización por la huella', () => {
    let called = 0;
    const ls = new Lockstep(start, () => called++);
    ls.onTick({ ...ticks[0], h: 12345 }); // huella falsa
    ls.drain();
    expect(called).toBe(1);
    expect(ls.desyncs).toBe(1);
  });
});
