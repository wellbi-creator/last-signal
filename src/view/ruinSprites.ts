import type { Rng } from '../core/Rng.ts';
import { noise2, pickRamp, PixelBuffer, shadeColor, smoothNoise } from './pixelPainter.ts';
import type { Ramp, Rgb } from './pixelPainter.ts';
import { PAL } from './spritePalette.ts';
import type { NaturalSprite } from './objectSprites.ts';

/**
 * Руины: два дома и сарай. Спрайт равен габариту (6×5, 5×4 и 3×3 тайла), опора — низ по центру.
 * Вид сверху-спереди: вверху остатки крыши и провал внутрь, ниже фасад с проёмами, у основания
 * груда обломков и трава. Освещение сверху-слева, как у остальных объектов.
 */

interface RuinStyle {
  /** Материал стен: штукатурка с кирпичом или доски. */
  material: 'plaster' | 'planks';
  /** Крыша: черепица или гофрированный металл. */
  roof: 'tiles' | 'metal';
  /** Сторона, где крыша обрушена: -1 слева, 1 справа. */
  collapse: -1 | 1;
  windows: number;
  /** Положение двери в долях ширины (0…1); меньше 0 — двери нет. */
  door: number;
  /** Доля высоты спрайта, занятая фасадом. */
  facade: number;
}

