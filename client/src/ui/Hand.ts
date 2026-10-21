import Phaser from 'phaser';
import { ARENA, RULES, COLORS, W, T, PLAYER_EMOTES, formation, getCard, type Card } from '@arena/shared';
import { animKey, animInfo, pkAtlas } from '../systems/Assets';
import { Sfx } from '../systems/Sfx';
import { L } from '../layout';
import { makeCardView, type CardView } from './CardView';
import { txt } from './style';
import { t, emoteText } from '../i18n';
import type { BattleScene } from '../scenes/BattleScene';

const CARD_W = 132,
  CARD_H = 158;

/** Dónde va cada cosa de la mano (coordenadas del mundo de la batalla). */
interface HandLayout {
  cardY: number;
  slotX: (i: number) => number;
  next: { x: number; y: number; labelY: number };
  elixir: { x0: number; y0: number; w: number; cx: number; cy: number };
  emoteBtn: { x: number; y: number; r: number };
  emoteAt: (i: number) => { x: number; y: number };
  /** Atajos de teclado encima de las cartas (solo PC). */
  keys: boolean;
}

const MOBILE: HandLayout = {
  cardY: 1150,
  slotX: (i) => 165 + i * 142,
  next: { x: 52, y: 1160, labelY: 1090 },
  elixir: { x0: 104, y0: 1240, w: 596, cx: 70, cy: 1254 },
  emoteBtn: { x: 44, y: 1022, r: 32 },
  emoteAt: (i) => ({ x: 130 + i * 150, y: 950 }),
  keys: false,
};

// PC: panel derecho (x 720…1320) para cartas y elixir; panel izquierdo (x -600…0) para emotes
const PC: HandLayout = {
  cardY: 780,
  slotX: (i) => 822 + i * 140,
  next: { x: 1250, y: 560, labelY: 492 },
  elixir: { x0: 830, y0: 930, w: 430, cx: 790, cy: 944 },
  emoteBtn: { x: -300, y: 900, r: 36 },
  emoteAt: (i) => ({ x: -300, y: 560 + i * 76 }),
  keys: true,
};

/**
 * Mano del jugador: 4 cartas + siguiente, barra de elixir, despliegue y emotes.
 * Se puede arrastrar una carta a la arena, o elegirla (clic o teclas 1-4) y luego
 * hacer clic en la arena. En PC se ve la vista previa al pasar el ratón; clic
 * derecho o Esc cancela. No cambia la partida: pide a la escena que mande el input.
 */
export class Hand {
  private views: CardView[] = [];
  private nextView?: CardView;
  private selected = -1;
  private dragging = false;
  private emoteOpen = false;
  private elixirFill: Phaser.GameObjects.NineSlice;
  private elixirGlow: Phaser.GameObjects.NineSlice;
  private elixirT: Phaser.GameObjects.Text;
  private elixirDrop: Phaser.GameObjects.Image;
  private lastElixir = -1;
  private ghost: Phaser.GameObjects.Container;
  private ghostCard: Card | null = null;
  private emoteMenu: Phaser.GameObjects.Container;
  private keyHints: Phaser.GameObjects.Text[] = [];
  private handSig = '';
  private readonly lay: HandLayout = L.pc ? PC : MOBILE;

