import { ScrollPanel } from '../ScrollPanel.js';

export const CONTENT_TOP = 120;
export const CONTENT_BOTTOM = 1128;

/** Base de las pestañas del menú. */
export class Tab {
  constructor(scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0);
    this.panels = [];
    this.build();
  }

  build() {}

  scroll(x = 0, y = CONTENT_TOP, w = 720, h = CONTENT_BOTTOM - CONTENT_TOP) {
    const p = new ScrollPanel(this.scene, x, y, w, h);
    this.root.add(p.content);
    this.panels.push(p);
    return p;
  }

  rebuild() {
    const y = this.panels[0]?.scrollY || 0;
    this.panels.forEach((p) => p.destroy());
    this.panels = [];
    this.root.removeAll(true);
    this.build();
    if (this.panels[0]) this.panels[0].set(y);
  }

  update() { this.panels.forEach((p) => p.update()); }

  destroy() {
    this.panels.forEach((p) => p.destroy());
    this.panels = [];
    this.root.destroy();
  }
}
