import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  TILE_SIZE,
  WORLD_CHUNKS,
  WORLD_PIXELS,
  WORLD_TILES,
} from '../src/config.ts';
import {
  getWorldSpawnPoint,
  isPointInWorld,
  isTileInWorld,
  localTileIndex,
  tileToChunk,
  tileToLocal,
  tileToWorldCenter,
  worldToTile,
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
