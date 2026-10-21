import { ARENA, RULES, COLORS, W, T } from '../config.js';
import { getCard } from '../data/cards.js';
import { animKey, animInfo } from '../systems/Assets.js';
import { Sfx } from '../systems/Sfx.js';
import { makeCardView } from './CardView.js';
import { txt } from './style.js';

const CARD_W = 132, CARD_H = 158;
const HAND_Y = 1150;
const slotX = (i) => 165 + i * 142;
export const EMOTES = ['¡Bien jugado!', '¡Ups!', '¡Grrr!', '¡Gracias!'];
const EMOTE_BTN = { x: 44, y: 1022, r: 32 };

/**
 * Mano del jugador: 4 cartas + siguiente, barra de elixir, despliegue y emotes.
 * Se puede arrastrar una carta a la arena o tocar la carta y luego la arena.
 */
export class Hand {
  constructor(battle, cycle, levels) {
    this.b = battle;
    this.cycle = cycle;
    this.levels = levels;
    this.views = [];
    this.selected = -1;
    this.dragging = false;
    this.emoteOpen = false;

    const bg = battle.add.graphics().setDepth(5000);
    bg.fillStyle(0x23284d).fillRect(0, ARENA.bottom, W, 1280 - ARENA.bottom);
    bg.fillStyle(COLORS.panelDark).fillRect(0, ARENA.bottom, W, 4);
    txt(battle, 52, 1090, 'Siguiente', 15).setDepth(5001);
    this.elixirG = battle.add.graphics().setDepth(5001);
    this.elixirT = txt(battle, 70, 1254, '5', 30).setDepth(5003);
    this.ghost = battle.add.container(0, 0).setDepth(4900).setVisible(false);

    // botón de emotes
    const eb = battle.add.image(EMOTE_BTN.x, EMOTE_BTN.y, 'ic_emote').setDisplaySize(56, 56).setDepth(5004);
    const ebg = battle.add.graphics().setDepth(5003);
    ebg.fillStyle(COLORS.panelDark, 0.7).fillCircle(EMOTE_BTN.x, EMOTE_BTN.y + 2, EMOTE_BTN.r + 2);
    this.emoteBtn = eb;
    this.emoteMenu = battle.add.container(0, 0).setDepth(5100).setVisible(false);
    EMOTES.forEach((e, i) => {
      const x = 130 + i * 150, y = 950;
      const g = battle.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(x - 70, y - 30, 140, 64, 16);
      g.fillStyle(0xffffff).fillRoundedRect(x - 67, y - 28, 134, 56, 14);
      this.emoteMenu.add(g);
      this.emoteMenu.add(txt(battle, x, y, e, 19, '#14122b', { strokeThickness: 0 }));
    });

    this.build();

    battle.input.on('pointerdown', (p) => this.onDown(p));
    battle.input.on('pointermove', (p) => this.onMove(p));
    battle.input.on('pointerup', (p) => this.onUp(p));
  }

  build() {
    this.views.forEach((v) => v.destroy());
    this.nextView?.destroy();
    this.views = this.cycle.hand.map((k, i) => makeCardView(this.b, getCard(k), slotX(i), HAND_Y, CARD_W, CARD_H, { level: this.levels[k], compact: true }).setDepth(5002));
    this.nextView = makeCardView(this.b, getCard(this.cycle.next), 52, 1160, 74, 92).setDepth(5002);
    this.layout();
    this.buildGhost();
  }

  layout() {
    this.views.forEach((v, i) => {
      const sel = i === this.selected;
      this.b.tweens.killTweensOf(v);
      this.b.tweens.add({ targets: v, y: HAND_Y - (sel ? 16 : 0), scale: sel ? 1.06 : 1, duration: 90 });
    });
  }

  slotAt(x, y) {
    if (y < HAND_Y - CARD_H / 2 - 16 || y > HAND_Y + CARD_H / 2) return -1;
    for (let i = 0; i < this.views.length; i++) if (Math.abs(x - slotX(i)) <= CARD_W / 2) return i;
    return -1;
  }

  select(i) {
    if (this.selected !== i) Sfx.play('select');
    this.selected = i;
    this.layout();
    this.buildGhost();
  }

