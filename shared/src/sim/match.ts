import {
  ARENA,
  T,
  W,
  TICK_RATE,
  DT,
  RULES,
  SIGHT,
  TOWERS,
  TOWER_LAYOUT,
  TOWER_LEVEL_MULT,
  TOWER_GUARDIANS,
  type TowerKind,
} from '../config';
import { cardAtLevel, getCard, isCardKey, levelMult, startLevel, type Card } from '../data/cards';
import { PACK } from '../data/pack';
import { typeMultiplier } from '../data/typeChart';
import { Rng } from './rng';
import { clamp, dist, formation, ticks } from './math';
import {
  other,
  TEAMS,
  type Body,
  type DamageSource,
  type Input,
  type MatchSetup,
  type Pending,
  type PlayCheck,
  type SimArea,
  type SimEvent,
  type SimProjectile,
  type SimTower,
  type SimUnit,
  type Team,
  type TimedInput,
  type TowerSide,
  type Winner,
} from './types';

/** Altura (visual) a la que vuelan las tropas aéreas. */
export const HOVER = 22;
/** Altura visual a la que llega un proyectil a cada tipo de objetivo. */
export const hitHeight = (b: Body): number => (b.flying ? HOVER : b.isTower ? 30 : 12);
const RIVER_TOP = ARENA.riverY - ARENA.riverHalf;
const RIVER_BOT = ARENA.riverY + ARENA.riverHalf;

/** Ciclo de cartas estilo Clash Royale: 4 en mano, la jugada va al final de la cola. */
export class CardCycle {
  hand: string[];
  queue: string[];

  constructor(keys: readonly string[], rng: Rng) {
    const deck = rng.shuffle([...keys]);
    this.hand = deck.slice(0, RULES.handSize);
    this.queue = deck.slice(RULES.handSize);
  }

  get next(): string {
    return this.queue[0];
  }

  play(i: number): string {
    const k = this.hand[i];
    this.hand[i] = this.queue.shift()!;
    this.queue.push(k);
    return k;
  }
}

/**
 * Una partida. TypeScript puro y determinista: con la misma semilla y los mismos
 * inputs en los mismos ticks, el resultado es idéntico en el cliente y en el servidor.
 *
 * Uso:  const m = new Match(setup);  cada 50 ms → const events = m.step(inputsDeEsteTick);
 */
export class Match {
  readonly setup: MatchSetup;
  readonly rng: Rng;
  tick = 0;
  /** Ticks que quedan del tiempo normal o del tiempo extra. */
  ticksLeft: number;
  overtime = false;
  doubleAnnounced = false;
  over = false;
  winner: Winner | null = null;
  elixir: Record<Team, number> = { blue: RULES.elixirStart, red: RULES.elixirStart };
  crowns: Record<Team, number> = { blue: 0, red: 0 };
  cycles: Record<Team, CardCycle>;
  units: SimUnit[] = [];
  towers: SimTower[] = [];
  towersBy: Record<Team, Record<TowerSide, SimTower>>;
  projectiles: SimProjectile[] = [];
  pending: Pending[] = [];
  /** Hechizos que duran (veneno, curación, furia). */
  areas: SimArea[] = [];
  /** Inputs aplicados (para guardar la repetición). */
  readonly log: TimedInput[] = [];

