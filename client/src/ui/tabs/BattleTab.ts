import type Phaser from 'phaser';
import { W, COLORS, ARENAS, BALLS, CROWNS_FOR_CROWN_BALL, type BallType } from '@arena/shared';
import { Profile, type BallSlot } from '../../meta/Profile';
import { animInfo, portraitSprite } from '../../systems/Assets';
import { Sfx } from '../../systems/Sfx';
import { txt, button, panel, fmtTime } from '../style';
import { openModal, toast } from '../Modal';
import { textPrompt } from '../textPrompt';
import { Tab } from './Tab';

type Txt = Phaser.GameObjects.Text;

export class BattleTab extends Tab {
  // `declare`: se rellenan dentro de build(), que corre en el constructor de Tab.
  declare extraLayer: Phaser.GameObjects.Container;
  declare slotLayer: Phaser.GameObjects.Container;
  declare freeSub: Txt | null;
  declare freeReady: boolean;
  declare sig: string;
  declare timerTexts: Array<{ t: Txt; slot: BallSlot; gems?: boolean }>;

  override build(): void {
    const s = this.scene;
    const R = this.root;
    const arenaIdx = Profile.arena;
    const ar = ARENAS[arenaIdx];

    // ── Panel de arena ──
    R.add(panel(s, 30, 132, W - 60, 500, 0x2a3170, 26));
    R.add(txt(s, W / 2, 168, `Arena ${arenaIdx + 1}`, 22, '#c9c3ff'));
    R.add(txt(s, W / 2, 204, ar.name, 44, '#ffd84a'));
    const g = s.add.graphics();
    const x0 = 60,
      y0 = 240,
      w = W - 120,
      h = 290;
    g.fillStyle(COLORS.panelDark).fillRoundedRect(x0 - 4, y0 - 4, w + 8, h + 8, 18);
    for (let yy = 0; yy < h; yy += 29) {
      for (let xx = 0; xx < w; xx += 30) {
        g.fillStyle(((xx / 30 + yy / 29) | 0) % 2 ? ar.grass[0] : ar.grass[1]);
        g.fillRect(x0 + xx, y0 + yy, Math.min(30, w - xx), Math.min(29, h - yy));
      }
    }
    g.fillStyle(ar.river).fillRect(x0, y0 + h / 2 - 12, w, 24);
    g.fillStyle(ar.riverLight, 0.6).fillRect(x0, y0 + h / 2 - 3, w, 3);
    g.fillStyle(COLORS.bridge)
      .fillRect(x0 + 60, y0 + h / 2 - 18, 50, 36)
      .fillRect(x0 + w - 110, y0 + h / 2 - 18, 50, 36);
    R.add(g);
    const towers: Array<[number, number, string]> = [
      [x0 + 85, y0 + 70, 'tower_princess_enemy'],
      [x0 + w - 85, y0 + 70, 'tower_princess_enemy'],
      [x0 + 85, y0 + h - 30, 'tower_princess_player'],
      [x0 + w - 85, y0 + h - 30, 'tower_princess_player'],
    ];
    for (const [tx, ty, key] of towers) R.add(s.add.image(tx, ty, key).setScale(0.75).setOrigin(0.5, 0.85));
    for (let i = 0; i < 4; i++) {
      R.add(
        s.add
          .image(x0 + 24 + (i % 2) * (w - 48), y0 + 40 + Math.floor(i / 2) * (h - 70), `deco_${ar.deco}`)
          .setScale(0.8),
      );
    }
    const a = animInfo(ar.star, 'Idle');
    const sc = a.frame_height >= 80 ? 2 : 3;
    const star = portraitSprite(s, W / 2, y0 + h / 2 + 50, ar.star).setScale(sc);
    const sh = s.add.ellipse(W / 2, y0 + h / 2 + 50, 70, 22, 0x000000, 0.3);
    R.add([sh, star]);

    // ── Trofeos y progreso a la siguiente arena ──
    const next = ARENAS[arenaIdx + 1];
    const tr = Profile.d.trophies;
    R.add(s.add.image(110, 580, 'ic_trophy').setDisplaySize(46, 46));
    R.add(txt(s, 140, 580, String(tr), 30, '#ffd84a', { originX: 0 }));
    const pg = s.add.graphics();
    const bx = 250,
      bw = 400;
    pg.fillStyle(COLORS.panelDark).fillRoundedRect(bx - 3, 566, bw + 6, 30, 12);
    pg.fillStyle(0x3a3f6b).fillRoundedRect(bx, 569, bw, 24, 10);
    const f = next ? (tr - ar.trophies) / (next.trophies - ar.trophies) : 1;
    pg.fillStyle(0xffc21a).fillRoundedRect(bx, 569, Math.max(16, bw * Math.min(1, f)), 24, 10);
    R.add(pg);
    R.add(txt(s, bx + bw / 2, 581, next ? `${next.name}: ${next.trophies}` : '¡Arena máxima!', 17));

    // ── Botón de batalla ──
    const bb = button(s, W / 2, 712, 400, 118, 'BATALLA', 0xf2b01b, () => this.startBattle(), 52);
    R.add(bb);
    // amistosa por código y TV (en directo y repeticiones)
    R.add(button(s, 78, 712, 116, 96, 'Amigo', COLORS.blue, () => this.friendly(), 24));
    R.add(button(s, W - 78, 712, 116, 96, 'TV', COLORS.orange, () => !s.modalOpen && s.scene.start('Tv'), 30));
    s.tweens.add({ targets: bb, scale: 1.03, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });

    // ── Ball gratis y ball de coronas ──
    this.extraLayer = s.add.container(0, 0);
    R.add(this.extraLayer);
    this.slotLayer = s.add.container(0, 0);
    R.add(this.slotLayer);
    this.drawExtras();
    this.drawSlots();
  }

