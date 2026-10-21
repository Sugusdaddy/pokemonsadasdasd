import type Phaser from 'phaser';
import { COLORS, RULES, TOWER_GUARDIANS, type AnimName, type SimTower } from '@arena/shared';
import { animKey, animInfo, dirFromVector, palette, pkAtlas } from '../systems/Assets';
import { Sfx } from '../systems/Sfx';
import { txt } from '../ui/style';
import type { FxPools } from './Pools';

/** Dibujo de una torre y de su guardián. Los datos (vida, activa) vienen de la simulación. */
export class TowerView {
  private base: Phaser.GameObjects.Image;
  private sprite: Phaser.GameObjects.Sprite;
  private hpBar: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private lvT: Phaser.GameObjects.Text;
  private sleepZ?: Phaser.GameObjects.Text;
  private guardian: number;
  private dir: number;
  private lastFlash = 0;
  private lastHp = -1;
  private awake: boolean;
  /** Punto desde el que sale el disparo (encima de la torre). */
  readonly gy: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly t: SimTower,
    readonly mine: boolean,
  ) {
    const side = mine ? 'player' : 'enemy';
    // el jugador local siempre ve sus guardianes "azules"
    this.guardian = TOWER_GUARDIANS[mine ? 'blue' : 'red'][t.kind].pokemon;
    this.dir = mine ? 4 : 0;
    this.base = scene.add
      .image(t.x, t.y + 10, `tower_${t.kind}_${side}`)
      .setOrigin(0.5, 0.82)
      .setDepth(t.y);
    const topY = t.y + 10 - this.base.displayHeight * 0.82 + 8;
    this.gy = topY + 6;
    this.sprite = scene.add
      .sprite(t.x, this.gy, pkAtlas(this.guardian), 'Idle_0_0')
      .setScale(RULES.unitScale)
      .setDepth(t.y + 1);
    this.play('Idle');
    this.awake = t.active;
    if (!t.active) {
      this.sprite.setTint(0x9a9ab0);
      this.sleepZ = txt(scene, t.x + 22, this.gy - 50, 'z', 22, '#c9c3ff').setDepth(t.y + 2);
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

  onAwake(): void {
    if (this.awake || !this.t.alive) return;
    this.awake = true;
    this.sprite.clearTint();
    this.sleepZ?.destroy();
    this.scene.tweens.add({ targets: this.sprite, scale: RULES.unitScale * 1.3, yoyo: true, duration: 160 });
  }

  onShoot(tx: number, ty: number): void {
    const d = dirFromVector(tx - this.t.x, ty - this.t.y);
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

  onDestroyed(fx: FxPools): void {
    this.base.clearTint();
    this.base.setTexture('tower_rubble').setOrigin(0.5, 0.75);
    this.play('Faint', true);
    this.sleepZ?.destroy();
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 600, duration: 400 });
    this.scene.cameras.main.shake(350, 0.012);
    Sfx.play('tower');
    const col = this.mine ? COLORS.player : COLORS.enemy;
    for (let i = 0; i < 18; i++) fx.debris(this.t.x, this.t.y - 30, i % 3 ? 0x8f91a0 : col);
    fx.ring(this.t.x, this.t.y, 90, palette('fire')[3]);
    this.drawHp();
  }

  update(): void {
    if (this.t.hp !== this.lastHp) this.drawHp();
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
    const by = t.y + 30;
    g.fillStyle(COLORS.panelDark).fillRoundedRect(bx - 2, by - 2, w + 4, h + 4, 4);
    g.fillStyle(this.mine ? COLORS.player : COLORS.enemy).fillRoundedRect(
      bx,
      by,
      Math.max(2, w * (t.hp / t.maxHp)),
      h,
      3,
    );
    // insignia de nivel
    g.fillStyle(COLORS.panelDark).fillCircle(bx - 10, by + h / 2, 13);
    g.fillStyle(this.mine ? 0x3a7cff : 0xc8303a).fillCircle(bx - 10, by + h / 2, 10);
    this.lvT.setPosition(bx - 10, by + h / 2);
    this.hpText.setPosition(t.x, by + h / 2).setText(String(Math.ceil(t.hp)));
  }
}
