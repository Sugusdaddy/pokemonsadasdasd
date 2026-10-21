import { RULES, COLORS, SIGHT, T } from '../config.js';
import { animKey, animInfo, dirFromVector } from '../systems/Assets.js';

const HOVER = 22; // altura a la que vuelan las tropas aéreas

/**
 * Una tropa en el campo. Su posición (x, y) es el punto del suelo;
 * el sprite se coloca con el "ground_anchor" de cada animación.
 */
export class Unit {
  constructor(battle, card, team, x, y) {
    this.b = battle;
    this.card = card;
    this.team = team;
    this.isUnit = true;
    this.x = x;
    this.y = y;
    this.hp = card.hp;
    this.maxHp = card.hp;
    this.types = card.types;
    this.flying = card.flying;
    this.radius = card.radius;
    this.mass = card.hp;
    this.alive = true;
    this.state = 'deploy';
    this.deployLeft = RULES.deployTime;
    this.cooldown = 0;
    this.target = null;
    this.retarget = 0;
    this.dir = team === 'player' ? 4 : 0;
    this.slowT = 0; this.slowAmt = 0;
    this.burnT = 0; this.burnDps = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.curAnim = null;
    this.flash = 0;

    const s = battle.add;
    this.shadow = s.ellipse(x, y, this.radius * 2.4, this.radius * 1.1, 0x000000, this.flying ? 0.18 : 0.3);
    this.ring = s.ellipse(x, y, this.radius * 2.6, this.radius * 1.2).setStrokeStyle(3, COLORS[team], 0.85);
    this.sprite = s.sprite(x, y, `pk_${card.pokemon}_Idle`).setScale(card.scale);
    this.hpBar = s.graphics();
    this.play('Idle');
    this.sprite.setAlpha(0.55);
  }

  get speed() { return this.card.speed * (this.slowT > 0 ? 1 - this.slowAmt : 1); }

