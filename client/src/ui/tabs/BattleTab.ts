import Phaser from 'phaser';
import { ARENAS, BALLS, CROWNS_FOR_CROWN_BALL, type BallType } from '@arena/shared';
import { L } from '../../layout';
import { Profile, type BallSlot } from '../../meta/Profile';
import { animInfo, portraitSprite } from '../../systems/Assets';
import { Sfx } from '../../systems/Sfx';
import { fmtTime } from '../style';
import * as kit from '../kit';
import { t, arenaName, ballLabel } from '../../i18n';
import { openModal, toast } from '../Modal';
import { textPrompt } from '../textPrompt';
import { Tab, runAction } from './Tab';
import { BRIDGE_OF, DECO_VARIANTS } from '../../art';

type Txt = Phaser.GameObjects.Text;

export class BattleTab extends Tab {
  // `declare`: se rellenan dentro de build(), que corre en el constructor de Tab.
  declare extraLayer: Phaser.GameObjects.Container;
  declare slotLayer: Phaser.GameObjects.Container;
  declare freeSub: Txt | null;
  declare freeReady: boolean;
  declare sig: string;
  declare timerTexts: Array<{ t: Txt; slot: BallSlot; gems?: boolean; bar?: kit.Bar }>;
  /** Dónde va cada bloque: en móvil, una columna; en PC, arena a la izquierda y el resto a la derecha. */
  declare lay: { ox: number; cx: number; btnY: number; extrasY: number; slotsY: number };

