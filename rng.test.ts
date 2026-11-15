import { describe, expect, it } from 'vitest';
import { Rng, hashInts, hashString } from '../../src/core/Rng.ts';

/*
 * «Золотые» значения получены из независимой канонической реализации mulberry32 и FNV-1a.
 * Если эти тесты падают, значит изменился алгоритм: все существующие миры и сохранения
 * станут несовместимыми. Менять ожидаемые значения нельзя, нужно исправлять код.
 */
describe('hashString (FNV-1a 32 бита)', () => {
  it('совпадает с общеизвестными тестовыми векторами', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('детерминирован и различает разные строки', () => {
    expect(hashString('M0-DEMO')).toBe(3353420036);
    expect(hashString('M0-DEMO')).toBe(hashString('M0-DEMO'));
    expect(hashString('M0-DEMO')).not.toBe(hashString('M0-DEMP'));
  });

  it('возвращает беззнаковое 32-битное целое', () => {
    for (const text of ['', 'abc', 'Привет, мир', '🙂🙂🙂']) {
      const h = hashString(text);
      expect(Number.isInteger(h)).toBeTruthy();
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(4294967296);
    }
  });
});

describe('hashInts', () => {
  it('детерминирован', () => {
    expect(hashInts(42, 3, 5)).toBe(hashInts(42, 3, 5));
  });

  it('зависит от порядка и количества значений', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1));
    expect(hashInts(1, 2)).not.toBe(hashInts(1, 2, 0));
  });

  it('поддерживает отрицательные координаты', () => {
    expect(hashInts(7, -1, -1)).toBe(hashInts(7, -1, -1));
    expect(hashInts(7, -1, 0)).not.toBe(hashInts(7, 1, 0));
  });

  it('не даёт совпадений seed чанков на сетке 32×32', () => {
    const seen = new Set<number>();
    for (let cx = 0; cx < 32; cx++) {
      for (let cy = 0; cy < 32; cy++) {
        seen.add(hashInts(123456, cx, cy));
      }
    }
    expect(seen.size).toBe(32 * 32);
  });
});

describe('Rng (mulberry32)', () => {
  it('совпадает с эталонной реализацией', () => {
    const a = new Rng(12345);
    expect([a.next(), a.next(), a.next(), a.next(), a.next()]).toEqual([
      0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203,
      0.5094283693470061,
    ]);
    const b = new Rng(0);
    expect([b.next(), b.next(), b.next()]).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
    ]);
  });

  it('один seed даёт одну и ту же последовательность', () => {
    const a = Rng.fromText('seed-1');
    const b = Rng.fromText('seed-1');
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('разные seed дают разные последовательности', () => {
    expect(Rng.fromText('seed-1').next()).not.toBe(Rng.fromText('seed-2').next());
  });

  it('значения лежат в [0, 1) и распределены примерно равномерно', () => {
    const rng = new Rng(2024);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02);
  });

  it('int включает обе границы и не выходит за них', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
    expect(new Rng(1).int(5, 5)).toBe(5);
  });

  it('int и float отвергают некорректные диапазоны', () => {
    const rng = new Rng(1);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.float(2, 1)).toThrow(RangeError);
    expect(() => rng.float(0, Number.NaN)).toThrow(RangeError);
  });

  it('float лежит в [min, max)', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 500; i++) {
      const v = rng.float(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
    }
  });

  it('chance: 0 никогда, 1 всегда', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('pick возвращает элемент массива и бросает ошибку на пустом', () => {
    const rng = new Rng(9);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('shuffle сохраняет элементы, меняет массив на месте и детерминирован', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = [...source];
    const result = new Rng(77).shuffle(a);
    expect(result).toBe(a);
    expect([...a].sort((x, y) => x - y)).toEqual(source);
    const b = [...source];
    new Rng(77).shuffle(b);
    expect(b).toEqual(a);
  });

  it('child не зависит от того, сколько чисел уже получено', () => {
    const fresh = new Rng(100);
    const used = new Rng(100);
    for (let i = 0; i < 50; i++) used.next();
    expect(used.child(3, 4).next()).toBe(fresh.child(3, 4).next());
  });

  it('child с разными ключами независимы', () => {
    const rng = new Rng(100);
    expect(rng.child(0, 0).next()).not.toBe(rng.child(0, 1).next());
  });

  it('демо-последовательность для проверки на устройствах (M0-DEMO)', () => {
    // Те же числа показываются на экране меню: ПК и iPhone должны совпасть.
    const rng = Rng.fromText('M0-DEMO').child(0);
    expect([rng.int(1, 99), rng.int(1, 99), rng.int(1, 99)]).toEqual([21, 44, 61]);
  });
});
