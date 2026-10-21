import type Phaser from 'phaser';
import { CLAN, type ClanRole } from '@arena/shared';
import * as kit from '../../kit';
import type { ScrollPanel } from '../../ScrollPanel';
import { openModal } from '../../Modal';
import type { BaseScene } from '../../../scenes/BaseScene';
import { t } from '../../../i18n';

/**
 * Botón dentro de un panel con scroll: el panel decide qué es un toque (y no un arrastre),
 * así que el botón no recibe clics él mismo. x, y = centro.
 */
export function panelButton(
  P: ScrollPanel,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  variant: kit.ButtonVariant,
  onTap: () => void,
  opts: kit.ButtonOpts & { disabled?: boolean } = {},
): kit.Button {
  const b = kit.button(P.content.scene, x, y, w, h, label, variant, () => {}, { size: opts.size ?? 20, ...opts });
  b.disableInteractive();
  if (opts.disabled) b.setAlpha(0.45);
  P.add(b);
  if (!opts.disabled) P.addTap(x, y, w, h + 6, onTap, b);
  return b;
}

/** Colores de los escudos de clan. */
const BADGE_COLORS = [
  0xe0454f, 0xf2a12b, 0xffc93c, 0x44d17a, 0x2fb8a8, 0x4aa8ff, 0x3b5bd9, 0x8a5cf0, 0xd63cf0, 0xff7ab8, 0x9aa0c8,
  0x2b2f4a,
];

/** Escudo del clan (número `i` de CLAN.badges): forma de blasón con un emblema según el número. */
export function clanBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  i: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const s = size / 64;
  const col = BADGE_COLORS[((i % CLAN.badges) + CLAN.badges) % CLAN.badges];
  const shield = (inset: number) => {
    const w = (26 - inset) * s,
      top = (-28 + inset) * s,
      mid = (6 - inset * 0.2) * s,
      bot = (30 - inset * 1.2) * s;
    return [
      { x: -w, y: top },
      { x: w, y: top },
      { x: w, y: mid },
      { x: 0, y: bot },
      { x: -w, y: mid },
    ];
  };
  g.fillStyle(kit.C.ink).fillPoints(shield(-3), true);
  g.fillStyle(col).fillPoints(shield(0), true);
  g.fillStyle(0xffffff, 0.22).fillRect(-23 * s, -25 * s, 46 * s, 10 * s);
  // emblema: estrella, corona o círculo según el número
  g.fillStyle(0xffffff, 0.92);
  const kind = Math.floor(i / 4) % 3;
  if (kind === 0) {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const r = (k % 2 ? 6 : 14) * s,
        a = -Math.PI / 2 + (k * Math.PI) / 5;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r + 2 * s });
    }
    g.fillPoints(pts, true);
  } else if (kind === 1) {
    g.fillPoints(
      [
        { x: -13 * s, y: 10 * s },
        { x: -13 * s, y: -8 * s },
        { x: -6 * s, y: 0 },
        { x: 0, y: -12 * s },
        { x: 6 * s, y: 0 },
        { x: 13 * s, y: -8 * s },
        { x: 13 * s, y: 10 * s },
      ],
      true,
    );
  } else {
    g.fillCircle(0, 2 * s, 12 * s);
    g.fillStyle(col).fillCircle(0, 2 * s, 6 * s);
  }
  return g;
}

export const roleLabel = (r: ClanRole): string => t(`clan.role.${r}`);

/** Punto verde (conectado) o gris. */
export function onlineDot(scene: Phaser.Scene, x: number, y: number, online: boolean): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(kit.C.ink).fillCircle(0, 0, 9);
  g.fillStyle(online ? kit.C.good : 0x5a64a8).fillCircle(0, 0, 7);
  return g;
}

/** Ventana de confirmar / cancelar. */
export function confirm(scene: BaseScene, title: string, body: string, okLabel: string, onOk: () => void): void {
  openModal(scene, 560, 330, title, (box, close) => {
    box.add(kit.text(scene, 0, -50, body, 'body', '#dfe4ff', { size: 22, wordWrap: { width: 480 } }));
    box.add(kit.button(scene, -120, 90, 200, 70, t('common.cancel'), 'neutral', close, { size: 22 }));
    box.add(
      kit.button(
        scene,
        120,
        90,
        200,
        70,
        okLabel,
        'danger',
        () => {
          close();
          onOk();
        },
        { size: 22 },
      ),
    );
  });
}

/** Hora corta de un mensaje (HH:MM, o la fecha si no es de hoy). */
export function msgTime(at: number): string {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
