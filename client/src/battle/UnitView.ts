import type Phaser from 'phaser';
import { COLORS, RULES, PACK, HOVER, T, type AnimName, type SimUnit } from '@arena/shared';
import { animKey, animInfo, dirFromVector, pkAtlas } from '../systems/Assets';
import type { View } from './View';
import { Sfx } from '../systems/Sfx';

const CASTING = new Set<AnimName>(['Attack', 'Shoot', 'Charge']);

/**
 * Dibujo de una tropa de la simulación. No tiene lógica de juego: interpola la
 * posición entre ticks y elige animación según el estado que marca la simulación.
 */
export class UnitView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Ellipse;
  private hpBar: Phaser.GameObjects.Graphics;
  private dir: number;
  private curAnim: AnimName | null = null;
  private bob = Math.random() * Math.PI * 2;
  private flash = 0;
  private dead = false;
  /** Posición dibujada (suelo). */
  x: number;
  y: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly u: SimUnit,
    readonly mine: boolean,
    private readonly view: View,
  ) {
    const s = scene.add;
    const r = u.radius;
    this.x = u.x;
    this.y = view.y(u.y);
    this.dir = view.dy(u.faceY) < 0 ? 4 : 0;
    // sombra suave (más clara si vuela)
    this.shadow = s
      .image(u.x, this.y, 'fx_shadow')
      .setDisplaySize(r * 2.7, r * 1.25)
      .setAlpha(u.flying ? 0.3 : 0.55);
    this.ring = s.ellipse(u.x, this.y, r * 2.6, r * 1.2).setStrokeStyle(3, mine ? COLORS.player : COLORS.enemy, 0.85);
    this.sprite = s.sprite(u.x, this.y, pkAtlas(u.card.pokemon), 'Idle_0_0').setScale(u.card.scale);
    this.hpBar = s.graphics();
    this.play('Idle');
    this.sprite.setAlpha(0.55);
  }

  private play(anim: AnimName, force = false): void {
    const id = this.u.card.pokemon;
    const key = animKey(id, anim, this.dir);
    if (!force && this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    if (!this.scene.anims.exists(key)) return;
    this.sprite.play(key);
    const a = animInfo(id, anim);
    this.sprite.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
    this.curAnim = anim;
  }

  private face(dx: number, dy: number): void {
    if (Math.abs(dx) + Math.abs(dy) < 0.01) return;
    const d = dirFromVector(dx, dy);
    if (d === this.dir) return;
    this.dir = d;
    if (!this.curAnim) return;
    // cambia de dirección conservando el frame actual
    const prog = this.sprite.anims.getProgress();
    const anim = this.curAnim;
    this.play(anim, true);
    if (anim === 'Walk' || anim === 'Idle') this.sprite.anims.setProgress(prog);
  }

  private isCasting(): boolean {
    return !!this.curAnim && CASTING.has(this.curAnim) && this.sprite.anims.isPlaying;
  }

  /** La simulación ha empezado un ataque. */
  onAttack(melee: boolean): void {
    const anim = melee ? 'Attack' : (PACK.castAnim[this.u.card.moveKind] ?? 'Shoot');
    this.face(this.u.faceX, this.view.dy(this.u.faceY));
    this.play(anim === 'Walk' ? 'Attack' : anim, true);
  }

  onDamage(silent: boolean): void {
    if (!silent) this.flash = 0.07;
  }

  onDeath(): void {
    if (this.dead) return;
    this.dead = true;
    Sfx.play('faint');
    this.hpBar.destroy();
    this.ring.destroy();
    this.play('Faint', true);
    const dur = Math.max(0.3, animInfo(this.u.card.pokemon, 'Faint').total_duration_sec || 0.4) * 1000;
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      delay: dur,
      duration: 300,
      onComplete: () => {
        this.sprite.destroy();
        this.shadow.destroy();
      },
    });
  }

  /** alpha = fracción del tick actual (0..1) para interpolar. */
  update(alpha: number, dt: number): void {
    if (this.dead) return;
    const u = this.u;
    this.x = u.px + (u.x - u.px) * alpha;
    this.y = this.view.y(u.py + (u.y - u.py) * alpha);
    this.bob += dt * 4;

    if (u.state === 'deploy') {
      this.sprite.setAlpha(0.55 + 0.35 * Math.abs(Math.sin(u.deployLeft * 8)));
    } else {
      this.sprite.setAlpha(1);
      this.face(u.faceX, this.view.dy(u.faceY));
      if (u.state === 'move') {
        if (this.curAnim !== 'Walk' && !this.isCasting()) this.play('Walk');
      } else if (!this.isCasting() && this.curAnim !== 'Idle') {
        this.play('Idle');
      }
    }

    const drop = u.state === 'deploy' ? Math.max(0, (u.deployLeft - (RULES.deployTime - 0.22)) / 0.22) * 90 : 0;
    const lift = (u.flying ? HOVER + Math.sin(this.bob) * 3 : 0) + drop;
    this.sprite.setPosition(this.x, this.y - lift);
    this.shadow.setPosition(this.x, this.y);
    this.ring.setPosition(this.x, this.y);
    const depth = this.y + (u.flying ? 2000 : 0);
    this.sprite.setDepth(depth);
    this.shadow.setDepth(depth - 2);
    this.ring.setDepth(depth - 1);
    if (this.flash > 0) {
      this.flash -= dt;
      this.sprite.setTintFill(0xffffff);
    } else if (u.burnT > 0) this.sprite.setTint(0xffb080);
    else if (u.slowT > 0) this.sprite.setTint(0x9fd8ff);
    else this.sprite.clearTint();

    const g = this.hpBar;
    g.clear();
    if (u.hp < u.maxHp) {
      const w = Math.max(28, u.radius * 3),
        h = 6;
      const bx = this.x - w / 2,
        by = this.y - lift - this.sprite.displayHeight * 0.55 - 10;
      g.fillStyle(0x14122b).fillRect(bx - 1, by - 1, w + 2, h + 2);
      g.fillStyle(this.mine ? COLORS.player : COLORS.enemy).fillRect(bx, by, w * Math.max(0, u.hp / u.maxHp), h);
      g.setDepth(4000);
    }
  }

  /** Borra la vista al instante (reconstrucción tras reconectar). */
  destroy(): void {
    this.dead = true;
    for (const o of [this.sprite, this.shadow, this.ring, this.hpBar]) o.destroy();
  }

  /** Altura del cuerpo para colocar números de daño. */
  get top(): number {
    return this.y - (this.u.flying ? HOVER : 0) - Math.min(this.sprite.displayHeight * 0.5, 2 * T);
  }
}
