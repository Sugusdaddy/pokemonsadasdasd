import { W, COLORS, ARENAS } from '../../config.js';
import { getCard, allCardKeys } from '../../data/cards.js';
import { Profile } from '../../meta/Profile.js';
import { Sfx } from '../../systems/Sfx.js';
import { makeCardView } from '../CardView.js';
import { openCardPopup } from '../CardPopup.js';
import { txt, panel } from '../style.js';
import { toast } from '../Modal.js';
import { Tab, CONTENT_TOP } from './Tab.js';

const COLS = [98, 272, 448, 622];
const CW = 150, CH = 180;

export class CardsTab extends Tab {
  build() {
    const s = this.scene;
    const P = this.scroll();
    const deck = Profile.deck;
    let y = 10;

    // ── Cabecera de mazo + selector de mazos ──
    P.add(panel(s, 20, y, W - 40, 86, 0x2a3170, 18));
    P.add(txt(s, 44, y + 43, 'Mazo de batalla', 30, '#ffffff', { originX: 0 }));
    for (let i = 0; i < 3; i++) {
      const bx = 500 + i * 70, active = Profile.d.activeDeck === i;
      const g = s.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(bx - 28, y + 15, 56, 60, 12);
      g.fillStyle(active ? COLORS.orange : 0x4a4f80).fillRoundedRect(bx - 25, y + 17, 50, 54, 10);
      P.add(g);
      P.add(txt(s, bx, y + 44, String(i + 1), 28));
      P.addTap(bx, y + 44, 60, 64, () => { Sfx.play('select'); Profile.d.activeDeck = i; Profile.save(); this.swapKey = null; this.rebuild(); });
    }
    y += 110;

    if (this.swapKey) {
      P.add(panel(s, 20, y, W - 40, 64, 0x6b4a1f, 16));
      P.add(txt(s, W / 2, y + 32, `Toca la carta que quieres cambiar por ${getCard(this.swapKey).name}`, 21, '#ffd84a'));
      P.addTap(W / 2, y + 32, W - 40, 64, () => { this.swapKey = null; this.rebuild(); });
      y += 80;
    }

    // ── Mazo (8 cartas) ──
    deck.forEach((k, i) => {
      const cx = COLS[i % 4], cy = y + CH / 2 + Math.floor(i / 4) * 236;
      const v = this.cardView(k, cx, cy);
      P.add(v);
      if (this.swapKey) s.tweens.add({ targets: v, angle: { from: -2, to: 2 }, yoyo: true, repeat: -1, duration: 160 });
      P.addTap(cx, cy, CW, CH, () => {
        if (this.swapKey) {
          Profile.setDeckCard(i, this.swapKey);
          Sfx.play('deploy');
          this.swapKey = null;
          this.rebuild();
        } else {
          Sfx.play('click');
          openCardPopup(s, k, { onChange: () => this.rebuild() });
        }
      });
    });
    y += 2 * 236 + 4;
    const avg = deck.reduce((a, k) => a + getCard(k).cost, 0) / deck.length;
    P.add(txt(s, W / 2, y, `Coste medio de elixir: ${avg.toFixed(1)}`, 24, '#f2b8ff'));
    y += 50;

    // ── Colección ──
    const all = allCardKeys();
    const owned = all.filter((k) => Profile.has(k) && !deck.includes(k));
    const locked = all.filter((k) => !Profile.has(k));
    P.add(panel(s, 20, y, W - 40, 70, 0x2a3170, 18));
    P.add(txt(s, 44, y + 35, 'Colección', 28, '#ffffff', { originX: 0 }));
    P.add(txt(s, W - 44, y + 35, `Encontradas: ${all.length - locked.length}/${all.length}`, 22, '#c9c3ff', { originX: 1 }));
    y += 92;
    owned.forEach((k, i) => {
      const cx = COLS[i % 4], cy = y + CH / 2 + Math.floor(i / 4) * 236;
      P.add(this.cardView(k, cx, cy));
      P.addTap(cx, cy, CW, CH, () => {
        Sfx.play('click');
        openCardPopup(s, k, {
          onChange: () => this.rebuild(),
          onUse: (key) => { this.swapKey = key; this.rebuild(); this.panels[0].set(0); toast(s, 'Elige la carta del mazo a sustituir', '#ffd84a', CONTENT_TOP + 200); },
        });
      });
    });
    if (!owned.length) {
      P.add(txt(s, W / 2, y + 40, 'Abre Pokéballs para conseguir más cartas', 22, '#9aa0c8'));
      y += 90;
    } else {
      y += Math.ceil(owned.length / 4) * 236;
    }

    if (locked.length) {
      P.add(txt(s, W / 2, y + 10, 'Por descubrir', 28, '#9aa0c8'));
      y += 50;
      locked.forEach((k, i) => {
        const cx = COLS[i % 4], cy = y + CH / 2 + Math.floor(i / 4) * 236;
        P.add(makeCardView(s, getCard(k), cx, cy, CW, CH, { locked: true }));
        P.add(txt(s, cx, cy + CH / 2 + 22, ARENAS[getCard(k).arena].name, 16, getCard(k).arena <= Profile.arena ? '#ffd84a' : '#6b70a0'));
        P.addTap(cx, cy, CW, CH, () => { Sfx.play('click'); openCardPopup(s, k); });
      });
      y += Math.ceil(locked.length / 4) * 236;
    }
    P.setContentHeight(y + 40);
  }

  cardView(k, cx, cy) {
    const owned = Profile.d.cards[k];
    return makeCardView(this.scene, getCard(k), cx, cy, CW, CH, {
      level: Profile.level(k),
      progress: { have: owned.count, need: Profile.cardsNeeded(k) },
    });
  }
}
