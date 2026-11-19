import type { Rng } from '../core/Rng.ts';
import { noise2, pickRamp, PixelBuffer, rgb, shadeColor, smoothNoise } from './pixelPainter.ts';
import type { Rgb } from './pixelPainter.ts';
import { PAL } from './spritePalette.ts';

/**
 * Природные объекты: деревья, камни, кусты, залежи. Каждая функция рисует один вариант спрайта
 * в готовый буфер; вся случайность — из переданного Rng (фиксированные ключи), поэтому рисунок
 * воспроизводим. Опора спрайта — середина нижнего края; земляная тень рисуется в самом низу.
 * Свет единый: сверху-слева; холодные тени и тёплые блики (docs/ASSETS.md).
 */

type Draw = (p: PixelBuffer, variant: number, rng: Rng) => void;

// ---------- Сосна ----------

interface PineStyle {
  tiers: number;
  top: number;
  bottom: number;
  halfWidth: number;
  lean: number;
}

const PINE_STYLES: readonly PineStyle[] = [
  { tiers: 4, top: 3, bottom: 76, halfWidth: 19, lean: 0 },
  { tiers: 3, top: 14, bottom: 77, halfWidth: 22, lean: 1 },
  { tiers: 5, top: 2, bottom: 78, halfWidth: 17, lean: -1.5 },
  { tiers: 4, top: 10, bottom: 75, halfWidth: 20, lean: 2 },
];

export const PINE_VARIANTS = PINE_STYLES.length;

const drawPine: Draw = (p, variant, rng) => {
  const style = PINE_STYLES[variant % PINE_STYLES.length] as PineStyle;
  const cx = 32;
  const groundY = 90;

  // Ствол с корневым расширением: кора светлее слева.
  for (let y = 66; y <= groundY; y++) {
    const k = (y - 66) / (groundY - 66);
    const lean = Math.round(style.lean * (1 - k));
    const half = 2 + Math.round(k * 1.4) + (y > groundY - 3 ? 1 : 0);
    for (let x = cx + lean - half; x <= cx + lean + half; x++) {
      const rel = (x - (cx + lean)) / (half + 0.5);
      let t = 0.62 - 0.4 * rel + (noise2(x, y, 31) - 0.5) * 0.25;
      if ((x + y * 3) % 5 === 0 && noise2(x, y, 32) > 0.45) t -= 0.2; // трещины коры
      p.put(x, y, pickRamp(PAL.bark, t, x, y, 0.3));
    }
  }

  // Ярусы лап: нижний рисуется первым, верхние ложатся поверх и отбрасывают на нижние тень.
  const { tiers } = style;
  const tierH = (style.bottom - style.top) / (1 + (tiers - 1) * 0.58);
  const step = tierH * 0.58;
  for (let i = tiers - 1; i >= 0; i--) {
    const apex = style.top + i * step;
    const base = apex + tierH;
    const baseHalf = style.halfWidth * (0.42 + 0.58 * ((i + 1) / tiers));
    const phase = rng.float(0, 6.28);
    const asym = rng.float(-0.14, 0.14);
    const tierLean = style.lean * (1 - i / tiers);
    const rowJitter: number[] = [];
    for (let y = 0; y <= Math.ceil(tierH) + 6; y++) rowJitter.push(rng.float(-1.5, 1.5));
    const x0Of = (dx: number): number => Math.floor(dx + 100);
    const bottomOf = (dx: number): number =>
      Math.round(
        base +
          3.2 * (Math.abs(dx) / baseHalf) +
          1.8 * Math.sin(dx * 1.25 + phase) +
          ((x0Of(dx) + i) % 4 === 0 ? 1 : 0),
      );

    const minX = Math.floor(cx + tierLean - baseHalf - 3);
    const maxX = Math.ceil(cx + tierLean + baseHalf + 3);
    const bottoms: number[] = [];
    for (let x = minX; x <= maxX; x++) {
      const dx = x - (cx + tierLean);
      bottoms.push(bottomOf(dx));
      for (let y = Math.floor(apex); y <= bottomOf(dx); y++) {
        const along = (y - apex) / tierH;
        const hw =
          baseHalf *
            (0.62 * Math.min(1, along) + 0.38 * Math.sqrt(Math.max(0, Math.min(1, along)))) +
          (rowJitter[Math.max(0, y - Math.floor(apex))] ?? 0);
        if (Math.abs(dx) > hw * (1 + asym * Math.sign(dx))) continue;
        const side = dx / baseHalf;
        let t = 0.72 - 0.34 * side - 0.1 * along;
        const toBottom = bottomOf(dx) - y;
        if (toBottom < 3) t -= 0.2 - toBottom * 0.05; // нижний край яруса в тени
        t += (noise2(x, y, 41 + i) - 0.5) * 0.2;
        if ((x * 2 + y * 3 + i * 5) % 7 === 0) t -= 0.12; // «иглы»: диагональные штрихи
        p.put(x, y, pickRamp(PAL.pine, t, x, y, 0.4));
      }
    }
    // Тень яруса на нижележащих частях.
    for (let x = minX; x <= maxX; x++) {
      const bottom = bottoms[x - minX] ?? 0;
      for (let y = bottom + 1; y <= bottom + 3; y++) p.tint(x, y, y === bottom + 1 ? 0.55 : 0.68);
    }
  }

  p.outline(0.5, 1.1);
  p.groundShadow(cx + 6, groundY - 1, 17, 4.5, 92);
};

