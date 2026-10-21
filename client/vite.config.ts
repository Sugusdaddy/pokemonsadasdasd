import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/** Ficheros de una carpeta de public/, recursivo, como rutas relativas a public/. */
function publicFiles(pub: string, dir: string): string[] {
  return fs
    .readdirSync(path.join(pub, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? publicFiles(pub, `${dir}/${e.name}`) : [`${dir}/${e.name}`]));
}

/**
 * Service worker (app instalable): rellena la plantilla pwa/sw.js con la lista de ficheros
 * que se guardan al instalar (el build, los iconos y los sprites, que hacen falta para jugar
 * aunque no haya red) y una versión que cambia cuando cambia cualquiera de ellos.
 */
function serviceWorker(): Plugin {
  return {
    name: 'arena-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const pub = path.join(ROOT, 'public');
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      const precache = [
        './',
        ...built,
        'manifest.webmanifest',
        ...publicFiles(pub, 'icons'),
        ...publicFiles(pub, 'gen'),
      ];
      precache.sort();
      // los recursos de public/ no llevan hash en el nombre: su contenido entra en la versión
      const hash = createHash('sha1').update(precache.join('\n'));
      for (const f of [...precache, 'audio/manifest.json']) {
        const file = path.join(pub, f);
        if (!bundle[f] && f !== './' && fs.existsSync(file)) hash.update(fs.readFileSync(file));
      }
      const template = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');
      hash.update(template);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
          .replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
