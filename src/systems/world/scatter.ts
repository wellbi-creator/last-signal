import { CHUNK_SIZE, WORLD_TILES } from '../../config.ts';
import { Rng, hashInts } from '../../core/Rng.ts';
import { START_TILE } from './starter.ts';
import { findObjectType } from './objectData.ts';
import type { LayerDef, ObjectTypeDef } from './objectData.ts';
import type { WorldPlan } from './WorldPlan.ts';
import { Tile } from './types.ts';
import type { WorldObject } from './types.ts';

/**
 * Расстановка объектов в одном чанке: чистая функция от плана (seed) и координат (cx, cy).
 *
 * Принципы (docs/M1_5_PLAN.md):
 * - мир накрыт сеткой ячеек слоя (4, 8 или 16 тайлов; делит 32), объект целиком лежит внутри
 *   своей ячейки и, значит, своего чанка: на границах нет ни дублей, ни пропаж;
 * - случайность каждой ячейки — `Rng(hashInts(seed, salt слоя, gx, gy))`, порядок обращений к ней
 *   фиксирован и не зависит от исхода, поэтому результат не зависит от порядка генерации чанков;
 * - блокирующие объекты не касаются друг друга (в том числе по диагонали) и воды: у них отступ
 *   от края ячейки ≥ 1, а «ореол» в 1 клетку проверяется по маске СВОЕГО чанка. Из этого следует,
 *   что вокруг любого блокирующего объекта есть замкнутое кольцо свободных клеток: объекты не
 *   могут отрезать участок суши или создать замкнутый карман;
 * - слои идут по приоритету, ячейки построчно; идентификатор `${cx}:${cy}:${index}`,
 *   стартовые объекты чанка — первыми.
 * Только точная арифметика (D2): сравнения расстояний через квадраты, без sqrt.
 */

/** Квадрат максимального расстояния от центра мира (для farBonus): диагональ половины мира. */
const MAX_DIST2 = 2 * (WORLD_TILES / 2) * (WORLD_TILES / 2);

function chunkIndex(lx: number, ly: number): number {
  return ly * CHUNK_SIZE + lx;
}

function startDist2(x: number, y: number): number {
  const dx = x - START_TILE;
  const dy = y - START_TILE;
  return dx * dx + dy * dy;
}

export function scatterChunk(plan: WorldPlan, cx: number, cy: number): WorldObject[] {
  const { objects: data, base } = plan;
  const originX = cx * CHUNK_SIZE;
  const originY = cy * CHUNK_SIZE;
  const result: WorldObject[] = [];
  /** 1 — клетка занята каким-либо объектом. */
  const occupied = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  /** 1 — клетка занята блокирующим объектом. */
  const blockMask = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

  const add = (type: string, x: number, y: number, w: number, h: number, blocks: boolean): void => {
    result.push({ id: `${cx}:${cy}:${result.length}`, type, x, y });
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const i = chunkIndex(x - originX + dx, y - originY + dy);
        occupied[i] = 1;
        if (blocks) blockMask[i] = 1;
      }
    }
  };

  // 1. Стартовые объекты (из плана): первыми в нумерации.
  for (const s of plan.starter) {
    if (
      s.x < originX ||
      s.y < originY ||
      s.x >= originX + CHUNK_SIZE ||
      s.y >= originY + CHUNK_SIZE
    ) {
      continue;
    }
    add(s.type, s.x, s.y, 1, 1, findObjectType(data, s.type)?.layer.blocks ?? false);
  }

  const { clearRadius, noScatterRadius } = data.start;

  for (const layer of data.layers) {
    const cellsPerChunk = CHUNK_SIZE / layer.cell;
    const gx0 = cx * cellsPerChunk;
    const gy0 = cy * cellsPerChunk;
    for (let j = 0; j < cellsPerChunk; j++) {
      for (let i = 0; i < cellsPerChunk; i++) {
        const gx = gx0 + i;
        const gy = gy0 + j;
        const cellX = gx * layer.cell;
        const cellY = gy * layer.cell;
        const centerX = cellX + layer.cell / 2;
        const centerY = cellY + layer.cell / 2;
        const biome = base.biomes[centerY * WORLD_TILES + centerX] ?? 0;
        const density = layer.density[biome] ?? 0;
        if (density === 0) continue;
        const eligible = layer.eligible[biome];
        const weightSum = layer.weightSums[biome] ?? 0;
        if (!eligible || weightSum === 0) continue;

        // Фиксированный порядок обращений к rng: u, тип, смещения.
        const rng = new Rng(hashInts(plan.worldSeed, layer.salt, gx, gy));
        const u = rng.next();
        const typeRoll = rng.next();
        const offsetX = rng.next();
        const offsetY = rng.next();

        const p = cellProbability(plan, layer, centerX, centerY, density);
        if (u >= p) continue;

        let pick = Math.floor(typeRoll * weightSum);
        let def: ObjectTypeDef | undefined;
        for (const candidate of eligible) {
          if (pick < candidate.weight) {
            def = candidate;
            break;
          }
          pick -= candidate.weight;
        }
        if (!def) continue;

        const slackX = layer.cell - 2 * layer.inset - def.w;
        const slackY = layer.cell - 2 * layer.inset - def.h;
        const x = cellX + layer.inset + Math.floor(offsetX * (slackX + 1));
        const y = cellY + layer.inset + Math.floor(offsetY * (slackY + 1));

        if (
          fits(
            plan,
            layer,
            def,
            x,
            y,
            originX,
            originY,
            occupied,
            blockMask,
            noScatterRadius,
            clearRadius,
          )
        ) {
          add(def.type, x, y, def.w, def.h, layer.blocks);
        }
      }
    }
  }
  return result;
}

