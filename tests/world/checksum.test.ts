import { describe, expect, it } from 'vitest';
import { WORLD_CHUNKS, WORLD_GEN_VERSION } from '../../src/config.ts';
import { Hash64, hashChunk, hashWorld } from '../../src/systems/world/checksum.ts';
import { WorldGenerator } from '../../src/systems/world/WorldGenerator.ts';
import type { Chunk, WorldObject } from '../../src/systems/world/types.ts';

const gen = new WorldGenerator('CHECKSUM');

function worldChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (let cy = 0; cy < WORLD_CHUNKS; cy++) {
    for (let cx = 0; cx < WORLD_CHUNKS; cx++) chunks.push(gen.generateChunk(cx, cy));
  }
  // Несколько объектов в одном чанке, чтобы проверить чувствительность к ним.
  const objects: WorldObject[] = [
    { id: '2:2:0', type: 'tree_pine', x: 70, y: 70 },
    { id: '2:2:1', type: 'rock_small', x: 71, y: 72 },
    { id: '2:2:2', type: 'ruin_wall', x: 80, y: 66, poi: 'radio_center_01' },
  ];
  chunks[2 * WORLD_CHUNKS + 2] = { ...(chunks[2 * WORLD_CHUNKS + 2] as Chunk), objects };
  return chunks;
}

function clone(chunks: Chunk[]): Chunk[] {
  return chunks.map((c) => ({
    ...c,
    tiles: c.tiles.slice(),
    biomes: c.biomes.slice(),
    objects: c.objects.map((o) => ({ ...o })),
  }));
}

const BASE = worldChunks();
const BASE_HASH = hashWorld(WORLD_GEN_VERSION, gen.seed, BASE);
const TARGET = 2 * WORLD_CHUNKS + 2;

function changed(change: (chunks: Chunk[], target: Chunk) => void): string {
  const copy = clone(BASE);
  change(copy, copy[TARGET] as Chunk);
  return hashWorld(WORLD_GEN_VERSION, gen.seed, copy);
}

describe('Hash64', () => {
  it('детерминирован, 16 знаков, зависит от порядка и числа значений', () => {
    const make = (values: number[]): string => {
      const h = new Hash64();
      for (const v of values) h.add(v);
      return h.digest();
    };
    expect(make([1, 2, 3])).toBe(make([1, 2, 3]));
    expect(make([1, 2, 3])).toMatch(/^[0-9a-f]{16}$/);
    expect(make([1, 2, 3])).not.toBe(make([3, 2, 1]));
    expect(make([1, 2])).not.toBe(make([1, 2, 0]));
    expect(make([])).not.toBe(make([0]));
  });

  it('разные входы не дают совпадений на 5000 последовательных числах', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const h = new Hash64();
      h.add(i);
      seen.add(h.digest());
    }
    expect(seen.size).toBe(5000);
  });

  it('оба 32-битных потока меняются независимо (нет вырождения в 32 бита)', () => {
    const halves = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const h = new Hash64();
      h.add(i);
      halves.add(h.digest().slice(8));
    }
    expect(halves.size).toBe(2000);
  });

  it('метки разделов не дают «склейки» соседних данных', () => {
    const a = new Hash64();
    a.section(1, 2);
    a.add(5);
    a.section(2, 0);
    const b = new Hash64();
    b.section(1, 1);
    b.add(5);
    b.section(2, 1);
    b.add(0);
    expect(a.digest()).not.toBe(b.digest());
  });

  it('addBytes различает длину и содержимое, включая неполное слово', () => {
    const hash = (bytes: number[]): string => {
      const h = new Hash64();
      h.addBytes(Uint8Array.from(bytes));
      return h.digest();
    };
    expect(hash([1, 2, 3])).not.toBe(hash([1, 2, 3, 0]));
    expect(hash([1, 2, 3, 4, 5])).not.toBe(hash([1, 2, 3, 4, 6]));
    expect(hash([0, 0, 0, 0])).not.toBe(hash([0, 0, 0]));
  });
});

