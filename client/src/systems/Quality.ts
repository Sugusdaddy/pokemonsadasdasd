import type Phaser from 'phaser';
import { Profile } from '../meta/Profile';

// ─────────────────────────────────────────────────────────────
//  CALIDAD GRÁFICA (Perfil → Calidad gráfica)
//  - Alta: 60 fps, shaders, partículas completas, brillos de cartas.
//  - Baja (modo bajo consumo): 30 fps, sin shader del río ni viñeta, un tercio de las
//    partículas, sin partículas de ambiente ni brillos animados en las cartas.
//  - Auto: empieza en alta y, si en batalla va lento varios segundos seguidos, baja sola
//    (y lo recuerda en este navegador).
// ─────────────────────────────────────────────────────────────

export type QualityLevel = 'auto' | 'high' | 'low';
export const QUALITY_LEVELS: QualityLevel[] = ['auto', 'high', 'low'];

const AUTO_KEY = 'arenaRoyale.autoLow';

let autoLow = (() => {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
})();

export const qualitySetting = (): QualityLevel => Profile.settings.quality ?? 'auto';

/** ¿Va en calidad baja ahora mismo? */
export function lowQuality(): boolean {
  const q = qualitySetting();
  return q === 'low' || (q === 'auto' && autoLow);
}

/** "Auto" decidió que este equipo va justo (o el jugador cambió el ajuste y se olvida). */
export function setAutoLow(v: boolean): void {
  autoLow = v;
  try {
    if (v) localStorage.setItem(AUTO_KEY, '1');
    else localStorage.removeItem(AUTO_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

export const isAutoLow = (): boolean => autoLow;

/** Tope de fotogramas: 30 en baja, sin tope (el de la pantalla) en alta. */
export function applyFpsCap(game: Phaser.Game): void {
  const loop = game.loop as Phaser.Core.TimeStep & { _limitRate: number };
  const limit = lowQuality() ? 30 : 0;
  if (loop.fpsLimit === limit) return;
  loop.fpsLimit = limit;
  loop.hasFpsLimit = limit > 0;
  loop._limitRate = limit > 0 ? 1000 / limit : 0;
  // el bucle elige su función de paso al arrancar: se reinicia para que use el tope nuevo
  const cb = loop.callback;
  loop.stop();
  loop.start(cb);
}

/** Cantidad de partículas según la calidad. */
export const particleAmount = (): number => (lowQuality() ? 0.35 : 1);