function drawRuin(p: PixelBuffer, rng: Rng, s: RuinStyle, seed: number): void {
  const W = p.width;
  const H = p.height;
  const side = Math.max(5, Math.round(W / 26));
  const groundY = H - Math.round(H * 0.07);
  const faceH = Math.round(H * s.facade);
  const faceTop = groundY - faceH;
  const roofTop = Math.round(H * 0.05);
  const wallColors: Ramp = s.material === 'plaster' ? PAL.plaster : PAL.wood;

  // ---- Верхняя часть: остатки крыши и провал ----
  const split = Math.round(W * (s.collapse === -1 ? 0.5 : 0.5) + s.collapse * W * 0.1);
  const isCollapsed = (x: number, y: number): boolean => {
    const edge =
      split + (smoothNoise(x, y, 7, seed + 1) - 0.5) * 22 + (y - roofTop) * 0.12 * s.collapse;
    return s.collapse === -1 ? x < edge : x > edge;
  };
  for (let y = roofTop; y < faceTop + 3; y++) {
    for (let x = side; x < W - side; x++) {
      if (isCollapsed(x, y)) {
        // Провал: тёмное нутро, светлее ближе к краю.
        const depth = (y - roofTop) / Math.max(1, faceTop - roofTop);
        const t = 0.15 + 0.35 * depth + (noise2(x, y, seed + 2) - 0.5) * 0.18;
        p.put(x, y, pickRamp(PAL.interior, t, x, y, 0.3));
      } else if (s.roof === 'tiles') {
        // Черепица чешуёй: ряды со скруглёнными нижними краями, конёк вверху.
        const row = Math.floor((y - roofTop - 3) / 6);
        const within = (y - roofTop - 3) % 6;
        const shift = (row % 2) * 4;
        const col = Math.floor((x + shift) / 8);
        const inCol = (x + shift) % 8;
        const scallop = Math.round(1.5 * Math.sin(((inCol + 0.5) / 8) * Math.PI));
        let t = 0.52 + (noise2(col, row, seed + 3) - 0.5) * 0.3 - 0.12 * (x / W);
        if (y - roofTop < 4)
          t = 0.88 - (y - roofTop) * 0.06; // конёк
        else if (within >= 5 - scallop)
          t -= 0.34; // тень под чешуёй
        else if (within === 0) t += 0.1;
        if (inCol === 0) t -= 0.12;
        const missing = smoothNoise(x, y, 9, seed + 4) > 0.82;
        if (missing) {
          p.put(x, y, pickRamp(PAL.interior, 0.18 + noise2(x, y, seed + 41) * 0.2, x, y, 0));
        } else {
          p.put(x, y, pickRamp(PAL.slate, t, x, y, 0.2));
        }
      } else {
        // Гофрированный металл: диагональные полосы, ржавые пятна.
        const stripe = (x + y) % 6;
        const rustN = smoothNoise(x, y, 5, seed + 5);
        const colors = rustN > 0.5 ? PAL.rust : PAL.steel;
        let t = 0.5 + (stripe < 2 ? 0.22 : stripe > 4 ? -0.22 : 0) - 0.1 * (x / W);
        t += (noise2(x, y, seed + 6) - 0.5) * 0.12;
        p.put(x, y, pickRamp(colors, t, x, y, 0));
      }
    }
  }
  // Стропила в провале.
  const beams = 3 + (W > 150 ? 2 : 0);
  for (let b = 0; b < beams; b++) {
    const bx = s.collapse === -1 ? rng.int(side + 4, split) : rng.int(split, W - side - 4);
    const by = roofTop + rng.int(2, 10);
    const ex = bx + rng.int(-22, 22);
    const ey = by + rng.int(14, Math.max(16, faceTop - roofTop - 4));
    p.thickLine(bx, by, ex, ey, 3.4, 3, PAL.bark, 0.2);
  }
  // Растения, прорастающие в провале.
  for (let i = 0; i < Math.round(W / 14); i++) {
    const cx = s.collapse === -1 ? rng.int(side + 6, split) : rng.int(split, W - side - 6);
    const cy = rng.int(faceTop - 14, faceTop);
    p.blob(cx, cy, rng.float(3, 5.5), rng.float(2.5, 4), {
      colors: PAL.leaf,
      wobble: 0.25,
      phase: rng.float(0, 6),
      grain: 0.3,
      dither: 0.4,
      seed: seed + 7 + i,
    });
  }
  // Задняя стена: светлая кромка по верху.
  for (let x = side; x < W - side; x++) {
    p.put(x, roofTop, shadeColor(wallColors[4] as Rgb, 1.0));
    p.put(x, roofTop + 1, wallColors[3] as Rgb);
  }

  // ---- Боковые стены ----
  const jag = (x: number): number => Math.round(smoothNoise(x, 0, 5, seed + 8) * 9);
  for (let y = roofTop; y < groundY; y++) {
    for (let k = 0; k < side; k++) {
      const topL = roofTop + (s.collapse === -1 ? jag(k) + 8 : 0);
      const topR = roofTop + (s.collapse === 1 ? jag(k + 30) + 8 : 0);
      if (y >= topL)
        p.put(
          k,
          y,
          pickRamp(wallColors, 0.66 - 0.06 * k + (noise2(k, y, seed + 9) - 0.5) * 0.15, k, y, 0.2),
        );
      if (y >= topR)
        p.put(
          W - 1 - k,
          y,
          pickRamp(wallColors, 0.3 + 0.05 * k + (noise2(k, y, seed + 10) - 0.5) * 0.15, k, y, 0.2),
        );
    }
  }

  // ---- Фасад ----
  const wallTop = (x: number): number => {
    // Рваный верх: ступени и выбоины, на стороне обрушения ниже.
    const collapseK = (s.collapse === -1 ? 1 - x / W : x / W) * 0.9;
    return faceTop - 4 + Math.round(smoothNoise(x, 1, 8, seed + 11) * 9 + collapseK * 9);
  };
  const windowW = Math.round(W / 11);
  const windowH = Math.round(faceH * 0.5);
  const openings: Array<{ x0: number; x1: number; y0: number; y1: number; door: boolean }> = [];
  for (let i = 0; i < s.windows; i++) {
    const cx = ((i + 1) / (s.windows + 1)) * W;
    if (s.door >= 0 && Math.abs(cx / W - s.door) < 0.12) continue;
    const x0 = Math.round(cx - windowW / 2);
    openings.push({
      x0,
      x1: x0 + windowW,
      y0: faceTop + Math.round(faceH * 0.18),
      y1: faceTop + Math.round(faceH * 0.18) + windowH,
      door: false,
    });
  }
  if (s.door >= 0) {
    const x0 = Math.round(s.door * W - windowW * 0.7);
    openings.push({
      x0,
      x1: x0 + Math.round(windowW * 1.4),
      y0: faceTop + Math.round(faceH * 0.16),
      y1: groundY,
      door: true,
    });
  }
  for (let y = faceTop - 6; y < groundY; y++) {
    for (let x = side; x < W - side; x++) {
      if (y < wallTop(x)) continue;
      const open = openings.find((o) => x >= o.x0 && x < o.x1 && y >= o.y0 && y < o.y1);
      if (open) {
        // Проём: тёмный; светлый подоконник внизу, тень перемычки сверху.
        const rel = (y - open.y0) / Math.max(1, open.y1 - open.y0);
        let t = 0.12 + 0.28 * rel + (noise2(x, y, seed + 12) - 0.5) * 0.1;
        if (x - open.x0 < 2) t -= 0.1;
        p.put(x, y, pickRamp(PAL.interior, t, x, y, 0.2));
        continue;
      }
      let t: number;
      let colors: Ramp = wallColors;
      if (s.material === 'plaster') {
        const brickAt = smoothNoise(x, y, 11, seed + 13) > 0.58;
        if (brickAt) {
          colors = PAL.brick;
          const row = Math.floor(y / 4);
          const mortar = y % 4 === 0 || (x + (row % 2) * 5) % 10 === 0;
          t = mortar
            ? 0.2
            : 0.55 + (noise2(Math.floor((x + (row % 2) * 5) / 10), row, seed + 14) - 0.5) * 0.4;
        } else {
          t = 0.62 + (noise2(x, y, seed + 15) - 0.5) * 0.2;
        }
      } else {
        // Доски: вертикальные, со щелями и сучками.
        const plank = Math.floor(x / 5);
        t =
          0.5 +
          (noise2(plank, 0, seed + 16) - 0.5) * 0.35 +
          (noise2(x, Math.floor(y / 3), seed + 17) - 0.5) * 0.12;
        if (x % 5 === 0) t -= 0.35;
        if (noise2(plank, Math.floor(y / 9), seed + 18) > 0.93) t -= 0.25;
      }
      t += 0.1 * (1 - (2 * x) / W) * 0.5; // левая часть светлее
      const sinceTop = y - wallTop(x);
      if (sinceTop < 3)
        t += 0.18; // освещённый излом стены сверху
      else if (sinceTop < 8) t -= 0.12 * (1 - (sinceTop - 3) / 5); // тень от остатков крыши
      if (y > groundY - 5) t -= 0.12;
      p.put(x, y, pickRamp(colors, t, x, y, 0.2));
    }
  }
  // Свес уцелевшей крыши: доска-фасция и тень на стене под ней.
  for (let x = side; x < W - side; x++) {
    if (isCollapsed(x, faceTop - 6)) continue;
    for (let k = 0; k < 3; k++) p.put(x, faceTop - 2 + k, PAL.bark[4 - k] as Rgb);
    for (let k = 3; k < 9; k++) p.tint(x, faceTop - 2 + k, 0.62 + k * 0.04);
  }
  // Рамы, подоконники и перемычки.
  for (const o of openings) {
    for (let x = o.x0 - 1; x <= o.x1; x++) {
      p.put(x, o.y0 - 1, shadeColor(wallColors[1] as Rgb, 1.0));
      p.put(x, o.y0 - 2, wallColors[3] as Rgb);
    }
    if (!o.door) {
      for (let x = o.x0 - 1; x <= o.x1; x++) {
        p.put(x, o.y1, wallColors[4] as Rgb);
        p.put(x, o.y1 + 1, wallColors[1] as Rgb);
      }
      // Остаток рамы.
      p.line(
        Math.round((o.x0 + o.x1) / 2),
        o.y0,
        Math.round((o.x0 + o.x1) / 2),
        o.y1,
        PAL.wood[1] as Rgb,
      );
    } else {
      p.rect(o.x0 - 1, o.y1 - 2, o.x1 - o.x0 + 2, 2, wallColors[3] as Rgb); // порог
    }
  }

  // ---- Обломки у основания ----
  const rubble = Math.round(W / 9);
  for (let i = 0; i < rubble; i++) {
    const x = rng.float(side - 2, W - side + 2);
    const y = groundY + rng.float(-6, 4);
    const r = rng.float(2.2, 5.5);
    p.blob(x, y, r * 1.2, r * 0.8, {
      colors: i % 3 === 0 ? PAL.brick : PAL.stone,
      wobble: 0.2,
      phase: rng.float(0, 6),
      grain: 0.15,
      dither: 0,
      facets: 2,
      facetStrength: 0.3,
      seed: seed + 20 + i,
    });
  }
  // Вьюнок и мох.
  const vines = Math.round(W / 16);
  for (let v = 0; v < vines; v++) {
    const x = rng.int(side + 2, W - side - 2);
    const start = wallTop(x) + rng.int(0, 3);
    const len = rng.int(8, Math.max(10, faceH - 6));
    let vx = x;
    for (let k = 0; k < len; k++) {
      vx += rng.chance(0.3) ? rng.int(-1, 1) : 0;
      const y = start + k;
      if (p.alphaAt(vx, y) !== 255) continue;
      p.put(vx, y, pickRamp(PAL.leaf, 0.3 + 0.6 * noise2(vx, y, seed + 30), vx, y, 0));
      if (k % 3 === 0) p.put(vx + 1, y, PAL.leaf[3] as Rgb);
    }
  }
  for (let x = side; x < W - side; x += 1) {
    if (noise2(x, 0, seed + 31) > 0.45) {
      const h = rng.int(1, 4);
      for (let k = 0; k < h; k++) {
        if (p.alphaAt(x, groundY - k) === 255)
          p.put(x, groundY - k, PAL.moss[((k + x) % 3) + 1] as Rgb);
      }
    }
  }
  // Трава у фундамента.
  for (let i = 0; i < Math.round(W / 4); i++) {
    const x = rng.int(0, W - 1);
    const y = groundY + rng.int(1, 6);
    const h = rng.int(2, 5);
    for (let k = 0; k < h; k++) {
      if (y - k < groundY - 1) break;
      p.put(x, y - k, PAL.grassTuft[(k + 1) % 3] as Rgb);
    }
  }

  p.outline(0.5, 0.95);
  p.groundShadow(W / 2 + 6, H - 4, W / 2 - 2, 5.5, 86);
}