  constructor(
    private readonly b: BattleScene,
    private readonly levels: Record<string, number>,
  ) {
    const lay = this.lay;
    if (!L.pc) {
      b.add
        .image(0, ARENA.bottom, 'ui_bg')
        .setOrigin(0, 0)
        .setDisplaySize(W, 1280 - ARENA.bottom)
        .setTint(0x9aa2dc)
        .setDepth(5000);
      b.add.graphics().setDepth(5000).fillStyle(0x0b0d1f).fillRect(0, ARENA.bottom, W, 5);
    }
    txt(b, lay.next.x, lay.next.labelY, t('battle.next'), 15).setDepth(5001);
    // barra de elixir: hueco hundido, relleno con volumen, divisiones y la gota con el número
    const { x0, y0, w, cx, cy } = lay.elixir;
    const EH = 30;
    b.add
      .nineslice(x0 - 6, y0 - 6, 'ui_pnl_inset', undefined, w + 12, EH + 20, 18, 18, 18, 22)
      .setOrigin(0, 0)
      .setDepth(5001);
    this.elixirGlow = b.add
      .nineslice(x0 - 2, y0 - 2, 'ui_pill', undefined, w + 4, EH + 4, 14, 14, 10, 10)
      .setOrigin(0, 0)
      .setTint(0xff9cf6)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5002);
    this.elixirFill = b.add
      .nineslice(x0, y0, 'ui_pill', undefined, w, EH, 14, 14, 10, 10)
      .setOrigin(0, 0)
      .setTint(COLORS.elixir)
      .setDepth(5002);
    const seg = b.add.graphics().setDepth(5003);
    seg.lineStyle(3, 0x0b0d1f, 0.55);
    for (let i = 1; i < RULES.elixirMax; i++)
      seg.lineBetween(x0 + (i * w) / RULES.elixirMax, y0 + 3, x0 + (i * w) / RULES.elixirMax, y0 + EH - 3);
    this.elixirDrop = b.add
      .image(cx, cy - 4, 'ui_drop')
      .setDisplaySize(52, 65)
      .setDepth(5004);
    this.elixirT = txt(b, cx, cy + 4, '5', 28).setDepth(5005);
    b.tweens.add({
      targets: this.elixirGlow,
      alpha: { from: 0, to: 0.45 },
      yoyo: true,
      repeat: -1,
      duration: 600,
      paused: false,
    });
    this.ghost = b.add.container(0, 0).setDepth(4900).setVisible(false);

    // botón de emotes
    const E = lay.emoteBtn;
    const ebg = b.add.graphics().setDepth(5003);
    ebg.fillStyle(COLORS.panelDark, 0.7).fillCircle(E.x, E.y + 2, E.r + 2);
    b.add
      .image(E.x, E.y, 'ic_emote')
      .setDisplaySize(E.r * 1.75, E.r * 1.75)
      .setDepth(5004);
    if (lay.keys) txt(b, E.x, E.y + E.r + 22, t('battle.emotes'), 18, '#c9c3ff').setDepth(5004);
    this.emoteMenu = b.add.container(0, 0).setDepth(5100).setVisible(false);
    PLAYER_EMOTES.forEach((id, i) => {
      const { x, y } = lay.emoteAt(i);
      const g = b.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(x - 70, y - 30, 140, 64, 16);
      g.fillStyle(0xffffff).fillRoundedRect(x - 67, y - 28, 134, 56, 14);
      this.emoteMenu.add(g);
      this.emoteMenu.add(
        txt(b, x, y, (lay.keys ? `${i + 1}. ` : '') + emoteText(id), 19, '#14122b', { strokeThickness: 0 }),
      );
    });

    if (lay.keys) {
      for (let i = 0; i < 4; i++) {
        this.keyHints.push(
          txt(b, lay.slotX(i), lay.cardY - CARD_H / 2 - 22, String(i + 1), 22, '#c9c3ff').setDepth(5003),
        );
      }
    }

    this.build();

    b.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    b.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    b.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    b.input.mouse?.disableContextMenu();
    b.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  private get cycle() {
    return this.b.match.cycles[this.b.me];
  }

  private build(): void {
    this.views.forEach((v) => v.destroy());
    this.nextView?.destroy();
    this.handSig = this.cycle.hand.join('|');
    const lay = this.lay;
    this.views = this.cycle.hand.map((k, i) =>
      makeCardView(this.b, getCard(k), lay.slotX(i), lay.cardY, CARD_W, CARD_H, {
        level: this.levels[k],
        compact: true,
      }).setDepth(5002),
    );
    this.nextView = makeCardView(this.b, getCard(this.cycle.next), lay.next.x, lay.next.y, 74, 92).setDepth(5002);
    this.layout();
    this.buildGhost();
  }

  private layout(): void {
    this.views.forEach((v, i) => {
      const sel = i === this.selected;
      this.b.tweens.killTweensOf(v);
      this.b.tweens.add({ targets: v, y: this.lay.cardY - (sel ? 16 : 0), scale: sel ? 1.06 : 1, duration: 90 });
    });
    this.keyHints.forEach((t, i) => t.setColor(i === this.selected ? '#ffd84a' : '#c9c3ff'));
  }