// ---------- Сухое дерево ----------

const drawDead: Draw = (p, variant, rng) => {
  const cx = 32;
  const groundY = 90;
  const lean = variant === 0 ? -2 : 3;
  // Ствол: изгиб и сужение к вершине; один вариант сломан наверху.
  const topY = variant === 0 ? 20 : 34;
  p.thickLine(cx, groundY, cx + lean * 2, 60, 7.5, 5, PAL.deadWood, 0.25);
  p.thickLine(cx + lean * 2, 60, cx + lean, topY, 5, variant === 0 ? 2 : 3.2, PAL.deadWood, 0.25);
  // Корневое расширение.
  p.thickLine(cx - 4, groundY, cx, groundY - 8, 3, 3, PAL.deadWood);
  p.thickLine(cx + 5, groundY, cx + 1, groundY - 7, 3, 3, PAL.deadWood);

  const branch = (x0: number, y0: number, dx: number, dy: number, w: number): void => {
    const mx = x0 + dx * 0.55 + rng.float(-2, 2);
    const my = y0 + dy * 0.5 + rng.float(-2, 2);
    p.thickLine(x0, y0, mx, my, w, w * 0.6, PAL.deadWood);
    p.thickLine(mx, my, x0 + dx, y0 + dy, w * 0.6, 1, PAL.deadWood);
    // Мелкие веточки.
    const twigs = rng.int(1, 3);
    for (let t = 0; t < twigs; t++) {
      const k = rng.float(0.4, 0.9);
      const bx = mx + (x0 + dx - mx) * k;
      const by = my + (y0 + dy - my) * k;
      const sign = rng.chance(0.5) ? -1 : 1;
      p.line(
        bx,
        by,
        bx + sign * rng.int(3, 7),
        by - rng.int(3, 7),
        shadeColor(PAL.deadWood[2] as Rgb, 0.9),
      );
    }
  };
  const trunkAt = (y: number): number =>
    cx + Math.round(lean * 2 * ((groundY - y) / (groundY - 60 + 1)) * 0.5);
  branch(trunkAt(56), 56, -15, -16, 3);
  branch(trunkAt(50), 50, 14, -14, 3);
  branch(trunkAt(40), 40, -11, -17, 2.4);
  if (variant === 0) {
    branch(cx + lean + 1, 28, 9, -10, 2.2);
    branch(cx + lean, 30, -8, -9, 2);
  } else {
    branch(cx + lean * 1.5, 44, 12, 4, 2.4); // торчащий вбок сук
    p.rect(cx + lean - 1, topY - 1, 4, 2, PAL.deadWood[4] as Rgb); // свежий облом
  }
  // Лишайник и тёмные дупла.
  for (let i = 0; i < 6; i++) {
    const y = rng.int(58, 84);
    const x = cx + rng.int(-2, 2) + Math.round(lean * ((groundY - y) / 30));
    if (p.alphaAt(x, y) === 255) p.put(x, y, PAL.moss[1] as Rgb);
  }
  p.outline(0.5, 0.95);
  p.groundShadow(cx + 4, groundY - 1, 12, 3.6, 85);
};