const STYLES: Record<string, readonly RuinStyle[]> = {
  ruin_house_a: [
    { material: 'plaster', roof: 'tiles', collapse: 1, windows: 4, door: 0.3, facade: 0.34 },
    { material: 'plaster', roof: 'tiles', collapse: -1, windows: 3, door: 0.7, facade: 0.34 },
  ],
  ruin_house_b: [
    { material: 'plaster', roof: 'tiles', collapse: -1, windows: 3, door: 0.62, facade: 0.34 },
    { material: 'plaster', roof: 'metal', collapse: 1, windows: 2, door: 0.28, facade: 0.34 },
  ],
  ruin_shed: [
    { material: 'planks', roof: 'metal', collapse: 1, windows: 1, door: 0.3, facade: 0.4 },
    { material: 'planks', roof: 'metal', collapse: -1, windows: 1, door: 0.7, facade: 0.4 },
  ],
};

function ruin(type: string, width: number, height: number): NaturalSprite {
  const styles = STYLES[type] as readonly RuinStyle[];
  return {
    type,
    width,
    height,
    variants: styles.length,
    draw: (p, variant, rng) =>
      drawRuin(p, rng, styles[variant % styles.length] as RuinStyle, 200 + variant * 17 + width),
  };
}

export const RUIN_SPRITES: readonly NaturalSprite[] = [
  ruin('ruin_house_a', 192, 160),
  ruin('ruin_house_b', 160, 128),
  ruin('ruin_shed', 96, 96),
];
