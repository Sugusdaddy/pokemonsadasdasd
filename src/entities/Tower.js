import { TOWERS, TOWER_GUARDIANS, COLORS, RULES, TOWER_LEVEL_MULT } from '../config.js';
import { animKey, animInfo, dirFromVector, palette } from '../systems/Assets.js';
import { txt } from '../ui/style.js';

export class Tower {
  constructor(battle, team, kind, x, y, level = 1) {
    const cfg = TOWERS[kind];
    const m = Math.pow(TOWER_LEVEL_MULT, level - 1);
    this.b = battle;
    this.team = team;
    this.kind = kind;
    this.level = level;
    this.isTower = true;
    this.x = x;
    this.y = y;
    this.hp = Math.round(cfg.hp * m);
    this.maxHp = this.hp;
    this.dmg = Math.round(cfg.dmg * m);
    this.hitSpeed = cfg.hitSpeed;
    this.range = cfg.range;
    this.radius = cfg.radius;
    this.types = [];
    this.flying = false;
    this.alive = true;
    this.active = kind !== 'king';
    this.cooldown = 0;
    this.target = null;

    const g = TOWER_GUARDIANS[team][kind];
    this.guardian = g;
    this.move = g.move;
    this.moveData = battle.meta.attacks[g.move];
    this.dir = team === 'player' ? 4 : 0;

    this.base = battle.add.image(x, y + 10, `tower_${kind}_${team}`).setOrigin(0.5, 0.82).setDepth(y);
    const topY = y + 10 - this.base.displayHeight * 0.82 + 8;
    this.gx = x;
    this.gy = topY + 6;
    this.sprite = battle.add.sprite(this.gx, this.gy, `pk_${g.pokemon}_Idle`).setScale(RULES.unitScale).setDepth(y + 1);
    this.play('Idle');
    if (!this.active) {
      this.sprite.setTint(0x9a9ab0);
      this.sleepZ = txt(battle, x + 22, this.gy - 50, 'z', 22, '#c9c3ff').setDepth(y + 2);
      battle.tweens.add({ targets: this.sleepZ, y: this.gy - 70, alpha: 0, duration: 1200, repeat: -1 });
    }

    this.hpBar = battle.add.graphics().setDepth(4500);
    this.hpText = txt(battle, x, 0, '', 16).setDepth(4501);
    this.lvT = txt(battle, x - (kind === 'king' ? 62 : 50), 0, String(level), 15, '#ffffff').setDepth(4502);
    this.drawHp();
  }

  play(anim, force = false) {
    const key = animKey(this.guardian.pokemon, anim, this.dir);
    if (!this.b.anims.exists(key)) return;
    if (!force && this.sprite.anims.currentAnim?.key === key) return;
    this.sprite.play(key);
    const a = animInfo(this.guardian.pokemon, anim);
    this.sprite.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
  }

  activate() {
    if (this.active || !this.alive) return;
    this.active = true;
    this.sprite.clearTint();
    this.sleepZ?.destroy();
    this.b.tweens.add({ targets: this.sprite, scale: RULES.unitScale * 1.3, yoyo: true, duration: 160 });
    this.b.toast(this.team === 'player' ? '¡Tu torre del rey despierta!' : '¡El rey rival despierta!', 0xffd84a);
  }

  update(dt) {
    if (!this.alive || !this.active) return;
    this.cooldown -= dt;
    const t = this.target;
    if (!t || !t.alive || this.dist(t) > this.range) this.target = this.b.findTowerTarget(this);
    const tg = this.target;
    if (!tg) {
      if (!this.sprite.anims.isPlaying) this.play('Idle');
      return;
    }
    const d = dirFromVector(tg.x - this.x, tg.y - this.y);
    if (d !== this.dir) { this.dir = d; this.play('Idle', true); }
    if (this.cooldown <= 0) {
      this.cooldown = this.hitSpeed;
      this.play('Shoot', true);
      this.sprite.once('animationcomplete', () => this.alive && this.play('Idle', true));
      this.b.shoot(this, tg, this.gx, this.gy - 14);
    }
  }

  dist(t) { return Math.hypot(t.x - this.x, t.y - this.y) - t.radius; }

  takeDamage(amount, mult = 1) {
    if (!this.alive) return;
    this.hp -= amount;
    this.b.damageNumber(this.x, this.y - 70, amount, mult);
    const now = this.b.time.now;
    if (!this.lastFlash || now - this.lastFlash > 220) {
      this.lastFlash = now;
      this.base.setTint(0xff9a9a);
      this.b.time.delayedCall(70, () => this.base.active && this.base.clearTint());
    }
    if (this.kind === 'king') this.activate();
    if (this.hp <= 0) this.destroy();
    this.drawHp();
  }

  destroy() {
    this.hp = 0;
    this.alive = false;
    this.base.clearTint();
    this.base.setTexture('tower_rubble').setOrigin(0.5, 0.75);
    this.play('Faint', true);
    this.sleepZ?.destroy();
    this.b.tweens.add({ targets: this.sprite, alpha: 0, delay: 600, duration: 400 });
    this.b.cameras.main.shake(350, 0.012);
    this.b.sfx('tower');
    // escombros
    const col = COLORS[this.team];
    for (let i = 0; i < 18; i++) {
      const p = this.b.add.rectangle(this.x, this.y - 30, 6 + Math.random() * 10, 6 + Math.random() * 10, i % 3 ? 0x8f91a0 : col).setDepth(3300);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 120 + Math.random() * 160;
      this.b.tweens.add({ targets: p, x: this.x + Math.cos(a) * sp, y: this.y + 10 + Math.random() * 30, angle: Math.random() * 360, duration: 600, ease: 'Quad.easeOut', onComplete: () => this.b.tweens.add({ targets: p, alpha: 0, duration: 400, onComplete: () => p.destroy() }) });
    }
    this.b.ringFx(this.x, this.y, 90, palette('fire')[3]);
    this.b.onTowerDestroyed(this);
  }

  drawHp() {
    const g = this.hpBar;
    g.clear();
    if (!this.alive) { this.hpText.setText(''); this.lvT.setText(''); return; }
    const w = this.kind === 'king' ? 100 : 76;
    const h = 14;
    const bx = this.x - w / 2;
    const by = this.y + 30;
    g.fillStyle(COLORS.panelDark).fillRoundedRect(bx - 2, by - 2, w + 4, h + 4, 4);
    g.fillStyle(COLORS[this.team]).fillRoundedRect(bx, by, Math.max(2, w * (this.hp / this.maxHp)), h, 3);
    // insignia de nivel
    g.fillStyle(COLORS.panelDark).fillCircle(bx - 10, by + h / 2, 13);
    g.fillStyle(this.team === 'player' ? 0x3a7cff : 0xc8303a).fillCircle(bx - 10, by + h / 2, 10);
    this.lvT.setPosition(bx - 10, by + h / 2);
    this.hpText.setPosition(this.x, by + h / 2).setText(String(Math.ceil(this.hp)));
  }
}
