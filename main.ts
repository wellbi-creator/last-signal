import Phaser from 'phaser';
import { COLORS } from './config.ts';
import { installPlatformGuards } from './platform.ts';
import { BootScene } from './scenes/BootScene.ts';
import { MainMenuScene } from './scenes/MainMenuScene.ts';

installPlatformGuards();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  // Пиксель-арт: без сглаживания текстур и с целыми координатами при отрисовке.
  pixelArt: true,
  roundPixels: true,
  banner: false,
  disableContextMenu: true,
  scale: {
    // Холст заполняет контейнер #game и подстраивается при повороте экрана и изменении окна.
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  input: {
    activePointers: 3, // мультитач: джойстик одним пальцем и кнопки другим
  },
  scene: [BootScene, MainMenuScene],
});
