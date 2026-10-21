import Phaser from 'phaser';
import { BALLS, BALL_OFFERS, GOLD_OFFERS, DAILY_GIFT, getCard, type BallType, type CardOffer } from '@arena/shared';
import { Profile } from '../../meta/Profile';
import { Sfx } from '../../systems/Sfx';
import { makeCardView } from '../CardView';
import { fmtTime, fmtNum } from '../style';
import * as kit from '../kit';
import { t, cardName, ballLabel } from '../../i18n';
import { toast, openModal } from '../Modal';
import { Tab, sectionHeader, runAction } from './Tab';
import { L } from '../../layout';

// Precios de la tienda: los define @arena/shared y los cobra el servidor (no hay dinero real).
export class ShopTab extends Tab {
  declare refreshT: Phaser.GameObjects.Text | undefined;

  override build(): void {
    const s = this.scene;
    // el servidor renueva la tienda cada día (UTC) y manda las ofertas con la cuenta
    const shop = Profile.d.shop;
    const P = this.scroll();
    const W = P.w;
    let y = 16;

    // ── Regalo diario ──
    const gift = s.add.container(W / 2, y + 60);
    gift.add(kit.panel(s, -W / 2 + 20, -60, W - 40, 120, shop.freeClaimed ? 'dark' : 'green'));
    const gl = s.add
      .image(-W / 2 + 84, -2, 'ui_glow')
      .setTint(0xffd75a)
      .setAlpha(shop.freeClaimed ? 0 : 0.5);
    gl.setDisplaySize(150, 150).setBlendMode(Phaser.BlendModes.ADD);
    gift.add(gl);
    gift.add(s.add.image(-W / 2 + 84, -2, 'ic_gold').setDisplaySize(74, 74));
    gift.add(kit.text(s, -W / 2 + 140, -20, t('shop.daily'), 'h2', '#ffffff', { originX: 0, size: 30 }));
    gift.add(
      kit.text(
        s,
        -W / 2 + 140,
        20,
        shop.freeClaimed ? t('shop.comeBack') : t('shop.freeGold', { n: DAILY_GIFT }),
        'label',
        shop.freeClaimed ? '#7480c0' : '#c9ffd9',
        { originX: 0, size: 21 },
      ),
    );
    P.add(gift);
    if (!shop.freeClaimed) {
      gift.add(this.priceButton(W / 2 - 120, -4, t('shop.free'), 'primary', null, 170));
      P.addTap(
        W / 2,
        y + 60,
        W - 40,
        120,
        () => {
          void runAction(
            s,
            'shop:gift',
            () => Profile.claimShopGift(),
            (n) => {
              Sfx.play('coin');
              toast(s, t('common.plusGold', { n }), '#ffd84a');
              this.rebuild();
            },
          );
        },
        gift,
      );
    }
    y += 160;

    // ── Ofertas del día ──
    for (const o of sectionHeader(s, 30, y + 10, W - 60, t('shop.offers'))) P.add(o);
    this.refreshT = kit.text(
      s,
      W - 30,
      y + 14,
      t('shop.newIn', { time: fmtTime(Profile.msToShopReset() / 1000) }),
      'body',
      '#aab3e8',
      { originX: 1, size: 19 },
    );
    P.add(this.refreshT);
    y += 50;
    // ofertas: 3 por fila en móvil; en PC, las que quepan
    const offers = Profile.shop.offers;
    const cols = L.pc ? Math.max(3, Math.floor((W - 20) / 230)) : 3;
    const ox = Math.round((W - cols * 230) / 2) + 115;
    offers.forEach((o, i) => {
      const cx = ox + (i % cols) * 230,
        cy = y + 130 + Math.floor(i / cols) * 300;
      // las compras se guardan por id de oferta (día + índice)
      const bought = shop.bought.includes(o.id);
      const c = s.add.container(cx, cy);
      c.add(kit.panel(s, -105, -120, 210, 280, 'card'));
      const v = makeCardView(s, getCard(o.key), 0, -14, 140, 168, { locked: false });
      c.add(v);
      c.add(kit.text(s, 0, 92, `x${o.count}`, 'h3', '#ffffff', { size: 26 }));
      if (bought) {
        v.dim.setVisible(true);
        c.add(kit.text(s, 0, 132, t('shop.bought'), 'label', '#7480c0', { size: 22 }));
      } else {
        c.add(
          this.priceButton(0, 128, fmtNum(o.price), Profile.d.gold >= o.price ? 'success' : 'dark', 'ic_gold', 170),
        );
        P.addTap(cx, cy + 20, 210, 280, () => this.buyCard(o), c);
      }
      P.add(c);
    });
    y += Math.ceil(offers.length / cols) * 300 + 30;

    // ── Pokéballs y oro: uno debajo del otro en móvil, lado a lado en PC ──
    const side = L.pc && W >= 1440;
    const bx = side ? Math.round((W - 1440) / 2) : 0;
    const gx = side ? bx + 720 : 0;
    const top = y;
    for (const o of sectionHeader(s, bx + 30, y, 660, t('shop.balls'))) P.add(o);
    y += 40;
    BALL_OFFERS.forEach((o, i) => {
      const cx = bx + 130 + i * 230,
        cy = y + 130;
      const c = s.add.container(cx, cy);
      c.add(kit.panel(s, -105, -115, 210, 250, 'card'));
      const glow = s.add.image(0, -30, 'ui_glow').setTint(BALLS[o.type].colors[0]).setAlpha(0.45);
      glow.setDisplaySize(180, 180).setBlendMode(Phaser.BlendModes.ADD);
      c.add(glow);
      c.add(s.add.image(0, -30, `ball_${o.type}`).setDisplaySize(120, 120));
      c.add(kit.text(s, 0, 48, ballLabel(o.type), 'label', '#ffffff', { size: 22 }));
      c.add(this.priceButton(0, 96, String(o.gems), Profile.d.gems >= o.gems ? 'success' : 'dark', 'ic_gem', 160));
      P.add(c);
      P.addTap(cx, cy, 210, 250, () => this.buyBall(o), c);
    });
    y += 290;

    // ── Oro ──
    if (side) y = top;
    for (const o of sectionHeader(s, gx + 30, y, 660, t('shop.gold'))) P.add(o);
    y += 40;
    GOLD_OFFERS.forEach((o, i) => {
      const cx = gx + 190 + i * 340,
        cy = y + 96;
      const c = s.add.container(cx, cy);
      c.add(kit.panel(s, -155, -78, 310, 176, 'card'));
      c.add(s.add.image(-84, -16, 'ic_gold').setDisplaySize(84, 84));
      c.add(kit.text(s, 40, -16, fmtNum(o.gold), 'h1', '#ffd75a', { size: 40 }));
      c.add(this.priceButton(0, 50, String(o.gems), Profile.d.gems >= o.gems ? 'success' : 'dark', 'ic_gem', 160));
      P.add(c);
      P.addTap(
        cx,
        cy,
        310,
        176,
        () => {
          if (Profile.d.gems < o.gems) {
            Sfx.play('noElixir');
            toast(s, t('common.noGems'), '#ff9a9a');
            return;
          }
          void runAction(
            s,
            'shop:gold',
            () => Profile.buyGold(i),
            (gold) => {
              Sfx.play('coin');
              toast(s, t('common.plusGold', { n: fmtNum(gold) }), '#ffd84a');
              this.rebuild();
            },
          );
        },
        c,
      );
    });
    y = side ? top + 330 : y + 220;
    P.add(
      kit.text(s, W / 2, y, t('shop.note'), 'body', '#7480c0', {
        size: 18,
        wordWrap: { width: Math.min(W - 60, 760) },
      }),
    );
    P.setContentHeight(y + 90);
  }