/** Вероятность появления объекта в ячейке: плотность биома × кластер × бонус удалённости. */
function cellProbability(
  plan: WorldPlan,
  layer: LayerDef,
  centerX: number,
  centerY: number,
  density: number,
): number {
  const { cluster } = plan.objects;
  const field = plan.clusterField(centerX / cluster.scale, centerY / cluster.scale);
  const modulation = cluster.low + (cluster.high - cluster.low) * field;
  let p = density * modulation;
  if (layer.farBonus > 0) p *= 1 + (layer.farBonus * startDist2(centerX, centerY)) / MAX_DIST2;
  return Math.min(0.95, p);
}

/** Допуск места: тайлы, занятость, зазоры, зона старта. */
function fits(
  plan: WorldPlan,
  layer: LayerDef,
  def: ObjectTypeDef,
  x: number,
  y: number,
  originX: number,
  originY: number,
  occupied: Uint8Array,
  blockMask: Uint8Array,
  noScatterRadius: number,
  clearRadius: number,
): boolean {
  const tiles = plan.base.tiles;
  const minStart2 = layer.minStartDistance * layer.minStartDistance;
  // Кольцо шире габарита на клетку для блокирующих (зазор), для остальных — сам габарит.
  const pad = layer.blocks ? 1 : 0;
  for (let ty = y - pad; ty < y + def.h + pad; ty++) {
    for (let tx = x - pad; tx < x + def.w + pad; tx++) {
      const local = chunkIndex(tx - originX, ty - originY);
      const inside = tx >= x && tx < x + def.w && ty >= y && ty < y + def.h;
      const d2 = startDist2(tx, ty);
      const tile = tiles[ty * WORLD_TILES + tx] ?? Tile.Water;
      if (inside) {
        if ((def.tileMask & (1 << tile)) === 0) return false;
        if (occupied[local] === 1) return false;
        if (layer.minStartDistance > 0 && d2 < minStart2) return false;
        // Обычная расстановка: блокирующим закрыт весь радиус (с ореолом ниже), остальным — центр.
        if (!layer.blocks && d2 <= clearRadius * clearRadius) return false;
      } else {
        // Ореол блокирующего объекта: нет других блокирующих и нет воды.
        if (blockMask[local] === 1 || tile === Tile.Water) return false;
      }
      if (layer.blocks && d2 <= noScatterRadius * noScatterRadius) return false;
    }
  }
  return true;
}
