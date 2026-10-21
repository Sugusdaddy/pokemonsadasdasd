import Phaser from 'phaser';
import { initialSize, watchLayout } from './layout';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { BallOpenScene } from './scenes/BallOpenScene';
import { BattleScene } from './scenes/BattleScene';
import { OnlineScene } from './scenes/OnlineScene';
import { TvScene } from './scenes/TvScene';
import { Sfx } from './systems/Sfx';
import { registerServiceWorker } from './systems/Install';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d1024',
  // UI y textos suavizados; los sprites de Pokémon se marcan como pixel art al cargarlos (Assets.ts)
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    ...initialSize(),
  },
  input: { activePointers: 2 },
  scene: [BootScene, LobbyScene, BallOpenScene, BattleScene, OnlineScene, TvScene],
});

watchLayout(game);
registerServiceWorker();

// para depurar desde la consola
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __sfx: typeof Sfx }).__sfx = Sfx;
