// ─────────────────────────────────────────────────────────────
//  SISTEMA DE DISEÑO: colores, tipografía y medidas de toda la UI.
//  Cambiar algo aquí cambia el aspecto de todo el juego.
// ─────────────────────────────────────────────────────────────

export const FONT_DISPLAY = '"Lilita One", "Arial Black", sans-serif';
export const FONT_BODY = '"Rubik", "Segoe UI", system-ui, sans-serif';

/** Colores base (fondo azul noche, acentos dorados). */
export const C = {
  ink: 0x0b0d1f, // contorno de todo
  bg0: 0x0d1130,
  bg1: 0x182058,
  bg2: 0x24307a,
  surface: 0x232a5c,
  surfaceHi: 0x2f3878,
  surfaceLo: 0x171c42,
  line: 0x3c4690,
  gold: 0xffc93c,
  goldDeep: 0xd9921a,
  text: 0xffffff,
  textDim: 0xaab3e8,
  textMute: 0x7480c0,
  good: 0x44d17a,
  bad: 0xff5a64,
  info: 0x4aa8ff,
  elixir: 0xd63cf0,
  gem: 0x3ee07a,
};

export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Variantes de botón: [arriba, abajo, borde de luz] del degradado. */
export const BUTTONS = {
  primary: { top: 0xffd75a, bottom: 0xf29a17, rim: 0xfff1b8, text: '#ffffff' },
  success: { top: 0x6fe38f, bottom: 0x23a456, rim: 0xc9ffd9, text: '#ffffff' },
  info: { top: 0x6fc0ff, bottom: 0x2a6fe0, rim: 0xd2ecff, text: '#ffffff' },
  danger: { top: 0xff7a80, bottom: 0xd23544, rim: 0xffd0d3, text: '#ffffff' },
  neutral: { top: 0x5a66b8, bottom: 0x343d86, rim: 0xb9c2ff, text: '#ffffff' },
  dark: { top: 0x2b3370, bottom: 0x1a2050, rim: 0x5763b8, text: '#dfe4ff' },
} as const;
export type ButtonVariant = keyof typeof BUTTONS;

/** Variantes de panel. */
export const PANELS = {
  card: { top: 0x2f3a86, bottom: 0x222a66, rim: 0x5867c4, border: C.ink, radius: 22 },
  dark: { top: 0x1c2254, bottom: 0x141a40, rim: 0x2f3880, border: C.ink, radius: 22 },
  light: { top: 0x3d4aa6, bottom: 0x2c3684, rim: 0x7c8be0, border: C.ink, radius: 22 },
  inset: { top: 0x10143a, bottom: 0x161b48, rim: 0x0b0e2a, border: C.ink, radius: 16 },
  gold: { top: 0xffd75a, bottom: 0xe8a128, rim: 0xfff1b8, border: C.ink, radius: 22 },
  red: { top: 0xd9404c, bottom: 0x9e2531, rim: 0xff9aa2, border: C.ink, radius: 22 },
  blue: { top: 0x3b7cf0, bottom: 0x1f4fb8, rim: 0x9fc4ff, border: C.ink, radius: 22 },
  green: { top: 0x3fbf6a, bottom: 0x23894a, rim: 0xb5f5c9, border: C.ink, radius: 22 },
} as const;
export type PanelVariant = keyof typeof PANELS;

/** Escala tipográfica (px en el lienzo lógico). */
export const TYPE = {
  hero: { font: FONT_DISPLAY, size: 84, stroke: 10 },
  h1: { font: FONT_DISPLAY, size: 52, stroke: 8 },
  h2: { font: FONT_DISPLAY, size: 36, stroke: 6 },
  h3: { font: FONT_DISPLAY, size: 26, stroke: 5 },
  label: { font: FONT_DISPLAY, size: 22, stroke: 4 },
  body: { font: FONT_BODY, size: 22, stroke: 0 },
  small: { font: FONT_BODY, size: 18, stroke: 0 },
  number: { font: FONT_DISPLAY, size: 28, stroke: 5 },
} as const;
export type TypeStyle = keyof typeof TYPE;

export const SPACE = 8;
export const DUR = { fast: 90, base: 160, slow: 320 };
