import { WORLD_TILES } from '../../config.ts';
import { Rng } from '../../core/Rng.ts';
import { SALT } from './salts.ts';
import { createPassGrid, reachable, setBlocked } from './passability.ts';
import type { PassGrid } from './passability.ts';
import { findObjectType } from './objectData.ts';
import type { ObjectsData } from './objectData.ts';
import { Tile } from './types.ts';

/**
 * Стартовые объекты: гарантированные деревья, камни и кусты вокруг точки старта.
 *
 * Они считаются один раз на seed (в плане мира), потому что центр мира лежит в углу четырёх
 * чанков, а чанки обязаны быть независимыми. Каждый чанк берёт из списка свои объекты.
 *
 * Как согласуются «в радиусе 12 нет блокирующих объектов» и «стартовые деревья и камни»:
 * запрет `noScatterRadius` относится только к ОБЫЧНОЙ расстановке (scatter). Стартовый список —
 * единственный источник блокирующих объектов внутри этого радиуса, и строится он отдельно, со
 * своими правилами: кольцо ringMin…ringMax, зазор blockerGap между блокирующими, проверка
 * доступности. Обычная расстановка проверяет зазор до стартовых объектов через ореол
 * (ringMax < noScatterRadius), поэтому касаний нет.
 */

/** Клетка старта: центр мира. */
export const START_TILE = WORLD_TILES / 2;

/** Стартовый объект: тип и клетка (размер 1×1). Идентификатор назначает чанк. */
export interface StarterObject {
  readonly type: string;
  readonly x: number;
  readonly y: number;
}

export class StarterError extends Error {
  constructor(message: string) {
    super(`Стартовые объекты: ${message}`);
    this.name = 'StarterError';
  }
}

function dist2(x: number, y: number): number {
  const dx = x - START_TILE;
  const dy = y - START_TILE;
  return dx * dx + dy * dy;
}

/**
 * Строит стартовый список. `tiles` — тайлы всего мира (индекс ty·256 + tx).
 * Порядок результата: по элементам `start.items`, внутри элемента — в порядке выбора.
 */
export function planStarterObjects(
  worldSeed: number,
  tiles: Uint8Array,
  data: ObjectsData,
): StarterObject[] {
  const { clearRadius, ringMin, ringMax, blockerGap, items } = data.start;
  const radius = ringMax + 3;
  const grid: PassGrid = createPassGrid(
    START_TILE - radius,
    START_TILE - radius,
    radius * 2 + 1,
    radius * 2 + 1,
  );
  for (let y = grid.y0; y < grid.y0 + grid.height; y++) {
    for (let x = grid.x0; x < grid.x0 + grid.width; x++) {
      if (tiles[y * WORLD_TILES + x] === Tile.Water) setBlocked(grid, x, y, true);
    }
  }
  const baseline = countTrue(reachable(grid, START_TILE, START_TILE));
  let blockedPlaced = 0;

  const result: StarterObject[] = [];
  const blockers: StarterObject[] = [];
  const taken = new Uint8Array(grid.width * grid.height);
  const root = new Rng(worldSeed);

  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    if (!item) continue;
    const found = findObjectType(data, item.type);
    if (!found) throw new StarterError(`неизвестный тип «${item.type}»`);
    const { layer, def } = found;

    // Кандидаты: клетки кольца в порядке строк, затем детерминированное перемешивание.
    const candidates: number[] = [];
    for (let y = grid.y0; y < grid.y0 + grid.height; y++) {
      for (let x = grid.x0; x < grid.x0 + grid.width; x++) {
        const d2 = dist2(x, y);
        if (d2 < ringMin * ringMin || d2 > ringMax * ringMax) continue;
        const tile = tiles[y * WORLD_TILES + x] ?? 0;
        if ((def.tileMask & (1 << tile)) === 0) continue;
        candidates.push(y * WORLD_TILES + x);
      }
    }
    root.child(SALT.STARTER, k).shuffle(candidates);

    let placed = 0;
    for (const code of candidates) {
      if (placed >= item.count) break;
      const x = code % WORLD_TILES;
      const y = Math.floor(code / WORLD_TILES);
      const slot = (y - grid.y0) * grid.width + (x - grid.x0);
      if (taken[slot] === 1 || dist2(x, y) <= clearRadius * clearRadius) continue;

      if (layer.blocks) {
        let tooClose = false;
        for (const b of blockers) {
          if (Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) < blockerGap) tooClose = true;
        }
        if (tooClose) continue;
        // Доступность: после установки все свободные клетки окна по-прежнему достижимы от старта.
        setBlocked(grid, x, y, true);
        const count = countTrue(reachable(grid, START_TILE, START_TILE));
        if (count !== baseline - blockedPlaced - 1) {
          setBlocked(grid, x, y, false);
          continue;
        }
        blockedPlaced++;
        blockers.push({ type: item.type, x, y });
      }
      taken[slot] = 1;
      result.push({ type: item.type, x, y });
      placed++;
    }
    if (placed < item.min) {
      throw new StarterError(
        `«${item.type}»: размещено ${placed}, требуется не меньше ${item.min}`,
      );
    }
  }
  return result;
}

function countTrue(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) n++;
  return n;
}
