import { COLORS } from '@arena/shared';

/**
 * Colores de equipo que usa todo el dibujo de la batalla y el arte de las torres. Los cambia
 * el modo daltonismo (systems/Accessibility.ts). Sin más dependencias: lo usa también el
 * generador de iconos, que corre en Node.
 */
export const TEAM = { player: COLORS.player, enemy: COLORS.enemy };
