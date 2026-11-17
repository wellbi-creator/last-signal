import { hashInts } from '../../core/Rng.ts';

/**
 * Градиентный шум (Перлин, 2D) и fBm.
 *
 * Детерминизм (решение D2): используются только + − × ÷, Math.floor/min/max, Math.imul и
 * побитовые операции — результат совпадает в любом движке (V8, JavaScriptCore). Шум не хранит
 * состояния: значение зависит только от (seed, x, y), поэтому швов на границах чанков нет.
 *
 * Алгоритм заморожен: любое изменение меняет весь мир и требует нового WORLD_GEN_VERSION.
 */

const DIAG = 0.70710678;

/** Восемь единичных направлений градиента (оси и диагонали). Порядок фиксирован. */
const GRADIENTS_X: readonly number[] = [1, -1, 0, 0, DIAG, -DIAG, DIAG, -DIAG];
const GRADIENTS_Y: readonly number[] = [0, 0, 1, -1, DIAG, DIAG, -DIAG, -DIAG];

/** Усиление амплитуды: шум Перлина редко выходит за ±0.5, поэтому растягиваем к 0…1. */
const NOISE_GAIN = 1.6;

/** Сглаживающая кривая 6t⁵ − 15t⁴ + 10t³ (нулевые 1-я и 2-я производные на краях ячейки). */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function gradientDot(seed: number, cellX: number, cellY: number, dx: number, dy: number): number {
  const index = hashInts(seed, cellX, cellY) & 7;
  return (GRADIENTS_X[index] ?? 0) * dx + (GRADIENTS_Y[index] ?? 0) * dy;
}

/**
 * Шум Перлина в точке (x, y), значения примерно в диапазоне −0.71…0.71. Допустимы дробные и
 * отрицательные координаты. На целых узлах значение равно 0.
 */
export function gradientNoise2(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const n00 = gradientDot(seed, x0, y0, fx, fy);
  const n10 = gradientDot(seed, x0 + 1, y0, fx - 1, fy);
  const n01 = gradientDot(seed, x0, y0 + 1, fx, fy - 1);
  const n11 = gradientDot(seed, x0 + 1, y0 + 1, fx - 1, fy - 1);
  const u = fade(fx);
  const v = fade(fy);
  const top = n00 + u * (n10 - n00);
  const bottom = n01 + u * (n11 - n01);
  return top + v * (bottom - top);
}

/** Функция поля: координаты в «единицах шума» → значение 0…1. */
export type Field2 = (x: number, y: number) => number;

/**
 * fBm: сумма `octaves` октав шума, каждая следующая вдвое чаще и вдвое слабее.
 * Результат приведён к диапазону 0…1 (среднее около 0.5).
 * Seed каждой октавы выводится из базового: `hashInts(baseSeed, octaveIndex)`.
 */
export function createFbm(baseSeed: number, octaves: number): Field2 {
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > 8) {
    throw new RangeError(`createFbm: число октав должно быть целым 1…8, получено ${octaves}`);
  }
  const seeds: number[] = [];
  for (let o = 0; o < octaves; o++) seeds.push(hashInts(baseSeed, o));
  return (x, y) => {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * gradientNoise2(seeds[o] ?? 0, x * frequency, y * frequency);
      norm += amplitude;
      amplitude /= 2;
      frequency *= 2;
    }
    return Math.min(1, Math.max(0, 0.5 + 0.5 * NOISE_GAIN * (sum / norm)));
  };
}
