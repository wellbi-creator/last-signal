/**
 * Глобальные константы проекта. Только значения, без логики и без импорта Phaser.
 *
 * ВАЖНО: TILE_SIZE, CHUNK_SIZE и WORLD_CHUNKS влияют на генерацию мира и формат сохранений.
 * Менять их после выхода первых сохранений можно только вместе с миграцией (см. docs/DATA_FORMATS.md).
 */

export const APP_NAME = 'Последний сигнал';
export const APP_VERSION = '0.0.1';

/** Размер тайла в игровых единицах (пикселях мира). Пиксель-арт рисуется 32×32. */
export const TILE_SIZE = 32;

/** Сторона чанка в тайлах. */
export const CHUNK_SIZE = 32;

/** Сторона мира в чанках. В v1 мир конечный: 8×8 чанков. */
export const WORLD_CHUNKS = 8;

/** Сторона мира в тайлах (256). */
export const WORLD_TILES = CHUNK_SIZE * WORLD_CHUNKS;

/** Сторона мира в пикселях мира (8192). */
export const WORLD_PIXELS = WORLD_TILES * TILE_SIZE;

/**
 * Версия формата состояния игры и сохранений. Увеличивается при любом несовместимом
 * изменении GameState; вместе с этим добавляется миграция (этап M6).
 */
export const SAVE_FORMAT_VERSION = 1;

/** Максимальная длина текста seed в символах (кодовых точках). */
export const SEED_MAX_LENGTH = 64;

export const COLORS = {
  background: '#0b0f12',
  text: '#c9d1d6',
  textDim: '#8a949c',
  accent: '#f2b84b',
} as const;