describe('hashWorld: чувствительность (план, раздел 7.3)', () => {
  it('повторный расчёт даёт тот же хеш', () => {
    expect(hashWorld(WORLD_GEN_VERSION, gen.seed, BASE)).toBe(BASE_HASH);
    expect(BASE_HASH).toMatch(/^[0-9a-f]{16}$/);
  });

  it('меняется при изменении одного тайла', () => {
    expect(changed((_, t) => (t.tiles[500] = ((t.tiles[500] ?? 0) + 1) & 7))).not.toBe(BASE_HASH);
  });

  it('меняется при изменении одного биома', () => {
    expect(changed((_, t) => (t.biomes[0] = ((t.biomes[0] ?? 0) + 1) & 7))).not.toBe(BASE_HASH);
  });

  it('меняется при изменении тайла в первом и последнем чанках мира', () => {
    expect(changed((c) => (c[0]!.tiles[0] = ((c[0]!.tiles[0] ?? 0) + 1) & 7))).not.toBe(BASE_HASH);
    const last = WORLD_CHUNKS * WORLD_CHUNKS - 1;
    expect(changed((c) => (c[last]!.tiles[1023] = ((c[last]!.tiles[1023] ?? 0) + 1) & 7))).not.toBe(
      BASE_HASH,
    );
  });

  it('меняется при изменении типа, координат, id и принадлежности объекта', () => {
    expect(changed((_, t) => (t.objects[0]!.type = 'tree_dead'))).not.toBe(BASE_HASH);
    expect(changed((_, t) => (t.objects[1]!.x += 1))).not.toBe(BASE_HASH);
    expect(changed((_, t) => (t.objects[1]!.y += 1))).not.toBe(BASE_HASH);
    expect(changed((_, t) => (t.objects[0]!.id = '2:2:9'))).not.toBe(BASE_HASH);
    expect(changed((_, t) => (t.objects[2]!.poi = 'radio_center_02'))).not.toBe(BASE_HASH);
    expect(changed((_, t) => delete t.objects[2]!.poi)).not.toBe(BASE_HASH);
    expect(changed((_, t) => (t.objects[0]!.poi = 'a'))).not.toBe(BASE_HASH);
  });

  it('меняется при добавлении и удалении объекта', () => {
    expect(changed((_, t) => t.objects.push({ id: '2:2:3', type: 'bush', x: 1, y: 1 }))).not.toBe(
      BASE_HASH,
    );
    expect(changed((_, t) => t.objects.pop())).not.toBe(BASE_HASH);
    expect(changed((_, t) => (t.objects.length = 0))).not.toBe(BASE_HASH);
  });

  it('меняется при перестановке двух объектов местами', () => {
    expect(
      changed((_, t) => {
        const [a, b] = [t.objects[0] as WorldObject, t.objects[1] as WorldObject];
        t.objects[0] = b;
        t.objects[1] = a;
      }),
    ).not.toBe(BASE_HASH);
  });

  it('меняется при смене версии генератора и seed', () => {
    expect(hashWorld(WORLD_GEN_VERSION + 1, gen.seed, BASE)).not.toBe(BASE_HASH);
    expect(hashWorld(WORLD_GEN_VERSION, gen.seed + 1, BASE)).not.toBe(BASE_HASH);
  });

  it('требует все чанки мира в порядке (cy, cx)', () => {
    expect(() => hashWorld(WORLD_GEN_VERSION, gen.seed, BASE.slice(1))).toThrow(RangeError);
    const swapped = BASE.slice();
    swapped[0] = BASE[1] as Chunk;
    swapped[1] = BASE[0] as Chunk;
    expect(() => hashWorld(WORLD_GEN_VERSION, gen.seed, swapped)).toThrow(RangeError);
  });
});

describe('hashChunk', () => {
  it('учитывает координаты чанка и содержимое', () => {
    const a = gen.generateChunk(1, 1);
    const moved = { ...a, cx: 2 };
    expect(hashChunk(moved)).not.toBe(hashChunk(a));
    const edited = { ...a, tiles: a.tiles.slice() };
    edited.tiles[10] = ((edited.tiles[10] ?? 0) + 1) & 7;
    expect(hashChunk(edited)).not.toBe(hashChunk(a));
    expect(hashChunk(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('отвергает чанк неверного размера', () => {
    const a = gen.generateChunk(0, 0);
    expect(() => hashChunk({ ...a, tiles: new Uint8Array(10) })).toThrow(RangeError);
  });
});
