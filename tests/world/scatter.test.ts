import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_CHUNKS, WORLD_TILES } from '../../src/config.ts';
import { EventBus } from '../../src/core/EventBus.ts';
import type { GameEvents } from '../../src/core/events.ts';
import { Rng } from '../../src/core/Rng.ts';
import { generateChunk } from '../../src/systems/world/ChunkGenerator.ts';
import { ChunkManager } from '../../src/systems/world/ChunkManager.ts';
import { hashWorld } from '../../src/systems/world/checksum.ts';
import { findObjectType } from '../../src/systems/world/objectData.ts';
import { createWorldPassGrid, isFree, reachable } from '../../src/systems/world/passability.ts';
import type { PassGrid } from '../../src/systems/world/passability.ts';
import { scatterChunk } from '../../src/systems/world/scatter.ts';
import { planStarterObjects, START_TILE } from '../../src/systems/world/starter.ts';
import { createTerrainSampler } from '../../src/systems/world/terrain.ts';
import { Biome, Tile } from '../../src/systems/world/types.ts';
import type { Chunk, WorldObject } from '../../src/systems/world/types.ts';
import { createWorldPlan } from '../../src/systems/world/WorldPlan.ts';
import { WorldGenerator } from '../../src/systems/world/WorldGenerator.ts';
import { cellsOf, data, footprintOf, params, testSeed, worldFor } from './objectsHelpers.ts';

const SEEDS_FULL = 30; // полный мир: границы, зазоры, биомы
const SEEDS_COMPONENTS = 8; // дорогая проверка связности

function rowMajor(): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let cy = 0; cy < WORLD_CHUNKS; cy++)
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) result.push([cx, cy]);
  return result;
}

