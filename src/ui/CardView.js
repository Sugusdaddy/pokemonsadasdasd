import { COLORS, RARITIES } from '../config.js';
import { animKey, animInfo, palette } from '../systems/Assets.js';
import { txt } from './style.js';

/**
 * Dibuja una carta.
 * opts: { level, progress: {have, need}, locked, isNew, compact }
 */
export function makeCardView(scene, card, x, y, w = 132, h = 158, opts = {}) {
  const c = scene.add.container(x, y);
  const pal = palette(card.types[0]);
  const rar = RARITIES[card.rarity] || RARITIES.common;
  const g = scene.add.graphics();
  const locked = !!opts.locked;
  g.fillStyle(COLORS.panelDark).fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 9, 14);
  // marco de rareza
  g.fillStyle(locked ? 0x3b3f63 : rar.color).fillRoundedRect(-w / 2, -h / 2, w, h, 13);
  if (card.rarity === 'legendary' && !locked) {
    g.fillStyle(0xff8af0, 0.6).fillRoundedRect(-w / 2, -h / 2, w / 2, h, { tl: 13, bl: 13, tr: 0, br: 0 });
    g.fillStyle(0xffd84a, 0.5).fillRoundedRect(0, -h / 2, w / 2, h, { tr: 13, br: 13, tl: 0, bl: 0 });
  }
  const b = Math.max(4, Math.round(w * 0.045));
  g.fillStyle(locked ? 0x262a48 : pal[1]).fillRoundedRect(-w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b, 9);
  if (!locked) {
    g.fillStyle(pal[2], 0.6).fillRoundedRect(-w / 2 + b + 3, -h / 2 + b + 3, w - 2 * b - 6, h * 0.6, 7);
    g.fillStyle(pal[3], 0.25).fillCircle(0, -h / 2 + h * 0.4, w * 0.32);
    g.fillStyle(0xffffff, 0.2).fillRoundedRect(-w / 2 + b + 3, -h / 2 + b + 3, w - 2 * b - 6, Math.max(6, h * 0.06), 5);
  }
  // franja inferior para el nombre
  g.fillStyle(COLORS.panelDark, 0.55).fillRect(-w / 2 + b, h / 2 - b - h * 0.24, w - 2 * b, h * 0.24);
  c.add(g);

  const a = animInfo(card.pokemon, 'Idle');
  const scale = Math.min(h > 220 ? 4 : 2.5, Math.max(1, Math.floor(((h * 0.52) / (a.frame_height * 0.7)) * 2) / 2));
  const sp = scene.add.sprite(0, -h / 2 + h * 0.66, `pk_${card.pokemon}_Idle`).setScale(scale);
  sp.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
  if (locked) sp.setTintFill(0x14122b).setAlpha(0.8);
  else sp.play(animKey(card.pokemon, 'Idle', 0));
  c.add(sp);
  c.portrait = sp;

  const fs = Math.round(h * 0.11);
  if (card.count > 1 && !locked) c.add(txt(scene, w / 2 - fs * 1.1, -h / 2 + h * 0.4, `x${card.count}`, fs));
  if (!locked && scene.textures.exists(`type_${card.moveType}`)) {
    c.add(scene.add.image(w / 2 - fs * 1.2, -h / 2 + fs * 1.3, `type_${card.moveType}`).setScale(Math.max(1, Math.round(h / 80))));
  }
  // coste
  const r = Math.max(11, h * 0.12);
  const cost = scene.add.graphics();
  const cx = -w / 2 + r + 1, cy = -h / 2 + r + 1;
  cost.fillStyle(COLORS.panelDark).fillCircle(cx, cy + 2, r + 3);
  cost.fillStyle(COLORS.elixir).fillCircle(cx, cy, r);
  cost.fillStyle(0xffffff, 0.35).fillCircle(cx - r * 0.3, cy - r * 0.35, r * 0.38);
  c.add(cost);
  c.add(txt(scene, cx, cy, String(card.cost), Math.round(r * 1.35)));

  const nameY = h / 2 - b - h * 0.12;
  if (locked) {
    c.add(txt(scene, 0, nameY, '???', fs, '#9aa0c8'));
  } else if (opts.level != null && !opts.compact) {
    c.add(txt(scene, 0, nameY - fs * 0.45, card.name, Math.round(fs * 0.85), card.type === 'spell' ? '#ffe38a' : '#ffffff'));
    c.add(txt(scene, 0, nameY + fs * 0.55, `Nivel ${opts.level}`, Math.round(fs * 0.8), rar.css));
  } else {
    c.add(txt(scene, 0, nameY, card.name, fs, card.type === 'spell' ? '#ffe38a' : '#ffffff'));
    if (opts.level != null) c.add(txt(scene, w / 2 - 8, -h / 2 + h * 0.66, `Nv.${opts.level}`, Math.round(fs * 0.8), rar.css, { originX: 1 }));
  }

  if (opts.progress && !locked) {
    const { have, need } = opts.progress;
    const bw = w - 10, bh = Math.max(14, h * 0.1), by = h / 2 + 8;
    const pg = scene.add.graphics();
    const ready = have >= need;
    pg.fillStyle(COLORS.panelDark).fillRoundedRect(-bw / 2 - 2, by - 2, bw + 4, bh + 4, 6);
    pg.fillStyle(0x3a3f6b).fillRoundedRect(-bw / 2, by, bw, bh, 5);
    const f = need === Infinity ? 1 : Math.min(1, have / need);
    if (f > 0) pg.fillStyle(ready ? COLORS.green : 0x3a7cff).fillRoundedRect(-bw / 2, by, Math.max(10, bw * f), bh, 5);
    c.add(pg);
    c.add(txt(scene, 0, by + bh / 2, need === Infinity ? 'MÁX' : `${have}/${need}`, Math.round(bh * 0.85)));
    if (ready && need !== Infinity) {
      const arrow = txt(scene, bw / 2 - 2, by - 4, '▲', Math.round(bh * 1.1), '#7dff8a');
      c.add(arrow);
      scene.tweens.add({ targets: arrow, y: by - 10, yoyo: true, repeat: -1, duration: 400 });
    }
  }
  if (opts.isNew) {
    const ng = scene.add.graphics();
    ng.fillStyle(COLORS.red).fillRoundedRect(-w / 2 - 6, -h / 2 - 12, 74, 26, 8);
    c.add(ng);
    c.add(txt(scene, -w / 2 + 31, -h / 2 + 1, '¡NUEVA!', 16));
  }

  const dim = scene.add.graphics();
  dim.fillStyle(0x0d1024, 0.6).fillRoundedRect(-w / 2, -h / 2, w, h, 13);
  dim.setVisible(false);
  c.add(dim);
  c.dim = dim;
  c.cardW = w;
  c.cardH = h;
  return c;
}
