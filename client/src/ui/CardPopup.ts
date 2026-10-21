import { T, MAX_LEVEL, getCard, cardAtLevel, type Card } from '@arena/shared';
import { Profile } from '../meta/Profile';
import type { BaseScene } from '../scenes/BaseScene';
import { Sfx } from '../systems/Sfx';
import { makeCardView, RARITY_COLOR, RARITY_CSS } from './CardView';
import * as kit from './kit';
import { t, cardName, cardDesc, arenaName, rarityLabel } from '../i18n';
import { openModal, toast } from './Modal';

/** Nombre traducido de un tipo elemental. */
export const typeName = (type: string): string => t(`type.${type}`);

type StatRow = [string, string | number, string];

function statRows(c: Card, next: Card | null): StatRow[] {
  const plus = (a: number, b: number | undefined) => (next && b != null && b > a ? `+${Math.round(b - a)}` : '');
  const tiles = (n: number) => t('stat.tiles', { n: (n / T).toFixed(1) });
  if (c.type === 'spell') {
    return [
      [t('stat.damage'), c.dmg, plus(c.dmg, next?.dmg)],
      [
        t('stat.towerDamage'),
        Math.round(c.dmg * c.towerDmg),
        plus(c.dmg * c.towerDmg, next ? next.dmg * next.towerDmg : 0),
      ],
      [t('stat.radius'), tiles(c.radiusSpell), ''],
      [t('stat.type'), typeName(c.moveType), ''],
    ];
  }
  return [
    [t('stat.hp'), c.hp, plus(c.hp, next?.hp)],
    [t('stat.damage'), c.dmg, plus(c.dmg, next?.dmg)],
    [t('stat.dps'), Math.round(c.dmg / c.hitSpeed), plus(c.dmg / c.hitSpeed, next ? next.dmg / next.hitSpeed : 0)],
    [t('stat.hitSpeed'), t('stat.seconds', { n: c.hitSpeed }), ''],
    [t('stat.range'), c.range <= 1.2 * T ? t('stat.melee') : tiles(c.range), ''],
    [t('stat.speed'), t(`speed.${c.speedName}`), ''],
    [t('stat.targets'), t(`target.${c.targets}`), ''],
    [t('stat.attackType'), `${typeName(c.moveType)}${c.splash ? ` · ${t('stat.area')}` : ''}`, ''],
    ...(c.count > 1 ? [[t('stat.count'), `x${c.count}`, ''] as StatRow] : []),
    ...(c.flying ? [[t('stat.flies'), t('common.yes'), ''] as StatRow] : []),
  ];
}

