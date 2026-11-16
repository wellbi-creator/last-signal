import type { WorldObjectId } from '../../core/types.ts';

/**
 * Единые типы мира. Все системы (генератор, чанки, отрисовка, тесты) используют ТОЛЬКО эти типы
 * и числовые коды, собственных вариантов не заводят. Формат описан в docs/DATA_FORMATS.md.
 *
 * Числовые коды Tile и Biome записываются в Uint8Array чанков и участвуют в хеше мира, поэтому
 * они зафиксированы: менять значения можно только вместе с WORLD_GEN_VERSION.
 */

/** Тип поверхности клетки. */
export const Tile = {
  Water: 0,
  Sand: 1,
  Grass: 2,
  Forest: 3,
  Stone: 4,
  Mud: 5,
  Concrete: 6,
  Path: 7,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

/**
 * Биом клетки. Игровых биомов пять: побережье, равнина, лес, скалы, болото.
 * «Вода» — не биом в игровом смысле, а непригодная для жизни зона (море, озёра).
 */
export const Biome = {
  Water: 0,
  Coast: 1,
  Plains: 2,
  Forest: 3,
  Rocks: 4,
  Swamp: 5,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];

/** Объект мира (дерево, камень, куст, залежь, постройка и т. п.). */
export interface WorldObject {
  /** `${cx}:${cy}:${index}`; стабилен при одном seed и worldGenVersion. */
  id: WorldObjectId;
  /** Ключ типа из data/objects.json. */
  type: string;
  /** Тайловые координаты левого верхнего угла (целые). */
  x: number;
  y: number;
  /** Идентификатор точки интереса, если объект принадлежит ей. */
  poi?: string;
}

/** Сгенерированный чанк. Содержит только данные, без ссылок на Phaser. */
export interface Chunk {
  cx: number;
  cy: number;
  /** CHUNK_SIZE × CHUNK_SIZE значений Tile; индекс = localTileIndex(lx, ly). */
  tiles: Uint8Array;
  /** CHUNK_SIZE × CHUNK_SIZE значений Biome; индекс тот же. */
  biomes: Uint8Array;
  /** Объекты в детерминированном порядке (слой, затем ячейки построчно). */
  objects: WorldObject[];
}

/** Размещённая точка интереса (результат планирования мира). */
export interface PoiPlacement {
  /** Например, 'radio_center_07'. */
  id: string;
  /** Ключ типа из data/poi.json. */
  type: string;
  /** Габарит в тайлах. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Проходимая клетка у входа; к ней идёт тропа. */
  entrance: { x: number; y: number };
}
