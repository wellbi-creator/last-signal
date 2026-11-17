import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_CHUNKS, WORLD_TILES } from '../../src/config.ts';
import { hashInts } from '../../src/core/Rng.ts';
import {
  classifyTerrain,
  createTerrainSampler,
  generateTerrainGrid,
  smoothstep,
} from '../../src/systems/world/terrain.ts';
import { Biome, Tile } from '../../src/systems/world/types.ts';
import { loadWorldGenParams } from '../../src/systems/world/worldData.ts';

const params = loadWorldGenParams();
const CENTER = WORLD_TILES / 2;

/** Контрольный хеш массива (FNV-1a, 32 бита): только для тестов. */
function checksum(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('smoothstep', () => {
  it('0 до a, 1 после b, 0.5 посередине', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(10, 20, 15)).toBe(0.5);
  });
});

describe('classifyTerrain (порядок условий и пороги)', () => {
  const dry = 0.3;
  const cases: Array<[number, number, number, number]> = [
    [0.1, dry, Tile.Water, Biome.Water],
    [0.279, 0.9, Tile.Water, Biome.Water],
    [0.28, dry, Tile.Sand, Biome.Coast],
    [0.329, 0.9, Tile.Sand, Biome.Coast],
    [0.8, 0.9, Tile.Stone, Biome.Rocks],
    [0.4, 0.7, Tile.Mud, Biome.Swamp],
    [0.55, 0.7, Tile.Forest, Biome.Forest],
    [0.4, 0.5, Tile.Forest, Biome.Forest],
    [0.5, dry, Tile.Grass, Biome.Plains],
  ];
  for (const [e, m, tile, biome] of cases) {
    it(`e=${e} m=${m} → тайл ${tile}, биом ${biome}`, () => {
      expect(classifyTerrain(e, m, params)).toEqual({ tile, biome });
    });
  }
});

describe('рельеф: детерминизм', () => {
  it('один seed — одинаковое поле; разные seed — разные', () => {
    const a = generateTerrainGrid(777, params);
    const b = generateTerrainGrid(777, params);
    const c = generateTerrainGrid(778, params);
    expect(checksum(a.tiles)).toBe(checksum(b.tiles));
    expect(checksum(a.biomes)).toBe(checksum(b.biomes));
    expect(checksum(a.tiles)).not.toBe(checksum(c.tiles));
  });

  it('тайл согласован с биомом в каждой клетке', () => {
    const { tiles, biomes } = generateTerrainGrid(31337, params);
    const expected: Record<number, number> = {
      [Biome.Water]: Tile.Water,
      [Biome.Coast]: Tile.Sand,
      [Biome.Plains]: Tile.Grass,
      [Biome.Forest]: Tile.Forest,
      [Biome.Rocks]: Tile.Stone,
      [Biome.Swamp]: Tile.Mud,
    };
    for (let i = 0; i < tiles.length; i++) expect(tiles[i]).toBe(expected[biomes[i] ?? -1]);
  });

  it('«золотые» контрольные суммы фиксируют алгоритм (меняются только с WORLD_GEN_VERSION)', () => {
    const result: Record<string, [number, number]> = {};
    for (const seed of [0, 12345, 4000000000]) {
      const { tiles, biomes } = generateTerrainGrid(seed, params);
      result[String(seed)] = [checksum(tiles), checksum(biomes)];
    }
    expect(result).toEqual(GOLDEN);
  });
});

