import { W, COLORS, BALLS } from '../../config.js';
import { getCard, cardsUpToArena } from '../../data/cards.js';
import { Profile } from '../../meta/Profile.js';
import { rollBall } from '../../meta/Balls.js';
import { Sfx } from '../../systems/Sfx.js';
import { makeCardView } from '../CardView.js';
import { txt, panel, fmtTime, fmtNum } from '../style.js';
import { toast, openModal } from '../Modal.js';
import { Tab } from './Tab.js';
import { button } from '../style.js';

// Precios de la tienda (en el juego no hay dinero real: todo se gana jugando)
const CARD_OFFERS = { common: { count: 20, price: 200 }, rare: { count: 5, price: 500 }, epic: { count: 1, price: 1000 }, legendary: { count: 1, price: 20000 } };
const BALL_OFFERS = [{ type: 'super', gems: 120 }, { type: 'ultra', gems: 350 }, { type: 'master', gems: 900 }];
const GOLD_OFFERS = [{ gold: 1000, gems: 60 }, { gold: 10000, gems: 500 }];
const DAILY_GIFT = 100;

function seeded(seed) {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyOffers() {
  const day = new Date().toDateString();
  const rnd = seeded(day + Profile.arena);
  const pool = cardsUpToArena(Profile.arena);
  const byR = (r) => pool.filter((k) => getCard(k).rarity === r);
  const wants = ['common', 'common', 'common', 'rare', 'rare', rnd() < 0.12 ? 'legendary' : 'epic'];
  const used = new Set();
  return wants.map((r, i) => {
    let list = byR(r).filter((k) => !used.has(k));
    if (!list.length) { r = 'common'; list = byR('common').filter((k) => !used.has(k)); }
    if (!list.length) list = pool;
    const key = list[Math.floor(rnd() * list.length)];
    used.add(key);
    return { id: `${day}-${i}`, key, rarity: r, ...CARD_OFFERS[r] };
  });
}

export class ShopTab extends Tab {
  build() {
    const s = this.scene;
    const shop = Profile.d.shop;
    const day = new Date().toDateString();
    if (shop.day !== day) { shop.day = day; shop.bought = []; shop.freeClaimed = false; Profile.save(); }
    const P = this.scroll();
    let y = 16;

    // ── Regalo diario ──
    P.add(panel(s, 20, y, W - 40, 120, shop.freeClaimed ? 0x2a3170 : 0x2f7a43, 20));
    P.add(s.add.image(80, y + 60, 'ic_gold').setDisplaySize(70, 70));
    P.add(txt(s, 130, y + 42, 'Regalo diario', 30, '#ffffff', { originX: 0 }));
    P.add(txt(s, 130, y + 82, shop.freeClaimed ? 'Vuelve mañana' : `${DAILY_GIFT} de oro gratis`, 22, shop.freeClaimed ? '#9aa0c8' : '#7dff8a', { originX: 0 }));
    if (!shop.freeClaimed) {
      this.pill(P, 590, y + 60, 'GRATIS', COLORS.green);
      P.addTap(360, y + 60, W - 40, 120, () => {
        shop.freeClaimed = true; Profile.d.gold += DAILY_GIFT; Profile.save();
        Sfx.play('coin'); toast(s, `+${DAILY_GIFT} de oro`, '#ffd84a'); this.rebuild();
      });
    }
    y += 150;

    // ── Ofertas del día ──
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    P.add(txt(s, 30, y + 20, 'Ofertas del día', 32, '#ffffff', { originX: 0 }));
    this.refreshT = txt(s, W - 30, y + 22, `Nuevas en ${fmtTime((midnight - Date.now()) / 1000)}`, 20, '#c9c3ff', { originX: 1 });
    P.add(this.refreshT);
    y += 50;
    dailyOffers().forEach((o, i) => {
      const cx = 130 + (i % 3) * 230, cy = y + 120 + Math.floor(i / 3) * 300;
      const bought = shop.bought.includes(o.id);
      P.add(panel(s, cx - 105, cy - 115, 210, 280, 0x2a3170, 18));
      const v = makeCardView(s, getCard(o.key), cx, cy - 10, 140, 168, { locked: false });
      P.add(v);
      P.add(txt(s, cx, cy + 92, `x${o.count}`, 24, '#ffffff'));
      if (bought) {
        v.dim.setVisible(true);
        P.add(txt(s, cx, cy + 135, 'Comprado', 22, '#9aa0c8'));
      } else {
        this.pill(P, cx, cy + 135, fmtNum(o.price), Profile.d.gold >= o.price ? COLORS.green : 0x5a5f8a, 'ic_gold', 170);
        P.addTap(cx, cy + 20, 210, 280, () => this.buyCard(o));
      }
    });
    y += 620;

    // ── Pokéballs ──
    P.add(txt(s, 30, y, 'Pokéballs', 32, '#ffffff', { originX: 0 }));
    y += 30;
    BALL_OFFERS.forEach((o, i) => {
      const cx = 130 + i * 230, cy = y + 130;
      P.add(panel(s, cx - 105, cy - 115, 210, 250, 0x2a3170, 18));
      const img = s.add.image(cx, cy - 30, `ball_${o.type}`).setDisplaySize(120, 120);
      P.add(img);
      P.add(txt(s, cx, cy + 50, BALLS[o.type].label, 22));
      this.pill(P, cx, cy + 100, String(o.gems), Profile.d.gems >= o.gems ? COLORS.green : 0x5a5f8a, 'ic_gem', 160);
      P.addTap(cx, cy, 210, 250, () => this.buyBall(o));
    });
    y += 290;

    // ── Oro ──
    P.add(txt(s, 30, y, 'Oro', 32, '#ffffff', { originX: 0 }));
    y += 30;
    GOLD_OFFERS.forEach((o, i) => {
      const cx = 190 + i * 340, cy = y + 90;
      P.add(panel(s, cx - 155, cy - 75, 310, 170, 0x2a3170, 18));
      P.add(s.add.image(cx - 80, cy - 10, 'ic_gold').setDisplaySize(80, 80));
      P.add(txt(s, cx + 40, cy - 10, fmtNum(o.gold), 34, '#ffd84a'));
      this.pill(P, cx, cy + 55, String(o.gems), Profile.d.gems >= o.gems ? COLORS.green : 0x5a5f8a, 'ic_gem', 160);
      P.addTap(cx, cy, 310, 170, () => {
        if (Profile.d.gems < o.gems) { Sfx.play('noElixir'); toast(s, 'Te faltan gemas', '#ff9a9a'); return; }
        Profile.d.gems -= o.gems; Profile.d.gold += o.gold; Profile.save();
        Sfx.play('coin'); toast(s, `+${fmtNum(o.gold)} de oro`, '#ffd84a'); this.rebuild();
      });
    });
    y += 210;
    P.add(txt(s, W / 2, y, 'Sin compras con dinero real: el oro y las gemas\nse consiguen jugando, en Pokéballs y en el Camino de trofeos.', 18, '#9aa0c8'));
    P.setContentHeight(y + 80);
  }

  pill(P, cx, cy, label, color, icon = null, w = 150) {
    const s = this.scene;
    const g = s.add.graphics();
    g.fillStyle(COLORS.panelDark).fillRoundedRect(cx - w / 2 - 3, cy - 25, w + 6, 56, 14);
    g.fillStyle(color).fillRoundedRect(cx - w / 2, cy - 22, w, 46, 12);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(cx - w / 2 + 5, cy - 19, w - 10, 14, 7);
    P.add(g);
    if (icon) P.add(s.add.image(cx - w / 2 + 28, cy, icon).setDisplaySize(34, 34));
    P.add(txt(s, cx + (icon ? 16 : 0), cy, label, 24));
  }

  buyCard(o) {
    const s = this.scene;
    const c = getCard(o.key);
    openModal(s, 560, 600, 'Comprar', (box, close) => {
      box.add(makeCardView(s, c, 0, -110, 170, 204, {}));
      box.add(txt(s, 0, 30, `${c.name} x${o.count}`, 30));
      box.add(button(s, 0, 160, 320, 92, fmtNum(o.price), COLORS.green, () => {
        if (Profile.d.gold < o.price) { toast(s, 'Te falta oro', '#ff9a9a'); return; }
        Profile.d.gold -= o.price;
        const isNew = Profile.addCards(o.key, o.count);
        Profile.d.shop.bought.push(o.id);
        Profile.save();
        Sfx.play(isNew ? 'rare' : 'coin');
        toast(s, isNew ? `¡Nueva carta: ${c.name}!` : `+${o.count} ${c.name}`, '#7dff8a');
        close();
        this.rebuild();
      }, 32, { icon: 'ic_gold' }));
    });
  }

  buyBall(o) {
    const s = this.scene;
    if (Profile.d.gems < o.gems) { Sfx.play('noElixir'); toast(s, 'Te faltan gemas', '#ff9a9a'); return; }
    openModal(s, 560, 560, BALLS[o.type].label, (box, close) => {
      box.add(s.add.image(0, -90, `ball_${o.type}`).setDisplaySize(170, 170));
      const cfg = BALLS[o.type];
      box.add(txt(s, 0, 40, `~${Math.round(cfg.cards * (1 + Profile.arena * 0.2))} cartas · ${cfg.gold[0]}-${cfg.gold[1]} de oro`, 22, '#c9c3ff'));
      box.add(button(s, 0, 160, 320, 92, String(o.gems), COLORS.green, () => {
        if (Profile.d.gems < o.gems) return;
        Profile.d.gems -= o.gems;
        const reward = Profile.openBall(o.type, Profile.arena);
        close();
        s.openBallScene(reward, 'shop');
      }, 32, { icon: 'ic_gem' }));
    });
  }

  tick() {
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    this.refreshT?.setText(`Nuevas en ${fmtTime((midnight - Date.now()) / 1000)}`);
  }
}

export { rollBall };
