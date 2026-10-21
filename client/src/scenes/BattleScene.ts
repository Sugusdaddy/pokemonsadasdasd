import Phaser from 'phaser';
import {
  W,
  H,
  T,
  ARENA,
  RULES,
  COLORS,
  ARENAS,
  CROWNS_FOR_CROWN_BALL,
  TOWER_GUARDIANS,
  makeOpponent,
  randomSeed,
  Rng,
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
import { Profile, type BattleOutcome, type BattleResult } from '../meta/Profile';
import { Hand } from '../ui/Hand';
import { txt, button, drawCrown, levelBadge, fmtNum, cssColor } from '../ui/style';
import { openModal } from '../ui/Modal';
import { onMatchEnd } from '../net/rewards';
import type { OnlineSession } from '../net/OnlineSession';
import { FxPools } from '../battle/Pools';
import { BattleParticles, FX_DEPTH } from '../battle/Particles';
import { BRIDGE_OF, DECO_VARIANTS, DETAIL_VARIANTS } from '../art';
import { riverShader } from '../battle/riverShader';
import { HIT_STOP, HitStop, heavyHit } from '../battle/juice';
import { shake } from '../systems/Shake';
import { UnitView } from '../battle/UnitView';
import { TowerView } from '../battle/TowerView';
import { ProjectileView } from '../battle/ProjectileView';
import { View } from '../battle/View';
import { LocalSource, OnlineSource, ReplaySource, type BattleSource } from '../battle/sources';
import { TutorialCoach, tutorialMatch } from '../battle/Tutorial';
import { L } from '../layout';
import { t, arenaName, ballLabel, emoteText } from '../i18n';
import * as kit from '../ui/kit';
import { BaseScene } from './BaseScene';
import { applyFpsCap, isAutoLow, lowQuality, particleAmount, qualitySetting, setAutoLow } from '../systems/Quality';
import { FpsWatch } from '../systems/fpsWatch';

const FLAG = { x: W - 34, y: 104, r: 24 };
const RIVER_TOP = ARENA.riverY - ARENA.riverHalf;
const RIVER_BOT = ARENA.riverY + ARENA.riverHalf;
export const LAST_REPLAY_KEY = 'arenaRoyale.lastReplay';

export type BattleData =
  | { kind: 'local' }
  | { kind: 'tutorial' }
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
  private particles!: BattleParticles;
  /** Pausa breve en golpes fuertes (solo visual: el tiempo se recupera al salir). */
  private hitStop = new HitStop();
  private fpsWatch: FpsWatch | null = null;
  /** Explicaciones del tutorial (solo en esa partida). */
  private coach: TutorialCoach | null = null;
  /** Río animado (WebGL); sin él se dibujan las olas de siempre. */
  private river: Phaser.GameObjects.Shader | null = null;
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
  private toasts = new Map<string, Phaser.GameObjects.Container>();
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
    } else if (d.kind === 'tutorial') {
      const tm = tutorialMatch(randomSeed());
      this.source = new LocalSource(tm.setup, tm.players, []);
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
          blue: { name: Profile.displayName, trophies: Profile.d.trophies, kingLevel: Profile.d.kingLevel, bot: false },
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
    const label = txt(this, L.w / 2, L.h / 2 - 40, t('battle.loading'), 30);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(COLORS.panel).fillRoundedRect(L.w / 2 - 220, L.h / 2, 440, 26, 10);
      bar.fillStyle(COLORS.elixir).fillRoundedRect(L.w / 2 - 220, L.h / 2, Math.max(16, 440 * v), 26, 10);
    });
    this.load.once('complete', () => {
      label.destroy();
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
    this.coach = null;

    this.fx = new FxPools(this);
    this.particles = new BattleParticles(this);
    this.particles.amount = particleAmount();
    // Auto: si va lento varios segundos, baja la calidad (y lo dice)
    this.fpsWatch = new FpsWatch(
      () => {
        setAutoLow(true);
        applyFpsCap(this.game);
        this.particles.amount = particleAmount();
        this.toast(t('quality.autoLow'), 0xaab3e8);
      },
      () => qualitySetting() === 'auto' && !isAutoLow(),
    );
    this.hitStop = new HitStop();
    this.setTimeScale(1);
    this.events.once('shutdown', () => this.setTimeScale(1));
    // PC: la arena (720 de ancho) queda centrada en un diseño de 1920; si el lienzo es más
    // estrecho (tableta), la cámara se aleja para que quepa entero
    if (L.pc) this.cameras.main.setZoom(L.battleZoom).centerOn(W / 2, L.h / 2);
    else this.cameras.main.setScroll(0, 0);
    this.drawArena();
    if (!lowQuality()) {
      this.particles.ambient(this.theme, 0, ARENA.top, W, ARENA.bottom - ARENA.top);
      // viñeta: oscurece un poco los bordes de la arena (no el HUD)
      this.add
        .image(W / 2, (ARENA.top + ARENA.bottom) / 2, 'fx_vignette')
        .setDisplaySize(W * 1.08, (ARENA.bottom - ARENA.top) * 1.08)
        .setDepth(FX_DEPTH.vignette);
    }
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
      if (r.reason === 'elixir') this.toast(t('battle.toast.noElixir'), 0xff8af0);
      else if (r.reason === 'rate') this.toast(t('battle.toast.slowDown'), 0xff9a9a);
      else this.toast(t('battle.toast.rejected'), 0xff9a9a);
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
      this.toast(t('battle.toast.noElixir'), 0xff8af0);
      this.hand?.flashElixir();
      return false;
    }
    if (check !== 'ok') {
      this.toast(t('battle.toast.badZone'), 0xff9a9a);
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

  /** ¿El toque (coordenadas del mundo) cae en el botón de rendirse del móvil? En PC es un botón normal. */
  uiHit(x: number, y: number): boolean {
    if (!L.pc && this.isPlayer && Math.hypot(x - FLAG.x, y - FLAG.y) <= FLAG.r + 6) {
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
    g.fillStyle(th.edge).fillRect(-L.arenaX, 0, W + 2 * L.arenaX, Math.max(H, L.h));
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
    this.river = lowQuality() ? null : riverShader(this, th, 0, RIVER_TOP, W, ARENA.riverHalf * 2);
    this.river?.setDepth(1);
    if (th.liquid === 'lava') {
      // la lava ilumina las orillas
      const glow = this.add
        .image(W / 2, ARENA.riverY, 'fx_soft')
        .setDisplaySize(W * 1.4, ARENA.riverHalf * 9)
        .setTint(th.river)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.32)
        .setDepth(1.5);
      this.tweens.add({ targets: glow, alpha: 0.18, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    }
    // puentes (pixel art: madera, piedra o basalto según la arena)
    for (const bx of ARENA.bridges) {
      this.add
        .image(bx + 4, ARENA.riverY + 6, 'fx_shadow')
        .setDisplaySize(ARENA.bridgeHalf * 2 + 20, ARENA.riverHalf * 2 + 30)
        .setAlpha(0.35)
        .setDepth(1.8);
      this.add.image(bx, ARENA.riverY, `bridge_${BRIDGE_OF[th.deco]}`).setDepth(2);
    }
    this.groundDetails();
    // decoración (variantes según la posición)
    for (const [i, [x, y]] of [
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
    ].entries()) {
      this.add
        .image(x, y, `deco_${th.deco}_${(i * 7 + this.match.setup.arena) % DECO_VARIANTS}`)
        .setScale(0.75)
        .setOrigin(0.5, 0.9)
        .setDepth(y - 5);
    }
  }

  /** Detalles pequeños en el suelo (hierba, piedras, nieve…), siempre iguales en cada arena. */
  private groundDetails(): void {
    const th = this.theme;
    const rng = new Rng(1000 + this.match.setup.arena * 97);
    const towers = this.match.towers.map((t) => ({ x: t.x, y: this.view.y(t.y) }));
    let placed = 0;
    for (let tries = 0; placed < 28 && tries < 300; tries++) {
      const x = rng.range(20, W - 20),
        y = rng.range(ARENA.top + 16, ARENA.bottom - 16);
      if (Math.abs(y - ARENA.riverY) < ARENA.riverHalf + 18) continue;
      if (towers.some((t) => Math.abs(t.x - x) < 70 && Math.abs(t.y - y) < 80)) continue;
      this.add
        .image(Math.round(x), Math.round(y), `detail_${th.deco}_${rng.int(0, DETAIL_VARIANTS - 1)}`)
        .setDepth(0.5)
        .setAlpha(0.9);
      placed++;
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

  get foe(): Team {
    return other(this.me);
  }

  /** Coronas: posición de la primera y separación (rival y mía). */
  private crownLayout = { foe: { x: 32, y: 52, dx: 34, r: 12 }, me: { x: W - 32, y: 52, dx: -34, r: 12 } };

  private createHud(): void {
    const P = this.source.players;
    this.crownG = this.add.graphics().setDepth(5001);
    if (L.pc) {
      this.createPcPanels();
      return;
    }
    // barra superior (móvil): degradado oscuro, nombres a los lados y reloj en el centro
    this.add.image(0, 0, 'ui_bg').setOrigin(0, 0).setDisplaySize(W, ARENA.top).setTint(0x8f98d8).setDepth(5000);
    const g = this.add.graphics().setDepth(5000);
    g.fillStyle(kit.C.ink).fillRect(0, ARENA.top - 4, W, 4);
    this.crownLayout = { foe: { x: 30, y: 50, dx: 32, r: 11 }, me: { x: W - 30, y: 50, dx: -32, r: 11 } };
    txt(this, 16, 20, P[this.foe].name, 20, '#ffb3b8', { originX: 0 }).setDepth(5001);
    txt(this, W - 16, 20, P[this.me].name, 20, '#b8dcff', { originX: 1 }).setDepth(5001);
    kit.panel(this, W / 2 - 78, 4, 156, 56, 'inset').setDepth(5000);
    this.timerT = kit.text(this, W / 2, 26, '3:00', 'number', '#ffffff', { size: 30 }).setDepth(5001);
    this.timerSub = kit.text(this, W / 2, 50, t('battle.time'), 'small', '#aab3e8', { size: 13 }).setDepth(5001);
    if (this.isPlayer) {
      // botón de rendirse
      const fg = this.add.graphics().setDepth(5001);
      fg.fillStyle(kit.C.ink, 0.8).fillCircle(FLAG.x, FLAG.y, FLAG.r + 2);
      fg.fillStyle(kit.C.surface, 0.95).fillCircle(FLAG.x, FLAG.y, FLAG.r);
      this.add
        .image(FLAG.x + 2, FLAG.y, 'ic_flag')
        .setDisplaySize(28, 28)
        .setDepth(5002);
    }
  }

  /**
   * PC: paneles a los lados de la arena (coordenadas del mundo; la cámara está
   * desplazada L.arenaX a la izquierda). Izquierda: rival, sus coronas, emotes y
   * rendirse. Derecha: reloj, mis datos y la mano (la dibuja Hand).
   */
  private createPcPanels(): void {
    const P = this.source.players;
    const LX = -L.arenaX,
      RX = W,
      PW = L.arenaX,
      PH = L.h;
    const D = 4980;
    // fondo de los paneles: degradado, patrón y sombra contra la arena
    for (const x of [LX, RX]) {
      this.add.image(x, 0, 'ui_bg').setOrigin(0, 0).setDisplaySize(PW, PH).setTint(0x9aa2dc).setDepth(D);
      this.add.tileSprite(x, 0, PW, PH, 'ui_stripes').setOrigin(0, 0).setDepth(D);
    }
    // tableta (zoom < 1): la cámara ve más alto que el diseño; franjas arriba y abajo con el
    // mismo fondo que los paneles para que no asome el borde de la arena
    const band = Math.ceil((L.h / L.battleZoom - L.h) / 2);
    if (band > 0) {
      for (const y of [-band, PH]) {
        this.add
          .image(LX, y, 'ui_bg')
          .setOrigin(0, 0)
          .setDisplaySize(W + 2 * PW, band)
          .setTint(0x9aa2dc)
          .setDepth(D);
        this.add
          .tileSprite(LX, y, W + 2 * PW, band, 'ui_stripes')
          .setOrigin(0, 0)
          .setDepth(D);
      }
      this.add
        .graphics()
        .setDepth(D + 1)
        .fillStyle(kit.C.ink)
        .fillRect(-5, PH, W + 10, 5);
    }
    const edge = this.add.graphics().setDepth(D + 1);
    edge.fillGradientStyle(kit.C.ink, kit.C.ink, kit.C.ink, kit.C.ink, 0, 0.7, 0, 0.7).fillRect(-40, 0, 40, PH);
    edge.fillGradientStyle(kit.C.ink, kit.C.ink, kit.C.ink, kit.C.ink, 0.7, 0, 0.7, 0).fillRect(W, 0, 40, PH);
    edge.fillStyle(kit.C.ink).fillRect(-5, 0, 5, PH).fillRect(W, 0, 5, PH);
    // franja superior de la arena con su nombre
    this.add.image(0, 0, 'ui_bg').setOrigin(0, 0).setDisplaySize(W, ARENA.top).setTint(0x8f98d8).setDepth(5000);
    this.add
      .graphics()
      .setDepth(5000)
      .fillStyle(kit.C.ink)
      .fillRect(0, ARENA.top - 4, W, 4);
    kit.text(this, W / 2, ARENA.top / 2 - 2, arenaName(this.match.setup.arena), 'h3', '#ffd75a').setDepth(5001);

    const lcx = LX + PW / 2,
      rcx = RX + PW / 2;
    const player = (cx: number, y: number, info: PlayerInfo, variant: 'red' | 'blue', label: string) => {
      kit.panel(this, cx - 260, y, 520, 200, variant).setDepth(D + 2);
      kit.panel(this, cx - 120, y - 18, 240, 40, 'dark').setDepth(D + 3);
      kit.text(this, cx, y + 2, label, 'label', '#ffffff', { size: 20 }).setDepth(D + 4);
      levelBadge(this, cx - 190, y + 100, info.kingLevel, 36).forEach((o) => o.setDepth(D + 4));
      kit
        .text(this, cx - 138, y + 82, info.bot ? t('battle.bot', { name: info.name }) : info.name, 'h2', '#ffffff', {
          size: 32,
          originX: 0,
        })
        .setDepth(D + 4);
      kit.pill(this, cx - 140, y + 140, 170, 'ic_trophy', String(info.trophies)).root.setDepth(D + 4);
    };
    player(lcx, 50, P[this.foe], 'red', this.isPlayer ? t('battle.opponent') : t('battle.top'));
    kit.panel(this, lcx - 200, 280, 400, 110, 'inset').setDepth(D + 2);

    // reloj
    kit.panel(this, rcx - 190, 30, 380, 170, 'dark').setDepth(D + 2);
    kit.panel(this, rcx - 160, 52, 320, 96, 'inset').setDepth(D + 3);
    this.timerT = kit.text(this, rcx, 100, '3:00', 'hero', '#ffffff', { size: 66 }).setDepth(D + 4);
    this.timerSub = kit.text(this, rcx, 172, t('battle.time'), 'label', '#aab3e8', { size: 22 }).setDepth(D + 4);
    // mis datos y mis coronas
    kit.panel(this, rcx - 260, 228, 520, 200, 'blue').setDepth(D + 2);
    kit
      .text(
        this,
        rcx,
        268,
        this.isPlayer ? t('battle.you', { name: P[this.me].name }) : P[this.me].name,
        'h3',
        '#ffffff',
        { size: 28 },
      )
      .setDepth(D + 4);
    kit.panel(this, rcx - 200, 306, 400, 100, 'inset').setDepth(D + 3);
    this.crownLayout = { foe: { x: lcx - 110, y: 336, dx: 110, r: 32 }, me: { x: rcx - 110, y: 358, dx: 110, r: 32 } };

    if (this.isPlayer) {
      // zona de la mano y zona de emotes/rendirse
      kit.panel(this, RX + 24, 456, PW - 48, 530, 'dark').setDepth(D + 2);
      kit.panel(this, LX + 60, 820, PW - 120, 250, 'dark').setDepth(D + 2);
      button(
        this,
        lcx,
        1010,
        320,
        76,
        t('battle.surrenderKey'),
        COLORS.red,
        () => this.confirmSurrender(),
        24,
      ).setDepth(5002);
      kit.text(this, rcx, 1040, t('battle.hints'), 'small', '#aab3e8', { size: 17 }).setDepth(5001);
    }
  }

  /** Espectador y repeticiones: etiqueta, velocidad, pausa y salir. */
  private createWatchControls(): void {
    // barra inferior en móvil; columna en el panel derecho en PC
    const cx = W + L.arenaX / 2;
    const pos = L.pc
      ? { label: [cx, 560], exit: [cx, 900], pause: [cx, 680], speed: [cx, 790], bw: 300 }
      : { label: [W / 2, ARENA.bottom + 40], exit: [110, 1180], pause: [W / 2, 1180], speed: [W - 110, 1180], bw: 170 };
    if (!L.pc) {
      const bg = this.add.graphics().setDepth(5000);
      bg.fillStyle(0x23284d).fillRect(0, ARENA.bottom, W, H - ARENA.bottom);
      bg.fillStyle(COLORS.panelDark).fillRect(0, ARENA.bottom, W, 4);
    }
    const src = this.source;
    const label = src instanceof ReplaySource ? t('battle.watch.replay') : t('battle.watch.live');
    txt(this, pos.label[0], pos.label[1], label, 30, src instanceof ReplaySource ? '#ffd84a' : '#ff6a6a').setDepth(
      5001,
    );
    const back = this.data_.kind === 'replay' && this.data_.back ? this.data_.back : 'Tv';
    const exitLabel = L.pc ? t('battle.watch.exitKey') : t('battle.watch.exit');
    button(
      this,
      pos.exit[0],
      pos.exit[1],
      pos.bw,
      80,
      exitLabel,
      COLORS.red,
      () => this.scene.start(back),
      28,
    ).setDepth(5002);
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!this.modalOpen) this.scene.start(back);
    });
    if (src instanceof ReplaySource) {
      const pause = button(
        this,
        pos.pause[0],
        pos.pause[1],
        pos.bw,
        80,
        t('battle.watch.pause'),
        COLORS.blue,
        () => {
          src.paused = !src.paused;
          pause.label.setText(src.paused ? t('battle.watch.resume') : t('battle.watch.pause'));
        },
        28,
      ).setDepth(5002);
      const speed = button(
        this,
        pos.speed[0],
        pos.speed[1],
        pos.bw,
        80,
        'x1',
        COLORS.orange,
        () => {
          src.speed = src.speed >= 4 ? 1 : src.speed * 2;
          speed.label.setText(`x${src.speed}`);
        },
        30,
      ).setDepth(5002);
      // teclado: espacio pausa, F cambia la velocidad
      this.input.keyboard?.on('keydown-SPACE', () => {
        src.paused = !src.paused;
        pause.label.setText(src.paused ? t('battle.watch.resume') : t('battle.watch.pause'));
      });
      this.input.keyboard?.on('keydown-F', () => {
        src.speed = src.speed >= 4 ? 1 : src.speed * 2;
        speed.label.setText(`x${src.speed}`);
      });
      if (L.pc) txt(this, cx, 960, t('battle.watch.keys'), 18, '#9aa0c8').setDepth(5001);
    }
  }

  confirmSurrender(): void {
    if (this.match.over || this.modalOpen) return;
    openModal(this, 560, 400, t('battle.surrender.title'), (box, close) => {
      box.add(txt(this, 0, -30, t('battle.surrender.body'), 26));
      box.add(button(this, -125, 100, 220, 84, t('battle.surrender.keep'), COLORS.blue, close, 28));
      box.add(
        button(
          this,
          125,
          100,
          220,
          84,
          t('battle.surrender'),
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
      c.add(txt(this, 0, -16, t('battle.net.lost'), 34, '#ffd84a'));
      c.add(txt(this, 0, 30, t('battle.net.reconnecting'), 24));
    } else {
      c.add(txt(this, 0, -16, t('battle.net.failed'), 32, '#ff9a9a'));
      c.add(
        button(
          this,
          0,
          40,
          220,
          60,
          t('common.back'),
          COLORS.blue,
          () => this.scene.start('Lobby', { tab: 'battle' }),
          24,
        ),
      );
    }
    this.netBanner = c;
  }

  private updateHud(): void {
    const m = this.match;
    const secs = Math.max(0, Math.ceil(m.timeLeft));
    this.timerT.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    const dbl = m.doubleElixir;
    this.timerSub.setText(m.overtime ? t('battle.suddenDeath') : dbl ? t('battle.double') : t('battle.time'));
    this.timerSub.setColor(dbl ? '#ff8af0' : '#c9c3ff');
    this.timerT.setColor(secs <= 10 ? '#ff6a6a' : '#ffffff');
    if (secs <= 10 && secs < this.lastCount && secs > 0 && this.started) {
      this.lastCount = secs;
      Sfx.play('countdown');
    }
    const g = this.crownG;
    g.clear();
    const { foe, me } = this.crownLayout;
    for (let i = 0; i < 3; i++) {
      drawCrown(g, foe.x + i * foe.dx, foe.y, foe.r, i < m.crowns[this.foe] ? COLORS.enemy : 0x3b3f63);
      drawCrown(g, me.x + i * me.dx, me.y, me.r, i < m.crowns[this.me] ? COLORS.player : 0x3b3f63);
    }
  }

  /** Rótulo en mitad de la arena (no se repite si ya está en pantalla). */
  private toast(msg: string, color = 0xffffff, y = ARENA.riverY - 90): void {
    if (this.toasts.has(msg)) return;
    const c = this.add.container(W / 2, y).setDepth(6000);
    const label = kit.text(this, 0, 0, msg, 'h2', cssColor(color), { size: 32 });
    const w = Math.min(W - 40, label.width + 70);
    const bg = kit.panel(this, -w / 2, -34, w, 64, 'dark').setAlpha(0.92);
    c.add([bg, label]);
    c.setScale(0.6).setAlpha(0);
    this.toasts.set(msg, c);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c,
      y: y - 36,
      alpha: 0,
      delay: 1250,
      duration: 450,
      onComplete: () => {
        c.destroy();
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
    const label = kit.text(this, 0, -2, text, 'body', mine ? '#1f56c4' : '#c8303a', { size: 23, fontStyle: '700' });
    const w = Math.max(150, label.width + 44);
    const g = this.add.graphics();
    const tail = mine ? 1 : -1;
    g.fillStyle(kit.C.ink, 0.35).fillRoundedRect(-w / 2, -28, w, 64, 20);
    g.fillStyle(kit.C.ink).fillRoundedRect(-w / 2 - 4, -36, w + 8, 68, 22);
    g.fillTriangle(tail * 26, 26, tail * 62, 26, tail * 74, 50);
    g.fillStyle(0xffffff).fillRoundedRect(-w / 2, -32, w, 60, 18);
    g.fillTriangle(tail * 30, 24, tail * 58, 24, tail * 68, 42);
    g.fillStyle(0xdfe6ff).fillRoundedRect(-w / 2, 8, w, 20, { tl: 0, tr: 0, bl: 18, br: 18 });
    c.add([g, label]);
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2200, duration: 300, onComplete: () => c.destroy() });
    this.bubbles[team] = c;
    Sfx.play('emote');
  }

  // ───────────────────────── Intro VS ─────────────────────────

  private intro(): void {
    const P = this.source.players;
    const c = this.add.container(0, 0).setDepth(9500);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, L.pc ? 0 : 0.7);
    // en PC la intro se escala para caber en 1080: las bandas se alargan hasta los bordes
    const ext = L.pc ? (L.w / L.battleZoom / (L.h / H) - W) / 2 + 30 : 30;
    const band = (info: PlayerInfo, y: number, variant: 'red' | 'blue', fromX: number) => {
      const b = this.add.container(fromX, 0);
      b.add(kit.panel(this, -ext, y, W + 2 * ext, 230, variant));
      levelBadge(this, 100, y + 112, info.kingLevel, 42).forEach((o) => b.add(o));
      b.add(
        kit.text(this, 168, y + 88, info.bot ? t('battle.bot', { name: info.name }) : info.name, 'h1', '#ffffff', {
          size: 46,
          originX: 0,
        }),
      );
      b.add(kit.pill(this, 168, y + 156, 200, 'ic_trophy', String(info.trophies)).root);
      return b;
    };
    const top = band(P[this.foe], 300, 'red', -W - 2 * ext);
    const bot = band(P[this.me], 760, 'blue', W + 2 * ext);
    const glow = this.add
      .image(W / 2, 646, 'ui_glow')
      .setTint(0xffc93c)
      .setScale(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const vs = kit.text(this, W / 2, 646, 'VS', 'hero', '#ffd75a', { size: 150 }).setScale(0);
    c.add([dim, top, bot, glow, vs]);
    this.fitOverlay(c, 0.6);
    this.tweens.add({ targets: [top, bot], x: 0, duration: 420, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: glow,
      scale: 1.6,
      alpha: { from: 1, to: 0.55 },
      delay: 320,
      duration: 420,
      ease: 'Quad.easeOut',
    });
    this.tweens.add({
      targets: vs,
      scale: 1,
      delay: 320,
      duration: 340,
      ease: 'Back.easeOut',
      onStart: () => {
        Sfx.play('boom');
        this.cameras.main.flash(160, 255, 240, 200);
      },
    });
    this.time.delayedCall(1950, () => {
      this.tweens.add({ targets: top, x: -W - 2 * ext, duration: 300, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: bot, x: W + 2 * ext, duration: 300, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: [vs, dim, glow], alpha: 0, duration: 300, onComplete: () => c.destroy() });
      this.time.delayedCall(250, () => {
        this.go();
        Sfx.play('fight');
        this.toast(t('battle.fight'), 0xffd84a, ARENA.riverY);
      });
    });
  }

  private go(): void {
    this.started = true;
    this.source.begin();
    Music.play('battle');
    if (this.data_.kind === 'tutorial' && this.hand && this.source instanceof LocalSource) {
      this.coach = new TutorialCoach(this, this.source, this.hand, () => this.skipTutorial());
      this.coach.start();
    }
  }

  /** Salir del tutorial sin terminarlo (se puede repetir desde Perfil). */
  private skipTutorial(): void {
    if (this.modalOpen || this.resultShown) return;
    this.coach?.destroy();
    this.coach = null;
    kit.goTo(this, Profile.loaded ? 'Lobby' : 'Boot', { tab: 'battle' });
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
            this.particles.dust(ev.x, v.y(ev.y), 12, this.dustTint);
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
          this.particles.sparks(ev.x, v.y(ev.y) - ev.h, ev.scale >= 3 ? 7 : 4, palette(ev.palette)[3]);
          if (ev.scale >= 3) Sfx.play('hit');
          break;
        case 'damage': {
          const body = m.body(ev.id);
          if (!ev.silent && body && heavyHit(ev.amount, body.maxHp)) this.freeze(HIT_STOP.heavy);
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
          this.particles.dust(ev.x, v.y(ev.y), 6, this.dustTint);
          this.particles.sparks(ev.x, v.y(ev.y), 6, palette(ev.palette)[3]);
          break;
        case 'spellCast':
          this.spellFx(ev.team, ev.card, ev.x, v.y(ev.y));
          if (ev.team === this.me) this.clearPending(ev.card);
          break;
        case 'spellImpact':
          Sfx.play('boom');
          shake(this, 180, 0.007);
          this.spellBlast(ev.team, ev.card, ev.x, v.y(ev.y));
          this.freeze(HIT_STOP.spell);
          break;
        case 'death': {
          const uv = this.units.get(ev.id);
          if (uv) this.particles.smoke(uv.x, uv.y - 8, 3, 0xe9e6f2, 18);
          uv?.onDeath();
          this.units.delete(ev.id);
          break;
        }
        case 'kingAwake':
          this.towers.get(m.towersBy[ev.team].king.id)?.onAwake();
          this.toast(ev.team === this.me ? t('battle.toast.myKing') : t('battle.toast.foeKing'), 0xffd84a);
          break;
        case 'towerDestroyed': {
          const tv = this.towers.get(ev.id);
          tv?.onDestroyed(this.fx);
          if (tv) this.towerBlast(tv.t.x, tv.sy, tv.mine);
          this.freeze(HIT_STOP.tower);
          break;
        }
        case 'crown':
          if (ev.team === this.me) Sfx.play('crown');
          if (ev.crowns < 3) {
            const mine = ev.team === this.me;
            this.toast(
              this.isPlayer
                ? mine
                  ? t('battle.toast.myCrown')
                  : t('battle.toast.foeCrown')
                : t('battle.toast.crownFor', { name: this.source.players[ev.team].name }),
              this.teamColor(ev.team),
            );
          }
          break;
        case 'doubleElixir':
          this.toast(t('battle.toast.double'), 0xff8af0);
          break;
        case 'overtime':
          Music.play('overtime');
          this.lastCount = 99;
          this.toast(t('battle.toast.overtime'), 0xffd84a);
          break;
        case 'emote':
          this.emote(ev.team, emoteText(ev.id));
          break;
        case 'end':
          this.hand?.hideGhost();
          this.coach?.destroy();
          this.coach = null;
          this.time.delayedCall(ev.reason === 'king' ? 1200 : ev.reason === 'overtime' ? 1000 : 0, () =>
            this.endMatch(ev.winner),
          );
          break;
      }
    }
  }

  /** Color del polvo: el del suelo de la arena, más claro. */
  private get dustTint(): number {
    return Phaser.Display.Color.ValueToColor(this.theme.grass[0]).lighten(22).color;
  }

  /** Explosión al caer un hechizo: destello, chispas, ascuas, humo y quemadura en el suelo. */
  private spellBlast(team: Team, key: string, x: number, y: number): void {
    const card = this.match.cardFor(team, key);
    const pal = palette(card.palette);
    const r = card.radiusSpell;
    this.particles.flash(x, y, pal[3], r * 3.2, 320);
    this.particles.sparks(x, y, 22, pal[3]);
    this.particles.embers(x, y, 10, pal[2], r);
    this.particles.smoke(x, y, 6, 0x7a7d8e, r * 0.8);
    this.particles.dust(x, y, 10, this.dustTint);
    this.particles.scorch(x, y, r * 0.9);
  }

  /** Caída de una torre: gran destello, columna de humo, ascuas, cascotes y quemadura que se queda. */
  private towerBlast(x: number, y: number, mine: boolean): void {
    this.particles.flash(x, y - 30, 0xffd36a, 320, 420);
    this.particles.smoke(x, y - 20, 18, 0x6b6e80, 70);
    this.particles.embers(x, y - 30, 22, 0xff9a3c, 90);
    this.particles.chunks(x, y - 30, 14, mine ? 0x8f91a0 : 0x9a8f88);
    this.particles.dust(x, y + 10, 16, this.dustTint);
    this.particles.scorch(x, y + 6, 70, true);
  }

  /** Hit-stop: congela animaciones y simulación un instante (luego recupera el tiempo). */
  private freeze(ms: number): void {
    if (this.hitStop.trigger(this.time.now, ms)) this.setTimeScale(0.06);
  }

  private setTimeScale(k: number): void {
    this.tweens.timeScale = k;
    this.anims.globalTimeScale = k;
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
    if (this.data_.kind === 'tutorial') return this.showTutorialResult(outcome);
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
    // en PC el fondo oscuro lo pone fitOverlay a pantalla completa
    if (!L.pc) c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.82));
    this.fitOverlay(c, 0.82);
    const tone = outcome === 'win' ? 0xffc93c : outcome === 'loss' ? 0xff5a64 : 0xaab3e8;
    const title = outcome === 'win' ? t('result.victory') : outcome === 'loss' ? t('result.defeat') : t('result.draw');
    this.resultHeader(c, title, tone, outcome === 'win');
    this.drawScore(c, P);

    void this.showRewards(c, outcome);
  }

  /**
   * Recompensas: las calcula el servidor con SU partida y llegan en el mensaje 'rewards'.
   * En práctica sin conexión y en amistosas no hay premios.
   */
  private async awaitRewards(): Promise<BattleResult | 'practice' | 'friendly' | null> {
    const src = this.source;
    if (!(src instanceof OnlineSource)) return 'practice';
    if (src.session.start?.mode === 'friendly') return 'friendly';
    for (let i = 0; i < 50 && !src.session.rewards; i++) await new Promise((r) => setTimeout(r, 100));
    const r = src.session.rewards;
    if (!r) return null;
    Profile.applyState(r.state);
    return r.result;
  }

  private async showRewards(c: Phaser.GameObjects.Container, outcome: BattleOutcome): Promise<void> {
    const res = await this.awaitRewards();
    if (!this.sys.isActive()) return;
    let y = 640;
    let i = 0;
    const row = (icon: string, label: string, value: string, col: string, count?: number) => {
      const r = this.add.container(0, 0).setAlpha(0);
      r.add(kit.panel(this, 70, y - 42, W - 140, 84, 'card'));
      r.add(kit.panel(this, 84, y - 34, 68, 64, 'inset'));
      r.add(this.add.image(118, y - 2, icon).setDisplaySize(50, 50));
      r.add(kit.text(this, 172, y - 2, label, 'body', '#dfe4ff', { size: 22, originX: 0 }));
      const vt = kit.text(this, W - 96, y - 2, value, 'number', col, { size: 34, originX: 1 });
      r.add(vt);
      c.add(r);
      r.x = 40;
      this.tweens.add({ targets: r, x: 0, alpha: 1, delay: 250 + i * 160, duration: 260, ease: 'Cubic.easeOut' });
      if (count !== undefined) {
        const o = { v: 0 };
        this.tweens.add({
          targets: o,
          v: count,
          delay: 350 + i * 160,
          duration: 600,
          ease: 'Cubic.easeOut',
          onUpdate: () => vt.setText(`${count >= 0 ? '+' : ''}${Math.round(o.v)}`),
        });
      }
      i++;
      y += 100;
    };
    const banner = (msg: string, variant: 'gold' | 'dark' = 'gold') => {
      const b = this.add.container(W / 2, y + 6);
      b.add(kit.panel(this, -300, -34, 600, 68, variant));
      b.add(
        kit.text(this, 0, -2, msg, variant === 'gold' ? 'h3' : 'body', '#ffffff', {
          size: variant === 'gold' ? 28 : 21,
        }),
      );
      b.setScale(0);
      c.add(b);
      this.tweens.add({ targets: b, scale: 1, delay: 250 + i++ * 160, duration: 320, ease: 'Back.easeOut' });
      y += 88;
    };
    if (res === 'practice') banner(t('result.practice'), 'dark');
    else if (res === 'friendly') banner(t('result.friendly'), 'dark');
    else if (!res) banner(t('result.rewardsLater'), 'dark');
    else {
      row(
        'ic_trophy',
        t('result.trophies'),
        `${res.trophies >= 0 ? '+' : ''}0`,
        res.trophies >= 0 ? '#ffd75a' : '#ff8a92',
        res.trophies,
      );
      if (res.gold) row('ic_gold', t('result.gold'), `+${fmtNum(res.gold)}`, '#ffd75a');
      row('ic_crown', t('result.crowns'), `${Profile.d.crowns}/${CROWNS_FOR_CROWN_BALL}`, '#ffffff');
      if (outcome === 'win') {
        if (res.ball) row(`ball_${res.ball}`, t('result.ball'), ballLabel(res.ball), '#7dff8a');
        else row('ic_lock', t('result.slotsFull'), '—', '#aab3e8');
      }
      if (res.arenaUp) banner(t('result.newArena', { name: arenaName(Profile.arena) }));
      if (res.kingLevelUp) banner(t('result.kingLevel', { n: Profile.d.kingLevel }));
    }
    const go = () => this.scene.start(Profile.loaded ? 'Lobby' : 'Boot', { tab: 'battle' });
    c.add(
      button(this, W / 2, Math.min(1190, y + 70), 340, 96, t('common.ok'), COLORS.green, go, 42, {
        hotkey: L.pc ? 'Enter' : undefined,
      }),
    );
    this.input.keyboard?.once('keydown-ENTER', go);
  }

  /** Fin del tutorial: si se gana, el servidor da el premio (una vez); si no, se puede repetir. */
  private showTutorialResult(outcome: BattleOutcome): void {
    const c = this.add.container(0, 0).setDepth(9000);
    if (!L.pc) c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.82));
    this.fitOverlay(c, 0.82);
    const win = outcome === 'win';
    this.resultHeader(c, win ? t('result.victory') : t('result.defeat'), win ? 0xffc93c : 0xff5a64, win);
    this.drawScore(c, this.source.players);
    const exit = () => this.scene.start(Profile.loaded ? 'Lobby' : 'Boot', { tab: 'battle' });
    const line = (msg: string, y: number, color = '#dfe4ff', size = 24) =>
      c.add(kit.text(this, W / 2, y, msg, 'body', color, { size, wordWrap: { width: W - 120 } }));
    if (!win) {
      line(t('tut.retryBody'), 640);
      c.add(
        button(
          this,
          W / 2 - 170,
          780,
          300,
          96,
          t('tut.retry'),
          COLORS.green,
          () => this.scene.restart({ kind: 'tutorial' }),
          36,
        ),
      );
      c.add(button(this, W / 2 + 170, 780, 300, 96, t('tut.exit'), COLORS.panelDark, exit, 36));
      return;
    }
    c.add(button(this, W / 2, 860, 340, 96, t('common.ok'), COLORS.green, exit, 42));
    if (!Profile.loaded) return void line(t('tut.offline'), 660);
    if (Profile.d.tutorialDone) return void line(t('tut.doneBefore'), 660, '#7dff8a');
    void Profile.completeTutorial()
      .then((r) => {
        if (!this.sys.isActive()) return;
        Sfx.play('coin');
        line(t('tut.done'), 620, '#ffd75a', 34);
        c.add(this.add.image(W / 2 - 150, 700, 'ic_gold').setDisplaySize(48, 48));
        c.add(kit.text(this, W / 2 - 118, 700, `+${r.gold}`, 'number', '#ffd75a', { size: 34, originX: 0 }));
        c.add(this.add.image(W / 2 + 60, 700, 'ic_gem').setDisplaySize(48, 48));
        c.add(kit.text(this, W / 2 + 92, 700, `+${r.gems}`, 'number', '#7dff8a', { size: 34, originX: 0 }));
      })
      .catch(() => this.sys.isActive() && line(t('result.rewardsLater'), 660));
  }

  /** Título del resultado con rayos de luz detrás (y coronas si se gana). */
  private resultHeader(c: Phaser.GameObjects.Container, title: string, tone: number, rays: boolean): void {
    if (rays) {
      const r = this.add
        .image(W / 2, 190, 'ui_rays')
        .setTint(tone)
        .setAlpha(0.35)
        .setScale(1.6)
        .setBlendMode(Phaser.BlendModes.ADD);
      c.add(r);
      this.tweens.add({ targets: r, angle: 360, duration: 24000, repeat: -1 });
    }
    const glow = this.add
      .image(W / 2, 190, 'ui_glow')
      .setTint(tone)
      .setAlpha(0.5)
      .setScale(2.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    const tt = kit.text(this, W / 2, 190, title, 'hero', cssColor(tone), { size: 92 }).setScale(0);
    c.add([glow, tt]);
    this.tweens.add({ targets: tt, scale: 1, duration: 460, ease: 'Back.easeOut' });
  }

  private drawScore(c: Phaser.GameObjects.Container, P: Record<Team, PlayerInfo>): void {
    const m = this.match;
    const row = (y: number, team: Team, variant: 'red' | 'blue') => {
      c.add(kit.panel(this, 40, y - 54, W - 80, 108, variant));
      c.add(kit.text(this, 76, y - 2, P[team].name, 'h3', '#ffffff', { size: 30, originX: 0 }));
      const cg = this.add.graphics();
      for (let k = 0; k < 3; k++) drawCrown(cg, 520 + k * 54, y - 2, 20, k < m.crowns[team] ? 0xffc93c : 0x3b416e);
      c.add(cg);
    };
    row(360, this.foe, 'red');
    row(486, this.me, 'blue');
  }

  /** Resultado para espectadores y repeticiones (sin recompensas). */
  private showWatchResult(winner: Winner): void {
    const P = this.source.players;
    const c = this.add.container(0, 0).setDepth(9000);
    if (!L.pc) c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.82));
    this.fitOverlay(c, 0.82);
    const title = winner === 'draw' ? t('result.draw') : t('result.wins', { name: P[winner].name });
    this.resultHeader(c, title, 0xffc93c, winner !== 'draw');
    this.drawScore(c, P);
    const back = this.data_.kind === 'replay' && this.data_.back ? this.data_.back : 'Tv';
    c.add(button(this, W / 2, 700, 340, 96, t('common.back'), COLORS.green, () => this.scene.start(back), 40));
  }

  /**
   * Las pantallas superpuestas (intro, resultados) se diseñan a 720×1280. En PC se
   * escalan para caber en 1080 de alto, centradas, con un fondo oscuro que cubre los lados.
   */
  private fitOverlay(c: Phaser.GameObjects.Container, dim: number): void {
    c.setScrollFactor(0);
    if (!L.pc) return;
    // la cámara tiene zoom (tableta): lo visible mide L.w/zoom × L.h/zoom, centrado en el lienzo
    const z = L.battleZoom;
    const s = L.h / H;
    c.setScale(s).setPosition((L.w - W * s) / 2, (L.h - H * s) / 2);
    const bd = this.add
      .rectangle(L.w / 2, L.h / 2, L.w / z, L.h / z, 0x05060f, dim)
      .setScrollFactor(0)
      .setDepth(c.depth - 1);
    c.once('destroy', () => bd.destroy());
  }

  // ───────────────────────── Bucle ─────────────────────────

  override update(_time: number, delta: number): void {
    const realDt = delta / 1000;
    this.elapsed += realDt;
    this.fpsWatch?.frame(delta);
    if (!this.river) this.drawWaves();
    // durante el hit-stop todo va a cámara muy lenta y la simulación espera
    const frozen = this.hitStop.active(this.time.now);
    if (!frozen && this.tweens.timeScale !== 1) this.setTimeScale(1);
    const dtFrame = frozen ? realDt * 0.06 : realDt;

    if (this.started) {
      const events = this.source.advance(this.hitStop.step(this.time.now, realDt));
      if (this.source.takeReset()) this.rebuildViews();
      else this.handle(events);
      this.coach?.onEvents(events);
      this.coach?.update(realDt);
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
