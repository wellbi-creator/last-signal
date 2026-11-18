import { WORLD_TILES } from '../../config.ts';
import { Tile } from './types.ts';
import type { WorldObject } from './types.ts';
import { findObjectType } from './objectData.ts';
import type { ObjectsData } from './objectData.ts';

/**
 * Проходимость клеток: единые правила шага для стартовых проверок M1.5 и для прокладки троп (M1.7).
 *
 * Клетка либо свободна, либо заблокирована (вода, блокирующий объект). Шаг возможен на соседнюю
 * клетку по 8 направлениям; по диагонали — только если обе боковые клетки свободны
 * (срезать угол нельзя). Все функции чистые, порядок обхода фиксирован (D2 и правило порядка).
 */

/** Прямоугольное окно клеток мира. `blocked[i] = 1` — клетка непроходима. */
export interface PassGrid {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
  readonly blocked: Uint8Array;
}

export function createPassGrid(x0: number, y0: number, width: number, height: number): PassGrid {
  return { x0, y0, width, height, blocked: new Uint8Array(width * height) };
}

export function inGrid(grid: PassGrid, x: number, y: number): boolean {
  return x >= grid.x0 && y >= grid.y0 && x < grid.x0 + grid.width && y < grid.y0 + grid.height;
}

function gridIndex(grid: PassGrid, x: number, y: number): number {
  return (y - grid.y0) * grid.width + (x - grid.x0);
}

/** Клетка внутри окна и не заблокирована. */
export function isFree(grid: PassGrid, x: number, y: number): boolean {
  return inGrid(grid, x, y) && grid.blocked[gridIndex(grid, x, y)] === 0;
}

export function setBlocked(grid: PassGrid, x: number, y: number, value: boolean): void {
  if (inGrid(grid, x, y)) grid.blocked[gridIndex(grid, x, y)] = value ? 1 : 0;
}

/** Можно ли шагнуть из (fromX, fromY) в соседнюю клетку (toX, toY). */
export function canStep(
  grid: PassGrid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if ((dx === 0 && dy === 0) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
  if (!isFree(grid, fromX, fromY) || !isFree(grid, toX, toY)) return false;
  if (dx !== 0 && dy !== 0) {
    // Диагональ: без срезания углов.
    return isFree(grid, toX, fromY) && isFree(grid, fromX, toY);
  }
  return true;
}

/** Порядок соседей фиксирован: четыре стороны, затем четыре диагонали. */
const STEP_X: readonly number[] = [1, -1, 0, 0, 1, -1, 1, -1];
const STEP_Y: readonly number[] = [0, 0, 1, -1, 1, 1, -1, -1];

/**
 * Заливка от клетки старта: какие клетки окна достижимы шагами `canStep`.
 * Результат: массив того же размера, что `grid.blocked` (1 — достижима). Если старт
 * заблокирован или вне окна, достижимых клеток нет.
 */
export function reachable(grid: PassGrid, startX: number, startY: number): Uint8Array {
  const seen = new Uint8Array(grid.width * grid.height);
  if (!isFree(grid, startX, startY)) return seen;
  const queue = new Int32Array(grid.width * grid.height);
  let head = 0;
  let tail = 0;
  seen[gridIndex(grid, startX, startY)] = 1;
  queue[tail++] = gridIndex(grid, startX, startY);
  while (head < tail) {
    const index = queue[head++] ?? 0;
    const x = grid.x0 + (index % grid.width);
    const y = grid.y0 + Math.floor(index / grid.width);
    for (let d = 0; d < 8; d++) {
      const nx = x + (STEP_X[d] ?? 0);
      const ny = y + (STEP_Y[d] ?? 0);
      if (!canStep(grid, x, y, nx, ny)) continue;
      const next = gridIndex(grid, nx, ny);
      if (seen[next] === 1) continue;
      seen[next] = 1;
      queue[tail++] = next;
    }
  }
  return seen;
}

/** Число свободных клеток окна. */
export function countFree(grid: PassGrid): number {
  let n = 0;
  for (let i = 0; i < grid.blocked.length; i++) if (grid.blocked[i] === 0) n++;
  return n;
}

/**
 * Проходимость всего мира: вода и блокирующие объекты заблокированы.
 * `tiles` — тайлы всего мира (индекс ty·256 + tx), `objects` — все объекты мира.
 */
export function createWorldPassGrid(
  tiles: Uint8Array,
  objects: readonly WorldObject[],
  data: ObjectsData,
): PassGrid {
  const grid = createPassGrid(0, 0, WORLD_TILES, WORLD_TILES);
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === Tile.Water) grid.blocked[i] = 1;
  }
  for (const object of objects) {
    const found = findObjectType(data, object.type);
    if (!found?.layer.blocks) continue;
    for (let dy = 0; dy < found.def.h; dy++) {
      for (let dx = 0; dx < found.def.w; dx++) setBlocked(grid, object.x + dx, object.y + dy, true);
    }
  }
  return grid;
}
