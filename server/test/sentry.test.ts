import http from 'node:http';
import zlib from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { initSentry, reportError } from '../src/sentry';

// Un "Sentry" falso en local para ver qué se manda de verdad.
const received: string[] = [];
const fake = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    received.push(req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(body).toString() : body.toString());
    res.writeHead(200).end('{}');
  });
});

afterAll(() => {
  fake.close();
  delete process.env.SENTRY_DSN;
});

describe('Sentry', () => {
  it('sin SENTRY_DSN no se activa (ni se carga el SDK)', async () => {
    delete process.env.SENTRY_DSN;
    expect(await initSentry()).toBe(false);
    reportError(new Error('no debería salir'), 'test');
  });

  it('con SENTRY_DSN manda el error, sin cabeceras ni datos del usuario', async () => {
    await new Promise<void>((r) => fake.listen(0, r));
    const port = (fake.address() as { port: number }).port;
    process.env.SENTRY_DSN = `http://clavepublica@localhost:${port}/1`;
    expect(await initSentry()).toBe(true);
    reportError(new Error('fallo de prueba'), 'test', { mode: 'ranked' });
    const S = await import('@sentry/node');
    await S.flush(3000);
    const all = received.join('\n');
    expect(all).toContain('fallo de prueba');
    expect(all).toContain('"where":"test"');
    // (el texto aparece en el código del test que viaja como contexto: se mira que no se mandó como error)
    expect(all).not.toContain('"value":"no debería salir"');
    expect(all).toContain('"server_name":"arena"');
    expect(all).not.toContain('"category":"console"');
    expect(all.toLowerCase()).not.toContain('authorization');
    expect(all).not.toContain('"user"');
  });
});