describe('scatter: детерминизм и независимость от порядка', () => {
  it('один seed — одни и те же объекты; разные seed — разные', () => {
    const a = new WorldGenerator('M0-DEMO');
    const b = new WorldGenerator('M0-DEMO');
    expect(a.worldHash()).toBe(b.worldHash());
    expect(a.generateChunk(4, 4).objects).toEqual(b.generateChunk(4, 4).objects);
    expect(new WorldGenerator('другой').worldHash()).not.toBe(a.worldHash());
  });

  it('порядок генерации чанков не влияет: прямой, обратный и перемешанный обход', () => {
    for (let i = 0; i < 3; i++) {
      const seed = testSeed(100 + i);
      const reference = new Map<string, WorldObject[]>();
      const forward = createWorldPlan(seed, params);
      for (const [cx, cy] of rowMajor()) {
        reference.set(`${cx}:${cy}`, generateChunk(forward, cx, cy).objects);
      }
      const reversed = rowMajor().reverse();
      const shuffled = new Rng(seed).shuffle(rowMajor());
      for (const order of [reversed, shuffled]) {
        const plan = createWorldPlan(seed, params);
        for (const [cx, cy] of order) {
          expect(generateChunk(plan, cx, cy).objects).toEqual(reference.get(`${cx}:${cy}`));
        }
      }
    }
  });

  it('чанк отдельно равен тому же чанку из полного обхода (нет скрытого состояния)', () => {
    const world = worldFor(0);
    const fresh = createWorldPlan(testSeed(0), params);
    for (const [cx, cy] of [
      [0, 0],
      [3, 5],
      [4, 4],
      [7, 7],
    ] as const) {
      expect(scatterChunk(fresh, cx, cy)).toEqual(world.chunks[cy * WORLD_CHUNKS + cx]);
    }
  });

  it('повторный вызов даёт равный, но не общий результат', () => {
    const plan = worldFor(1).plan;
    const a = scatterChunk(plan, 2, 2);
    const b = scatterChunk(plan, 2, 2);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('scatter: границы чанков (нет дублей и пропаж)', () => {
  it('габарит целиком в своём чанке; id совпадает с чанком и уникален во всём мире', () => {
    for (let i = 0; i < SEEDS_FULL; i++) {
      const world = worldFor(i);
      const ids = new Set<string>();
      world.chunks.forEach((objects, index) => {
        const cx = index % WORLD_CHUNKS;
        const cy = Math.floor(index / WORLD_CHUNKS);
        objects.forEach((o, k) => {
          const f = footprintOf(o.type);
          expect(o.id).toBe(`${cx}:${cy}:${k}`);
          expect(ids.has(o.id)).toBe(false);
          ids.add(o.id);
          expect(o.x).toBeGreaterThanOrEqual(cx * CHUNK_SIZE);
          expect(o.y).toBeGreaterThanOrEqual(cy * CHUNK_SIZE);
          expect(o.x + f.w).toBeLessThanOrEqual((cx + 1) * CHUNK_SIZE);
          expect(o.y + f.h).toBeLessThanOrEqual((cy + 1) * CHUNK_SIZE);
        });
      });
    }
  });

  it('ни одна клетка мира не занята двумя объектами', () => {
    for (let i = 0; i < SEEDS_FULL; i++) {
      const used = new Uint8Array(WORLD_TILES * WORLD_TILES);
      for (const o of worldFor(i).all) {
        for (const cell of cellsOf(o)) {
          expect(used[cell]).toBe(0);
          used[cell] = 1;
        }
      }
    }
  });

  it('у стыков чанков объекты не пропадают: плотность в полосе 2 клетки у границы не ниже внутренней', () => {
    let band = 0;
    let inner = 0;
    for (let i = 0; i < 20; i++) {
      for (const o of worldFor(i).all) {
        const lx = o.x % CHUNK_SIZE;
        const ly = o.y % CHUNK_SIZE;
        const edge = lx < 2 || ly < 2 || lx >= CHUNK_SIZE - 2 || ly >= CHUNK_SIZE - 2;
        if (edge) band++;
        else inner++;
      }
    }
    const bandTiles = CHUNK_SIZE * CHUNK_SIZE - (CHUNK_SIZE - 4) * (CHUNK_SIZE - 4);
    const innerTiles = (CHUNK_SIZE - 4) * (CHUNK_SIZE - 4);
    const ratio = band / bandTiles / (inner / innerTiles);
    // Блокирующие объекты не стоят на самой границе (зазор), поэтому у стыка чуть реже, но не «пусто».
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.25);
  });

  it('объекты есть по обе стороны каждого стыка чанков (мир целиком, 20 seed)', () => {
    for (let i = 0; i < 20; i++) {
      const world = worldFor(i);
      const left = new Uint8Array(WORLD_TILES);
      for (const o of world.all) {
        if (o.x % CHUNK_SIZE === 0 || o.x % CHUNK_SIZE === CHUNK_SIZE - 1) left[o.x] = 1;
      }
      // Стыки: хотя бы у большинства линий границ есть объекты вплотную к ним.
      let seams = 0;
      for (let c = 1; c < WORLD_CHUNKS; c++) {
        if (left[c * CHUNK_SIZE] === 1 || left[c * CHUNK_SIZE - 1] === 1) seams++;
      }
      expect(seams).toBeGreaterThan(2);
    }
  });
});

describe('scatter: правила биомов и воды', () => {
  it('ни один объект не стоит на воде; каждый тип только на допустимых тайлах', () => {
    for (let i = 0; i < SEEDS_FULL; i++) {
      const { plan, all } = worldFor(i);
      for (const o of all) {
        const def = findObjectType(data, o.type)?.def;
        expect(def?.type).toBe(o.type);
        for (const cell of cellsOf(o)) {
          const tile = plan.base.tiles[cell] ?? 0;
          expect(tile).not.toBe(Tile.Water);
          expect((def?.tileMask ?? 0) & (1 << tile)).not.toBe(0);
        }
      }
    }
  });

  it('залежи и объекты — только в своих биомах (по клетке происхождения)', () => {
    for (let i = 0; i < SEEDS_FULL; i++) {
      const { plan, all } = worldFor(i);
      for (const o of all) {
        if (o.type === 'iron_ore') {
          for (const cell of cellsOf(o)) expect(plan.base.tiles[cell]).toBe(Tile.Stone);
        }
        if (o.type === 'peat') {
          for (const cell of cellsOf(o)) expect(plan.base.tiles[cell]).toBe(Tile.Mud);
        }
        // Биом определяется по центру ячейки; у границ биомов клетка может быть соседнего биома,
        // но воды в биоме объекта быть не может.
        expect(plan.base.biomes[o.y * WORLD_TILES + o.x]).not.toBe(Biome.Water);
      }
    }
  });

  it('во всех пяти играбельных биомах объекты встречаются, а в воде — нет', () => {
    const perBiome = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 10; i++) {
      const { plan, all } = worldFor(i);
      for (const o of all) {
        const b = plan.base.biomes[o.y * WORLD_TILES + o.x] ?? 0;
        perBiome[b] = (perBiome[b] ?? 0) + 1;
      }
    }
    expect(perBiome[Biome.Water]).toBe(0);
    for (const biome of [Biome.Coast, Biome.Plains, Biome.Forest, Biome.Rocks, Biome.Swamp]) {
      expect(perBiome[biome]).toBeGreaterThan(50);
    }
  });

  it('плотность по биомам в приёмочных диапазонах (30 seed, объектов на 1000 тайлов биома)', () => {
    const tiles = [0, 0, 0, 0, 0, 0];
    const trees = [0, 0, 0, 0, 0, 0];
    const rocks = [0, 0, 0, 0, 0, 0];
    const bushes = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < SEEDS_FULL; i++) {
      const { plan, all } = worldFor(i);
      for (let k = 0; k < plan.base.biomes.length; k++) {
        const b = plan.base.biomes[k] ?? 0;
        tiles[b] = (tiles[b] ?? 0) + 1;
      }
      for (const o of all) {
        const b = plan.base.biomes[o.y * WORLD_TILES + o.x] ?? 0;
        if (o.type.startsWith('tree_') || o.type === 'fallen_log') trees[b] = (trees[b] ?? 0) + 1;
        else if (o.type.startsWith('boulder')) rocks[b] = (rocks[b] ?? 0) + 1;
        else if (o.type === 'bush' || o.type === 'reeds') bushes[b] = (bushes[b] ?? 0) + 1;
      }
    }
    const per1000 = (counts: number[], biome: number): number =>
      ((counts[biome] ?? 0) / (tiles[biome] ?? 1)) * 1000;
    // Лес — густой, равнина — редкая, скалы — каменные, болото — кусты и сухостой.
    expect(per1000(trees, Biome.Forest)).toBeGreaterThan(25);
    expect(per1000(trees, Biome.Forest)).toBeLessThan(55);
    expect(per1000(trees, Biome.Plains)).toBeGreaterThan(3);
    expect(per1000(trees, Biome.Plains)).toBeLessThan(12);
    expect(per1000(trees, Biome.Forest)).toBeGreaterThan(4 * per1000(trees, Biome.Plains));
    expect(per1000(rocks, Biome.Rocks)).toBeGreaterThan(4);
    expect(per1000(rocks, Biome.Rocks)).toBeLessThan(12);
    expect(per1000(rocks, Biome.Rocks)).toBeGreaterThan(3 * per1000(rocks, Biome.Forest));
    expect(per1000(bushes, Biome.Swamp)).toBeGreaterThan(8);
    expect(per1000(bushes, Biome.Swamp)).toBeLessThan(25);
    expect(per1000(bushes, Biome.Plains)).toBeGreaterThan(8);
    expect(per1000(bushes, Biome.Plains)).toBeLessThan(25);
    expect(per1000(trees, Biome.Coast)).toBe(0);
  });

  it('каждый тип встречается: частые — почти в каждом мире, редкие — хотя бы в части миров', () => {
    const worlds: Record<string, number> = {};
    for (let i = 0; i < SEEDS_FULL; i++) {
      const seen = new Set(worldFor(i).all.map((o) => o.type));
      for (const t of seen) worlds[t] = (worlds[t] ?? 0) + 1;
    }
    for (const layer of data.layers) {
      for (const def of layer.types) {
        const present = worlds[def.type] ?? 0;
        expect(present).toBeGreaterThan(0);
        if (layer.id !== 'buildings') expect(present).toBeGreaterThan(SEEDS_FULL * 0.8);
      }
    }
    // Здания редки (гарантии придут с точками интереса, M1.6): в большинстве миров есть хоть одно.
    let withBuildings = 0;
    for (let i = 0; i < SEEDS_FULL; i++) {
      if (worldFor(i).all.some((o) => o.type.startsWith('ruin_'))) withBuildings++;
    }
    expect(withBuildings).toBeGreaterThan(SEEDS_FULL * 0.9);
  });

  it('число объектов в чанке ограничено (производительность)', () => {
    let max = 0;
    for (let i = 0; i < SEEDS_FULL; i++)
      for (const c of worldFor(i).chunks) max = Math.max(max, c.length);
    expect(max).toBeLessThan(120);
  });
});

describe('scatter: зазоры и проходимость (O2)', () => {
  it('блокирующие объекты не касаются друг друга (и по диагонали), в том числе через границы чанков', () => {
    for (let i = 0; i < SEEDS_FULL; i++) {
      const owner = new Int32Array(WORLD_TILES * WORLD_TILES).fill(-1);
      const all = worldFor(i).all;
      all.forEach((o, index) => {
        if (!footprintOf(o.type).blocks) return;
        for (const cell of cellsOf(o)) owner[cell] = index;
      });
      all.forEach((o, index) => {
        if (!footprintOf(o.type).blocks) return;
        for (const cell of cellsOf(o)) {
          const x = cell % WORLD_TILES;
          const y = Math.floor(cell / WORLD_TILES);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) continue;
              const other = owner[ny * WORLD_TILES + nx] ?? -1;
              if (other !== -1 && other !== index) {
                throw new Error(`seed ${i}: ${o.id} касается ${all[other]?.id}`);
              }
            }
          }
        }
      });
    }
  });

  it('вокруг блокирующего объекта нет воды (кольцо из 1 клетки): объект не перекрывает узкий проход', () => {
    for (let i = 0; i < SEEDS_FULL; i++) {
      const { plan, all } = worldFor(i);
      for (const o of all) {
        const f = footprintOf(o.type);
        if (!f.blocks) continue;
        for (let ty = o.y - 1; ty <= o.y + f.h; ty++) {
          for (let tx = o.x - 1; tx <= o.x + f.w; tx++) {
            expect(plan.base.tiles[ty * WORLD_TILES + tx]).not.toBe(Tile.Water);
          }
        }
      }
    }
  });

  it('объекты не создают замкнутых областей и не делят сушу: связность та же, что без объектов', () => {
    for (let i = 0; i < SEEDS_COMPONENTS; i++) {
      const { plan, all } = worldFor(i);
      const withObjects = labelComponents(createWorldPassGrid(plan.base.tiles, all, data));
      const waterOnly = labelComponents(createWorldPassGrid(plan.base.tiles, [], data));
      // Каждая компонента с объектами лежит внутри ровно одной компоненты без объектов…
      const parent = new Map<number, number>();
      for (let k = 0; k < withObjects.labels.length; k++) {
        const a = withObjects.labels[k] ?? -1;
        if (a < 0) continue;
        const b = waterOnly.labels[k] ?? -1;
        const known = parent.get(a);
        if (known === undefined) parent.set(a, b);
        else expect(known).toBe(b);
      }
      // …и разные компоненты с объектами не принадлежат одной компоненте без объектов
      // (объекты не разрезали сушу и не отрезали кармана).
      const used = new Set<number>();
      for (const b of parent.values()) {
        expect(used.has(b)).toBe(false);
        used.add(b);
      }
      expect(withObjects.count).toBe(parent.size);
    }
  });
});