/** Ventana de detalle de una carta: estadísticas, mejorar y usar en el mazo. */
export function openCardPopup(
  scene: BaseScene,
  key: string,
  { onUse, onChange }: { onUse?: (key: string) => void; onChange?: () => void } = {},
): void {
  const base = getCard(key);
  const owned = Profile.has(key);
  const level0 = Profile.level(key);
  const nStats = statRows(cardAtLevel(key, level0), null).length;
  // alto: zona de la carta (350) + estadísticas + acciones
  const H = 350 + Math.ceil(nStats / 2) * 78 + 150;
  const top = -H / 2;
  openModal(scene, 680, H, owned ? cardName(base) : '???', (box, close) => {
    const level = Profile.level(key);
    const c = cardAtLevel(key, level);
    const canNext = owned && level < MAX_LEVEL;
    const next = canNext ? cardAtLevel(key, level + 1) : null;
    const need = owned ? Profile.cardsNeeded(key) : 0;
    const have = owned ? Profile.d.cards[key].count : 0;

    // ── Carta y descripción ──
    box.add(
      makeCardView(scene, base, -175, top + 170, 210, 252, {
        level: owned ? level : null,
        locked: !owned,
        progress: owned ? { have, need } : null,
      }),
    );
    const rx = -40;
    // chip de rareza
    const rt = kit.text(scene, 0, 0, rarityLabel(base.rarity), 'label', '#ffffff', { size: 22 });
    const chip = scene.add.graphics();
    const cw = rt.width + 28;
    chip.fillStyle(kit.C.ink).fillRoundedRect(rx - 2, top + 44, cw + 4, 40, 20);
    chip.fillStyle(RARITY_COLOR[base.rarity]).fillRoundedRect(rx, top + 46, cw, 36, 18);
    chip.fillStyle(0xffffff, 0.3).fillRoundedRect(rx + 6, top + 49, cw - 12, 12, 6);
    rt.setPosition(rx + cw / 2, top + 64)
      .setColor('#0b0d1f')
      .setStroke('#000000', 0)
      .setShadow(0, 0, '#000', 0);
    box.add([chip, rt]);
    const types = base.types.map(typeName).join(' / ');
    box.add(kit.text(scene, rx + cw + 16, top + 64, types, 'label', '#aab3e8', { originX: 0, size: 20 }));
    box.add(
      kit.text(scene, rx, top + 112, cardDesc(base), 'body', '#ffffff', {
        originX: 0,
        originY: 0,
        size: 21,
        wordWrap: { width: 330 },
        align: 'left',
        lineSpacing: 4,
      }),
    );
    if (!owned) {
      box.add(
        kit.text(scene, rx, top + 270, t('popup.foundIn', { arena: arenaName(base.arena) }), 'label', '#ffd75a', {
          originX: 0,
          size: 21,
          wordWrap: { width: 330 },
          align: 'left',
        }),
      );
    } else {
      box.add(
        kit.text(scene, rx, top + 270, t('card.level', { n: level }), 'h3', RARITY_CSS[base.rarity], {
          originX: 0,
          size: 28,
        }),
      );
    }

    // ── Estadísticas en rejilla de 2 columnas ──
    const rows = statRows(c, Profile.canUpgrade(key) ? next : null);
    const tw = 300,
      th = 68,
      gx = 10,
      gy = 10;
    const y0 = top + 350;
    rows.forEach(([label, value, extra], i) => {
      const x = i % 2 ? gx / 2 : -gx / 2 - tw,
        y = y0 + Math.floor(i / 2) * (th + gy);
      box.add(kit.panel(scene, x, y, tw, th - 8, 'inset'));
      box.add(kit.text(scene, x + 16, y + 18, label, 'small', '#aab3e8', { originX: 0, size: 16 }));
      box.add(kit.text(scene, x + 16, y + 42, String(value), 'label', '#ffffff', { originX: 0, size: 24 }));
      if (extra) box.add(kit.text(scene, x + tw - 14, y + 42, extra, 'label', '#7dff9a', { originX: 1, size: 22 }));
    });

    // ── Acciones ──
    const by = H / 2 - 76;
    if (owned && level < MAX_LEVEL) {
      const gold = Profile.goldNeeded(key);
      const can = Profile.canUpgrade(key);
      box.add(
        kit.button(
          scene,
          onUse ? -160 : 0,
          by,
          290,
          96,
          can ? t('popup.upgrade', { n: gold }) : t('popup.missing', { n: need - have }),
          can ? 'success' : 'dark',
          () => {
            const r = Profile.upgrade(key);
            if (r.ok) {
              Sfx.play('upgrade');
              toast(scene, t('popup.upgraded', { name: cardName(base), n: r.level }), '#7dff8a');
              if (r.kingLevelUp) toast(scene, t('result.kingLevel', { n: Profile.d.kingLevel }), '#ffd84a', 500);
              close();
              onChange?.();
            } else {
              toast(scene, r.reason === 'gold' ? t('common.noGold') : t('popup.noCards'), '#ff9a9a');
            }
          },
          { size: 26, icon: can ? 'ic_gold' : undefined },
        ),
      );
    } else if (owned) {
      box.add(kit.text(scene, onUse ? -160 : 0, by, t('popup.maxLevel'), 'h3', '#ffd75a', { size: 28 }));
    }
    if (onUse && owned) {
      box.add(
        kit.button(
          scene,
          160,
          by,
          270,
          96,
          t('popup.use'),
          'info',
          () => {
            close();
            onUse(key);
          },
          { size: 32 },
        ),
      );
    }
  });
}
