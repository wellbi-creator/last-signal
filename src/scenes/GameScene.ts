import Phaser from 'phaser';
import { CHUNK_SIZE, TILE_SIZE, WORLD_CHUNKS, WORLD_PIXELS } from '../config.ts';
import { createCore } from '../core/Core.ts';
import { getWorldSpawnPoint, tileToChunk } from '../core/coords.ts';
import { generateSeedText } from '../core/Seed.ts';
import { CORE_REGISTRY_KEY, getCore } from '../coreAccess.ts';
import { SCENE_KEYS } from '../keys.ts';
import { ChunkManager } from '../systems/world/ChunkManager.ts';
import { hashChunk } from '../systems/world/checksum.ts';
import { goldenHashFor } from '../systems/world/goldenHashes.ts';
import { WorldGenerator } from '../systems/world/WorldGenerator.ts';
import type { ChunkSource } from '../systems/world/WorldGenerator.ts';
import { DebugHud, MAP_SIZE } from '../ui/DebugHud.ts';
import { biomeColor } from '../view/placeholderTextures.ts';
import { WorldView } from '../view/WorldView.ts';

export interface GameSceneData {
  /** Текст seed. Если не задан: параметр адреса `?seed=` или seed ядра. */
  seed?: string;
  /** Момент нажатия «Открыть мир» (performance.now) для замера пути до первого кадра. */
  openedAt?: number;
}

const LOAD_RADIUS = 2;
const UNLOAD_RADIUS = 3;
const MAX_CACHED = 12;
const KEY_SPEED = 900; // пикселей экрана в секунду
const MAX_ZOOM = 3;
const HUD_REFRESH_MS = 250;

/**
 * Экран M1 — просмотрщик настоящего сгенерированного мира (решение D6).
 * Игрока ещё нет, поэтому камера двигается клавишами (WASD/стрелки, Shift — быстрее),
 * мышью и касанием (перетаскивание). Чанки загружаются и выгружаются вокруг центра камеры.
 */
export class GameScene extends Phaser.Scene {
  private generator!: WorldGenerator;
  private manager!: ChunkManager;
  private worldView!: WorldView;
  private hud!: DebugHud;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;

  private seedText = '';
  private hudTimer = 0;
  private frameTimes: number[] = [];
  private zoomLevel = 1;
  private verifyNote = '—';
  private worldHash = '';
  private openedAt = 0;
  private marks = { plan: 0, firstFrame: 0 };
  private chunkStats = { count: 0, totalMs: 0 };

  constructor() {
    super(SCENE_KEYS.Game);
  }

  init(data: GameSceneData): void {
    this.openedAt = data.openedAt ?? performance.now();
    const fromUrl = new URLSearchParams(window.location.search).get('seed');
    this.seedText = data.seed ?? fromUrl ?? getCore(this).state.worldSeed;
    this.hudTimer = 0;
    this.frameTimes = [];
    this.zoomLevel = 1;
    this.verifyNote = '—';
    this.chunkStats = { count: 0, totalMs: 0 };
  }

  create(): void {
    // Свежее ядро под выбранный seed (сессия мира; состояние на этом этапе не меняется).
    const core = createCore({ worldSeed: this.seedText });
    this.registry.set(CORE_REGISTRY_KEY, core);
    this.seedText = core.state.worldSeed;
    this.syncUrl();
    this.setCanvasPixelated(true);

    const planStart = performance.now();
    this.generator = new WorldGenerator(this.seedText);
    this.marks.plan = performance.now() - planStart;
    this.worldHash = this.generator.worldHash();

    const timed: ChunkSource = {
      generateChunk: (cx, cy) => {
        const start = performance.now();
        const chunk = this.generator.generateChunk(cx, cy);
        this.chunkStats.count++;
        this.chunkStats.totalMs += performance.now() - start;
        return chunk;
      },
    };
    this.manager = new ChunkManager(timed, core.bus, {
      loadRadius: LOAD_RADIUS,
      unloadRadius: UNLOAD_RADIUS,
      maxCached: MAX_CACHED,
    });
    this.worldView = new WorldView(this, this.manager, core.bus);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_PIXELS, WORLD_PIXELS);
    camera.setZoom(this.zoomLevel);
    const spawn = getWorldSpawnPoint();
    camera.centerOn(spawn.x, spawn.y);

