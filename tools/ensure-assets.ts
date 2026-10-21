/**
 * Antes de `npm run dev` / `npm run build`: genera los atlas si no existen o si falta
 * algún Pokémon de pack.json (p. ej. tras añadir cartas nuevas y bajar el código).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'client/public/gen');

function missing(): string | null {
  if (!fs.existsSync(path.join(GEN, 'manifest.json'))) return 'No hay atlas generados';
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/src/data/pack.json'), 'utf8')) as {
    pokemon: Record<string, unknown>;
  };
  const lost = Object.keys(pack.pokemon).filter((id) => !fs.existsSync(path.join(GEN, 'pk', `${id}.json`)));
  return lost.length ? `Faltan los atlas de ${lost.length} Pokémon (cartas nuevas)` : null;
}

const why = missing();
if (why) {
  console.log(`${why}: ejecutando "npm run assets"…`);
  const r = spawnSync('npx', ['tsx', 'tools/build-assets.ts'], { cwd: ROOT, stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}
