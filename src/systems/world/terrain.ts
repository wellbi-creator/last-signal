import { WORLD_TILES } from '../../config.ts';
import { hashInts } from '../../core/Rng.ts';
import { SALT } from './salts.ts';
import { createFbm } from './noise.ts';
import type { WorldGenParams } from './worldData.ts';
import { Biome, Tile } from './types.ts';
import type { BiomeId, TileId } from './types.ts';

/**
 * Рельеф мира: высота, влажность, биом и тайл клетки.
 *
 * Всё — чистые функции от (worldSeed, tx, ty) и параметров: соседние клетки и чанки не нужны,
 * поэтому на границах чанков швов нет, а результат не зависит от порядка генерации.
 * Только точная арифметика (решение D2). Подробности: docs/M1_PLAN.md, раздел 4.
 */

/** Центр мира в тайлах (мир 256×256, центр между клетками 127 и 128). */
const CENTER = WORLD_TILES / 2;

/** Сглаженный переход 0→1 между a и b (полином t²(3 − 2t), без корней и степеней). */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface TerrainFields {
  /** Высота 0…1 (после контраста, края мира и стартовой зоны; может выходить за 0…1 у края). */
  readonly elevation: number;
  /** Влажность 0…1. */
  readonly moisture: number;
}

export interface TerrainCell {
  readonly tile: TileId;
  readonly biome: BiomeId;
}

export interface TerrainSampler {
  /** Поля высоты и влажности клетки (tx, ty). */
  fields(tx: number, ty: number): TerrainFields;
  /** Тайл и биом клетки (tx, ty). */
  cell(tx: number, ty: number): TerrainCell;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Классификация по порядку, первое совпадение (раздел 4.2 плана). */
export function classifyTerrain(
  elevation: number,
  moisture: number,
  params: WorldGenParams,
): TerrainCell {
  const t = params.thresholds;
  if (elevation < t.water) return { tile: Tile.Water, biome: Biome.Water };
  if (elevation < t.sand) return { tile: Tile.Sand, biome: Biome.Coast };
  if (elevation > t.rock) return { tile: Tile.Stone, biome: Biome.Rocks };
  if (moisture > t.swamp.moisture && elevation < t.swamp.maxElevation) {
    return { tile: Tile.Mud, biome: Biome.Swamp };
  }
  if (moisture > t.forestMoisture) return { tile: Tile.Forest, biome: Biome.Forest };
  return { tile: Tile.Grass, biome: Biome.Plains };
}

/** Создаёт расчёт рельефа для мира: seed полей выводятся один раз (hashInts + salt). */
export function createTerrainSampler(worldSeed: number, params: WorldGenParams): TerrainSampler {
  const elevationNoise = createFbm(hashInts(worldSeed, SALT.ELEVATION), params.elevation.octaves);
  const moistureNoise = createFbm(hashInts(worldSeed, SALT.MOISTURE), params.moisture.octaves);
  const { contrast, edge, start } = params;
  const blendSpan = start.blendRadius * start.blendRadius - start.safeRadius * start.safeRadius;
  const blendOuter = start.blendRadius * start.blendRadius;

  function fields(tx: number, ty: number): TerrainFields {
    // Центр клетки: поле непрерывно по мировым координатам.
    const x = tx + 0.5;
    const y = ty + 0.5;
    let e = elevationNoise(x / params.elevation.scale, y / params.elevation.scale);
    let m = moistureNoise(x / params.moisture.scale, y / params.moisture.scale);
    e = clamp01(0.5 + (e - 0.5) * contrast);
    m = clamp01(0.5 + (m - 0.5) * contrast);

    // Край мира: кольцо моря у границы конечной карты.
    const d = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) / CENTER;
    e -= edge.strength * smoothstep(edge.from, edge.to, d);

    // Стартовая зона: гарантированная равнина внутри safeRadius, плавный переход до blendRadius.
    const r2 = (x - CENTER) * (x - CENTER) + (y - CENTER) * (y - CENTER);
    const w = smoothstep(0, 1, (blendOuter - r2) / blendSpan);
    e += (start.elevation - e) * w;
    m += (start.moisture - m) * w;
    return { elevation: e, moisture: m };
  }

  return {
    fields,
    cell(tx, ty) {
      const f = fields(tx, ty);
      return classifyTerrain(f.elevation, f.moisture, params);
    },
  };
}

export interface TerrainGrid {
  /** Тайлы всего мира, по строкам: индекс `worldTileIndex(tx, ty)`. */
  readonly tiles: Uint8Array;
  /** Биомы всего мира в том же порядке. */
  readonly biomes: Uint8Array;
}

/** Базовое поле всего мира (256×256). Порядок обхода фиксирован: по строкам, y затем x. */
export function generateTerrainGrid(worldSeed: number, params: WorldGenParams): TerrainGrid {
  const sampler = createTerrainSampler(worldSeed, params);
  const tiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
  const biomes = new Uint8Array(WORLD_TILES * WORLD_TILES);
  for (let ty = 0; ty < WORLD_TILES; ty++) {
    for (let tx = 0; tx < WORLD_TILES; tx++) {
      const cell = sampler.cell(tx, ty);
      const index = ty * WORLD_TILES + tx;
      tiles[index] = cell.tile;
      biomes[index] = cell.biome;
    }
  }
  return { tiles, biomes };
}