// ---------- Поваленный ствол ----------

const drawLog: Draw = (p, variant, rng) => {
  const y0 = 18;
  const r = variant === 0 ? 8 : 7;
  const x0 = 9;
  const x1 = 57;
  for (let x = x0; x <= x1; x++) {
    const wobble = Math.round(Math.sin(x * 0.17 + variant) * 1.2);
    for (let dy = -r; dy <= r; dy++) {
      const y = y0 + dy + wobble;
      const rel = dy / r;
      // Цилиндр: светлее сверху, тёмная нижняя треть.
      let t = 0.78 - 0.55 * ((rel + 1) / 2) + 0.15 * (1 - Math.abs(rel));
      t += (noise2(x, y, 51) - 0.5) * 0.18;
      if (x % 6 === 0 && noise2(x, y, 52) > 0.35) t -= 0.22; // продольные трещины коры
      p.put(x, y, pickRamp(PAL.bark, t, x, y, 0.35));
    }
  }
  // Спил слева: светлая древесина с годовыми кольцами.
  const capX = x0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -3; dx <= 2; dx++) {
      const e = (dx / 3.2) * (dx / 3.2) + (dy / (r + 0.3)) * (dy / (r + 0.3));
      if (e > 1) continue;
      const ring = Math.floor(Math.sqrt(e) * 5);
      const color = (PAL.wood[ring % 2 === 0 ? 3 : 2] as Rgb) ?? rgb(0xc0a272);
      p.put(capX + dx, y0 + dy, color);
    }
  }
  // Сломанный правый конец: рваный край и торчащие щепки.
  for (let k = 0; k < 4; k++) {
    const sx = x1 + 1 + (k % 2);
    const sy = y0 - r + 2 + k * 4 + rng.int(-1, 1);
    p.rect(sx, sy, 2, 2, PAL.wood[1] as Rgb);
  }
  // Сучок и мох сверху.
  const stubX = 30 + variant * 6;
  p.thickLine(stubX, y0 - r + 1, stubX + 3, y0 - r - 5, 3.4, 2, PAL.bark, 0.2);
  p.rect(stubX + 2, y0 - r - 6, 2, 2, PAL.wood[3] as Rgb);
  for (let i = 0; i < 38; i++) {
    const x = rng.int(x0 + 6, x1 - 4);
    const y = y0 - r + rng.int(0, 3);
    if (p.alphaAt(x, y) === 255 && noise2(Math.floor(x / 4), 0, 55 + variant) > 0.42) {
      p.put(x, y, pickRamp(PAL.moss, rng.float(0.2, 1), x, y, 0));
    }
  }
  p.outline(0.5, 0.95);
  p.groundShadow(33, y0 + r + 1, 26, 4.2, 88);
};

// ---------- Камни ----------

