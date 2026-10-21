import { COLORS } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { setTextBoost } from '../ui/kit';
import { TEAM } from './teamColors';

// ─────────────────────────────────────────────────────────────
//  ACCESIBILIDAD (Perfil → Accesibilidad).
//  - Colores para daltonismo: los equipos pasan a azul cielo y bermellón (paleta de
//    Okabe-Ito, que se distinguen con cualquier tipo de daltonismo), también en las torres.
//  - Texto grande: los textos de lectura (descripciones, ayudas) un 15 % más grandes.
// ─────────────────────────────────────────────────────────────

const OKABE_ITO = { player: 0x56b4e9, enemy: 0xd55e00 };

/** Aplica los ajustes guardados. Devuelve true si han cambiado los colores (hay que redibujar el arte). */
export function applyAccessibility(): boolean {
  const s = Profile.settings;
  const pal = s.colorblind ? OKABE_ITO : { player: COLORS.player, enemy: COLORS.enemy };
  const changed = pal.player !== TEAM.player || pal.enemy !== TEAM.enemy;
  TEAM.player = pal.player;
  TEAM.enemy = pal.enemy;
  setTextBoost(s.bigText ? 1.15 : 1);
  return changed;
}
