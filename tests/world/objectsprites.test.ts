import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../src/config.ts';
import {
  buildObjectAtlas,
  OBJECT_SPRITES,
  renderSprite,
  spriteDef,
} from '../../src/view/objectAtlas.ts';
import { objectDepth, variantFor } from '../../src/view/ObjectView.ts';
import { bayer, pickRamp, PixelBuffer, ramp } from '../../src/view/pixelPainter.ts';
import { data } from './objectsHelpers.ts';

/*
 * Проверки временной графики объектов (M1.5b) без Phaser: рисунок строится в обычном буфере RGBA.
 * Тесты лежат рядом с остальными тестами мира; слой отображения Phaser проверяется на экране.
 */

/** Побайтовое сравнение буферов (быстрее и экономнее, чем глубокое сравнение объектов). */
function equalBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const BUILDING_TYPES = ['ruin_house_a', 'ruin_house_b', 'ruin_shed'];

describe('спрайты объектов: покрытие данных', () => {
  it('у каждого типа из objects.json есть спрайт, и наоборот', () => {
    const logic = data.layers.flatMap((l) => l.types.map((t) => t.type)).sort();
    const sprites = OBJECT_SPRITES.map((s) => s.type).sort();
    expect(sprites).toEqual(logic);
  });

  it('есть несколько вариантов у деревьев, камней и кустов; у остальных не меньше двух', () => {
    expect(spriteDef('tree_pine')?.variants).toBeGreaterThanOrEqual(3);
    expect(spriteDef('boulder')?.variants).toBeGreaterThanOrEqual(3);
    expect(spriteDef('bush')?.variants).toBeGreaterThanOrEqual(3);
    for (const s of OBJECT_SPRITES) expect(s.variants).toBeGreaterThanOrEqual(2);
  });

  it('спрайт не меньше габарита (в пикселях) и кратен тайлу по ширине', () => {
    for (const layer of data.layers) {
      for (const def of layer.types) {
        const sprite = spriteDef(def.type);
        expect(sprite?.width ?? 0).toBeGreaterThanOrEqual(def.w * TILE_SIZE);
        expect(sprite?.height ?? 0).toBeGreaterThanOrEqual(def.h * TILE_SIZE);
        expect((sprite?.width ?? 1) % TILE_SIZE).toBe(0);
        expect((sprite?.height ?? 1) % TILE_SIZE).toBe(0);
      }
    }
  });

  it('здания в точности равны своему габариту (спрайт без «выступов»)', () => {
    for (const type of BUILDING_TYPES) {
      const def = data.layers.flatMap((l) => l.types).find((t) => t.type === type);
      expect(spriteDef(type)?.width).toBe((def?.w ?? 0) * TILE_SIZE);
      expect(spriteDef(type)?.height).toBe((def?.h ?? 0) * TILE_SIZE);
    }
  });
});

