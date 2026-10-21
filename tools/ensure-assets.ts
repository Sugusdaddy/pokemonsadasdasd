/** Antes de `npm run dev` / `npm run build`: genera los atlas si no existen. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(ROOT, 'client/public/gen/manifest.json'))) {
  console.log('No hay atlas generados: ejecutando "npm run assets"…');
  const r = spawnSync('npx', ['tsx', 'tools/build-assets.ts'], { cwd: ROOT, stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}
