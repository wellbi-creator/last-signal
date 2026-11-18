import { describe, expect, it } from 'vitest';
import objectsJson from '../../src/data/objects.json' with { type: 'json' };
import {
  findObjectType,
  loadObjectsData,
  ObjectsDataError,
  parseObjectsData,
} from '../../src/systems/world/objectData.ts';
import { Biome, Tile } from '../../src/systems/world/types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function mutated(change: (copy: Json) => void): unknown {
  const copy = JSON.parse(JSON.stringify(objectsJson)) as Json;
  change(copy);
  return copy;
}

describe('objects.json', () => {
  it('исходные данные проходят проверку и кэшируются', () => {
    const data = loadObjectsData();
    expect(data.layers.map((l) => l.id)).toEqual([
      'buildings',
      'deposits',
      'trees',
      'rocks',
      'bushes',
    ]);
    expect(data.layers.map((l) => l.blocks)).toEqual([true, true, true, true, false]);
    expect(loadObjectsData()).toBe(data);
  });

  it('содержит утверждённый набор типов', () => {
    const data = loadObjectsData();
    const names = data.layers.flatMap((l) => l.types.map((t) => t.type));
    expect(names).toEqual([
      'ruin_house_a',
      'ruin_house_b',
      'ruin_shed',
      'iron_ore',
      'scrap_pile',
      'peat',
      'tree_pine',
      'tree_dead',
      'fallen_log',
      'boulder',
      'boulder_large',
      'bush',
      'reeds',
    ]);
    const house = findObjectType(data, 'ruin_house_a');
    expect([house?.def.w, house?.def.h]).toEqual([6, 5]);
    expect(findObjectType(data, 'нет такого')).toBeUndefined();
  });

  it('вода не допустима ни для одного типа, ни в одном биоме', () => {
    for (const layer of loadObjectsData().layers) {
      expect(layer.density[Biome.Water]).toBe(0);
      expect(layer.eligible[Biome.Water]).toHaveLength(0);
      for (const def of layer.types) {
        expect(def.tileMask & (1 << Tile.Water)).toBe(0);
        expect(def.biomes.includes(Biome.Water)).toBe(false);
      }
    }
  });

  it('залежи привязаны к своим биомам', () => {
    const data = loadObjectsData();
    expect(findObjectType(data, 'iron_ore')?.def.biomes).toEqual([Biome.Rocks]);
    expect(findObjectType(data, 'peat')?.def.biomes).toEqual([Biome.Swamp]);
  });

  it('блокирующие слои имеют отступ не меньше 1; ячейка делит размер чанка', () => {
    for (const layer of loadObjectsData().layers) {
      expect(32 % layer.cell).toBe(0);
      if (layer.blocks) expect(layer.inset).toBeGreaterThanOrEqual(1);
      for (const t of layer.types) {
        expect(t.w).toBeLessThanOrEqual(layer.cell - 2 * layer.inset);
        expect(t.h).toBeLessThanOrEqual(layer.cell - 2 * layer.inset);
      }
    }
  });

  it('стартовые типы существуют и имеют размер 1×1', () => {
    const data = loadObjectsData();
    for (const item of data.start.items) {
      const found = findObjectType(data, item.type);
      expect([found?.def.w, found?.def.h]).toEqual([1, 1]);
      expect(item.min).toBeLessThanOrEqual(item.count);
    }
  });

  it('отвергает не-объект и недостающие поля с понятным путём', () => {
    expect(() => parseObjectsData(null)).toThrow(ObjectsDataError);
    expect(() => parseObjectsData([])).toThrow(ObjectsDataError);
    expect(() => parseObjectsData(mutated((c) => delete c.cluster))).toThrow(/cluster/);
    expect(() => parseObjectsData(mutated((c) => delete c.layers))).toThrow(/layers/);
    expect(() => parseObjectsData(mutated((c) => delete c.start.items))).toThrow(/start\.items/);
    expect(() => parseObjectsData(mutated((c) => (c.layers[2].cell = 'x')))).toThrow(
      /layers\[2\]\.cell/,
    );
  });

  it('отвергает воду в тайлах, биомах и плотностях', () => {
    expect(() =>
      parseObjectsData(mutated((c) => c.layers[2].types[0].tiles.push('water'))),
    ).toThrow(/вода/);
    expect(() =>
      parseObjectsData(mutated((c) => c.layers[2].types[0].biomes.push('water'))),
    ).toThrow(/вода/);
    expect(() =>
      parseObjectsData(mutated((c) => c.layers[2].density.push({ biome: 'water', p: 0.5 }))),
    ).toThrow(/вода/);
  });

  it('отвергает неизвестные имена, повторы и плохие числа', () => {
    expect(() =>
      parseObjectsData(mutated((c) => (c.layers[2].types[0].tiles[0] = 'лава'))),
    ).toThrow(/неизвестное имя/);
    expect(() => parseObjectsData(mutated((c) => (c.layers[0].id = 'castles')))).toThrow(
      /неизвестное имя/,
    );
    expect(() =>
      parseObjectsData(mutated((c) => c.layers[2].types[0].tiles.push('grass'))),
    ).toThrow(/повторяется/);
    expect(() =>
      parseObjectsData(mutated((c) => c.layers[2].density.push({ biome: 'forest', p: 0.1 }))),
    ).toThrow(/повторяется/);
    expect(() => parseObjectsData(mutated((c) => (c.layers[2].density[0].p = 1.5)))).toThrow(
      /density\[0\]\.p/,
    );
    expect(() => parseObjectsData(mutated((c) => (c.layers[2].types[0].weight = 0)))).toThrow(
      /weight/,
    );
    expect(() => parseObjectsData(mutated((c) => (c.layers[2].types[0].weight = 1.5)))).toThrow(
      /целым/,
    );
  });

  it('отвергает ячейку, не делящую чанк, и габарит, не помещающийся в ячейку', () => {
    expect(() => parseObjectsData(mutated((c) => (c.layers[2].cell = 5)))).toThrow(/делить/);
    expect(() =>
      parseObjectsData(mutated((c) => (c.layers[2].types[0].footprint = [3, 3]))),
    ).toThrow(/не помещается/);
  });

  it('отвергает блокирующий слой без отступа', () => {
    expect(() => parseObjectsData(mutated((c) => (c.layers[2].inset = 0)))).toThrow(/не меньше 1/);
  });

  it('отвергает неверный порядок слоёв и повтор типа', () => {
    expect(() => parseObjectsData(mutated((c) => c.layers.reverse()))).toThrow(/по приоритету/);
    expect(() =>
      parseObjectsData(mutated((c) => (c.layers[3].types[0].type = 'tree_pine'))),
    ).toThrow(/уже описан/);
  });

  it('отвергает тип, который нигде не может появиться или не допускает тайл своего биома', () => {
    expect(() =>
      parseObjectsData(mutated((c) => (c.layers[1].types[0].biomes = ['forest']))),
    ).toThrow(/основной тайл/);
    expect(() =>
      parseObjectsData(mutated((c) => (c.layers[0].density = [{ biome: 'swamp', p: 0.1 }]))),
    ).toThrow(/не может появиться/);
  });

  it('отвергает плохие параметры старта', () => {
    expect(() => parseObjectsData(mutated((c) => (c.start.ringMax = 12)))).toThrow(
      /noScatterRadius/,
    );
    expect(() => parseObjectsData(mutated((c) => (c.start.ringMin = 3)))).toThrow(/clearRadius/);
    expect(() =>
      parseObjectsData(mutated((c) => (c.start.items[0].type = 'ruin_house_a'))),
    ).toThrow(/1×1/);
    expect(() => parseObjectsData(mutated((c) => (c.start.items[0].type = 'ufo')))).toThrow(
      /неизвестный тип/,
    );
    expect(() => parseObjectsData(mutated((c) => (c.start.items[0].min = 99)))).toThrow(
      /start\.items\[0\]\.min/,
    );
  });

  it('отвергает плохое поле кластеров', () => {
    expect(() => parseObjectsData(mutated((c) => (c.cluster.low = 2)))).toThrow(/low < high/);
    expect(() => parseObjectsData(mutated((c) => (c.cluster.octaves = 0)))).toThrow(
      /cluster\.octaves/,
    );
  });
});
