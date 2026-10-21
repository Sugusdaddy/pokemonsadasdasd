import Phaser from 'phaser';
import {
  W,
  H,
  T,
  ARENA,
  RULES,
  COLORS,
  ARENAS,
  BALLS,
  CROWNS_FOR_CROWN_BALL,
  TOWER_GUARDIANS,
  EMOTES,
  makeOpponent,
  randomSeed,
  getCard,
  other,
  type ArenaTheme,
  type Card,
  type Match,
  type PlayerInfo,
  type Replay,
  type SimEvent,
  type Team,
  type Winner,
} from '@arena/shared';
import { createAnims, palette, queueBattle, moveFrame } from '../systems/Assets';
import { Sfx, Music } from '../systems/Sfx';
import { Profile, type BattleOutcome } from '../meta/Profile';
import { Hand } from '../ui/Hand';
import { txt, button, drawCrown, levelBadge, fmtNum, cssColor } from '../ui/style';
import { openModal } from '../ui/Modal';
import { onMatchEnd } from '../net/rewards';
import type { OnlineSession } from '../net/OnlineSession';
import { FxPools } from '../battle/Pools';
import { UnitView } from '../battle/UnitView';
import { TowerView } from '../battle/TowerView';
import { ProjectileView } from '../battle/ProjectileView';
import { View } from '../battle/View';
import { LocalSource, OnlineSource, ReplaySource, type BattleSource } from '../battle/sources';
import { BaseScene } from './BaseScene';

const FLAG = { x: W - 34, y: 104, r: 24 };
const RIVER_TOP = ARENA.riverY - ARENA.riverHalf;
const RIVER_BOT = ARENA.riverY + ARENA.riverHalf;
export const LAST_REPLAY_KEY = 'arenaRoyale.lastReplay';

export type BattleData =
  | { kind: 'local' }
  | { kind: 'online'; session: OnlineSession }
  | { kind: 'replay'; replay: Replay; players: Record<Team, PlayerInfo>; back?: string };

/**
 * La partida en pantalla. Toda la lógica vive en /shared/sim (Match): esta escena
 * pide los ticks a una fuente (local contra bot, online, espectador o repetición),
 * dibuja interpolando entre ticks y convierte los eventos en efectos y sonidos.
 */
export class BattleScene extends BaseScene {
  source!: BattleSource;
  /** Equipo desde cuyo lado se ve el tablero (el mío o 'blue' si solo miro). */
  me: Team = 'blue';
  /** true si estoy jugando (no espectador ni repetición). */
  isPlayer = true;
  view = new View(false);
  private data_!: BattleData;
  private theme!: ArenaTheme;
  private started = false;
  private resultShown = false;
  private needIds: number[] = [];

  private fx!: FxPools;
  private units = new Map<number, UnitView>();
  private towers = new Map<number, TowerView>();
  private projectiles = new Map<number, ProjectileView>();
  private hand: Hand | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private waves!: Phaser.GameObjects.Graphics;
  private crownG!: Phaser.GameObjects.Graphics;
  private timerT!: Phaser.GameObjects.Text;
  private timerSub!: Phaser.GameObjects.Text;
  private netBanner: Phaser.GameObjects.Container | null = null;
  private toasts = new Map<string, Phaser.GameObjects.Text>();
  private bubbles: Partial<Record<Team, Phaser.GameObjects.Container>> = {};
  /** Cartas enviadas al servidor que aún no se han aplicado. */
  private pendingPlays = new Map<string, { marker: Phaser.GameObjects.Container; at: number }>();
  private lastCount = 99;
  private elapsed = 0;

  constructor() {
    super('Battle');
  }

  get match(): Match {
    return this.source.match;
  }

