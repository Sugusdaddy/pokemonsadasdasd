import type Phaser from 'phaser';
import { hitHeight, type SimProjectile } from '@arena/shared';
import { palette } from '../systems/Assets';
import type { FxPools } from './Pools';

/**
 * Dibujo de un proyectil. En la simulación viaja por el suelo; aquí se le da
 * altura: sale a la altura del atacante y llega a la del objetivo.
 */
export class ProjectileView {
  private img: Phaser.GameObjects.Image;
  private trailT = 0;
  private trail: number;
  private lastX: number;
  private lastY: number;

  constructor(
    private readonly fx: FxPools,
    readonly p: SimProjectile,
  ) {
    this.img = fx.projectile(p.move);
    this.trail = palette(p.src.palette)[3];
    this.lastX = p.x;
    this.lastY = p.y - p.h0;
    this.img.setPosition(this.lastX, this.lastY);
  }

  update(alpha: number, dt: number): void {
    const p = this.p;
    const x = p.px + (p.x - p.px) * alpha;
    const y = p.py + (p.y - p.py) * alpha;
    const done = Math.hypot(x - p.sx, y - p.sy);
    const left = Math.hypot(p.tx - x, p.ty - y);
    const k = done + left > 0 ? done / (done + left) : 1;
    const vy = y - (p.h0 + (hitHeight(p.target) - p.h0) * k);
    const dx = x - this.lastX,
      dy = vy - this.lastY;
    if (dx * dx + dy * dy > 0.01) this.img.setRotation(Math.atan2(dy, dx));
    this.img.setPosition(x, vy);
    this.lastX = x;
    this.lastY = vy;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.035;
      this.fx.spark(x, vy, this.trail);
    }
  }

  destroy(): void {
    this.fx.projectiles.release(this.img);
  }
}