function labelComponents(grid: PassGrid): { labels: Int32Array; count: number } {
  const labels = new Int32Array(grid.width * grid.height).fill(-1);
  let count = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (labels[y * grid.width + x] !== -1 || !isFree(grid, grid.x0 + x, grid.y0 + y)) continue;
      const seen = reachable(grid, grid.x0 + x, grid.y0 + y);
      for (let k = 0; k < seen.length; k++) if (seen[k] === 1) labels[k] = count;
      count++;
    }
  }
  return { labels, count };
}

describe('scatter: стартовая зона', () => {
  function inChunksAroundStart(world: ReturnType<typeof worldFor>): WorldObject[] {
    const result: WorldObject[] = [];
    for (const [cx, cy] of [
      [3, 3],
      [4, 3],
      [3, 4],
      [4, 4],
    ] as const) {
      result.push(...(world.chunks[cy * WORLD_CHUNKS + cx] ?? []));
    }
    return result;
  }

  const d2 = (x: number, y: number): number =>
    (x - START_TILE) * (x - START_TILE) + (y - START_TILE) * (y - START_TILE);

  it('в радиусе 12 блокирующие объекты — только стартовые; радиус 3 свободен от всего', () => {
    for (let i = 0; i < 20; i++) {
      const world = worldFor(i);
      const starter = new Set(world.plan.starter.map((s) => `${s.x}:${s.y}`));
      for (const o of inChunksAroundStart(world)) {
        const f = footprintOf(o.type);
        for (const cell of cellsOf(o)) {
          const x = cell % WORLD_TILES;
          const y = Math.floor(cell / WORLD_TILES);
          if (d2(x, y) <= data.start.clearRadius * data.start.clearRadius) {
            throw new Error(`seed ${i}: ${o.id} (${o.type}) в радиусе ${data.start.clearRadius}`);
          }
          if (f.blocks && d2(x, y) <= data.start.noScatterRadius * data.start.noScatterRadius) {
            expect(starter.has(`${o.x}:${o.y}`)).toBe(true);
          }
        }
      }
    }
  });

  it('стартовые объекты в чанках идут первыми, с корректными id, и в сумме равны списку плана', () => {
    for (let i = 0; i < 10; i++) {
      const world = worldFor(i);
      const around = inChunksAroundStart(world);
      const starterTypes = new Set(data.start.items.map((s) => s.type));
      let fromChunks = 0;
      for (const [cx, cy] of [
        [3, 3],
        [4, 3],
        [3, 4],
        [4, 4],
      ] as const) {
        const objects = world.chunks[cy * WORLD_CHUNKS + cx] ?? [];
        const mine = world.plan.starter.filter(
          (s) => Math.floor(s.x / CHUNK_SIZE) === cx && Math.floor(s.y / CHUNK_SIZE) === cy,
        );
        mine.forEach((s, k) => {
          expect(objects[k]?.x).toBe(s.x);
          expect(objects[k]?.y).toBe(s.y);
          expect(objects[k]?.type).toBe(s.type);
        });
        fromChunks += mine.length;
      }
      expect(fromChunks).toBe(world.plan.starter.length);
      expect(around.some((o) => starterTypes.has(o.type))).toBe(true);
    }
  });

  it('на 200 seed: гарантированный минимум 6 / 4 / 4 в кольце 5–11, радиус 3 свободен, всё достижимо', () => {
    const { ringMin, ringMax, clearRadius, blockerGap } = data.start;
    const minTrees = data.start.items.find((s) => s.type === 'tree_pine')?.min ?? 0;
    const minRocks = data.start.items.find((s) => s.type === 'boulder')?.min ?? 0;
    const minBushes = data.start.items.find((s) => s.type === 'bush')?.min ?? 0;
    expect([minTrees, minRocks, minBushes]).toEqual([6, 4, 4]);

    for (let i = 0; i < 200; i++) {
      const seed = testSeed(1000 + i);
      const plan = planStarterFor(seed);
      const count = (type: string): number => plan.filter((s) => s.type === type).length;
      expect(count('tree_pine')).toBeGreaterThanOrEqual(minTrees);
      expect(count('boulder')).toBeGreaterThanOrEqual(minRocks);
      expect(count('bush')).toBeGreaterThanOrEqual(minBushes);

      const blockers = plan.filter((s) => footprintOf(s.type).blocks);
      for (const s of plan) {
        const r2 = d2(s.x, s.y);
        expect(r2).toBeGreaterThanOrEqual(ringMin * ringMin);
        expect(r2).toBeLessThanOrEqual(ringMax * ringMax);
        expect(r2).toBeGreaterThan(clearRadius * clearRadius);
      }
      for (let a = 0; a < blockers.length; a++) {
        for (let b = a + 1; b < blockers.length; b++) {
          const p = blockers[a] as { x: number; y: number };
          const q = blockers[b] as { x: number; y: number };
          expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBeGreaterThanOrEqual(
            blockerGap,
          );
        }
      }
      // Достижимость: стартовая клетка свободна, все свободные клетки окна достижимы,
      // у каждого блокирующего объекта есть достижимый сосед.
      const grid = startWindow(seed, plan);
      const seen = reachable(grid, START_TILE, START_TILE);
      for (let k = 0; k < grid.blocked.length; k++) {
        expect(seen[k] === 1 || grid.blocked[k] === 1).toBe(true);
      }
      for (const b of blockers) {
        let open = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const i0 = (b.y + dy - grid.y0) * grid.width + (b.x + dx - grid.x0);
          if (seen[i0] === 1) open++;
        }
        expect(open).toBeGreaterThan(0);
      }
    }
  });

  it('стартовые списки зависят от seed', () => {
    const a = JSON.stringify(planStarterFor(testSeed(1)));
    expect(JSON.stringify(planStarterFor(testSeed(1)))).toBe(a);
    expect(JSON.stringify(planStarterFor(testSeed(2)))).not.toBe(a);
  });
});

