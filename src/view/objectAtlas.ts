import { Rng, hashInts } from '../core/Rng.ts';
import { NATURAL_SPRITES } from './objectSprites.ts';
import type { NaturalSprite } from './objectSprites.ts';
import { PixelBuffer } from './pixelPainter.ts';
import { RUIN_SPRITES } from './ruinSprites.ts';

/**
 * Атлас спрайтов объектов: один буфер RGBA со всеми кадрами (решение D5, временная графика).
 * Без Phaser и DOM: строится и проверяется в Node, а `objectTextures.ts` загружает его в текстуру.
 * Раскладка: полки по возрастанию высоты спрайтов, зазор между кадрами — 2 пикселя.
 */

/** Все спрайты в порядке записи; порядок определяет раскладку атласа. */
export const OBJECT_SPRITES: readonly NaturalSprite[] = [...RUIN_SPRITES, ...NATURAL_SPRITES];

const ATLAS_WIDTH = 1024;
const GAP = 2;

export interface AtlasFrame {
  /** Имя кадра: `${тип}_${вариант}`. */
  readonly name: string;
  readonly type: string;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ObjectAtlas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly frames: readonly AtlasFrame[];
}

export function frameName(type: string, variant: number): string {
  return `${type}_${variant}`;
}

/** Описание спрайта типа или undefined. */
export function spriteDef(type: string): NaturalSprite | undefined {
  return OBJECT_SPRITES.find((s) => s.type === type);
}

/** Рисует один вариант спрайта в отдельный буфер. Рисунок детерминирован. */
export function renderSprite(def: NaturalSprite, variant: number): PixelBuffer {
  const buffer = new PixelBuffer(def.width, def.height);
  const typeIndex = OBJECT_SPRITES.indexOf(def);
  def.draw(buffer, variant, new Rng(hashInts(typeIndex + 1, variant, 0x51de)));
  return buffer;
}

interface Item {
  readonly def: NaturalSprite;
  readonly variant: number;
}

export function buildObjectAtlas(): ObjectAtlas {
  const items: Item[] = [];
  for (const def of OBJECT_SPRITES) {
    for (let variant = 0; variant < def.variants; variant++) items.push({ def, variant });
  }
  // Высокие — первыми: полки получаются плотнее. Порядок полный (тип и вариант), сортировка стабильна.
  const order = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.def.height - a.item.def.height || a.index - b.index)
    .map((entry) => entry.item);

  const placed: Array<{ item: Item; x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const item of order) {
    if (x + item.def.width > ATLAS_WIDTH) {
      x = 0;
      y += shelf + GAP;
      shelf = 0;
    }
    placed.push({ item, x, y });
    x += item.def.width + GAP;
    shelf = Math.max(shelf, item.def.height);
  }
  const height = y + shelf;
  const atlas = new PixelBuffer(ATLAS_WIDTH, height);
  const frames: AtlasFrame[] = [];
  for (const { item, x: px, y: py } of placed) {
    const sprite = renderSprite(item.def, item.variant);
    for (let row = 0; row < sprite.height; row++) {
      const from = row * sprite.width * 4;
      atlas.data.set(
        sprite.data.subarray(from, from + sprite.width * 4),
        ((py + row) * ATLAS_WIDTH + px) * 4,
      );
    }
    frames.push({
      name: frameName(item.def.type, item.variant),
      type: item.def.type,
      variant: item.variant,
      x: px,
      y: py,
      width: item.def.width,
      height: item.def.height,
    });
  }
  return { width: ATLAS_WIDTH, height, data: atlas.data, frames };
}
