import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_CHUNKS, WORLD_GEN_VERSION, WORLD_TILES } from '../../src/config.ts';
import { hashInts } from '../../src/core/Rng.ts';
import { generateChunk } from '../../src/systems/world/ChunkGenerator.ts';
import { hashChunk, hashWorld } from '../../src/systems/world/checksum.ts';
import { GOLDEN_WORLD_HASHES, goldenHashFor } from '../../src/systems/world/goldenHashes.ts';
import { createWorldPlan } from '../../src/systems/world/WorldPlan.ts';
import { WorldGenerator } from '../../src/systems/world/WorldGenerator.ts';
import type { Chunk } from '../../src/systems/world/types.ts';
import { loadWorldGenParams } from '../../src/systems/world/worldData.ts';

const params = loadWorldGenParams();

function allChunks(gen: WorldGenerator, order: ReadonlyArray<readonly [number, number]>): Chunk[] {
  return order.map(([cx, cy]) => gen.generateChunk(cx, cy));
}

function rowMajor(): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let cy = 0; cy < WORLD_CHUNKS; cy++)
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) result.push([cx, cy]);
  return result;
}

function byCoords(chunks: Chunk[]): Chunk[] {
  return chunks.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
}

describe('generateChunk: координаты и границы', () => {
  const plan = createWorldPlan(hashInts(5, 5), params);

  it('чанк (cx, cy) содержит ровно свои тайлы: совпадает с планом по мировым координатам', () => {
    for (const [cx, cy] of rowMajor()) {
      const chunk = generateChunk(plan, cx, cy);
      expect([chunk.cx, chunk.cy]).toEqual([cx, cy]);
      expect(chunk.tiles).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
      expect(chunk.biomes).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
      expect(chunk.objects).toEqual([]);
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const world = (cy * CHUNK_SIZE + ly) * WORLD_TILES + cx * CHUNK_SIZE + lx;
          expect(chunk.tiles[ly * CHUNK_SIZE + lx]).toBe(plan.base.tiles[world]);
          expect(chunk.biomes[ly * CHUNK_SIZE + lx]).toBe(plan.base.biomes[world]);
        }
      }
    }
  });

  it('нет пропусков и дублей: каждая клетка мира принадлежит ровно одному чанку', () => {
    const visits = new Uint8Array(WORLD_TILES * WORLD_TILES);
    for (const [cx, cy] of rowMajor()) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const index = (cy * CHUNK_SIZE + ly) * WORLD_TILES + cx * CHUNK_SIZE + lx;
          visits[index] = (visits[index] ?? 0) + 1;
        }
      }
    }
    expect(visits.every((n) => n === 1)).toBe(true);
  });

  it('на границах чанков значения совпадают с прямым расчётом рельефа клетки (швов нет)', () => {
    for (const [cx, cy] of rowMajor()) {
      const chunk = generateChunk(plan, cx, cy);
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const edges: Array<[number, number]> = [
          [0, i],
          [CHUNK_SIZE - 1, i],
          [i, 0],
          [i, CHUNK_SIZE - 1],
        ];
        for (const [lx, ly] of edges) {
          const cell = plan.sampler.cell(cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly);
          expect(chunk.tiles[ly * CHUNK_SIZE + lx]).toBe(cell.tile);
          expect(chunk.biomes[ly * CHUNK_SIZE + lx]).toBe(cell.biome);
        }
      }
    }
  });

  it('чанк не ссылается на план: изменение чанка не портит последующую генерацию', () => {
    const a = generateChunk(plan, 3, 3);
    const before = hashChunk(a);
    a.tiles.fill(7);
    a.biomes.fill(7);
    a.objects.push({ id: 'x', type: 'x', x: 0, y: 0 });
    const b = generateChunk(plan, 3, 3);
    expect(hashChunk(b)).toBe(before);
    expect(b.objects).toEqual([]);
  });

  it('отвергает чанки вне мира и нецелые координаты', () => {
    expect(() => generateChunk(plan, -1, 0)).toThrow(RangeError);
    expect(() => generateChunk(plan, 0, WORLD_CHUNKS)).toThrow(RangeError);
    expect(() => generateChunk(plan, 1.5, 0)).toThrow(RangeError);
    expect(() => generateChunk(plan, Number.NaN, 0)).toThrow(RangeError);
  });
});

describe('WorldGenerator: независимость и детерминизм', () => {
  const gen = new WorldGenerator('M0-DEMO');

  it('чанк, сгенерированный отдельно, равен чанку из полного обхода', () => {
    const full = allChunks(gen, rowMajor());
    for (const [cx, cy] of [
      [0, 0],
      [7, 7],
      [3, 5],
      [5, 3],
    ] as const) {
      const alone = gen.generateChunk(cx, cy);
      const fromFull = full[cy * WORLD_CHUNKS + cx];
      expect(fromFull === undefined).toBe(false);
      expect(hashChunk(alone)).toBe(hashChunk(fromFull as Chunk));
    }
  });

  it('любой порядок генерации даёт тот же хеш мира (прямой, обратный, перемешанный)', () => {
    const base = rowMajor();
    const reference = gen.worldHash();
    const orders = [
      base.slice().reverse(),
      base.slice().sort((a, b) => hashInts(1, a[0], a[1]) - hashInts(1, b[0], b[1])),
      base.slice().sort((a, b) => hashInts(2, a[0], a[1]) - hashInts(2, b[0], b[1])),
    ];
    for (const order of orders) {
      const chunks = byCoords(allChunks(gen, order));
      expect(hashWorld(WORLD_GEN_VERSION, gen.seed, chunks)).toBe(reference);
    }
  });

  it('два генератора с одним seed дают одинаковый мир; разные seed — разный', () => {
    expect(new WorldGenerator('M0-DEMO').worldHash()).toBe(gen.worldHash());
    expect(new WorldGenerator('M0-DEMP').worldHash()).not.toBe(gen.worldHash());
  });

  it('текст seed очищается так же, как в M0: лишние пробелы не меняют мир', () => {
    const spaced = new WorldGenerator('  M0-DEMO ');
    expect(spaced.seedText).toBe('M0-DEMO');
    expect(spaced.seed).toBe(gen.seed);
    expect(spaced.worldHash()).toBe(gen.worldHash());
  });

  it('хеш мира имеет 16 шестнадцатеричных знаков и версию генератора', () => {
    expect(gen.worldHash()).toMatch(/^[0-9a-f]{16}$/);
    expect(gen.worldGenVersion).toBe(WORLD_GEN_VERSION);
  });

  it('«золотые» хеши мира фиксируют генерацию (меняются только вместе с WORLD_GEN_VERSION)', () => {
    const actual: Record<string, string> = {};
    for (const seed of Object.keys(GOLDEN_WORLD_HASHES))
      actual[seed] = new WorldGenerator(seed).worldHash();
    expect(actual).toEqual(GOLDEN_WORLD_HASHES);
  });

  it('goldenHashFor: находит эталон только для известных seed', () => {
    expect(goldenHashFor('M0-DEMO')).toBe(GOLDEN_WORLD_HASHES['M0-DEMO']);
    expect(goldenHashFor('неизвестный')).toBeUndefined();
    expect(goldenHashFor('constructor')).toBeUndefined();
  });
});
