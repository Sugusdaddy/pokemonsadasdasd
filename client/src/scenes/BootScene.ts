import Phaser from 'phaser';
import { FONT, TITLE, ARENAS, cardPokemonIds } from '@arena/shared';
import { L } from '../layout';
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
import * as kit from '../ui/kit';
import { t } from '../i18n';
import { BaseScene } from './BaseScene';

/** Carga el manifest de los atlas, el perfil y los retratos (Idle) de todas las cartas. */
export class BootScene extends BaseScene {
  private label!: Phaser.GameObjects.Text;
  private bar!: kit.Bar;
  private failed = false;

  constructor() {
    super('Boot');
  }

  preload(): void {
    // las texturas de la UI se dibujan por código: ya se pueden usar en la pantalla de carga
    kit.createKitTextures(this);
    kit.menuBackground(this, L.w, L.h);
    const cy = L.h / 2;
    const logoGlow = this.add
      .image(L.w / 2, cy - 150, 'ui_glow')
      .setTint(0xffc93c)
      .setBlendMode(Phaser.BlendModes.ADD);
    logoGlow.setDisplaySize(720, 260).setAlpha(0.35);
    this.tweens.add({ targets: logoGlow, alpha: 0.15, yoyo: true, repeat: -1, duration: 1200 });
    kit.text(this, L.w / 2, cy - 150, TITLE, 'hero', '#ffd75a', { size: L.pc ? 104 : 82 });
    kit.text(this, L.w / 2, cy - 70, t('boot.tagline'), 'label', '#aab3e8', { size: 22 });
    this.bar = kit.progressBar(this, L.w / 2 - 240, cy + 10, 480, 34, kit.C.elixir, 0, '');
    this.label = kit.text(this, L.w / 2, cy + 86, t('boot.loading'), 'label', '#ffffff', { size: 24 });
    kit.text(this, L.w / 2, L.h - 40, t('boot.disclaimer'), 'body', '#5a64a8', {
      size: 15,
      wordWrap: { width: L.w - 80 },
    });
    this.load.on('progress', (v: number) => this.bar.set(v));
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error('No se pudo cargar:', file.src);
      if (file.key === 'manifest') this.fail();
    });
    queueManifest(this);
  }

  private fail(): void {
    this.failed = true;
    this.label.setText(t('boot.noSprites')).setFontSize(22).setAlign('center').setColor('#ff9aa2');
  }

  async create(): Promise<void> {
    if (this.failed) return;
    const manifest = this.cache.json.get('manifest') as Manifest | undefined;
    if (!manifest) return this.fail();
    setManifest(manifest);
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`28px ${FONT}`), document.fonts.load('600 20px Rubik')]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* sin fuente */
    }

    // la cuenta se pide al servidor mientras se cargan los retratos
    const session = Profile.init().then(
      () => null,
      (e: unknown) => e,
    );

    const ids = new Set<number>(cardPokemonIds());
    guardianIds().forEach((i) => ids.add(i));
    ARENAS.forEach((a) => ids.add(a.star));
    const portraitIds = [...ids];
    this.label.setText(t('boot.loadingN', { n: portraitIds.length }));
    queuePortraits(this);
    this.load.once('complete', async () => {
      createPortraitAnims(this, portraitIds);
      createTowerTextures(this);
      createBallTextures(this);
      createIconTextures(this);
      createDecoTextures(this);
      this.label.setText(t('boot.connecting'));
      if (await session) return this.offline();
      this.enterGame();
    });
    this.load.start();
  }

  private enterGame(): void {
    Sfx.configure(Profile.settings);
    // si se recargó la página en mitad de una partida online, se vuelve a ella
    if (OnlineSession.hasActive()) kit.goTo(this, 'Online', { mode: 'resume' });
    else kit.goTo(this, 'Lobby', { tab: 'battle' });
  }

  /** Sin servidor: reintentar o jugar una práctica contra el bot (sin recompensas). */
  private offline(): void {
    const cy = L.h / 2 + 150;
    this.label.setText(t('boot.offline')).setColor('#ff9aa2');
    kit.text(this, L.w / 2, cy - 20, t('boot.offlineBody'), 'body', '#aab3e8', {
      size: 20,
      wordWrap: { width: Math.min(640, L.w - 60) },
    });
    const retry = kit.button(this, L.w / 2 - 170, cy + 70, 300, 76, t('common.retry'), 'primary', async () => {
      retry.setDisabled(true);
      this.label.setText(t('boot.connecting')).setColor('#ffffff');
      try {
        await Profile.init();
        this.enterGame();
      } catch {
        this.label.setText(t('boot.offline')).setColor('#ff9aa2');
        retry.setDisabled(false);
      }
    });
    kit.button(this, L.w / 2 + 170, cy + 70, 300, 76, t('boot.practice'), 'neutral', () => {
      Sfx.configure(Profile.settings);
      kit.goTo(this, 'Battle', { kind: 'local' });
    });
  }
}
