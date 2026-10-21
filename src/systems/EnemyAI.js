import { ARENA, T, W } from '../config.js';
import { getCard } from '../data/cards.js';
import { CardCycle } from './CardCycle.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * IA del rival:
 *  1. Hechizos contra grupos o para rematar torres.
 *  2. Defiende lo que cruza el río con la carta que mejor contrarresta.
 *  3. Apoya a sus tanques con tropas a distancia detrás.
 *  4. Ataca por la línea más débil cuando acumula elixir (sin desperdiciarlo).
 */
export class EnemyAI {
  constructor(battle, deck, cfg) {
    this.b = battle;
    this.cfg = cfg;
    this.cycle = new CardCycle(deck);
    this.t = 2.5;
    this.emoteCd = 0;
  }

  hand() { return this.cycle.hand.map((k, i) => ({ i, k, c: getCard(k) })); }

  play(i, x, y) { return this.b.tryDeploy('enemy', this.cycle, i, x, y); }

  update(dt) {
    this.emoteCd -= dt;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = this.cfg.think * rand(0.7, 1.3);
    const b = this.b;
    const elixir = b.elixir.enemy;
    const hand = this.hand().filter((h) => h.c.cost <= elixir);
    if (!hand.length) return;
    const riverTop = b.riverTop;
    const threats = b.units
      .filter((u) => u.alive && u.team === 'player' && u.y < b.riverBot + 3 * T)
      .sort((a, c) => a.y - c.y);

    // 1) Hechizos
    const spell = hand.find((h) => h.c.type === 'spell');
    if (spell) {
      const sc = b.cardFor('enemy', spell.k);
      for (const u of b.units.filter((o) => o.alive && o.team === 'player')) {
        const near = b.units.filter((o) => o.alive && o.team === 'player' && Math.hypot(o.x - u.x, o.y - u.y) < sc.radiusSpell);
        const val = near.reduce((s, o) => s + Math.min(o.hp, sc.dmg), 0);
        if (near.length >= 3 || val > sc.dmg * 1.6) {
          const cx = near.reduce((s, o) => s + o.x, 0) / near.length;
          const cy = near.reduce((s, o) => s + o.y, 0) / near.length;
          if (this.play(spell.i, cx, cy - 10)) return;
        }
      }
      for (const t of b.towers) {
        if (t.team === 'player' && t.alive && t.hp <= sc.dmg * sc.towerDmg) {
          if (this.play(spell.i, t.x, t.y)) return;
        }
      }
    }

    // 2) Defensa
    if (threats.length && Math.random() < this.cfg.defendChance) {
      const th = threats[0];
      const options = hand.filter((h) => h.c.type !== 'spell' && h.c.targets !== 'buildings' && (!th.flying || h.c.targets === 'any'));
      if (options.length) {
        const swarm = threats.filter((o) => Math.hypot(o.x - th.x, o.y - th.y) < 2 * T).length >= 3;
        const tanky = th.hp > 1200;
        const score = (h) => (swarm && h.c.splash ? 3 : 0) + (tanky ? h.c.dmg / h.c.hitSpeed / 60 : 0) - h.c.cost * 0.4 + Math.random();
        options.sort((a, c) => score(c) - score(a));
        const pick = options[0];
        const ranged = pick.c.range > 2 * T;
        const y = clamp(th.y - (ranged ? 3.5 * T : 1.5 * T), ARENA.top + 60, riverTop - 10);
        const x = clamp(th.x + rand(-20, 20) + (ranged ? (th.x < W / 2 ? 50 : -50) : 0), 30, W - 30);
        if (this.play(pick.i, x, y)) return;
      }
    }

    // 3) Apoyo a un tanque propio
    const tank = b.units.find((u) => u.alive && u.team === 'enemy' && (u.card.targets === 'buildings' || u.maxHp > 1400) && u.y > riverTop - 5 * T);
    if (tank && elixir >= 4) {
      const sup = hand.filter((h) => h.c.type !== 'spell' && h.c.range > 2 * T);
      if (sup.length) {
        const pick = sup[Math.floor(Math.random() * sup.length)];
        if (this.play(pick.i, clamp(tank.x + rand(-30, 30), 30, W - 30), clamp(tank.y - 2.5 * T, ARENA.top + 60, riverTop - 10))) return;
      }
    }

    // 4) Ataque
    const leaking = elixir >= 9.6;
    if (elixir >= this.cfg.attackElixir || leaking) {
      const units = hand.filter((h) => h.c.type !== 'spell');
      if (!units.length) return;
      units.sort((a, c) => (c.c.targets === 'buildings') - (a.c.targets === 'buildings') || Math.random() - 0.5);
      const pick = leaking ? units[Math.floor(Math.random() * units.length)] : units[0];
      const pt = b.towersBy.player;
      const laneLeft = !pt.left.alive || (pt.right.alive && pt.left.hp <= pt.right.hp);
      const lx = laneLeft ? 140 : 580;
      const isTank = pick.c.targets === 'buildings' || pick.c.hp >= 1400;
      const x = isTank ? lx * 0.55 + (W / 2) * 0.45 : lx + rand(-20, 20);
      const y = isTank ? ARENA.top + 150 : riverTop - 1.5 * T;
      this.play(pick.i, x, y);
    }
  }

  maybeEmote(kind) {
    if (this.emoteCd > 0 || Math.random() < 0.4) return;
    this.emoteCd = 8;
    const lines = {
      good: ['¡Toma ya!', '¡Ja, ja!', '¡Bien!'],
      bad: ['¡Grrr!', '¡Ups!', 'Bien jugado'],
      start: ['¡Buena suerte!', '¡A por ello!'],
    }[kind];
    this.b.emote('enemy', lines[Math.floor(Math.random() * lines.length)]);
  }
}
