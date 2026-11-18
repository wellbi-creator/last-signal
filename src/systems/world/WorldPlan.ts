import { hashInts } from '../../core/Rng.ts';
import { createFbm } from './noise.ts';
import type { Field2 } from './noise.ts';
import { loadObjectsData } from './objectData.ts';
import type { ObjectsData } from './objectData.ts';
import { SALT } from './salts.ts';
import { planStarterObjects } from './starter.ts';
import type { StarterObject } from './starter.ts';
import { createTerrainSampler, generateTerrainGrid } from './terrain.ts';
import type { TerrainGrid, TerrainSampler } from './terrain.ts';
import type { WorldGenParams } from './worldData.ts';

/**
 * План мира: данные, которые считаются один раз на seed и затем только читаются.
 * Чанки не зависят друг от друга: каждый берёт свой фрагмент плана.
 *
 * Сейчас (M1.5) план содержит базовое поле рельефа, данные и поле кластеров расстановки
 * объектов и список стартовых объектов. Точки интереса и тропы добавятся в M1.6 и M1.7 как
 * новые поля плана (в том числе маска занятых ими клеток), без изменения чтения чанков.
 */
export interface WorldPlan {
  /** Числовой seed мира. */
  readonly worldSeed: number;
  readonly params: WorldGenParams;
  /** Базовое поле: тайлы и биомы всего мира (индекс `worldTileIndex`). */
  readonly base: TerrainGrid;
  /** Расчёт рельефа одной клетки. Результат совпадает с `base` (проверяется тестом). */
  readonly sampler: TerrainSampler;
  /** Данные расстановки объектов (objects.json). */
  readonly objects: ObjectsData;
  /** Низкочастотное поле кластеров 0…1 (поляны и чащи); аргументы — координаты / scale. */
  readonly clusterField: Field2;
  /** Гарантированные объекты вокруг старта (порядок фиксирован). */
  readonly starter: readonly StarterObject[];
}

export function createWorldPlan(
  worldSeed: number,
  params: WorldGenParams,
  objects: ObjectsData = loadObjectsData(),
): WorldPlan {
  const base = generateTerrainGrid(worldSeed, params);
  return {
    worldSeed,
    params,
    base,
    sampler: createTerrainSampler(worldSeed, params),
    objects,
    clusterField: createFbm(hashInts(worldSeed, SALT.CLUSTER), objects.cluster.octaves),
    starter: planStarterObjects(worldSeed, base.tiles, objects),
  };
}
