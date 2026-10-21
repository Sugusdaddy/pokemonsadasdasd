import { W, H, COLORS, FONT, TITLE, ARENAS, cardPokemonIds } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { Sfx } from '../systems/Sfx';
import {
  setManifest,
  guardianIds,
  queueManifest,
  queuePortraits,
  createPortraitAnims,
  createTowerTextures,
  createBallTextures,
  createIconTextures,
  createDecoTextures,
  type Manifest,
} from '../systems/Assets';
import { OnlineSession } from '../net/OnlineSession';
import { BaseScene } from './BaseScene';

/** Carga el manifest de los atlas, el perfil y los retratos (Idle) de todas las cartas. */
export class BootScene extends BaseScene {
  private label!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private failed = false;

  constructor() {
    super('Boot');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#0d1024');
    this.add
      .text(W / 2, H / 2 - 140, TITLE, {
        fontFamily: FONT,
        fontSize: '72px',
        color: '#ffd84a',
        stroke: '#14122b',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.label = this.add
      .text(W / 2, H / 2 - 40, 'Cargando…', { fontFamily: FONT, fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5);
    this.bar = this.add.graphics();
    this.load.on('progress', (v: number) => this.drawBar(v));
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error('No se pudo cargar:', file.src);
      if (file.key === 'manifest') this.fail();
    });
    queueManifest(this);
  }

  private drawBar(v: number): void {
    this.bar.clear();
    this.bar.fillStyle(COLORS.panel).fillRoundedRect(W / 2 - 220, H / 2, 440, 26, 10);
    this.bar.fillStyle(COLORS.elixir).fillRoundedRect(W / 2 - 220, H / 2, Math.max(16, 440 * v), 26, 10);
  }

  private fail(): void {
    this.failed = true;
    this.label
      .setText(
        'No encuentro los sprites.\n\nCopia tu carpeta SpritesPokemon dentro de\n"assets/" y ejecuta "npm run assets"\n(mira el README).',
      )
      .setFontSize(24)
      .setAlign('center');
  }

  async create(): Promise<void> {
    if (this.failed) return;
    const manifest = this.cache.json.get('manifest') as Manifest | undefined;
    if (!manifest) return this.fail();
    setManifest(manifest);
    try {
      await Promise.race([document.fonts.load(`28px ${FONT}`), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* sin fuente */
    }

    Profile.init();
    Sfx.configure(Profile.d.settings);

    const ids = new Set<number>(cardPokemonIds());
    guardianIds().forEach((i) => ids.add(i));
    ARENAS.forEach((a) => ids.add(a.star));
    const portraitIds = [...ids];
    this.label.setText(`Cargando ${portraitIds.length} Pokémon…`);
    queuePortraits(this);
    this.load.once('complete', () => {
      createPortraitAnims(this, portraitIds);
      createTowerTextures(this);
      createBallTextures(this);
      createIconTextures(this);
      createDecoTextures(this);
      // si se recargó la página en mitad de una partida online, se vuelve a ella
      if (OnlineSession.hasActive()) this.scene.start('Online', { mode: 'resume' });
      else this.scene.start('Lobby', { tab: 'battle' });
    });
    this.load.start();
  }
}
