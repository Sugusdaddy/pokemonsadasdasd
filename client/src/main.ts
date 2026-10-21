import Phaser from 'phaser';
import { W, H } from '@arena/shared';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { BallOpenScene } from './scenes/BallOpenScene';
import { BattleScene } from './scenes/BattleScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d1024',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  input: { activePointers: 2 },
  scene: [BootScene, LobbyScene, BallOpenScene, BattleScene],
});

// para depurar desde la consola
(window as unknown as { __game: Phaser.Game }).__game = game;