  private slotAt(x: number, y: number): number {
    const cy = this.lay.cardY;
    if (y < cy - CARD_H / 2 - 16 || y > cy + CARD_H / 2) return -1;
    for (let i = 0; i < this.views.length; i++) if (Math.abs(x - this.lay.slotX(i)) <= CARD_W / 2) return i;
    return -1;
  }

  private select(i: number): void {
    if (this.selected !== i) Sfx.play('select');
    this.selected = i;
    this.layout();
    this.buildGhost();
    // con teclado: si el ratón ya está sobre la arena, se ve dónde caería
    const p = this.b.input.activePointer;
    if (L.pc && this.inArena(p.worldX, p.worldY)) this.showGhost(p.worldX, p.worldY);
  }

  private deselect(): void {
    if (this.selected < 0) return;
    this.selected = -1;
    this.dragging = false;
    this.hideGhost();
    this.layout();
    this.buildGhost();
  }

  private buildGhost(): void {
    this.ghost.removeAll(true);
    this.ghostCard = null;
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
    for (const [dx, dy] of formation(card.count, 0.55 * T)) {
      const sh = this.b.add.ellipse(dx, dy, card.radius * 2.6, card.radius * 1.2).setStrokeStyle(3, COLORS.player, 0.9);
      const sp = this.b.add
        .sprite(dx, dy - (card.flying ? 22 : 0), pkAtlas(card.pokemon), 'Idle_4_0')
        .setScale(card.scale)
        .setAlpha(0.6);
      sp.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
      if (this.b.anims.exists(animKey(card.pokemon, 'Idle', 4))) sp.play(animKey(card.pokemon, 'Idle', 4));
      this.ghost.add([sh, sp]);
    }
  }

  private snap(x: number, y: number): [number, number] {
    return [Math.round(x / 10) * 10, Math.round(y / 10) * 10];
  }

  private inArena(x: number, y: number): boolean {
    return x >= 0 && x <= W && y >= ARENA.top && y < ARENA.bottom - 6;
  }

  private showGhost(x: number, y: number): void {
    if (this.selected < 0 || !this.ghostCard) return;
    const [sx, sy] = this.snap(x, y);
    const ok = this.b.match.canDeploy(this.b.me, this.ghostCard, sx, this.b.view.y(sy));
    this.ghost
      .setPosition(sx, sy)
      .setVisible(true)
      .setAlpha(ok ? 1 : 0.4);
    this.b.showDeployOverlay(this.ghostCard);
  }

  /** Centro de la carta i de la mano (para que el tutorial la señale). */
  cardPos(i: number): { x: number; y: number } {
    return { x: this.lay.slotX(i), y: this.lay.cardY };
  }

  readonly cardSize = { w: CARD_W, h: CARD_H };

  /** Barra de elixir (esquina superior izquierda y tamaño). */
  get elixirBox(): { x: number; y: number; w: number; h: number } {
    const e = this.lay.elixir;
    return { x: e.cx - 30, y: e.y0, w: e.x0 + e.w - (e.cx - 30), h: 30 };
  }

  hideGhost(): void {
    this.ghost.setVisible(false);
    this.b.hideDeployOverlay();
  }

  private hitEmoteBtn(x: number, y: number): boolean {
    const E = this.lay.emoteBtn;
    return Math.hypot(x - E.x, y - E.y) <= E.r + 6;
  }