  startBattle(): void {
    if (this.scene.modalOpen) return;
    this.scene.scene.start('Online', { mode: 'ranked' });
  }

  /** Partida amistosa: crear una sala con código o unirse a la de un amigo. */
  friendly(): void {
    const s = this.scene;
    if (s.modalOpen) return;
    openModal(s, 600, 460, 'Partida amistosa', (box, close) => {
      box.add(txt(s, 0, -80, 'Juega contra un amigo con un código.', 24, '#c9c3ff'));
      box.add(
        button(
          s,
          0,
          10,
          420,
          90,
          'Crear sala',
          COLORS.green,
          () => {
            close();
            s.scene.start('Online', { mode: 'create' });
          },
          32,
        ),
      );
      box.add(
        button(
          s,
          0,
          130,
          420,
          90,
          'Unirme con código',
          COLORS.blue,
          () => {
            close();
            void textPrompt('Código de la sala', { maxLength: 5, upper: true, placeholder: 'ABCDE' }).then((code) => {
              if (code) s.scene.start('Online', { mode: 'join', code });
            });
          },
          30,
        ),
      );
    });
  }

  drawExtras(): void {
    const s = this.scene,
      L = this.extraLayer;
    L.removeAll(true);
    const freeLeft = Profile.freeBallRemaining();
    const crowns = Profile.d.crowns;
    const items: Array<{ x: number; type: BallType; title: string; sub: string; ready: boolean; onTap: () => void }> = [
      {
        x: 30,
        type: 'free',
        title: 'Ball gratis',
        sub: freeLeft > 0 ? fmtTime(freeLeft) : '¡Ábrela!',
        ready: freeLeft <= 0,
        onTap: () => {
          const r = Profile.claimFreeBall();
          if (r) s.openBallScene(r, 'battle');
          else toast(s, `Disponible en ${fmtTime(Profile.freeBallRemaining())}`);
        },
      },
      {
        x: 370,
        type: 'crown',
        title: 'Ball corona',
        sub: `${crowns}/${CROWNS_FOR_CROWN_BALL} coronas`,
        ready: crowns >= CROWNS_FOR_CROWN_BALL,
        onTap: () => {
          const r = Profile.claimCrownBall();
          if (r) s.openBallScene(r, 'battle');
          else toast(s, 'Gana coronas en batalla');
        },
      },
    ];
    this.freeSub = null;
    for (const it of items) {
      L.add(panel(s, it.x, 806, 320, 96, it.ready ? 0x2f7a43 : 0x2a3170, 18));
      const img = s.add.image(it.x + 52, 854, `ball_${it.type}`).setDisplaySize(72, 72);
      L.add(img);
      if (it.ready) s.tweens.add({ targets: img, angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 300 });
      L.add(txt(s, it.x + 100, 836, it.title, 24, '#ffffff', { originX: 0 }));
      const sub = txt(s, it.x + 100, 872, it.sub, 20, it.ready ? '#7dff8a' : '#c9c3ff', { originX: 0 });
      L.add(sub);
      if (it.type === 'free') this.freeSub = sub;
      const z = s.add.zone(it.x + 160, 854, 320, 96).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        if (!s.modalOpen) {
          Sfx.play('click');
          it.onTap();
        }
      });
      L.add(z);
    }
    this.freeReady = freeLeft <= 0;
  }

  slotSignature(): string {
    return JSON.stringify(Profile.d.slots.map((x) => x && [x.type, x.state])) + Profile.d.gems;
  }

  drawSlots(): void {
    const s = this.scene,
      L = this.slotLayer;
    L.removeAll(true);
    this.sig = this.slotSignature();
    this.timerTexts = [];
    const unlocking = Profile.unlocking;
    Profile.d.slots.forEach((slot, i) => {
      const cx = 98 + i * 175,
        cy = 1018,
        w = 160,
        h = 196;
      const state = slot?.state || 'empty';
      const col =
        state === 'ready' ? 0x2f7a43 : state === 'unlocking' ? 0x6b4a1f : state === 'locked' ? 0x2a3170 : 0x1e2347;
      L.add(panel(s, cx - w / 2, cy - h / 2, w, h, col, 18));
      if (!slot) {
        L.add(txt(s, cx, cy - 10, 'Hueco', 22, '#6b70a0'));
        L.add(txt(s, cx, cy + 18, 'libre', 22, '#6b70a0'));
        return;
      }
      const cfg = BALLS[slot.type];
      const img = s.add.image(cx, cy - 26, `ball_${slot.type}`).setDisplaySize(96, 96);
      L.add(img);
      if (state === 'ready') {
        s.tweens.add({ targets: img, y: cy - 38, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
        L.add(txt(s, cx, cy + 58, '¡ABRIR!', 28, '#7dff8a'));
      } else if (state === 'unlocking') {
        const t = txt(s, cx, cy + 40, fmtTime(Profile.remaining(slot)), 22, '#ffd84a');
        L.add(t);
        this.timerTexts.push({ t, slot });
        L.add(s.add.image(cx - 26, cy + 72, 'ic_gem').setDisplaySize(24, 24));
        const gt = txt(s, cx + 4, cy + 72, String(Profile.skipCost(slot)), 20, '#7dff8a', { originX: 0 });
        L.add(gt);
        this.timerTexts.push({ t: gt, slot, gems: true });
      } else {
        L.add(txt(s, cx, cy + 40, cfg.label, 19, '#ffffff'));
        L.add(
          txt(s, cx, cy + 70, unlocking ? fmtTime(cfg.unlock) : 'Desbloquear', 18, unlocking ? '#9aa0c8' : '#ffd84a'),
        );
      }
      const z = s.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        if (!s.modalOpen) {
          Sfx.play('click');
          this.tapSlot(i);
        }
      });
      L.add(z);
    });
  }

  tapSlot(i: number): void {
    const s = this.scene;
    const slot = Profile.d.slots[i];
    if (!slot) {
      toast(s, 'Gana batallas para conseguir Pokéballs');
      return;
    }
    if (slot.state === 'ready') {
      const reward = Profile.openBall(slot.type, slot.arena, i);
      s.openBallScene(reward, 'battle');
      return;
    }
    if (slot.state === 'locked' && !Profile.unlocking) {
      Profile.startUnlock(i);
      Sfx.play('select');
      this.drawSlots();
      return;
    }
    // abrir ya con gemas
    const cfg = BALLS[slot.type];
    openModal(s, 560, 520, cfg.label, (box, close) => {
      box.add(s.add.image(0, -100, `ball_${slot.type}`).setDisplaySize(150, 150));
      box.add(
        txt(
          s,
          0,
          10,
          slot.state === 'locked'
            ? 'Ya hay otra Pokéball desbloqueándose.'
            : `Lista en ${fmtTime(Profile.remaining(slot))}`,
          24,
        ),
      );
      box.add(txt(s, 0, 50, `${cfg.cards} cartas · ${cfg.gold[0]}-${cfg.gold[1]} de oro`, 22, '#c9c3ff'));
      const cost = Profile.skipCost(slot);
      const b = button(
        s,
        0,
        150,
        340,
        90,
        `Abrir ya: ${cost}`,
        COLORS.green,
        () => {
          if (Profile.skip(i)) {
            Sfx.play('coin');
            close();
            const reward = Profile.openBall(slot.type, slot.arena, i);
            s.openBallScene(reward, 'battle');
          } else {
            toast(s, 'No tienes suficientes gemas', '#ff9a9a');
          }
        },
        30,
        { icon: 'ic_gem' },
      );
      box.add(b);
    });
  }

  override tick(): void {
    if (this.slotSignature() !== this.sig) this.drawSlots();
    for (const { t, slot, gems } of this.timerTexts || []) {
      t.setText(gems ? String(Profile.skipCost(slot)) : fmtTime(Profile.remaining(slot)));
    }
    const freeLeft = Profile.freeBallRemaining();
    if (freeLeft <= 0 !== this.freeReady) this.drawExtras();
    else if (this.freeSub && freeLeft > 0) this.freeSub.setText(fmtTime(freeLeft));
  }
}
