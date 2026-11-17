import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_CHUNKS, WORLD_GEN_VERSION } from '../../src/config.ts';
import { EventBus } from '../../src/core/EventBus.ts';
import type { GameEvents } from '../../src/core/events.ts';
import { ChunkManager } from '../../src/systems/world/ChunkManager.ts';
import type { ChunkManagerOptions } from '../../src/systems/world/ChunkManager.ts';
import { hashWorld } from '../../src/systems/world/checksum.ts';
import { WorldGenerator } from '../../src/systems/world/WorldGenerator.ts';
import type { ChunkSource } from '../../src/systems/world/WorldGenerator.ts';
import type { Chunk } from '../../src/systems/world/types.ts';

/** Дешёвый источник чанков со счётчиком вызовов: проверяем, когда менеджер генерирует заново. */
class FakeSource implements ChunkSource {
  calls: string[] = [];
  generateChunk(cx: number, cy: number): Chunk {
    this.calls.push(`${cx}:${cy}`);
    return {
      cx,
      cy,
      tiles: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill((cx + cy) & 7),
      biomes: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
      objects: [],
    };
  }
}

const tileOf = (chunk: number): number => chunk * CHUNK_SIZE + 5;

function setup(options: Partial<ChunkManagerOptions> = {}) {
  const source = new FakeSource();
  const bus = new EventBus<GameEvents>();
  const log: string[] = [];
  bus.on('chunk:loaded', ({ cx, cy }) => log.push(`+${cx}:${cy}`));
  bus.on('chunk:unloaded', ({ cx, cy }) => log.push(`-${cx}:${cy}`));
  const manager = new ChunkManager(source, bus, {
    loadRadius: 1,
    unloadRadius: 2,
    maxCached: 25,
    ...options,
  });
  return { source, bus, log, manager };
}

/** Догружает всю очередь. */
function drain(manager: ChunkManager): void {
  while (manager.step(100) > 0) {
    /* пока есть что грузить */
  }
}

