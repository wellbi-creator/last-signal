import { CHUNK_SIZE, TILE_SIZE, WORLD_CHUNKS, WORLD_PIXELS, WORLD_TILES } from '../config.ts';
import type { ChunkCoord, Rect, Vec2 } from './types.ts';

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

/**
 * Индекс клетки в плоском массиве ВСЕГО мира (по строкам, размер WORLD_TILES × WORLD_TILES).
 * Для клеток вне мира и нецелых координат бросает RangeError: тихий индекс за границей массива
 * (например, -1) был бы труднообнаружимой ошибкой.
 */
export function worldTileIndex(tx: number, ty: number): number {
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || !isTileInWorld(tx, ty)) {
    throw new RangeError(`worldTileIndex: клетка (${tx}, ${ty}) вне мира`);
  }
  return ty * WORLD_TILES + tx;
}

/** Лежит ли чанк внутри конечного мира v1. */
export function isChunkInWorld(cx: number, cy: number): boolean {
  return (
    Number.isInteger(cx) &&
    Number.isInteger(cy) &&
    cx >= 0 &&
    cy >= 0 &&
    cx < WORLD_CHUNKS &&
    cy < WORLD_CHUNKS
  );
}

/** Тайловые координаты левой верхней клетки чанка. */
export function chunkOriginTile(cx: number, cy: number): Vec2 {
  return { x: cx * CHUNK_SIZE, y: cy * CHUNK_SIZE };
}

/** Границы чанка в пикселях мира. */
export function chunkRectWorld(cx: number, cy: number): Rect {
  const size = CHUNK_SIZE * TILE_SIZE;
  return { x: cx * size, y: cy * size, width: size, height: size };
}

/** Центр чанка в пикселях мира. */
export function chunkCenterWorld(cx: number, cy: number): Vec2 {
  const rect = chunkRectWorld(cx, cy);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Чанки мира в квадрате радиуса `radius` (в чанках, по Чебышёву) вокруг чанка (cx, cy).
 * Центр может лежать вне мира, возвращаются только чанки внутри мира.
 *
 * Порядок строго определён и не зависит от платформы: по возрастанию квадрата расстояния до центра,
 * при равенстве по cx, затем по cy. Компаратор задаёт полный порядок (совпадающих элементов нет),
 * поэтому результат не зависит от устойчивости сортировки.
 */
export function chunksInRadius(cx: number, cy: number, radius: number): ChunkCoord[] {
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(radius) || radius < 0) {
    throw new RangeError(`chunksInRadius: некорректные аргументы (${cx}, ${cy}, ${radius})`);
  }
  const result: ChunkCoord[] = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (isChunkInWorld(x, y)) result.push({ cx: x, cy: y });
    }
  }
  const dist2 = (c: ChunkCoord): number => (c.cx - cx) * (c.cx - cx) + (c.cy - cy) * (c.cy - cy);
  return result.sort((a, b) => dist2(a) - dist2(b) || a.cx - b.cx || a.cy - b.cy);
}

/** Точка старта игрока по умолчанию: центр мира. */
export function getWorldSpawnPoint(): Vec2 {
  return { x: WORLD_PIXELS / 2, y: WORLD_PIXELS / 2 };
}
