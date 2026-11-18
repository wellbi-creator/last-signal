import worldgenJson from '../../data/worldgen.json' with { type: 'json' };
import { asObject as checkObject, numberField } from './dataCheck.ts';
import type { Fail } from './dataCheck.ts';

/**
 * Параметры генерации рельефа (src/data/worldgen.json) и их строгая проверка.
 * Ошибка данных — понятное сообщение с путём к полю при запуске, а не тихая поломка мира.
 * Любое изменение значений после релиза требует нового WORLD_GEN_VERSION.
 */

export interface NoiseParams {
  /** Размер «пятна» шума в тайлах. */
  readonly scale: number;
  readonly octaves: number;
}

export interface WorldGenParams {
  readonly elevation: NoiseParams;
  readonly moisture: NoiseParams;
  readonly contrast: number;
  readonly edge: { readonly strength: number; readonly from: number; readonly to: number };
  readonly thresholds: {
    readonly water: number;
    readonly sand: number;
    readonly rock: number;
    readonly swamp: { readonly moisture: number; readonly maxElevation: number };
    readonly forestMoisture: number;
  };
  readonly start: {
    readonly safeRadius: number;
    readonly blendRadius: number;
    readonly elevation: number;
    readonly moisture: number;
  };
}

export class WorldDataError extends Error {
  constructor(path: string, problem: string) {
    super(`worldgen.json: поле «${path}» ${problem}`);
    this.name = 'WorldDataError';
  }
}

const fail: Fail = (path, problem) => {
  throw new WorldDataError(path, problem);
};

function asObject(value: unknown, path: string): Record<string, unknown> {
  return checkObject(value, path, fail);
}

function number(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  integer = false,
): number {
  return numberField(parent, key, path, fail, min, max, integer);
}

function parseNoise(raw: unknown, path: string): NoiseParams {
  const obj = asObject(raw, path);
  return {
    scale: number(obj, 'scale', path, 4, 512),
    octaves: number(obj, 'octaves', path, 1, 8, true),
  };
}

/** Проверяет произвольные данные и возвращает типизированные параметры. */
export function parseWorldGenParams(raw: unknown): WorldGenParams {
  const root = asObject(raw, 'корень');
  const edgeRaw = asObject(root.edge, 'edge');
  const thrRaw = asObject(root.thresholds, 'thresholds');
  const swampRaw = asObject(thrRaw.swamp, 'thresholds.swamp');
  const startRaw = asObject(root.start, 'start');

  const params: WorldGenParams = {
    elevation: parseNoise(root.elevation, 'elevation'),
    moisture: parseNoise(root.moisture, 'moisture'),
    contrast: number(root, 'contrast', 'корень', 0.5, 4),
    edge: {
      strength: number(edgeRaw, 'strength', 'edge', 0, 2),
      from: number(edgeRaw, 'from', 'edge', 0, 1),
      to: number(edgeRaw, 'to', 'edge', 0, 1.5),
    },
    thresholds: {
      water: number(thrRaw, 'water', 'thresholds', 0, 1),
      sand: number(thrRaw, 'sand', 'thresholds', 0, 1),
      rock: number(thrRaw, 'rock', 'thresholds', 0, 1),
      swamp: {
        moisture: number(swampRaw, 'moisture', 'thresholds.swamp', 0, 1),
        maxElevation: number(swampRaw, 'maxElevation', 'thresholds.swamp', 0, 1),
      },
      forestMoisture: number(thrRaw, 'forestMoisture', 'thresholds', 0, 1),
    },
    start: {
      safeRadius: number(startRaw, 'safeRadius', 'start', 1, 128),
      blendRadius: number(startRaw, 'blendRadius', 'start', 2, 128),
      elevation: number(startRaw, 'elevation', 'start', 0, 1),
      moisture: number(startRaw, 'moisture', 'start', 0, 1),
    },
  };

  const t = params.thresholds;
  if (!(t.water < t.sand && t.sand < t.rock)) {
    throw new WorldDataError('thresholds', 'должны удовлетворять water < sand < rock');
  }
  if (!(params.edge.from < params.edge.to)) {
    throw new WorldDataError('edge', 'должно быть from < to');
  }
  if (!(params.start.safeRadius < params.start.blendRadius)) {
    throw new WorldDataError('start', 'должно быть safeRadius < blendRadius');
  }
  // Стартовая зона обязана быть сушей без скал: иначе гарантия «старт без воды» теряет смысл.
  if (params.start.elevation < t.sand || params.start.elevation > t.rock) {
    throw new WorldDataError('start.elevation', 'должна лежать между порогами sand и rock');
  }
  if (params.start.moisture > t.swamp.moisture) {
    throw new WorldDataError('start.moisture', 'не должна превышать порог болота');
  }
  return params;
}

let cached: WorldGenParams | undefined;

/** Параметры из worldgen.json (проверяются один раз). */
export function loadWorldGenParams(): WorldGenParams {
  cached ??= parseWorldGenParams(worldgenJson);
  return cached;
}
