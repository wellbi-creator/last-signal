/**
 * Общие типы проекта. Единственное место, где определены базовые форматы данных:
 * все системы используют эти типы и не создают собственных вариантов.
 */

/** Точка или вектор. В GameState это ПИКСЕЛИ МИРА (дробные значения допустимы). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Прямоугольник. В координатах мира это ПИКСЕЛИ МИРА. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Координаты чанка (целые числа; чанк (0, 0) — левый верхний угол мира). */
export interface ChunkCoord {
  cx: number;
  cy: number;
}

/** Идентификатор игрока. В одиночной игре v1 всегда LOCAL_PLAYER_ID. */
export type PlayerId = string;

/** Номер такта симуляции. */
export type Tick = number;

/** Идентификатор предмета из data/items.json (появится на этапе M3). */
export type ItemId = string;

/**
 * Стабильный идентификатор объекта мира: `${chunkX}:${chunkY}:${индекс}`.
 * Не меняется между запусками при одном seed, поэтому годится для сохранений.
 */
export type WorldObjectId = string;
