import type Phaser from 'phaser';
import { TILE_SIZE } from '../config.ts';
import { Rng } from '../core/Rng.ts';
import { Biome, Tile } from '../systems/world/types.ts';

/**
 * Временные пиксельные текстуры тайлов (решение D5): рисуются в коде по палитре проекта
 * (docs/ASSETS.md: приглушённая, «выцветшая» гамма, холодные тени, тёплые акценты).
 * Финальный арт заменит их на этапе M7; логика мира от этого не зависит.
 *
 * Раскладка единственной текстуры TILESET_KEY (полоса тайлов по 32×32):
 *   индекс = тип_тайла × VARIANTS + вариант      — обычный вид (8 типов × 4 варианта);
 *   индекс = BIOME_BASE + биом                    — плоские цвета биомов для режима «Биомы».
 * Рисунок детерминирован (Rng с фиксированными ключами), но на мир не влияет.
 */

export const TILESET_KEY = 'tiles';
/** Число вариантов рисунка на тип тайла (выбирается хешем позиции, см. ChunkView). */
export const VARIANTS = 4;
const TILE_TYPES = 8;
/** Индекс первого тайла «карты биомов» в полосе. */
export const BIOME_BASE = TILE_TYPES * VARIANTS;
const BIOME_COUNT = 6;
const TOTAL = BIOME_BASE + BIOME_COUNT;

type Rgb = readonly [number, number, number];

function rgb(hex: number): Rgb {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

const PALETTE = {
  water: { base: rgb(0x2a4e66), dark: rgb(0x22435a), ripple: rgb(0x467690), shine: rgb(0x7fb0c2) },
  sand: {
    base: rgb(0xbfab7d),
    dark: rgb(0xa99768),
    light: rgb(0xd3c293),
    pebble: rgb(0x8c7f5f),
    wind: rgb(0xcbb988),
  },
  grass: {
    base: rgb(0x5b7b43),
    dark: rgb(0x4d6b39),
    light: rgb(0x6d8d4c),
    tuft: rgb(0x8dac5c),
    flowerA: rgb(0xd6c35a),
    flowerB: rgb(0xc98a95),
  },
  forest: {
    base: rgb(0x34502f),
    dark: rgb(0x293f27),
    moss: rgb(0x4b6c40),
    leafA: rgb(0x6d5a34),
    leafB: rgb(0x8a6f3c),
    twig: rgb(0x4a3a25),
  },
  stone: {
    base: rgb(0x7a8085),
    dark: rgb(0x656a6f),
    light: rgb(0x91969b),
    crack: rgb(0x4b5055),
    lichen: rgb(0x8d8f6a),
  },
  mud: {
    base: rgb(0x4d4833),
    dark: rgb(0x3b3828),
    puddle: rgb(0x34463f),
    shine: rgb(0x5d7a72),
    algae: rgb(0x56653a),
  },
  concrete: {
    base: rgb(0x8a8c8b),
    dark: rgb(0x6c6e6e),
    light: rgb(0x9c9e9d),
    stain: rgb(0x797b78),
  },
  path: {
    base: rgb(0x8c7854),
    dark: rgb(0x77653f),
    light: rgb(0xa18c64),
    pebble: rgb(0x9a9a94),
  },
} as const;

/** Цвета режима «Биомы»: различимы между собой и от обычного вида. */
const BIOME_COLORS: Record<number, Rgb> = {
  [Biome.Water]: rgb(0x2f6f9f),
  [Biome.Coast]: rgb(0xe0c878),
  [Biome.Plains]: rgb(0x93c45e),
  [Biome.Forest]: rgb(0x2f6b3a),
  [Biome.Rocks]: rgb(0x9a9fa6),
  [Biome.Swamp]: rgb(0x7a5c96),
};

/** Рисовальщик одного тайла в общем буфере пикселей. */
class TilePainter {
  private readonly pixels: Uint8ClampedArray;
  private readonly stride: number;
  private readonly offsetX: number;

  constructor(pixels: Uint8ClampedArray, imageWidth: number, tileIndex: number) {
    this.pixels = pixels;
    this.stride = imageWidth;
    this.offsetX = tileIndex * TILE_SIZE;
  }

  put(x: number, y: number, color: Rgb): void {
    if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
    const at = (y * this.stride + this.offsetX + x) * 4;
    this.pixels[at] = color[0];
    this.pixels[at + 1] = color[1];
    this.pixels[at + 2] = color[2];
    this.pixels[at + 3] = 255;
  }

  fill(color: Rgb): void {
    for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) this.put(x, y, color);
  }

  /** Случайные одиночные пиксели: доля `density` клеток тайла. */
  speckle(rng: Rng, color: Rgb, density: number): void {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) if (rng.chance(density)) this.put(x, y, color);
    }
  }

  /** Горизонтальный мазок длиной `length` (рябь, песчаные волны). */
  stroke(x: number, y: number, length: number, color: Rgb): void {
    for (let i = 0; i < length; i++) this.put(x + i, y, color);
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, color);
  }
}

