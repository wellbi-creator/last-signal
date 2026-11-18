import { CHUNK_SIZE, WORLD_CHUNKS, WORLD_TILES } from '../../src/config.ts';
import { hashInts } from '../../src/core/Rng.ts';
import { loadObjectsData, findObjectType } from '../../src/systems/world/objectData.ts';
import { generateChunk } from '../../src/systems/world/ChunkGenerator.ts';
import { createWorldPlan } from '../../src/systems/world/WorldPlan.ts';
import type { WorldPlan } from '../../src/systems/world/WorldPlan.ts';
import type { WorldObject } from '../../src/systems/world/types.ts';
import { loadWorldGenParams } from '../../src/systems/world/worldData.ts';

/** Вспомогательные функции тестов расстановки объектов (не тест: имя без .test). */

export const data = loadObjectsData();
export const params = loadWorldGenParams();

/** Seed номер i тестового набора. */
export function testSeed(i: number): number {
  return hashInts(i, 991);
}

export interface TestWorld {
  readonly plan: WorldPlan;
  /** Объекты по чанкам: индекс cy·8 + cx. */
  readonly chunks: readonly WorldObject[][];
  /** Все объекты мира в порядке чанков. */
  readonly all: readonly WorldObject[];
}

const cache = new Map<number, TestWorld>();

/** Мир тестового seed (кэшируется: генерация плана — самая дорогая часть). */
export function worldFor(i: number): TestWorld {
  const cached = cache.get(i);
  if (cached) return cached;
  const plan = createWorldPlan(testSeed(i), params);
  const chunks: WorldObject[][] = [];
  const all: WorldObject[] = [];
  for (let cy = 0; cy < WORLD_CHUNKS; cy++) {
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
      const objects = generateChunk(plan, cx, cy).objects;
      chunks.push(objects);
      all.push(...objects);
    }
  }
  const world = { plan, chunks, all };
  cache.set(i, world);
  return world;
}

export interface Footprint {
  readonly w: number;
  readonly h: number;
  readonly blocks: boolean;
}

export function footprintOf(type: string): Footprint {
  const found = findObjectType(data, type);
  if (!found) throw new Error(`неизвестный тип ${type}`);
  return { w: found.def.w, h: found.def.h, blocks: found.layer.blocks };
}

/** Индексы клеток мира, занятых объектом. */
export function cellsOf(object: WorldObject): number[] {
  const f = footprintOf(object.type);
  const cells: number[] = [];
  for (let dy = 0; dy < f.h; dy++) {
    for (let dx = 0; dx < f.w; dx++) cells.push((object.y + dy) * WORLD_TILES + object.x + dx);
  }
  return cells;
}

export function chunkOfTile(tile: number): number {
  return Math.floor(tile / CHUNK_SIZE);
}
