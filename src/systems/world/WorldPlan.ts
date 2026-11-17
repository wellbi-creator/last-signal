import { createTerrainSampler, generateTerrainGrid } from './terrain.ts';
import type { TerrainGrid, TerrainSampler } from './terrain.ts';
import type { WorldGenParams } from './worldData.ts';

/**
 * План мира: данные, которые считаются один раз на seed и затем только читаются.
 * Чанки не зависят друг от друга: каждый берёт свой фрагмент плана.
 *
 * Сейчас (M1.3) план содержит базовое поле рельефа. Точки интереса и тропы добавятся
 * в M1.6 и M1.7 как новые поля плана, без изменения чтения чанков.
 */
export interface WorldPlan {
  /** Числовой seed мира. */
  readonly worldSeed: number;
  readonly params: WorldGenParams;
  /** Базовое поле: тайлы и биомы всего мира (индекс `worldTileIndex`). */
  readonly base: TerrainGrid;
  /** Расчёт рельефа одной клетки. Результат совпадает с `base` (проверяется тестом). */
  readonly sampler: TerrainSampler;
}

export function createWorldPlan(worldSeed: number, params: WorldGenParams): WorldPlan {
  return {
    worldSeed,
    params,
    base: generateTerrainGrid(worldSeed, params),
    sampler: createTerrainSampler(worldSeed, params),
  };
}
