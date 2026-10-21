import Phaser from 'phaser';
import { BALLS, getCard, type BallReward, type BallCardStack, type Rarity } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { Music, Sfx } from '../systems/Sfx';
import { makeCardView, RARITY_COLOR, RARITY_CSS } from '../ui/CardView';
import { fmtNum, sy } from '../ui/style';
import * as kit from '../ui/kit';
import { t, cardName, rarityLabel, ballLabel } from '../i18n';
import { L } from '../layout';
import type { TabKey } from '../ui/tabs/Tab';
import { BaseScene } from './BaseScene';
import { shake as shakeCam } from '../systems/Shake';
import { BattleParticles } from '../battle/Particles';
import { particleAmount } from '../systems/Quality';

const RAR_SFX: Record<string, string> = { common: 'card', rare: 'rare', epic: 'epic', legendary: 'legendary' };
const RAR_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

type Item = { kind: 'gold'; amount: number } | { kind: 'gems'; amount: number } | ({ kind: 'card' } & BallCardStack);
type Step = 'intro' | 'wait' | 'opening' | 'reveal' | 'summary';

/** Mezcla de dos colores (0 = a, 1 = b). */
function mix(a: number, b: number, k: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(a),
    Phaser.Display.Color.ValueToColor(b),
    100,
    Math.round(k * 100),
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

/** Dorso de las cartas (sale boca abajo de la Pokéball y se da la vuelta). */
function cardBackTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('card_back')) return;
  const w = 250,
    h = 300;
  const tex = scene.textures.createCanvas('card_back', w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const rr = (x: number, y: number, ww: number, hh: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  };
  ctx.fillStyle = '#0b0d1f';
  rr(0, 0, w, h, 26);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3b4bb0');
  g.addColorStop(1, '#151b52');
  ctx.fillStyle = g;
  rr(6, 6, w - 12, h - 12, 22);
  ctx.fill();
  // rayas diagonales suaves
  ctx.save();
  rr(6, 6, w - 12, h - 12, 22);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 10;
  for (let x = -h; x < w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  ctx.restore();
  // marco dorado
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = 5;
  rr(16, 16, w - 32, h - 32, 16);
  ctx.stroke();
  // emblema de Pokéball
  const cx = w / 2,
    cy = h / 2,
    r = 56;
  ctx.fillStyle = '#0b0d1f';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8303a';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#f2f4ff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#0b0d1f';
  ctx.fillRect(cx - r, cy - 6, r * 2, 12);
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  tex.refresh();
}

/**
 * Apertura de Pokéball: cae, se tambalea 3 veces mientras la luz toma el color de lo
 * mejor que trae, se abre de golpe y las cartas salen volando boca abajo hasta el centro,
 * donde se dan la vuelta. Las legendarias tienen su propia secuencia (oscuridad, haz de luz
 * y revelación con destello).
 */
export class BallOpenScene extends BaseScene {
  private reward!: BallReward;
  private back: TabKey = 'battle';
  private step: Step = 'intro';
  private queue: Item[] = [];
  private busy = false;
  private item: Phaser.GameObjects.Container | null = null;
  private rays!: Phaser.GameObjects.Container;
  private light!: Phaser.GameObjects.Image;
  /** Aura del color de la mejor rareza: crece con cada sacudida. */
  private aura!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private ball!: Phaser.GameObjects.Container;
  private ballBot!: Phaser.GameObjects.Image;
  private ballTop!: Phaser.GameObjects.Image;
  private counter!: Phaser.GameObjects.Container;
  private counterT!: Phaser.GameObjects.Text;
  private fx!: BattleParticles;
  /** Oscuridad de la secuencia legendaria. */
  private dark!: Phaser.GameObjects.Rectangle;
  /** Rareza más alta de la Pokéball (marca el color de la luz al tambalearse). */
  private best: Rarity = 'common';

  constructor() {
    super('BallOpen');
  }

  init(data: { reward: BallReward; back?: TabKey }): void {
    this.reward = data.reward;
    this.back = data.back || 'battle';
    this.step = 'intro';
    this.queue = [];
    this.busy = false;
    this.item = null;
    this.modalOpen = 0;
    this.best = data.reward.cards.reduce<Rarity>((b, c) => (RAR_RANK[c.rarity] > RAR_RANK[b] ? c.rarity : b), 'common');
  }

  /** Dónde está la Pokéball (y de dónde sale todo). */
  private get bx(): number {
    return L.w / 2;
  }
  private get by(): number {
    return sy(760);
  }
  /** Dónde se queda cada carta al revelarse. */
  private get cy(): number {
    return sy(600);
  }

  create(): void {
    const r = this.reward;
    const cfg = BALLS[r.type];
    const W = L.w,
      H = L.h;
    cardBackTexture(this);
    this.cameras.main.setZoom(1);
    kit.menuBackground(this, W, H);
    // oscurece el fondo para que destaque la Pokéball
    this.add.rectangle(W / 2, H / 2, W, H, kit.C.ink, 0.55);
    kit.fadeIn(this);
    this.fx = new BattleParticles(this);
    this.fx.amount = particleAmount();

    // luz radial detrás de la Pokéball (cambia de color con cada carta)
    this.light = this.add.image(this.bx, this.by, 'ui_glow').setTint(cfg.colors[0]).setBlendMode(Phaser.BlendModes.ADD);
    this.light.setDisplaySize(620, 620).setAlpha(0.45);
    this.tweens.add({
      targets: this.light,
      alpha: 0.25,
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });

    this.aura = this.add
      .image(this.bx, this.by, 'ui_glow')
      .setTint(RARITY_COLOR[this.best])
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(300, 300)
      .setAlpha(0);

    // rayos de luz giratorios (ocultos hasta abrir)
    this.rays = this.add.container(this.bx, this.by).setAlpha(0);
    for (let i = 0; i < 16; i++) {
      const ray = this.add
        .image(0, 0, 'fx_ray')
        .setOrigin(0.5, 0)
        .setAngle((i * 360) / 16)
        .setAlpha(0.22)
        .setScale(1.4, 2.2)
        .setBlendMode(Phaser.BlendModes.ADD);
      ray.setTint(cfg.colors[0]);
      this.rays.add(ray);
    }
    this.dark = this.add
      .rectangle(W / 2, H / 2, W * 1.4, H * 1.4, 0x000000, 1)
      .setAlpha(0)
      .setDepth(5);

    this.title = kit.text(this, W / 2, sy(170), ballLabel(r.type), 'hero', '#ffffff', { size: 64 }).setDepth(20);
    this.hint = kit.text(this, W / 2, sy(1180), L.pc ? t('ball.tapToOpenPc') : t('ball.tapToOpen'), 'h3', '#dfe4ff', {
      size: 28,
    });
    this.tweens.add({ targets: this.hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });

    this.ballShadow = this.add.ellipse(W / 2, sy(900), 200, 40, 0x000000, 0.4).setScale(0.2);
    this.ball = this.add.container(W / 2, -200);
    this.ballBot = this.add.image(0, 0, `ball_${r.type}_bot`).setScale(2.2);
    this.ballTop = this.add
      .image(-56 * 2.2, 0, `ball_${r.type}_top`)
      .setScale(2.2)
      .setOrigin(8 / 128, 0.5);
    this.ball.add([this.ballBot, this.ballTop]);

    // caída con rebote
    this.tweens.add({
      targets: this.ball,
      y: this.by,
      duration: 700,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        this.step = 'wait';
        this.fx.dust(this.bx, this.by + 70, 10, 0x8f98d8);
      },
    });
    this.tweens.add({ targets: this.ballShadow, scale: 1, duration: 700, ease: 'Bounce.easeOut' });
    this.time.delayedCall(200, () => Sfx.play('wobble'));

    // contador de cartas restantes
    this.counter = this.add
      .container(W - 110, sy(110))
      .setVisible(false)
      .setDepth(20);
    this.counter.add(kit.panel(this, -64, -40, 128, 76, 'blue'));
    this.counterT = kit.text(this, 0, -4, '', 'h2', '#ffffff', { size: 38 });
    this.counter.add(this.counterT);

    this.input.on('pointerup', () => this.advance());
    // teclado (PC): Espacio o Intro abren y pasan las cartas
    this.input.keyboard?.on('keydown-SPACE', () => this.advance());
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.step === 'summary') kit.goTo(this, 'Lobby', { tab: this.back });
      else this.advance();
    });
  }

  advance(): void {
    if (this.busy) return;
    if (this.step === 'wait') this.wobble();
    else if (this.step === 'reveal') this.nextItem();
    // en 'summary' mandan los botones
  }

  /** Tres sacudidas; con cada una la luz se acerca al color de lo mejor que trae. */
  wobble(): void {
    this.step = 'opening';
    this.busy = true;
    this.hint.setVisible(false);
    const from = BALLS[this.reward.type].colors[0];
    const to = RARITY_COLOR[this.best];
    const strong = RAR_RANK[this.best] >= RAR_RANK.epic;
    const shake = (i: number) => {
      if (i >= 3) {
        this.open();
        return;
      }
      Sfx.play('wobble');
      const k = (i + 1) / 3;
      this.tintLight(mix(from, to, k));
      this.tweens.add({
        targets: this.light,
        displayWidth: 620 + 120 * k,
        displayHeight: 620 + 120 * k,
        duration: 200,
      });
      // el aura del color de la mejor carta se enciende poco a poco (más en épicas y legendarias)
      this.tweens.add({
        targets: this.aura,
        alpha: (strong ? 1 : 0.75) * k,
        displayWidth: 300 + 420 * k,
        displayHeight: 300 + 420 * k,
        duration: 220,
        ease: 'Quad.easeOut',
      });
      this.fx.sparks(this.bx, this.by, 4 + i * 4, to);
      if (strong && i === 2) this.fx.flash(this.bx, this.by, to, 360, 300);
      this.cameras.main.zoomTo(1 + (i + 1) * 0.03, 150);
      this.tweens.add({
        targets: this.ball,
        angle: i % 2 ? 22 : -22,
        yoyo: true,
        duration: 150,
        ease: 'Sine.easeInOut',
        onComplete: () => this.time.delayedCall(320, () => shake(i + 1)),
      });
    };
    this.tweens.add({ targets: this.ball, scale: 1.1, yoyo: true, duration: 120, onComplete: () => shake(0) });
  }

  /** Se abre de golpe: destello, onda, las dos mitades salen despedidas. */
  open(): void {
    const col = RARITY_COLOR[this.best];
    Sfx.play('open');
    const cam = this.cameras.main;
    cam.zoomTo(1.14, 90, 'Quad.easeOut', true);
    this.time.delayedCall(110, () => cam.zoomTo(1, 380, 'Quad.easeOut', true));
    cam.flash(300, 255, 255, 255);
    shakeCam(this, 220, 0.012);
    this.fx.flash(this.bx, this.by, col, 720, 420);
    this.fx.sparks(this.bx, this.by, 34, col);
    this.fx.sparks(this.bx, this.by, 16, 0xffffff);
    this.shockwave(this.bx, this.by, col);
    // las mitades: la de arriba sale volando girando, la de abajo cae
    this.tweens.add({ targets: this.ballTop, angle: -115, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: this.ballTop,
      x: '-=260',
      y: '-=320',
      angle: -420,
      alpha: 0,
      delay: 160,
      duration: 650,
      ease: 'Quad.easeOut',
    });
    this.tweens.add({
      targets: this.ballBot,
      y: '+=260',
      angle: 40,
      alpha: 0,
      delay: 160,
      duration: 600,
      ease: 'Quad.easeIn',
    });
    this.tweens.add({ targets: this.ballShadow, alpha: 0, delay: 200, duration: 300 });
    this.tweens.add({ targets: this.aura, alpha: 0, displayWidth: 1100, displayHeight: 1100, duration: 500 });
    this.tweens.add({ targets: this.rays, alpha: 1, duration: 300 });
    this.tweens.add({ targets: this.rays, angle: 360, duration: 16000, repeat: -1 });
    this.queue = [];
    if (this.reward.gold) this.queue.push({ kind: 'gold', amount: this.reward.gold });
    if (this.reward.gems) this.queue.push({ kind: 'gems', amount: this.reward.gems });
    for (const c of this.reward.cards) this.queue.push({ kind: 'card', ...c });
    this.time.delayedCall(480, () => {
      this.busy = false;
      this.step = 'reveal';
      this.nextItem();
    });
  }

  /** Anillo de luz que se expande. */
  shockwave(x: number, y: number, color: number, size = 520): void {
    const g = this.add.graphics({ x, y }).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(14, color, 0.9).strokeCircle(0, 0, 40);
    g.lineStyle(6, 0xffffff, 0.8).strokeCircle(0, 0, 40);
    g.setScale(0.3);
    this.tweens.add({
      targets: g,
      scale: size / 80,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  /** Destellos que salen en todas direcciones (tarjetas reveladas, monedas…). */
  burst(x: number, y: number, color: number, n = 16): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        d = 120 + Math.random() * 260;
      const p = this.add
        .image(x, y, 'ui_glow')
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(12)
        .setScale(0.06 + Math.random() * 0.1);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.01,
        duration: 600 + Math.random() * 500,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** La luz y los rayos toman el color de lo que sale. */
  tintLight(color: number): void {
    this.light.setTint(color);
    this.rays.each((r: Phaser.GameObjects.GameObject) => (r as Phaser.GameObjects.Image).setTint(color));
  }

  clearItem(): void {
    if (!this.item) return;
    const old = this.item;
    this.item = null;
    this.tweens.add({
      targets: old,
      x: old.x - 600,
      angle: -12,
      alpha: 0,
      duration: 220,
      onComplete: () => old.destroy(),
    });
  }

  nextItem(): void {
    this.clearItem();
    const it = this.queue.shift();
    this.counter.setVisible(true);
    this.counterT.setText(String(this.queue.length + (it ? 1 : 0)));
    if (!it) {
      this.summary();
      return;
    }
    this.busy = true;
    if (it.kind === 'card') {
      if (it.rarity === 'legendary') this.legendaryIntro(() => this.flyCard(it, true));
      else this.flyCard(it, false);
    } else this.showCurrency(it);
  }

  /** Oro o gemas: un chorro de monedas desde la Pokéball y la cantidad que aparece. */
  showCurrency(it: Extract<Item, { kind: 'gold' | 'gems' }>): void {
    const gold = it.kind === 'gold';
    const icon = gold ? 'ic_gold' : 'ic_gem';
    this.tintLight(gold ? 0xffc93c : 0x44d17a);
    const c = this.add.container(L.w / 2, this.cy).setDepth(10);
    this.item = c;
    const big = this.add.image(0, -160, icon).setDisplaySize(190, 190);
    const amount = kit.text(this, 0, 4, `+${fmtNum(it.amount)}`, 'hero', gold ? '#ffd75a' : '#7dff9a', { size: 76 });
    const label = kit.text(this, 0, 76, gold ? t('result.gold') : t('ball.gems'), 'h2', '#ffffff', { size: 34 });
    c.add([big, amount, label]);
    big.setScale(0);
    amount.setAlpha(0);
    label.setAlpha(0);
    // monedas que vuelan de la Pokéball al centro
    const n = 12;
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(this.bx, this.by, icon).setDisplaySize(44, 44).setDepth(11);
      const side = (Math.random() - 0.5) * 420;
      this.flight(coin, this.bx, this.by, L.w / 2 + side * 0.15, this.cy - 160, side, 380 + i * 35, () => {
        coin.destroy();
        if (i % 3 === 0) Sfx.play('coin');
      });
    }
    this.time.delayedCall(380 + n * 35, () => {
      this.tweens.add({ targets: big, displayWidth: 190, displayHeight: 190, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [amount, label], alpha: 1, duration: 200 });
      this.burst(L.w / 2, this.cy - 160, gold ? 0xffc93c : 0x44d17a, 18);
      this.busy = false;
    });
  }

  /**
   * Mueve un objeto en arco (curva de Bézier) de (x0,y0) a (x1,y1); `side` desplaza el
   * punto de control a un lado. Llama a `done` al llegar.
   */
  flight(
    o: Phaser.GameObjects.Components.Transform,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    side: number,
    duration: number,
    done: () => void,
    onStep?: (k: number) => void,
  ): void {
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x0, y0),
      new Phaser.Math.Vector2((x0 + x1) / 2 + side, Math.min(y0, y1) - 260),
      new Phaser.Math.Vector2(x1, y1),
    );
    const p = new Phaser.Math.Vector2();
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        curve.getPoint(k, p);
        o.setPosition(p.x, p.y);
        onStep?.(k);
      },
      onComplete: done,
    });
  }

  /** La carta sale boca abajo, vuela en arco dejando estela y se da la vuelta en el centro. */
  flyCard(it: Extract<Item, { kind: 'card' }>, legendary: boolean): void {
    const card = getCard(it.key);
    const col = RARITY_COLOR[it.rarity];
    this.tintLight(col);
    const owned = Profile.d.cards[it.key];
    const c = this.add.container(this.bx, this.by).setDepth(10);
    this.item = c;
    const glow = this.add.image(0, 0, 'ui_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD);
    glow.setDisplaySize(520, 520).setAlpha(0);
    const view = makeCardView(this, card, 0, 0, 250, 300, {
      level: owned?.level,
      isNew: it.isNew,
      progress: owned ? { have: owned.count, need: Profile.cardsNeeded(it.key) } : null,
    });
    view.setVisible(false);
    const back = this.add.image(0, 0, 'card_back').setDisplaySize(250, 300);
    const name = kit.text(this, 0, 216, cardName(card), 'h1', '#ffffff', { size: 48 }).setAlpha(0);
    const rar = kit.text(this, 0, 266, rarityLabel(it.rarity), 'h3', RARITY_CSS[it.rarity], { size: 30 }).setAlpha(0);
    const count = kit.text(this, 0, 328, `x${it.count}`, 'hero', '#ffffff', { size: 66 }).setAlpha(0);
    c.add([glow, view, back, name, rar, count]);
    c.setScale(0.18);
    Sfx.play('cardFly');
    // la legendaria sube recta por el haz; el resto, en arco hacia un lado
    const side = legendary ? 0 : (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 80);
    const spins = legendary ? 1 : 2;
    let trail = 0;
    this.flight(
      c,
      this.bx,
      this.by,
      L.w / 2,
      this.cy - 150,
      side,
      legendary ? 900 : 520,
      () => this.flip(c, view, back, glow, [name, rar, count], it, legendary),
      (k) => {
        c.setScale(0.18 + 0.82 * k);
        c.setAngle((1 - k) * 360 * spins * (side < 0 ? -1 : 1));
        if (++trail % 2 === 0) this.fx.sparks(c.x, c.y, 2, col);
      },
    );
  }

  /** Vuelta de la carta y efecto según la rareza. */
  flip(
    c: Phaser.GameObjects.Container,
    view: Phaser.GameObjects.Container,
    back: Phaser.GameObjects.Image,
    glow: Phaser.GameObjects.Image,
    texts: Phaser.GameObjects.Text[],
    it: Extract<Item, { kind: 'card' }>,
    legendary: boolean,
  ): void {
    const col = RARITY_COLOR[it.rarity];
    c.setAngle(0);
    this.tweens.add({
      targets: back,
      scaleX: 0,
      duration: 110,
      ease: 'Quad.easeIn',
      onComplete: () => {
        back.setVisible(false);
        view.setVisible(true).setScale(0, 1);
        this.tweens.add({ targets: view, scaleX: 1, duration: 220, ease: 'Back.easeOut' });
        this.tweens.add({ targets: glow, alpha: 0.7, duration: 200 });
        this.tweens.add({ targets: glow, scale: glow.scale * 1.1, yoyo: true, repeat: -1, duration: 500 });
        this.tweens.add({ targets: texts, alpha: 1, duration: 220, delay: 120 });
        Sfx.play(RAR_SFX[it.rarity] || 'card');
        if (it.rarity !== 'common') this.burst(c.x, c.y, col, legendary ? 60 : 28);
        if (it.rarity === 'epic') {
          this.cameras.main.flash(260, 200, 140, 255);
          shakeCam(this, 220, 0.008);
          this.fx.flash(c.x, c.y, col, 520, 360);
        }
        if (legendary) this.legendaryReveal(c);
        this.time.delayedCall(legendary ? 700 : 260, () => (this.busy = false));
      },
    });
  }

  /** Legendaria (1/2): se oscurece todo, sube un haz de luz y la cámara se acerca despacio. */
  legendaryIntro(done: () => void): void {
    const col = RARITY_COLOR.legendary;
    this.tintLight(col);
    this.tweens.add({ targets: this.dark, alpha: 0.82, duration: 420 });
    this.tweens.add({ targets: this.rays, alpha: 0.35, duration: 420 });
    const beam = this.add
      .image(this.bx, this.by - 420, 'fx_soft')
      .setDisplaySize(170, 1200)
      .setTint(col)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(6);
    beam.setData('legendaryBeam', true);
    this.tweens.add({ targets: beam, alpha: 0.95, duration: 500 });
    this.tweens.add({ targets: beam, displayWidth: 210, yoyo: true, repeat: -1, duration: 260, delay: 500 });
    this.cameras.main.zoomTo(1.12, 1500, 'Sine.easeInOut', true);
    // la música casi desaparece hasta la revelación
    Music.duckFor(2.6, 0.15);
    shakeCam(this, 1300, 0.002);
    Sfx.play('wobble');
    // brasas que suben por el haz
    const ev = this.time.addEvent({
      delay: 90,
      repeat: 12,
      callback: () => this.fx.embers(this.bx, this.by, 3, col, 70),
    });
    this.time.delayedCall(1250, () => {
      ev.remove();
      done();
    });
  }

  /** Legendaria (2/2): destello blanco, onda y la cámara vuelve; el haz se apaga. */
  legendaryReveal(c: Phaser.GameObjects.Container): void {
    const col = RARITY_COLOR.legendary;
    const cam = this.cameras.main;
    cam.flash(500, 255, 255, 255);
    shakeCam(this, 520, 0.014);
    cam.zoomTo(1, 500, 'Quad.easeOut', true);
    this.shockwave(c.x, c.y, col, 900);
    this.fx.flash(c.x, c.y, 0xffffff, 900, 520);
    this.fx.sparks(c.x, c.y, 40, col);
    this.tweens.add({ targets: this.dark, alpha: 0.35, duration: 500 });
    this.tweens.add({ targets: this.rays, alpha: 1, duration: 500 });
    for (const o of this.children.list)
      if (o.getData?.('legendaryBeam'))
        this.tweens.add({ targets: o, alpha: 0, duration: 600, onComplete: () => o.destroy() });
    const ban = kit.text(this, 0, -210, t('ball.legendary'), 'hero', '#8ff7ec', { size: 58 });
    c.add(ban);
    ban.setScale(0);
    this.tweens.add({ targets: ban, scale: 1, duration: 400, ease: 'Back.easeOut', delay: 200 });
  }

  summary(): void {
    this.step = 'summary';
    this.counter.setVisible(false);
    this.cameras.main.setZoom(1);
    this.tintLight(0xffc93c);
    this.tweens.add({ targets: [this.ball, this.ballShadow, this.rays], alpha: 0, duration: 300 });
    this.tweens.add({ targets: this.dark, alpha: 0, duration: 300 });
    this.title.setText(t('ball.youGot'));
    const r = this.reward;
    const list = r.cards;
    // 4 columnas en móvil, 8 en PC
    const cols = L.pc ? 8 : 4;
    const W = L.w;
    // en PC se centra según las cartas que haya; en móvil, rejilla fija de 4
    const used = L.pc ? Math.min(cols, list.length) : cols;
    const cw = 140,
      ch = 168;
    list.forEach((it, i) => {
      const x = W / 2 - ((used - 1) * 170) / 2 + (i % cols) * 170,
        y = sy(380) + Math.floor(i / cols) * 236;
      const v = makeCardView(this, getCard(it.key), x, y, cw, ch, { isNew: it.isNew });
      v.add(kit.text(this, 0, ch / 2 + 24, `x${it.count}`, 'h3', '#ffffff', { size: 26 }));
      v.setScale(0).setDepth(10);
      this.tweens.add({ targets: v, scale: 1, duration: 240, delay: i * 70, ease: 'Back.easeOut' });
    });
    const rows = Math.ceil(list.length / cols);
    const ry = sy(380) + rows * 236;
    kit.pill(this, W / 2 - (r.gems ? 250 : 100), ry, 200, 'ic_gold', `+${fmtNum(r.gold)}`).root.setDepth(10);
    if (r.gems) kit.pill(this, W / 2 + 50, ry, 200, 'ic_gem', `+${r.gems}`).root.setDepth(10);
    kit
      .button(
        this,
        W / 2,
        Math.min(sy(1180), ry + 130),
        320,
        100,
        t('common.ok'),
        'success',
        () => kit.goTo(this, 'Lobby', { tab: this.back }),
        { size: 44, hotkey: L.pc ? t('lobby.enterKey') : undefined },
      )
      .setDepth(10);
  }
}
