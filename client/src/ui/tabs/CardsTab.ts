import { getCard, allCardKeys } from '@arena/shared';
import { L } from '../../layout';
import { Profile } from '../../meta/Profile';
import { Sfx } from '../../systems/Sfx';
import { makeCardView, type CardView } from '../CardView';
import { openCardPopup } from '../CardPopup';
import * as kit from '../kit';
import { t, cardName, arenaName } from '../../i18n';
import { toast } from '../Modal';
import { Tab, sectionHeader, runAction } from './Tab';

const COLS = [98, 272, 448, 622];
const CW = 150,
  CH = 180;
const STEP_X = 176,
  STEP_Y = 236;

/** Rejilla de cartas: 4 columnas fijas en móvil; en PC, las que quepan en el ancho. */
function grid(width: number) {
  const cols = L.pc ? Math.max(4, Math.floor((width - 40) / STEP_X)) : 4;
  const x0 = Math.round((width - (cols - 1) * STEP_X) / 2);
  return {
    cols,
    x: (i: number) => (L.pc ? x0 + (i % cols) * STEP_X : COLS[i % 4]),
    row: (i: number) => Math.floor(i / cols),
    rows: (n: number) => Math.ceil(n / cols),
  };
}

export class CardsTab extends Tab {
  // `declare`: no se reinicia tras el build() del constructor de Tab.
  declare swapKey: string | null;

  override build(): void {
    const s = this.scene;
    const P = this.scroll();
    const W = P.w;
    const G = grid(W);
    const deck = Profile.deck;
    let y = 24;

    // ── Cabecera de mazo + selector de mazos ──
    const avg = deck.reduce((a, k) => a + getCard(k).cost, 0) / deck.length;
    for (const o of sectionHeader(s, 30, y + 6, W - 60, t('cards.deck'))) P.add(o);
    P.add(kit.text(s, W - 260, y + 6, t('cards.deckN'), 'label', '#aab3e8', { originX: 1, size: 20 }));
    for (let i = 0; i < 3; i++) {
      const bx = W - 200 + i * 66,
        active = Profile.d.activeDeck === i;
      const c = s.add.container(bx, y + 4);
      c.add(kit.panel(s, -27, -27, 54, 52, active ? 'gold' : 'dark'));
      c.add(kit.text(s, 0, -2, String(i + 1), 'h3', active ? '#ffffff' : '#aab3e8', { size: 26 }));
      P.add(c);
      P.addTap(
        bx,
        y + 4,
        60,
        60,
        () => {
          if (Profile.d.activeDeck === i) return;
          void runAction(
            s,
            'deck',
            () => Profile.setActiveDeck(i),
            () => {
              Sfx.play('select');
              this.swapKey = null;
              this.rebuild();
            },
          );
        },
        c,
      );
    }
    y += 64;

    if (this.swapKey) {
      P.add(kit.panel(s, 20, y, W - 40, 64, 'gold'));
      P.add(
        kit.text(s, W / 2, y + 30, t('cards.swapHint', { name: cardName(getCard(this.swapKey)) }), 'h3', '#ffffff', {
          size: 22,
        }),
      );
      P.addTap(W / 2, y + 32, W - 40, 64, () => {
        this.swapKey = null;
        this.rebuild();
      });
      y += 84;
    }

    // ── Mazo (8 cartas) ──
    deck.forEach((k, i) => {
      const cx = G.x(i),
        cy = y + CH / 2 + G.row(i) * STEP_Y;
      const v = this.cardView(k, cx, cy);
      P.add(v);
      if (this.swapKey) s.tweens.add({ targets: v, angle: { from: -2, to: 2 }, yoyo: true, repeat: -1, duration: 160 });
      P.addTap(
        cx,
        cy,
        CW,
        CH,
        () => {
          if (this.swapKey) {
            const key = this.swapKey;
            void runAction(
              s,
              'deck',
              () => Profile.setDeckCard(i, key),
              () => {
                Sfx.play('deploy');
                this.swapKey = null;
                this.rebuild();
              },
            );
          } else {
            Sfx.play('click');
            openCardPopup(s, k, { onChange: () => this.rebuild() });
          }
        },
        v,
      );
    });
    y += G.rows(deck.length) * STEP_Y + 4;
    // coste medio con su gota de elixir
    const avgT = kit.text(s, W / 2 + 14, y, t('cards.avgElixir', { n: avg.toFixed(1) }), 'label', '#f2b8ff', {
      size: 24,
    });
    P.add(
      s.add
        .image(W / 2 - avgT.width / 2 - 10, y, 'ui_glow')
        .setTint(0xd63cf0)
        .setDisplaySize(40, 40),
    );
    P.add(avgT);
    y += 56;

    // ── Colección ──
    const all = allCardKeys();
    const owned = all.filter((k) => Profile.has(k) && !deck.includes(k));
    const locked = all.filter((k) => !Profile.has(k));
    for (const o of sectionHeader(
      s,
      30,
      y + 6,
      W - 60,
      t('cards.collection'),
      t('cards.found', { n: all.length - locked.length, total: all.length }),
    ))
      P.add(o);
    y += 52;
    owned.forEach((k, i) => {
      const cx = G.x(i),
        cy = y + CH / 2 + G.row(i) * STEP_Y;
      const v = this.cardView(k, cx, cy);
      P.add(v);
      P.addTap(
        cx,
        cy,
        CW,
        CH,
        () => {
          Sfx.play('click');
          openCardPopup(s, k, {
            onChange: () => this.rebuild(),
            onUse: (key) => {
              this.swapKey = key;
              this.rebuild();
              this.panels[0].set(0);
              toast(s, t('cards.pickToSwap'), '#ffd84a', this.area.y + 200);
            },
          });
        },
        v,
      );
    });
    if (!owned.length) {
      P.add(kit.panel(s, 30, y, W - 60, 80, 'inset'));
      P.add(kit.text(s, W / 2, y + 40, t('cards.openForMore'), 'body', '#aab3e8', { size: 21 }));
      y += 110;
    } else {
      y += G.rows(owned.length) * STEP_Y;
    }

    if (locked.length) {
      for (const o of sectionHeader(s, 30, y + 10, W - 60, t('cards.undiscovered'))) P.add(o);
      y += 60;
      locked.forEach((k, i) => {
        const cx = G.x(i),
          cy = y + CH / 2 + G.row(i) * STEP_Y;
        const v = makeCardView(s, getCard(k), cx, cy, CW, CH, { locked: true });
        P.add(v);
        const reachable = getCard(k).arena <= Profile.arena;
        P.add(
          kit.text(s, cx, cy + CH / 2 + 24, arenaName(getCard(k).arena), 'label', reachable ? '#ffd75a' : '#5a64a8', {
            size: 16,
          }),
        );
        P.addTap(
          cx,
          cy,
          CW,
          CH,
          () => {
            Sfx.play('click');
            openCardPopup(s, k);
          },
          v,
        );
      });
      y += G.rows(locked.length) * STEP_Y;
    }
    P.setContentHeight(y + 40);
  }

  cardView(k: string, cx: number, cy: number): CardView {
    const owned = Profile.d.cards[k];
    return makeCardView(this.scene, getCard(k), cx, cy, CW, CH, {
      level: Profile.level(k),
      progress: { have: owned.count, need: Profile.cardsNeeded(k) },
    });
  }
}
