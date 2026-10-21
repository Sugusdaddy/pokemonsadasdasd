import type Phaser from 'phaser';
import { createTowerArt } from './towers';
import { createSceneryArt } from './scenery';
import { createBuildingArt } from './buildings';

export { BRIDGE_OF, DECO_VARIANTS, DETAIL_VARIANTS } from './scenery';

/** Redibuja lo que lleva los colores de equipo (al cambiar el modo daltonismo). */
export function refreshTeamArt(scene: Phaser.Scene): void {
  createTowerArt(scene);
  createBuildingArt(scene);
}

/** Todo el pixel art propio (torres, puentes, decorados y detalles). Una vez al arrancar. */
export function createArtTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('bridge_wood')) return;
  createTowerArt(scene);
  createSceneryArt(scene);
  createBuildingArt(scene);
}
