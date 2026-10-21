import type Phaser from 'phaser';

// ─────────────────────────────────────────────────────────────
//  DISEÑO DE PANTALLA
//  - 'pc'     lienzo horizontal 1920×1080: la arena vertical en el centro y paneles a los lados.
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
    return SIZES[mode].w;
  },
  get h(): number {
    return SIZES[mode].h;
  },
  /** En PC, cuánto se desplaza la arena para quedar centrada (la cámara de la batalla). */
  get arenaX(): number {
    return mode === 'pc' ? (SIZES.pc.w - 720) / 2 : 0;
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
    if (next === mode) return;
    const active = game.scene.getScenes(true);
    if (active.some((s) => s.scene.key === 'Battle' || s.scene.key === 'Boot')) return;
    mode = next;
    game.scale.setGameSize(L.w, L.h);
    for (const s of active) s.scene.restart();
  };
  window.addEventListener('resize', () => window.setTimeout(check, 150));
  game.events.on('layout-check', check);
}