  play(anim, force = false) {
    const key = animKey(this.card.pokemon, anim, this.dir);
    if (!force && this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    if (!this.b.anims.exists(key)) return;
    this.sprite.play(key);
    const a = animInfo(this.card.pokemon, anim);
    this.sprite.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
    this.curAnim = anim;
    this.animDur = a.total_duration_sec;
  }

  face(tx, ty) {
    const d = dirFromVector(tx - this.x, ty - this.y);
    if (d !== this.dir) {
      this.dir = d;
      if (this.curAnim) {
        // cambia de dirección conservando el frame actual
        const prog = this.sprite.anims.getProgress?.() ?? 0;
        const anim = this.curAnim;
        this.play(anim, true);
        if (anim === 'Walk' || anim === 'Idle') this.sprite.anims.setProgress?.(prog);
      }
    }
  }

  validTarget(t) {
    return t && t.alive && !(this.card.targets === 'ground' && t.flying);
  }

  edgeDist(t) {
    return Math.hypot(t.x - this.x, t.y - this.y) - t.radius - this.radius;
  }

  update(dt) {
    if (!this.alive) return;

    // estados alterados
    if (this.slowT > 0) this.slowT -= dt;
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.takeDamage(this.burnDps * dt, null, true);
      if (!this.alive) return;
    }

    if (this.state === 'deploy') {
      this.deployLeft -= dt;
      this.sprite.setAlpha(0.55 + 0.35 * Math.abs(Math.sin(this.deployLeft * 8)));
      if (this.deployLeft <= 0) { this.state = 'move'; this.sprite.setAlpha(1); }
      this.sync(dt);
      return;
    }

    // ¿cambiar de objetivo?
    this.retarget -= dt;
    const t = this.target;
    const lost = !this.validTarget(t);
    const lostSight = t && t.isUnit && this.state === 'move' && this.edgeDist(t) > SIGHT * 1.3;
    if (lost || lostSight || (this.state === 'move' && this.retarget <= 0)) {
      this.target = this.b.findTarget(this);
      this.retarget = 0.25;
    }
    const tg = this.target;
    if (!tg) { this.play('Idle'); this.sync(dt); return; }

    this.cooldown -= dt;
    if (this.edgeDist(tg) <= this.card.range) {
      if (this.state !== 'attack') {
        this.state = 'attack';
        this.cooldown = Math.max(this.cooldown, this.card.hitSpeed * 0.35);
      }
      this.face(tg.x, tg.y);
      if (this.cooldown <= 0) {
        this.attack(tg);
        this.cooldown = this.card.hitSpeed * (this.slowT > 0 ? 1 + this.slowAmt : 1);
      } else if (!this.sprite.anims.isPlaying || this.curAnim === 'Walk') {
        this.play('Idle');
      }
    } else {
      this.state = 'move';
      const [wx, wy] = this.b.pathPoint(this, tg.x, tg.y);
      const dx = wx - this.x, dy = wy - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const step = Math.min(d, this.speed * dt);
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        this.face(wx, wy);
      }
      if (this.curAnim !== 'Walk' && !(this.isCasting() && this.sprite.anims.isPlaying)) this.play('Walk');
    }
    this.sync(dt);
  }

  isCasting() { return this.curAnim === 'Attack' || this.curAnim === 'Shoot' || this.curAnim === 'Charge'; }

  attack(tg) {
    const melee = this.card.range <= 1.2 * T;
    const anim = melee ? 'Attack' : (this.b.castAnim(this.card.moveKind) || 'Shoot');
    this.play(anim, true);
    const hitDelay = Math.min(0.25, (this.animDur || 0.4) * 0.5) * 1000;
    this.b.time.delayedCall(hitDelay, () => {
      if (!this.alive) return;
      if (melee) {
        if (tg.alive) this.b.hit(this, tg, tg.x, tg.y);
      } else {
        this.b.shoot(this, tg, this.x, this.y - (this.flying ? HOVER : 14));
      }
    });
  }

  takeDamage(amount, mult = 1, silent = false) {
    if (!this.alive) return;
    this.hp -= amount;
    if (!silent) {
      this.flash = 0.07;
      this.b.damageNumber(this.x, this.y - 40, amount, mult);
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.b.sfx('faint');
    this.hpBar.destroy();
    this.ring.destroy();
    this.play('Faint', true);
    const dur = Math.max(0.3, this.animDur || 0.4) * 1000;
    this.b.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      delay: dur,
      duration: 300,
      onComplete: () => { this.sprite.destroy(); this.shadow.destroy(); },
    });
  }

  /** Sincroniza sprite, sombra y barra de vida con la posición lógica. */
  sync(dt = 0) {
    if (!this.alive) return;
    this.bob += dt * 4;
    const drop = this.state === 'deploy' ? Math.max(0, (this.deployLeft - (RULES.deployTime - 0.22)) / 0.22) * 90 : 0;
    const lift = (this.flying ? HOVER + Math.sin(this.bob) * 3 : 0) + drop;
    this.sprite.setPosition(this.x, this.y - lift);
    this.shadow.setPosition(this.x, this.y);
    this.ring.setPosition(this.x, this.y);
    const depth = this.y + (this.flying ? 2000 : 0);
    this.sprite.setDepth(depth);
    this.shadow.setDepth(depth - 2);
    this.ring.setDepth(depth - 1);
    if (this.flash > 0) { this.flash -= dt; this.sprite.setTintFill(0xffffff); }
    else if (this.burnT > 0) this.sprite.setTint(0xffb080);
    else if (this.slowT > 0) this.sprite.setTint(0x9fd8ff);
    else this.sprite.clearTint();

    const g = this.hpBar;
    g.clear();
    if (this.hp < this.maxHp) {
      const w = Math.max(28, this.radius * 3), h = 6;
      const bx = this.x - w / 2, by = this.y - lift - this.sprite.displayHeight * 0.55 - 10;
      g.fillStyle(0x14122b).fillRect(bx - 1, by - 1, w + 2, h + 2);
      g.fillStyle(COLORS[this.team]).fillRect(bx, by, w * Math.max(0, this.hp / this.maxHp), h);
      g.setDepth(4000);
    }
  }
}
