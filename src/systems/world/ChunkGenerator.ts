import { CHUNK_SIZE, WORLD_TILES } from '../../config.ts';
import { isChunkInWorld } from '../../core/coords.ts';
import type { WorldPlan } from './WorldPlan.ts';
import type { Chunk } from './types.ts';

/**
 * Чистая функция: чанк зависит только от плана (то есть от seed) и координат (cx, cy).
 * Ни порядок генерации, ни соседние чанки, ни время на результат не влияют.
 *
 * Чанк (cx, cy) покрывает тайлы [cx·32, cx·32+32) × [cy·32, cy·32+32). Каждая клетка мира
 * принадлежит ровно одному чанку: пропусков и дублей нет (проверяется тестом).
 * Массивы чанка — копии, а не ссылки на план: изменение чанка не портит мир.
 */
export function generateChunk(plan: WorldPlan, cx: number, cy: number): Chunk {
  if (!isChunkInWorld(cx, cy)) {
    throw new RangeError(`generateChunk: чанк (${cx}, ${cy}) вне мира`);
  }
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const originX = cx * CHUNK_SIZE;
  const originY = cy * CHUNK_SIZE;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    const from = (originY + ly) * WORLD_TILES + originX;
    tiles.set(plan.base.tiles.subarray(from, from + CHUNK_SIZE), ly * CHUNK_SIZE);
    biomes.set(plan.base.biomes.subarray(from, from + CHUNK_SIZE), ly * CHUNK_SIZE);
  }
  return { cx, cy, tiles, biomes, objects: [] };
}
