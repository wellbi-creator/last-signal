import objectsJson from '../../data/objects.json' with { type: 'json' };
import { CHUNK_SIZE } from '../../config.ts';
import {
  asArray,
  asObject,
  booleanField,
  lookupName,
  numberField,
  stringField,
} from './dataCheck.ts';
import type { Fail } from './dataCheck.ts';
import { SALT } from './salts.ts';
import { Biome, Tile } from './types.ts';
import type { BiomeId, TileId } from './types.ts';

/**
 * Данные расстановки объектов (src/data/objects.json) и их строгая проверка.
 * Формат описан в docs/DATA_FORMATS.md. Все наборы — массивы (порядок записи = порядок обхода),
 * словарей по биомам нет (правило порядка, пункт 9 плана M1).
 * Любое изменение значений после релиза требует нового WORLD_GEN_VERSION.
 */

export class ObjectsDataError extends Error {
  constructor(path: string, problem: string) {
    super(`objects.json: поле «${path}» ${problem}`);
    this.name = 'ObjectsDataError';
  }
}

const fail: Fail = (path, problem) => {
  throw new ObjectsDataError(path, problem);
};

const TILE_NAMES: ReadonlyArray<readonly [string, TileId]> = [
  ['water', Tile.Water],
  ['sand', Tile.Sand],
  ['grass', Tile.Grass],
  ['forest', Tile.Forest],
  ['stone', Tile.Stone],
  ['mud', Tile.Mud],
  ['concrete', Tile.Concrete],
  ['path', Tile.Path],
];

const BIOME_NAMES: ReadonlyArray<readonly [string, BiomeId]> = [
  ['water', Biome.Water],
  ['coast', Biome.Coast],
  ['plains', Biome.Plains],
  ['forest', Biome.Forest],
  ['rocks', Biome.Rocks],
  ['swamp', Biome.Swamp],
];

/** Основной тайл биома: тип объекта в биоме обязан допускать его, иначе он там не появится. */
const BIOME_NATIVE_TILE: ReadonlyArray<readonly [BiomeId, TileId]> = [
  [Biome.Coast, Tile.Sand],
  [Biome.Plains, Tile.Grass],
  [Biome.Forest, Tile.Forest],
  [Biome.Rocks, Tile.Stone],
  [Biome.Swamp, Tile.Mud],
];

/** Слои в порядке приоритета (раньше — важнее) и их salt. */
const LAYER_IDS: ReadonlyArray<readonly [string, number]> = [
  ['buildings', SALT.LAYER_BUILDINGS],
  ['deposits', SALT.LAYER_DEPOSITS],
  ['trees', SALT.LAYER_TREES],
  ['rocks', SALT.LAYER_ROCKS],
  ['bushes', SALT.LAYER_BUSHES],
];

/** Число биомов (длина массивов по биому). */
export const BIOME_COUNT = 6;

export interface ObjectTypeDef {
  readonly type: string;
  /** Целый вес выбора среди подходящих по биому типов слоя. */
  readonly weight: number;
  /** Габарит в клетках: ширина и высота. */
  readonly w: number;
  readonly h: number;
  /** Битовая маска допустимых тайлов (бит `1 << Tile`). */
  readonly tileMask: number;
  /** Биомы, в которых тип может появляться. */
  readonly biomes: readonly BiomeId[];
}

export interface LayerDef {
  readonly id: string;
  readonly salt: number;
  /** Размер ячейки сетки в тайлах (делит CHUNK_SIZE). */
  readonly cell: number;
  /** Отступ габарита от края ячейки. */
  readonly inset: number;
  /** Блокирует ли движение. */
  readonly blocks: boolean;
  readonly farBonus: number;
  /** Объект не ближе этого расстояния (в тайлах) к старту. */
  readonly minStartDistance: number;
  /** Вероятность на ячейку по биому (индекс = BiomeId; 0 — нет). */
  readonly density: readonly number[];
  readonly types: readonly ObjectTypeDef[];
  /** Подходящие по биому типы (индекс = BiomeId), в порядке записи. */
  readonly eligible: ReadonlyArray<readonly ObjectTypeDef[]>;
  /** Сумма весов подходящих типов по биому. */
  readonly weightSums: readonly number[];
}

export interface StarterItem {
  readonly type: string;
  /** Сколько стараемся разместить. */
  readonly count: number;
  /** Минимум, гарантированный генератором (иначе ошибка). */
  readonly min: number;
}

export interface ObjectsData {
  readonly cluster: {
    readonly scale: number;
    readonly octaves: number;
    readonly low: number;
    readonly high: number;
  };
  readonly start: {
    readonly clearRadius: number;
    readonly ringMin: number;
    readonly ringMax: number;
    readonly noScatterRadius: number;
    /** Минимальное расстояние (по Чебышёву) между блокирующими стартовыми объектами. */
    readonly blockerGap: number;
    readonly items: readonly StarterItem[];
  };
  readonly layers: readonly LayerDef[];
}

