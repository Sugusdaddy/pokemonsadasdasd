import { W, H } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { BallOpenScene } from './scenes/BallOpenScene.js';
import { BattleScene } from './scenes/BattleScene.js';

window.__game = new Phaser.Game({
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
