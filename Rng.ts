/**
 * Детерминированные хеши и генератор псевдослучайных чисел.
 *
 * Требование ТЗ: одинаковый seed обязан давать одинаковую карту на любом устройстве.
 * Поэтому вся случайность в игровой логике идёт только отсюда, а вся арифметика целочисленная
 * (Math.imul, побитовые операции), без зависимости от платформы.
 *
 * ВАЖНО: алгоритмы и константы в этом файле нельзя менять. Любое изменение меняет все миры
 * и ломает совместимость сохранений. Это закреплено «золотыми» тестами в tests/core/rng.test.ts.
 */

const UINT32_RANGE = 4294967296;

/**
 * FNV-1a, 32 бита, по кодовым единицам UTF-16. Превращает текст seed в число.
 * Результат — беззнаковое 32-битное целое.
 */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Финализатор MurmurHash3: перемешивает биты так, что близкие входы дают далёкие выходы. */
function fmix32(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Хеш набора целых чисел (MurmurHash3 по 32-битным словам). Порядок значений важен.
 * Используется для seed чанков: `hashInts(worldSeed, chunkX, chunkY)`.
 * Значения должны быть целыми в диапазоне int32; отрицательные допустимы.
 */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9 | 0;
  for (const value of values) {
    let k = Math.imul(value | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  return fmix32(h ^ values.length);
}

/** Генератор на алгоритме mulberry32. Быстрый, 32 бита состояния, воспроизводимый. */
export class Rng {
  /** Исходный seed (беззнаковое 32-битное). Не меняется при генерации. */
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** Создаёт генератор из текста seed. */
  static fromText(text: string): Rng {
    return new Rng(hashString(text));
  }

  /** Следующее число в диапазоне [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  }

  /** Целое число в диапазоне [min, max] ВКЛЮЧАЯ обе границы. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`Rng.int: некорректный диапазон [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Дробное число в диапазоне [min, max). */
  float(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new RangeError(`Rng.float: некорректный диапазон [${min}, ${max})`);
    }
    return min + this.next() * (max - min);
  }

  /** Истина с вероятностью p (0…1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Случайный элемент непустого массива. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Rng.pick: массив пуст');
    }
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Перемешивает массив НА МЕСТЕ (Фишер — Йейтс) и возвращает его же. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /**
   * Независимый генератор, производный от исходного seed и ключей. Не зависит от того,
   * сколько чисел уже получено из этого генератора, поэтому порядок генерации
   * частей мира не влияет на результат.
   */
  child(...keys: number[]): Rng {
    return new Rng(hashInts(this.seed, ...keys));
  }
}