/** Стартовый список по дешёвому полю тайлов: настоящий рельеф только в окне вокруг старта. */
function planStarterFor(seed: number): ReturnType<typeof planStarterObjects> {
  return planStarterObjects(seed, windowTiles(seed), data);
}

function windowTiles(seed: number): Uint8Array {
  const sampler = createTerrainSampler(seed, params);
  const tiles = new Uint8Array(WORLD_TILES * WORLD_TILES).fill(Tile.Water);
  const r = data.start.ringMax + 3;
  for (let y = START_TILE - r; y <= START_TILE + r; y++) {
    for (let x = START_TILE - r; x <= START_TILE + r; x++) {
      tiles[y * WORLD_TILES + x] = sampler.cell(x, y).tile;
    }
  }
  return tiles;
}

function startWindow(seed: number, starter: ReturnType<typeof planStarterObjects>): PassGrid {
  const tiles = windowTiles(seed);
  const objects: WorldObject[] = starter.map((s, k) => ({
    id: `s${k}`,
    type: s.type,
    x: s.x,
    y: s.y,
  }));
  const full = createWorldPassGrid(tiles, objects, data);
  const r = data.start.ringMax + 3;
  const size = r * 2 + 1;
  const grid = {
    x0: START_TILE - r,
    y0: START_TILE - r,
    width: size,
    height: size,
    blocked: new Uint8Array(size * size),
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      grid.blocked[y * size + x] = isFree(full, grid.x0 + x, grid.y0 + y) ? 0 : 1;
    }
  }
  return grid;
}