describe('спрайты объектов: рисунок', () => {
  it('рисунок воспроизводим: два построения дают одинаковые пиксели', () => {
    for (const sprite of OBJECT_SPRITES) {
      for (let v = 0; v < sprite.variants; v++) {
        const a = renderSprite(sprite, v);
        const b = renderSprite(sprite, v);
        expect(equalBytes(a.data, b.data)).toBe(true);
      }
    }
  });

  it('варианты одного типа различаются', () => {
    for (const sprite of OBJECT_SPRITES) {
      const first = renderSprite(sprite, 0).data;
      for (let v = 1; v < sprite.variants; v++) {
        expect(equalBytes(renderSprite(sprite, v).data, first)).toBe(false);
      }
    }
  });

  it('каждый кадр непустой и достаточно заполнен', () => {
    for (const sprite of OBJECT_SPRITES) {
      for (let v = 0; v < sprite.variants; v++) {
        const opaque = renderSprite(sprite, v).opaqueCount();
        const area = sprite.width * sprite.height;
        expect(opaque).toBeGreaterThan(area * 0.05);
        expect(opaque).toBeLessThan(area * 0.97);
      }
    }
  });

  it('опора: у нижнего края у середины спрайта есть пиксели (объект стоит на земле, тень)', () => {
    for (const sprite of OBJECT_SPRITES) {
      for (let v = 0; v < sprite.variants; v++) {
        const buffer = renderSprite(sprite, v);
        let touching = 0;
        for (let y = sprite.height - 14; y < sprite.height; y++) {
          for (let x = sprite.width / 2 - 8; x < sprite.width / 2 + 8; x++) {
            if (buffer.alphaAt(x, y) > 0) touching++;
          }
        }
        expect(touching).toBeGreaterThan(8);
      }
    }
  });

  it('природные объекты не обрезаны по бокам и сверху', () => {
    for (const sprite of OBJECT_SPRITES) {
      if (BUILDING_TYPES.includes(sprite.type)) continue;
      for (let v = 0; v < sprite.variants; v++) {
        const buffer = renderSprite(sprite, v);
        for (let y = 0; y < sprite.height; y++) {
          expect(buffer.alphaAt(0, y), `${sprite.type}_${v}: левый край`).toBe(0);
          expect(buffer.alphaAt(sprite.width - 1, y), `${sprite.type}_${v}: правый край`).toBe(0);
        }
        for (let x = 0; x < sprite.width; x++) {
          expect(buffer.alphaAt(x, 0), `${sprite.type}_${v}: верх`).toBe(0);
        }
      }
    }
  });

  it('палитра приглушённая: нет чисто белых и ярких «кислотных» пикселей', () => {
    for (const sprite of OBJECT_SPRITES) {
      const buffer = renderSprite(sprite, 0);
      for (let i = 0; i < buffer.data.length; i += 4) {
        if ((buffer.data[i + 3] ?? 0) < 255) continue;
        const r = buffer.data[i] ?? 0;
        const g = buffer.data[i + 1] ?? 0;
        const b = buffer.data[i + 2] ?? 0;
        expect(Math.min(r, g, b)).toBeLessThan(235);
        expect(Math.max(r, g, b)).toBeLessThan(250);
      }
    }
  });
});

