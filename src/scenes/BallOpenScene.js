import { W, H, COLORS, RARITIES, BALLS } from '../config.js';
import { getCard } from '../data/cards.js';
import { Profile } from '../meta/Profile.js';
import { Sfx } from '../systems/Sfx.js';
import { makeCardView } from '../ui/CardView.js';
import { txt, button, fmtNum } from '../ui/style.js';

const RAR_SFX = { common: 'card', rare: 'rare', epic: 'epic', legendary: 'legendary' };

/**
 * Apertura de Pokéball: cae, se tambalea 3 veces (como al capturar),
 * se abre con un destello y va sacando las cartas una a una.
 */
export class BallOpenScene extends Phaser.Scene {
  constructor() { super('BallOpen'); }

  init(data) {
    this.reward = data.reward;
    this.back = data.back || 'battle';
    this.step = 'intro';
    this.queue = [];
  }

  create() {
    const r = this.reward;
    const cfg = BALLS[r.type];
    this.add.rectangle(W / 2, H / 2, W, H, 0x0d1024);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1f6b, 0x2a1f6b, 0x0d1024, 0x0d1024, 1).fillRect(0, 0, W, H);

    // rayos de luz giratorios (ocultos hasta abrir)
    this.rays = this.add.container(W / 2, 760).setAlpha(0);
    for (let i = 0; i < 14; i++) {
      const ray = this.add.image(0, 0, 'fx_ray').setOrigin(0.5, 0).setAngle((i * 360) / 14).setAlpha(0.25).setScale(1.4, 2);
      ray.setTint(cfg.colors[0]);
      this.rays.add(ray);
    }

    this.title = txt(this, W / 2, 180, cfg.label, 54, '#ffffff');
    this.hint = txt(this, W / 2, 1180, 'Toca para abrir', 28, '#c9c3ff');
    this.tweens.add({ targets: this.hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });

    this.ballShadow = this.add.ellipse(W / 2, 900, 200, 40, 0x000000, 0.35).setScale(0.2);
    this.ball = this.add.container(W / 2, -200);
    this.ballBot = this.add.image(0, 0, `ball_${r.type}_bot`).setScale(2.2);
    this.ballTop = this.add.image(-56 * 2.2, 0, `ball_${r.type}_top`).setScale(2.2).setOrigin(8 / 128, 0.5);
    this.ball.add([this.ballBot, this.ballTop]);

    // caída con rebote
    this.tweens.add({ targets: this.ball, y: 760, duration: 700, ease: 'Bounce.easeOut', onComplete: () => { this.step = 'wait'; } });
    this.tweens.add({ targets: this.ballShadow, scale: 1, duration: 700, ease: 'Bounce.easeOut' });
    this.time.delayedCall(200, () => Sfx.play('wobble'));

    // contador de cartas restantes
    this.totalCards = r.cards.reduce((a, c) => a + c.count, 0);
    this.counter = this.add.container(620, 110).setVisible(false);
    const cg = this.add.graphics();
    cg.fillStyle(COLORS.panelDark).fillRoundedRect(-62, -36, 124, 72, 16);
    cg.fillStyle(COLORS.blue).fillRoundedRect(-58, -32, 116, 64, 14);
    this.counter.add(cg);
    this.counterT = txt(this, 0, 0, '', 36);
    this.counter.add(this.counterT);