describe('scatter + ChunkManager: загрузка и выгрузка без дублей', () => {
  it('объекты загруженных чанков никогда не дублируются и совпадают с эталоном при повторной загрузке', () => {
    const generator = new WorldGenerator('M0-DEMO');
    const bus = new EventBus<GameEvents>();
    const manager = new ChunkManager(generator, bus, {
      loadRadius: 2,
      unloadRadius: 3,
      maxCached: 4,
    });
    const reference = new Map<string, WorldObject[]>();
    const route: Array<[number, number]> = [];
    for (let t = 20; t < 236; t += 24) route.push([t, 128]);
    for (let t = 236; t > 20; t -= 24) route.push([t, 90]);
    for (const [tx, ty] of route) {
      manager.update(tx, ty);
      while (manager.step(2) > 0) {
        const seenIds = new Set<string>();
        const seenCells = new Set<number>();
        for (const chunk of manager.loaded()) {
          const key = `${chunk.cx}:${chunk.cy}`;
          const expected = reference.get(key);
          if (expected) expect(chunk.objects).toEqual(expected);
          else
            reference.set(
              key,
              chunk.objects.map((o) => ({ ...o })),
            );
          for (const o of chunk.objects) {
            expect(seenIds.has(o.id)).toBe(false);
            seenIds.add(o.id);
            for (const cell of cellsOf(o)) {
              expect(seenCells.has(cell)).toBe(false);
              seenCells.add(cell);
            }
          }
        }
      }
    }
    // Выгрузка и новая загрузка возвращают те же данные.
    manager.unloadAll();
    expect(manager.loaded()).toHaveLength(0);
    manager.update(128, 128);
    while (manager.step(5) > 0) {
      /* догрузка */
    }
    for (const chunk of manager.loaded()) {
      expect(chunk.objects).toEqual(generator.generateChunk(chunk.cx, chunk.cy).objects);
    }
  });
});

describe('golden: хеш мира чувствителен к объектам', () => {
  it('удаление или сдвиг объекта меняет хеш мира', () => {
    const generator = new WorldGenerator('LAST SIGNAL');
    const chunks: Chunk[] = [];
    for (const [cx, cy] of rowMajor()) chunks.push(generator.generateChunk(cx, cy));
    const base = hashWorld(generator.worldGenVersion, generator.seed, chunks);
    expect(base).toBe(generator.worldHash());
    const victim = chunks.find((c) => c.objects.length > 3) as Chunk;
    const saved = victim.objects.slice();
    victim.objects.pop();
    expect(hashWorld(generator.worldGenVersion, generator.seed, chunks)).not.toBe(base);
    victim.objects = saved.map((o, k) => (k === 0 ? { ...o, x: o.x + 1 } : o));
    expect(hashWorld(generator.worldGenVersion, generator.seed, chunks)).not.toBe(base);
  });
});
