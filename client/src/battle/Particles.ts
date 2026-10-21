import Phaser from 'phaser';
import type { ArenaTheme } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  PARTÍCULAS DE LA BATALLA (solo visuales: no tocan la simulación).
//  Pocos emisores fijos que "explotan" donde hace falta, con un tope de partículas
//  vivas para que el rendimiento no dependa de lo movida que esté la partida.
// ─────────────────────────────────────────────────────────────

/** Capas: suelo (bajo las unidades), aire (encima) y ambiente (encima, sin tapar el HUD). */
export const FX_DEPTH = { decal: 3, ground: 4, air: 3150, flash: 3160, ambient: 3400, vignette: 4000 } as const;

type Canvas2D = CanvasRenderingContext2D;

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Canvas2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

/** Degradado radial de un color con transparencia hacia fuera. */
function radial(c: Canvas2D, cx: number, cy: number, r: number, stops: Array<[number, string]>): void {
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Texturas suaves de los efectos (se dibujan una vez por partida, son pequeñas). */
export function createFxTextures(scene: Phaser.Scene): void {
  canvasTex(scene, 'fx_soft', 64, 64, (c) =>
    radial(c, 32, 32, 32, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.75)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  canvasTex(scene, 'fx_smoke', 64, 64, (c) => {
    // nube: varios círculos suaves superpuestos
    for (const [x, y, r] of [
      [32, 34, 24],
      [22, 28, 16],
      [42, 26, 15],
      [30, 22, 14],
    ])
      radial(c, x, y, r, [
        [0, 'rgba(255,255,255,0.75)'],
        [0.6, 'rgba(255,255,255,0.4)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
  });
  canvasTex(scene, 'fx_shadow', 64, 64, (c) =>
    radial(c, 32, 32, 32, [
      [0, 'rgba(0,0,0,0.85)'],
      [0.55, 'rgba(0,0,0,0.55)'],
      [1, 'rgba(0,0,0,0)'],
    ]),
  );
  canvasTex(scene, 'fx_vignette', 256, 256, (c) =>
    radial(c, 128, 128, 182, [
      [0, 'rgba(0,0,0,0)'],
      [0.62, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.55)'],
    ]),
  );
}

/** Ambiente de cada arena: hojas, polvo, almas, nieve, ascuas o destellos. */
const AMBIENT: Record<ArenaTheme['deco'], { tint: number[]; key: string; up: boolean; size: [number, number] }> = {
  tree: { tint: [0x7fc04a, 0xa8d65a, 0x5f9a3a], key: 'fx_px', up: false, size: [0.5, 0.9] },
  rock: { tint: [0xd8c8b0, 0xbfae96], key: 'fx_soft', up: false, size: [0.06, 0.12] },
  grave: { tint: [0xb59cff, 0x8ff7ec], key: 'fx_soft', up: true, size: [0.1, 0.2] },
  ice: { tint: [0xffffff, 0xe6f6ff], key: 'fx_soft', up: false, size: [0.08, 0.16] },
  lava: { tint: [0xffb347, 0xff6a1f, 0xffd36a], key: 'fx_soft', up: true, size: [0.06, 0.13] },
  pillar: { tint: [0xffd84a, 0xfff1b8], key: 'fx_soft', up: true, size: [0.05, 0.1] },
};

export class BattleParticles {
  private dustE: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkE: Phaser.GameObjects.Particles.ParticleEmitter;
  private emberE: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeE: Phaser.GameObjects.Particles.ParticleEmitter;
  private chunkE: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambientE: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  /** Multiplicador de cantidad (calidad gráfica; 1 = normal). */
  amount = 1;

  constructor(private readonly scene: Phaser.Scene) {
    createFxTextures(scene);
    const add = (key: string, depth: number, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) =>
      scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(depth);
    // polvo al desplegar y al caer cosas: bajo y ancho
    this.dustE = add('fx_smoke', FX_DEPTH.ground, {
      speed: { min: 40, max: 130 },
      angle: { min: 0, max: 360 },
      scaleX: { start: 0.45, end: 0.95 },
      scaleY: { start: 0.3, end: 0.6 },
      alpha: { start: 0.55, end: 0 },
      lifespan: { min: 420, max: 700 },
      gravityY: -20,
      maxAliveParticles: 160,
    });
    // chispas que saltan y caen
    this.sparkE = add('fx_soft', FX_DEPTH.air, {
      speed: { min: 140, max: 360 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 1, end: 0.2 },
      lifespan: { min: 220, max: 480 },
      gravityY: 520,
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 260,
    });
    // ascuas que suben despacio
    this.emberE = add('fx_soft', FX_DEPTH.air, {
      speed: { min: 20, max: 90 },
      angle: { min: 235, max: 305 },
      scale: { start: 0.16, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 800, max: 1500 },
      gravityY: -40,
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 160,
    });
    // humo que sube y se abre
    this.smokeE = add('fx_smoke', FX_DEPTH.air - 1, {
      speed: { min: 20, max: 65 },
      angle: { min: 245, max: 295 },
      scale: { start: 0.7, end: 2.3 },
      alpha: { start: 0.75, end: 0 },
      lifespan: { min: 1200, max: 2100 },
      rotate: { min: -40, max: 40 },
      maxAliveParticles: 120,
    });
    // trozos (piedras, hielo...) con giro
    this.chunkE = add('fx_px', FX_DEPTH.air, {
      speed: { min: 120, max: 300 },
      angle: { min: 200, max: 340 },
      scale: { min: 0.6, max: 1.5 },
      alpha: { start: 1, end: 0.6 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 500, max: 800 },
      gravityY: 700,
      maxAliveParticles: 120,
    });
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.amount));
  }

  dust(x: number, y: number, count = 10, tint = 0xd8cbb4): void {
    this.dustE.setParticleTint(tint).explode(this.n(count), x, y);
  }

  sparks(x: number, y: number, count = 8, tint = 0xffffff): void {
    this.sparkE.setParticleTint(tint).explode(this.n(count), x, y);
  }

  embers(x: number, y: number, count = 10, tint = 0xffa040, spread = 0): void {
    for (let i = 0; i < this.n(count); i++)
      this.emberE
        .setParticleTint(tint)
        .explode(1, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.5);
  }

  smoke(x: number, y: number, count = 6, tint = 0x5b5f73, spread = 0): void {
    for (let i = 0; i < this.n(count); i++)
      this.smokeE
        .setParticleTint(tint)
        .explode(1, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.4);
  }

  chunks(x: number, y: number, count = 10, tint = 0x8f91a0): void {
    this.chunkE.setParticleTint(tint).explode(this.n(count), x, y);
  }

  /** Destello de luz (suma de color) que crece y se apaga. */
  flash(x: number, y: number, color: number, size: number, duration = 260): void {
    const f = this.scene.add
      .image(x, y, 'fx_soft')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(FX_DEPTH.flash)
      .setDisplaySize(size * 0.5, size * 0.5)
      .setAlpha(0.95);
    this.scene.tweens.add({
      targets: f,
      displayWidth: size,
      displayHeight: size,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => f.destroy(),
    });
  }

  /** Mancha de quemado en el suelo. Se borra sola salvo `persist` (torres caídas). */
  scorch(x: number, y: number, r: number, persist = false): void {
    const d = this.scene.add
      .image(x, y, 'fx_shadow')
      .setTint(0x1a1008)
      .setDepth(FX_DEPTH.decal)
      .setDisplaySize(r * 2, r * 1.3)
      .setAlpha(0);
    this.scene.tweens.add({ targets: d, alpha: persist ? 0.55 : 0.45, duration: 120 });
    if (!persist)
      this.scene.tweens.add({ targets: d, alpha: 0, delay: 2500, duration: 1800, onComplete: () => d.destroy() });
  }

  /**
   * Partículas de ambiente de la arena sobre todo el campo (W×H en coordenadas del mundo).
   * Se generan a ritmo lento y constante.
   */
  ambient(theme: ArenaTheme, x: number, y: number, w: number, h: number): void {
    const a = AMBIENT[theme.deco];
    this.ambientE?.destroy();
    this.ambientE = this.scene.add
      .particles(0, 0, a.key, {
        x: { min: x, max: x + w },
        y: a.up ? { min: y + h * 0.2, max: y + h } : { min: y - 40, max: y + h * 0.6 },
        speedY: a.up ? { min: -45, max: -15 } : { min: 18, max: 55 },
        speedX: { min: -20, max: 20 },
        scale: { min: a.size[0] * (a.key === 'fx_px' ? 1 : 2), max: a.size[1] * (a.key === 'fx_px' ? 1 : 2) },
        alpha: { start: 0.85, end: 0 },
        rotate: a.key === 'fx_px' ? { min: 0, max: 360 } : 0,
        tint: a.tint,
        lifespan: { min: 3500, max: 6000 },
        frequency: Math.round(260 / Math.max(0.25, this.amount)),
        blendMode: theme.deco === 'tree' || theme.deco === 'rock' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD,
        maxAliveParticles: 40,
      })
      .setDepth(FX_DEPTH.ambient);
  }

  destroy(): void {
    for (const e of [this.dustE, this.sparkE, this.emberE, this.smokeE, this.chunkE, this.ambientE]) e?.destroy();
  }
}
