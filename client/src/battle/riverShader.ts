import Phaser from 'phaser';
import type { ArenaTheme } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  RÍO ANIMADO con un shader (solo WebGL). Agua con reflejos y espuma en las
//  orillas, o lava con costra que se mueve y brillo que late (Monte Ascuas).
//  Se pixela en bloques de 4 px para que case con el pixel art del juego.
// ─────────────────────────────────────────────────────────────

const FRAG = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform float uLava;
varying vec2 fragCoord;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 px = floor(fragCoord / 4.0) * 4.0;   // bloques de 4 px
  vec2 uv = px / resolution;
  vec2 p = px / 22.0;
  float t = time;
  // 0 en las orillas, 1 en el centro del cauce
  float bank = smoothstep(0.0, 0.3, uv.y) * smoothstep(1.0, 0.7, uv.y);
  vec3 col;
  if (uLava > 0.5) {
    float n = noise(p * vec2(0.45, 0.9) + vec2(t * 0.12, t * 0.04)) * 0.65 + noise(p * 1.4 - vec2(t * 0.22, 0.0)) * 0.35;
    float crust = smoothstep(0.44, 0.32, n);
    vec3 hot = mix(uDeep, uLight, smoothstep(0.5, 0.85, n));
    col = mix(hot, vec3(0.2, 0.07, 0.04), crust * 0.85);
    float pulse = 0.55 + 0.45 * sin(t * 2.2 + px.x * 0.025);
    col += uLight * 0.18 * pulse * (1.0 - crust);
    col = mix(col * 0.6, col, bank);
  } else {
    float n = noise(p * vec2(0.6, 1.2) + vec2(t * 0.55, 0.0)) * 0.6 + noise(p * 1.8 - vec2(t * 0.8, t * 0.15)) * 0.4;
    float glint = smoothstep(0.58, 0.74, n);
    col = mix(uDeep * 0.78, uDeep, bank);
    col = mix(col, uLight, glint * 0.55 * bank);
    // espuma que va y viene en las dos orillas
    float edge = (1.0 - smoothstep(0.0, 0.16, uv.y)) + (1.0 - smoothstep(0.0, 0.16, 1.0 - uv.y));
    float foam = edge * (0.55 + 0.45 * sin(px.x * 0.07 + t * 2.4));
    col = mix(col, vec3(1.0), clamp(foam * 0.4, 0.0, 0.4));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const rgb = (c: number) => ({ x: ((c >> 16) & 255) / 255, y: ((c >> 8) & 255) / 255, z: (c & 255) / 255 });

/**
 * Crea el río animado en (x, y, w, h). Devuelve null si el navegador no usa WebGL
 * (entonces se queda el río dibujado de siempre).
 */
export function riverShader(
  scene: Phaser.Scene,
  theme: ArenaTheme,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Shader | null {
  if (scene.renderer.type !== Phaser.WEBGL) return null;
  const key = `river_${theme.liquid}_${theme.river.toString(16)}`;
  if (!scene.cache.shader.has(key)) {
    scene.cache.shader.add(
      key,
      new Phaser.Display.BaseShader(key, FRAG, undefined, {
        uDeep: { type: '3f', value: rgb(theme.river) },
        uLight: { type: '3f', value: rgb(theme.riverLight) },
        uLava: { type: '1f', value: theme.liquid === 'lava' ? 1 : 0 },
      }),
    );
  }
  try {
    return scene.add.shader(key, x, y, w, h).setOrigin(0, 0);
  } catch (e) {
    console.warn('[river] sin shader:', e);
    return null;
  }
}
