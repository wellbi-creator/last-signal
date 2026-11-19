import type Phaser from 'phaser';
import { TILE_SIZE } from '../config.ts';
import { hashInts } from '../core/Rng.ts';
import { findObjectType } from '../systems/world/objectData.ts';
import type { ObjectsData } from '../systems/world/objectData.ts';
import type { Chunk } from '../systems/world/types.ts';
import { spriteDef } from './objectAtlas.ts';
import { frameName, OBJECT_ATLAS_KEY } from './objectTextures.ts';

/** Показ объектов: обычный, с габаритами (отладка) или скрытые. */
export type ObjectMode = 'shown' | 'bounds' | 'hidden';

/** Лёгкая вариация яркости (множитель цвета): ломает регулярность густого леса. */
const TINTS: readonly number[] = [0xffffff, 0xf2f2f6, 0xe6eaee, 0xfff8ee];

/**
 * Глубина объекта: нижний край габарита в пикселях мира (чем ниже на экране, тем ближе к зрителю),
 * плюс доля по x для устойчивого порядка при равных y. Тайловые слои имеют глубину 0, сетка — 10.
 */
export function objectDepth(x: number, y: number, footprintW: number, footprintH: number): number {
  const bottom = (y + footprintH) * TILE_SIZE;
  const centerX = (x + footprintW / 2) * TILE_SIZE;
  return 1 + bottom + centerX / 10000;
}

/** Вариант рисунка объекта: хеш позиции, на логику мира не влияет. */
export function variantFor(x: number, y: number, variants: number): number {
  return (hashInts(x, y, 0x0b1e) >>> 8) % variants;
}

/**
 * Спрайты объектов одного чанка. Создаются при загрузке чанка и целиком уничтожаются при выгрузке
 * (`destroy()`), поэтому при загрузке и выгрузке дублей не бывает. Опора спрайта — середина
 * нижнего края габарита; рисунок может быть больше габарита (крона дерева).
 */
export class ObjectView {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly bounds: Phaser.GameObjects.Graphics | undefined;

  constructor(scene: Phaser.Scene, chunk: Chunk, data: ObjectsData, mode: ObjectMode) {
    if (mode === 'bounds') this.bounds = scene.add.graphics().setDepth(9);
    for (const object of chunk.objects) {
      const found = findObjectType(data, object.type);
      const def = spriteDef(object.type);
      if (found === undefined || def === undefined) continue;
      const { w, h } = found.def;
      const variant = variantFor(object.x, object.y, def.variants);
      const image = scene.add
        .image(
          (object.x + w / 2) * TILE_SIZE,
          (object.y + h) * TILE_SIZE,
          OBJECT_ATLAS_KEY,
          frameName(object.type, variant),
        )
        .setOrigin(0.5, 1)
        .setDepth(objectDepth(object.x, object.y, w, h));
      if (found.layer.id !== 'buildings') {
        const tint = TINTS[(hashInts(object.x, object.y, 0x71a7) >>> 8) % TINTS.length] ?? 0xffffff;
        if (tint !== 0xffffff) image.setTint(tint);
      }
      this.sprites.push(image);
      if (this.bounds !== undefined) {
        const blocks = found.layer.blocks;
        this.bounds.lineStyle(1, blocks ? 0xff4d4d : 0x4dd2ff, 0.95);
        this.bounds.fillStyle(blocks ? 0xff4d4d : 0x4dd2ff, blocks ? 0.28 : 0.14);
        this.bounds.fillRect(
          object.x * TILE_SIZE,
          object.y * TILE_SIZE,
          w * TILE_SIZE,
          h * TILE_SIZE,
        );
        this.bounds.strokeRect(
          object.x * TILE_SIZE,
          object.y * TILE_SIZE,
          w * TILE_SIZE,
          h * TILE_SIZE,
        );
      }
    }
  }

  /** Число живых спрайтов (для отладочной панели). */
  spriteCount(): number {
    return this.sprites.length;
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.bounds?.destroy();
  }
}