  // ───────────────────────── Ratón y táctil ─────────────────────────
  // La cámara de la batalla se desplaza en PC: siempre se usan worldX/worldY.

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.b.canInteract) return;
    if (p.rightButtonDown()) {
      this.deselect();
      this.toggleEmotes(false);
      return;
    }
    const x = p.worldX,
      y = p.worldY;
    if (this.b.uiHit(x, y)) return;
    if (this.emoteOpen) {
      const i = PLAYER_EMOTES.findIndex((_, k) => {
        const at = this.lay.emoteAt(k);
        return Math.abs(x - at.x) < 70 && Math.abs(y - at.y) < 32;
      });
      if (i >= 0) this.b.sendEmote(PLAYER_EMOTES[i]);
      this.toggleEmotes(false);
      return;
    }
    if (this.hitEmoteBtn(x, y)) {
      this.toggleEmotes(true);
      return;
    }
    const i = this.slotAt(x, y);
    if (i >= 0) {
      if (L.pc && i === this.selected) {
        this.deselect();
        return;
      }
      this.select(i);
      this.dragging = true;
      return;
    }
    if (this.inArena(x, y) && this.selected >= 0) this.deployAt(x, y);
  }

  private toggleEmotes(v: boolean): void {
    if (this.emoteOpen === v) return;
    this.emoteOpen = v;
    this.emoteMenu.setVisible(v);
    if (v) {
      this.emoteMenu.setAlpha(0).setY(20);
      this.b.tweens.add({ targets: this.emoteMenu, alpha: 1, y: 0, duration: 120 });
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const x = p.worldX,
      y = p.worldY;
    // arrastrando una carta, o en PC con una carta elegida: vista previa bajo el ratón
    const preview = (this.dragging && p.isDown) || (L.pc && this.selected >= 0 && !p.isDown);
    if (!preview) return;
    if (this.inArena(x, y)) this.showGhost(x, y);
    else this.hideGhost();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    this.dragging = false;
    const x = p.worldX,
      y = p.worldY;
    if (!L.pc || !this.inArena(x, y)) this.hideGhost();
    if (this.inArena(x, y)) this.deployAt(x, y);
  }

  // ───────────────────────── Teclado (PC) ─────────────────────────

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.key === 'Escape') {
      if (this.emoteOpen) this.toggleEmotes(false);
      else if (this.selected >= 0) this.deselect();
      else if (!this.b.modalOpen) this.b.confirmSurrender();
      return;
    }
    if (!this.b.canInteract) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      if (this.emoteOpen) {
        this.b.sendEmote(PLAYER_EMOTES[n - 1]);
        this.toggleEmotes(false);
      } else if (this.selected === n - 1) this.deselect();
      else this.select(n - 1);
      return;
    }
    if (e.key === 't' || e.key === 'T') this.toggleEmotes(!this.emoteOpen);
  }

  private deployAt(x: number, y: number): void {
    if (this.selected < 0) return;
    const [sx, sy] = this.snap(x, y);
    // la mano trabaja en pantalla; la partida, en coordenadas del mundo
    if (this.b.playCard(this.cycle.hand[this.selected], sx, this.b.view.y(sy))) {
      this.selected = -1;
      this.hideGhost();
      this.layout();
      this.buildGhost();
    }
  }

  /** Cada frame: reconstruye la mano si la simulación ha rotado cartas y pinta el elixir. */
  update(): void {
    if (this.cycle.hand.join('|') !== this.handSig) {
      this.selected = -1;
      this.hideGhost();
      this.build();
    }
    const e = this.b.match.elixir[this.b.me];
    this.views.forEach((v, i) => {
      const k = this.cycle.hand[i];
      v.dim.setVisible(getCard(k).cost > e || this.b.isPending(k));
    });
    const w = this.lay.elixir.w;
    const fill = Math.max(0, Math.min(1, e / RULES.elixirMax));
    this.elixirFill.setVisible(fill > 0.02);
    this.elixirFill.width = Math.max(28, w * fill);
    // brillo solo con el elixir lleno
    this.elixirGlow.setVisible(fill >= 1);
    const n = Math.floor(e);
    if (n !== this.lastElixir) {
      if (n > this.lastElixir && this.lastElixir >= 0) {
        this.b.tweens.add({ targets: this.elixirDrop, scale: this.elixirDrop.scale * 1.12, yoyo: true, duration: 90 });
      }
      this.lastElixir = n;
      this.elixirT.setText(String(n));
    }
  }

  flashElixir(): void {
    Sfx.play('noElixir');
    this.b.tweens.add({ targets: this.elixirT, scale: 1.5, yoyo: true, duration: 120 });
  }
}
