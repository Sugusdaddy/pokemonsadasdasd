import Phaser from 'phaser';
import { txt } from '../ui/style';
import { moveFrame, palette } from '../systems/Assets';

/**
 * Pool genérico: reutiliza objetos en vez de crearlos y destruirlos en cada golpe.
 * En una partida salen cientos de números de daño, chispas e impactos.
 */
export class Pool<T extends Phaser.GameObjects.GameObject> {
  private free: T[] = [];
  created = 0;

  constructor(
    private readonly make: () => T,
    private readonly onRelease: (o: T) => void = () => {},
  ) {}

  get(): T {
    const o = this.free.pop();
    if (o) return o;
    this.created++;
    return this.make();
  }

  release(o: T): void {
    this.onRelease(o);
    this.free.push(o);
  }

  get idle(): number {
    return this.free.length;
  }
}

const hide = (o: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible): void => {
  o.setVisible(false);
  o.setActive(false);
};

/** Efectos de la batalla con pools: números de daño, impactos, chispas, partículas y anillos. */
export class FxPools {
  private texts: Pool<Phaser.GameObjects.Text>;
  private impacts: Pool<Phaser.GameObjects.Sprite>;
  private sparks: Pool<Phaser.GameObjects.Image>;
  private rings: Pool<Phaser.GameObjects.Graphics>;
  readonly projectiles: Pool<Phaser.GameObjects.Image>;

  constructor(private readonly scene: Phaser.Scene) {
    this.texts = new Pool(() => txt(scene, 0, 0, '', 18).setDepth(4600), hide);
    this.impacts = new Pool(() => scene.add.sprite(0, 0, 'fx', 'impact_0').setDepth(3200), hide);
    this.sparks = new Pool(() => scene.add.image(0, 0, 'fx_spark'), hide);
    this.rings = new Pool(() => scene.add.graphics().setDepth(3100), hide);
    this.projectiles = new Pool(() => scene.add.image(0, 0, 'fx', 'impact_0').setDepth(3000), hide);
  }

  /** Número de daño que sube y se desvanece (amarillo si es eficaz, gris si no). */
  damageNumber(x: number, y: number, amount: number, mult = 1): void {
    if (amount < 1) return;
    const big = mult > 1;
    const t = this.texts.get();
    t.setText(String(Math.round(amount)))
      .setFontSize(big ? 24 : 18)
      .setColor(big ? '#ffd84a' : mult < 1 ? '#b7bed6' : '#ffffff')
      .setPosition(x + Phaser.Math.Between(-8, 8), y)
      .setAlpha(1)
      .setVisible(true)
      .setActive(true);
    this.scene.tweens.add({ targets: t, y: y - 32, alpha: 0, duration: 650, onComplete: () => this.texts.release(t) });
  }

  /** Texto que sube y se desvanece (curación en verde, elixir en morado…). */
  floatText(x: number, y: number, text: string, color: string, size = 20): void {
    const t = this.texts.get();
    t.setText(text)
      .setFontSize(size)
      .setColor(color)
      .setPosition(x + Phaser.Math.Between(-6, 6), y)
      .setAlpha(1)
      .setVisible(true)
      .setActive(true);
    this.scene.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 800, onComplete: () => this.texts.release(t) });
  }

  impact(x: number, y: number, pal = 'normal', scale = 3): void {
    if (!this.scene.anims.exists('fx_impact')) return;
    const s = this.impacts.get();
    s.setPosition(x, y).setScale(scale).setTint(palette(pal)[3]).setVisible(true).setActive(true);
    s.play('fx_impact');
    s.once('animationcomplete', () => this.impacts.release(s));
  }

  /** Chispa de estela o partícula suelta. */
  spark(x: number, y: number, tint: number, scale = 0.45, depth = 2999, duration = 220): void {
    const p = this.sparks.get();
    p.setTexture('fx_spark')
      .setPosition(x, y)
      .setTint(tint)
      .setScale(scale)
      .setAlpha(0.7)
      .setDepth(depth)
      .setAngle(0)
      .setVisible(true)
      .setActive(true);
    this.scene.tweens.add({ targets: p, scale: 0.05, alpha: 0, duration, onComplete: () => this.sparks.release(p) });
  }

  /** Escombro que sale despedido (torres destruidas). */
  debris(x: number, y: number, tint: number): void {
    const p = this.sparks.get();
    const size = 6 + Math.random() * 10;
    p.setTexture('fx_px')
      .setPosition(x, y)
      .setTint(tint)
      .setDisplaySize(size, size)
      .setAlpha(1)
      .setDepth(3300)
      .setAngle(0)
      .setVisible(true)
      .setActive(true);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4,
      sp = 120 + Math.random() * 160;
    this.scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * sp,
      y: y + 40 + Math.random() * 30,
      angle: Math.random() * 360,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () =>
        this.scene.tweens.add({ targets: p, alpha: 0, duration: 400, onComplete: () => this.sparks.release(p) }),
    });
  }

  ring(x: number, y: number, r: number, color: number): void {
    const g = this.rings.get();
    g.clear();
    g.fillStyle(color, 0.25).fillCircle(0, 0, r);
    g.lineStyle(4, color, 0.9).strokeCircle(0, 0, r);
    g.setPosition(x, y).setScale(0.6).setAlpha(1).setVisible(true).setActive(true);
    this.scene.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 350, onComplete: () => this.rings.release(g) });
  }

  projectile(move: string): Phaser.GameObjects.Image {
    const [key, frame] = moveFrame(move);
    return this.projectiles.get().setTexture(key, frame).setScale(2.5).setAlpha(1).setVisible(true).setActive(true);
  }

  stats(): Record<string, number> {
    return {
      texts: this.texts.created,
      impacts: this.impacts.created,
      sparks: this.sparks.created,
      rings: this.rings.created,
      projectiles: this.projectiles.created,
    };
  }
}
