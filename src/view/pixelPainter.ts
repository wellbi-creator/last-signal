import { hashInts } from '../core/Rng.ts';

/**
 * Примитивы пиксельного рисования для временной графики объектов (решение D5).
 * Работает с обычным буфером RGBA без Phaser и DOM, поэтому спрайты строятся и проверяются в Node.
 * Этот файл — слой отображения: здесь допустимы Math.sin/sqrt (детерминизм мира их не использует);
 * рисунок воспроизводим, потому что вся случайность идёт из Rng с фиксированными ключами.
 *
 * Свет в проекте единый: сверху-слева. Освещённые края — левые и верхние, тени — правые и нижние.
 */

export type Rgb = readonly [number, number, number];

export function rgb(hex: number): Rgb {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Рампа цветов от тёмного (индекс 0) к светлому. */
export type Ramp = readonly Rgb[];

export function ramp(...hex: number[]): Ramp {
  return hex.map(rgb);
}

/** Единичный вектор света (сверху-слева, чуть к зрителю). */
const LIGHT_X = -0.55;
const LIGHT_Y = -0.65;
const LIGHT_Z = 0.52;

const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Порог упорядоченного дизеринга 0…1 для пикселя. */
export function bayer(x: number, y: number): number {
  return ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
}

/** Хеш-шум 0…1 в целой точке. */
export function noise2(x: number, y: number, seed: number): number {
  return (hashInts(x, y, seed) >>> 8) / 16777216;
}

/** Блочный шум: значение постоянно в клетке `cell`×`cell` (грани камня, пятна мха). */
export function blockNoise(x: number, y: number, cell: number, seed: number): number {
  return noise2(Math.floor(x / cell), Math.floor(y / cell), seed);
}

/** Мягкий шум: билинейная интерполяция по решётке с шагом `cell`. */
export function smoothNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = noise2(gx, gy, seed);
  const b = noise2(gx + 1, gy, seed);
  const c = noise2(gx, gy + 1, seed);
  const d = noise2(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Цвет рампы для яркости t (0…1) с дизерингом силой `dither` (0 — жёсткие полосы). */
export function pickRamp(colors: Ramp, t: number, x: number, y: number, dither = 0): Rgb {
  const last = colors.length - 1;
  const v = clamp01(t) * last;
  let index = Math.floor(v);
  if (index >= last) return colors[last] as Rgb;
  const frac = v - index;
  if (dither > 0) {
    const edge = 0.5 - dither / 2;
    const f = clamp01((frac - edge) / dither);
    if (f > bayer(x, y)) index++;
  } else if (frac >= 0.5) {
    index++;
  }
  return colors[Math.min(last, index)] as Rgb;
}

/** Смешивает цвет с чёрным (k < 1 — темнее) или белым (k > 1 — светлее). */
export function shadeColor(color: Rgb, k: number): Rgb {
  if (k <= 1) return [Math.round(color[0] * k), Math.round(color[1] * k), Math.round(color[2] * k)];
  const m = k - 1;
  return [
    Math.round(color[0] + (255 - color[0]) * m),
    Math.round(color[1] + (255 - color[1]) * m),
    Math.round(color[2] + (255 - color[2]) * m),
  ];
}

export interface BlobOptions {
  /** Рампа цветов. */
  colors: Ramp;
  /** Неровность края: 0 — эллипс, 0.2 — заметно «рваный». */
  wobble: number;
  /** Фаза неровности (разная у разных вариантов). */
  phase: number;
  /** Сила шума поверхности. */
  grain?: number;
  /** Дизеринг на границах полос (0 — жёсткие). */
  dither?: number;
  /** Блочные грани: размер клетки шума в пикселях (0 — нет). */
  facets?: number;
  /** Сила граней. */
  facetStrength?: number;
  seed: number;
}

/** Рисующий буфер RGBA. */
export class PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  alphaAt(x: number, y: number): number {
    return this.inside(x, y) ? (this.data[(y * this.width + x) * 4 + 3] ?? 0) : 0;
  }

  colorAt(x: number, y: number): Rgb {
    const at = (y * this.width + x) * 4;
    return [this.data[at] ?? 0, this.data[at + 1] ?? 0, this.data[at + 2] ?? 0];
  }

  /** Ставит пиксель поверх (source-over). */
  put(x: number, y: number, color: Rgb, alpha = 255): void {
    if (!this.inside(x, y)) return;
    const at = (y * this.width + x) * 4;
    if (alpha >= 255) {
      this.data[at] = color[0];
      this.data[at + 1] = color[1];
      this.data[at + 2] = color[2];
      this.data[at + 3] = 255;
      return;
    }
    const dstA = (this.data[at + 3] ?? 0) / 255;
    const srcA = alpha / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    for (let c = 0; c < 3; c++) {
      const dst = this.data[at + c] ?? 0;
      this.data[at + c] = Math.round(((color[c] ?? 0) * srcA + dst * dstA * (1 - srcA)) / outA);
    }
    this.data[at + 3] = Math.round(outA * 255);
  }

  /** Ставит пиксель только там, где ещё ничего нет (тени под объектом). */
  putBehind(x: number, y: number, color: Rgb, alpha: number): void {
    if (!this.inside(x, y) || this.alphaAt(x, y) > 0) return;
    this.put(x, y, color, alpha);
  }

  /** Затемняет или осветляет уже нарисованный пиксель. */
  tint(x: number, y: number, k: number): void {
    if (this.alphaAt(x, y) < 200) return;
    const c = shadeColor(this.colorAt(x, y), k);
    this.put(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb, alpha = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, color, alpha);
  }

  /** Линия Брезенхэма толщиной 1. */
  line(x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.put(x, y, color);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * Толстая линия (ветка, стебель, труба) с цилиндрическим освещением: левый край светлее.
   * Толщина плавно меняется от w0 к w1.
   */
  thickLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w0: number,
    w1: number,
    colors: Ramp,
    dither = 0,
  ): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const cx = x0 + (x1 - x0) * k;
      const cy = y0 + (y1 - y0) * k;
      const r = (w0 + (w1 - w0) * k) / 2;
      const reach = Math.ceil(r + 1);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const px = Math.round(cx) + dx;
          const py = Math.round(cy) + dy;
          const ox = px - cx;
          const oy = py - cy;
          if (ox * ox + oy * oy > r * r + 0.25) continue;
          const t = 0.55 - 0.5 * (ox / Math.max(0.8, r)) - 0.12 * (oy / Math.max(0.8, r));
          this.put(px, py, pickRamp(colors, t, px, py, dither));
        }
      }
    }
  }

  /** Мягкая тень на земле: эллипс, рисуется только в пустых пикселях. */
  groundShadow(cx: number, cy: number, rx: number, ry: number, alpha = 90): void {
    const shadow: Rgb = [10, 16, 22];
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        // Край мягче: две ступени прозрачности (пиксель-арт без размытия).
        this.putBehind(x, y, shadow, d > 0.55 ? Math.round(alpha * 0.55) : alpha);
      }
    }
  }

  /**
   * Объёмный пятно (камень, куст, холм): эллипс с неровным краем, освещённый сверху-слева.
   * Возвращает число нарисованных пикселей.
   */
  blob(cx: number, cy: number, rx: number, ry: number, o: BlobOptions): number {
    const { colors, wobble, phase, seed } = o;
    const grain = o.grain ?? 0.1;
    const dither = o.dither ?? 0.5;
    let painted = 0;
    const reachX = Math.ceil(rx * (1 + wobble) + 1);
    const reachY = Math.ceil(ry * (1 + wobble) + 1);
    for (let y = Math.floor(cy - reachY); y <= Math.ceil(cy + reachY); y++) {
      for (let x = Math.floor(cx - reachX); x <= Math.ceil(cx + reachX); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        const dist = Math.sqrt(u * u + v * v);
        const angle = Math.atan2(v, u);
        const edge =
          1 +
          wobble *
            (0.55 * Math.sin(angle * 3 + phase) +
              0.3 * Math.sin(angle * 5 + phase * 1.7) +
              0.15 * Math.sin(angle * 9 + phase * 2.3));
        if (dist > edge) continue;
        const s = dist / edge;
        const nz = Math.sqrt(Math.max(0, 1 - s * s));
        const nx = u / edge;
        const ny = v / edge;
        let t = nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z;
        t = 0.1 + 0.85 * ((t + 0.35) / 1.35);
        t += (noise2(x, y, seed) - 0.5) * grain;
        if (o.facets && o.facets > 0) {
          t += (blockNoise(x, y, o.facets, seed + 7) - 0.5) * (o.facetStrength ?? 0.3);
        }
        this.put(x, y, pickRamp(colors, t, x, y, dither));
        painted++;
      }
    }
    return painted;
  }

  /** Заливает произвольную фигуру: `inside` задаёт форму, `shader` — цвет. */
  fillShape(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    inside: (x: number, y: number) => boolean,
    shader: (x: number, y: number) => Rgb,
  ): void {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        if (inside(x, y)) this.put(x, y, shader(x, y));
      }
    }
  }

  /** Заливка многоугольника (чётно-нечётное правило), цвет — функция пикселя. */
  fillPolygon(
    points: ReadonlyArray<readonly [number, number]>,
    shader: (x: number, y: number) => Rgb,
  ): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of points) {
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const hits: number[] = [];
      const yc = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i] as readonly [number, number];
        const b = points[(i + 1) % points.length] as readonly [number, number];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
          hits.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      hits.sort((p, q) => p - q);
      for (let h = 0; h + 1 < hits.length; h += 2) {
        for (let x = Math.round(hits[h] as number); x < Math.round(hits[h + 1] as number); x++) {
          this.put(x, y, shader(x, y));
        }
      }
    }
  }

  /**
   * Контур по краю фигуры в цвете самих пикселей («выборочный» контур): нижний и правый края
   * темнее (`dark`), верхний и левый — мягче (`soft`). Тени с прозрачностью не обводятся.
   */
  outline(dark = 0.52, soft = 0.78): void {
    const marks: Array<[number, number, number]> = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.alphaAt(x, y) < 250) continue;
        const open = (dx: number, dy: number): boolean => this.alphaAt(x + dx, y + dy) < 200;
        const below = open(0, 1) || open(1, 0);
        const above = open(0, -1) || open(-1, 0);
        if (below) marks.push([x, y, dark]);
        else if (above) marks.push([x, y, soft]);
      }
    }
    for (const [x, y, k] of marks) this.put(x, y, shadeColor(this.colorAt(x, y), k));
  }

  /** Число непрозрачных пикселей. */
  opaqueCount(): number {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if ((this.data[i] ?? 0) === 255) n++;
    return n;
  }
}
