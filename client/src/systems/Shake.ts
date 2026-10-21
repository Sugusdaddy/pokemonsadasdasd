import type Phaser from 'phaser';
import { Profile } from '../meta/Profile';
import { shakeFactor } from '../battle/juice';

/** Vibración de cámara según el ajuste del jugador (Perfil → Vibración de pantalla). */
export function shake(scene: Phaser.Scene, durationMs: number, intensity: number): void {
  const k = shakeFactor(Profile.settings.shake);
  if (k > 0) scene.cameras.main.shake(durationMs, intensity * k);
}