describe('ChunkManager: параметры', () => {
  it('проверяет радиусы и размер кэша', () => {
    const source = new FakeSource();
    const bus = new EventBus<GameEvents>();
    const make = (o: ChunkManagerOptions) => () => new ChunkManager(source, bus, o);
    expect(make({ loadRadius: -1, unloadRadius: 2, maxCached: 0 })).toThrow(RangeError);
    expect(make({ loadRadius: 1.5, unloadRadius: 3, maxCached: 0 })).toThrow(RangeError);
    expect(make({ loadRadius: 2, unloadRadius: 2, maxCached: 0 })).toThrow(RangeError);
    expect(make({ loadRadius: 2, unloadRadius: 3, maxCached: -1 })).toThrow(RangeError);
    expect(make({ loadRadius: 2, unloadRadius: 3, maxCached: 0 })).not.toThrow();
  });

  it('update и step отвергают некорректные аргументы', () => {
    const { manager } = setup();
    expect(() => manager.update(Number.NaN, 0)).toThrow(RangeError);
    expect(() => manager.update(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => manager.step(0)).toThrow(RangeError);
    expect(() => manager.step(1.5)).toThrow(RangeError);
  });
});

describe('ChunkManager: загрузка', () => {
  it('ставит чанки в очередь, step грузит по бюджету, центр первым', () => {
    const { manager, log } = setup();
    manager.update(tileOf(4), tileOf(4));
    expect(manager.pendingCount()).toBe(9);
    expect(manager.loaded()).toEqual([]);

    expect(manager.step()).toBe(1);
    expect(log).toEqual(['+4:4']);
    expect(manager.step(3)).toBe(3);
    expect(log).toEqual(['+4:4', '+3:4', '+4:3', '+4:5']);
    expect(manager.pendingCount()).toBe(5);
    expect(manager.step(100)).toBe(5);
    expect(manager.step()).toBe(0);
    expect(log).toHaveLength(9);
  });

  it('loaded() идёт в порядке (cy, cx); get возвращает только активные чанки', () => {
    const { manager } = setup();
    manager.update(tileOf(4), tileOf(4));
    drain(manager);
    expect(manager.loaded().map((c) => `${c.cx}:${c.cy}`)).toEqual([
      '3:3',
      '4:3',
      '5:3',
      '3:4',
      '4:4',
      '5:4',
      '3:5',
      '4:5',
      '5:5',
    ]);
    expect(manager.get(4, 4)?.cx).toBe(4);
    expect(manager.get(0, 0)).toBeUndefined();
    expect(manager.get(-1, 0)).toBeUndefined();
    expect(manager.get(8, 0)).toBeUndefined();
    expect(manager.get(1.5, 0)).toBeUndefined();
  });

  it('повторный update без смены чанка ничего не меняет и событий не даёт', () => {
    const { manager, log } = setup();
    manager.update(tileOf(4), tileOf(4));
    manager.step(2);
    const pending = manager.pendingCount();
    const before = log.length;
    manager.update(tileOf(4) + 3, tileOf(4) + 9);
    manager.update(tileOf(4), tileOf(4));
    expect(manager.pendingCount()).toBe(pending);
    expect(log).toHaveLength(before);
  });

  it('чанки вне мира не создаются: в углу мира 4 чанка, за пределами ничего', () => {
    const corner = setup();
    corner.manager.update(5, 5);
    drain(corner.manager);
    expect(corner.manager.loaded().map((c) => `${c.cx}:${c.cy}`)).toEqual([
      '0:0',
      '1:0',
      '0:1',
      '1:1',
    ]);

    const far = setup();
    far.manager.update(-5000, -5000);
    expect(far.manager.pendingCount()).toBe(0);
    far.manager.update(1e6, 0);
    expect(far.manager.pendingCount()).toBe(0);
    expect(far.log).toEqual([]);
  });

  it('дробные и отрицательные координаты центра переводятся в чанк вниз', () => {
    const { manager } = setup({ loadRadius: 0, unloadRadius: 1 });
    manager.update(tileOf(2) + 0.9, tileOf(3) + 0.1);
    drain(manager);
    expect(manager.loaded().map((c) => `${c.cx}:${c.cy}`)).toEqual(['2:3']);
    manager.update(-0.5, -0.5);
    expect(manager.pendingCount()).toBe(0);
  });

  it('если центр сместился до догрузки, лишние чанки не загружаются', () => {
    const { manager, source } = setup({ loadRadius: 1, unloadRadius: 2 });
    manager.update(tileOf(1), tileOf(1));
    manager.update(tileOf(6), tileOf(6));
    drain(manager);
    expect(source.calls.every((k) => Number(k.split(':')[0]) >= 5)).toBe(true);
    expect(manager.loaded()).toHaveLength(9);
  });
});

describe('ChunkManager: выгрузка и гистерезис', () => {
  it('чанк на расстоянии выгрузки остаётся, дальше — выгружается ровно один раз', () => {
    const { manager, log } = setup();
    manager.update(tileOf(4), tileOf(4));
    drain(manager);
    log.length = 0;

    manager.update(tileOf(5), tileOf(4)); // столбец 3 на расстоянии 2 ≤ unloadRadius
    expect(log).toEqual([]);
    expect(manager.pendingCount()).toBe(3);
    drain(manager);
    expect(log).toEqual(['+6:4', '+6:3', '+6:5']);
    log.length = 0;

    manager.update(tileOf(6), tileOf(4)); // столбец 3 на расстоянии 3 > 2
    expect(log).toEqual(['-3:3', '-3:4', '-3:5']);
    expect(manager.get(3, 4)).toBeUndefined();
    log.length = 0;
    manager.update(tileOf(6) + 1, tileOf(4)); // тот же чанк центра
    expect(log).toEqual([]);
  });

  it('события выгрузки идут в порядке (cy, cx), а состояние согласовано до события', () => {
    const { manager, bus } = setup();
    manager.update(tileOf(4), tileOf(4));
    drain(manager);
    const seen: string[] = [];
    bus.on('chunk:unloaded', ({ cx, cy }) =>
      seen.push(`${cx}:${cy}:${manager.get(cx, cy) === undefined}`),
    );
    manager.update(tileOf(0), tileOf(0)); // все девять чанков дальше радиуса выгрузки
    expect(seen).toEqual([
      '3:3:true',
      '4:3:true',
      '5:3:true',
      '3:4:true',
      '4:4:true',
      '5:4:true',
      '3:5:true',
      '4:5:true',
      '5:5:true',
    ]);
  });

  it('обработчик события может вызвать update: состояние остаётся согласованным', () => {
    const { manager, bus, log } = setup({ loadRadius: 0, unloadRadius: 1 });
    manager.update(tileOf(1), tileOf(1));
    let reentered = false;
    bus.on('chunk:loaded', () => {
      if (reentered) return;
      reentered = true;
      manager.update(tileOf(6), tileOf(6)); // чанк (1, 1) уже активен и теперь слишком далеко
    });
    manager.step();
    expect(log).toEqual(['+1:1', '-1:1']);
    expect(manager.get(1, 1)).toBeUndefined();
    expect(manager.pendingCount()).toBe(1);
    manager.step();
    expect(manager.get(6, 6)?.cx).toBe(6);
    expect(log).toEqual(['+1:1', '-1:1', '+6:6']);
  });

  it('unloadAll выгружает всё, пустит очередь заново и даёт события', () => {
    const { manager, log } = setup();
    manager.update(tileOf(4), tileOf(4));
    manager.step(5);
    log.length = 0;
    manager.unloadAll();
    expect(log).toEqual(['-4:3', '-3:4', '-4:4', '-5:4', '-4:5']);
    expect(manager.loaded()).toEqual([]);
    expect(manager.pendingCount()).toBe(0);
    manager.update(tileOf(4), tileOf(4)); // центр сброшен: очередь строится заново
    expect(manager.pendingCount()).toBe(9);
  });
});

describe('ChunkManager: кэш', () => {
  it('вернувшийся чанк берётся из кэша без повторной генерации', () => {
    const { manager, source } = setup({ loadRadius: 0, unloadRadius: 1, maxCached: 4 });
    manager.update(tileOf(1), tileOf(1));
    manager.step();
    const first = manager.get(1, 1);
    manager.update(tileOf(5), tileOf(1));
    manager.step();
    expect(manager.get(1, 1)).toBeUndefined();
    manager.update(tileOf(1), tileOf(1));
    manager.step();
    expect(source.calls).toEqual(['1:1', '5:1']);
    expect(manager.get(1, 1)).toBe(first);
  });

  it('при переполнении вытесняется давно выгруженный; повторная генерация даёт тот же результат', () => {
    const { manager, source } = setup({ loadRadius: 0, unloadRadius: 1, maxCached: 2 });
    const first = new Map<string, Chunk>();
    for (const c of [1, 3, 5, 7]) {
      manager.update(tileOf(c), tileOf(0));
      manager.step();
      first.set(`${c}`, manager.get(c, 0) as Chunk);
    }
    // Активен 7; в кэше 3 и 5 (1 вытеснен: кэш держит двух последних выгруженных).
    expect(source.calls).toEqual(['1:0', '3:0', '5:0', '7:0']);
    manager.update(tileOf(1), tileOf(0));
    manager.step();
    expect(source.calls).toEqual(['1:0', '3:0', '5:0', '7:0', '1:0']);
    const again = manager.get(1, 0) as Chunk;
    expect(again).not.toBe(first.get('1'));
    expect(Array.from(again.tiles)).toEqual(Array.from((first.get('1') as Chunk).tiles));
    // Выгрузка идёт при update, до step: чанк 7 и затем 1 вытесняют 3 и 5 из кэша из двух мест.
    manager.update(tileOf(5), tileOf(0));
    manager.step();
    expect(source.calls).toEqual(['1:0', '3:0', '5:0', '7:0', '1:0', '5:0']);
  });

  it('maxCached = 0: выгруженные чанки не хранятся', () => {
    const { manager, source } = setup({ loadRadius: 0, unloadRadius: 1, maxCached: 0 });
    manager.update(tileOf(1), tileOf(1));
    manager.step();
    manager.update(tileOf(5), tileOf(1));
    manager.step();
    manager.update(tileOf(1), tileOf(1));
    manager.step();
    expect(source.calls).toEqual(['1:1', '5:1', '1:1']);
  });

  it('число хранимых чанков ограничено: активные + кэш ≤ окно + maxCached', () => {
    const { manager } = setup({ loadRadius: 1, unloadRadius: 2, maxCached: 5 });
    let maxLoaded = 0;
    for (let i = 0; i < 40; i++) {
      manager.update(tileOf(i % WORLD_CHUNKS), tileOf(Math.floor(i / 5) % WORLD_CHUNKS));
      drain(manager);
      maxLoaded = Math.max(maxLoaded, manager.loaded().length);
    }
    expect(maxLoaded).toBeLessThanOrEqual(25); // окно радиуса unloadRadius = 2: 5×5
  });
});

describe('ChunkManager с настоящим генератором', () => {
  it('радиус во весь мир: загружены 64 чанка, хеш равен хешу мира, повторяем в другом порядке', () => {
    const gen = new WorldGenerator('M0-DEMO');
    const reference = gen.worldHash();
    const orders: Array<[number, number]> = [
      [0, 0],
      [255, 255],
      [128, 40],
    ];
    for (const [x, y] of orders) {
      const bus = new EventBus<GameEvents>();
      const manager = new ChunkManager(gen, bus, { loadRadius: 8, unloadRadius: 9, maxCached: 0 });
      manager.update(x, y);
      drain(manager);
      const chunks = manager.loaded();
      expect(chunks).toHaveLength(WORLD_CHUNKS * WORLD_CHUNKS);
      expect(hashWorld(WORLD_GEN_VERSION, gen.seed, chunks)).toBe(reference);
    }
  });

  it('прогулка по миру: чанки согласованы с прямой генерацией', () => {
    const gen = new WorldGenerator('WALK');
    const bus = new EventBus<GameEvents>();
    const manager = new ChunkManager(gen, bus, { loadRadius: 1, unloadRadius: 2, maxCached: 10 });
    for (let step = 0; step < 60; step++) {
      manager.update(step * 4 + 3, 256 - step * 4);
      manager.step(2);
    }
    drain(manager);
    for (const chunk of manager.loaded()) {
      const fresh = gen.generateChunk(chunk.cx, chunk.cy);
      expect(Array.from(chunk.tiles)).toEqual(Array.from(fresh.tiles));
      expect(Array.from(chunk.biomes)).toEqual(Array.from(fresh.biomes));
    }
  });
});
