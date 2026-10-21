import {
  W, H, T, ARENA, TOWER_LAYOUT, RULES, COLORS, SIGHT, ARENAS, AI_BY_ARENA, BALLS, CROWNS_FOR_CROWN_BALL,
} from '../config.js';
import { getCard, cardAtLevel } from '../data/cards.js';
import { typeMultiplier } from '../data/typeChart.js';
import { meta, palette, moveKey, queueBattle, createAnims, guardianNeeds } from '../systems/Assets.js';
import { CardCycle } from '../systems/CardCycle.js';
import { EnemyAI } from '../systems/EnemyAI.js';
import { Sfx, Music } from '../systems/Sfx.js';
import { Profile } from '../meta/Profile.js';
import { makeOpponent } from '../meta/Opponent.js';
import { Unit } from '../entities/Unit.js';
import { Tower } from '../entities/Tower.js';
import { Projectile } from '../entities/Projectile.js';
import { Hand } from '../ui/Hand.js';
import { txt, button, drawCrown, levelBadge, fmtNum } from '../ui/style.js';
import { openModal } from '../ui/Modal.js';
import { onMatchEnd } from '../net/rewards.js';

const other = (team) => (team === 'player' ? 'enemy' : 'player');
const FLAG = { x: W - 34, y: 104, r: 24 };

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init() {
    this.opp = makeOpponent(Profile);
    this.arenaIdx = Profile.arena;
    this.theme = ARENAS[this.arenaIdx];
    this.decks = { player: [...Profile.deck], enemy: this.opp.deck };
    this.levels = {
      player: Object.fromEntries(this.decks.player.map((k) => [k, Profile.level(k)])),
      enemy: this.opp.levels,
    };
    this.kingLevels = { player: Profile.d.kingLevel, enemy: this.opp.kingLevel };
    this.cardCache = { player: {}, enemy: {} };
  }

  preload() {
    this.cameras.main.setBackgroundColor('#0d1024');
    const t = txt(this, W / 2, H / 2 - 40, 'Preparando la arena…', 30);
    const bar = this.add.graphics();
    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(COLORS.panel).fillRoundedRect(W / 2 - 220, H / 2, 440, 26, 10);
      bar.fillStyle(COLORS.elixir).fillRoundedRect(W / 2 - 220, H / 2, Math.max(16, 440 * v), 26, 10);
    });
    this.load.once('complete', () => { t.destroy(); bar.destroy(); });
    const g = guardianNeeds();
    const cards = [...this.decks.player, ...this.decks.enemy].map(getCard);
    this.needIds = [...new Set([...g.ids, ...cards.map((c) => c.pokemon)])];
    queueBattle(this, this.needIds, [...new Set([...g.moves, ...cards.map((c) => c.move)])]);
  }

  get riverTop() { return ARENA.riverY - ARENA.riverHalf; }
  get riverBot() { return ARENA.riverY + ARENA.riverHalf; }

  cardFor(team, key) {
    if (!this.cardCache[team][key]) this.cardCache[team][key] = cardAtLevel(key, this.levels[team][key]);
    return this.cardCache[team][key];
  }

  create() {
    createAnims(this, this.needIds);
    this.meta = meta();
    this.modalOpen = 0;
    this.units = [];
    this.towers = [];
    this.projectiles = [];
    this.elixir = { player: RULES.elixirStart, enemy: RULES.elixirStart };
    this.crowns = { player: 0, enemy: 0 };
    this.timeLeft = RULES.matchTime;
    this.elapsed = 0;
    this.overtime = false;
    this.doubleAnnounced = false;
    this.ended = false;
    this.started = false;
    this.timeScale = 1;
    this.toasts = new Map();
    this.lastCount = 99;
    this.bubbles = {};

    this.drawArena();
    this.spawnTowers();
    this.overlay = this.add.graphics().setDepth(5).setVisible(false);
    this.createHud();

    this.playerCycle = new CardCycle(this.decks.player);
    this.hand = new Hand(this, this.playerCycle, this.levels.player);
    this.ai = new EnemyAI(this, this.decks.enemy, AI_BY_ARENA(this.arenaIdx));
    this.hand.update();
    this.updateHud();
    Music.stop();
    this.intro();
    window.__battle = this;
  }

  sfx(name) { Sfx.play(name); }

  // ───────────────────────── Arena ─────────────────────────

  drawArena() {
    const th = this.theme;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(th.edge).fillRect(0, 0, W, H);
    for (let y = ARENA.top; y < ARENA.bottom; y += T) {
      for (let x = 0; x < W; x += T) {
        g.fillStyle(((x / T + (y - ARENA.top) / T) | 0) % 2 ? th.grass[0] : th.grass[1]);
        g.fillRect(x, y, T, Math.min(T, ARENA.bottom - y));
      }
    }
    g.fillStyle(0x000000, 0.18).fillRect(0, ARENA.top, 12, ARENA.bottom - ARENA.top).fillRect(W - 12, ARENA.top, 12, ARENA.bottom - ARENA.top);
    // caminos
    g.fillStyle(0xffffff, 0.1);
    for (const bx of ARENA.bridges) g.fillRect(bx - 22, ARENA.top + 150, 44, ARENA.bottom - ARENA.top - 300);
    g.fillRect(W / 2 - 60, ARENA.top + 20, 120, 150).fillRect(W / 2 - 60, ARENA.bottom - 170, 120, 150);
    // río
    g.fillStyle(Phaser.Display.Color.ValueToColor(th.river).darken(25).color).fillRect(0, this.riverTop - 5, W, ARENA.riverHalf * 2 + 10);
    g.fillStyle(th.river).fillRect(0, this.riverTop, W, ARENA.riverHalf * 2);
    this.waves = this.add.graphics().setDepth(1);
    // puentes
    const b = this.add.graphics().setDepth(2);
    for (const bx of ARENA.bridges) {
      const x0 = bx - ARENA.bridgeHalf, y0 = this.riverTop - 12, h = ARENA.riverHalf * 2 + 24;
      b.fillStyle(COLORS.panelDark, 0.35).fillRect(x0 + 4, y0 + 6, ARENA.bridgeHalf * 2, h);
      b.fillStyle(COLORS.bridge).fillRect(x0, y0, ARENA.bridgeHalf * 2, h);
      b.lineStyle(2, COLORS.bridgeDark, 1);
      for (let x = x0 + 10; x < bx + ARENA.bridgeHalf; x += 10) b.lineBetween(x, y0, x, y0 + h);
      b.fillStyle(COLORS.bridgeDark).fillRect(x0 - 4, y0, ARENA.bridgeHalf * 2 + 8, 6).fillRect(x0 - 4, y0 + h - 6, ARENA.bridgeHalf * 2 + 8, 6);
    }
    // decoración
    for (const [x, y] of [[26, 190], [694, 190], [26, 420], [694, 420], [26, 720], [694, 720], [26, 980], [694, 980], [250, 92], [470, 92]]) {
      this.add.image(x, y, `deco_${th.deco}`).setScale(0.75).setOrigin(0.5, 0.9).setDepth(y - 5);
    }
  }

  drawWaves() {
    const g = this.waves;
    g.clear();
    const off = (this.elapsed * 30) % 48;
    g.lineStyle(3, this.theme.riverLight, 0.6);
    for (let x = -48 + off; x < W; x += 48) g.lineBetween(x, ARENA.riverY - 7, x + 18, ARENA.riverY - 7);
    for (let x = -24 - off; x < W + 48; x += 48) g.lineBetween(x, ARENA.riverY + 8, x + 18, ARENA.riverY + 8);
  }

  spawnTowers() {
    const L = TOWER_LAYOUT;
    this.towersBy = { player: {}, enemy: {} };
    const add = (team, kind, side, x, y) => {
      const t = new Tower(this, team, kind, x, y, this.kingLevels[team]);
      this.towers.push(t);
      this.towersBy[team][side] = t;
    };
    add('enemy', 'king', 'king', L.kingX, ARENA.top + L.kingOffset);
    add('enemy', 'princess', 'left', L.princessX[0], ARENA.top + L.princessOffset);
    add('enemy', 'princess', 'right', L.princessX[1], ARENA.top + L.princessOffset);
    add('player', 'king', 'king', L.kingX, ARENA.bottom - L.kingOffset);
    add('player', 'princess', 'left', L.princessX[0], ARENA.bottom - L.princessOffset);
    add('player', 'princess', 'right', L.princessX[1], ARENA.bottom - L.princessOffset);
  }

  // ───────────────────────── HUD ─────────────────────────

  createHud() {
    const g = this.add.graphics().setDepth(5000);
    g.fillStyle(COLORS.hud).fillRect(0, 0, W, ARENA.top);
    g.fillStyle(COLORS.panelDark).fillRect(0, ARENA.top - 4, W, 4);
    this.crownG = this.add.graphics().setDepth(5001);
    txt(this, 20, 22, this.opp.name, 20, '#ff9a9a', { originX: 0 }).setDepth(5001);
    txt(this, W - 20, 22, Profile.d.name, 20, '#9fd0ff', { originX: 1 }).setDepth(5001);
    g.fillStyle(COLORS.panelDark).fillRoundedRect(W / 2 - 70, 8, 140, 54, 12);
    this.timerT = txt(this, W / 2, 30, '3:00', 30).setDepth(5001);
    this.timerSub = txt(this, W / 2, 54, 'Tiempo', 14, '#c9c3ff').setDepth(5001);
    // botón de rendirse
    const fg = this.add.graphics().setDepth(5001);
    fg.fillStyle(COLORS.panelDark, 0.75).fillCircle(FLAG.x, FLAG.y, FLAG.r);
    this.add.image(FLAG.x + 2, FLAG.y, 'ic_flag').setDisplaySize(30, 30).setDepth(5002);
  }

  uiHit(p) {
    if (Math.hypot(p.x - FLAG.x, p.y - FLAG.y) <= FLAG.r + 6) {
      this.confirmSurrender();
      return true;
    }
    return false;
  }

  confirmSurrender() {
    if (this.ended || this.modalOpen) return;
    openModal(this, 560, 400, '¿Rendirse?', (box, close) => {
      box.add(txt(this, 0, -30, 'Perderás la partida y los trofeos.', 26));
      box.add(button(this, -125, 100, 220, 84, 'Seguir', COLORS.blue, close, 28));
      box.add(button(this, 125, 100, 220, 84, 'Rendirse', COLORS.red, () => {
        close();
        this.crowns.enemy = 3;
        this.endMatch('enemy');
      }, 28));
    });
  }

  updateHud() {
    const t = Math.max(0, Math.ceil(this.timeLeft));
    this.timerT.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    const dbl = this.overtime || this.timeLeft <= RULES.doubleElixirAt;
    this.timerSub.setText(this.overtime ? 'Muerte súbita' : dbl ? 'Elixir x2' : 'Tiempo');
    this.timerSub.setColor(dbl ? '#ff8af0' : '#c9c3ff');
    this.timerT.setColor(t <= 10 ? '#ff6a6a' : '#ffffff');
    if (t <= 10 && t < this.lastCount && t > 0) { this.lastCount = t; Sfx.play('countdown'); }
    const g = this.crownG;
    g.clear();
    for (let i = 0; i < 3; i++) {
      drawCrown(g, 32 + i * 34, 52, 12, i < this.crowns.enemy ? COLORS.enemy : 0x3b3f63);
      drawCrown(g, W - 32 - i * 34, 52, 12, i < this.crowns.player ? COLORS.player : 0x3b3f63);
    }
  }

  toast(msg, color = 0xffffff, y = ARENA.riverY - 90) {
    if (this.toasts.has(msg)) return;
    const t = txt(this, W / 2, y, msg, 34, `#${color.toString(16).padStart(6, '0')}`).setDepth(6000).setScale(0.5);
    this.toasts.set(msg, t);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t, y: y - 40, alpha: 0, delay: 1100, duration: 500,
      onComplete: () => { t.destroy(); this.toasts.delete(msg); },
    });
  }

  emote(team, text) {
    this.bubbles[team]?.destroy();
    const x = team === 'player' ? 210 : 510, y = team === 'player' ? 930 : 200;
    const c = this.add.container(x, y).setDepth(6500);
    const g = this.add.graphics();
    const w = Math.max(150, text.length * 14 + 40);
    g.fillStyle(COLORS.panelDark).fillRoundedRect(-w / 2 - 3, -33, w + 6, 66, 18);
    g.fillStyle(0xffffff).fillRoundedRect(-w / 2, -30, w, 60, 16);
    g.fillStyle(0xffffff).fillTriangle(team === 'player' ? 30 : -30, 26, team === 'player' ? 60 : -60, 26, team === 'player' ? 70 : -70, 46);
    c.add(g);
    c.add(txt(this, 0, 0, text, 22, team === 'player' ? '#1f56c4' : '#c8303a', { strokeThickness: 0 }));
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2200, duration: 300, onComplete: () => c.destroy() });
    this.bubbles[team] = c;
    Sfx.play('emote');
  }

  damageNumber(x, y, amount, mult = 1) {
    if (amount < 1) return;
    const big = mult > 1;
    const t = txt(this, x + Phaser.Math.Between(-8, 8), y, String(Math.round(amount)), big ? 24 : 18,
      big ? '#ffd84a' : mult < 1 ? '#b7bed6' : '#ffffff').setDepth(4600);
    this.tweens.add({ targets: t, y: y - 32, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  // ───────────────────────── Intro VS ─────────────────────────

  intro() {
    const c = this.add.container(0, 0).setDepth(9500);
    const top = this.add.container(-W, 0), bot = this.add.container(W, 0);
    const tg = this.add.graphics();
    tg.fillStyle(0xc8303a).fillRect(0, 280, W, 300);
    tg.fillStyle(0x000000, 0.2).fillRect(0, 280, W, 12);
    top.add(tg);
    levelBadge(this, 110, 430, this.opp.kingLevel, 38).forEach((o) => top.add(o));
    top.add(txt(this, 180, 400, this.opp.name, 44, '#ffffff', { originX: 0 }));
    top.add(this.add.image(196, 460, 'ic_trophy').setDisplaySize(40, 40));
    top.add(txt(this, 226, 460, String(this.opp.trophies), 28, '#ffd84a', { originX: 0 }));
    const bg = this.add.graphics();
    bg.fillStyle(0x1f56c4).fillRect(0, 700, W, 300);
    bg.fillStyle(0x000000, 0.2).fillRect(0, 700, W, 12);
    bot.add(bg);
    levelBadge(this, 110, 850, Profile.d.kingLevel, 38).forEach((o) => bot.add(o));
    bot.add(txt(this, 180, 820, Profile.d.name, 44, '#ffffff', { originX: 0 }));
    bot.add(this.add.image(196, 880, 'ic_trophy').setDisplaySize(40, 40));
    bot.add(txt(this, 226, 880, String(Profile.d.trophies), 28, '#ffd84a', { originX: 0 }));
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.6);
    const vs = txt(this, W / 2, 640, 'VS', 120, '#ffd84a').setScale(0);
    c.add([dim, top, bot, vs]);
    this.tweens.add({ targets: [top, bot], x: 0, duration: 380, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: vs, scale: 1, delay: 300, duration: 300, ease: 'Back.easeOut', onStart: () => Sfx.play('boom') });
    this.time.delayedCall(1900, () => {
      this.tweens.add({ targets: top, x: -W, duration: 300, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: bot, x: W, duration: 300, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: [vs, dim], alpha: 0, duration: 300, onComplete: () => c.destroy() });
      this.time.delayedCall(250, () => {
        this.started = true;
        Sfx.play('fight');
        Music.play('battle');
        this.toast('¡A luchar!', 0xffd84a, ARENA.riverY);
        this.time.delayedCall(1500, () => this.ai.maybeEmote('start'));
      });
    });
  }

  // ───────────────────────── Despliegue ─────────────────────────

  formation(count) {
    if (count <= 1) return [[0, 0]];
    const r = 0.55 * T;
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  }

  inPocket(team, x, y) {
    const opp = other(team);
    const side = x < W / 2 ? 'left' : 'right';
    if (this.towersBy[opp][side].alive) return false;
    if (Math.abs(x - W / 2) < 10) return false;
    const py = this.towersBy[opp][side].y;
    return team === 'player'
      ? y >= py + 30 && y <= this.riverTop - 8
      : y <= py - 30 && y >= this.riverBot + 8;
  }

  canDeploy(team, card, x, y) {
    if (x < 14 || x > W - 14 || y < ARENA.top + 14 || y > ARENA.bottom - 10) return false;
    if (card.type === 'spell') return true;
    for (const t of this.towers) if (t.alive && Math.hypot(t.x - x, t.y - y) < t.radius + 12) return false;
    if (team === 'player' ? y >= this.riverBot + 8 : y <= this.riverTop - 8) return true;
    return this.inPocket(team, x, y);
  }

  showDeployOverlay(card) {
    const g = this.overlay;
    g.clear();
    if (card.type === 'spell') { g.setVisible(false); return; }
    g.fillStyle(0xff3030, 0.22);
    for (const side of ['left', 'right']) {
      const x0 = side === 'left' ? 0 : W / 2;
      const open = !this.towersBy.enemy[side].alive;
      const yEnd = open ? this.towersBy.enemy[side].y + 30 : this.riverBot + 8;
      g.fillRect(x0, ARENA.top, W / 2, yEnd - ARENA.top);
    }
    g.lineStyle(3, 0xffffff, 0.5).lineBetween(0, this.riverBot + 8, W, this.riverBot + 8);
    g.setVisible(true);
  }

  hideDeployOverlay() { this.overlay.setVisible(false); }

  tryDeploy(team, cycle, i, x, y) {
    if (this.ended || !this.started || i < 0) return false;
    const key = cycle.hand[i];
    const card = getCard(key);
    if (this.elixir[team] < card.cost) {
      if (team === 'player') { this.toast('¡Te falta elixir!', 0xff8af0); this.hand.flashElixir(); }
      return false;
    }
    if (!this.canDeploy(team, card, x, y)) {
      if (team === 'player') { this.toast('No puedes desplegar ahí', 0xff9a9a); Sfx.play('noElixir'); }
      return false;
    }
    this.elixir[team] -= card.cost;
    cycle.play(i);
    this.deploy(team, key, x, y);
    return true;
  }

  deploy(team, key, x, y) {
    const card = this.cardFor(team, key);
    if (card.type === 'spell') { this.castSpell(team, card, x, y); return; }
    for (const [dx, dy] of this.formation(card.count)) {
      const u = new Unit(this, card, team, x + dx, y + dy);
      if (!card.flying) this.keepOnGround(u);
      this.units.push(u);
    }
    this.time.delayedCall(200, () => { this.ringFx(x, y, 0.9 * T, COLORS[team]); if (team === 'player') Sfx.play('deploy'); });
  }

  // ───────────────────────── Combate ─────────────────────────

  castAnim(kind) { return this.meta.system_specification?.cast_animation_rules?.mapping?.[kind]; }

  findTarget(u) {
    let best = null, bd = Infinity;
    if (u.card.targets !== 'buildings') {
      for (const e of this.units) {
        if (e.team === u.team || !e.alive) continue;
        if (u.card.targets === 'ground' && e.flying) continue;
        const d = u.edgeDist(e);
        if (d < SIGHT && d < bd) { bd = d; best = e; }
      }
    }
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive) continue;
      const d = u.edgeDist(t);
      if (d < SIGHT && d < bd) { bd = d; best = t; }
    }
    return best || this.laneTower(u);
  }

  laneTower(u) {
    const ts = this.towersBy[other(u.team)];
    const p = u.x < W / 2 ? ts.left : ts.right;
    return p.alive ? p : ts.king.alive ? ts.king : null;
  }

  findTowerTarget(tower) {
    let best = null, bd = Infinity;
    for (const u of this.units) {
      if (u.team === tower.team || !u.alive) continue;
      const d = tower.dist(u);
      if (d <= tower.range && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  pathPoint(u, tx, ty) {
    if (u.flying) return [tx, ty];
    const rTop = this.riverTop, rBot = this.riverBot;
    const inRiver = u.y > rTop - 4 && u.y < rBot + 4;
    const uSide = u.y < ARENA.riverY ? -1 : 1;
    const tSide = ty < ARENA.riverY ? -1 : 1;
    if (uSide === tSide && !inRiver) return [tx, ty];
    const bx = ARENA.bridges.reduce((best, b) =>
      Math.abs(u.x - b) + Math.abs(tx - b) < Math.abs(u.x - best) + Math.abs(tx - best) ? b : best);
    const startBank = tSide < 0 ? rBot + 6 : rTop - 6;
    const destBank = tSide < 0 ? rTop - 8 : rBot + 8;
    const tol = Math.max(4, ARENA.bridgeHalf - u.radius - 2);
    if (!inRiver && Math.abs(u.x - bx) > tol) return [bx, startBank];
    return [bx, destBank];
  }

  applyDamage(src, primary, x, y) {
    const isTower = !!src.isTower;
    const base = isTower ? src.dmg : src.card.dmg;
    const moveType = isTower ? src.moveData?.type : src.card.moveType;
    const ms = isTower ? {} : src.card.moveStats;
    const splash = isTower ? 0 : src.card.splash;
    const groundOnly = !isTower && src.card.targets === 'ground';

    const hitOne = (t) => {
      const mult = typeMultiplier(moveType, t.types);
      t.takeDamage(base * mult, mult);
      if (t.isUnit && t.alive) {
        if (ms.burn) { t.burnT = 3; t.burnDps = base * 0.06; }
        if (ms.slow) { t.slowT = 2; t.slowAmt = Math.min(0.5, ms.slow * 0.6); }
      }
    };

    if (splash > 0) {
      for (const e of this.units) {
        if (e.team === src.team || !e.alive || (groundOnly && e.flying)) continue;
        if (Math.hypot(e.x - x, e.y - y) <= splash + e.radius) hitOne(e);
      }
      for (const t of this.towers) {
        if (t.team !== src.team && t.alive && Math.hypot(t.x - x, t.y - y) <= splash + t.radius) hitOne(t);
      }
      this.ringFx(x, y, splash, palette(isTower ? 'normal' : src.card.palette)[2]);
    } else if (primary && primary.alive) {
      hitOne(primary);
    }
  }

  hit(src, target, x, y) {
    this.impactFx(x, y - 12, src.card.palette);
    Sfx.play('hit');
    this.applyDamage(src, target, x, y);
  }

  shoot(src, target, x, y) {
    const move = src.isTower ? src.move : src.card.move;
    const pal = src.isTower ? (src.moveData?.vfx?.palette || 'normal') : src.card.palette;
    Sfx.play('shoot');
    this.projectiles.push(new Projectile(this, src, target, x, y, move, (hitTarget, hx, hy) => {
      this.impactFx(hx, hy, pal, 2);
      if (!src.isTower && src.card.splash > 0) this.applyDamage(src, hitTarget, hx, hy + 12);
      else if (hitTarget) this.applyDamage(src, hitTarget, hx, hy);
    }, palette(pal)[3]));
  }

  castSpell(team, card, x, y) {
    const key = this.textures.exists(moveKey(card.move)) ? moveKey(card.move) : 'fx_impact';
    const pal = palette(card.palette);
    const marker = this.add.graphics().setDepth(6);
    marker.fillStyle(pal[2], 0.25).fillCircle(x, y, card.radiusSpell);
    marker.lineStyle(3, pal[3], 0.9).strokeCircle(x, y, card.radiusSpell);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * card.radiusSpell * 0.6;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const s = this.add.image(px, py - 320, key).setScale(4).setDepth(3500).setRotation(Math.PI / 2);
      this.tweens.add({
        targets: s, y: py, delay: i * 60, duration: 380, ease: 'Quad.easeIn',
        onComplete: () => { this.impactFx(px, py, card.palette, 3); s.destroy(); },
      });
    }
    this.time.delayedCall(560, () => {
      marker.destroy();
      Sfx.play('boom');
      this.cameras.main.shake(180, 0.007);
      this.ringFx(x, y, card.radiusSpell, pal[3]);
      const ms = card.moveStats || {};
      for (const u of this.units) {
        if (u.team === team || !u.alive) continue;
        if (Math.hypot(u.x - x, u.y - y) <= card.radiusSpell + u.radius) {
          const m = typeMultiplier(card.moveType, u.types);
          u.takeDamage(card.dmg * m, m);
          if (u.alive && ms.slow) { u.slowT = 2.5; u.slowAmt = 0.4; }
          if (u.alive && ms.burn) { u.burnT = 3; u.burnDps = card.dmg * 0.05; }
        }
      }
      for (const t of this.towers) {
        if (t.team !== team && t.alive && Math.hypot(t.x - x, t.y - y) <= card.radiusSpell + t.radius) {
          t.takeDamage(card.dmg * card.towerDmg, 1);
        }
      }
    });
  }

  impactFx(x, y, pal = 'normal', scale = 3) {
    if (!this.textures.exists('fx_impact')) return;
    const s = this.add.sprite(x, y, 'fx_impact').setScale(scale).setDepth(3200).setTint(palette(pal)[3]);
    s.play('fx_impact');
    s.once('animationcomplete', () => s.destroy());
  }

  ringFx(x, y, r, color) {
    const g = this.add.graphics({ x, y }).setDepth(3100);
    g.fillStyle(color, 0.25).fillCircle(0, 0, r);
    g.lineStyle(4, color, 0.9).strokeCircle(0, 0, r);
    g.setScale(0.6);
    this.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 350, onComplete: () => g.destroy() });
  }

  // ───────────────────────── Física simple ─────────────────────────

  keepOnGround(u) {
    const rTop = this.riverTop, rBot = this.riverBot;
    if (u.y > rTop - 2 && u.y < rBot + 2) {
      const bx = ARENA.bridges.reduce((a, b) => (Math.abs(u.x - b) < Math.abs(u.x - a) ? b : a));
      if (Math.abs(u.x - bx) < ARENA.bridgeHalf + 8) {
        const lim = Math.max(2, ARENA.bridgeHalf - u.radius);
        u.x = Phaser.Math.Clamp(u.x, bx - lim, bx + lim);
      } else {
        u.y = u.y < ARENA.riverY ? rTop - 2 : rBot + 2;
      }
    }
  }

  resolveCollisions() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (!b.alive || a.flying !== b.flying) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d);
        const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
        const nx = d2 ? dx / d : Math.random() - 0.5, ny = d2 ? dy / d : Math.random() - 0.5;
        a.x -= nx * push * wa; a.y -= ny * push * wa;
        b.x += nx * push * wb; b.y += ny * push * wb;
      }
      if (!a.flying) {
        for (const t of this.towers) {
          if (!t.alive) continue;
          const dx = a.x - t.x, dy = a.y - t.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.radius + t.radius;
          if (d < min) { a.x = t.x + (dx / d) * min; a.y = t.y + (dy / d) * min; }
        }
        this.keepOnGround(a);
      }
      a.x = Phaser.Math.Clamp(a.x, 12, W - 12);
      a.y = Phaser.Math.Clamp(a.y, ARENA.top + 10, ARENA.bottom - 8);
    }
  }

  // ───────────────────────── Flujo de partida ─────────────────────────

  onTowerDestroyed(t) {
    const winner = other(t.team);
    if (winner === 'player') Sfx.play('crown');
    this.ai.maybeEmote(winner === 'enemy' ? 'good' : 'bad');
    if (t.kind === 'king') {
      this.crowns[winner] = 3;
      this.updateHud();
      this.ended = true;
      this.time.delayedCall(1200, () => this.endMatch(winner));
      return;
    }
    this.crowns[winner] += 1;
    this.towersBy[t.team].king.activate();
    this.toast(winner === 'player' ? '¡Corona para ti!' : 'El rival gana una corona', COLORS[winner]);
    if (this.overtime) { this.ended = true; this.time.delayedCall(1000, () => this.endMatch(winner)); }
  }

  onTimeUp() {
    const { player, enemy } = this.crowns;
    if (player !== enemy) return this.endMatch(player > enemy ? 'player' : 'enemy');
    if (!this.overtime && RULES.overtime > 0) {
      this.overtime = true;
      this.timeLeft = RULES.overtime;
      this.lastCount = 99;
      this.toast('¡Tiempo extra! Muerte súbita', 0xffd84a);
      return;
    }
    const minHp = (team) => Math.min(...this.towers.filter((t) => t.team === team && t.alive).map((t) => t.hp / t.maxHp));
    const p = minHp('player'), e = minHp('enemy');
    this.endMatch(Math.abs(p - e) < 0.001 ? 'draw' : p > e ? 'player' : 'enemy');
  }

  endMatch(winner) {
    if (this.resultShown) return;
    this.resultShown = true;
    this.ended = true;
    this.hand.hideGhost();
    Music.stop();
    Sfx.play(winner === 'player' ? 'win' : 'lose');
    const res = Profile.applyBattle(winner, this.crowns);
    onMatchEnd({ winner, crowns: { ...this.crowns }, duration: Math.round(this.elapsed), deck: [...this.decks.player], opponent: this.opp.name, result: res });

    const c = this.add.container(0, 0).setDepth(9000);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.78).fillRect(0, 0, W, H);
    c.add(g);
    const title = winner === 'player' ? '¡VICTORIA!' : winner === 'enemy' ? 'DERROTA' : 'EMPATE';
    const color = winner === 'player' ? '#ffd84a' : winner === 'enemy' ? '#ff9a9a' : '#ffffff';
    const tt = txt(this, W / 2, 200, title, 84, color).setScale(0);
    c.add(tt);
    this.tweens.add({ targets: tt, scale: 1, duration: 400, ease: 'Back.easeOut' });

    // marcador de coronas
    const pg = this.add.graphics();
    pg.fillStyle(0xc8303a, 0.9).fillRoundedRect(40, 290, W - 80, 120, 20);
    pg.fillStyle(0x1f56c4, 0.9).fillRoundedRect(40, 420, W - 80, 120, 20);
    c.add(pg);
    c.add(txt(this, 70, 350, this.opp.name, 30, '#ffffff', { originX: 0 }));
    c.add(txt(this, 70, 480, Profile.d.name, 30, '#ffffff', { originX: 0 }));
    const cg = this.add.graphics();
    for (let i = 0; i < 3; i++) {
      drawCrown(cg, 530 + i * 48, 350, 18, i < this.crowns.enemy ? 0xffc21a : 0x3b3f63);
      drawCrown(cg, 530 + i * 48, 480, 18, i < this.crowns.player ? 0xffc21a : 0x3b3f63);
    }
    c.add(cg);

    // recompensas
    let y = 620;
    const row = (icon, label, value, col) => {
      const rg = this.add.graphics();
      rg.fillStyle(COLORS.panel).fillRoundedRect(80, y - 40, W - 160, 80, 18);
      c.add(rg);
      c.add(this.add.image(140, y, icon).setDisplaySize(54, 54));
      c.add(txt(this, 190, y, label, 26, '#c9c3ff', { originX: 0 }));
      const vt = txt(this, W - 110, y, value, 34, col, { originX: 1 });
      c.add(vt);
      y += 100;
      return vt;
    };
    const tv = row('ic_trophy', 'Trofeos', `${res.trophies >= 0 ? '+' : ''}${res.trophies}`, res.trophies >= 0 ? '#ffd84a' : '#ff9a9a');
    tv.setScale(0);
    this.tweens.add({ targets: tv, scale: 1, delay: 500, duration: 300, ease: 'Back.easeOut' });
    if (res.gold) row('ic_gold', 'Oro', `+${fmtNum(res.gold)}`, '#ffd84a');
    row('ic_crown', 'Coronas para la Ball corona', `${Profile.d.crowns}/${CROWNS_FOR_CROWN_BALL}`, '#ffffff');
    if (winner === 'player') {
      if (res.ball) row(`ball_${res.ball}`, '¡Pokéball ganada!', BALLS[res.ball].label, '#7dff8a');
      else row('ic_lock', 'Huecos de Pokéball llenos', '—', '#9aa0c8');
    }
    if (res.arenaUp) {
      const at = txt(this, W / 2, y + 10, `¡Nueva arena: ${ARENAS[Profile.arena].name}!`, 34, '#7dff8a');
      c.add(at);
      this.tweens.add({ targets: at, scale: 1.1, yoyo: true, repeat: -1, duration: 500 });
      y += 70;
    }
    if (res.kingLevelUp) { c.add(txt(this, W / 2, y + 10, `¡Nivel de rey ${Profile.d.kingLevel}!`, 30, '#ffd84a')); y += 60; }
    c.add(button(this, W / 2, Math.min(1190, y + 80), 320, 100, 'OK', COLORS.green, () => this.scene.start('Lobby', { tab: 'battle' }), 44));
  }

  update(_time, delta) {
    this.elapsed += delta / 1000;
    this.drawWaves();
    if (this.ended || !this.started) return;
    const dt = Math.min(delta, 50) / 1000 * this.timeScale;

    this.timeLeft -= dt;
    const dbl = this.overtime || this.timeLeft <= RULES.doubleElixirAt;
    if (dbl && !this.doubleAnnounced) { this.doubleAnnounced = true; this.toast('¡Elixir x2!', 0xff8af0); }
    const regen = (dt / RULES.elixirRegen) * (dbl ? 2 : 1);
    for (const team of ['player', 'enemy']) this.elixir[team] = Math.min(RULES.elixirMax, this.elixir[team] + regen);

    this.ai.update(dt);
    for (const u of this.units) u.update(dt);
    for (const t of this.towers) t.update(dt);
    for (const p of this.projectiles) p.update(dt);
    this.resolveCollisions();
    for (const u of this.units) if (u.alive) u.sync(0);

    this.units = this.units.filter((u) => u.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    this.hand.update();
    this.updateHud();
    if (this.timeLeft <= 0 && !this.ended) this.onTimeUp();
  }
}