export interface FoundType {
  readonly layer: LayerDef;
  readonly def: ObjectTypeDef;
}

/** Ищет тип по имени среди всех слоёв. */
export function findObjectType(data: ObjectsData, name: string): FoundType | undefined {
  for (const layer of data.layers) {
    for (const def of layer.types) {
      if (def.type === name) return { layer, def };
    }
  }
  return undefined;
}

function parseType(
  raw: unknown,
  path: string,
  layer: { cell: number; inset: number },
): ObjectTypeDef {
  const obj = asObject(raw, path, fail);
  const type = stringField(obj, 'type', path, fail);
  const weight = numberField(obj, 'weight', path, fail, 1, 1000, true);

  const fp = asArray(obj.footprint, `${path}.footprint`, fail);
  if (fp.length !== 2) fail(`${path}.footprint`, 'должно быть [ширина, высота]');
  const w = numberField({ v: fp[0] }, 'v', `${path}.footprint[0]`, fail, 1, CHUNK_SIZE, true);
  const h = numberField({ v: fp[1] }, 'v', `${path}.footprint[1]`, fail, 1, CHUNK_SIZE, true);
  const room = layer.cell - 2 * layer.inset;
  if (w > room || h > room) {
    fail(
      `${path}.footprint`,
      `${w}×${h} не помещается в ячейку ${layer.cell} с отступом ${layer.inset}`,
    );
  }

  let tileMask = 0;
  const tiles = asArray(obj.tiles, `${path}.tiles`, fail);
  if (tiles.length === 0) fail(`${path}.tiles`, 'не должно быть пустым');
  for (let i = 0; i < tiles.length; i++) {
    const tile = lookupName(TILE_NAMES, tiles[i], `${path}.tiles[${i}]`, fail);
    if (tile === Tile.Water) fail(`${path}.tiles[${i}]`, 'вода недопустима для объектов');
    const bit = 1 << tile;
    if ((tileMask & bit) !== 0) fail(`${path}.tiles[${i}]`, 'повторяется');
    tileMask |= bit;
  }

  const biomes: BiomeId[] = [];
  const biomeList = asArray(obj.biomes, `${path}.biomes`, fail);
  if (biomeList.length === 0) fail(`${path}.biomes`, 'не должно быть пустым');
  for (let i = 0; i < biomeList.length; i++) {
    const biome = lookupName(BIOME_NAMES, biomeList[i], `${path}.biomes[${i}]`, fail);
    if (biome === Biome.Water) fail(`${path}.biomes[${i}]`, 'вода недопустима для объектов');
    if (biomes.includes(biome)) fail(`${path}.biomes[${i}]`, 'повторяется');
    biomes.push(biome);
    for (const [b, nativeTile] of BIOME_NATIVE_TILE) {
      if (b === biome && (tileMask & (1 << nativeTile)) === 0) {
        fail(`${path}.biomes[${i}]`, 'биом указан, но основной тайл биома не разрешён в tiles');
      }
    }
  }
  return { type, weight, w, h, tileMask, biomes };
}

function parseLayer(raw: unknown, path: string): LayerDef {
  const obj = asObject(raw, path, fail);
  const id = stringField(obj, 'id', path, fail);
  const salt = lookupName(LAYER_IDS, id, `${path}.id`, fail);
  const cell = numberField(obj, 'cell', path, fail, 4, 16, true);
  if (CHUNK_SIZE % cell !== 0) fail(`${path}.cell`, `должно делить размер чанка ${CHUNK_SIZE}`);
  const blocks = booleanField(obj, 'blocks', path, fail);
  const inset = numberField(obj, 'inset', path, fail, 0, cell / 2, true);
  if (blocks && inset < 1) {
    // Отступ ≥ 1 гарантирует зазор между блокирующими объектами и независимость чанков.
    fail(`${path}.inset`, 'у блокирующего слоя должно быть не меньше 1');
  }
  const farBonus = numberField(obj, 'farBonus', path, fail, 0, 4);
  const minStartDistance = numberField(obj, 'minStartDistance', path, fail, 0, 128);

  const density: number[] = [];
  for (let b = 0; b < BIOME_COUNT; b++) density.push(0);
  const densityRaw = asArray(obj.density, `${path}.density`, fail);
  const seen: BiomeId[] = [];
  for (let i = 0; i < densityRaw.length; i++) {
    const item = asObject(densityRaw[i], `${path}.density[${i}]`, fail);
    const biome = lookupName(BIOME_NAMES, item.biome, `${path}.density[${i}].biome`, fail);
    if (biome === Biome.Water) fail(`${path}.density[${i}].biome`, 'вода недопустима');
    if (seen.includes(biome)) fail(`${path}.density[${i}].biome`, 'биом повторяется');
    seen.push(biome);
    density[biome] = numberField(item, 'p', `${path}.density[${i}]`, fail, 0, 1);
  }

  const typesRaw = asArray(obj.types, `${path}.types`, fail);
  if (typesRaw.length === 0) fail(`${path}.types`, 'не должно быть пустым');
  const types: ObjectTypeDef[] = [];
  for (let i = 0; i < typesRaw.length; i++) {
    types.push(parseType(typesRaw[i], `${path}.types[${i}]`, { cell, inset }));
  }

  const eligible: ObjectTypeDef[][] = [];
  const weightSums: number[] = [];
  for (let b = 0; b < BIOME_COUNT; b++) {
    const list = types.filter((t) => t.biomes.includes(b as BiomeId));
    eligible.push(list);
    weightSums.push(list.reduce((sum, t) => sum + t.weight, 0));
  }
  // Тип, который нигде не может появиться, — почти наверняка ошибка данных.
  for (const t of types) {
    const reachable = t.biomes.some((b) => (density[b] ?? 0) > 0);
    if (!reachable)
      fail(`${path}.types`, `тип «${t.type}» не может появиться: плотность его биомов 0`);
  }
  return {
    id,
    salt,
    cell,
    inset,
    blocks,
    farBonus,
    minStartDistance,
    density,
    types,
    eligible,
    weightSums,
  };
}