function paintWater(p: TilePainter, rng: Rng): void {
  const c = PALETTE.water;
  p.fill(c.base);
  p.speckle(rng, c.dark, 0.14);
  for (let i = 0; i < 6; i++) {
    const x = rng.int(1, 22);
    const y = rng.int(1, 30);
    const length = rng.int(3, 7);
    p.stroke(x, y, length, c.ripple);
    if (rng.chance(0.5)) p.stroke(x + 1, y - 1, Math.max(1, length - 3), c.shine);
  }
}

function paintSand(p: TilePainter, rng: Rng): void {
  const c = PALETTE.sand;
  p.fill(c.base);
  p.speckle(rng, c.dark, 0.14);
  p.speckle(rng, c.light, 0.1);
  for (let i = 0; i < 3; i++) p.stroke(rng.int(1, 24), rng.int(2, 30), rng.int(3, 6), c.wind);
  for (let i = 0; i < 3; i++) p.put(rng.int(1, 30), rng.int(1, 30), c.pebble);
}

function paintGrass(p: TilePainter, rng: Rng, variant: number): void {
  const c = PALETTE.grass;
  p.fill(c.base);
  p.speckle(rng, c.dark, 0.18);
  p.speckle(rng, c.light, 0.1);
  for (let i = 0; i < 5; i++) {
    const x = rng.int(2, 29);
    const y = rng.int(3, 30);
    p.put(x, y, c.tuft);
    p.put(x - 1, y - 1, c.tuft);
    p.put(x + 1, y - 1, c.tuft);
  }
  if (variant % 2 === 1)
    p.put(rng.int(2, 29), rng.int(2, 29), variant === 1 ? c.flowerA : c.flowerB);
}

function paintForest(p: TilePainter, rng: Rng): void {
  const c = PALETTE.forest;
  p.fill(c.base);
  p.speckle(rng, c.dark, 0.25);
  p.speckle(rng, c.moss, 0.1);
  for (let i = 0; i < 4; i++) {
    p.put(rng.int(1, 30), rng.int(1, 30), rng.chance(0.5) ? c.leafA : c.leafB);
  }
  p.stroke(rng.int(2, 24), rng.int(2, 30), rng.int(3, 5), c.twig);
}

function paintStone(p: TilePainter, rng: Rng): void {
  const c = PALETTE.stone;
  p.fill(c.base);
  for (let i = 0; i < 5; i++) {
    const w = rng.int(4, 9);
    const h = rng.int(3, 6);
    p.rect(rng.int(0, 24), rng.int(0, 26), w, h, rng.chance(0.5) ? c.light : c.dark);
  }
  p.speckle(rng, c.dark, 0.08);
  let x = rng.int(4, 27);
  let y = rng.int(2, 8);
  for (let i = 0; i < 10; i++) {
    p.put(x, y, c.crack);
    x += rng.int(-1, 1);
    y += 1 + (rng.chance(0.3) ? 1 : 0);
  }
  for (let i = 0; i < 3; i++) p.put(rng.int(1, 30), rng.int(1, 30), c.lichen);
}

