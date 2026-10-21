import type Phaser from 'phaser';
import type { SimEvent } from '@arena/shared';
import type { View } from './View';
import type { BattleParticles } from './Particles';

type AreaEvent = Extract<SimEvent, { e: 'area' }>;

/** Color de cada hechizo que dura. */
export const AREA_COLOR: Record<AreaEvent['kind'], number> = {
  poison: 0xa45ce8,
  heal: 0x5be37a,
  rage: 0xff6a3c,
};

/**
 * Dibujo de un hechizo que se queda en el suelo (veneno, curación, furia): círculo que
 * late, anillo que gira y chispas que suben mientras dura. Solo visual.
 */
export class AreaView {
  private g: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private timer: Phaser.Time.TimerEvent;
  private done = false;

  constructor(
    private readonly scene: Phaser.Scene,
    ev: AreaEvent,
    view: View,
    particles: BattleParticles,
  ) {
    const x = ev.x,
      y = view.y(ev.y),
      r = ev.r,
      col = AREA_COLOR[ev.kind];
    this.g = scene.add.graphics().setDepth(6).setPosition(x, y);
    this.g.fillStyle(col, 0.16).fillCircle(0, 0, r);
    this.g.lineStyle(3, col, 0.75).strokeCircle(0, 0, r);
    this.ring = scene.add.graphics().setDepth(7).setPosition(x, y);
    // anillo discontinuo que gira
    this.ring.lineStyle(4, col, 0.9);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.ring
        .beginPath()
        .arc(0, 0, r * 0.82, a, a + 0.28)
        .strokePath();
    }
    this.g.setScale(0.2);
    scene.tweens.add({ targets: this.g, scale: 1, duration: 220, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: this.ring, angle: 360, duration: 3000, repeat: -1 });
    scene.tweens.add({ targets: this.g, alpha: 0.6, yoyo: true, repeat: -1, duration: 500 });
    // burbujas (veneno), destellos (curación) o chispas (furia) que suben
    this.timer = scene.time.addEvent({
      delay: 160,
      loop: true,
      callback: () => {
        const a = Math.random() * Math.PI * 2,
          d = Math.sqrt(Math.random()) * r * 0.85;
        particles.sparks(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 2, col);
      },
    });
    scene.time.delayedCall(ev.dur * 1000, () => this.destroy(true));
  }

  destroy(fade = false): void {
    if (this.done) return;
    this.done = true;
    this.timer.remove();
    if (!fade) {
      this.g.destroy();
      this.ring.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: [this.g, this.ring],
      alpha: 0,
      duration: 300,
      onComplete: () => {
        this.g.destroy();
        this.ring.destroy();
      },
    });
  }
}
