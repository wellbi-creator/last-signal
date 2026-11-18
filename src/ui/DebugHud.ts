/**
 * Отладочная панель просмотрщика мира (решение D6): текст диагностики и рабочие кнопки.
 * Сделана на DOM поверх холста: текст чёткий на экранах Retina, кнопки крупные для пальца,
 * отступы под «чёлку» iPhone учитываются через env(safe-area-inset-*).
 * Содержимое задаётся только через textContent (innerHTML не используется).
 * Это инструмент разработки: в M2 его заменит камера за игроком, в M6 — настоящее меню.
 */

export interface HudActions {
  onMenu(): void;
  onNewSeed(): void;
  onToggleGrid(): void;
  onToggleBiomes(): void;
  onVerifyHash(): void;
  onCycleZoom(): void;
  /** Нажатие на мини-карту: доли мира 0…1 по горизонтали и вертикали. */
  onMapJump(fx: number, fy: number): void;
}

export interface HudButtonState {
  grid: boolean;
  biomes: boolean;
  zoom: number;
}

const STYLE = `
.lsh-root{position:fixed;inset:0;pointer-events:none;z-index:10;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d6dde1;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box}
.lsh-panel{position:absolute;left:calc(8px + env(safe-area-inset-left));top:calc(8px + env(safe-area-inset-top));max-width:calc(100% - 16px);
  margin:0;padding:6px 8px;background:rgba(11,15,18,.78);border:1px solid #2b363d;border-radius:6px;white-space:pre-wrap;word-break:break-all}
.lsh-bar{position:absolute;left:0;right:0;bottom:calc(8px + env(safe-area-inset-bottom));display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:0 8px;pointer-events:none}
.lsh-map{position:absolute;right:calc(8px + env(safe-area-inset-right));top:calc(8px + env(safe-area-inset-top));width:128px;height:128px;
  border:1px solid #3a464e;border-radius:4px;overflow:hidden;background:#0b0f12;pointer-events:auto;touch-action:none}
.lsh-map canvas{display:block;width:100%;height:100%;image-rendering:pixelated}
.lsh-view{position:absolute;box-sizing:border-box;border:1px solid #f2b84b;background:rgba(242,184,75,.15);pointer-events:none}
@media (max-width:520px){.lsh-root{font-size:11px}.lsh-map{width:96px;height:96px}}
.lsh-btn{pointer-events:auto;min-height:40px;min-width:44px;padding:6px 12px;font:inherit;font-size:13px;color:#d6dde1;background:rgba(11,15,18,.82);
  border:1px solid #3a464e;border-radius:6px;cursor:pointer;touch-action:manipulation}
.lsh-btn[aria-pressed="true"]{border-color:#f2b84b;color:#f2b84b}
.lsh-btn:active{background:rgba(40,52,60,.95)}
`;

/** Сторона мини-карты в пикселях (равна стороне мира в тайлах). */
export const MAP_SIZE = 256;

export class DebugHud {
  private readonly root: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly panel: HTMLPreElement;
  private readonly mapBox: HTMLDivElement;
  private readonly mapContext: CanvasRenderingContext2D | null;
  private readonly viewRect: HTMLDivElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly biomesButton: HTMLButtonElement;
  private readonly zoomButton: HTMLButtonElement;
  private readonly panelButton: HTMLButtonElement;

  constructor(parent: HTMLElement, actions: HudActions) {
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    document.head.appendChild(this.style);

    this.root = document.createElement('div');
    this.root.className = 'lsh-root';
    this.panel = document.createElement('pre');
    this.panel.className = 'lsh-panel';
    const bar = document.createElement('div');
    bar.className = 'lsh-bar';
    this.mapBox = document.createElement('div');
    this.mapBox.className = 'lsh-map';
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = MAP_SIZE;
    mapCanvas.height = MAP_SIZE;
    this.mapContext = mapCanvas.getContext('2d');
    this.viewRect = document.createElement('div');
    this.viewRect.className = 'lsh-view';
    this.mapBox.append(mapCanvas, this.viewRect);
    const jump = (event: PointerEvent): void => {
      const box = this.mapBox.getBoundingClientRect();
      const fx = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      const fy = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      actions.onMapJump(fx, fy);
    };
    this.mapBox.addEventListener('pointerdown', (event) => {
      this.mapBox.setPointerCapture(event.pointerId);
      jump(event);
    });
    this.mapBox.addEventListener('pointermove', (event) => {
      if (this.mapBox.hasPointerCapture(event.pointerId)) jump(event);
    });
    this.root.append(this.panel, this.mapBox, bar);

    const button = (label: string, handler: () => void): HTMLButtonElement => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'lsh-btn';
      element.textContent = label;
      element.addEventListener('click', handler);
      bar.appendChild(element);
      return element;
    };
    button('← Меню', actions.onMenu);
    button('Новый seed', actions.onNewSeed);
    this.gridButton = button('Сетка чанков', actions.onToggleGrid);
    this.biomesButton = button('Биомы', actions.onToggleBiomes);
    button('Проверить хеш', actions.onVerifyHash);
    this.zoomButton = button('Масштаб ×1', actions.onCycleZoom);
    this.panelButton = button('Панель', () => this.togglePanel());
    this.panelButton.setAttribute('aria-pressed', 'true');
    parent.appendChild(this.root);
  }

  /** Рисует мини-карту: пиксели RGBA размером MAP_SIZE × MAP_SIZE (1 пиксель = 1 тайл). */
  setMap(rgba: Uint8ClampedArray<ArrayBuffer>): void {
    if (this.mapContext === null) return;
    this.mapContext.putImageData(new ImageData(rgba, MAP_SIZE, MAP_SIZE), 0, 0);
  }

  /** Положение рамки камеры на мини-карте, в долях мира (0…1). */
  setViewRect(left: number, top: number, width: number, height: number): void {
    const style = this.viewRect.style;
    style.left = `${(left * 100).toFixed(2)}%`;
    style.top = `${(top * 100).toFixed(2)}%`;
    style.width = `${(width * 100).toFixed(2)}%`;
    style.height = `${(height * 100).toFixed(2)}%`;
  }

  /** Заменяет текст панели. */
  setLines(lines: readonly string[]): void {
    this.panel.textContent = lines.join('\n');
  }

  setButtons(state: HudButtonState): void {
    this.gridButton.setAttribute('aria-pressed', String(state.grid));
    this.biomesButton.setAttribute('aria-pressed', String(state.biomes));
    this.zoomButton.textContent = `Масштаб ×${state.zoom}`;
  }

  destroy(): void {
    this.root.remove();
    this.style.remove();
  }

  private togglePanel(): void {
    const show = this.panel.style.display === 'none';
    this.panel.style.display = show ? '' : 'none';
    this.mapBox.style.display = show ? '' : 'none';
    this.panelButton.setAttribute('aria-pressed', String(show));
  }
}
