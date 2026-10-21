import Phaser from 'phaser';
import { BALLS, getCard, type BallReward, type BallCardStack } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { Sfx } from '../systems/Sfx';
import { makeCardView, RARITY_COLOR, RARITY_CSS } from '../ui/CardView';
import { fmtNum, sy } from '../ui/style';
import * as kit from '../ui/kit';
import { t, cardName, rarityLabel, ballLabel } from '../i18n';
import { L } from '../layout';
import type { TabKey } from '../ui/tabs/Tab';
import { BaseScene } from './BaseScene';

const RAR_SFX: Record<string, string> = { common: 'card', rare: 'rare', epic: 'epic', legendary: 'legendary' };

type Item = { kind: 'gold'; amount: number } | { kind: 'gems'; amount: number } | ({ kind: 'card' } & BallCardStack);
type Step = 'intro' | 'wait' | 'opening' | 'reveal' | 'summary';

/**
 * Apertura de Pokéball: cae, se tambalea 3 veces (como al capturar),
 * se abre con un destello y va sacando las cartas una a una.
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
  private title!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private ball!: Phaser.GameObjects.Container;
  private ballBot!: Phaser.GameObjects.Image;
  private ballTop!: Phaser.GameObjects.Image;
  private counter!: Phaser.GameObjects.Container;
  private counterT!: Phaser.GameObjects.Text;

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
  }

  create(): void {
    const r = this.reward;
    const cfg = BALLS[r.type];
    const W = L.w,
      H = L.h;
    kit.menuBackground(this, W, H);
    // oscurece el fondo para que destaque la Pokéball
    this.add.rectangle(W / 2, H / 2, W, H, kit.C.ink, 0.55);
    kit.fadeIn(this);

    // luz radial detrás de la Pokéball (cambia de color con cada carta)
    this.light = this.add
      .image(W / 2, sy(760), 'ui_glow')
      .setTint(cfg.colors[0])
      .setBlendMode(Phaser.BlendModes.ADD);
    this.light.setDisplaySize(620, 620).setAlpha(0.45);
    this.tweens.add({
      targets: this.light,
      alpha: 0.25,
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });

    // rayos de luz giratorios (ocultos hasta abrir)
    this.rays = this.add.container(W / 2, sy(760)).setAlpha(0);
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

    this.title = kit.text(this, W / 2, sy(170), ballLabel(r.type), 'hero', '#ffffff', { size: 64 });
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
      y: sy(760),
      duration: 700,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        this.step = 'wait';
      },
    });
    this.tweens.add({ targets: this.ballShadow, scale: 1, duration: 700, ease: 'Bounce.easeOut' });
    this.time.delayedCall(200, () => Sfx.play('wobble'));

    // contador de cartas restantes
    this.counter = this.add.container(W - 110, sy(110)).setVisible(false);
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

  wobble(): void {
    this.step = 'opening';
    this.busy = true;
    this.hint.setVisible(false);
    const shake = (i: number) => {
      if (i >= 3) {
        this.open();
        return;
      }
      Sfx.play('wobble');
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

  open(): void {
    Sfx.play('open');
    this.cameras.main.zoomTo(1, 250);
    this.cameras.main.flash(300, 255, 255, 255);
    this.cameras.main.shake(200, 0.01);
    this.tweens.add({ targets: this.ballTop, angle: -115, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [this.ball, this.ballShadow], alpha: 0, y: '+=120', delay: 450, duration: 300 });
    this.tweens.add({ targets: this.rays, alpha: 1, duration: 300 });
    this.tweens.add({ targets: this.rays, angle: 360, duration: 16000, repeat: -1 });
    this.burst(L.w / 2, sy(740), 0xffffff, 30);
    this.queue = [];
    if (this.reward.gold) this.queue.push({ kind: 'gold', amount: this.reward.gold });
    if (this.reward.gems) this.queue.push({ kind: 'gems', amount: this.reward.gems });
    for (const c of this.reward.cards) this.queue.push({ kind: 'card', ...c });
    this.time.delayedCall(450, () => {
      this.busy = false;
      this.step = 'reveal';
      this.nextItem();
    });
  }

  burst(x: number, y: number, color: number, n = 16): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        d = 120 + Math.random() * 260;
      const p = this.add
        .image(x, y, 'ui_glow')
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
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
    const c = this.add.container(L.w / 2, sy(760));
    this.item = c;

    if (it.kind === 'gold' || it.kind === 'gems') {
      const gold = it.kind === 'gold';
      this.tintLight(gold ? 0xffc93c : 0x44d17a);
      const icon = this.add.image(0, -160, gold ? 'ic_gold' : 'ic_gem').setDisplaySize(190, 190);
      c.add(icon);
      c.add(kit.text(this, 0, 4, `+${fmtNum(it.amount)}`, 'hero', gold ? '#ffd75a' : '#7dff9a', { size: 76 }));
      c.add(kit.text(this, 0, 76, gold ? t('result.gold') : t('ball.gems'), 'h2', '#ffffff', { size: 34 }));
      Sfx.play('coin');
    } else {
      const card = getCard(it.key);
      const col = RARITY_COLOR[it.rarity];
      this.tintLight(col);
      const owned = Profile.d.cards[it.key];
      const glow = this.add.image(0, -150, 'ui_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD);
      glow.setDisplaySize(520, 520).setAlpha(0.7);
      c.add(glow);
      this.tweens.add({ targets: glow, scale: glow.scale * 1.1, yoyo: true, repeat: -1, duration: 500 });
      const view = makeCardView(this, card, 0, -150, 250, 300, {
        level: owned?.level,
        isNew: it.isNew,
        progress: owned ? { have: owned.count, need: Profile.cardsNeeded(it.key) } : null,
      });
      c.add(view);
      c.add(kit.text(this, 0, 66, cardName(card), 'h1', '#ffffff', { size: 48 }));
      c.add(kit.text(this, 0, 116, rarityLabel(it.rarity), 'h3', RARITY_CSS[it.rarity], { size: 30 }));
      c.add(kit.text(this, 0, 178, `x${it.count}`, 'hero', '#ffffff', { size: 66 }));
      view.scaleX = 0;
      this.tweens.add({ targets: view, scaleX: 1, duration: 280, ease: 'Back.easeOut', delay: 140 });
      Sfx.play(RAR_SFX[it.rarity] || 'card');
      if (it.rarity !== 'common') this.burst(L.w / 2, sy(610), col, it.rarity === 'legendary' ? 60 : 28);
      if (it.rarity === 'legendary') {
        this.cameras.main.shake(500, 0.012);
        this.cameras.main.flash(400, 120, 255, 240);
        const ban = kit.text(this, 0, -360, t('ball.legendary'), 'hero', '#8ff7ec', { size: 58 });
        c.add(ban);
        ban.setScale(0);
        this.tweens.add({ targets: ban, scale: 1, duration: 400, ease: 'Back.easeOut', delay: 200 });
      }
    }
    // la carta sale volando de la Pokéball
    c.setScale(0.15).setAlpha(0).setAngle(-20);
    c.y = sy(800);
    this.tweens.add({
      targets: c,
      scale: 1,
      alpha: 1,
      angle: 0,
      y: sy(600),
      duration: 340,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.busy = false;
      },
    });
  }

  summary(): void {
    this.step = 'summary';
    this.counter.setVisible(false);
    this.tintLight(0xffc93c);
    this.tweens.add({ targets: [this.ball, this.ballShadow, this.rays], alpha: 0, duration: 300 });
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
      v.setScale(0);
      this.tweens.add({ targets: v, scale: 1, duration: 240, delay: i * 70, ease: 'Back.easeOut' });
    });
    const rows = Math.ceil(list.length / cols);
    const ry = sy(380) + rows * 236;
    kit.pill(this, W / 2 - (r.gems ? 250 : 100), ry, 200, 'ic_gold', `+${fmtNum(r.gold)}`);
    if (r.gems) kit.pill(this, W / 2 + 50, ry, 200, 'ic_gem', `+${r.gems}`);
    kit.button(
      this,
      W / 2,
      Math.min(sy(1180), ry + 130),
      320,
      100,
      t('common.ok'),
      'success',
      () => kit.goTo(this, 'Lobby', { tab: this.back }),
      { size: 44, hotkey: L.pc ? t('lobby.enterKey') : undefined },
    );
  }
}