function drawRock(
  p: PixelBuffer,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  rng: Rng,
  mossy: boolean,
): void {
  p.blob(cx, cy, rx, ry, {
    colors: PAL.stone,
    wobble: 0.14,
    phase: rng.float(0, 6.28),
    grain: 0.14,
    dither: 0.35,
    facets: Math.max(3, Math.round(rx / 2.4)),
    facetStrength: 0.16,
    seed,
  });
  // Трещины.
  const cracks = rx > 12 ? 3 : 1;
  for (let c = 0; c < cracks; c++) {
    let x = cx + rng.float(-rx * 0.4, rx * 0.4);
    let y = cy - ry * rng.float(0.2, 0.7);
    const length = Math.round(rx * rng.float(0.5, 0.9));
    for (let s = 0; s < length; s++) {
      x += rng.float(-0.8, 0.8);
      y += rng.float(0.2, 1.1);
      if (p.alphaAt(Math.round(x), Math.round(y)) === 255) {
        p.put(Math.round(x), Math.round(y), PAL.stone[0] as Rgb);
      }
    }
  }
  if (mossy) {
    // Мох на освещённой макушке и у основания.
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (p.alphaAt(x, y) !== 255) continue;
        const nearTop = (y - (cy - ry)) / (2 * ry);
        const n = smoothNoise(x, y, 3.2, seed + 99);
        const bottom = nearTop > 0.8 && n > 0.5;
        const top = nearTop < 0.5 && n > 0.62 && x < cx + rx * 0.3;
        if (top || bottom) p.put(x, y, pickRamp(PAL.moss, 0.25 + n * 0.7, x, y, 0.3));
      }
    }
  }
}

const BOULDER_SIZES: ReadonlyArray<readonly [number, number, number, boolean]> = [
  [10, 8, 17, false],
  [12, 8.5, 18, true],
  [9, 7, 19, false],
];

export const BOULDER_VARIANTS = BOULDER_SIZES.length;

const drawBoulder: Draw = (p, variant, rng) => {
  const [rx, ry, cy, mossy] = BOULDER_SIZES[variant % BOULDER_SIZES.length] as readonly [
    number,
    number,
    number,
    boolean,
  ];
  drawRock(p, 16, cy - 1, rx, ry, 60 + variant, rng, mossy);
  // Пара мелких камешков рядом.
  if (variant !== 1) {
    p.blob(26, 26, 2.8, 2.2, {
      colors: PAL.stone,
      wobble: 0.1,
      phase: 1,
      dither: 0,
      seed: 70 + variant,
    });
  }
  p.outline(0.5, 0.95);
  p.groundShadow(18, 26, 11 + variant, 3.2, 85);
};

const drawBoulderLarge: Draw = (p, variant, rng) => {
  const rx = variant === 0 ? 25 : 23;
  const ry = variant === 0 ? 19 : 17;
  drawRock(p, 31, 36, rx, ry, 80 + variant, rng, variant === 1);
  p.blob(12, 52, 6, 4.5, {
    colors: PAL.stone,
    wobble: 0.15,
    phase: 2,
    dither: 0,
    facets: 3,
    facetStrength: 0.3,
    seed: 90 + variant,
  });
  p.blob(54, 50, 4, 3.4, {
    colors: PAL.stone,
    wobble: 0.12,
    phase: 4,
    dither: 0,
    facets: 3,
    facetStrength: 0.3,
    seed: 95 + variant,
  });
  // Трава у основания.
  for (let i = 0; i < 14; i++) {
    const x = rng.int(6, 58);
    const y = rng.int(52, 56);
    if (p.alphaAt(x, y) === 255) p.put(x, y, PAL.grassTuft[rng.int(0, 2)] as Rgb);
  }
  p.outline(0.5, 0.95);
  p.groundShadow(35, 56, 28, 5, 88);
};

// ---------- Куст ----------

