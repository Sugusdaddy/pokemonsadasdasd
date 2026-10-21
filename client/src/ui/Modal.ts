import Phaser from 'phaser';
import { L } from '../layout';
import type { BaseScene } from '../scenes/BaseScene';
import * as kit from './kit';

export interface ModalHandle {
  root: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Container;
  close: () => void;
}

const stack: object[] = [];

/**
 * Fija un objeto y todos sus hijos a la pantalla (scrollFactor 0). Hace falta en los
 * hijos también: Phaser comprueba los clics con el scrollFactor de cada objeto.
 */
export function pinToScreen(o: Phaser.GameObjects.GameObject): void {
  (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0);
  if (o instanceof Phaser.GameObjects.Container) o.list.forEach(pinToScreen);
}

/**
 * Ventana modal: fondo oscuro, panel con cinta de título y botón de cerrar.
 * build(container, close) añade el contenido (coordenadas relativas al centro).
 */
export function openModal(
  scene: BaseScene,
  w: number,
  h: number,
  title: string | null,
  build: (box: Phaser.GameObjects.Container, close: () => void) => void,
): ModalHandle {
  scene.modalOpen = (scene.modalOpen || 0) + 1;
  const W = L.w,
    H = L.h;
  // si la ventana no cabe (PC tiene 1080 de alto) se reduce entera
  const fit = Math.min(1, (H - 40) / (h + (title ? 40 : 0)), (W - 40) / w);
  // scrollFactor 0: en la batalla de PC la cámara está desplazada y la ventana debe quedar centrada en pantalla
  const root = scene.add.container(0, 0).setDepth(8000).setScrollFactor(0);
  // el doble de grande: también cubre la pantalla si la cámara tiene zoom (batalla en tableta)
  const dim = scene.add.rectangle(W / 2, H / 2, W * 2, H * 2, kit.C.ink, 0.72).setInteractive();
  root.add(dim);
  const box = scene.add.container(W / 2, H / 2 + (title ? 16 : 0) * fit);
  root.add(box);
  box.add(kit.panel(scene, -w / 2, -h / 2, w, h, 'card'));
  if (title) {
    // cinta de título que sobresale por arriba
    const rw = Math.min(w - 40, Math.max(320, title.length * 22 + 120));
    box.add(kit.panel(scene, -rw / 2, -h / 2 - 34, rw, 66, 'blue'));
    box.add(kit.text(scene, 0, -h / 2 - 2, title, 'h2', '#ffffff', { size: 34 }));
  }
  let closed = false;
  const entry = {};
  stack.push(entry);
  // Esc cierra la ventana de arriba
  const onEsc = () => {
    if (stack[stack.length - 1] === entry) close();
  };
  scene.input.keyboard?.on('keydown-ESC', onEsc);
  scene.events.once('shutdown', () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  });
  const close = () => {
    if (closed) return;
    closed = true;
    scene.input.keyboard?.off('keydown-ESC', onEsc);
    stack.splice(stack.indexOf(entry), 1);
    scene.modalOpen -= 1;
    scene.tweens.add({ targets: dim, alpha: 0, duration: 140 });
    scene.tweens.add({ targets: box, scale: 0.85 * fit, alpha: 0, duration: 140, onComplete: () => root.destroy() });
  };
  box.add(kit.button(scene, w / 2 - 26, -h / 2 + 22, 56, 52, 'X', 'danger', close, { size: 26 }));
  dim.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (Math.abs(p.x - W / 2) > (w / 2) * fit || Math.abs(p.y - H / 2) > (h / 2 + 40) * fit) close();
  });
  build(box, close);
  pinToScreen(root);
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: 160 });
  box.setScale(0.8 * fit).setAlpha(0);
  scene.tweens.add({ targets: box, scale: fit, alpha: 1, duration: 200, ease: 'Back.easeOut' });
  return { root, box, close };
}

/** Aviso breve en el centro de la pantalla, sobre una pastilla oscura. */
export function toast(scene: Phaser.Scene, msg: string, color = '#ffffff', y = L.h / 2): void {
  const c = scene.add
    .container(L.w / 2, y)
    .setDepth(9500)
    .setScrollFactor(0);
  const t = kit.text(scene, 0, 0, msg, 'h3', color, { size: 30 });
  const w = Math.min(L.w - 40, t.width + 64);
  const bg = scene.add.nineslice(-w / 2, -34, 'ui_pnl_dark', undefined, w, 76, 30, 30, 30, 38).setOrigin(0, 0);
  c.add([bg, t]);
  pinToScreen(c);
  c.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 40, alpha: 0, delay: 1100, duration: 400, onComplete: () => c.destroy() });
}
