import type Phaser from 'phaser';
import { CHUNK_SIZE, TILE_SIZE, WORLD_CHUNKS, WORLD_PIXELS } from '../config.ts';
import type { EventBus } from '../core/EventBus.ts';
import type { GameEvents } from '../core/events.ts';
import type { ChunkManager } from '../systems/world/ChunkManager.ts';
import { ChunkView } from './ChunkView.ts';
import type { ViewMode } from './ChunkView.ts';

const CHUNK_PIXELS = CHUNK_SIZE * TILE_SIZE;

/**
 * Связывает ChunkManager с Phaser: слушает события `chunk:loaded` и `chunk:unloaded`, создаёт и
 * уничтожает ChunkView, рисует сетку чанков. Данные чанков берёт у менеджера (`get`), сам мир
 * не хранит. Вызывать `destroy()` при закрытии сцены.
 */
export class WorldView {
  private readonly views: Array<ChunkView | undefined> = new Array<ChunkView | undefined>(
    WORLD_CHUNKS * WORLD_CHUNKS,
  ).fill(undefined);
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly unsubscribe: Array<() => void> = [];
  private mode: ViewMode = 'terrain';
  private gridVisible = false;

  private readonly scene: Phaser.Scene;
  private readonly manager: ChunkManager;

  constructor(scene: Phaser.Scene, manager: ChunkManager, bus: EventBus<GameEvents>) {
    this.scene = scene;
    this.manager = manager;
    this.grid = scene.add.graphics().setDepth(10).setVisible(false);
    this.unsubscribe.push(
      bus.on('chunk:loaded', ({ cx, cy }) => this.show(cx, cy)),
      bus.on('chunk:unloaded', ({ cx, cy }) => this.hide(cx, cy)),
    );
  }

  getMode(): ViewMode {
    return this.mode;
  }

  /** Переключает вид и пересоздаёт слои уже загруженных чанков. */
  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const chunk of this.manager.loaded()) {
      this.hide(chunk.cx, chunk.cy);
      this.show(chunk.cx, chunk.cy);
    }
  }

  isGridVisible(): boolean {
    return this.gridVisible;
  }

  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    this.grid.setVisible(visible);
    if (visible) this.redrawGrid();
  }

  /** Число созданных слоёв (для отладочной панели). */
  viewCount(): number {
    let count = 0;
    for (const view of this.views) if (view !== undefined) count++;
    return count;
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    for (let i = 0; i < this.views.length; i++) {
      this.views[i]?.destroy();
      this.views[i] = undefined;
    }
    this.grid.destroy();
  }

  private show(cx: number, cy: number): void {
    const chunk = this.manager.get(cx, cy);
    if (chunk === undefined) return;
    const index = cy * WORLD_CHUNKS + cx;
    this.views[index]?.destroy();
    this.views[index] = new ChunkView(this.scene, chunk, this.mode);
    if (this.gridVisible) this.redrawGrid();
  }

  private hide(cx: number, cy: number): void {
    const index = cy * WORLD_CHUNKS + cx;
    this.views[index]?.destroy();
    this.views[index] = undefined;
    if (this.gridVisible) this.redrawGrid();
  }

  /** Контуры загруженных чанков и рамка мира (линии в пикселях мира; на экране ×масштаб). */
  private redrawGrid(): void {
    const g = this.grid;
    g.clear();
    g.lineStyle(2, 0xf2b84b, 0.9);
    for (const chunk of this.manager.loaded()) {
      g.strokeRect(chunk.cx * CHUNK_PIXELS, chunk.cy * CHUNK_PIXELS, CHUNK_PIXELS, CHUNK_PIXELS);
    }
    g.lineStyle(4, 0xe2574c, 0.9);
    g.strokeRect(0, 0, WORLD_PIXELS, WORLD_PIXELS);
  }
}