  override build(): void {
    const s = this.scene;
    const R = this.root;
    const arenaIdx = Profile.arena;
    const ar = ARENAS[arenaIdx];
    const A = this.area;
    // PC: el bloque (600 de alto) se centra en vertical; columnas de la mitad del ancho
    const oy = L.pc ? A.y + Math.round((A.h - 600) / 2) : 0;
    // la columna derecha (botón, balls) necesita 720; en pantallas estrechas (tableta) la
    // vista de la arena de la izquierda se queda con lo que sobra
    const rw = L.pc ? Math.max(Math.round(A.w / 2) - 20, 720) : 720;
    const px = L.pc ? A.x : 30,
      py = L.pc ? oy + 10 : 150,
      pw = L.pc ? A.w - rw - 40 : 660,
      ph = L.pc ? 590 : 490;
    const rx = L.pc ? A.x + A.w - rw : 0;
    this.lay = {
      ox: rx + Math.round((rw - 720) / 2),
      cx: rx + rw / 2,
      btnY: L.pc ? oy + 110 : 712,
      extrasY: L.pc ? oy + 270 : 806,
      slotsY: L.pc ? oy + 500 : 1018,
    };

    // ── Panel de arena con cinta de nombre ──
    R.add(kit.panel(s, px, py, pw, ph, 'card'));
    const rbw = Math.min(pw - 80, 440);
    R.add(kit.panel(s, px + pw / 2 - rbw / 2, py - 26, rbw, 66, 'blue'));
    R.add(kit.text(s, px + pw / 2, py + 6, arenaName(arenaIdx), 'h2', '#ffd75a', { size: 36 }));
    R.add(kit.text(s, px + pw / 2, py + 58, t('lobby.arenaN', { n: arenaIdx + 1 }), 'label', '#aab3e8', { size: 20 }));

    const g = s.add.graphics();
    const x0 = px + 26,
      y0 = py + 84,
      w = pw - 52,
      h = ph - 170;
    g.fillStyle(kit.C.ink).fillRoundedRect(x0 - 5, y0 - 5, w + 10, h + 10, 16);
    for (let yy = 0; yy < h; yy += 29) {
      for (let xx = 0; xx < w; xx += 30) {
        g.fillStyle(((xx / 30 + yy / 29) | 0) % 2 ? ar.grass[0] : ar.grass[1]);
        g.fillRect(x0 + xx, y0 + yy, Math.min(30, w - xx), Math.min(29, h - yy));
      }
    }
    g.fillStyle(ar.river).fillRect(x0, y0 + h / 2 - 12, w, 24);
    g.fillStyle(ar.riverLight, 0.6).fillRect(x0, y0 + h / 2 - 3, w, 3);
    // sombra interior arriba y abajo
    g.fillStyle(0x000000, 0.18)
      .fillRect(x0, y0, w, 10)
      .fillRect(x0, y0 + h - 10, w, 10);
    R.add(g);
    for (const bx of [x0 + 85, x0 + w - 85])
      R.add(s.add.image(bx, y0 + h / 2, `bridge_${BRIDGE_OF[ar.deco]}`).setScale(0.55));
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
          .image(
            x0 + 24 + (i % 2) * (w - 48),
            y0 + 40 + Math.floor(i / 2) * (h - 70),
            `deco_${ar.deco}_${i % DECO_VARIANTS}`,
          )
          .setScale(0.8),
      );
    }
    const a = animInfo(ar.star, 'Idle');
    const sc = a.frame_height >= 80 ? 2 : 3;
    const halo = s.add
      .image(x0 + w / 2, y0 + h / 2 + 20, 'ui_glow')
      .setTint(0xffe7a0)
      .setAlpha(0.5);
    halo.setDisplaySize(240, 240).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: halo, alpha: 0.25, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    const star = portraitSprite(s, x0 + w / 2, y0 + h / 2 + 50, ar.star).setScale(sc);
    const sh = s.add.ellipse(x0 + w / 2, y0 + h / 2 + 50, 70, 22, 0x000000, 0.3);
    R.add([halo, sh, star]);

    // ── Trofeos y progreso a la siguiente arena ──
    const next = ARENAS[arenaIdx + 1];
    const tr = Profile.d.trophies;
    const ty = py + ph - 44;
    const tp = kit.pill(s, px + 26, ty, 150, 'ic_trophy', String(tr));
    R.add(tp.root);
    const f = next ? (tr - ar.trophies) / (next.trophies - ar.trophies) : 1;
    const bx = px + 196;
    const bar = kit.progressBar(
      s,
      bx,
      ty - 16,
      px + pw - 26 - bx,
      32,
      kit.C.gold,
      f,
      next ? t('lobby.nextArena', { name: arenaName(arenaIdx + 1), n: next.trophies }) : t('lobby.maxArena'),
    );
    R.add(bar.root);

    // ── Botón de batalla ──
    const { ox, cx, btnY } = this.lay;
    const glow = s.add
      .image(cx, btnY + 4, 'ui_glow')
      .setTint(0xffc93c)
      .setBlendMode(Phaser.BlendModes.ADD);
    glow.setDisplaySize(560, 220).setAlpha(0.35);
    R.add(glow);
    s.tweens.add({ targets: glow, alpha: 0.12, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    const bb = kit.button(s, cx, btnY, 400, 118, t('lobby.battle'), 'primary', () => this.startBattle(), {
      size: 54,
      hotkey: L.pc ? t('lobby.enterKey') : undefined,
    });
    R.add(bb);
    // amistosa por código y TV (en directo y repeticiones)
    R.add(
      kit.button(s, ox + (L.pc ? 58 : 78), btnY, 116, 96, t('lobby.friend'), 'info', () => this.friendly(), {
        size: 24,
      }),
    );
    R.add(
      kit.button(
        s,
        ox + (L.pc ? 662 : 642),
        btnY,
        116,
        96,
        t('lobby.tv'),
        'neutral',
        () => {
          if (!s.modalOpen) kit.goTo(s, 'Tv');
        },
        { size: 30 },
      ),
    );
    if (L.pc) R.add(kit.text(s, cx, btnY + 86, t('lobby.hint'), 'small', '#7480c0', { size: 17 }));

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
    kit.goTo(this.scene, 'Online', { mode: 'ranked' });
  }

  /** Partida amistosa: crear una sala con código o unirse a la de un amigo. */
  friendly(): void {
    const s = this.scene;
    if (s.modalOpen) return;
    openModal(s, 620, 470, t('friendly.title'), (box, close) => {
      box.add(kit.text(s, 0, -110, t('friendly.body'), 'body', '#dfe4ff', { size: 22, wordWrap: { width: 520 } }));
      box.add(
        kit.button(
          s,
          0,
          -10,
          440,
          96,
          t('friendly.create'),
          'success',
          () => {
            close();
            kit.goTo(s, 'Online', { mode: 'create' });
          },
          { size: 32 },
        ),
      );
      box.add(
        kit.button(
          s,
          0,
          110,
          440,
          96,
          t('friendly.join'),
          'info',
          () => {
            close();
            void textPrompt(t('friendly.codeTitle'), { maxLength: 5, upper: true, placeholder: 'ABCDE' }).then(
              (code) => {
                if (code) kit.goTo(s, 'Online', { mode: 'join', code });
              },
            );
          },
          { size: 30 },
        ),
      );
    });
  }

  /** Hace que un bloque crezca un poco al pasar el ratón por su zona. */
  private hoverable(zone: Phaser.GameObjects.Zone, target: Phaser.GameObjects.Container): void {
    const s = this.scene;
    zone.on('pointerover', () => s.tweens.add({ targets: target, scale: 1.04, duration: kit.DUR.fast }));
    zone.on('pointerout', () => s.tweens.add({ targets: target, scale: 1, duration: kit.DUR.fast }));
  }

  drawExtras(): void {
    const s = this.scene,
      Ly = this.extraLayer,
      { ox, extrasY: ey } = this.lay;
    Ly.removeAll(true);
    const freeLeft = Profile.freeBallRemaining();
    const crowns = Profile.d.crowns;
    const items: Array<{ x: number; type: BallType; title: string; sub: string; ready: boolean; onTap: () => void }> = [
      {
        x: ox + 30,
        type: 'free',
        title: ballLabel('free'),
        sub: freeLeft > 0 ? fmtTime(freeLeft) : t('lobby.openIt'),
        ready: freeLeft <= 0,
        onTap: () => {
          if (Profile.freeBallRemaining() > 0) {
            toast(s, t('lobby.freeIn', { time: fmtTime(Profile.freeBallRemaining()) }));
            return;
          }
          void runAction(
            s,
            'ball:free',
            () => Profile.claimFreeBall(),
            (r) => s.openBallScene(r, 'battle'),
          );
        },
      },
      {
        x: ox + 370,
        type: 'crown',
        title: ballLabel('crown'),
        sub: t('lobby.crowns', { n: crowns, max: CROWNS_FOR_CROWN_BALL }),
        ready: crowns >= CROWNS_FOR_CROWN_BALL,
        onTap: () => {
          if (Profile.d.crowns < CROWNS_FOR_CROWN_BALL) {
            toast(s, t('lobby.earnCrowns'));
            return;
          }
          void runAction(
            s,
            'ball:crown',
            () => Profile.claimCrownBall(),
            (r) => s.openBallScene(r, 'battle'),
          );
        },
      },
    ];
    this.freeSub = null;
    for (const it of items) {
      const c = s.add.container(it.x + 160, ey + 48);
      c.add(kit.panel(s, -160, -48, 320, 96, it.ready ? 'green' : 'card'));
      const img = s.add.image(-108, -2, `ball_${it.type}`).setDisplaySize(72, 72);
      c.add(img);
      if (it.ready) s.tweens.add({ targets: img, angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 300 });
      c.add(kit.text(s, -60, -16, it.title, 'h3', '#ffffff', { originX: 0, size: 24 }));
      const sub = kit.text(s, -60, 18, it.sub, 'label', it.ready ? '#c9ffd9' : '#aab3e8', { originX: 0, size: 19 });
      c.add(sub);
      if (it.type === 'free') this.freeSub = sub;
      Ly.add(c);
      const z = s.add.zone(it.x + 160, ey + 48, 320, 96).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        if (!s.modalOpen) {
          Sfx.play('click');
          it.onTap();
        }
      });
      this.hoverable(z, c);
      Ly.add(z);
    }
    this.freeReady = freeLeft <= 0;
  }

  slotSignature(): string {
    return JSON.stringify(Profile.d.slots.map((x) => x && [x.type, x.state])) + Profile.d.gems;
  }

  drawSlots(): void {
    const s = this.scene,
      Ly = this.slotLayer;
    Ly.removeAll(true);
    this.sig = this.slotSignature();
    this.timerTexts = [];
    const unlocking = Profile.unlocking;
    Profile.d.slots.forEach((slot, i) => {
      const cx = this.lay.ox + 98 + i * 175,
        cy = this.lay.slotsY,
        w = 160,
        h = 196;
      const state = slot?.state || 'empty';
      const variant: kit.PanelVariant =
        state === 'ready' ? 'green' : state === 'unlocking' ? 'blue' : state === 'locked' ? 'card' : 'inset';
      const c = s.add.container(cx, cy);
      c.add(kit.panel(s, -w / 2, -h / 2, w, h, variant));
      Ly.add(c);
      if (!slot) {
        c.add(kit.text(s, 0, -2, t('lobby.emptySlot'), 'label', '#5a64a8', { size: 21, wordWrap: { width: 130 } }));
        return;
      }
      const img = s.add.image(0, -30, `ball_${slot.type}`).setDisplaySize(96, 96);
      if (state === 'ready') {
        const glow = s.add.image(0, -30, 'ui_glow').setTint(0x9dffb8).setBlendMode(Phaser.BlendModes.ADD);
        glow.setDisplaySize(170, 170).setAlpha(0.5);
        c.add(glow);
      }
      c.add(img);
      if (state === 'ready') {
        s.tweens.add({ targets: img, y: -42, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
        c.add(kit.text(s, 0, 60, t('lobby.open'), 'h3', '#ffffff', { size: 28 }));
      } else if (state === 'unlocking') {
        const tt = kit.text(s, 0, 32, fmtTime(Profile.remaining(slot)), 'label', '#ffd75a', { size: 22 });
        c.add(tt);
        const total = BALLS[slot.type].unlock || 1;
        const bar = kit.progressBar(s, -w / 2 + 14, 48, w - 28, 20, kit.C.gold, 1 - Profile.remaining(slot) / total);
        c.add(bar.root);
        this.timerTexts.push({ t: tt, slot, bar });
        c.add(s.add.image(-22, 84, 'ic_gem').setDisplaySize(24, 24));
        const gt = kit.text(s, -4, 84, String(Profile.skipCost(slot)), 'label', '#9dffb8', { originX: 0, size: 20 });
        c.add(gt);
        this.timerTexts.push({ t: gt, slot, gems: true });
      } else {
        c.add(kit.text(s, 0, 36, ballLabel(slot.type), 'label', '#ffffff', { size: 19 }));
        c.add(
          kit.text(
            s,
            0,
            68,
            unlocking ? fmtTime(BALLS[slot.type].unlock) : t('lobby.unlock'),
            'label',
            unlocking ? '#7480c0' : '#ffd75a',
            { size: 18 },
          ),
        );
      }
      const z = s.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        if (!s.modalOpen) {
          Sfx.play('click');
          this.tapSlot(i);
        }
      });
      this.hoverable(z, c);
      Ly.add(z);
    });
  }

  tapSlot(i: number): void {
    const s = this.scene;
    const slot = Profile.d.slots[i];
    if (!slot) {
      toast(s, t('lobby.winForBalls'));
      return;
    }
    if (slot.state === 'ready') {
      void runAction(
        s,
        `slot:${i}`,
        () => Profile.openSlot(i),
        (reward) => s.openBallScene(reward, 'battle'),
      );
      return;
    }
    if (slot.state === 'locked' && !Profile.unlocking) {
      void runAction(
        s,
        `slot:${i}`,
        () => Profile.startUnlock(i),
        () => {
          Sfx.play('select');
          this.drawSlots();
        },
      );
      return;
    }
    // abrir ya con gemas
    const cfg = BALLS[slot.type];
    openModal(s, 580, 540, ballLabel(slot.type), (box, close) => {
      const glow = s.add.image(0, -110, 'ui_glow').setTint(cfg.colors[0]).setBlendMode(Phaser.BlendModes.ADD);
      glow.setDisplaySize(300, 300).setAlpha(0.5);
      box.add(glow);
      box.add(s.add.image(0, -110, `ball_${slot.type}`).setDisplaySize(150, 150));
      box.add(
        kit.text(
          s,
          0,
          10,
          slot.state === 'locked'
            ? t('lobby.otherUnlocking')
            : t('lobby.readyIn', { time: fmtTime(Profile.remaining(slot)) }),
          'h3',
          '#ffffff',
          { size: 26 },
        ),
      );
      box.add(
        kit.text(
          s,
          0,
          54,
          t('lobby.ballContents', { cards: cfg.cards, min: cfg.gold[0], max: cfg.gold[1] }),
          'body',
          '#aab3e8',
          { size: 21 },
        ),
      );
      const cost = Profile.skipCost(slot);
      box.add(
        kit.button(
          s,
          0,
          160,
          360,
          92,
          t('lobby.openNow', { n: cost }),
          'success',
          () => {
            // pagar con gemas y abrir: dos peticiones seguidas, cada una validada por el servidor
            void runAction(
              s,
              `slot:${i}`,
              async () => {
                await Profile.skip(i);
                return Profile.openSlot(i);
              },
              (reward) => {
                Sfx.play('coin');
                close();
                s.openBallScene(reward, 'battle');
              },
            );
          },
          { size: 30, icon: 'ic_gem' },
        ),
      );
    });
  }

  override tick(): void {
    if (this.slotSignature() !== this.sig) this.drawSlots();
    for (const { t: tt, slot, gems, bar } of this.timerTexts || []) {
      tt.setText(gems ? String(Profile.skipCost(slot)) : fmtTime(Profile.remaining(slot)));
      bar?.set(1 - Profile.remaining(slot) / (BALLS[slot.type].unlock || 1));
    }
    const freeLeft = Profile.freeBallRemaining();
    if (freeLeft <= 0 !== this.freeReady) this.drawExtras();
    else if (this.freeSub && freeLeft > 0) this.freeSub.setText(fmtTime(freeLeft));
  }
}