  private nextId = 1;
  private events: SimEvent[] = [];
  private cardCache: Record<Team, Record<string, Card>> = { blue: {}, red: {} };

  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.ticksLeft = ticks(RULES.matchTime, TICK_RATE);
    this.cycles = {
      blue: new CardCycle(setup.players.blue.deck, this.rng),
      red: new CardCycle(setup.players.red.deck, this.rng),
    };
    this.towersBy = { blue: {}, red: {} } as Record<Team, Record<TowerSide, SimTower>>;
    this.spawnTowers();
  }

  // ───────────────────────── API ─────────────────────────

  get timeLeft(): number {
    return this.ticksLeft / TICK_RATE;
  }

  get elapsed(): number {
    return this.tick / TICK_RATE;
  }

  get doubleElixir(): boolean {
    return this.overtime || this.ticksLeft <= ticks(RULES.doubleElixirAt, TICK_RATE);
  }

  /** Carta con los niveles del jugador de ese equipo. */
  cardFor(team: Team, key: string): Card {
    let c = this.cardCache[team][key];
    if (!c) {
      c = cardAtLevel(key, this.setup.players[team].levels[key]);
      this.cardCache[team][key] = c;
    }
    return c;
  }

  /** ¿Puede ese equipo jugar esa carta ahí ahora mismo? */
  canPlay(team: Team, key: string, x: number, y: number): PlayCheck {
    if (this.over) return 'over';
    if (!isCardKey(key) || !this.cycles[team].hand.includes(key)) return 'hand';
    const card = getCard(key);
    if (this.elixir[team] < card.cost) return 'elixir';
    if (!Number.isFinite(x) || !Number.isFinite(y) || !this.canDeploy(team, card, x, y)) return 'zone';
    return 'ok';
  }

  /** Avanza un tick (1/20 s). Devuelve los eventos de ese tick. */
  step(inputs: readonly Input[] = []): SimEvent[] {
    this.events = [];
    if (this.over) return this.events;
    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
    }

    for (const input of inputs) this.apply(input);
    if (this.over) {
      this.tick++;
      return this.events;
    }

    // reloj y elixir
    this.ticksLeft -= 1;
    const dbl = this.doubleElixir;
    if (dbl && !this.doubleAnnounced) {
      this.doubleAnnounced = true;
      this.emit({ e: 'doubleElixir' });
    }
    const regen = (DT / RULES.elixirRegen) * (dbl ? 2 : 1);
    for (const team of TEAMS) this.elixir[team] = Math.min(RULES.elixirMax, this.elixir[team] + regen);

    this.runPending();
    this.updateAreas();
    for (const u of this.units) this.updateUnit(u, DT);
    for (const t of this.towers) this.updateTower(t, DT);
    for (const p of this.projectiles) this.updateProjectile(p, DT);
    this.resolveCollisions();

    this.units = this.units.filter((u) => u.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    if (this.ticksLeft <= 0 && !this.over) this.onTimeUp();
    this.tick++;
    return this.events;
  }

  /** Huella del estado (para comprobar que cliente y servidor van iguales). */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (n: number) => {
      // redondeo a 1/1000 para que el hash sea estable al serializar
      const v = Math.round(n * 1000) | 0;
      h = Math.imul(h ^ v, 0x01000193) >>> 0;
    };
    mix(this.tick);
    mix(this.ticksLeft);
    mix(this.elixir.blue);
    mix(this.elixir.red);
    mix(this.crowns.blue);
    mix(this.crowns.red);
    mix(this.rng.state);
    for (const u of this.units) {
      mix(u.id);
      mix(u.x);
      mix(u.y);
      mix(u.hp);
    }
    for (const t of this.towers) {
      mix(t.id);
      mix(t.hp);
      mix(t.active ? 1 : 0);
    }
    for (const p of this.projectiles) {
      mix(p.id);
      mix(p.x);
      mix(p.y);
    }
    for (const a of this.areas) {
      mix(a.id);
      mix(a.until);
    }
    return h >>> 0;
  }

  // ───────────────────────── Inputs ─────────────────────────

  private apply(input: Input): void {
    if (this.over) return;
    this.log.push({ tick: this.tick, input });
    if (input.t === 'emote') {
      this.emit({ e: 'emote', team: input.team, id: input.id });
      return;
    }
    if (input.t === 'surrender') {
      this.crowns[other(input.team)] = 3;
      this.end(other(input.team), 'surrender');
      return;
    }
    const x = Math.round(input.x),
      y = Math.round(input.y);
    if (this.canPlay(input.team, input.card, x, y) !== 'ok') {
      this.log.pop();
      return;
    }
    const cycle = this.cycles[input.team];
    this.elixir[input.team] -= getCard(input.card).cost;
    cycle.play(cycle.hand.indexOf(input.card));
    this.deploy(input.team, input.card, x, y);
  }

  // ───────────────────────── Torres ─────────────────────────

  private spawnTowers(): void {
    const L = TOWER_LAYOUT;
    const add = (team: Team, kind: TowerKind, side: TowerSide, x: number, y: number) => {
      const cfg = TOWERS[kind];
      const level = this.setup.players[team].kingLevel;
      const m = levelMult(level - 1, TOWER_LEVEL_MULT);
      const g = TOWER_GUARDIANS[team][kind];
      const mv = PACK.attacks[g.move];
      const hp = Math.round(cfg.hp * m);
      const t: SimTower = {
        id: this.nextId++,
        team,
        kind,
        side,
        level,
        x,
        y,
        hp,
        maxHp: hp,
        dmg: Math.round(cfg.dmg * m),
        hitSpeed: cfg.hitSpeed,
        range: cfg.range,
        radius: cfg.radius,
        types: [],
        flying: false,
        alive: true,
        isTower: true,
        active: kind !== 'king',
        cooldown: 0,
        target: null,
        move: g.move,
        moveType: mv?.type ?? 'normal',
        palette: mv?.palette ?? 'normal',
        shotY: kind === 'king' ? -75 : -59,
        frozenT: 0,
      };
      this.towers.push(t);
      this.towersBy[team][side] = t;
    };
    add('red', 'king', 'king', L.kingX, ARENA.top + L.kingOffset);
    add('red', 'princess', 'left', L.princessX[0], ARENA.top + L.princessOffset);
    add('red', 'princess', 'right', L.princessX[1], ARENA.top + L.princessOffset);
    add('blue', 'king', 'king', L.kingX, ARENA.bottom - L.kingOffset);
    add('blue', 'princess', 'left', L.princessX[0], ARENA.bottom - L.princessOffset);
    add('blue', 'princess', 'right', L.princessX[1], ARENA.bottom - L.princessOffset);
  }

  private activateKing(t: SimTower): void {
    if (t.active || !t.alive) return;
    t.active = true;
    this.emit({ e: 'kingAwake', team: t.team });
  }

  private updateTower(t: SimTower, dt: number): void {
    if (!t.alive) return;
    if (t.frozenT > 0) {
      t.frozenT -= dt;
      return;
    }
    if (!t.active) return;
    t.cooldown -= dt;
    const cur = t.target;
    if (!cur || !cur.alive || this.towerDist(t, cur) > t.range) t.target = this.findTowerTarget(t);
    const tg = t.target;
    if (!tg) return;
    if (t.cooldown <= 0) {
      t.cooldown = t.hitSpeed;
      this.emit({ e: 'attack', id: t.id, targetId: tg.id, melee: false });
      // El ataque de las torres es neutro (sin tipo): los guardianes son distintos en
      // cada lado y, si contara el tipo, un lado tendría ventaja.
      const src: DamageSource = {
        team: t.team,
        dmg: t.dmg,
        moveType: '',
        moveStats: {},
        splash: 0,
        groundOnly: false,
        isTower: true,
        palette: t.palette,
      };
      this.shoot(t.id, src, tg, t.x, t.y, -t.shotY, t.move);
    }
  }

  private towerDist(t: SimTower, b: Body): number {
    return dist(t.x, t.y, b.x, b.y) - b.radius;
  }

  private findTowerTarget(t: SimTower): Body | null {
    let best: Body | null = null,
      bd = Infinity;
    for (const u of this.units) {
      if (u.team === t.team || !u.alive) continue;
      const d = this.towerDist(t, u);
      if (d <= t.range && d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  private damageTower(t: SimTower, amount: number, mult: number): void {
    if (!t.alive) return;
    t.hp -= amount;
    this.emit({ e: 'damage', id: t.id, amount, mult, silent: false });
    if (t.kind === 'king') this.activateKing(t);
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      this.emit({ e: 'towerDestroyed', id: t.id, team: t.team, kind: t.kind });
      this.onTowerDestroyed(t);
    }
  }

  // ───────────────────────── Despliegue ─────────────────────────

  private inPocket(team: Team, x: number, y: number): boolean {
    const opp = other(team);
    const side: TowerSide = x < W / 2 ? 'left' : 'right';
    if (this.towersBy[opp][side].alive) return false;
    if (Math.abs(x - W / 2) < 10) return false;
    const py = this.towersBy[opp][side].y;
    return team === 'blue' ? y >= py + 30 && y <= RIVER_TOP - 8 : y <= py - 30 && y >= RIVER_BOT + 8;
  }

  /** Zona válida (sin mirar elixir ni mano). */
  canDeploy(team: Team, card: Card, x: number, y: number): boolean {
    if (x < 14 || x > W - 14 || y < ARENA.top + 14 || y > ARENA.bottom - 10) return false;
    if (card.type === 'spell') return true;
    for (const t of this.towers) if (t.alive && dist(t.x, t.y, x, y) < t.radius + 12) return false;
    // un edificio no se puede poner encima de otro
    if (card.type === 'building')
      for (const u of this.units)
        if (u.alive && u.building && dist(u.x, u.y, x, y) < u.radius + card.radius) return false;
    if (team === 'blue' ? y >= RIVER_BOT + 8 : y <= RIVER_TOP - 8) return true;
    return this.inPocket(team, x, y);
  }

  private deploy(team: Team, key: string, x: number, y: number): void {
    const card = this.cardFor(team, key);
    this.emit({ e: 'deploy', team, card: key, x, y });
    if (card.type === 'spell') {
      this.emit({ e: 'spellCast', team, card: key, x, y });
      this.pending.push({ kind: 'spell', at: this.tick + ticks(RULES.spellDelay, TICK_RATE), team, card, x, y });
      return;
    }
    for (const [dx, fy] of formation(card.count, 0.55 * T)) {
      const dy = team === 'blue' ? fy : -fy; // la formación mira hacia el rival
      this.spawnUnit(team, card, x + dx, y + dy, RULES.deployTime);
    }
  }

  /** Crea una tropa o un edificio (desplegado por un jugador o sacado por un generador). */
  private spawnUnit(team: Team, card: Card, x: number, y: number, deployLeft: number): SimUnit {
    const building = card.type === 'building';
    const u: SimUnit = {
      id: this.nextId++,
      team,
      card,
      isTower: false,
      x,
      y,
      px: x,
      py: y,
      hp: card.hp,
      maxHp: card.hp,
      types: card.types,
      flying: card.flying,
      radius: card.radius,
      mass: card.hp,
      alive: true,
      state: 'deploy',
      deployLeft,
      cooldown: 0,
      retarget: 0,
      target: null,
      slowT: 0,
      slowAmt: 0,
      burnT: 0,
      burnDps: 0,
      faceX: 0,
      faceY: team === 'blue' ? -1 : 1,
      building,
      decay: building ? card.hp / card.lifetime : 0,
      // el primer Combee sale enseguida; luego, cada spawnEvery
      spawnT: card.spawnEvery * 0.4,
      elixirT: card.elixirEvery,
      frozenT: 0,
      rageT: 0,
    };
    if (!u.flying) this.keepOnGround(u);
    u.px = u.x;
    u.py = u.y;
    this.units.push(u);
    this.emit({ e: 'spawn', id: u.id });
    return u;
  }

  // ───────────────────────── Tropas ─────────────────────────

  private edgeDist(u: SimUnit, t: Body): number {
    return dist(u.x, u.y, t.x, t.y) - t.radius - u.radius;
  }

  private validTarget(u: SimUnit, t: Body | null): boolean {
    return !!t && t.alive && !(u.card.targets === 'ground' && t.flying);
  }

  private findTarget(u: SimUnit): Body | null {
    let best: Body | null = null,
      bd = Infinity;
    if (u.card.targets !== 'buildings') {
      for (const e of this.units) {
        if (e.team === u.team || !e.alive) continue;
        if (u.card.targets === 'ground' && e.flying) continue;
        const d = this.edgeDist(u, e);
        if (d < SIGHT && d < bd) {
          bd = d;
          best = e;
        }
      }
    } else {
      // los que solo van a por torres también se desvían a por los edificios (para eso se ponen)
      for (const e of this.units) {
        if (e.team === u.team || !e.alive || !e.building) continue;
        const d = this.edgeDist(u, e);
        if (d < SIGHT && d < bd) {
          bd = d;
          best = e;
        }
      }
    }
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive) continue;
      const d = this.edgeDist(u, t);
      if (d < SIGHT && d < bd) {
        bd = d;
        best = t;
      }
    }
    return best || this.laneTower(u);
  }

  private laneTower(u: SimUnit): SimTower | null {
    const ts = this.towersBy[other(u.team)];
    const p = u.x < W / 2 ? ts.left : ts.right;
    return p.alive ? p : ts.king.alive ? ts.king : null;
  }

  /** Siguiente punto hacia el objetivo: las tropas de tierra cruzan por el puente más cómodo. */
  pathPoint(u: { x: number; y: number; flying: boolean; radius: number }, tx: number, ty: number): [number, number] {
    if (u.flying) return [tx, ty];
    const inRiver = u.y > RIVER_TOP - 4 && u.y < RIVER_BOT + 4;
    const uSide = u.y < ARENA.riverY ? -1 : 1;
    const tSide = ty < ARENA.riverY ? -1 : 1;
    if (uSide === tSide && !inRiver) return [tx, ty];
    const bx = ARENA.bridges.reduce(
      (best, b) => (Math.abs(u.x - b) + Math.abs(tx - b) < Math.abs(u.x - best) + Math.abs(tx - best) ? b : best),
      ARENA.bridges[0] as number,
    );
    const startBank = tSide < 0 ? RIVER_BOT + 6 : RIVER_TOP - 6;
    const destBank = tSide < 0 ? RIVER_TOP - 8 : RIVER_BOT + 8;
    const tol = Math.max(4, ARENA.bridgeHalf - u.radius - 2);
    if (!inRiver && Math.abs(u.x - bx) > tol) return [bx, startBank];
    return [bx, destBank];
  }

  private updateUnit(u: SimUnit, dt: number): void {
    if (!u.alive) return;

    if (u.slowT > 0) u.slowT -= dt;
    if (u.burnT > 0) {
      u.burnT -= dt;
      this.damageUnit(u, u.burnDps * dt, 1, true);
      if (!u.alive) return;
    }
    if (u.rageT > 0) u.rageT -= dt;
    if (u.frozenT > 0) {
      // congelado: ni se mueve ni ataca (un edificio sigue gastándose)
      u.frozenT -= dt;
      if (u.building && u.state !== 'deploy') this.decayBuilding(u, dt);
      return;
    }

    if (u.state === 'deploy') {
      u.deployLeft -= dt;
      if (u.deployLeft <= 0) u.state = 'move';
      return;
    }
    if (u.building) {
      this.updateBuilding(u, dt);
      return;
    }

    u.retarget -= dt;
    const t = u.target;
    const lost = !this.validTarget(u, t);
    const lostSight = !!t && !t.isTower && u.state === 'move' && this.edgeDist(u, t) > SIGHT * 1.3;
    if (lost || lostSight || (u.state === 'move' && u.retarget <= 0)) {
      u.target = this.findTarget(u);
      u.retarget = 0.25;
    }
    const tg = u.target;
    if (!tg) return;

    u.cooldown -= dt;
    if (this.edgeDist(u, tg) <= u.card.range) {
      if (u.state !== 'attack') {
        u.state = 'attack';
        u.cooldown = Math.max(u.cooldown, u.card.hitSpeed * 0.35);
      }
      u.faceX = tg.x - u.x;
      u.faceY = tg.y - u.y;
      if (u.cooldown <= 0) {
        this.attack(u, tg);
        u.cooldown = (u.card.hitSpeed * (u.slowT > 0 ? 1 + u.slowAmt : 1)) / this.rage(u);
      }
    } else {
      u.state = 'move';
      const [wx, wy] = this.pathPoint(u, tg.x, tg.y);
      const dx = wx - u.x,
        dy = wy - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.5) {
        const speed = u.card.speed * (u.slowT > 0 ? 1 - u.slowAmt : 1) * this.rage(u);
        const stepLen = Math.min(d, speed * dt);
        u.x += (dx / d) * stepLen;
        u.y += (dy / d) * stepLen;
        u.faceX = dx;
        u.faceY = dy;
      }
    }
  }

  private rage(u: SimUnit): number {
    return u.rageT > 0 ? 1 + RULES.rageBoost : 1;
  }

  // ───────────────────────── Edificios ─────────────────────────

  /** La vida de un edificio baja sola: dura `lifetime` segundos si nadie lo ataca. */
  private decayBuilding(u: SimUnit, dt: number): void {
    u.hp -= u.decay * dt;
    if (u.hp <= 0) {
      u.hp = 0;
      u.alive = false;
      this.emit({ e: 'death', id: u.id });
    }
  }

  private updateBuilding(u: SimUnit, dt: number): void {
    this.decayBuilding(u, dt);
    if (!u.alive) return;
    const c = u.card;
    if (c.spawn && c.spawnEvery > 0) {
      u.spawnT -= dt;
      if (u.spawnT <= 0) {
        u.spawnT += c.spawnEvery;
        this.spawnFrom(u);
      }
    }
    if (c.elixirEvery > 0) {
      u.elixirT -= dt;
      if (u.elixirT <= 0) {
        u.elixirT += c.elixirEvery;
        this.elixir[u.team] = Math.min(RULES.elixirMax, this.elixir[u.team] + 1);
        this.emit({ e: 'elixirGain', id: u.id, team: u.team, amount: 1 });
      }
    }
    if (c.dmg <= 0) return;
    // defensivo: dispara a lo que tenga a tiro, sin moverse
    u.cooldown -= dt;
    if (!this.validTarget(u, u.target) || this.edgeDist(u, u.target!) > c.range) u.target = this.findInRange(u);
    const tg = u.target;
    if (!tg) {
      u.state = 'move';
      return;
    }
    if (u.state !== 'attack') {
      u.state = 'attack';
      u.cooldown = Math.max(u.cooldown, c.hitSpeed * 0.35);
    }
    u.faceX = tg.x - u.x;
    u.faceY = tg.y - u.y;
    if (u.cooldown <= 0) {
      this.attack(u, tg);
      u.cooldown = c.hitSpeed / this.rage(u);
    }
  }

  /** La tropa enemiga más cercana a tiro (los edificios defensivos no disparan a otros edificios). */
  private findInRange(u: SimUnit): SimUnit | null {
    let best: SimUnit | null = null,
      bd = Infinity;
    for (const e of this.units) {
      if (e.team === u.team || !e.alive || e.building) continue;
      if (u.card.targets === 'ground' && e.flying) continue;
      const d = this.edgeDist(u, e);
      if (d <= u.card.range && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Un generador saca su tropa delante (hacia el rival), con el nivel equivalente al suyo. */
  private spawnFrom(b: SimUnit): void {
    const key = b.card.spawn!;
    const level = startLevel(getCard(key)) + (b.card.level - startLevel(getCard(b.card.key)));
    const ck = `${key}@${level}`;
    const card = (this.cardCache[b.team][ck] ??= cardAtLevel(key, level));
    const fwd = b.team === 'blue' ? -1 : 1;
    const y0 = b.y + fwd * (b.radius + card.radius + 6);
    for (const [dx, fy] of formation(b.card.spawnCount, 0.55 * T))
      this.spawnUnit(b.team, card, b.x + dx, y0 + fwd * fy, RULES.spawnDeploy);
  }

  private attack(u: SimUnit, tg: Body): void {
    const melee = u.card.range <= 1.2 * T;
    this.emit({ e: 'attack', id: u.id, targetId: tg.id, melee });
    const hitDelay = Math.min(0.25, u.card.attackAnimDur * 0.5);
    this.pending.push({
      kind: 'hit',
      at: this.tick + Math.max(1, ticks(hitDelay, TICK_RATE)),
      unit: u,
      target: tg,
      melee,
    });
  }

  private damageUnit(u: SimUnit, amount: number, mult: number, silent = false): void {
    if (!u.alive) return;
    u.hp -= amount;
    this.emit({ e: 'damage', id: u.id, amount, mult, silent });
    if (u.hp <= 0) {
      u.alive = false;
      this.emit({ e: 'death', id: u.id });
    }
  }

  private damage(b: Body, amount: number, mult: number): void {
    if (b.isTower) this.damageTower(b as SimTower, amount, mult);
    else this.damageUnit(b as SimUnit, amount, mult);
  }

  private sourceOf(u: SimUnit): DamageSource {
    return {
      team: u.team,
      dmg: u.card.dmg,
      moveType: u.card.moveType,
      moveStats: u.card.moveStats,
      splash: u.card.splash,
      groundOnly: u.card.targets === 'ground',
      isTower: false,
      palette: u.card.palette,
    };
  }

  // ───────────────────────── Daño ─────────────────────────

  private applyDamage(src: DamageSource, primary: Body | null, x: number, y: number): void {
    const ms = src.moveStats;
    const hitOne = (t: Body) => {
      const mult = typeMultiplier(src.moveType, t.types);
      this.damage(t, src.dmg * mult, mult);
      if (!t.isTower && t.alive) {
        const u = t as SimUnit;
        if (ms.burn) {
          u.burnT = 3;
          u.burnDps = src.dmg * 0.06;
        }
        if (ms.slow) {
          u.slowT = 2;
          u.slowAmt = Math.min(0.5, ms.slow * 0.6);
        }
      }
    };

    if (src.splash > 0) {
      for (const e of this.units) {
        if (e.team === src.team || !e.alive || (src.groundOnly && e.flying)) continue;
        if (dist(e.x, e.y, x, y) <= src.splash + e.radius) hitOne(e);
      }
      for (const t of this.towers) {
        if (t.team !== src.team && t.alive && dist(t.x, t.y, x, y) <= src.splash + t.radius) hitOne(t);
      }
      this.emit({ e: 'splash', x, y, r: src.splash, palette: src.isTower ? 'normal' : src.palette });
    } else if (primary && primary.alive) {
      hitOne(primary);
    }
  }

  /**
   * Los proyectiles viajan sobre el plano del suelo, de pies a pies, para que la
   * partida sea simétrica para los dos lados. La altura solo la usa el dibujo.
   */
  private shoot(
    ownerId: number,
    src: DamageSource,
    target: Body,
    x: number,
    y: number,
    h0: number,
    move: string,
  ): void {
    const p: SimProjectile = {
      id: this.nextId++,
      team: src.team,
      ownerId,
      src,
      target,
      x,
      y,
      px: x,
      py: y,
      sx: x,
      sy: y,
      tx: target.x,
      ty: target.y,
      h0,
      speed: RULES.projectileSpeed,
      move,
      alive: true,
    };
    this.projectiles.push(p);
    this.emit({ e: 'shoot', id: p.id });
  }

  private updateProjectile(p: SimProjectile, dt: number): void {
    if (!p.alive) return;
    if (p.target.alive) {
      p.tx = p.target.x;
      p.ty = p.target.y;
    }
    const dx = p.tx - p.x,
      dy = p.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const stepLen = p.speed * dt;
    if (d <= stepLen + 4) {
      p.alive = false;
      p.x = p.tx;
      p.y = p.ty;
      const hit = p.target.alive ? p.target : null;
      this.emit({ e: 'impact', x: p.tx, y: p.ty, h: hitHeight(p.target), palette: p.src.palette, scale: 2 });
      if (!p.src.isTower && p.src.splash > 0) this.applyDamage(p.src, hit, p.tx, p.ty);
      else if (hit) this.applyDamage(p.src, hit, p.tx, p.ty);
      return;
    }
    p.x += (dx / d) * stepLen;
    p.y += (dy / d) * stepLen;
  }

  private runPending(): void {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= this.tick);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > this.tick);
    for (const p of due) {
      if (p.kind === 'hit') {
        const u = p.unit;
        if (!u.alive) continue;
        if (p.melee) {
          if (p.target.alive) {
            this.emit({ e: 'impact', x: p.target.x, y: p.target.y, h: 12, palette: u.card.palette, scale: 3 });
            this.applyDamage(this.sourceOf(u), p.target, p.target.x, p.target.y);
          }
        } else {
          this.shoot(u.id, this.sourceOf(u), p.target, u.x, u.y, u.flying ? HOVER : 14, u.card.move);
        }
      } else {
        this.castSpell(p.team, p.card, p.x, p.y);
      }
    }
  }

  private castSpell(team: Team, card: Card, x: number, y: number): void {
    this.emit({ e: 'spellImpact', team, card: card.key, x, y });
    if (card.effect === 'freeze') return this.castFreeze(team, card, x, y);
    if (card.effect !== 'damage') return this.startArea(team, card, x, y);
    this.emit({ e: 'splash', x, y, r: card.radiusSpell, palette: card.palette });
    const ms = card.moveStats || {};
    for (const u of this.units) {
      if (u.team === team || !u.alive) continue;
      if (dist(u.x, u.y, x, y) <= card.radiusSpell + u.radius) {
        const m = typeMultiplier(card.moveType, u.types);
        this.damageUnit(u, card.dmg * m, m);
        if (u.alive && ms.slow) {
          u.slowT = 2.5;
          u.slowAmt = 0.4;
        }
        if (u.alive && ms.burn) {
          u.burnT = 3;
          u.burnDps = card.dmg * 0.05;
        }
      }
    }
    for (const t of this.towers) {
      if (t.team !== team && t.alive && dist(t.x, t.y, x, y) <= card.radiusSpell + t.radius) {
        this.damageTower(t, card.dmg * card.towerDmg, 1);
      }
    }
  }

  /** Congelación: un poco de daño y deja quietos tropas, edificios y torres un rato. */
  private castFreeze(team: Team, card: Card, x: number, y: number): void {
    this.emit({ e: 'splash', x, y, r: card.radiusSpell, palette: card.palette });
    for (const u of this.units) {
      if (u.team === team || !u.alive || dist(u.x, u.y, x, y) > card.radiusSpell + u.radius) continue;
      const m = typeMultiplier(card.moveType, u.types);
      this.damageUnit(u, card.dmg * m, m);
      if (u.alive) u.frozenT = Math.max(u.frozenT, card.duration);
    }
    for (const t of this.towers) {
      if (t.team === team || !t.alive || dist(t.x, t.y, x, y) > card.radiusSpell + t.radius) continue;
      this.damageTower(t, card.dmg * card.towerDmg, 1);
      t.frozenT = Math.max(t.frozenT, card.duration);
    }
  }

  /** Veneno, curación o furia: se queda en el suelo `duration` segundos. */
  private startArea(team: Team, card: Card, x: number, y: number): void {
    const kind = card.effect as SimArea['kind'];
    const a: SimArea = {
      id: this.nextId++,
      team,
      card,
      kind,
      x,
      y,
      r: card.radiusSpell,
      start: this.tick,
      until: this.tick + ticks(card.duration, TICK_RATE),
    };
    this.areas.push(a);
    this.emit({ e: 'area', id: a.id, team, card: card.key, kind, x, y, r: a.r, dur: card.duration });
  }

  /**
   * Cada tick: la furia acelera a los tuyos mientras estén dentro (y un poco después).
   * Cada medio segundo: el veneno daña a los rivales (y a sus torres, menos) y la curación
   * cura a tus tropas. `dmg` es el total repartido en toda la duración.
   */
  private updateAreas(): void {
    if (!this.areas.length) return;
    const pulse = ticks(RULES.areaPulse, TICK_RATE);
    for (const a of this.areas) {
      if (this.tick >= a.until) continue;
      const inside = (b: Body) => dist(b.x, b.y, a.x, a.y) <= a.r + b.radius;
      if (a.kind === 'rage') {
        for (const u of this.units)
          if (u.team === a.team && u.alive && inside(u)) u.rageT = Math.max(u.rageT, RULES.areaPulse + DT);
        continue;
      }
      if ((this.tick - a.start) % pulse !== 0) continue;
      const amount = a.card.dmg / Math.max(1, Math.round((a.until - a.start) / pulse));
      if (a.kind === 'heal') {
        for (const u of this.units) {
          if (u.team !== a.team || !u.alive || u.building || u.hp >= u.maxHp || !inside(u)) continue;
          const h = Math.min(amount, u.maxHp - u.hp);
          u.hp += h;
          this.emit({ e: 'heal', id: u.id, amount: h });
        }
        continue;
      }
      for (const u of this.units) {
        if (u.team === a.team || !u.alive || !inside(u)) continue;
        const m = typeMultiplier(a.card.moveType, u.types);
        this.damageUnit(u, amount * m, m);
      }
      for (const t of this.towers)
        if (t.team !== a.team && t.alive && inside(t)) this.damageTower(t, amount * a.card.towerDmg, 1);
    }
    this.areas = this.areas.filter((a) => this.tick < a.until);
  }

  // ───────────────────────── Física ─────────────────────────

  private keepOnGround(u: SimUnit): void {
    if (u.y > RIVER_TOP - 2 && u.y < RIVER_BOT + 2) {
      const bx = ARENA.bridges.reduce(
        (a, b) => (Math.abs(u.x - b) < Math.abs(u.x - a) ? b : a),
        ARENA.bridges[0] as number,
      );
      if (Math.abs(u.x - bx) < ARENA.bridgeHalf + 8) {
        const lim = Math.max(2, ARENA.bridgeHalf - u.radius);
        u.x = clamp(u.x, bx - lim, bx + lim);
      } else {
        u.y = u.y < ARENA.riverY ? RIVER_TOP - 2 : RIVER_BOT + 2;
      }
    }
  }

  private resolveCollisions(): void {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (!b.alive || a.flying !== b.flying) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        // los edificios no se mueven: empujan, pero no los empujan
        if (a.building && b.building) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = min - d;
        const wa = a.building ? 0 : b.building ? 1 : b.mass / (a.mass + b.mass),
          wb = 1 - wa;
        const nx = d2 ? dx / d : this.rng.next() - 0.5,
          ny = d2 ? dy / d : this.rng.next() - 0.5;
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * wb;
        b.y += ny * push * wb;
      }
      if (!a.flying) {
        for (const t of this.towers) {
          if (!t.alive) continue;
          const dx = a.x - t.x,
            dy = a.y - t.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const min = a.radius + t.radius;
          if (d < min) {
            a.x = t.x + (dx / d) * min;
            a.y = t.y + (dy / d) * min;
          }
        }
        this.keepOnGround(a);
      }
      a.x = clamp(a.x, 12, W - 12);
      a.y = clamp(a.y, ARENA.top + 10, ARENA.bottom - 8);
    }
  }

  // ───────────────────────── Flujo de partida ─────────────────────────

  private onTowerDestroyed(t: SimTower): void {
    if (this.over) return;
    const winner = other(t.team);
    if (t.kind === 'king') {
      this.crowns[winner] = 3;
      this.emit({ e: 'crown', team: winner, crowns: 3 });
      this.end(winner, 'king');
      return;
    }
    this.crowns[winner] += 1;
    this.emit({ e: 'crown', team: winner, crowns: this.crowns[winner] });
    this.activateKing(this.towersBy[t.team].king);
    if (this.overtime) this.end(winner, 'overtime');
  }

  private onTimeUp(): void {
    const { blue, red } = this.crowns;
    if (blue !== red) {
      this.end(blue > red ? 'blue' : 'red', 'time');
      return;
    }
    if (!this.overtime && RULES.overtime > 0) {
      this.overtime = true;
      this.ticksLeft = ticks(RULES.overtime, TICK_RATE);
      this.emit({ e: 'overtime' });
      return;
    }
    const minHp = (team: Team) => {
      let m = Infinity;
      for (const t of this.towers) if (t.team === team && t.alive) m = Math.min(m, t.hp / t.maxHp);
      return m;
    };
    const b = minHp('blue'),
      r = minHp('red');
    this.end(Math.abs(b - r) < 0.001 ? 'draw' : b > r ? 'blue' : 'red', 'tiebreak');
  }

  private end(winner: Winner, reason: Extract<SimEvent, { e: 'end' }>['reason']): void {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.emit({ e: 'end', winner, reason });
  }

  private emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  /** Busca una tropa o torre por id (para el renderizador). */
  body(id: number): Body | undefined {
    return this.units.find((u) => u.id === id) ?? this.towers.find((t) => t.id === id);
  }
}
