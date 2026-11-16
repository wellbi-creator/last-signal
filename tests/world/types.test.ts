import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../src/config.ts';
import { Biome, Tile } from '../../src/systems/world/types.ts';
import type { Chunk } from '../../src/systems/world/types.ts';

describe('коды Tile и Biome', () => {
  it('значения зафиксированы: они пишутся в Uint8Array и входят в хеш мира', () => {
    expect(Tile).toEqual({
      Water: 0,
      Sand: 1,
      Grass: 2,
      Forest: 3,
      Stone: 4,
      Mud: 5,
      Concrete: 6,
      Path: 7,
    });
    expect(Biome).toEqual({ Water: 0, Coast: 1, Plains: 2, Forest: 3, Rocks: 4, Swamp: 5 });
  });

  it('коды уникальны и помещаются в байт', () => {
    for (const table of [Tile, Biome]) {
      const values: number[] = Object.values(table);
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(256);
      }
    }
  });
});

describe('Chunk', () => {
  it('состоит из массивов размера CHUNK_SIZE × CHUNK_SIZE и сериализуемых объектов', () => {
    const area = CHUNK_SIZE * CHUNK_SIZE;
    const chunk: Chunk = {
      cx: 2,
      cy: 3,
      tiles: new Uint8Array(area).fill(Tile.Grass),
      biomes: new Uint8Array(area).fill(Biome.Plains),
      objects: [{ id: '2:3:0', type: 'tree_pine', x: 64, y: 96 }],
    };
    expect(chunk.tiles).toHaveLength(1024);
    expect(chunk.biomes).toHaveLength(1024);
    expect(JSON.parse(JSON.stringify(chunk.objects))).toEqual(chunk.objects);
  });
});
