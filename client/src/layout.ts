import type Phaser from 'phaser';

// ─────────────────────────────────────────────────────────────
//  DISEÑO DE PANTALLA
//  - 'pc'     lienzo horizontal de 1080 de alto y entre 1440 y 1920 de ancho según la ventana
//             (16:9 en un monitor, 4:3 en una tableta en horizontal: sin franjas negras y la
//             interfaz más grande). La batalla se diseña siempre a 1920 y se ajusta con zoom.
//  - 'mobile' lienzo vertical 720×1280 (el diseño original).
//  Se elige según la forma de la ventana. Se puede forzar con ?layout=pc o ?layout=mobile,
//  o desde Perfil (se guarda en el navegador).
//  La simulación no cambia: la arena siempre mide 720×1280 en coordenadas del mundo.
// ─────────────────────────────────────────────────────────────

export type LayoutMode = 'pc' | 'mobile';

const SIZES: Record<LayoutMode, { w: number; h: number }> = {
  pc: { w: 1920, h: 1080 },
  mobile: { w: 720, h: 1280 },
};
/** Ancho de diseño de la batalla en PC (arena de 720 + dos paneles de 600). */
export const PC_BATTLE_W = 1920;
const PC_MIN_W = 1440;

/** Ancho del lienzo en PC para la forma de la ventana (de 4:3 a 16:9, número par). */
export function pcWidthFor(winW: number, winH: number): number {
  const w = Math.round((1080 * winW) / Math.max(1, winH));
  return Math.max(PC_MIN_W, Math.min(PC_BATTLE_W, w - (w % 2)));
}

const PREF_KEY = 'arenaRoyale.layout';

/** Preferencia guardada: 'auto' | 'pc' | 'mobile'. */
export function layoutPreference(): 'auto' | LayoutMode {
  const q = new URLSearchParams(location.search).get('layout');
  if (q === 'pc' || q === 'mobile') return q;
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === 'pc' || v === 'mobile') return v;
  } catch {
    /* sin almacenamiento */
  }
  return 'auto';
}

export function setLayoutPreference(v: 'auto' | LayoutMode): void {
  try {
    if (v === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, v);
  } catch {
    /* sin almacenamiento */
  }
}

export function detectMode(): LayoutMode {
  const pref = layoutPreference();
  if (pref !== 'auto') return pref;
  const w = window.innerWidth,
    h = window.innerHeight;
  return w >= h * 1.15 && w >= 800 ? 'pc' : 'mobile';
}

let mode: LayoutMode = detectMode();
let pcW = pcWidthFor(window.innerWidth, window.innerHeight);

/** Tamaño y modo actuales del lienzo. */
export const L = {
  get mode(): LayoutMode {
    return mode;
  },
  get pc(): boolean {
    return mode === 'pc';
  },
  /** Ancho y alto de la pantalla (no de la arena: esa sigue siendo W×H de shared). */
  get w(): number {
    return mode === 'pc' ? pcW : SIZES.mobile.w;
  },
  get h(): number {
    return SIZES[mode].h;
  },
  /** En PC, cuánto se desplaza la arena para quedar centrada (la cámara de la batalla). */
  get arenaX(): number {
    return mode === 'pc' ? (PC_BATTLE_W - 720) / 2 : 0;
  },
  /** Zoom de la cámara de la batalla en PC: su diseño (1920) cabe en el ancho real del lienzo. */
  get battleZoom(): number {
    return mode === 'pc' ? pcW / PC_BATTLE_W : 1;
  },
};

export const initialSize = (): { width: number; height: number } => ({ width: L.w, height: L.h });

/**
 * Si la ventana cambia de forma (girar la tableta, redimensionar), cambia de diseño.
 * Nunca en mitad de una batalla: se aplica al volver al menú.
 */
export function watchLayout(game: Phaser.Game): void {
  const check = () => {
    const next = detectMode();
    const nextW = pcWidthFor(window.innerWidth, window.innerHeight);
    if (next === mode && (next !== 'pc' || nextW === pcW)) return;
    const active = game.scene.getScenes(true);
    if (active.some((s) => s.scene.key === 'Battle' || s.scene.key === 'Boot')) return;
    mode = next;
    pcW = nextW;
    game.scale.setGameSize(L.w, L.h);
    for (const s of active) s.scene.restart();
  };
  window.addEventListener('resize', () => window.setTimeout(check, 150));
  game.events.on('layout-check', check);
}
