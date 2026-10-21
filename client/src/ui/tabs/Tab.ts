import type Phaser from 'phaser';
import type { BallReward } from '@arena/shared';
import type { BaseScene } from '../../scenes/BaseScene';
import { ScrollPanel } from '../ScrollPanel';

export const CONTENT_TOP = 120;
export const CONTENT_BOTTOM = 1128;

export type TabKey = 'shop' | 'cards' | 'battle' | 'road' | 'profile';

/** Lo que las pestañas necesitan de la escena del menú. */
export interface MenuScene extends BaseScene {
  openBallScene(reward: BallReward, back?: TabKey): void;
}

/** Base de las pestañas del menú. */
export class Tab {
  readonly root: Phaser.GameObjects.Container;
  panels: ScrollPanel[] = [];

  constructor(readonly scene: MenuScene) {
    this.root = scene.add.container(0, 0);
    this.build();
  }

  build(): void {}

  /** Se llama 4 veces por segundo (temporizadores). */
  tick(): void {}

  scroll(x = 0, y = CONTENT_TOP, w = 720, h = CONTENT_BOTTOM - CONTENT_TOP): ScrollPanel {
    const p = new ScrollPanel(this.scene, x, y, w, h);
    this.root.add(p.content);
    this.panels.push(p);
    return p;
  }

  rebuild(): void {
    const y = this.panels[0]?.scrollY || 0;
    this.panels.forEach((p) => p.destroy());
    this.panels = [];
    this.root.removeAll(true);
    this.build();
    if (this.panels[0]) this.panels[0].set(y);
  }

  update(_delta?: number): void {
    this.panels.forEach((p) => p.update());
  }

  destroy(): void {
    this.panels.forEach((p) => p.destroy());
    this.panels = [];
    this.root.destroy();
  }
}
