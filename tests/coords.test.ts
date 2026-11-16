import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, TILE_SIZE, WORLD_CHUNKS, WORLD_PIXELS, WORLD_TILES } from '../src/config.ts';
import {
  chunkCenterWorld,
  chunkOriginTile,
  chunkRectWorld,
  chunksInRadius,
  getWorldSpawnPoint,
  isChunkInWorld,
  isPointInWorld,
  isTileInWorld,
  localTileIndex,
  tileToChunk,
  tileToLocal,
  tileToWorldCenter,
  worldToTile,
  worldTileIndex,
} from '../src/core/coords.ts';

describe('константы мира (утверждённые решения)', () => {
  it('мир 256×256 тайлов из чанков 32×32 по 32 пикселя', () => {
    expect(TILE_SIZE).toBe(32);
    expect(CHUNK_SIZE).toBe(32);
    expect(WORLD_CHUNKS).toBe(8);
    expect(WORLD_TILES).toBe(256);
    expect(WORLD_PIXELS).toBe(8192);
  });
});

describe('преобразование координат', () => {
  it('worldToTile округляет вниз, в том числе для отрицательных', () => {
    expect(worldToTile(0)).toBe(0);
    expect(worldToTile(31.99)).toBe(0);
    expect(worldToTile(32)).toBe(1);
    expect(worldToTile(-0.01)).toBe(-1);
    expect(worldToTile(-32)).toBe(-1);
    expect(worldToTile(-32.01)).toBe(-2);
  });

  it('tileToWorldCenter даёт центр тайла', () => {
    expect(tileToWorldCenter(0)).toBe(16);
    expect(tileToWorldCenter(3)).toBe(112);
  });

  it('tileToChunk и tileToLocal согласованы, включая отрицательные тайлы', () => {
    expect(tileToChunk(0)).toBe(0);
    expect(tileToChunk(31)).toBe(0);
    expect(tileToChunk(32)).toBe(1);
    expect(tileToChunk(-1)).toBe(-1);
    expect(tileToChunk(-32)).toBe(-1);
    expect(tileToChunk(-33)).toBe(-2);
    expect(tileToLocal(0)).toBe(0);
    expect(tileToLocal(31)).toBe(31);
    expect(tileToLocal(32)).toBe(0);
    expect(tileToLocal(-1)).toBe(31);
    expect(tileToLocal(-32)).toBe(0);
    for (let t = -70; t <= 70; t++) {
      expect(tileToChunk(t) * CHUNK_SIZE + tileToLocal(t)).toBe(t);
    }
  });

  it('localTileIndex нумерует тайлы по строкам и покрывает чанк без пропусков', () => {
    expect(localTileIndex(0, 0)).toBe(0);
    expect(localTileIndex(31, 0)).toBe(31);
    expect(localTileIndex(0, 1)).toBe(32);
    expect(localTileIndex(31, 31)).toBe(CHUNK_SIZE * CHUNK_SIZE - 1);
  });
});

