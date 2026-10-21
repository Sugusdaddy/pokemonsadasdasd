import { ARENAS, allCardKeys, liveCard, ROAD, type RoadReward, type RoadStep } from '@arena/shared';
import { Profile } from '../../meta/Profile';
import { animInfo } from '../../systems/Assets';
import { Sfx } from '../../systems/Sfx';
import * as kit from '../kit';
import { t, arenaName, ballLabel } from '../../i18n';
import { toast } from '../Modal';
import type { ScrollPanel } from '../ScrollPanel';
import { Tab, runAction } from './Tab';
import { L } from '../../layout';

const ROW = 116;

/** Texto de una recompensa del camino. */
export function roadRewardLabel(r: RoadReward): string {
  if ('gold' in r) return t('road.gold', { n: r.gold });
  if ('gems' in r) return t('road.gems', { n: r.gems });
  return ballLabel(r.ball);
}

export class RoadTab extends Tab {
  static claimable(): boolean {
    return ROAD.some((m) => m.trophies <= Profile.d.maxTrophies && !Profile.d.roadClaimed.includes(m.trophies));
  }

  override build(): void {
    const s = this.scene;
    // PC: columna centrada de 1000 px (en móvil, todo el ancho)
    const A = this.area;
    const colW = L.pc ? Math.min(1000, A.w) : A.w;
    const P = this.scroll(A.x + Math.round((A.w - colW) / 2), A.y, colW, A.h);
    const W = P.w;
    const tr = Profile.d.trophies;
    const best = Profile.d.maxTrophies;
    let y = 20;
    P.add(kit.panel(s, 20, y, W - 40, 100, 'light'));
    P.add(s.add.image(84, y + 48, 'ic_trophy').setDisplaySize(64, 64));
    P.add(kit.text(s, 134, y + 32, t('road.title'), 'h2', '#ffffff', { originX: 0, size: 32 }));
    P.add(kit.text(s, 134, y + 70, t('road.summary', { n: tr, best }), 'label', '#ffd75a', { originX: 0, size: 21 }));
    y += 136;

    // vía central
    const track = s.add.graphics();
    P.add(track);
    let focusY = 0;
    let arenaIdx = 1;
    const startY = y;
    const rows: number[] = [];

    for (const m of ROAD) {
      // cabecera de arena cuando se alcanza su umbral
      while (arenaIdx < ARENAS.length && ARENAS[arenaIdx].trophies <= m.trophies) {
        y = this.arenaHeader(P, arenaIdx, y);
        arenaIdx++;
      }
      const cy = y + ROW / 2;
      rows.push(cy);
      const reached = best >= m.trophies;
      const claimed = Profile.d.roadClaimed.includes(m.trophies);
      if (!focusY && !claimed) focusY = cy;
      // nodo con número de trofeos
      const node = s.add.container(96, cy);
      node.add(kit.panel(s, -62, -26, 124, 50, reached ? 'gold' : 'inset'));
      node.add(kit.text(s, 0, -2, String(m.trophies), 'label', reached ? '#ffffff' : '#7480c0', { size: 24 }));
      // tarjeta de recompensa
      const card = s.add.container(210 + (W - 250) / 2, cy);
      const cw = W - 250;
      card.add(kit.panel(s, -cw / 2, -46, cw, 92, claimed ? 'inset' : reached ? 'green' : 'card'));
      const r = m.reward;
      const icon = 'ball' in r ? `ball_${r.ball}` : 'gems' in r ? 'ic_gem' : 'ic_gold';
      card.add(
        s.add
          .image(-cw / 2 + 52, -2, icon)
          .setDisplaySize(64, 64)
          .setAlpha(claimed ? 0.45 : 1),
      );
      card.add(
        kit.text(s, -cw / 2 + 100, -2, roadRewardLabel(r), 'h3', claimed ? '#5a64a8' : '#ffffff', {
          originX: 0,
          size: 24,
        }),
      );
      if (claimed) {
        card.add(kit.text(s, cw / 2 - 28, -2, t('road.done'), 'label', '#5a64a8', { originX: 1, size: 20 }));
      } else if (reached) {
        const b = kit.button(s, cw / 2 - 98, -4, 160, 56, t('road.claim'), 'primary', () => {}, { size: 22 });
        b.disableInteractive();
        card.add(b);
        P.addTap(210 + cw / 2, cy, cw, 92, () => this.claim(m), card);
      } else {
        card.add(
          s.add
            .image(cw / 2 - 40, -2, 'ic_lock')
            .setDisplaySize(36, 36)
            .setAlpha(0.8),
        );
      }
      P.add(node);
      P.add(card);
      y += ROW;
    }

    // dibuja la vía y el progreso
    track.fillStyle(kit.C.ink).fillRoundedRect(89, startY, 14, y - startY, 7);
    track.fillStyle(0x2a3170).fillRoundedRect(92, startY, 8, y - startY, 4);
    const progress = this.progressY(rows, best);
    track.fillStyle(kit.C.gold).fillRoundedRect(92, startY, 8, Math.max(0, progress - startY), 4);
    P.setContentHeight(y + 40);
    P.set((focusY || progress) - (L.pc ? Math.round(P.h * 0.4) : 400));
  }

  progressY(rows: number[], best: number): number {
    let py = rows[0] - ROW;
    ROAD.forEach((m, i) => {
      if (best >= m.trophies) py = rows[i];
    });
    return py;
  }

  arenaHeader(P: ScrollPanel, idx: number, y: number): number {
    const s = this.scene,
      ar = ARENAS[idx],
      W = P.w;
    const unlocked = Profile.d.maxTrophies >= ar.trophies;
    P.add(kit.panel(s, 20, y + 10, W - 40, 200, unlocked ? 'blue' : 'dark'));
    P.add(
      kit.text(
        s,
        44,
        y + 46,
        t('road.arenaHeader', { n: idx + 1, name: arenaName(idx) }),
        'h2',
        unlocked ? '#ffd75a' : '#7480c0',
        {
          originX: 0,
          size: 30,
        },
      ),
    );
    P.add(
      kit.text(s, W - 44, y + 46, t('road.trophiesN', { n: ar.trophies }), 'label', '#dfe4ff', {
        originX: 1,
        size: 20,
      }),
    );
    const cards = allCardKeys().filter((k) => liveCard(k).arena === idx);
    const step = Math.min(L.pc ? 110 : 92, (W - 130) / Math.max(1, cards.length - 1));
    cards.forEach((k, i) => {
      const c = liveCard(k),
        a = animInfo(c.pokemon, 'Idle');
      const x = 84 + i * step,
        cy = y + 148;
      P.add(kit.panel(s, x - 40, cy - 44, 80, 82, unlocked ? 'light' : 'inset'));
      const sp = s.add.image(x, cy + 26, 'portraits', `${c.pokemon}_0`).setScale(a.frame_height > 60 ? 1 : 1.5);
      sp.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
      if (!unlocked) sp.setTintFill(0x0b0d1f);
      P.add(sp);
    });
    return y + 230;
  }

  claim(m: RoadStep): void {
    const s = this.scene;
    if (Profile.d.roadClaimed.includes(m.trophies)) return;
    void runAction(
      s,
      `road:${m.trophies}`,
      () => Profile.claimRoad(m.trophies),
      (r) => {
        if (r.ball) {
          s.openBallScene(r.ball, 'road');
          return;
        }
        Sfx.play('coin');
        if (r.gold) toast(s, t('common.plusGold', { n: r.gold }), '#ffd84a');
        if (r.gems) toast(s, t('common.plusGems', { n: r.gems }), '#7dff8a');
        this.rebuild();
      },
    );
  }
}
