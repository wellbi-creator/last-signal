import { CHUNK_SIZE, TILE_SIZE, WORLD_PIXELS, WORLD_TILES } from '../config.ts';
import type { Vec2 } from './types.ts';

/**
 * Единые правила координат (подробнее в docs/DATA_FORMATS.md):
 * - позиции сущностей хранятся в пикселях мира (x вправо, y вниз), начало — левый верхний угол мира;
 * - тайл (tx, ty) покрывает пиксели [tx*TILE_SIZE, (tx+1)*TILE_SIZE);
 * - чанк (cx, cy) содержит тайлы [cx*CHUNK_SIZE, (cx+1)*CHUNK_SIZE).
 * Деление всегда «вниз» (Math.floor), в том числе для отрицательных координат, чтобы
 * будущий бесконечный мир работал по тем же формулам.
 */

/** Номер тайла по координате в пикселях мира. */
export function worldToTile(worldCoord: number): number {
  return Math.floor(worldCoord / TILE_SIZE);
}

/** Координата центра тайла в пикселях мира. */
export function tileToWorldCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

/** Номер чанка, в котором лежит тайл. */
export function tileToChunk(tile: number): number {
  return Math.floor(tile / CHUNK_SIZE);
}

/** Координата тайла внутри чанка, 0…CHUNK_SIZE-1 (корректна и для отрицательных тайлов). */
export function tileToLocal(tile: number): number {
  return ((tile % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

/** Индекс тайла в плоском массиве чанка (по строкам). */
export function localTileIndex(localX: number, localY: number): number {
  return localY * CHUNK_SIZE + localX;
}

/** Лежит ли тайл внутри конечного мира v1. */
export function isTileInWorld(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < WORLD_TILES && ty < WORLD_TILES;
}

/** Лежит ли точка (в пикселях мира) внутри конечного мира v1. */
export function isPointInWorld(point: Vec2): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < WORLD_PIXELS &&
    point.y < WORLD_PIXELS
  );
}

/** Точка старта игрока по умолчанию: центр мира. */
export function getWorldSpawnPoint(): Vec2 {
  return { x: WORLD_PIXELS / 2, y: WORLD_PIXELS / 2 };
}