describe('атлас объектов', () => {
  const atlas = buildObjectAtlas();

  it('содержит все кадры, имена уникальны', () => {
    const total = OBJECT_SPRITES.reduce((sum, s) => sum + s.variants, 0);
    expect(atlas.frames).toHaveLength(total);
    expect(new Set(atlas.frames.map((f) => f.name)).size).toBe(total);
    expect(atlas.data).toHaveLength(atlas.width * atlas.height * 4);
  });

  it('кадры лежат внутри атласа и не пересекаются (зазор не меньше 2 пикселей)', () => {
    for (const f of atlas.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.width).toBeLessThanOrEqual(atlas.width);
      expect(f.y + f.height).toBeLessThanOrEqual(atlas.height);
    }
    for (let i = 0; i < atlas.frames.length; i++) {
      for (let j = i + 1; j < atlas.frames.length; j++) {
        const a = atlas.frames[i];
        const b = atlas.frames[j];
        if (!a || !b) continue;
        const apart =
          a.x + a.width + 2 <= b.x ||
          b.x + b.width + 2 <= a.x ||
          a.y + a.height + 2 <= b.y ||
          b.y + b.height + 2 <= a.y;
        expect(apart, `${a.name} и ${b.name}`).toBe(true);
      }
    }
  });

  it('пиксели кадра в атласе совпадают с отдельно нарисованным спрайтом', () => {
    for (const f of atlas.frames) {
      const def = spriteDef(f.type);
      if (!def) throw new Error(f.type);
      const single = renderSprite(def, f.variant);
      for (const [x, y] of [
        [0, 0],
        [Math.floor(f.width / 2), f.height - 4],
        [f.width - 1, f.height - 1],
        [Math.floor(f.width / 3), Math.floor(f.height / 2)],
      ] as const) {
        const at = ((f.y + y) * atlas.width + f.x + x) * 4;
        const own = (y * f.width + x) * 4;
        for (let c = 0; c < 4; c++) expect(atlas.data[at + c]).toBe(single.data[own + c]);
      }
    }
  });

  it('размер атласа умеренный (память текстуры на телефоне)', () => {
    expect(atlas.width * atlas.height * 4).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('глубина и варианты на экране', () => {
  it('чем ниже нижний край габарита, тем объект «ближе» (глубже в списке)', () => {
    expect(objectDepth(10, 11, 1, 1)).toBeGreaterThan(objectDepth(10, 10, 1, 1));
    // Здание начинается выше, но его нижний край ниже (13 против 12): оно ближе к зрителю.
    expect(objectDepth(10, 8, 6, 5)).toBeGreaterThan(objectDepth(10, 11, 1, 1));
    expect(objectDepth(10, 8, 6, 5)).toBeLessThan(objectDepth(10, 14, 1, 1));
  });

  it('при равной высоте порядок по x устойчив и не перескакивает на следующий ряд', () => {
    const a = objectDepth(5, 20, 1, 1);
    const b = objectDepth(200, 20, 1, 1);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(1);
    expect(objectDepth(255, 20, 1, 1)).toBeLessThan(objectDepth(0, 21, 1, 1));
  });

  it('глубина объектов больше глубины тайловых слоёв (0)', () => {
    expect(objectDepth(0, 0, 1, 1)).toBeGreaterThan(0);
  });

  it('вариант: детерминирован, в диапазоне, используются все варианты', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        const v = variantFor(x, y, 4);
        expect(v).toBe(variantFor(x, y, 4));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(4);
        seen.add(v);
      }
    }
    expect(seen.size).toBe(4);
  });
});

describe('PixelBuffer', () => {
  it('put смешивает прозрачность, putBehind не трогает занятые пиксели', () => {
    const p = new PixelBuffer(4, 4);
    p.put(1, 1, [200, 0, 0]);
    p.putBehind(1, 1, [0, 0, 200], 255);
    expect(p.colorAt(1, 1)).toEqual([200, 0, 0]);
    p.putBehind(2, 2, [0, 0, 200], 100);
    expect(p.alphaAt(2, 2)).toBe(100);
    p.put(2, 2, [0, 200, 0], 128);
    expect(p.alphaAt(2, 2)).toBeGreaterThan(100);
    p.put(-1, 0, [1, 1, 1]); // вне буфера — без ошибки
    p.put(9, 9, [1, 1, 1]);
    expect(p.alphaAt(-1, 0)).toBe(0);
  });

  it('контур темнее на нижнем и правом краях и не обводит тени', () => {
    const p = new PixelBuffer(8, 8);
    p.rect(2, 2, 4, 4, [120, 120, 120]);
    p.groundShadow(4, 7, 3, 1, 90);
    p.outline();
    const bottom = p.colorAt(3, 5);
    const inner = p.colorAt(3, 3);
    expect(bottom[0]).toBeLessThan(inner[0]);
    expect(p.alphaAt(4, 7)).toBeLessThan(255);
  });

  it('pickRamp: границы рампы и упорядоченный дизеринг', () => {
    const colors = ramp(0x000000, 0x808080, 0xffffff);
    expect(pickRamp(colors, 0, 0, 0)).toEqual([0, 0, 0]);
    expect(pickRamp(colors, 1, 0, 0)).toEqual([255, 255, 255]);
    expect(pickRamp(colors, -5, 0, 0)).toEqual([0, 0, 0]);
    expect(pickRamp(colors, 9, 0, 0)).toEqual([255, 255, 255]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(bayer(x, y)).toBeGreaterThan(0);
  });
});
