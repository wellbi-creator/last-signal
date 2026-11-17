import { describe, expect, it } from 'vitest';
import worldgenJson from '../../src/data/worldgen.json' with { type: 'json' };
import {
  loadWorldGenParams,
  parseWorldGenParams,
  WorldDataError,
} from '../../src/systems/world/worldData.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function mutated(change: (copy: Json) => void): unknown {
  const copy = JSON.parse(JSON.stringify(worldgenJson)) as Json;
  change(copy);
  return copy;
}

describe('worldgen.json', () => {
  it('исходные данные проходят проверку', () => {
    const params = loadWorldGenParams();
    expect(params.elevation.scale).toBe(70);
    expect(params.thresholds.water).toBe(0.28);
    expect(loadWorldGenParams()).toBe(params);
  });

  it('отвергает не-объект и недостающие поля', () => {
    expect(() => parseWorldGenParams(null)).toThrow(WorldDataError);
    expect(() => parseWorldGenParams([])).toThrow(WorldDataError);
    expect(() => parseWorldGenParams(mutated((c) => delete c.edge))).toThrow(/edge/);
    expect(() => parseWorldGenParams(mutated((c) => delete c.thresholds.swamp))).toThrow(/swamp/);
  });

  it('отвергает неверные типы и значения вне диапазона, называя поле', () => {
    expect(() => parseWorldGenParams(mutated((c) => (c.contrast = '1.7')))).toThrow(/contrast/);
    expect(() => parseWorldGenParams(mutated((c) => (c.contrast = Number.NaN)))).toThrow(
      /contrast/,
    );
    expect(() => parseWorldGenParams(mutated((c) => (c.elevation.octaves = 2.5)))).toThrow(
      /elevation\.octaves/,
    );
    expect(() => parseWorldGenParams(mutated((c) => (c.moisture.scale = 0)))).toThrow(
      /moisture\.scale/,
    );
    expect(() => parseWorldGenParams(mutated((c) => (c.thresholds.water = 1.5)))).toThrow(
      /thresholds\.water/,
    );
  });

  it('отвергает противоречивые пороги', () => {
    expect(() => parseWorldGenParams(mutated((c) => (c.thresholds.sand = 0.2)))).toThrow(
      /water < sand < rock/,
    );
    expect(() => parseWorldGenParams(mutated((c) => (c.edge.from = 1)))).toThrow(/from < to/);
    expect(() => parseWorldGenParams(mutated((c) => (c.start.safeRadius = 40)))).toThrow(
      /safeRadius < blendRadius/,
    );
    expect(() => parseWorldGenParams(mutated((c) => (c.start.elevation = 0.1)))).toThrow(
      /start\.elevation/,
    );
    expect(() => parseWorldGenParams(mutated((c) => (c.start.moisture = 0.9)))).toThrow(
      /start\.moisture/,
    );
  });
});