const drawBush: Draw = (p, variant, rng) => {
  const clumps: Array<[number, number, number]> = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 6.28 + variant;
    clumps.push([
      16 + Math.cos(a) * 7.5 + rng.float(-1, 1),
      19 + Math.sin(a) * 3.8 + rng.float(-1, 1),
      rng.float(5.5, 7.4),
    ]);
  }
  clumps.sort((a, b) => a[1] - b[1]); // дальние сверху рисуются первыми
  clumps.push([16 + rng.float(-2, 2), 15, 7.5]);
  for (const [x, y, r] of clumps) {
    p.blob(x, y, r, r * 0.88, {
      colors: PAL.leaf,
      wobble: 0.2,
      phase: rng.float(0, 6.28),
      grain: 0.28,
      dither: 0.45,
      seed: 110 + variant,
    });
  }
  // Светлые «листья» и тёмные промежутки.
  for (let i = 0; i < 26; i++) {
    const x = rng.int(5, 27);
    const y = rng.int(6, 25);
    if (p.alphaAt(x, y) !== 255) continue;
    p.put(x, y, i % 3 === 0 ? (PAL.leaf[0] as Rgb) : (PAL.leaf[5 - (i % 2)] as Rgb));
  }
  // Ягоды или цветы: узнаваемые акценты вариантов.
  const accents = variant === 1 ? PAL.berry : variant === 2 ? PAL.flowerA : null;
  if (accents) {
    for (let i = 0; i < 7; i++) {
      const x = rng.int(7, 25);
      const y = rng.int(8, 23);
      if (p.alphaAt(x, y) !== 255) continue;
      p.put(x, y, accents[accents.length - 1] as Rgb);
      if (variant === 1) p.put(x, y + 1, accents[0] as Rgb);
    }
  }
  p.outline(0.5, 1.08);
  p.groundShadow(19, 26, 11.5, 3, 82);
};

// ---------- Тростник ----------

const drawReeds: Draw = (p, variant, rng) => {
  const baseY = 59;
  const stems = variant === 0 ? 11 : 9;
  p.groundShadow(18, baseY + 1, 9, 2.6, 70);
  // Лужица у основания (болотный тростник).
  for (let i = 0; i < 18; i++) {
    const x = 8 + rng.int(0, 16);
    const y = baseY + rng.int(-1, 2);
    p.put(x, y, PAL.water[1 + (i % 3 === 0 ? 1 : 0)] as Rgb, 210);
  }
  const order: number[] = [];
  for (let i = 0; i < stems; i++) order.push(i);
  rng.shuffle(order);
  for (const i of order) {
    const spread = (i / (stems - 1) - 0.5) * 2;
    const x0 = 16 + spread * 7 + rng.float(-1, 1);
    const height = rng.float(30, 54) * (1 - Math.abs(spread) * 0.22);
    const bend = spread * rng.float(3, 7);
    const color = PAL.reed;
    let prevX = x0;
    for (let s = 0; s <= height; s++) {
      const k = s / height;
      const x = x0 + bend * k * k;
      const y = baseY - s;
      const t = 0.35 + 0.55 * k + (i % 2 === 0 ? 0.1 : 0);
      p.put(Math.round(x), Math.round(y), pickRamp(color, t, Math.round(x), y, 0));
      if (k < 0.55 && i % 3 !== 0)
        p.put(Math.round(x) + 1, Math.round(y), pickRamp(color, t - 0.25, Math.round(x), y, 0));
      prevX = x;
    }
    // Рогоз: бурая «сосиска» на части стеблей.
    if (i % 3 === 0 || (variant === 1 && i % 4 === 1)) {
      const topX = Math.round(prevX);
      const topY = Math.round(baseY - height);
      for (let dy = 0; dy < 7; dy++) {
        p.put(topX, topY + dy, PAL.cattail[1] as Rgb);
        p.put(topX + 1, topY + dy, PAL.cattail[0] as Rgb);
        if (dy > 0 && dy < 6) p.put(topX - 1, topY + dy, PAL.cattail[2] as Rgb);
      }
      p.put(topX, topY - 1, PAL.reed[3] as Rgb);
    }
  }
};

// ---------- Залежи ----------