  init(data: BattleData): void {
    this.modalOpen = 0;
    this.data_ = data?.kind ? data : { kind: 'local' };
    const d = this.data_;
    if (d.kind === 'online') {
      this.source = new OnlineSource(d.session);
    } else if (d.kind === 'replay') {
      this.source = new ReplaySource(d.replay, d.players);
    } else {
      const opp = makeOpponent({
        arena: Profile.arena,
        trophies: Profile.d.trophies,
        kingLevel: Profile.d.kingLevel,
        avgDeckLevel: Profile.avgDeckLevel(),
      });
      const deck = [...Profile.deck];
      this.source = new LocalSource(
        {
          seed: randomSeed(),
          arena: Profile.arena,
          players: {
            blue: { deck, levels: Profile.levelsOf(deck), kingLevel: Profile.d.kingLevel },
            red: { deck: opp.deck, levels: opp.levels, kingLevel: opp.kingLevel },
          },
        },
        {
          blue: { name: Profile.d.name, trophies: Profile.d.trophies, kingLevel: Profile.d.kingLevel, bot: false },
          red: { name: opp.name, trophies: opp.trophies, kingLevel: opp.kingLevel, bot: true },
        },
      );
    }
    this.isPlayer = this.source.me !== null;
    this.me = this.source.me ?? 'blue';
    this.view = new View(this.me === 'red');
    this.theme = ARENAS[this.match.setup.arena] ?? ARENAS[0];
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#0d1024');
    const t = txt(this, W / 2, H / 2 - 40, 'Preparando la arena…', 30);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(COLORS.panel).fillRoundedRect(W / 2 - 220, H / 2, 440, 26, 10);
      bar.fillStyle(COLORS.elixir).fillRoundedRect(W / 2 - 220, H / 2, Math.max(16, 440 * v), 26, 10);
    });
    this.load.once('complete', () => {
      t.destroy();
      bar.destroy();
    });
    const ids = new Set<number>();
    for (const g of [...Object.values(TOWER_GUARDIANS.blue), ...Object.values(TOWER_GUARDIANS.red)]) ids.add(g.pokemon);
    const p = this.match.setup.players;
    for (const k of [...p.blue.deck, ...p.red.deck]) ids.add(getCard(k).pokemon);
    this.needIds = [...ids];
    queueBattle(this, this.needIds);
  }

  create(): void {
    createAnims(this, this.needIds);
    this.units.clear();
    this.towers.clear();
    this.projectiles.clear();
    this.toasts.clear();
    this.pendingPlays.clear();
    this.bubbles = {};
    this.started = false;
    this.resultShown = false;
    this.lastCount = 99;
    this.elapsed = 0;
    this.netBanner = null;
    this.hand = null;

    this.fx = new FxPools(this);
    this.drawArena();
    for (const t of this.match.towers) this.towers.set(t.id, new TowerView(this, t, t.team === this.me, this.view));
    this.overlay = this.add.graphics().setDepth(5).setVisible(false);
    this.createHud();
    if (this.isPlayer) {
      this.hand = new Hand(this, this.match.setup.players[this.me].levels);
      this.hand.update();
    } else {
      this.createWatchControls();
    }
    this.updateHud();
    Music.stop();
    this.bindSession();
    this.events.once('shutdown', () => this.source.dispose());

    const d = this.data_;
    // reconexión o espectador a mitad de partida: sin intro
    if (d.kind === 'online' && (d.session.start?.startsIn ?? 0) <= 0 && this.match.tick > 0) {
      this.rebuildViews();
      this.go();
    } else this.intro();
    (window as unknown as { __battle: BattleScene }).__battle = this;
  }

  private bindSession(): void {
    const d = this.data_;
    if (d.kind !== 'online') return;
    const s = d.session;
    s.onReject = (r) => {
      this.clearPending(r.card);
      if (r.reason === 'elixir') this.toast('¡Te falta elixir!', 0xff8af0);
      else if (r.reason === 'rate') this.toast('¡Más despacio!', 0xff9a9a);
      else this.toast('No se pudo jugar la carta', 0xff9a9a);
      Sfx.play('noElixir');
    };
    s.onState = (st) => this.showNetState(st);
    s.onEnd = () => {
      // el resultado llega también por la simulación; esto cubre el caso de partida perdida por tiempo
      if (!this.match.over) this.time.delayedCall(500, () => this.endMatch(s.end?.winner ?? 'draw'));
    };
  }

  // ───────────────────────── API para la mano ─────────────────────────

  get canInteract(): boolean {
    return this.isPlayer && this.started && !this.match.over && !this.modalOpen && this.netOk;
  }

  private get netOk(): boolean {
    const d = this.data_;
    return d.kind !== 'online' || d.session.state === 'playing';
  }

  isPending(card: string): boolean {
    return this.pendingPlays.has(card);
  }

  /** Intenta jugar una carta (coordenadas del mundo). Devuelve true si se ha enviado. */
  playCard(key: string, x: number, y: number): boolean {
    if (!this.canInteract || this.isPending(key)) return false;
    const check = this.match.canPlay(this.me, key, x, y);
    if (check === 'elixir') {
      this.toast('¡Te falta elixir!', 0xff8af0);
      this.hand?.flashElixir();
      return false;
    }
    if (check !== 'ok') {
      this.toast('No puedes desplegar ahí', 0xff9a9a);
      Sfx.play('noElixir');
      return false;
    }
    this.source.send({ t: 'play', team: this.me, card: key, x, y });
    if (this.source.kind === 'online') this.addPending(key, x, y);
    return true;
  }

  sendEmote(id: number): void {
    this.source.send({ t: 'emote', team: this.me, id });
  }

  /** Marca dónde va a caer una carta mientras el servidor la confirma (~100-200 ms). */
  private addPending(card: string, x: number, wy: number): void {
    const c = this.add.container(x, this.view.y(wy)).setDepth(4800);
    const g = this.add.graphics();
    g.lineStyle(3, COLORS.player, 0.9).strokeCircle(0, 0, 0.9 * T);
    g.fillStyle(COLORS.player, 0.18).fillCircle(0, 0, 0.9 * T);
    c.add(g);
    this.tweens.add({
      targets: c,
      scale: { from: 0.7, to: 1 },
      alpha: { from: 1, to: 0.5 },
      yoyo: true,
      repeat: -1,
      duration: 220,
    });
    this.pendingPlays.set(card, { marker: c, at: this.time.now });
  }

  private clearPending(card: string): void {
    const p = this.pendingPlays.get(card);
    if (!p) return;
    p.marker.destroy();
    this.pendingPlays.delete(card);
  }

  uiHit(p: Phaser.Input.Pointer): boolean {
    if (this.isPlayer && Math.hypot(p.x - FLAG.x, p.y - FLAG.y) <= FLAG.r + 6) {
      this.confirmSurrender();
      return true;
    }
    return false;
  }

  showDeployOverlay(card: Card): void {
    const g = this.overlay;
    g.clear();
    if (card.type === 'spell') {
      g.setVisible(false);
      return;
    }
    // en coordenadas de pantalla: mi lado siempre está abajo
    const foe = this.match.towersBy[other(this.me)];
    g.fillStyle(0xff3030, 0.22);
    for (const side of ['left', 'right'] as const) {
      const x0 = side === 'left' ? 0 : W / 2;
      const yEnd = foe[side].alive ? RIVER_BOT + 8 : this.view.y(foe[side].y) + 30;
      g.fillRect(x0, ARENA.top, W / 2, yEnd - ARENA.top);
    }
    g.lineStyle(3, 0xffffff, 0.5).lineBetween(0, RIVER_BOT + 8, W, RIVER_BOT + 8);
    g.setVisible(true);
  }

  hideDeployOverlay(): void {
    this.overlay.setVisible(false);
  }

  // ───────────────────────── Arena ─────────────────────────

  private drawArena(): void {
    const th = this.theme;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(th.edge).fillRect(0, 0, W, H);
    for (let y = ARENA.top; y < ARENA.bottom; y += T) {
      for (let x = 0; x < W; x += T) {
        g.fillStyle(((x / T + (y - ARENA.top) / T) | 0) % 2 ? th.grass[0] : th.grass[1]);
        g.fillRect(x, y, T, Math.min(T, ARENA.bottom - y));
      }
    }
    g.fillStyle(0x000000, 0.18)
      .fillRect(0, ARENA.top, 12, ARENA.bottom - ARENA.top)
      .fillRect(W - 12, ARENA.top, 12, ARENA.bottom - ARENA.top);
    // caminos
    g.fillStyle(0xffffff, 0.1);
    for (const bx of ARENA.bridges) g.fillRect(bx - 22, ARENA.top + 150, 44, ARENA.bottom - ARENA.top - 300);
    g.fillRect(W / 2 - 60, ARENA.top + 20, 120, 150).fillRect(W / 2 - 60, ARENA.bottom - 170, 120, 150);
    // río
    g.fillStyle(Phaser.Display.Color.ValueToColor(th.river).darken(25).color).fillRect(
      0,
      RIVER_TOP - 5,
      W,
      ARENA.riverHalf * 2 + 10,
    );
    g.fillStyle(th.river).fillRect(0, RIVER_TOP, W, ARENA.riverHalf * 2);
    this.waves = this.add.graphics().setDepth(1);
    // puentes
    const b = this.add.graphics().setDepth(2);
    for (const bx of ARENA.bridges) {
      const x0 = bx - ARENA.bridgeHalf,
        y0 = RIVER_TOP - 12,
        h = ARENA.riverHalf * 2 + 24;
      b.fillStyle(COLORS.panelDark, 0.35).fillRect(x0 + 4, y0 + 6, ARENA.bridgeHalf * 2, h);
      b.fillStyle(COLORS.bridge).fillRect(x0, y0, ARENA.bridgeHalf * 2, h);
      b.lineStyle(2, COLORS.bridgeDark, 1);
      for (let x = x0 + 10; x < bx + ARENA.bridgeHalf; x += 10) b.lineBetween(x, y0, x, y0 + h);
      b.fillStyle(COLORS.bridgeDark)
        .fillRect(x0 - 4, y0, ARENA.bridgeHalf * 2 + 8, 6)
        .fillRect(x0 - 4, y0 + h - 6, ARENA.bridgeHalf * 2 + 8, 6);
    }
    // decoración
    for (const [x, y] of [
      [26, 190],
      [694, 190],
      [26, 420],
      [694, 420],
      [26, 720],
      [694, 720],
      [26, 980],
      [694, 980],
      [250, 92],
      [470, 92],
    ]) {
      this.add
        .image(x, y, `deco_${th.deco}`)
        .setScale(0.75)
        .setOrigin(0.5, 0.9)
        .setDepth(y - 5);
    }
  }

  private drawWaves(): void {
    const g = this.waves;
    g.clear();
    const off = (this.elapsed * 30) % 48;
    g.lineStyle(3, this.theme.riverLight, 0.6);
    for (let x = -48 + off; x < W; x += 48) g.lineBetween(x, ARENA.riverY - 7, x + 18, ARENA.riverY - 7);
    for (let x = -24 - off; x < W + 48; x += 48) g.lineBetween(x, ARENA.riverY + 8, x + 18, ARENA.riverY + 8);
  }

  // ───────────────────────── HUD ─────────────────────────

  private get foe(): Team {
    return other(this.me);
  }

  private createHud(): void {
    const P = this.source.players;
    const g = this.add.graphics().setDepth(5000);
    g.fillStyle(COLORS.hud).fillRect(0, 0, W, ARENA.top);
    g.fillStyle(COLORS.panelDark).fillRect(0, ARENA.top - 4, W, 4);
    this.crownG = this.add.graphics().setDepth(5001);
    txt(this, 20, 22, P[this.foe].name, 20, '#ff9a9a', { originX: 0 }).setDepth(5001);
    txt(this, W - 20, 22, P[this.me].name, 20, '#9fd0ff', { originX: 1 }).setDepth(5001);
    g.fillStyle(COLORS.panelDark).fillRoundedRect(W / 2 - 70, 8, 140, 54, 12);
    this.timerT = txt(this, W / 2, 30, '3:00', 30).setDepth(5001);
    this.timerSub = txt(this, W / 2, 54, 'Tiempo', 14, '#c9c3ff').setDepth(5001);
    if (this.isPlayer) {
      // botón de rendirse
      const fg = this.add.graphics().setDepth(5001);
      fg.fillStyle(COLORS.panelDark, 0.75).fillCircle(FLAG.x, FLAG.y, FLAG.r);
      this.add
        .image(FLAG.x + 2, FLAG.y, 'ic_flag')
        .setDisplaySize(30, 30)
        .setDepth(5002);
    }
  }

  /** Espectador y repeticiones: etiqueta, velocidad, pausa y salir. */
  private createWatchControls(): void {
    const bg = this.add.graphics().setDepth(5000);
    bg.fillStyle(0x23284d).fillRect(0, ARENA.bottom, W, H - ARENA.bottom);
    bg.fillStyle(COLORS.panelDark).fillRect(0, ARENA.bottom, W, 4);
    const src = this.source;
    const label = src instanceof ReplaySource ? 'REPETICIÓN' : 'EN DIRECTO';
    txt(this, W / 2, ARENA.bottom + 40, label, 30, src instanceof ReplaySource ? '#ffd84a' : '#ff6a6a').setDepth(5001);
    const back = this.data_.kind === 'replay' && this.data_.back ? this.data_.back : 'Tv';
    button(this, 110, 1180, 170, 80, 'Salir', COLORS.red, () => this.scene.start(back), 28).setDepth(5002);
    if (src instanceof ReplaySource) {
      const pause = button(
        this,
        W / 2,
        1180,
        170,
        80,
        'Pausa',
        COLORS.blue,
        () => {
          src.paused = !src.paused;
          pause.label.setText(src.paused ? 'Seguir' : 'Pausa');
        },
        28,
      ).setDepth(5002);
      const speed = button(
        this,
        W - 110,
        1180,
        170,
        80,
        'x1',
        COLORS.orange,
        () => {
          src.speed = src.speed >= 4 ? 1 : src.speed * 2;
          speed.label.setText(`x${src.speed}`);
        },
        30,
      ).setDepth(5002);
    }
  }

  private confirmSurrender(): void {
    if (this.match.over || this.modalOpen) return;
    openModal(this, 560, 400, '¿Rendirse?', (box, close) => {
      box.add(txt(this, 0, -30, 'Perderás la partida y los trofeos.', 26));
      box.add(button(this, -125, 100, 220, 84, 'Seguir', COLORS.blue, close, 28));
      box.add(
        button(
          this,
          125,
          100,
          220,
          84,
          'Rendirse',
          COLORS.red,
          () => {
            close();
            this.source.send({ t: 'surrender', team: this.me });
          },
          28,
        ),
      );
    });
  }

  private showNetState(st: string): void {
    this.netBanner?.destroy();
    this.netBanner = null;
    if (st !== 'reconnecting' && st !== 'lost') return;
    const c = this.add.container(W / 2, ARENA.riverY).setDepth(8500);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.8).fillRoundedRect(-300, -70, 600, 140, 20);
    c.add(g);
    if (st === 'reconnecting') {
      c.add(txt(this, 0, -16, 'Conexión perdida', 34, '#ffd84a'));
      c.add(txt(this, 0, 30, 'Reconectando…', 24));
    } else {
      c.add(txt(this, 0, -16, 'No se pudo reconectar', 32, '#ff9a9a'));
      c.add(
        button(this, 0, 40, 220, 60, 'Volver', COLORS.blue, () => this.scene.start('Lobby', { tab: 'battle' }), 24),
      );
    }
    this.netBanner = c;
  }

  private updateHud(): void {
    const m = this.match;
    const t = Math.max(0, Math.ceil(m.timeLeft));
    this.timerT.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    const dbl = m.doubleElixir;
    this.timerSub.setText(m.overtime ? 'Muerte súbita' : dbl ? 'Elixir x2' : 'Tiempo');
    this.timerSub.setColor(dbl ? '#ff8af0' : '#c9c3ff');
    this.timerT.setColor(t <= 10 ? '#ff6a6a' : '#ffffff');
    if (t <= 10 && t < this.lastCount && t > 0 && this.started) {
      this.lastCount = t;
      Sfx.play('countdown');
    }
    const g = this.crownG;
    g.clear();
    for (let i = 0; i < 3; i++) {
      drawCrown(g, 32 + i * 34, 52, 12, i < m.crowns[this.foe] ? COLORS.enemy : 0x3b3f63);
      drawCrown(g, W - 32 - i * 34, 52, 12, i < m.crowns[this.me] ? COLORS.player : 0x3b3f63);
    }
  }

  private toast(msg: string, color = 0xffffff, y = ARENA.riverY - 90): void {
    if (this.toasts.has(msg)) return;
    const t = txt(this, W / 2, y, msg, 34, cssColor(color))
      .setDepth(6000)
      .setScale(0.5);
    this.toasts.set(msg, t);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      delay: 1100,
      duration: 500,
      onComplete: () => {
        t.destroy();
        this.toasts.delete(msg);
      },
    });
  }

  private emote(team: Team, text: string): void {
    this.bubbles[team]?.destroy();
    const mine = team === this.me;
    const x = mine ? 210 : 510,
      y = mine ? 930 : 200;
    const c = this.add.container(x, y).setDepth(6500);
    const g = this.add.graphics();
    const w = Math.max(150, text.length * 14 + 40);
    g.fillStyle(COLORS.panelDark).fillRoundedRect(-w / 2 - 3, -33, w + 6, 66, 18);
    g.fillStyle(0xffffff).fillRoundedRect(-w / 2, -30, w, 60, 16);
    g.fillStyle(0xffffff).fillTriangle(mine ? 30 : -30, 26, mine ? 60 : -60, 26, mine ? 70 : -70, 46);
    c.add(g);
    c.add(txt(this, 0, 0, text, 22, mine ? '#1f56c4' : '#c8303a', { strokeThickness: 0 }));
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2200, duration: 300, onComplete: () => c.destroy() });
    this.bubbles[team] = c;
    Sfx.play('emote');
  }

  // ───────────────────────── Intro VS ─────────────────────────

  private intro(): void {
    const P = this.source.players;
    const c = this.add.container(0, 0).setDepth(9500);
    const top = this.add.container(-W, 0),
      bot = this.add.container(W, 0);
    const tg = this.add.graphics();
    tg.fillStyle(0xc8303a).fillRect(0, 280, W, 300);
    tg.fillStyle(0x000000, 0.2).fillRect(0, 280, W, 12);
    top.add(tg);
    const foe = P[this.foe],
      me = P[this.me];
    levelBadge(this, 110, 430, foe.kingLevel, 38).forEach((o) => top.add(o));
    top.add(txt(this, 180, 400, foe.name, 44, '#ffffff', { originX: 0 }));
    top.add(this.add.image(196, 460, 'ic_trophy').setDisplaySize(40, 40));
    top.add(txt(this, 226, 460, String(foe.trophies), 28, '#ffd84a', { originX: 0 }));
    const bg = this.add.graphics();
    bg.fillStyle(0x1f56c4).fillRect(0, 700, W, 300);
    bg.fillStyle(0x000000, 0.2).fillRect(0, 700, W, 12);
    bot.add(bg);
    levelBadge(this, 110, 850, me.kingLevel, 38).forEach((o) => bot.add(o));
    bot.add(txt(this, 180, 820, me.name, 44, '#ffffff', { originX: 0 }));
    bot.add(this.add.image(196, 880, 'ic_trophy').setDisplaySize(40, 40));
    bot.add(txt(this, 226, 880, String(me.trophies), 28, '#ffd84a', { originX: 0 }));
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.6);
    const vs = txt(this, W / 2, 640, 'VS', 120, '#ffd84a').setScale(0);
    c.add([dim, top, bot, vs]);
    this.tweens.add({ targets: [top, bot], x: 0, duration: 380, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: vs,
      scale: 1,
      delay: 300,
      duration: 300,
      ease: 'Back.easeOut',
      onStart: () => Sfx.play('boom'),
    });
    this.time.delayedCall(1900, () => {
      this.tweens.add({ targets: top, x: -W, duration: 300, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: bot, x: W, duration: 300, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: [vs, dim], alpha: 0, duration: 300, onComplete: () => c.destroy() });
      this.time.delayedCall(250, () => {
        this.go();
        Sfx.play('fight');
        this.toast('¡A luchar!', 0xffd84a, ARENA.riverY);
      });
    });
  }

  private go(): void {
    this.started = true;
    this.source.begin();
    Music.play('battle');
  }

  // ───────────────────────── Vistas y eventos ─────────────────────────

  private teamColor(team: Team): number {
    return team === this.me ? COLORS.player : COLORS.enemy;
  }

  /** La partida se ha reconstruido (reconexión/resync): se recrean todas las vistas. */
  private rebuildViews(): void {
    for (const uv of this.units.values()) uv.destroy();
    for (const tv of this.towers.values()) tv.destroy();
    for (const pv of this.projectiles.values()) pv.destroy();
    this.units.clear();
    this.towers.clear();
    this.projectiles.clear();
    const m = this.match;
    for (const t of m.towers) {
      const tv = new TowerView(this, t, t.team === this.me, this.view);
      if (!t.alive) tv.onDestroyed(this.fx, true);
      else if (t.active) tv.onAwake(true);
      this.towers.set(t.id, tv);
    }
    for (const u of m.units) this.units.set(u.id, new UnitView(this, u, u.team === this.me, this.view));
    for (const p of m.projectiles) this.projectiles.set(p.id, new ProjectileView(this.fx, p, this.view));
    for (const [card] of this.pendingPlays) this.clearPending(card);
  }

  private handle(events: SimEvent[]): void {
    const m = this.match;
    const v = this.view;
    for (const ev of events) {
      switch (ev.e) {
        case 'deploy':
          if (ev.team === this.me) this.clearPending(ev.card);
          this.time.delayedCall(200, () => {
            this.fx.ring(ev.x, v.y(ev.y), 0.9 * T, this.teamColor(ev.team));
            if (ev.team === this.me) Sfx.play('deploy');
          });
          break;
        case 'spawn': {
          const u = m.units.find((x) => x.id === ev.id);
          if (u) this.units.set(u.id, new UnitView(this, u, u.team === this.me, v));
          break;
        }
        case 'attack': {
          const uv = this.units.get(ev.id);
          if (uv) uv.onAttack(ev.melee);
          const tv = this.towers.get(ev.id);
          const target = m.body(ev.targetId);
          if (tv && target) tv.onShoot(target.x, target.y);
          break;
        }
        case 'shoot': {
          const p = m.projectiles.find((x) => x.id === ev.id);
          if (p) {
            this.projectiles.set(p.id, new ProjectileView(this.fx, p, v));
            Sfx.play('shoot');
          }
          break;
        }
        case 'impact':
          this.fx.impact(ev.x, v.y(ev.y) - ev.h, ev.palette, ev.scale);
          if (ev.scale >= 3) Sfx.play('hit');
          break;
        case 'damage': {
          const uv = this.units.get(ev.id);
          if (uv) {
            uv.onDamage(ev.silent);
            if (!ev.silent) this.fx.damageNumber(uv.x, uv.y - 40, ev.amount, ev.mult);
          }
          const tv = this.towers.get(ev.id);
          if (tv) {
            tv.onDamage();
            this.fx.damageNumber(tv.t.x, tv.sy - 70, ev.amount, ev.mult);
          }
          break;
        }
        case 'splash':
          this.fx.ring(ev.x, v.y(ev.y), ev.r, palette(ev.palette)[2]);
          break;
        case 'spellCast':
          this.spellFx(ev.team, ev.card, ev.x, v.y(ev.y));
          if (ev.team === this.me) this.clearPending(ev.card);
          break;
        case 'spellImpact':
          Sfx.play('boom');
          this.cameras.main.shake(180, 0.007);
          break;
        case 'death':
          this.units.get(ev.id)?.onDeath();
          this.units.delete(ev.id);
          break;
        case 'kingAwake':
          this.towers.get(m.towersBy[ev.team].king.id)?.onAwake();
          this.toast(ev.team === this.me ? '¡Tu torre del rey despierta!' : '¡El rey rival despierta!', 0xffd84a);
          break;
        case 'towerDestroyed':
          this.towers.get(ev.id)?.onDestroyed(this.fx);
          break;
        case 'crown':
          if (ev.team === this.me) Sfx.play('crown');
          if (ev.crowns < 3) {
            const mine = ev.team === this.me;
            this.toast(
              this.isPlayer
                ? mine
                  ? '¡Corona para ti!'
                  : 'El rival gana una corona'
                : `Corona para ${this.source.players[ev.team].name}`,
              this.teamColor(ev.team),
            );
          }
          break;
        case 'doubleElixir':
          this.toast('¡Elixir x2!', 0xff8af0);
          break;
        case 'overtime':
          this.lastCount = 99;
          this.toast('¡Tiempo extra! Muerte súbita', 0xffd84a);
          break;
        case 'emote':
          this.emote(ev.team, EMOTES[ev.id] ?? '…');
          break;
        case 'end':
          this.hand?.hideGhost();
          this.time.delayedCall(ev.reason === 'king' ? 1200 : ev.reason === 'overtime' ? 1000 : 0, () =>
            this.endMatch(ev.winner),
          );
          break;
      }
    }
  }

  /** Lluvia del sprite del ataque sobre la zona del hechizo (dura lo mismo que el retardo de la simulación). */
  private spellFx(team: Team, key: string, x: number, y: number): void {
    const card = this.match.cardFor(team, key);
    const [tex, frame] = moveFrame(card.move);
    const pal = palette(card.palette);
    const marker = this.add.graphics().setDepth(6);
    marker.fillStyle(pal[2], 0.25).fillCircle(x, y, card.radiusSpell);
    marker.lineStyle(3, pal[3], 0.9).strokeCircle(x, y, card.radiusSpell);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * card.radiusSpell * 0.6;
      const px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r;
      const s = this.add
        .image(px, py - 320, tex, frame)
        .setScale(4)
        .setDepth(3500)
        .setRotation(Math.PI / 2);
      this.tweens.add({
        targets: s,
        y: py,
        delay: i * 60,
        duration: 380,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.fx.impact(px, py, card.palette, 3);
          s.destroy();
        },
      });
    }
    this.time.delayedCall(RULES.spellDelay * 1000, () => marker.destroy());
  }

  // ───────────────────────── Fin de partida ─────────────────────────

  private endMatch(winner: Winner): void {
    if (this.resultShown) return;
    this.resultShown = true;
    Music.stop();
    if (!this.isPlayer) return this.showWatchResult(winner);
    const m = this.match;
    const P = this.source.players;
    const outcome: BattleOutcome = winner === 'draw' ? 'draw' : winner === this.me ? 'win' : 'loss';
    Sfx.play(outcome === 'win' ? 'win' : 'lose');
    // Fase 2: los trofeos y recompensas los decidirá el servidor
    const res = Profile.applyBattle(outcome, m.crowns[this.me]);
    const replay: Replay = { version: 1, setup: m.setup, inputs: [...m.log] };
    try {
      localStorage.setItem(LAST_REPLAY_KEY, JSON.stringify({ ...replay, players: P }));
    } catch {
      /* sin almacenamiento */
    }
    void onMatchEnd({
      winner,
      crowns: { ...m.crowns },
      duration: Math.round(m.elapsed),
      deck: [...m.setup.players[this.me].deck],
      opponent: P[this.foe].name,
      replay,
    });

    const c = this.add.container(0, 0).setDepth(9000);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.78).fillRect(0, 0, W, H);
    c.add(g);
    const title = outcome === 'win' ? '¡VICTORIA!' : outcome === 'loss' ? 'DERROTA' : 'EMPATE';
    const color = outcome === 'win' ? '#ffd84a' : outcome === 'loss' ? '#ff9a9a' : '#ffffff';
    const tt = txt(this, W / 2, 200, title, 84, color).setScale(0);
    c.add(tt);
    this.tweens.add({ targets: tt, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.drawScore(c, P);

    // recompensas
    let y = 620;
    const row = (icon: string, label: string, value: string, col: string) => {
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
    const tv = row(
      'ic_trophy',
      'Trofeos',
      `${res.trophies >= 0 ? '+' : ''}${res.trophies}`,
      res.trophies >= 0 ? '#ffd84a' : '#ff9a9a',
    );
    tv.setScale(0);
    this.tweens.add({ targets: tv, scale: 1, delay: 500, duration: 300, ease: 'Back.easeOut' });
    if (res.gold) row('ic_gold', 'Oro', `+${fmtNum(res.gold)}`, '#ffd84a');
    row('ic_crown', 'Coronas para la Ball corona', `${Profile.d.crowns}/${CROWNS_FOR_CROWN_BALL}`, '#ffffff');
    if (outcome === 'win') {
      if (res.ball) row(`ball_${res.ball}`, '¡Pokéball ganada!', BALLS[res.ball].label, '#7dff8a');
      else row('ic_lock', 'Huecos de Pokéball llenos', '—', '#9aa0c8');
    }
    if (res.arenaUp) {
      const at = txt(this, W / 2, y + 10, `¡Nueva arena: ${ARENAS[Profile.arena].name}!`, 34, '#7dff8a');
      c.add(at);
      this.tweens.add({ targets: at, scale: 1.1, yoyo: true, repeat: -1, duration: 500 });
      y += 70;
    }
    if (res.kingLevelUp) {
      c.add(txt(this, W / 2, y + 10, `¡Nivel de rey ${Profile.d.kingLevel}!`, 30, '#ffd84a'));
      y += 60;
    }
    c.add(
      button(
        this,
        W / 2,
        Math.min(1190, y + 80),
        320,
        100,
        'OK',
        COLORS.green,
        () => this.scene.start('Lobby', { tab: 'battle' }),
        44,
      ),
    );
  }

  private drawScore(c: Phaser.GameObjects.Container, P: Record<Team, PlayerInfo>): void {
    const m = this.match;
    const pg = this.add.graphics();
    pg.fillStyle(0xc8303a, 0.9).fillRoundedRect(40, 290, W - 80, 120, 20);
    pg.fillStyle(0x1f56c4, 0.9).fillRoundedRect(40, 420, W - 80, 120, 20);
    c.add(pg);
    c.add(txt(this, 70, 350, P[this.foe].name, 30, '#ffffff', { originX: 0 }));
    c.add(txt(this, 70, 480, P[this.me].name, 30, '#ffffff', { originX: 0 }));
    const cg = this.add.graphics();
    for (let i = 0; i < 3; i++) {
      drawCrown(cg, 530 + i * 48, 350, 18, i < m.crowns[this.foe] ? 0xffc21a : 0x3b3f63);
      drawCrown(cg, 530 + i * 48, 480, 18, i < m.crowns[this.me] ? 0xffc21a : 0x3b3f63);
    }
    c.add(cg);
  }

  /** Resultado para espectadores y repeticiones (sin recompensas). */
  private showWatchResult(winner: Winner): void {
    const P = this.source.players;
    const c = this.add.container(0, 0).setDepth(9000);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.78).fillRect(0, 0, W, H);
    c.add(g);
    const title = winner === 'draw' ? 'EMPATE' : `Gana ${P[winner].name}`;
    c.add(txt(this, W / 2, 200, title, 56, '#ffd84a'));
    this.drawScore(c, P);
    const back = this.data_.kind === 'replay' && this.data_.back ? this.data_.back : 'Tv';
    c.add(button(this, W / 2, 700, 320, 100, 'Volver', COLORS.green, () => this.scene.start(back), 40));
  }

  // ───────────────────────── Bucle ─────────────────────────

  override update(_time: number, delta: number): void {
    const dtFrame = delta / 1000;
    this.elapsed += dtFrame;
    this.drawWaves();

    if (this.started) {
      const events = this.source.advance(dtFrame);
      if (this.source.takeReset()) this.rebuildViews();
      else this.handle(events);
      // una carta enviada que no llega a aplicarse (se perdió el mensaje) deja de marcarse
      for (const [card, p] of this.pendingPlays) if (this.time.now - p.at > 2000) this.clearPending(card);
    }

    const alpha = this.source.alpha;
    for (const uv of this.units.values()) uv.update(alpha, dtFrame);
    for (const tv of this.towers.values()) tv.update();
    for (const [id, pv] of this.projectiles) {
      if (!pv.p.alive) {
        pv.destroy();
        this.projectiles.delete(id);
      } else pv.update(alpha, dtFrame);
    }

    this.hand?.update();
    this.updateHud();
  }
}
