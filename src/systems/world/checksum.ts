import { hashString } from '../../core/Rng.ts';
import { CHUNK_SIZE, WORLD_CHUNKS } from '../../config.ts';
import type { Chunk } from './types.ts';

/**
 * 64-битный контрольный хеш для сверки миров на разных устройствах (ПК и iPhone).
 * Два независимых 32-битных потока с разными начальными значениями и константами.
 * Только целочисленная арифметика (Math.imul и сдвиги), результат одинаков в любом движке.
 *
 * Хеш не криптографический: он должен надёжно отличать разные миры, а не противостоять атаке.
 * Алгоритм заморожен: его изменение меняет все «золотые» значения.
 */
export class Hash64 {
  private a = 0x243f6a88 | 0;
  private b = 0x85a308d3 | 0;
  private count = 0;

  /** Подаёт одно целое число (приводится к int32). */
  add(value: number): void {
    const v = value | 0;
    let a = Math.imul(this.a ^ v, 0x85ebca6b);
    a ^= a >>> 15;
    a = Math.imul(a, 0xc2b2ae35);
    a ^= a >>> 13;
    this.a = a;

    const w = ((v << 16) | (v >>> 16)) ^ 0x9e3779b9;
    let b = Math.imul(this.b + w, 0x27d4eb2f);
    b ^= b >>> 16;
    b = Math.imul(b ^ (b >>> 11), 0x165667b1);
    b ^= b >>> 15;
    this.b = b;
    this.count = (this.count + 1) | 0;
  }

  /** Подаёт массив байт по 4 штуки в слове (длина произвольная; остаток дополняется нулями). */
  addBytes(bytes: Uint8Array): void {
    this.add(bytes.length);
    let i = 0;
    for (; i + 4 <= bytes.length; i += 4) {
      this.add(
        (bytes[i] ?? 0) |
          ((bytes[i + 1] ?? 0) << 8) |
          ((bytes[i + 2] ?? 0) << 16) |
          ((bytes[i + 3] ?? 0) << 24),
      );
    }
    let tail = 0;
    for (let shift = 0; i < bytes.length; i++, shift += 8) tail |= (bytes[i] ?? 0) << shift;
    this.add(tail);
  }

  /** Метка раздела и число элементов: данные соседних разделов не могут «склеиться». */
  section(label: number, count: number): void {
    this.add(label);
    this.add(count);
  }

  /** 16 шестнадцатеричных знаков (64 бита). Накопитель после вызова можно продолжать. */
  digest(): string {
    return hex(finalize(this.a ^ this.count)) + hex(finalize((this.b + this.count) | 0));
  }
}

function finalize(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hex(value: number): string {
  return value.toString(16).padStart(8, '0');
}

// Метки разделов (ASCII-коды букв: удобно узнавать при отладке).
const LABEL_WORLD = 0x574f524c; // 'WORL'
const LABEL_CHUNK = 0x4348554e; // 'CHUN'
const LABEL_TILES = 0x54494c45; // 'TILE'
const LABEL_BIOMES = 0x42494f4d; // 'BIOM'
const LABEL_OBJECTS = 0x4f424a53; // 'OBJS'

/** Подаёт в накопитель всё существенное содержимое чанка (план, раздел 7.3, пункт 2). */
function feedChunk(h: Hash64, chunk: Chunk): void {
  h.section(LABEL_CHUNK, 2);
  h.add(chunk.cx);
  h.add(chunk.cy);
  h.section(LABEL_TILES, chunk.tiles.length);
  h.addBytes(chunk.tiles);
  h.section(LABEL_BIOMES, chunk.biomes.length);
  h.addBytes(chunk.biomes);
  h.section(LABEL_OBJECTS, chunk.objects.length);
  for (const object of chunk.objects) {
    h.add(hashString(object.id));
    h.add(hashString(object.type));
    h.add(object.x);
    h.add(object.y);
    // Принадлежность точке интереса отличается от её отсутствия: 1 + хеш или 0.
    if (object.poi === undefined) h.add(0);
    else {
      h.add(1);
      h.add(hashString(object.poi));
    }
  }
}

/** Хеш одного чанка: по нему при расхождении устройств видно, в каком чанке миры разошлись. */
export function hashChunk(chunk: Chunk): string {
  if (
    chunk.tiles.length !== CHUNK_SIZE * CHUNK_SIZE ||
    chunk.biomes.length !== chunk.tiles.length
  ) {
    throw new RangeError('hashChunk: неверный размер массивов чанка');
  }
  const h = new Hash64();
  feedChunk(h, chunk);
  return h.digest();
}

/**
 * Хеш мира: версия генератора, seed и все чанки строго в порядке (cy, cx).
 * Требует ровно все чанки мира. Разделы «точки интереса» и «тропы» добавятся в M1.6 и M1.7
 * (тогда «золотые» значения будут записаны заново).
 */
export function hashWorld(
  worldGenVersion: number,
  worldSeed: number,
  chunks: readonly Chunk[],
): string {
  if (chunks.length !== WORLD_CHUNKS * WORLD_CHUNKS) {
    throw new RangeError(`hashWorld: нужны все ${WORLD_CHUNKS * WORLD_CHUNKS} чанков`);
  }
  const h = new Hash64();
  h.section(LABEL_WORLD, 2);
  h.add(worldGenVersion);
  h.add(worldSeed);
  h.section(LABEL_CHUNK, chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk === undefined || chunk.cy * WORLD_CHUNKS + chunk.cx !== i) {
      throw new RangeError('hashWorld: чанки должны идти в порядке (cy, cx) без пропусков');
    }
    feedChunk(h, chunk);
  }
  return h.digest();
}
