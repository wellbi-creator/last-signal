import type Phaser from 'phaser';
import type { Core } from '../core/Core.ts';

/** Под этим ключом ядро лежит в реестре Phaser (общем для всех сцен). */
export const CORE_REGISTRY_KEY = 'core';

/** Возвращает ядро текущей сессии. Бросает понятную ошибку, если BootScene ещё не создала его. */
export function getCore(scene: Phaser.Scene): Core {
  const core = scene.registry.get(CORE_REGISTRY_KEY) as Core | undefined;
  if (!core) {
    throw new Error('Ядро игры не создано: сцена Boot должна запускаться первой');
  }
  return core;
}