    // Первый набор чанков вокруг камеры грузим сразу, чтобы не показывать пустой экран.
    this.manager.update(spawn.x / TILE_SIZE, spawn.y / TILE_SIZE);
    this.manager.step(100);

    this.hud = new DebugHud(this.hudParent(), {
      onMenu: () => this.scene.start(SCENE_KEYS.MainMenu),
      onNewSeed: () =>
        this.scene.restart({ seed: generateSeedText(), openedAt: performance.now() }),
      onToggleGrid: () => this.worldView.setGridVisible(!this.worldView.isGridVisible()),
      onToggleBiomes: () =>
        this.worldView.setMode(this.worldView.getMode() === 'biomes' ? 'terrain' : 'biomes'),
      onVerifyHash: () => this.verifyHash(),
      onMapJump: (fx, fy) => this.cameras.main.centerOn(fx * WORLD_PIXELS, fy * WORLD_PIXELS),
      onCycleZoom: () => this.setZoom(this.zoomLevel >= MAX_ZOOM ? 1 : this.zoomLevel + 1),
    });

    this.hud.setMap(this.buildMinimap());

    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as
      | Record<string, Phaser.Input.Keyboard.Key>
      | undefined;
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);

    // Первый реально отрисованный кадр с миром (отметка для замера, раздел 9.3 плана).
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.marks.firstFrame = performance.now() - this.openedAt;
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.refreshHud();
  }

  override update(_time: number, delta: number): void {
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 120) this.frameTimes.shift();

    const camera = this.cameras.main;
    const keys = this.keys;
    if (keys !== undefined) {
      const left = keys.A?.isDown === true || keys.LEFT?.isDown === true;
      const right = keys.D?.isDown === true || keys.RIGHT?.isDown === true;
      const up = keys.W?.isDown === true || keys.UP?.isDown === true;
      const down = keys.S?.isDown === true || keys.DOWN?.isDown === true;
      const boost = keys.SHIFT?.isDown === true ? 3 : 1;
      const step = (KEY_SPEED * boost * delta) / 1000 / camera.zoom;
      camera.scrollX += (Number(right) - Number(left)) * step;
      camera.scrollY += (Number(down) - Number(up)) * step;
    }

    const center = camera.midPoint;
    const view = camera.worldView;
    this.hud.setViewRect(
      view.x / WORLD_PIXELS,
      view.y / WORLD_PIXELS,
      view.width / WORLD_PIXELS,
      view.height / WORLD_PIXELS,
    );
    this.manager.update(center.x / TILE_SIZE, center.y / TILE_SIZE);
    this.manager.step(1); // не больше одного чанка за кадр: без подвисаний на телефоне

    this.hudTimer += delta;
    if (this.hudTimer >= HUD_REFRESH_MS) {
      this.hudTimer = 0;
      this.refreshHud();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;
    const camera = this.cameras.main;
    camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
    camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
  }

  private setZoom(zoom: number): void {
    this.zoomLevel = zoom;
    const camera = this.cameras.main;
    const center = camera.midPoint;
    camera.setZoom(zoom);
    camera.centerOn(center.x, center.y);
    this.refreshHud();
  }

  /** Карта биомов всего мира для мини-карты (генерация всех 64 чанков занимает около 1 мс). */
  private buildMinimap(): Uint8ClampedArray<ArrayBuffer> {
    const pixels = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);
    for (let cy = 0; cy < WORLD_CHUNKS; cy++) {
      for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
        const chunk = this.generator.generateChunk(cx, cy);
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const [r, g, b] = biomeColor(chunk.biomes[ly * CHUNK_SIZE + lx] ?? 0);
            const at = ((cy * CHUNK_SIZE + ly) * MAP_SIZE + cx * CHUNK_SIZE + lx) * 4;
            pixels[at] = r;
            pixels[at + 1] = g;
            pixels[at + 2] = b;
            pixels[at + 3] = 255;
          }
        }
      }
    }
    return pixels;
  }

  /** Независимо пересобирает мир с нуля и сравнивает хеш: проверка воспроизводимости на устройстве. */
  private verifyHash(): void {
    const start = performance.now();
    const rebuilt = new WorldGenerator(this.seedText).worldHash();
    const ms = performance.now() - start;
    const same = rebuilt === this.worldHash;
    this.verifyNote = `${same ? 'совпал' : 'НЕ СОВПАЛ'} (${ms.toFixed(0)} мс)`;
    this.refreshHud();
  }

  private refreshHud(): void {
    const camera = this.cameras.main;
    const center = camera.midPoint;
    const tx = Math.floor(center.x / TILE_SIZE);
    const ty = Math.floor(center.y / TILE_SIZE);
    const cx = tileToChunk(tx);
    const cy = tileToChunk(ty);
    const chunk = this.manager.get(cx, cy);
    const worldHash = this.worldHash;
    const golden = goldenHashFor(this.seedText);
    const sorted = this.frameTimes.slice().sort((a, b) => a - b);
    const median = sorted.length > 0 ? (sorted[Math.floor(sorted.length / 2)] ?? 0) : 0;
    const worst = sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0;
    const fps = this.game.loop.actualFps;
    const avgChunk =
      this.chunkStats.count > 0 ? this.chunkStats.totalMs / this.chunkStats.count : 0;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    const dpr = window.devicePixelRatio || 1;

    const okMark =
      golden === undefined
        ? '· эталона ПК нет'
        : golden === worldHash
          ? '✓ эталон ПК'
          : '✗ ОТЛИЧАЕТСЯ от эталона ПК';
    this.hud.setLines([
      `M1.4 · seed ${this.seedText} · v${getCore(this).state.worldGenVersion}`,
      `хеш мира ${worldHash}`,
      `${okMark} · проверка: ${this.verifyNote}`,
      `чанк ${cx},${cy} хеш ${chunk === undefined ? '—' : hashChunk(chunk)}`,
      `центр ${Math.round(center.x)},${Math.round(center.y)} · тайл ${tx},${ty}`,
      `чанков ${this.manager.loaded().length} · очередь ${this.manager.pendingCount()} · слоёв ${this.worldView.viewCount()}`,
      `FPS ${fps.toFixed(0)} · кадр ${median.toFixed(1)}/${worst.toFixed(0)} мс`,
      `план ${this.marks.plan.toFixed(0)} · чанк ${avgChunk.toFixed(2)} · кадр1 ${this.marks.firstFrame.toFixed(0)} мс`,
      `${this.scale.width}×${this.scale.height} · DPR ${dpr} · ×${this.zoomLevel} · ${renderer}`,
    ]);
    this.hud.setButtons({
      grid: this.worldView.isGridVisible(),
      biomes: this.worldView.getMode() === 'biomes',
      zoom: this.zoomLevel,
    });
  }

  /** Адрес с `?seed=`: перезагрузка страницы открывает тот же мир (кейс M1-08). */
  private syncUrl(): void {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', this.seedText);
      window.history.replaceState(null, '', url);
    } catch {
      // Адрес недоступен (например, встроенный просмотр): мир от этого не страдает.
    }
  }

  /**
   * Пиксель-арт без размытия, когда браузер растягивает холст (Retina, риск R6). Включается только
   * на экране мира: текст меню M0 при таком режиме выглядит блочным.
   */
  private setCanvasPixelated(on: boolean): void {
    const style = this.game.canvas.style;
    style.imageRendering = on ? 'crisp-edges' : '';
    if (on) style.imageRendering = 'pixelated';
  }

  private hudParent(): HTMLElement {
    return document.getElementById('game') ?? document.body;
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.hud.destroy();
    this.setCanvasPixelated(false);
    this.worldView.destroy();
    this.manager.unloadAll();
  }
}
