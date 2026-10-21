import Phaser from 'phaser';

/** Escena con contador de modales abiertos (los toques se ignoran mientras haya alguno). */
export class BaseScene extends Phaser.Scene {
  modalOpen = 0;
}