describe('рельеф: стабильность границ чанков', () => {
  const seed = hashInts(4242, 1);
  const sampler = createTerrainSampler(seed, params);
  const whole = generateTerrainGrid(seed, params);

  it('чанки в любом порядке (прямом, обратном, перемешанном) дают то же поле, что весь мир', () => {
    const coords: Array<[number, number]> = [];
    for (let cy = 0; cy < WORLD_CHUNKS; cy++)
      for (let cx = 0; cx < WORLD_CHUNKS; cx++) coords.push([cx, cy]);
    const orders = [
      coords,
      coords.slice().reverse(),
      coords.slice().sort((a, b) => hashInts(seed, a[0], a[1]) - hashInts(seed, b[0], b[1])),
    ];
    for (const order of orders) {
      const tiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
      for (const [cx, cy] of order) {
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const tx = cx * CHUNK_SIZE + lx;
            const ty = cy * CHUNK_SIZE + ly;
            tiles[ty * WORLD_TILES + tx] = sampler.cell(tx, ty).tile;
          }
        }
      }
      expect(checksum(tiles)).toBe(checksum(whole.tiles));
    }
  });

  it('поле непрерывно через границы чанков: скачки не больше, чем внутри чанков', () => {
    let maxInside = 0;
    let maxAcross = 0;
    for (let ty = 0; ty < WORLD_TILES; ty += 3) {
      for (let tx = 0; tx < WORLD_TILES - 1; tx++) {
        const jump = Math.abs(
          sampler.fields(tx + 1, ty).elevation - sampler.fields(tx, ty).elevation,
        );
        if ((tx + 1) % CHUNK_SIZE === 0) maxAcross = Math.max(maxAcross, jump);
        else maxInside = Math.max(maxInside, jump);
      }
    }
    expect(maxAcross).toBeLessThanOrEqual(maxInside);
    expect(maxInside).toBeLessThan(0.15);
  });
});

describe('рельеф: стартовая зона', () => {
  it('на 200 seed радиус 12 вокруг центра — только равнина (без воды, болота, скал, леса)', () => {
    for (let i = 0; i < 200; i++) {
      const sampler = createTerrainSampler(hashInts(9000, i), params);
      for (let ty = CENTER - 13; ty <= CENTER + 12; ty++) {
        for (let tx = CENTER - 13; tx <= CENTER + 12; tx++) {
          const dx = tx + 0.5 - CENTER;
          const dy = ty + 0.5 - CENTER;
          if (dx * dx + dy * dy > 12 * 12) continue;
          expect(sampler.cell(tx, ty).biome, `seed #${i} клетка ${tx},${ty}`).toBe(Biome.Plains);
        }
      }
    }
  });

  it('вблизи центра нет воды, дальше стартовая зона плавно смыкается с рельефом', () => {
    const sampler = createTerrainSampler(hashInts(9000, 7), params);
    for (let ty = CENTER - 20; ty < CENTER + 20; ty++) {
      for (let tx = CENTER - 20; tx < CENTER + 20; tx++) {
        const f = sampler.fields(tx, ty);
        expect(f.elevation).toBeGreaterThan(params.thresholds.water);
      }
    }
  });
});

describe('рельеф: доли биомов на 50 seed (приёмочные диапазоны плана, раздел 8)', () => {
  const ranges: Array<[string, number, number, number]> = [
    ['вода', Biome.Water, 0.15, 0.35],
    ['побережье', Biome.Coast, 0.03, 0.1],
    ['равнина', Biome.Plains, 0.12, 0.36],
    ['лес', Biome.Forest, 0.15, 0.38],
    ['скалы', Biome.Rocks, 0.02, 0.22],
    ['болото', Biome.Swamp, 0.03, 0.13],
  ];

  it('каждый биом в допустимом диапазоне на каждом seed; мир окружён морем', () => {
    for (let i = 0; i < 50; i++) {
      const seed = hashInts(2000, i);
      const { biomes } = generateTerrainGrid(seed, params);
      const counts = new Array<number>(6).fill(0);
      for (const b of biomes) counts[b] = (counts[b] ?? 0) + 1;
      for (const [name, biome, min, max] of ranges) {
        const share = (counts[biome] ?? 0) / biomes.length;
        expect(share, `seed #${i}: ${name}`).toBeGreaterThanOrEqual(min);
        expect(share, `seed #${i}: ${name}`).toBeLessThanOrEqual(max);
      }
      // Угол мира — вода (край затухает в море).
      expect(biomes[0]).toBe(Biome.Water);
      expect(biomes[biomes.length - 1]).toBe(Biome.Water);
    }
  });
});

// Коды Tile и Biome совпадают, поэтому суммы тайлов и биомов равны. Значения меняются
// только вместе с WORLD_GEN_VERSION.
const GOLDEN: Record<string, [number, number]> = {
  '0': [2938593087, 2938593087],
  '12345': [700314680, 700314680],
  '4000000000': [1385785519, 1385785519],
};
