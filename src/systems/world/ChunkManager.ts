import { WORLD_CHUNKS } from '../../config.ts';
import { chunksInRadius, tileToChunk } from '../../core/coords.ts';
import type { EventBus } from '../../core/EventBus.ts';
import type { GameEvents } from '../../core/events.ts';
import type { ChunkSource } from './WorldGenerator.ts';
import type { Chunk } from './types.ts';

export interface ChunkManagerOptions {
  /** Радиус загрузки вокруг центра, в чанках (по Чебышёву). */
  readonly loadRadius: number;
  /** Радиус выгрузки (гистерезис): строго больше радиуса загрузки. */
  readonly unloadRadius: number;
  /** Сколько выгруженных чанков хранить для быстрого возврата (LRU). 0 — не хранить. */
  readonly maxCached: number;
}

const CHUNK_COUNT = WORLD_CHUNKS * WORLD_CHUNKS;

function chunkIndex(cx: number, cy: number): number {
  return cy * WORLD_CHUNKS + cx;
}

/**
 * Управляет активными чанками вокруг центра (камеры или игрока).
 *
 * Состояние хранится в массивах фиксированного размера (индекс = cy·8 + cx) и в списках:
 * обход всегда в порядке (cy, cx), перебор Map/Set не используется (правило порядка, M1_PLAN 7.1).
 * События `chunk:loaded` и `chunk:unloaded` выпускаются ровно один раз на смену состояния и
 * только после того, как состояние менеджера уже согласовано (обработчик может вызывать update).
 */
export class ChunkManager {
  private readonly active: Array<Chunk | undefined> = new Array<Chunk | undefined>(
    CHUNK_COUNT,
  ).fill(undefined);
  private readonly cache: Array<Chunk | undefined> = new Array<Chunk | undefined>(CHUNK_COUNT).fill(
    undefined,
  );
  /** Индексы чанков из кэша: самые давно выгруженные первыми. */
  private readonly lru: number[] = [];
  /** Очередь на загрузку: индексы в порядке «ближе к центру, затем (cx, cy)». */
  private queue: number[] = [];
  private centerCx = 0;
  private centerCy = 0;
  private hasCenter = false;

  private readonly source: ChunkSource;
  private readonly bus: EventBus<GameEvents>;
  private readonly options: ChunkManagerOptions;

  constructor(source: ChunkSource, bus: EventBus<GameEvents>, options: ChunkManagerOptions) {
    this.source = source;
    this.bus = bus;
    this.options = options;
    const { loadRadius, unloadRadius, maxCached } = options;
    if (!Number.isInteger(loadRadius) || loadRadius < 0) {
      throw new RangeError(
        `ChunkManager: loadRadius должен быть целым ≥ 0, получено ${loadRadius}`,
      );
    }
    if (!Number.isInteger(unloadRadius) || unloadRadius <= loadRadius) {
      throw new RangeError('ChunkManager: unloadRadius должен быть целым и больше loadRadius');
    }
    if (!Number.isInteger(maxCached) || maxCached < 0) {
      throw new RangeError(`ChunkManager: maxCached должен быть целым ≥ 0, получено ${maxCached}`);
    }
  }

  /**
   * Сообщает новый центр (в тайлах). Выгружает чанки дальше радиуса выгрузки и пересчитывает
   * очередь загрузки. Если чанк центра не изменился, ничего не делает.
   */
  update(centerTileX: number, centerTileY: number): void {
    if (!Number.isFinite(centerTileX) || !Number.isFinite(centerTileY)) {
      throw new RangeError(
        `ChunkManager.update: некорректный центр (${centerTileX}, ${centerTileY})`,
      );
    }
    const ccx = tileToChunk(Math.floor(centerTileX));
    const ccy = tileToChunk(Math.floor(centerTileY));
    if (this.hasCenter && ccx === this.centerCx && ccy === this.centerCy) return;
    this.centerCx = ccx;
    this.centerCy = ccy;
    this.hasCenter = true;

    // 1. Выгрузка: сначала меняем состояние целиком, потом выпускаем события.
    const unloaded: number[] = [];
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = this.active[i];
      if (chunk === undefined) continue;
      const distance = Math.max(Math.abs(chunk.cx - ccx), Math.abs(chunk.cy - ccy));
      if (distance > this.options.unloadRadius) {
        this.active[i] = undefined;
        this.putInCache(i, chunk);
        unloaded.push(i);
      }
    }

