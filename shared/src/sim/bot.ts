import { ARENA, T, W, DT, type AiConfig } from '../config';
import { getCard, type Card } from '../data/cards';
import { emoteId } from '../data/emotes';
import { clamp, dist } from './math';
import type { Match } from './match';
import type { Rng } from './rng';
import { other, type Input, type SimEvent, type SimUnit, type Team } from './types';

const RIVER_TOP = ARENA.riverY - ARENA.riverHalf;
const RIVER_BOT = ARENA.riverY + ARENA.riverHalf;

const LINES = {
  good: ['¡Toma ya!', '¡Ja, ja!', '¡Bien!'],
  bad: ['¡Grrr!', '¡Ups!', 'Bien jugado'],
  start: ['¡Buena suerte!', '¡A por ello!'],
};

/**
 * Bot de la partida. Solo lee el estado de la simulación y genera inputs,
 * igual que un jugador humano, así que sirve en local y en el servidor.
 *
 *  1. Hechizos contra grupos o para rematar torres.
 *  2. Defiende lo que cruza el río con la carta que mejor contrarresta.
 *  3. Apoya a sus tanques con tropas a distancia detrás.
 *  4. Ataca por la línea más débil cuando acumula elixir (sin desperdiciarlo).
 *
 * Internamente piensa como si su lado fuera el de arriba; si juega abajo, se refleja la Y.
 */
export class Bot {
  private t = 2.5;
  private emoteCd = 0;
  private queued: Input[] = [];

  constructor(
    readonly team: Team,
    private readonly cfg: AiConfig,
    private readonly rng: Rng,
  ) {}

  /** Y en el sistema del bot (su lado arriba) ↔ Y del mundo. Es su propia inversa. */
  private my(y: number): number {
    return this.team === 'red' ? y : 2 * ARENA.riverY - y;
  }

  /** Llamar una vez por tick, antes de match.step(). */
  update(m: Match): Input[] {
    const out = this.queued;
    this.queued = [];
    if (m.over) return out;
    this.emoteCd -= DT;
    this.t -= DT;
    if (this.t > 0) return out;
    this.t = this.cfg.think * this.rng.range(0.7, 1.3);
    const play = this.think(m);
    if (play) out.push(play);
    return out;
  }

