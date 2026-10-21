import { RULES } from '../config.js';
import { moveKey } from '../systems/Assets.js';

/** Proyectil teledirigido que usa el sprite del movimiento (attacks/moves/<id>.png). */
export class Projectile {
  constructor(battle, owner, target, x, y, move, onHit, trail = 0xffffff) {
    this.b = battle;
    this.target = target;
    this.x = x;
    this.y = y;
    this.tx = target.x;
    this.ty = target.y - (target.flying ? 22 : 12);
    this.onHit = onHit;
    this.alive = true;
    const key = battle.textures.exists(moveKey(move)) ? moveKey(move) : 'fx_impact';
    this.sprite = battle.add.image(x, y, key).setScale(2.5).setDepth(3000);
    this.speed = RULES.projectileSpeed;
    this.trail = trail;
    this.trailT = 0;
  }

  update(dt) {
    if (!this.alive) return;
    if (this.target.alive) {
      this.tx = this.target.x;
      this.ty = this.target.y - (this.target.flying ? 22 : this.target.isTower ? 30 : 12);
    }
    const dx = this.tx - this.x, dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step + 4) {
      this.alive = false;
      this.sprite.destroy();
      this.onHit(this.target.alive ? this.target : null, this.tx, this.ty);
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.sprite.setPosition(this.x, this.y).setRotation(Math.atan2(dy, dx));
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.035;
      const p = this.b.add.image(this.x, this.y, 'fx_spark').setTint(this.trail).setScale(0.45).setAlpha(0.7).setDepth(2999);
      this.b.tweens.add({ targets: p, scale: 0.05, alpha: 0, duration: 220, onComplete: () => p.destroy() });
    }
  }
}
