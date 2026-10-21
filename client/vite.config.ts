import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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

/**
 * Content-Security-Policy del build (en un <meta>, así lleva la URL del servidor de cada
 * entorno): solo scripts propios, conexiones al servidor de juego (y a Sentry si hay DSN)
 * y las fuentes de Google. `frame-ancestors` no vale en <meta>: va en las cabeceras del
 * hosting (vercel.json, deploy/nginx.conf).
 */
export function cspFor(env: Record<string, string>): string {
  const connect = ["'self'"];
  const server = env.VITE_SERVER_URL?.trim();
  if (server) {
    const u = new URL(server);
    const secure = u.protocol === 'wss:' || u.protocol === 'https:';
    connect.push(`${secure ? 'wss' : 'ws'}://${u.host}`, `${secure ? 'https' : 'http'}://${u.host}`);
  } else {
    // sin VITE_SERVER_URL el cliente busca el servidor en su misma máquina, puerto 2567
    connect.push('ws://*:2567', 'wss://*:2567', 'http://*:2567', 'https://*:2567');
  }
  const dsn = env.VITE_SENTRY_DSN?.trim();
  if (dsn) connect.push(`https://${new URL(dsn).host}`);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

function contentSecurityPolicy(env: Record<string, string>): Plugin {
  return {
    name: 'arena-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: cspFor(env) },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 5173, host: true },
  plugins: [serviceWorker(), contentSecurityPolicy(loadEnv(mode, ROOT, 'VITE_'))],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
}));