const drawIron: Draw = (p, variant, rng) => {
  const chunks: ReadonlyArray<readonly [number, number, number, number]> =
    variant === 0
      ? [
          [30, 39, 21, 16],
          [49, 49, 9, 7],
          [13, 50, 8, 6],
        ]
      : [
          [27, 38, 17, 15],
          [46, 42, 12, 11],
          [32, 52, 9, 6],
        ];
  for (const [cx, cy, rx, ry] of chunks) {
    p.blob(cx, cy, rx, ry, {
      colors: PAL.ore.map((c) => shadeColor(c, 0.78)),
      wobble: 0.13,
      phase: rng.float(0, 6.28),
      grain: 0.14,
      dither: 0.3,
      facets: Math.max(3, Math.round(rx / 2.6)),
      facetStrength: 0.2,
      seed: 120 + variant,
    });
    // Ржавые жилы.
    const veins = Math.max(2, Math.round(rx / 5));
    for (let v = 0; v < veins; v++) {
      let x = cx + rng.float(-rx * 0.6, rx * 0.6);
      let y = cy + rng.float(-ry * 0.6, ry * 0.3);
      const dir = rng.chance(0.5) ? 1 : -1;
      const length = rng.int(5, Math.max(6, Math.round(rx * 0.9)));
      for (let s = 0; s < length; s++) {
        x += dir * rng.float(0.4, 1.1);
        y += rng.float(-0.2, 1.0);
        const px = Math.round(x);
        const py = Math.round(y);
        if (p.alphaAt(px, py) !== 255) continue;
        p.put(px, py, PAL.rust[2 + (s % 3 === 0 ? 1 : 0)] as Rgb);
        if (s % 2 === 0 && p.alphaAt(px + 1, py) === 255) p.put(px + 1, py, PAL.rust[1] as Rgb);
      }
    }
    // Блики на гранях, обращённых к свету.
    for (let g = 0; g < 4; g++) {
      const x = Math.round(cx - rx * rng.float(0.2, 0.7));
      const y = Math.round(cy - ry * rng.float(0.3, 0.8));
      if (p.alphaAt(x, y) === 255) {
        p.put(x, y, PAL.rust[4] as Rgb);
        p.put(x - 1, y, PAL.ore[5] as Rgb);
      }
    }
  }
  p.outline(0.5, 0.95);
  p.groundShadow(33, 56, 28, 5, 90);
};

const drawScrap: Draw = (p, variant, rng) => {
  // Куча: листы металла под разными углами, трубы, ржавчина и пара окрашенных панелей.
  const plates = variant === 0 ? 9 : 8;
  const palettes = [PAL.steel, PAL.steel, PAL.rust, PAL.steel, PAL.olive, PAL.ore];
  for (let i = 0; i < plates; i++) {
    const cx = 32 + rng.float(-16, 16);
    const cy = 40 + rng.float(-6, 13);
    const w = rng.float(14, 26);
    const h = rng.float(7, 12);
    const angle = rng.float(-0.55, 0.55);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const corners: Array<[number, number]> = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => [
      cx + (x as number) * cos - (y as number) * sin,
      cy + (x as number) * sin + (y as number) * cos,
    ]);
    const colors = palettes[i % palettes.length] ?? PAL.steel;
    p.fillPolygon(corners, (x, y) => {
      const lx = (x - cx) * cos + (y - cy) * sin;
      const ly = -(x - cx) * sin + (y - cy) * cos;
      let t = 0.62 - 0.35 * (ly / h) - 0.2 * (lx / w);
      if (ly > h / 2 - 1.6) t -= 0.3; // нижняя кромка в тени
      if (ly < -h / 2 + 1.4) t += 0.25; // верхняя кромка ловит свет
      t += (noise2(x, y, 130 + i) - 0.5) * 0.18;
      return pickRamp(colors, t, x, y, 0);
    });
    // Заклёпки.
    if (rng.chance(0.6)) {
      const bx = Math.round(cx - w / 3);
      const by = Math.round(cy);
      p.put(bx, by, PAL.steel[4] as Rgb);
      p.put(bx + 1, by + 1, PAL.steel[0] as Rgb);
    }
  }
  // Трубы.
  p.thickLine(14, 52, 40, 48, 5.5, 5.5, PAL.steel, 0.2);
  p.rect(39, 45, 2, 6, PAL.steel[0] as Rgb);
  p.thickLine(34, 30, 52, 36, 4.5, 4.5, PAL.ore, 0.2);
  // Ржавые потёки.
  for (let i = 0; i < 40; i++) {
    const x = rng.int(10, 54);
    const y = rng.int(26, 56);
    if (p.alphaAt(x, y) === 255 && noise2(x, y, 140) > 0.55) {
      p.put(x, y, PAL.rust[2 + (i % 2)] as Rgb);
    }
  }
  p.outline(0.5, 0.95);
  p.groundShadow(33, 57, 28, 4.6, 90);
};

