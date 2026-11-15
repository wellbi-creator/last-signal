import Phaser from 'phaser';
import { createCore } from '../core/Core.ts';
import { CORE_REGISTRY_KEY } from './coreAccess.ts';
import { SCENE_KEYS } from './keys.ts';

/** Seed демонстрационного мира M0. Используется только для проверки каркаса. */
export const DEMO_SEED = 'M0-DEMO';

/**
 * Первая сцена: убирает экран «Загрузка…», создаёт ядро и передаёт управление меню.
 * В следующих этапах здесь появится загрузка текстур и данных.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  create(): void {
    document.getElementById('boot-message')?.remove();
    this.registry.set(CORE_REGISTRY_KEY, createCore({ worldSeed: DEMO_SEED }));
    this.scene.start(SCENE_KEYS.MainMenu);
  }
}
