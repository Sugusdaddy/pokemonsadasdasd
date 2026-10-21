import { W, COLORS, ARENAS, allCardKeys, getCard, ROAD, rewardLabel, type RoadStep } from '@arena/shared';
import { Profile } from '../../meta/Profile';
import { animInfo } from '../../systems/Assets';
import { Sfx } from '../../systems/Sfx';
import { txt, panel } from '../style';
import { toast } from '../Modal';
import type { ScrollPanel } from '../ScrollPanel';
import { Tab } from './Tab';

const ROW = 116;

export class RoadTab extends Tab {
  static claimable(): boolean {
    return ROAD.some((m) => m.trophies <= Profile.d.maxTrophies && !Profile.d.roadClaimed.includes(m.trophies));
  }

  override build(): void {
    const s = this.scene;
    const P = this.scroll();
    const tr = Profile.d.trophies;
    const best = Profile.d.maxTrophies;
    let y = 20;
    P.add(panel(s, 20, y, W - 40, 100, 0x2a3170, 20));
    P.add(s.add.image(80, y + 50, 'ic_trophy').setDisplaySize(60, 60));
    P.add(txt(s, 130, y + 34, 'Camino de trofeos', 30, '#ffffff', { originX: 0 }));
    P.add(txt(s, 130, y + 70, `Trofeos: ${tr}  ·  Récord: ${best}`, 21, '#ffd84a', { originX: 0 }));
    y += 130;

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
      const g = s.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(36, cy - 24, 120, 48, 14);
      g.fillStyle(reached ? 0xffc21a : 0x3b3f63).fillRoundedRect(39, cy - 21, 114, 42, 12);
      P.add(g);
      P.add(
        txt(s, 96, cy, String(m.trophies), 24, reached ? '#14122b' : '#9aa0c8', { strokeThickness: reached ? 0 : 4 }),
      );
      // tarjeta de recompensa
      const col = claimed ? 0x262a48 : reached ? 0x2f7a43 : 0x2a3170;
      P.add(panel(s, 210, cy - 46, 470, 92, col, 16));
      const r = m.reward;
      const icon = 'ball' in r ? `ball_${r.ball}` : 'gems' in r ? 'ic_gem' : 'ic_gold';
      P.add(
        s.add
          .image(262, cy, icon)
          .setDisplaySize(64, 64)
          .setAlpha(claimed ? 0.5 : 1),
      );
      P.add(txt(s, 310, cy, rewardLabel(r), 24, claimed ? '#6b70a0' : '#ffffff', { originX: 0 }));
      if (claimed) P.add(txt(s, 650, cy, 'Hecho', 20, '#6b70a0', { originX: 1 }));
      else if (reached) {
        const pg = s.add.graphics();
        pg.fillStyle(COLORS.panelDark).fillRoundedRect(522, cy - 25, 146, 54, 14);
        pg.fillStyle(COLORS.orange).fillRoundedRect(525, cy - 22, 140, 46, 12);
        P.add(pg);
        P.add(txt(s, 595, cy, 'Reclamar', 22));
        P.addTap(445, cy, 470, 92, () => this.claim(m));
      } else {
        P.add(s.add.image(640, cy, 'ic_lock').setDisplaySize(36, 36));
      }
      y += ROW;
    }

    // dibuja la vía y el progreso
    track.fillStyle(COLORS.panelDark).fillRect(91, startY, 10, y - startY);
    const progress = this.progressY(rows, best);
    track.fillStyle(0xffc21a).fillRect(93, startY, 6, Math.max(0, progress - startY));
    P.setContentHeight(y + 40);
    P.set((focusY || progress) - 400);
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
      ar = ARENAS[idx];
    const unlocked = Profile.d.maxTrophies >= ar.trophies;
    P.add(panel(s, 20, y + 10, W - 40, 200, unlocked ? 0x3a3f8f : 0x23284d, 22));
    P.add(txt(s, 44, y + 44, `Arena ${idx + 1} · ${ar.name}`, 30, unlocked ? '#ffd84a' : '#9aa0c8', { originX: 0 }));
    P.add(txt(s, 44, y + 80, `${ar.trophies} trofeos`, 20, '#c9c3ff', { originX: 0 }));
    const cards = allCardKeys().filter((k) => getCard(k).arena === idx);
    const step = Math.min(92, 590 / Math.max(1, cards.length - 1));
    cards.forEach((k, i) => {
      const c = getCard(k),
        a = animInfo(c.pokemon, 'Idle');
      const x = 80 + i * step,
        cy = y + 160;
      const g = s.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(x - 40, cy - 46, 80, 84, 12);
      g.fillStyle(unlocked ? 0x4a55c8 : 0x30345c).fillRoundedRect(x - 37, cy - 43, 74, 78, 10);
      P.add(g);
      const sp = s.add.image(x, cy + 24, 'portraits', `${c.pokemon}_0`).setScale(a.frame_height > 60 ? 1 : 1.5);
      sp.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
      if (!unlocked) sp.setTintFill(0x14122b);
      P.add(sp);
    });
    return y + 230;
  }

  claim(m: RoadStep): void {
    const s = this.scene;
    if (Profile.d.roadClaimed.includes(m.trophies)) return;
    Profile.d.roadClaimed.push(m.trophies);
    const r = m.reward;
    if ('gold' in r) {
      Profile.d.gold += r.gold;
      Sfx.play('coin');
      toast(s, `+${r.gold} de oro`, '#ffd84a');
    }
    if ('gems' in r) {
      Profile.d.gems += r.gems;
      Sfx.play('coin');
      toast(s, `+${r.gems} gemas`, '#7dff8a');
    }
    Profile.save();
    if ('ball' in r) {
      const reward = Profile.openBall(r.ball, Profile.arena);
      s.openBallScene(reward, 'road');
      return;
    }
    this.rebuild();
  }
}
