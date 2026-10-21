/**
 * npm run build:server
 *
 * Empaqueta el servidor en un único server/dist/index.js (con su mapa de fuentes) para
 * producción: `node server/dist/index.js`, sin tsx ni compilar al arrancar. El código de
 * @arena/shared va dentro; las dependencias de server/package.json se quedan fuera y se
 * cargan de node_modules (Prisma lleva su motor nativo y Sentry se carga solo si hay DSN).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server/package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@arena/'));

const outfile = path.join(root, 'server/dist/index.js');
fs.rmSync(path.dirname(outfile), { recursive: true, force: true });
const result = await build({
  entryPoints: [path.join(root, 'server/src/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  external,
  sourcemap: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});
const kb = Math.round(fs.statSync(outfile).size / 1024);
console.log(
  `[build:server] ${path.relative(root, outfile)} (${kb} KB, ${Object.keys(result.metafile.inputs).length} módulos)`,
);
