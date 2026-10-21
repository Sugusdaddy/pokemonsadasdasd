import type Phaser from 'phaser';
import type { BallReward } from '@arena/shared';
import type { BaseScene } from '../../scenes/BaseScene';
import { ScrollPanel } from '../ScrollPanel';
import { L } from '../../layout';
import { Profile } from '../../meta/Profile';
import { t } from '../../i18n';
import { ApiError } from '../../net/session';
import { Sfx } from '../../systems/Sfx';
import { toast } from '../Modal';
import * as kit from '../kit';

/** Nombre del jugador (el nombre por defecto se traduce). */
export function playerName(): string {
  return Profile.displayName;
}

/** Texto de un error del servidor (o de red) para mostrarlo al jugador. */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? t(e.code) : t('err.server');
}

const busy = new Set<string>();

/**
 * Ejecuta una acción contra el servidor: ignora clics repetidos mientras la petición
 * está en marcha, muestra el error como aviso y llama a onOk si va bien.
 */
export async function runAction<T>(
  scene: Phaser.Scene,
  key: string,
  fn: () => Promise<T>,
  onOk?: (r: T) => void,
): Promise<T | undefined> {
  if (busy.has(key)) return undefined;
  busy.add(key);
  try {
    const r = await fn();
    if (scene.sys.isActive()) onOk?.(r);
    return r;
  } catch (e) {
    if (scene.sys.isActive()) {
      Sfx.play('noElixir');
      toast(scene, errorMessage(e), '#ff9a9a');
    }
    return undefined;
  } finally {
    busy.delete(key);
  }
}

export const isBusy = (key: string): boolean => busy.has(key);

/**
 * Cabecera de sección: título grande, texto secundario opcional a la derecha y una
 * línea divisoria. Devuelve los objetos para añadirlos al contenedor que toque.
 */
export function sectionHeader(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  title: string,
  right?: string,
): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = [
    kit.text(scene, x, y, title, 'h2', '#ffffff', { originX: 0, size: 32 }),
  ];
  if (right) out.push(kit.text(scene, x + w, y + 4, right, 'body', '#aab3e8', { originX: 1, size: 20 }));
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.12).fillRect(x, y + 28, w, 2);
  g.fillStyle(kit.C.gold, 0.8).fillRect(x, y + 28, 64, 3);
  out.push(g);
  return out;
}

export const CONTENT_TOP = 120;
export const CONTENT_BOTTOM = 1128;
/** Alto de la barra superior del menú (los dos diseños). */
export const TOP_BAR = 112;
/** Ancho de la barra lateral de pestañas (solo PC). */
export const SIDEBAR_W = 220;
/** Ancho máximo del contenido en PC, para que no se estire en pantallas muy anchas. */
const MAX_CONTENT_W = 1500;

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zona de pantalla donde dibuja cada pestaña. */
export function contentArea(): Area {
  if (!L.pc) return { x: 0, y: CONTENT_TOP, w: 720, h: CONTENT_BOTTOM - CONTENT_TOP };
  const avail = L.w - SIDEBAR_W;
  const w = Math.min(MAX_CONTENT_W, avail - 80);
  const y = TOP_BAR + 18;
  return { x: SIDEBAR_W + Math.round((avail - w) / 2), y, w, h: L.h - y - 24 };
}

export type TabKey = 'shop' | 'cards' | 'battle' | 'road' | 'social' | 'profile' | 'admin';

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

  get area(): Area {
    return contentArea();
  }

  /** Panel con scroll; por defecto ocupa toda la zona de contenido. */
  scroll(x?: number, y?: number, w?: number, h?: number): ScrollPanel {
    const a = this.area;
    const p = new ScrollPanel(this.scene, x ?? a.x, y ?? a.y, w ?? a.w, h ?? a.h);
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
