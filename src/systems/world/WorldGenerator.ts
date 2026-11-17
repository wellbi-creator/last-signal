import { WORLD_CHUNKS, WORLD_GEN_VERSION } from '../../config.ts';
import { sanitizeSeedText, worldSeedToNumber } from '../../core/Seed.ts';
import { generateChunk } from './ChunkGenerator.ts';
import { hashWorld } from './checksum.ts';
import { createWorldPlan } from './WorldPlan.ts';
import type { WorldPlan } from './WorldPlan.ts';
import { loadWorldGenParams } from './worldData.ts';
import type { WorldGenParams } from './worldData.ts';
import type { Chunk } from './types.ts';

/** Всё, что нужно ChunkManager от генератора: чистая функция чанка. */
export interface ChunkSource {
  generateChunk(cx: number, cy: number): Chunk;
}

/**
 * Фасад генерации мира: seed → план → чанки. Состояния, меняющегося при генерации, нет:
 * `generateChunk` — чистая функция, повторный вызов даёт равный результат.
 */
export class WorldGenerator implements ChunkSource {
  /** Очищенный текст seed. */
  readonly seedText: string;
  /** Числовой seed мира. */
  readonly seed: number;
  readonly worldGenVersion = WORLD_GEN_VERSION;
  private readonly plan: WorldPlan;

  constructor(seedText: string, params: WorldGenParams = loadWorldGenParams()) {
    this.seedText = sanitizeSeedText(seedText);
    this.seed = worldSeedToNumber(seedText);
    this.plan = createWorldPlan(this.seed, params);
  }

  generateChunk(cx: number, cy: number): Chunk {
    return generateChunk(this.plan, cx, cy);
  }

  /** Хеш всего мира: для сверки ПК и iPhone. Генерирует все чанки без кэша. */
  worldHash(): string {
    const chunks: Chunk[] = [];
    for (let cy = 0; cy < WORLD_CHUNKS; cy++) {
      for (let cx = 0; cx < WORLD_CHUNKS; cx++) chunks.push(this.generateChunk(cx, cy));
    }
    return hashWorld(this.worldGenVersion, this.seed, chunks);
  }
}
