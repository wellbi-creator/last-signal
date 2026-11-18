import type Phaser from 'phaser';
import { CHUNK_SIZE, TILE_SIZE } from '../config.ts';
import { hashInts } from '../core/Rng.ts';
import type { Chunk } from '../systems/world/types.ts';
import { biomeFrame, TILESET_KEY, tileFrame, VARIANTS } from './placeholderTextures.ts';

/** Режим отображения: обычный вид или плоская цветная карта биомов. */
export type ViewMode = 'terrain' | 'biomes';

/**
 * Отрисовка одного чанка: один слой Phaser Tilemap 32×32 тайла.
 * Слой сам отсекает невидимое и рисуется пакетно. Вариант рисунка тайла выбирается хешем
 * мировой позиции (tx, ty): детерминированно, но на логику мира не влияет.
 * `destroy()` освобождает слой и карту; после него объект использовать нельзя.
 */
export class ChunkView {
  private readonly map: Phaser.Tilemaps.Tilemap;

  constructor(scene: Phaser.Scene, chunk: Chunk, mode: ViewMode) {
    const data: number[][] = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const row: number[] = [];
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const index = ly * CHUNK_SIZE + lx;
        if (mode === 'biomes') {
          row.push(biomeFrame(chunk.biomes[index] ?? 0));
        } else {
          const tx = chunk.cx * CHUNK_SIZE + lx;
          const ty = chunk.cy * CHUNK_SIZE + ly;
          const variant = (hashInts(tx, ty) >>> 8) % VARIANTS;
          row.push(tileFrame(chunk.tiles[index] ?? 0, variant));
        }
      }
      data.push(row);
    }
    this.map = scene.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = this.map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE_SIZE, TILE_SIZE, 0, 0);
    if (tileset === null) throw new Error('ChunkView: не найдена текстура тайлов');
    const layer = this.map.createLayer(
      0,
      tileset,
      chunk.cx * CHUNK_SIZE * TILE_SIZE,
      chunk.cy * CHUNK_SIZE * TILE_SIZE,
    );
    if (layer === null) throw new Error('ChunkView: не удалось создать слой тайлов');
    layer.setDepth(0);
  }

  destroy(): void {
    this.map.destroy();
  }
}
