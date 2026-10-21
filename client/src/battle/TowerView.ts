import type Phaser from 'phaser';
import { COLORS, RULES, TOWER_GUARDIANS, type AnimName, type SimTower } from '@arena/shared';
import { animKey, animInfo, dirFromVector, palette, pkAtlas } from '../systems/Assets';
import type { View } from './View';
import { Sfx } from '../systems/Sfx';
import { shake } from '../systems/Shake';
import { txt } from '../ui/style';
import type { FxPools } from './Pools';
import { TEAM } from '../systems/teamColors';

/** Dibujo de una torre y de su guardián. Los datos (vida, activa) vienen de la simulación. */
export class TowerView {
  private base: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private sprite: Phaser.GameObjects.Sprite;
  private hpBar: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private lvT: Phaser.GameObjects.Text;
  private sleepZ?: Phaser.GameObjects.Text;
  private guardian: number;
  private frozen = false;
  private dir: number;
  private lastFlash = 0;
  private lastHp = -1;
  private awake: boolean;
  private damaged = false;
  private readonly side: 'player' | 'enemy';
  /** Punto desde el que sale el disparo (encima de la torre). */
  readonly gy: number;
  /** Y de pantalla de la base. */
  readonly sy: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly t: SimTower,
    readonly mine: boolean,
    private readonly view: View,
  ) {
    /** Y de pantalla de la torre. */
    const ty = view.y(t.y);
    this.sy = ty;
    const side = mine ? 'player' : 'enemy';
    this.side = side;
    // el jugador local siempre ve sus guardianes "azules"
    this.guardian = TOWER_GUARDIANS[mine ? 'blue' : 'red'][t.kind].pokemon;
    this.dir = mine ? 4 : 0;
    this.shadow = scene.add
      .image(t.x, ty + 12, 'fx_shadow')
      .setDisplaySize(t.kind === 'king' ? 170 : 130, t.kind === 'king' ? 60 : 48)
      .setAlpha(0.45)
      .setDepth(ty - 1);
    this.base = scene.add
      .image(t.x, ty + 10, `tower_${t.kind}_${side}`)
      .setOrigin(0.5, 0.82)
      .setDepth(ty);
    const topY = ty + 10 - this.base.displayHeight * 0.82 + 8;
    this.gy = topY + 6;
    this.sprite = scene.add
      .sprite(t.x, this.gy, pkAtlas(this.guardian), 'Idle_0_0')
      .setScale(RULES.unitScale)
      .setDepth(ty + 1);
    this.play('Idle');
    this.awake = t.active;
    if (!t.active) {
      this.sprite.setTint(0x9a9ab0);
      this.sleepZ = txt(scene, t.x + 22, this.gy - 50, 'z', 22, '#c9c3ff').setDepth(ty + 2);
      scene.tweens.add({ targets: this.sleepZ, y: this.gy - 70, alpha: 0, duration: 1200, repeat: -1 });
    }
    this.hpBar = scene.add.graphics().setDepth(4500);
    this.hpText = txt(scene, t.x, 0, '', 16).setDepth(4501);
    this.lvT = txt(scene, t.x - (t.kind === 'king' ? 62 : 50), 0, String(t.level), 15, '#ffffff').setDepth(4502);
    this.drawHp();
  }

  private play(anim: AnimName, force = false): void {
    const key = animKey(this.guardian, anim, this.dir);
    if (!this.scene.anims.exists(key)) return;
    if (!force && this.sprite.anims.currentAnim?.key === key) return;
    this.sprite.play(key);
    const a = animInfo(this.guardian, anim);
    this.sprite.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
  }

  onAwake(silent = false): void {
    if (this.awake || !this.t.alive) return;
    this.awake = true;
    this.sprite.clearTint();
    this.sleepZ?.destroy();
    if (!silent)
      this.scene.tweens.add({ targets: this.sprite, scale: RULES.unitScale * 1.3, yoyo: true, duration: 160 });
  }

  onShoot(tx: number, ty: number): void {
    const d = dirFromVector(tx - this.t.x, this.view.dy(ty - this.t.y));
    this.dir = d;
    this.play('Shoot', true);
    this.sprite.once('animationcomplete', () => this.t.alive && this.play('Idle', true));
  }

  onDamage(): void {
    const now = this.scene.time.now;
    if (now - this.lastFlash > 220) {
      this.lastFlash = now;
      this.base.setTint(0xff9a9a);
      this.scene.time.delayedCall(70, () => this.base.active && this.base.clearTint());
    }
  }

  /** silent: sin efectos (al reconstruir la escena tras reconectar). */
  onDestroyed(fx: FxPools, silent = false): void {
    this.base.clearTint();
    this.base.setTexture('tower_rubble').setOrigin(0.5, 0.75);
    this.sleepZ?.destroy();
    if (silent) {
      this.sprite.setVisible(false);
      this.drawHp();
      return;
    }
    this.play('Faint', true);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 600, duration: 400 });
    shake(this.scene, 350, 0.012);
    Sfx.play('tower');
    const col = this.mine ? TEAM.player : TEAM.enemy;
    for (let i = 0; i < 18; i++) fx.debris(this.t.x, this.sy - 30, i % 3 ? 0x8f91a0 : col);
    fx.ring(this.t.x, this.sy, 90, palette('fire')[3]);
    this.drawHp();
  }

  destroy(): void {
    for (const o of [this.shadow, this.base, this.sprite, this.hpBar, this.hpText, this.lvT]) o.destroy();
    this.sleepZ?.destroy();
  }

  update(): void {
    // congelada: el guardián se queda quieto y azulado
    const frozen = this.t.alive && this.t.frozenT > 0;
    if (frozen !== this.frozen) {
      this.frozen = frozen;
      if (frozen) {
        this.sprite.anims.pause();
        this.sprite.setTint(0x8fd0ff);
        this.base.setTint(0xbfe6ff);
      } else {
        this.sprite.anims.resume();
        if (this.t.active) this.sprite.clearTint();
        else this.sprite.setTint(0x9a9ab0);
        this.base.clearTint();
      }
    }
    if (this.t.hp !== this.lastHp) {
      this.drawHp();
      // por debajo de media vida se ve agrietada (con almenas rotas y estandarte roto)
      if (!this.damaged && this.t.alive && this.t.hp < this.t.maxHp * 0.5) {
        this.damaged = true;
        this.base.setTexture(`tower_${this.t.kind}_${this.side}_dmg`);
      }
    }
  }

  private drawHp(): void {
    const t = this.t;
    this.lastHp = t.hp;
    const g = this.hpBar;
    g.clear();
    if (!t.alive) {
      this.hpText.setText('');
      this.lvT.setText('');
      return;
    }
    const w = t.kind === 'king' ? 100 : 76;
    const h = 14;
    const bx = t.x - w / 2;
    const by = this.sy + 30;
    g.fillStyle(COLORS.panelDark).fillRoundedRect(bx - 2, by - 2, w + 4, h + 4, 4);
    g.fillStyle(this.mine ? TEAM.player : TEAM.enemy).fillRoundedRect(bx, by, Math.max(2, w * (t.hp / t.maxHp)), h, 3);
    // insignia de nivel
    g.fillStyle(COLORS.panelDark).fillCircle(bx - 10, by + h / 2, 13);
    g.fillStyle(this.mine ? 0x3a7cff : 0xc8303a).fillCircle(bx - 10, by + h / 2, 10);
    this.lvT.setPosition(bx - 10, by + h / 2);
    this.hpText.setPosition(t.x, by + h / 2).setText(String(Math.ceil(t.hp)));
  }
}