  buildGhost() {
    this.ghost.removeAll(true);
    if (this.selected < 0) return;
    const card = getCard(this.cycle.hand[this.selected]);
    this.ghostCard = card;
    if (card.type === 'spell') {
      const g = this.b.add.graphics();
      g.fillStyle(0xffffff, 0.18).fillCircle(0, 0, card.radiusSpell);
      g.lineStyle(3, 0xffffff, 0.8).strokeCircle(0, 0, card.radiusSpell);
      this.ghost.add(g);
      return;
    }
    const a = animInfo(card.pokemon, 'Idle');
    if (card.range > 1.5 * T) {
      const r = this.b.add.graphics();
      r.lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, card.range + card.radius);
      this.ghost.add(r);
    }
    for (const [dx, dy] of this.b.formation(card.count)) {
      const sh = this.b.add.ellipse(dx, dy, card.radius * 2.6, card.radius * 1.2).setStrokeStyle(3, COLORS.player, 0.9);
      const sp = this.b.add.sprite(dx, dy - (card.flying ? 22 : 0), `pk_${card.pokemon}_Idle`).setScale(card.scale).setAlpha(0.6);
      sp.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
      sp.play(animKey(card.pokemon, 'Idle', 4));
      this.ghost.add([sh, sp]);
    }
  }

  snap(x, y) { return [Math.round(x / 10) * 10, Math.round(y / 10) * 10]; }

  showGhost(x, y) {
    if (this.selected < 0) return;
    const [sx, sy] = this.snap(x, y);
    const ok = this.b.canDeploy('player', this.ghostCard, sx, sy);
    this.ghost.setPosition(sx, sy).setVisible(true).setAlpha(ok ? 1 : 0.4);
    this.b.showDeployOverlay(this.ghostCard);
  }

  hideGhost() {
    this.ghost.setVisible(false);
    this.b.hideDeployOverlay();
  }

  hitEmoteBtn(p) { return Math.hypot(p.x - EMOTE_BTN.x, p.y - EMOTE_BTN.y) <= EMOTE_BTN.r + 6; }

  onDown(p) {
    if (this.b.ended || !this.b.started || this.b.modalOpen) return;
    if (this.b.uiHit?.(p)) return;
    if (this.emoteOpen) {
      const i = EMOTES.findIndex((_, k) => Math.abs(p.x - (130 + k * 150)) < 70 && Math.abs(p.y - 950) < 32);
      if (i >= 0) this.b.emote('player', EMOTES[i]);
      this.toggleEmotes(false);
      return;
    }
    if (this.hitEmoteBtn(p)) { this.toggleEmotes(true); return; }
    const i = this.slotAt(p.x, p.y);
    if (i >= 0) {
      this.select(i);
      this.dragging = true;
      return;
    }
    if (p.y < ARENA.bottom && this.selected >= 0) this.deployAt(p.x, p.y);
  }

  toggleEmotes(v) {
    this.emoteOpen = v;
    this.emoteMenu.setVisible(v);
    if (v) { this.emoteMenu.setAlpha(0).setY(20); this.b.tweens.add({ targets: this.emoteMenu, alpha: 1, y: 0, duration: 120 }); }
  }

  onMove(p) {
    if (!this.dragging || !p.isDown) return;
    if (p.y < ARENA.bottom - 6) this.showGhost(p.x, p.y);
    else this.hideGhost();
  }

  onUp(p) {
    if (!this.dragging) return;
    this.dragging = false;
    this.hideGhost();
    if (p.y < ARENA.bottom - 6) this.deployAt(p.x, p.y);
  }

  deployAt(x, y) {
    const [sx, sy] = this.snap(x, y);
    if (this.b.tryDeploy('player', this.cycle, this.selected, sx, sy)) {
      this.selected = -1;
      this.build();
    }
  }

  update() {
    const e = this.b.elixir.player;
    this.views.forEach((v, i) => v.dim.setVisible(getCard(this.cycle.hand[i]).cost > e));
    const g = this.elixirG;
    g.clear();
    const x0 = 104, y0 = 1240, w = 596, h = 28, seg = w / RULES.elixirMax;
    g.fillStyle(COLORS.panelDark).fillRoundedRect(x0 - 3, y0 - 3, w + 6, h + 6, 8);
    g.fillStyle(0x3a2b4f).fillRoundedRect(x0, y0, w, h, 6);
    const fill = (e / RULES.elixirMax) * w;
    if (fill > 0) {
      g.fillStyle(COLORS.elixir).fillRoundedRect(x0, y0, Math.max(12, fill), h, 6);
      g.fillStyle(0xffffff, 0.25).fillRect(x0 + 4, y0 + 3, Math.max(4, fill - 8), 6);
    }
    g.lineStyle(2, COLORS.panelDark, 0.6);
    for (let i = 1; i < RULES.elixirMax; i++) g.lineBetween(x0 + i * seg, y0, x0 + i * seg, y0 + h);
    g.fillStyle(COLORS.panelDark).fillCircle(70, 1256, 26);
    g.fillStyle(COLORS.elixir).fillCircle(70, 1254, 23);
    g.fillStyle(0xffffff, 0.35).fillCircle(63, 1246, 8);
    this.elixirT.setText(String(Math.floor(e)));
  }

  flashElixir() {
    Sfx.play('noElixir');
    this.b.tweens.add({ targets: this.elixirT, scale: 1.5, yoyo: true, duration: 120 });
  }
}