  /** Llamar con los eventos de cada tick para que el bot reaccione con emotes. */
  observe(events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.e === 'crown') this.maybeEmote(ev.team === this.team ? 'good' : 'bad');
    }
  }

  /** Emote al empezar (lo llama quien arranca la partida). */
  greet(): void {
    this.maybeEmote('start');
  }

  private maybeEmote(kind: keyof typeof LINES): void {
    if (this.emoteCd > 0 || this.rng.chance(0.4)) return;
    this.emoteCd = 8;
    this.queued.push({ t: 'emote', team: this.team, id: emoteId(this.rng.pick(LINES[kind])) });
  }

  private think(m: Match): Input | null {
    const me = this.team,
      foe = other(me);
    const elixir = m.elixir[me];
    const hand = m.cycles[me].hand.map((k) => ({ k, c: getCard(k) })).filter((h) => h.c.cost <= elixir);
    if (!hand.length) return null;
    const rng = this.rng;
    const tryPlay = (k: string, x: number, myY: number): Input | null => {
      const y = this.my(myY);
      const rx = Math.round(x),
        ry = Math.round(y);
      return m.canPlay(me, k, rx, ry) === 'ok' ? { t: 'play', team: me, card: k, x: rx, y: ry } : null;
    };
    const foes = m.units.filter((u) => u.alive && u.team === foe);
    const threats = foes.filter((u) => this.my(u.y) < RIVER_BOT + 3 * T).sort((a, c) => this.my(a.y) - this.my(c.y));

    // 1) Hechizos
    const spell = hand.find((h) => h.c.type === 'spell');
    if (spell) {
      const sc: Card = m.cardFor(me, spell.k);
      for (const u of foes) {
        const near = foes.filter((o) => dist(o.x, o.y, u.x, u.y) < sc.radiusSpell);
        const val = near.reduce((s, o) => s + Math.min(o.hp, sc.dmg), 0);
        if (near.length >= 3 || val > sc.dmg * 1.6) {
          const cx = near.reduce((s, o) => s + o.x, 0) / near.length;
          const cy = near.reduce((s, o) => s + this.my(o.y), 0) / near.length;
          const p = tryPlay(spell.k, cx, cy - 10);
          if (p) return p;
        }
      }
      for (const t of m.towers) {
        if (t.team === foe && t.alive && t.hp <= sc.dmg * sc.towerDmg) {
          const p = tryPlay(spell.k, t.x, this.my(t.y));
          if (p) return p;
        }
      }
    }

    // 2) Defensa
    if (threats.length && rng.next() < this.cfg.defendChance) {
      const th = threats[0];
      const thY = this.my(th.y);
      const options = hand.filter(
        (h) => h.c.type !== 'spell' && h.c.targets !== 'buildings' && (!th.flying || h.c.targets === 'any'),
      );
      if (options.length) {
        const swarm = threats.filter((o) => dist(o.x, o.y, th.x, th.y) < 2 * T).length >= 3;
        const tanky = th.hp > 1200;
        const scores = new Map(
          options.map((h) => [
            h.k,
            (swarm && h.c.splash ? 3 : 0) + (tanky ? h.c.dmg / h.c.hitSpeed / 60 : 0) - h.c.cost * 0.4 + rng.next(),
          ]),
        );
        options.sort((a, c) => scores.get(c.k)! - scores.get(a.k)!);
        const pick = options[0];
        const ranged = pick.c.range > 2 * T;
        const y = clamp(thY - (ranged ? 3.5 * T : 1.5 * T), ARENA.top + 60, RIVER_TOP - 10);
        const x = clamp(th.x + rng.range(-20, 20) + (ranged ? (th.x < W / 2 ? 50 : -50) : 0), 30, W - 30);
        const p = tryPlay(pick.k, x, y);
        if (p) return p;
      }
    }

    // 3) Apoyo a un tanque propio
    const tank = m.units.find(
      (u: SimUnit) =>
        u.alive &&
        u.team === me &&
        (u.card.targets === 'buildings' || u.maxHp > 1400) &&
        this.my(u.y) > RIVER_TOP - 5 * T,
    );
    if (tank && elixir >= 4) {
      const sup = hand.filter((h) => h.c.type !== 'spell' && h.c.range > 2 * T);
      if (sup.length) {
        const pick = rng.pick(sup);
        const p = tryPlay(
          pick.k,
          clamp(tank.x + rng.range(-30, 30), 30, W - 30),
          clamp(this.my(tank.y) - 2.5 * T, ARENA.top + 60, RIVER_TOP - 10),
        );
        if (p) return p;
      }
    }

    // 4) Ataque
    const leaking = elixir >= 9.6;
    if (elixir >= this.cfg.attackElixir || leaking) {
      const units = hand.filter((h) => h.c.type !== 'spell');
      if (!units.length) return null;
      const order = new Map(units.map((h) => [h.k, rng.next()]));
      units.sort(
        (a, c) =>
          Number(c.c.targets === 'buildings') - Number(a.c.targets === 'buildings') ||
          order.get(a.k)! - order.get(c.k)!,
      );
      const pick = leaking ? rng.pick(units) : units[0];
      const pt = m.towersBy[foe];
      const laneLeft = !pt.left.alive || (pt.right.alive && pt.left.hp <= pt.right.hp);
      const lx = laneLeft ? 140 : 580;
      const isTank = pick.c.targets === 'buildings' || pick.c.hp >= 1400;
      const x = isTank ? lx * 0.55 + (W / 2) * 0.45 : lx + rng.range(-20, 20);
      const y = isTank ? ARENA.top + 150 : RIVER_TOP - 1.5 * T;
      return tryPlay(pick.k, x, y);
    }
    return null;
  }
}