function paintMud(p: TilePainter, rng: Rng): void {
  const c = PALETTE.mud;
  p.fill(c.base);
  p.speckle(rng, c.dark, 0.16);
  p.speckle(rng, c.algae, 0.06);
  const px = rng.int(3, 18);
  const py = rng.int(4, 22);
  p.rect(px, py, 8, 3, c.puddle);
  p.rect(px + 1, py - 1, 6, 1, c.puddle);
  p.rect(px + 1, py + 3, 6, 1, c.puddle);
  p.put(px + 2, py + 1, c.shine);
  p.put(px + 3, py + 1, c.shine);
}

function paintConcrete(p: TilePainter, rng: Rng): void {
  const c = PALETTE.concrete;
  p.fill(c.base);
  p.speckle(rng, c.light, 0.1);
  p.speckle(rng, c.stain, 0.12);
  // Плиты 16×16 со швами.
  p.rect(0, 0, TILE_SIZE, 1, c.dark);
  p.rect(0, 0, 1, TILE_SIZE, c.dark);
  p.rect(0, 16, TILE_SIZE, 1, c.dark);
  p.rect(16, 0, 1, TILE_SIZE, c.dark);
  let x = rng.int(3, 28);
  let y = rng.int(2, 10);
  for (let i = 0; i < 6; i++) {
    p.put(x, y, c.dark);
    x += rng.int(-1, 1);
    y += 1;
  }
}

function paintPath(p: TilePainter, rng: Rng): void {
  const c = PALETTE.path;
  p.fill(c.base);
  p.speckle(rng, c.dark, 0.2);
  p.speckle(rng, c.light, 0.1);
  for (let i = 0; i < 3; i++) p.put(rng.int(1, 30), rng.int(1, 30), c.pebble);
}

const TILE_PAINTERS: Record<number, (p: TilePainter, rng: Rng, variant: number) => void> = {
  [Tile.Water]: paintWater,
  [Tile.Sand]: paintSand,
  [Tile.Grass]: paintGrass,
  [Tile.Forest]: paintForest,
  [Tile.Stone]: paintStone,
  [Tile.Mud]: paintMud,
  [Tile.Concrete]: paintConcrete,
  [Tile.Path]: paintPath,
};

/** Индекс тайла в полосе для типа тайла и варианта рисунка. */
export function tileFrame(tile: number, variant: number): number {
  return tile * VARIANTS + variant;
}

/** Цвет биома на плоской карте: компоненты R, G, B (используется и мини-картой). */
export function biomeColor(biome: number): readonly [number, number, number] {
  return BIOME_COLORS[biome] ?? [0, 0, 0];
}

/** Индекс тайла «карты биомов». */
export function biomeFrame(biome: number): number {
  return BIOME_BASE + biome;
}

/**
 * Создаёт текстуру тайлов (один раз за запуск игры; повторный вызов ничего не делает).
 * Рисует прямо в пиксельный буфер canvas: без сглаживания и внешних файлов.
 */
export function createPlaceholderTextures(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(TILESET_KEY)) return;
  const width = TOTAL * TILE_SIZE;
  const canvasTexture = textures.createCanvas(TILESET_KEY, width, TILE_SIZE);
  if (canvasTexture === null) throw new Error('Не удалось создать текстуру тайлов');
  const context = canvasTexture.getContext();
  const image = context.createImageData(width, TILE_SIZE);

  const base = new Rng(0x7e1e5);
  for (let tile = 0; tile < TILE_TYPES; tile++) {
    const paint = TILE_PAINTERS[tile];
    if (paint === undefined) continue;
    for (let variant = 0; variant < VARIANTS; variant++) {
      const painter = new TilePainter(image.data, width, tileFrame(tile, variant));
      paint(painter, base.child(tile, variant), variant);
    }
  }
  for (let biome = 0; biome < BIOME_COUNT; biome++) {
    const color = BIOME_COLORS[biome];
    if (color === undefined) continue;
    new TilePainter(image.data, width, biomeFrame(biome)).fill(color);
  }
  context.putImageData(image, 0, 0);
  canvasTexture.refresh();
}