    // 2. Очередь: все чанки радиуса загрузки, которые ещё не активны (порядок задан chunksInRadius).
    this.queue = [];
    for (const { cx, cy } of chunksInRadius(ccx, ccy, this.options.loadRadius)) {
      const index = chunkIndex(cx, cy);
      if (this.active[index] === undefined) this.queue.push(index);
    }

    for (const index of unloaded) {
      this.bus.emit('chunk:unloaded', {
        cx: index % WORLD_CHUNKS,
        cy: Math.floor(index / WORLD_CHUNKS),
      });
    }
  }

  /**
   * Загружает не более `budget` чанков из очереди (по умолчанию 1: один чанк за кадр).
   * Возвращает число реально загруженных.
   */
  step(budget = 1): number {
    if (!Number.isInteger(budget) || budget < 1) {
      throw new RangeError(`ChunkManager.step: budget должен быть целым ≥ 1, получено ${budget}`);
    }
    let done = 0;
    while (done < budget && this.queue.length > 0) {
      const index = this.queue.shift();
      if (index === undefined || this.active[index] !== undefined) continue;
      const cx = index % WORLD_CHUNKS;
      const cy = Math.floor(index / WORLD_CHUNKS);
      const chunk = this.takeFromCache(index) ?? this.source.generateChunk(cx, cy);
      this.active[index] = chunk;
      done++;
      this.bus.emit('chunk:loaded', { cx, cy });
    }
    return done;
  }

  /** Активный (загруженный) чанк или undefined. */
  get(cx: number, cy: number): Chunk | undefined {
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) return undefined;
    if (cx < 0 || cy < 0 || cx >= WORLD_CHUNKS || cy >= WORLD_CHUNKS) return undefined;
    return this.active[chunkIndex(cx, cy)];
  }

  /** Активные чанки в порядке (cy, cx). */
  loaded(): Chunk[] {
    const result: Chunk[] = [];
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = this.active[i];
      if (chunk !== undefined) result.push(chunk);
    }
    return result;
  }

  /** Сколько чанков ещё ждёт загрузки. */
  pendingCount(): number {
    return this.queue.length;
  }

  /** Выгружает все активные чанки (например, при закрытии сцены) и сбрасывает центр. */
  unloadAll(): void {
    const unloaded: number[] = [];
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = this.active[i];
      if (chunk === undefined) continue;
      this.active[i] = undefined;
      this.putInCache(i, chunk);
      unloaded.push(i);
    }
    this.queue = [];
    this.hasCenter = false;
    for (const index of unloaded) {
      this.bus.emit('chunk:unloaded', {
        cx: index % WORLD_CHUNKS,
        cy: Math.floor(index / WORLD_CHUNKS),
      });
    }
  }

  private putInCache(index: number, chunk: Chunk): void {
    if (this.options.maxCached === 0) return;
    this.cache[index] = chunk;
    this.lru.push(index);
    while (this.lru.length > this.options.maxCached) {
      const oldest = this.lru.shift();
      if (oldest !== undefined) this.cache[oldest] = undefined;
    }
  }

  private takeFromCache(index: number): Chunk | undefined {
    const chunk = this.cache[index];
    if (chunk === undefined) return undefined;
    this.cache[index] = undefined;
    const position = this.lru.indexOf(index);
    if (position >= 0) this.lru.splice(position, 1);
    return chunk;
  }
}
