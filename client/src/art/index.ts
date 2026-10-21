import type Phaser from 'phaser';
import { createTowerArt } from './towers';
import { createSceneryArt } from './scenery';

export { BRIDGE_OF, DECO_VARIANTS, DETAIL_VARIANTS } from './scenery';

/** Todo el pixel art propio (torres, puentes, decorados y detalles). Una vez al arrancar. */
export function createArtTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('bridge_wood')) return;
  createTowerArt(scene);
  createSceneryArt(scene);
}
