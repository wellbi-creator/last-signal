import Phaser from 'phaser';
import { createCore } from '../core/Core.ts';
import { CORE_REGISTRY_KEY } from '../coreAccess.ts';
import { SCENE_KEYS } from '../keys.ts';
import { createObjectTextures } from '../view/objectTextures.ts';
import { createPlaceholderTextures } from '../view/placeholderTextures.ts';

/** Seed демонстрационного мира M0. Используется только для проверки каркаса. */
export const DEMO_SEED = 'M0-DEMO';

/**
 * Первая сцена: убирает экран «Загрузка…», создаёт ядро и передаёт управление меню.
 * Также рисует временные текстуры тайлов и объектов (M1; финальный арт — M7).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  create(): void {
    document.getElementById('boot-message')?.remove();
    createPlaceholderTextures(this.textures);
    createObjectTextures(this.textures);
    this.registry.set(CORE_REGISTRY_KEY, createCore({ worldSeed: DEMO_SEED }));
    this.scene.start(SCENE_KEYS.MainMenu);
  }
}
