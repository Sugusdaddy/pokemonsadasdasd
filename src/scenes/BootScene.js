import { W, H, ASSETS_ROOT, COLORS, FONT, TITLE, ARENAS } from '../config.js';
import { resolveAll } from '../data/cards.js';
import { Profile } from '../meta/Profile.js';
import { Sfx } from '../systems/Sfx.js';
import {
  setMeta, guardianNeeds, queuePortraits, createAnims,
  createTowerTextures, createBallTextures, createIconTextures, createDecoTextures,
} from '../systems/Assets.js';

/** Carga los metadatos del pack, el perfil y los retratos (Idle) de todas las cartas. */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.cameras.main.setBackgroundColor('#0d1024');
    this.add.text(W / 2, H / 2 - 140, TITLE, { fontFamily: FONT, fontSize: '72px', color: '#ffd84a', stroke: '#14122b', strokeThickness: 10 }).setOrigin(0.5);
    this.label = this.add.text(W / 2, H / 2 - 40, 'Cargando metadatos…', { fontFamily: FONT, fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    this.bar = this.add.graphics();
    this.load.on('progress', (v) => this.drawBar(v));
    this.load.on('loaderror', (file) => {
      console.error('No se pudo cargar:', file.src);
      if (file.key === 'meta') this.fail();
    });
    this.load.json('meta', ASSETS_ROOT + 'animations_metadata.json');
  }

  drawBar(v) {
    this.bar.clear();
    this.bar.fillStyle(COLORS.panel).fillRoundedRect(W / 2 - 220, H / 2, 440, 26, 10);
    this.bar.fillStyle(COLORS.elixir).fillRoundedRect(W / 2 - 220, H / 2, Math.max(16, 440 * v), 26, 10);
  }

  fail() {
    this.failed = true;
    this.label.setText(
      'No encuentro los sprites.\n\nCopia tu carpeta SpritesPokemon dentro de\n"assets/" y abre el juego con un servidor\nlocal (mira el README).',
    ).setFontSize(24).setAlign('center');
  }

  async create() {
    if (this.failed) return;
    const metaData = this.cache.json.get('meta');
    if (!metaData) return this.fail();
    setMeta(metaData);
    try { await Promise.race([document.fonts.load(`28px ${FONT}`), new Promise((r) => setTimeout(r, 1500))]); } catch (_) { /* sin fuente */ }

    let cards;
    try {
      cards = resolveAll(metaData);
    } catch (err) {
      this.label.setText(`Error en las cartas:\n${err.message}`).setFontSize(22).setAlign('center');
      throw err;
    }
    Profile.init();
    Sfx.configure(Profile.d.settings);

    const ids = new Set(cards.map((c) => c.pokemon));
    guardianNeeds().ids.forEach((i) => ids.add(i));
    ARENAS.forEach((a) => ids.add(a.star));
    this.portraitIds = [...ids];
    this.label.setText(`Cargando ${this.portraitIds.length} Pokémon…`);
    queuePortraits(this, this.portraitIds);
    this.load.once('complete', () => {
      createAnims(this, this.portraitIds);
      createTowerTextures(this);
      createBallTextures(this);
      createIconTextures(this);
      createDecoTextures(this);
      this.scene.start('Lobby', { tab: 'battle' });
    });
    this.load.start();
  }
}
