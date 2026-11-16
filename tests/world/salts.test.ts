import { describe, expect, it } from 'vitest';
import { SALT } from '../../src/systems/world/salts.ts';

describe('реестр salt', () => {
  it('значения зафиксированы (менять можно только вместе с WORLD_GEN_VERSION)', () => {
    // Если этот тест упал, изменился алгоритм генерации мира. Нужно поднять WORLD_GEN_VERSION
    // в config.ts и сознательно обновить ожидаемые значения здесь (и «золотые» хеши миров).
    expect(SALT).toEqual({
      ELEVATION: 1,
      MOISTURE: 2,
      CLUSTER: 3,
      LAYER_BUILDINGS: 10,
      LAYER_DEPOSITS: 11,
      LAYER_TREES: 12,
      LAYER_ROCKS: 13,
      LAYER_BUSHES: 14,
      STARTER: 20,
      POI: 30,
      TRAIL: 40,
    });
  });

  it('все значения — уникальные положительные целые', () => {
    const values: number[] = [];
    for (const name of Object.keys(SALT) as Array<keyof typeof SALT>) values.push(SALT[name]);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });
});