describe('границы мира', () => {
  it('isTileInWorld', () => {
    expect(isTileInWorld(0, 0)).toBe(true);
    expect(isTileInWorld(255, 255)).toBe(true);
    expect(isTileInWorld(256, 0)).toBe(false);
    expect(isTileInWorld(0, -1)).toBe(false);
  });

  it('isPointInWorld отвергает выход за границы и нечисловые значения', () => {
    expect(isPointInWorld({ x: 0, y: 0 })).toBe(true);
    expect(isPointInWorld({ x: WORLD_PIXELS - 0.01, y: 10 })).toBe(true);
    expect(isPointInWorld({ x: WORLD_PIXELS, y: 10 })).toBe(false);
    expect(isPointInWorld({ x: -1, y: 10 })).toBe(false);
    expect(isPointInWorld({ x: Number.NaN, y: 10 })).toBe(false);
    expect(isPointInWorld({ x: 10, y: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('точка старта — центр мира и лежит внутри него', () => {
    const spawn = getWorldSpawnPoint();
    expect(spawn).toEqual({ x: 4096, y: 4096 });
    expect(isPointInWorld(spawn)).toBe(true);
    expect(worldToTile(spawn.x)).toBe(128);
  });
});

describe('индекс клетки в мире', () => {
  it('worldTileIndex нумерует клетки по строкам и покрывает мир без пропусков', () => {
    expect(worldTileIndex(0, 0)).toBe(0);
    expect(worldTileIndex(255, 0)).toBe(255);
    expect(worldTileIndex(0, 1)).toBe(256);
    expect(worldTileIndex(255, 255)).toBe(WORLD_TILES * WORLD_TILES - 1);
    const seen = new Uint8Array(WORLD_TILES * WORLD_TILES);
    for (let y = 0; y < WORLD_TILES; y++) {
      for (let x = 0; x < WORLD_TILES; x++) {
        const index = worldTileIndex(x, y);
        seen[index] = (seen[index] ?? 0) + 1;
      }
    }
    expect(seen.every((count) => count === 1)).toBe(true);
  });

  it('worldTileIndex бросает ошибку вне мира и для нецелых координат', () => {
    expect(() => worldTileIndex(-1, 0)).toThrow(RangeError);
    expect(() => worldTileIndex(0, 256)).toThrow(RangeError);
    expect(() => worldTileIndex(1.5, 0)).toThrow(RangeError);
    expect(() => worldTileIndex(Number.NaN, 0)).toThrow(RangeError);
  });
});

describe('чанки', () => {
  it('isChunkInWorld: мир состоит из чанков 0…7 по обеим осям', () => {
    expect(isChunkInWorld(0, 0)).toBe(true);
    expect(isChunkInWorld(7, 7)).toBe(true);
    expect(isChunkInWorld(8, 0)).toBe(false);
    expect(isChunkInWorld(0, -1)).toBe(false);
    expect(isChunkInWorld(1.5, 0)).toBe(false);
    expect(isChunkInWorld(Number.NaN, 0)).toBe(false);
  });

  it('chunkOriginTile и chunkRectWorld согласованы с преобразованием координат', () => {
    expect(chunkOriginTile(0, 0)).toEqual({ x: 0, y: 0 });
    expect(chunkOriginTile(3, 5)).toEqual({ x: 96, y: 160 });
    expect(chunkRectWorld(0, 0)).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
    expect(chunkRectWorld(7, 7)).toEqual({ x: 7168, y: 7168, width: 1024, height: 1024 });
    for (const [cx, cy] of [
      [0, 0],
      [2, 6],
      [7, 7],
    ] as const) {
      const origin = chunkOriginTile(cx, cy);
      const rect = chunkRectWorld(cx, cy);
      expect(rect.x).toBe(origin.x * TILE_SIZE);
      expect(rect.y).toBe(origin.y * TILE_SIZE);
      expect(tileToChunk(origin.x)).toBe(cx);
      expect(tileToChunk(origin.x + CHUNK_SIZE - 1)).toBe(cx);
      expect(tileToChunk(origin.y)).toBe(cy);
    }
  });

  it('чанки полностью покрывают мир: 8×8 прямоугольников без зазоров', () => {
    const last = chunkRectWorld(WORLD_CHUNKS - 1, WORLD_CHUNKS - 1);
    expect(last.x + last.width).toBe(WORLD_PIXELS);
    expect(last.y + last.height).toBe(WORLD_PIXELS);
  });

  it('chunkCenterWorld — центр прямоугольника чанка', () => {
    expect(chunkCenterWorld(0, 0)).toEqual({ x: 512, y: 512 });
    expect(chunkCenterWorld(4, 4)).toEqual({ x: 4608, y: 4608 });
  });
});

describe('chunksInRadius', () => {
  it('радиус 0 даёт только сам чанк', () => {
    expect(chunksInRadius(3, 4, 0)).toEqual([{ cx: 3, cy: 4 }]);
  });

  it('радиус 1 в середине мира даёт 9 чанков, центр первым', () => {
    const result = chunksInRadius(4, 4, 1);
    expect(result).toHaveLength(9);
    expect(result[0]).toEqual({ cx: 4, cy: 4 });
  });

  it('порядок: по расстоянию, затем по cx, затем по cy', () => {
    expect(chunksInRadius(4, 4, 1)).toEqual([
      { cx: 4, cy: 4 },
      { cx: 3, cy: 4 },
      { cx: 4, cy: 3 },
      { cx: 4, cy: 5 },
      { cx: 5, cy: 4 },
      { cx: 3, cy: 3 },
      { cx: 3, cy: 5 },
      { cx: 5, cy: 3 },
      { cx: 5, cy: 5 },
    ]);
  });

  it('возвращает только чанки внутри мира', () => {
    const corner = chunksInRadius(0, 0, 1);
    expect(corner).toEqual([
      { cx: 0, cy: 0 },
      { cx: 0, cy: 1 },
      { cx: 1, cy: 0 },
      { cx: 1, cy: 1 },
    ]);
    // Центр вне мира допустим (камера у края): берутся только пересекающиеся чанки.
    expect(chunksInRadius(-1, -1, 1)).toEqual([{ cx: 0, cy: 0 }]);
    expect(chunksInRadius(-5, 3, 1)).toEqual([]);
  });

  it('огромный радиус даёт весь мир: 64 уникальных чанка', () => {
    const all = chunksInRadius(4, 4, 100);
    expect(all).toHaveLength(WORLD_CHUNKS * WORLD_CHUNKS);
    expect(new Set(all.map((c) => `${c.cx}:${c.cy}`)).size).toBe(WORLD_CHUNKS * WORLD_CHUNKS);
  });

  it('результат воспроизводим: повторный вызов даёт тот же порядок', () => {
    expect(chunksInRadius(5, 2, 3)).toEqual(chunksInRadius(5, 2, 3));
  });

  it('отвергает некорректные аргументы', () => {
    expect(() => chunksInRadius(0, 0, -1)).toThrow(RangeError);
    expect(() => chunksInRadius(0, 0, 1.5)).toThrow(RangeError);
    expect(() => chunksInRadius(0.5, 0, 1)).toThrow(RangeError);
    expect(() => chunksInRadius(0, Number.NaN, 1)).toThrow(RangeError);
  });
});