/** Проверяет произвольные данные и возвращает типизированные параметры. */
export function parseObjectsData(raw: unknown): ObjectsData {
  const root = asObject(raw, 'корень', fail);

  const clusterRaw = asObject(root.cluster, 'cluster', fail);
  const cluster = {
    scale: numberField(clusterRaw, 'scale', 'cluster', fail, 4, 256),
    octaves: numberField(clusterRaw, 'octaves', 'cluster', fail, 1, 4, true),
    low: numberField(clusterRaw, 'low', 'cluster', fail, 0, 3),
    high: numberField(clusterRaw, 'high', 'cluster', fail, 0, 3),
  };
  if (!(cluster.low < cluster.high)) fail('cluster', 'должно быть low < high');

  const layersRaw = asArray(root.layers, 'layers', fail);
  if (layersRaw.length === 0) fail('layers', 'не должно быть пустым');
  const layers: LayerDef[] = [];
  let lastOrder = -1;
  const typeNames: string[] = [];
  for (let i = 0; i < layersRaw.length; i++) {
    const layer = parseLayer(layersRaw[i], `layers[${i}]`);
    let order = -1;
    for (let k = 0; k < LAYER_IDS.length; k++) {
      if (LAYER_IDS[k]?.[0] === layer.id) order = k;
    }
    if (order <= lastOrder) {
      fail(
        `layers[${i}].id`,
        'слои должны идти по приоритету без повторов: buildings, deposits, trees, rocks, bushes',
      );
    }
    lastOrder = order;
    for (const t of layer.types) {
      if (typeNames.includes(t.type)) fail(`layers[${i}].types`, `тип «${t.type}» уже описан`);
      typeNames.push(t.type);
    }
    layers.push(layer);
  }

  const startRaw = asObject(root.start, 'start', fail);
  const clearRadius = numberField(startRaw, 'clearRadius', 'start', fail, 1, 64, true);
  const ringMin = numberField(startRaw, 'ringMin', 'start', fail, 1, 64, true);
  const ringMax = numberField(startRaw, 'ringMax', 'start', fail, 1, 64, true);
  const noScatterRadius = numberField(startRaw, 'noScatterRadius', 'start', fail, 1, 64, true);
  const blockerGap = numberField(startRaw, 'blockerGap', 'start', fail, 2, 16, true);
  if (!(clearRadius < ringMin && ringMin <= ringMax && ringMax < noScatterRadius)) {
    // ringMax < noScatterRadius: между стартовыми и обычными блокирующими объектами остаётся зазор.
    fail('start', 'должно быть clearRadius < ringMin ≤ ringMax < noScatterRadius');
  }
  const itemsRaw = asArray(startRaw.items, 'start.items', fail);
  if (itemsRaw.length === 0) fail('start.items', 'не должно быть пустым');
  const items: StarterItem[] = [];
  const data0 = { cluster, layers } as unknown as ObjectsData;
  for (let i = 0; i < itemsRaw.length; i++) {
    const path = `start.items[${i}]`;
    const item = asObject(itemsRaw[i], path, fail);
    const type = stringField(item, 'type', path, fail);
    const found = findObjectType(data0, type);
    if (!found) fail(`${path}.type`, `неизвестный тип «${type}»`);
    else if (found.def.w !== 1 || found.def.h !== 1) {
      fail(`${path}.type`, 'стартовый объект должен быть размером 1×1');
    }
    const count = numberField(item, 'count', path, fail, 1, 64, true);
    const min = numberField(item, 'min', path, fail, 0, count, true);
    items.push({ type, count, min });
  }

  return {
    cluster,
    start: { clearRadius, ringMin, ringMax, noScatterRadius, blockerGap, items },
    layers,
  };
}

let cached: ObjectsData | undefined;

/** Данные из objects.json (проверяются один раз). */
export function loadObjectsData(): ObjectsData {
  cached ??= parseObjectsData(objectsJson);
  return cached;
}
