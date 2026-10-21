import { describe, expect, it } from 'vitest';
import { Match, STARTER_DECK, getCard, type Input, type SimEvent } from '@arena/shared';
import { FOE_ATTACK, TutorialScript, type TutTip, type TutView } from '../src/battle/tutorialScript';

const units = STARTER_DECK.filter((k) => getCard(k).type !== 'spell');
const view = (over: Partial<TutView> = {}): TutView => ({
  myElixir: 5,
  myHand: units.slice(0, 4),
  foeElixir: 10,
  foeHand: units.slice(0, 4),
  ...over,
});
const deploy = (team: 'blue' | 'red'): SimEvent => ({ e: 'deploy', team, card: units[0], x: 100, y: 800 });

/** Avanza `seconds` en pasos de 0.1 s y devuelve lo que haya jugado el Guía. */
function run(s: TutorialScript, seconds: number, v = view()): Input[] {
  const out: Input[] = [];
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    const p = s.update(0.1, v);
    if (p) out.push(p);
  }
  return out;
}

describe('guion del tutorial', () => {
  it('explica parado, espera a que juegues y el Guía ataca por la izquierda para que defiendas', () => {
    const s = new TutorialScript('blue', 'red');
    const steps: string[] = [];
    s.onStep = (st) => steps.push(st);
    expect(s.paused).toBe(true);
    expect(run(s, 30)).toEqual([]); // parado: ni avanza ni juega el rival
    s.tap();
    s.tap();
    expect(s.step).toBe('deploy');
    expect(s.paused).toBe(false);
    s.events([deploy('red')]); // lo que haga el rival no cuenta
    expect(s.step).toBe('deploy');
    s.events([deploy('blue')]);
    expect(s.step).toBe('walk');
    const plays = run(s, 5);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ t: 'play', team: 'red', x: FOE_ATTACK.x, y: FOE_ATTACK.y });
    expect(s.step).toBe('defend');
    s.events([deploy('blue')]);
    expect(s.step).toBe('push');
    run(s, 6);
    expect(steps).toEqual(['hand', 'deploy', 'walk', 'defend', 'push', 'free']);
  });

  it('el ataque del Guía es una tropa que puede pagar (si no puede, espera)', () => {
    const s = new TutorialScript('blue', 'red');
    s.tap();
    s.tap();
    s.events([deploy('blue')]);
    expect(run(s, 8, view({ foeElixir: 0 }))).toEqual([]);
    expect(s.step).toBe('walk');
    const cheap = Math.min(...units.slice(0, 4).map((k) => getCard(k).cost));
    const [p] = run(s, 1, view({ foeElixir: cheap }));
    expect(p && p.t === 'play' && getCard(p.card).cost).toBe(cheap);
  });

  it('en la parte libre el Guía juega poco, en su lado y alternando carril; los consejos salen una vez', () => {
    const s = new TutorialScript('blue', 'red');
    const tips: TutTip[] = [];
    s.onTip = (tip) => tips.push(tip);
    s.tap();
    s.tap();
    s.events([deploy('blue')]);
    run(s, 5);
    s.events([deploy('blue')]);
    run(s, 6);
    expect(s.step).toBe('free');
    const plays = run(s, 40, view({ myElixir: 10 }));
    expect(plays).toHaveLength(2);
    expect(plays.map((p) => p.t === 'play' && p.x)).toEqual([...new Set(plays.map((p) => p.t === 'play' && p.x))]);
    for (const p of plays) expect(p.t === 'play' && p.y).toBeLessThan(570);
    s.events([{ e: 'crown', team: 'blue', crowns: 1 }]);
    s.events([{ e: 'crown', team: 'blue', crowns: 2 }]);
    expect(tips.filter((x) => x === 'crown')).toHaveLength(1);
    expect(tips).toContain('elixirFull');
  });

  it('las jugadas del Guía son válidas en una partida de verdad', () => {
    const m = new Match({
      seed: 3,
      arena: 0,
      players: {
        blue: { deck: [...STARTER_DECK], levels: {}, kingLevel: 1 },
        red: { deck: [...STARTER_DECK], levels: {}, kingLevel: 1 },
      },
    });
    m.elixir.red = 10;
    const s = new TutorialScript('blue', 'red');
    s.tap();
    s.tap();
    s.events([deploy('blue')]);
    const [p] = run(s, 5, view({ foeHand: m.cycles.red.hand, foeElixir: m.elixir.red }));
    expect(p.t).toBe('play');
    if (p.t === 'play') expect(m.canPlay('red', p.card, p.x, p.y)).toBe('ok');
  });
});