const drawPeat: Draw = (p, variant, rng) => {
  // Влажный бурый холм со слоями и пучками травы; рядом лужица.
  p.groundShadow(33, 55, 28, 5, 80);
  p.blob(31, 39, 24, 17, {
    colors: PAL.peat,
    wobble: 0.1,
    phase: rng.float(0, 6.28),
    grain: 0.22,
    dither: 0.35,
    seed: 150 + variant,
  });
  // Слои торфа.
  for (let y = 28; y < 54; y += 4) {
    for (let x = 8; x < 56; x++) {
      if (p.alphaAt(x, y) === 255 && smoothNoise(x, y, 6, 160 + y) > 0.45) {
        p.tint(x, y, 0.82);
      }
    }
  }
  // Влажный блеск.
  for (let i = 0; i < 16; i++) {
    const x = rng.int(14, 44);
    const y = rng.int(26, 44);
    if (p.alphaAt(x, y) === 255)
      p.put(x, y, i % 3 === 0 ? (PAL.water[2] as Rgb) : (PAL.peat[4] as Rgb));
  }
  // Трава на макушке.
  for (let i = 0; i < 9; i++) {
    const x = rng.int(16, 46);
    const y = rng.int(23, 32);
    if (p.alphaAt(x, y) !== 255) continue;
    const h = rng.int(3, 5);
    for (let k = 0; k < h; k++)
      p.put(x + (k > 2 ? 1 : 0), y - k, PAL.grassTuft[(k + 1) % 3] as Rgb);
  }
  // Лужа.
  const puddleX = variant === 0 ? 48 : 14;
  p.blob(puddleX, 55, 9, 3.2, {
    colors: PAL.water,
    wobble: 0.12,
    phase: 1,
    grain: 0.1,
    dither: 0.3,
    seed: 170 + variant,
  });
  p.put(puddleX - 3, 54, PAL.water[3] as Rgb);
  p.put(puddleX - 2, 54, PAL.water[3] as Rgb);
  p.outline(0.55, 0.95);
};

export interface NaturalSprite {
  readonly type: string;
  readonly width: number;
  readonly height: number;
  readonly variants: number;
  readonly draw: Draw;
}

export const NATURAL_SPRITES: readonly NaturalSprite[] = [
  { type: 'tree_pine', width: 64, height: 96, variants: PINE_VARIANTS, draw: drawPine },
  { type: 'tree_dead', width: 64, height: 96, variants: 2, draw: drawDead },
  { type: 'fallen_log', width: 64, height: 32, variants: 2, draw: drawLog },
  { type: 'boulder', width: 32, height: 32, variants: BOULDER_VARIANTS, draw: drawBoulder },
  { type: 'boulder_large', width: 64, height: 64, variants: 2, draw: drawBoulderLarge },
  { type: 'bush', width: 32, height: 32, variants: 3, draw: drawBush },
  { type: 'reeds', width: 32, height: 64, variants: 2, draw: drawReeds },
  { type: 'iron_ore', width: 64, height: 64, variants: 2, draw: drawIron },
  { type: 'scrap_pile', width: 64, height: 64, variants: 2, draw: drawScrap },
  { type: 'peat', width: 64, height: 64, variants: 2, draw: drawPeat },
];
