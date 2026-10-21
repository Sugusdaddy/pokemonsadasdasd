import type Phaser from 'phaser';
import { W, H, COLORS } from '@arena/shared';
import type { BaseScene } from '../scenes/BaseScene';
import { txt, panel, button } from './style';

export interface ModalHandle {
  root: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Container;
  close: () => void;
}

/** Ventana modal con fondo oscuro. build(container, close) añade el contenido. */
export function openModal(
  scene: BaseScene,
  w: number,
  h: number,
  title: string | null,
  build: (box: Phaser.GameObjects.Container, close: () => void) => void,
): ModalHandle {
  scene.modalOpen = (scene.modalOpen || 0) + 1;
  const root = scene.add.container(0, 0).setDepth(8000);
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x05060f, 0.7).setInteractive();
  root.add(dim);
  const box = scene.add.container(W / 2, H / 2);
  root.add(box);
  box.add(panel(scene, -w / 2, -h / 2, w, h, COLORS.panel, 22));
  if (title) {
    const hg = scene.add.graphics();
    hg.fillStyle(COLORS.blue).fillRoundedRect(-w / 2, -h / 2, w, 70, { tl: 22, tr: 22, bl: 0, br: 0 });
    box.add(hg);
    box.add(txt(scene, 0, -h / 2 + 36, title, 34));
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scene.modalOpen -= 1;
    scene.tweens.add({ targets: box, scale: 0.85, alpha: 0, duration: 120, onComplete: () => root.destroy() });
  };
  const x = button(scene, w / 2 - 30, -h / 2 + 34, 48, 48, 'X', COLORS.red, close, 28);
  box.add(x);
  dim.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (Math.abs(p.x - W / 2) > w / 2 || Math.abs(p.y - H / 2) > h / 2) close();
  });
  build(box, close);
  box.setScale(0.8).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
  return { root, box, close };
}

export function toast(scene: Phaser.Scene, msg: string, color = '#ffffff', y = H / 2): void {
  const t = txt(scene, W / 2, y, msg, 32, color).setDepth(9500);
  scene.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 900, duration: 500, onComplete: () => t.destroy() });
}
