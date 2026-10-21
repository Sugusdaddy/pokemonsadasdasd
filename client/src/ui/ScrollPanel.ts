import Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';

type Pointer = Phaser.Input.Pointer;
interface Tap {
  x: number;
  y: number;
  w: number;
  h: number;
  cb: () => void;
}

/**
 * Zona con desplazamiento vertical (arrastrar o rueda del ratón).
 * Los elementos pulsables se registran con addTap() para distinguir
 * un toque de un arrastre.
 */
export class ScrollPanel {
  scrollY = 0;
  contentH: number;
  vel = 0;
  readonly content: Phaser.GameObjects.Container;
  private taps: Tap[] = [];
  private maskG: Phaser.GameObjects.Graphics;
  private down: { y: number; sy: number; moved: boolean; t: number; lastY: number } | null = null;
  private onDown: (p: Pointer) => void;
  private onMove: (p: Pointer) => void;
  private onUp: (p: Pointer) => void;
  private onWheel: (p: Pointer, o: unknown, dx: number, dy: number) => void;

  constructor(
    readonly scene: BaseScene,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
  ) {
    this.contentH = h;
    this.content = scene.add.container(x, y);
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff).fillRect(x, y, w, h);
    this.content.setMask(this.maskG.createGeometryMask());

    this.onDown = (p) => {
      if (scene.modalOpen || !this.inside(p)) return;
      this.down = { y: p.y, sy: this.scrollY, moved: false, t: performance.now(), lastY: p.y };
      this.vel = 0;
    };
    this.onMove = (p) => {
      if (!this.down || !p.isDown) return;
      const dy = p.y - this.down.y;
      if (Math.abs(dy) > 10) this.down.moved = true;
      if (this.down.moved) {
        this.vel = this.down.lastY - p.y;
        this.down.lastY = p.y;
        this.set(this.down.sy - dy);
      }
    };
    this.onUp = (p) => {
      if (!this.down) return;
      const d = this.down;
      this.down = null;
      if (d.moved || scene.modalOpen) return;
      const lx = p.x - this.x,
        ly = p.y - this.y + this.scrollY;
      for (let i = this.taps.length - 1; i >= 0; i--) {
        const t = this.taps[i];
        if (Math.abs(lx - t.x) <= t.w / 2 && Math.abs(ly - t.y) <= t.h / 2) {
          t.cb();
          break;
        }
      }
    };
    this.onWheel = (p, _o, _dx, dy) => {
      if (!scene.modalOpen && this.inside(p)) this.set(this.scrollY + dy * 0.6);
    };
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('wheel', this.onWheel);
  }

  inside(p: Pointer): boolean {
    return p.x >= this.x && p.x <= this.x + this.w && p.y >= this.y && p.y <= this.y + this.h;
  }

  add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.content.add(obj);
    return obj;
  }

  addTap(cx: number, cy: number, w: number, h: number, cb: () => void): void {
    this.taps.push({ x: cx, y: cy, w, h, cb });
  }

  setContentHeight(h: number): void {
    this.contentH = Math.max(this.h, h);
    this.set(this.scrollY);
  }

  set(v: number): void {
    this.scrollY = Phaser.Math.Clamp(v, 0, this.contentH - this.h);
    this.content.y = this.y - this.scrollY;
  }

  update(): void {
    if (!this.down && Math.abs(this.vel) > 0.5) {
      this.set(this.scrollY + this.vel);
      this.vel *= 0.9;
    }
  }

  destroy(): void {
    const i = this.scene.input;
    i.off('pointerdown', this.onDown);
    i.off('pointermove', this.onMove);
    i.off('pointerup', this.onUp);
    i.off('wheel', this.onWheel);
    this.content.clearMask(true);
    this.content.destroy();
    this.maskG.destroy();
  }
}