  /** Botón de precio dibujado (la pulsación la gestiona el panel con scroll). */
  priceButton(
    x: number,
    y: number,
    label: string,
    variant: kit.ButtonVariant,
    icon: string | null,
    w = 150,
  ): kit.Button {
    const b = kit.button(this.scene, x, y, w, 52, label, variant, () => {}, { size: 24, icon: icon ?? undefined });
    b.disableInteractive();
    return b;
  }

  buyCard(o: CardOffer): void {
    const s = this.scene;
    const c = getCard(o.key);
    openModal(s, 560, 600, t('shop.buy'), (box, close) => {
      box.add(makeCardView(s, c, 0, -110, 170, 204, {}));
      box.add(kit.text(s, 0, 36, `${cardName(c)} x${o.count}`, 'h2', '#ffffff', { size: 32 }));
      box.add(
        kit.button(
          s,
          0,
          160,
          320,
          92,
          fmtNum(o.price),
          'success',
          () => {
            if (Profile.d.gold < o.price) {
              toast(s, t('common.noGold'), '#ff9a9a');
              return;
            }
            void runAction(
              s,
              `shop:${o.id}`,
              () => Profile.buyCardOffer(o.id),
              (r) => {
                Sfx.play(r.isNew ? 'rare' : 'coin');
                toast(s, r.isNew ? t('shop.newCard', { name: cardName(c) }) : `+${r.count} ${cardName(c)}`, '#7dff8a');
                close();
                this.rebuild();
              },
            );
          },
          { size: 32, icon: 'ic_gold' },
        ),
      );
    });
  }

  buyBall(o: { type: BallType; gems: number }): void {
    const s = this.scene;
    if (Profile.d.gems < o.gems) {
      Sfx.play('noElixir');
      toast(s, t('common.noGems'), '#ff9a9a');
      return;
    }
    openModal(s, 560, 560, ballLabel(o.type), (box, close) => {
      const cfg = BALLS[o.type];
      const glow = s.add.image(0, -90, 'ui_glow').setTint(cfg.colors[0]).setAlpha(0.5);
      glow.setDisplaySize(300, 300).setBlendMode(Phaser.BlendModes.ADD);
      box.add(glow);
      box.add(s.add.image(0, -90, `ball_${o.type}`).setDisplaySize(170, 170));
      box.add(
        kit.text(
          s,
          0,
          50,
          t('shop.ballContents', {
            cards: Math.round(cfg.cards * (1 + Profile.arena * 0.2)),
            min: cfg.gold[0],
            max: cfg.gold[1],
          }),
          'body',
          '#aab3e8',
          { size: 22 },
        ),
      );
      box.add(
        kit.button(
          s,
          0,
          160,
          320,
          92,
          String(o.gems),
          'success',
          () => {
            void runAction(
              s,
              `shop:${o.type}`,
              () => Profile.buyBall(o.type),
              (reward) => {
                close();
                s.openBallScene(reward, 'shop');
              },
            );
          },
          { size: 32, icon: 'ic_gem' },
        ),
      );
    });
  }

  override tick(): void {
    this.refreshT?.setText(t('shop.newIn', { time: fmtTime(Profile.msToShopReset() / 1000) }));
  }
}
