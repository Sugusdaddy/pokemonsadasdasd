import Phaser from 'phaser';
import { Sfx } from '../../systems/Sfx';
import { BTN, PNL, btnKey, pnlKey, createKitTextures, type ButtonState } from './textures';
import { BUTTONS, C, DUR, PANELS, TYPE, css, type ButtonVariant, type PanelVariant, type TypeStyle } from './theme';

export * from './theme';
export { createKitTextures } from './textures';

type Scene = Phaser.Scene;

/** Las texturas se crean en el arranque; si una escena llega antes, se crean aquí. */
function ensure(scene: Scene): void {
  if (!scene.textures.exists('ui_pnl_card')) createKitTextures(scene);
}

// ───────────────────────── Texto ─────────────────────────

export interface TextOpts extends Phaser.Types.GameObjects.Text.TextStyle {
  originX?: number;
  originY?: number;
  /** Tamaño en px (si no, el del estilo). */
  size?: number;
  dropShadow?: boolean;
}

let textBoost = 1;
/** Accesibilidad: los textos de lectura (body, small) más grandes. */
export function setTextBoost(k: number): void {
  textBoost = k;
}

/** Texto con la escala tipográfica del juego: títulos con contorno y sombra, cuerpo limpio. */
export function text(
  scene: Scene,
  x: number,
  y: number,
  str: string,
  style: TypeStyle = 'body',
  color = '#ffffff',
  opts: TextOpts = {},
): Phaser.GameObjects.Text {
  const t = TYPE[style];
  const { originX, originY, size, dropShadow, ...rest } = opts;
  const px = Math.round((size ?? t.size) * (style === 'body' || style === 'small' ? textBoost : 1));
  const stroke = t.stroke ? Math.max(2, Math.round((t.stroke * px) / t.size)) : 0;
  const o = scene.add.text(x, y, str, {
    fontFamily: t.font,
    fontSize: `${px}px`,
    color,
    stroke: css(C.ink),
    strokeThickness: stroke,
    align: 'center',
    fontStyle: t.font.includes('Rubik') ? '600' : 'normal',
    resolution: Math.min(2, window.devicePixelRatio || 1),
    ...rest,
  });
  if (dropShadow ?? t.stroke > 0) o.setShadow(0, Math.max(2, Math.round(px / 14)), css(C.ink), 0, true, true);
  o.setOrigin(originX ?? 0.5, originY ?? 0.5);
  return o;
}

// ───────────────────────── Paneles ─────────────────────────

/** Panel nine-slice. x, y = esquina superior izquierda (como el panel antiguo). */
export function panel(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: PanelVariant = 'card',
): Phaser.GameObjects.NineSlice {
  ensure(scene);
  const s = PNL.slice(PANELS[variant].radius);
  const minW = s.l + s.r,
    minH = s.t + s.b;
  const p = scene.add.nineslice(
    x,
    y,
    pnlKey(variant),
    undefined,
    Math.max(minW, w),
    Math.max(minH, h + PNL.shadow),
    s.l,
    s.r,
    s.t,
    s.b,
  );
  p.setOrigin(0, 0);
  return p;
}

// ───────────────────────── Botones ─────────────────────────

export interface Button extends Phaser.GameObjects.Container {
  label: Phaser.GameObjects.Text;
  disabled: boolean;
  setDisabled(v: boolean): Button;
  setLabel(s: string): Button;
}

export interface ButtonOpts {
  icon?: string;
  iconFrame?: string;
  /** Tecla que lo activa en PC (se muestra como pista). */
  hotkey?: string;
  size?: number;
  sound?: string;
}

/** Botón con volumen, brillo y estados: normal, hover, pulsado y deshabilitado. */
export function button(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  variant: ButtonVariant,
  onClick: () => void,
  opts: ButtonOpts = {},
): Button {
  ensure(scene);
  const c = scene.add.container(x, y) as Button;
  const s = BTN.slice;
  const bh = Math.max(s.t + s.b, h + BTN.lip);
  const bg = scene.add.nineslice(
    0,
    BTN.lip / 2,
    btnKey(variant, 'normal'),
    undefined,
    Math.max(s.l + s.r, w),
    bh,
    s.l,
    s.r,
    s.t,
    s.b,
  );
  c.add(bg);
  const size = opts.size ?? Math.round(Math.min(h * 0.42, 34));
  let ix = 0;
  let icon: Phaser.GameObjects.Image | null = null;
  if (opts.icon) {
    icon = scene.add.image(-w / 2 + h * 0.55, -2, opts.icon, opts.iconFrame);
    icon.setDisplaySize(h * 0.62, h * 0.62);
    c.add(icon);
    ix = h * 0.28;
  }
  const t = text(scene, ix, -2, label, 'label', BUTTONS[variant].text, { size });
  c.add(t);
  if (opts.hotkey) {
    const hk = text(scene, w / 2 - 14, -h / 2 + 12, opts.hotkey, 'small', '#ffffffaa', { size: 14, originX: 1 });
    c.add(hk);
  }
  c.label = t;
  c.disabled = false;
  const set = (st: ButtonState) => {
    const state = c.disabled ? 'disabled' : st;
    bg.setTexture(btnKey(variant, state));
    const dy = state === 'pressed' ? 4 : 0;
    t.y = -2 + dy;
    if (icon) icon.y = -2 + dy;
  };
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => {
    if (c.disabled) return;
    set('hover');
    scene.tweens.add({ targets: c, scale: 1.04, duration: DUR.fast });
  });
  c.on('pointerout', () => {
    set('normal');
    scene.tweens.add({ targets: c, scale: 1, duration: DUR.fast });
  });
  c.on('pointerdown', () => !c.disabled && set('pressed'));
  c.on('pointerup', () => {
    if (c.disabled) {
      Sfx.play('noElixir');
      return;
    }
    set(scene.input.activePointer.wasTouch ? 'normal' : 'hover');
    Sfx.play(opts.sound ?? 'click');
    onClick();
  });
  c.setDisabled = (v: boolean) => {
    c.disabled = v;
    set(v ? 'disabled' : 'normal');
    t.setAlpha(v ? 0.75 : 1);
    return c;
  };
  c.setLabel = (str: string) => {
    t.setText(str);
    return c;
  };
  return c;
}