    this.input.on('pointerup', () => this.advance());
  }

  advance() {
    if (this.busy) return;
    if (this.step === 'wait') this.wobble();
    else if (this.step === 'reveal') this.nextItem();
    else if (this.step === 'summary') { /* botones */ }
  }

  wobble() {
    this.step = 'opening';
    this.busy = true;
    this.hint.setVisible(false);
    const shake = (i) => {
      if (i >= 3) { this.open(); return; }
      Sfx.play('wobble');
      this.tweens.add({
        targets: this.ball, angle: i % 2 ? 22 : -22, yoyo: true, duration: 150, ease: 'Sine.easeInOut',
        onComplete: () => this.time.delayedCall(320, () => shake(i + 1)),
      });
    };
    this.tweens.add({ targets: this.ball, scale: 1.1, yoyo: true, duration: 120, onComplete: () => shake(0) });
  }

  open() {
    Sfx.play('open');
    this.cameras.main.flash(300, 255, 255, 255);
    this.cameras.main.shake(200, 0.01);
    this.tweens.add({ targets: this.ballTop, angle: -115, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [this.ball, this.ballShadow], alpha: 0, y: '+=120', delay: 450, duration: 300 });
    this.tweens.add({ targets: this.rays, alpha: 1, duration: 300 });
    this.tweens.add({ targets: this.rays, angle: 360, duration: 16000, repeat: -1 });
    this.burst(W / 2, 740, 0xffffff, 26);
    this.queue = [];
    if (this.reward.gold) this.queue.push({ kind: 'gold', amount: this.reward.gold });
    if (this.reward.gems) this.queue.push({ kind: 'gems', amount: this.reward.gems });
    for (const c of this.reward.cards) this.queue.push({ kind: 'card', ...c });
    this.remaining = this.queue.length;
    this.time.delayedCall(450, () => { this.busy = false; this.step = 'reveal'; this.nextItem(); });
  }

  burst(x, y, color, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
      const p = this.add.image(x, y, 'fx_spark').setTint(color).setScale(0.4 + Math.random() * 0.8);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, duration: 600 + Math.random() * 400, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
    }
  }

  clearItem() {
    if (!this.item) return;
    const old = this.item;
    this.item = null;
    this.tweens.add({ targets: old, x: old.x - 500, alpha: 0, duration: 200, onComplete: () => old.destroy() });
  }

  nextItem() {
    this.clearItem();
    const it = this.queue.shift();
    this.counter.setVisible(true);
    this.counterT.setText(String(this.queue.length + (it ? 1 : 0)));
    if (!it) { this.summary(); return; }
    this.busy = true;
    const c = this.add.container(W / 2, 760);
    this.item = c;

    if (it.kind === 'gold' || it.kind === 'gems') {
      const icon = this.add.image(0, -160, it.kind === 'gold' ? 'ic_gold' : 'ic_gem').setDisplaySize(180, 180);
      c.add(icon);
      c.add(txt(this, 0, 0, `+${fmtNum(it.amount)}`, 72, it.kind === 'gold' ? '#ffd84a' : '#7dff8a'));
      c.add(txt(this, 0, 70, it.kind === 'gold' ? 'Oro' : 'Gemas', 32, '#ffffff'));
      Sfx.play('coin');
    } else {
      const card = getCard(it.key);
      const rar = RARITIES[it.rarity];
      const owned = Profile.d.cards[it.key];
      const glow = this.add.graphics();
      glow.fillStyle(rar.color, 0.35).fillCircle(0, -150, 220);
      glow.fillStyle(rar.color, 0.25).fillCircle(0, -150, 160);
      c.add(glow);
      this.tweens.add({ targets: glow, scale: 1.08, yoyo: true, repeat: -1, duration: 500 });
      const view = makeCardView(this, card, 0, -150, 250, 300, {
        level: owned?.level, isNew: it.isNew,
        progress: owned ? { have: owned.count, need: Profile.cardsNeeded(it.key) } : null,
      });
      c.add(view);
      c.add(txt(this, 0, 60, card.name, 46, '#ffffff'));
      c.add(txt(this, 0, 110, rar.label, 30, rar.css));
      c.add(txt(this, 0, 175, `x${it.count}`, 64, '#ffffff'));
      view.scaleX = 0;
      this.tweens.add({ targets: view, scaleX: 1, duration: 260, ease: 'Back.easeOut', delay: 120 });
      Sfx.play(RAR_SFX[it.rarity] || 'card');
      if (it.rarity !== 'common') this.burst(W / 2, 610, rar.color, it.rarity === 'legendary' ? 50 : 24);
      if (it.rarity === 'legendary') { this.cameras.main.shake(500, 0.012); this.cameras.main.flash(400, 120, 255, 240); }
    }
    c.setScale(0.2).setAlpha(0);
    c.y = 760;
    this.tweens.add({ targets: c, scale: 1, alpha: 1, y: 600, duration: 300, ease: 'Back.easeOut', onComplete: () => { this.busy = false; } });
  }

  summary() {
    this.step = 'summary';
    this.counter.setVisible(false);
    this.tweens.add({ targets: [this.ball, this.ballShadow, this.rays], alpha: 0, duration: 300 });
    this.title.setText('Has conseguido');
    const r = this.reward;
    const list = r.cards;
    const cols = 4;
    const cw = 140, ch = 168;
    list.forEach((it, i) => {
      const x = 105 + (i % cols) * 170, y = 380 + Math.floor(i / cols) * 230;
      const v = makeCardView(this, getCard(it.key), x, y, cw, ch, { isNew: it.isNew });
      v.add(txt(this, 0, ch / 2 + 22, `x${it.count}`, 26));
      v.setScale(0);
      this.tweens.add({ targets: v, scale: 1, duration: 220, delay: i * 60, ease: 'Back.easeOut' });
    });
    const rows = Math.ceil(list.length / cols);
    const ry = 380 + rows * 230;
    let x = W / 2 - (r.gems ? 140 : 0);
    this.add.image(x - 60, ry, 'ic_gold').setDisplaySize(56, 56);
    txt(this, x + 10, ry, `+${fmtNum(r.gold)}`, 36, '#ffd84a');
    if (r.gems) {
      x = W / 2 + 140;
      this.add.image(x - 60, ry, 'ic_gem').setDisplaySize(52, 52);
      txt(this, x + 10, ry, `+${r.gems}`, 36, '#7dff8a');
    }
    button(this, W / 2, Math.min(1180, ry + 130), 300, 100, 'OK', COLORS.green, () => this.scene.start('Lobby', { tab: this.back }), 44);
  }
}
