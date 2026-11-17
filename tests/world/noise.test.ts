import { describe, expect, it } from 'vitest';
import { hashInts } from '../../src/core/Rng.ts';
import { createFbm, gradientNoise2 } from '../../src/systems/world/noise.ts';

describe('gradientNoise2', () => {
  it('равен нулю в узлах решётки', () => {
    for (const [x, y] of [
      [0, 0],
      [3, -7],
      [-12, 5],
    ] as const) {
      expect(gradientNoise2(123, x, y)).toBe(0);
    }
  });

  it('детерминирован и зависит от seed', () => {
    expect(gradientNoise2(5, 1.37, -2.91)).toBe(gradientNoise2(5, 1.37, -2.91));
    let different = 0;
    for (let i = 0; i < 50; i++) {
      if (
        gradientNoise2(1, i * 0.37 + 0.1, i * 0.21 + 0.3) !==
        gradientNoise2(2, i * 0.37 + 0.1, i * 0.21 + 0.3)
      ) {
        different++;
      }
    }
    expect(different).toBeGreaterThan(45);
  });

  it('значения в пределах ±0.71 и непрерывны', () => {
    const step = 0.01;
    let prev = gradientNoise2(9, -20, 4.3);
    let maxJump = 0;
    for (let i = 1; i < 6000; i++) {
      const v = gradientNoise2(9, -20 + i * step, 4.3 + i * step * 0.5);
      expect(Math.abs(v)).toBeLessThanOrEqual(0.7072);
      maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
    expect(maxJump).toBeLessThan(0.03);
  });

  it('корректен для отрицательных координат (непрерывен через ноль)', () => {
    const left = gradientNoise2(4, -0.0001, 0.5);
    const right = gradientNoise2(4, 0.0001, 0.5);
    expect(Math.abs(left - right)).toBeLessThan(0.001);
  });
});

describe('createFbm', () => {
  const fbm = createFbm(hashInts(77, 1), 4);

  it('значения в 0…1, среднее около 0.5, есть заметный разброс', () => {
    let min = 1;
    let max = 0;
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const v = fbm((i % 80) * 0.9 + 0.13, Math.floor(i / 80) * 0.9 + 0.29);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.4);
    expect(sum / n).toBeLessThan(0.6);
    expect(max - min).toBeGreaterThan(0.3);
  });

  it('детерминирован; разные seed дают разные поля', () => {
    const again = createFbm(hashInts(77, 1), 4);
    const other = createFbm(hashInts(78, 1), 4);
    let diff = 0;
    for (let i = 0; i < 100; i++) {
      const x = i * 0.7 + 0.2;
      expect(fbm(x, 3.3)).toBe(again(x, 3.3));
      if (fbm(x, 3.3) !== other(x, 3.3)) diff++;
    }
    expect(diff).toBeGreaterThan(90);
  });

  it('отвергает некорректное число октав', () => {
    expect(() => createFbm(1, 0)).toThrow(RangeError);
    expect(() => createFbm(1, 2.5)).toThrow(RangeError);
    expect(() => createFbm(1, 9)).toThrow(RangeError);
  });
});