// ───────────────────────── Barras y pastillas ─────────────────────────

export interface Bar {
  root: Phaser.GameObjects.Container;
  set(v: number, label?: string): void;
}

/** Barra de progreso con hueco hundido y relleno con volumen. */
export function progressBar(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  v = 0,
  label = '',
): Bar {
  ensure(scene);
  const root = scene.add.container(x, y);
  const back = scene.add.nineslice(0, 0, pnlKey('inset'), undefined, w, h + PNL.shadow, 14, 14, 14, 18).setOrigin(0, 0);
  const fill = scene.add
    .nineslice(4, 4, 'ui_pill', undefined, w - 8, h - 8, 14, 14, 10, 10)
    .setOrigin(0, 0)
    .setTint(color);
  const t = text(scene, w / 2, h / 2, label, 'label', '#ffffff', { size: Math.round(h * 0.62) });
  root.add([back, fill, t]);
  const set = (val: number, lab?: string) => {
    const f = Math.max(0, Math.min(1, val));
    fill.setVisible(f > 0.001);
    fill.width = Math.max(28, (w - 8) * f);
    if (lab !== undefined) t.setText(lab);
  };
  set(v, label);
  return { root, set };
}

/** Pastilla de moneda (icono que sobresale + número). */
export function pill(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  icon: string,
  value: string,
): { root: Phaser.GameObjects.Container; set(v: string): void } {
  ensure(scene);
  const root = scene.add.container(x, y);
  const h = 44;
  const back = scene.add
    .nineslice(0, -h / 2, pnlKey('inset'), undefined, w, h + PNL.shadow, 16, 16, 16, 20)
    .setOrigin(0, 0);
  const ic = scene.add.image(4, 0, icon).setDisplaySize(52, 52);
  const t = text(scene, w - 16, 0, value, 'number', '#ffffff', { size: 26, originX: 1 });
  root.add([back, ic, t]);
  return { root, set: (v) => t.setText(v) };
}

// ───────────────────────── Fondo animado ─────────────────────────

/** Fondo del menú: degradado, patrón que se desliza, luces que flotan y viñeta. */
export function menuBackground(scene: Scene, w: number, h: number): Phaser.GameObjects.Container {
  ensure(scene);
  const root = scene.add.container(0, 0).setDepth(-1000);
  root.add(scene.add.image(0, 0, 'ui_bg').setOrigin(0, 0).setDisplaySize(w, h));
  const stripes = scene.add.tileSprite(0, 0, w, h, 'ui_stripes').setOrigin(0, 0);
  root.add(stripes);
  scene.tweens.add({ targets: stripes, tilePositionX: 64, tilePositionY: -64, duration: 6000, repeat: -1 });
  const tints = [0x4a6cff, 0x9b5cff, 0x2fb6ff, 0xffc93c];
  for (let i = 0; i < 7; i++) {
    const g = scene.add
      .image(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), 'ui_glow')
      .setTint(tints[i % tints.length])
      .setAlpha(0.1 + (i % 3) * 0.04)
      .setScale(Phaser.Math.FloatBetween(1.6, 3.2))
      .setBlendMode(Phaser.BlendModes.ADD);
    root.add(g);
    scene.tweens.add({
      targets: g,
      x: g.x + Phaser.Math.Between(-160, 160),
      y: g.y + Phaser.Math.Between(-120, 120),
      duration: Phaser.Math.Between(7000, 12000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  // motas de luz que suben
  for (let i = 0; i < 26; i++) {
    const m = scene.add
      .image(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), 'ui_glow')
      .setScale(Phaser.Math.FloatBetween(0.03, 0.07))
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    root.add(m);
    const rise = () => {
      m.setPosition(Phaser.Math.Between(0, w), h + 20).setAlpha(0);
      scene.tweens.add({
        targets: m,
        y: Phaser.Math.Between(-40, h * 0.4),
        alpha: { from: 0, to: 0.6 },
        duration: Phaser.Math.Between(6000, 11000),
        ease: 'Sine.easeIn',
        onComplete: rise,
      });
    };
    scene.time.delayedCall(i * 380, rise);
  }
  root.add(scene.add.image(0, 0, 'ui_vignette').setOrigin(0, 0).setDisplaySize(w, h));
  return root;
}

// ───────────────────────── Transiciones ─────────────────────────

/** Fundido de entrada al crear la escena. */
export function fadeIn(scene: Scene, ms = 220): void {
  scene.cameras.main.fadeIn(ms, 11, 13, 31);
}

/** Cambia de escena con un fundido rápido. */
const leaving = new WeakSet<Scene>();

export function goTo(scene: Scene, key: string, data?: object, ms = 160): void {
  // una sola salida por escena (dos clics seguidos no lanzan dos cambios)
  if (leaving.has(scene)) return;
  leaving.add(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaving.delete(scene));
  const cam = scene.cameras.main;
  // si aún se está haciendo el fundido de entrada, se corta: el cambio no puede perderse
  cam.resetFX();
  scene.input.enabled = false;
  cam.fadeOut(ms, 11, 13, 31);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.input.enabled = true;
    scene.scene.start(key, data);
  });
}
