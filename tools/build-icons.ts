/**
 * Iconos de la app (PWA, pantalla de inicio, favicon) a partir del pixel art propio de
 * client/src/art/icon.ts, escalado sin suavizar para que los píxeles salgan duros.
 *
 *   npm run icons     → client/public/icons/*.png (se suben al repo)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { appIcon } from '../client/src/art/icon';
import type { Pix } from '../client/src/art/pixel';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/public/icons');

function png(p: Pix, size: number): Buffer {
  const img = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = p.get(Math.floor((x * p.w) / size), Math.floor((y * p.h) / size));
      const i = (y * img.width + x) * 4;
      img.data[i] = (c >> 16) & 255;
      img.data[i + 1] = (c >> 8) & 255;
      img.data[i + 2] = c & 255;
      img.data[i + 3] = c === -1 ? 0 : 255;
    }
  return PNG.sync.write(img);
}

const rounded = appIcon(96, true);
const full = appIcon(96, false);
const files: Array<[string, Pix, number]> = [
  ['favicon-64.png', appIcon(64, true), 64],
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['maskable-192.png', full, 192],
  ['maskable-512.png', full, 512],
  // iOS no recorta ni usa transparencias: el de fondo a sangre, y él redondea las esquinas
  ['apple-touch-icon.png', full, 192],
];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [name, pix, size] of files) {
  fs.writeFileSync(path.join(OUT, name), png(pix, size));
  console.log(`  ${name}  ${size}×${size}`);
}
console.log(`Iconos en ${path.relative(process.cwd(), OUT)}`);
