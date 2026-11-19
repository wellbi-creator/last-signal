import type Phaser from 'phaser';
import { buildObjectAtlas, frameName } from './objectAtlas.ts';

/** Ключ единственной текстуры-атласа объектов. */
export const OBJECT_ATLAS_KEY = 'objects';

export { frameName };

let buildMs = 0;

/** Сколько миллисекунд заняло построение атласа (для отладочной панели; 0 — ещё не строился). */
export function objectAtlasBuildMs(): number {
  return buildMs;
}

/**
 * Создаёт атлас спрайтов объектов (один раз за запуск игры; повторный вызов ничего не делает).
 * Все кадры в одной текстуре: отрисовка пакетная, без переключений текстур. Рисунок строится
 * в коде (`objectAtlas.ts`), внешних файлов нет. Финальный арт заменит его на этапе M7.
 */
export function createObjectTextures(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(OBJECT_ATLAS_KEY)) return;
  const started = performance.now();
  const atlas = buildObjectAtlas();
  const texture = textures.createCanvas(OBJECT_ATLAS_KEY, atlas.width, atlas.height);
  if (texture === null) throw new Error('Не удалось создать текстуру объектов');
  texture.getContext().putImageData(new ImageData(atlas.data, atlas.width, atlas.height), 0, 0);
  texture.refresh();
  for (const frame of atlas.frames) {
    texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  buildMs = performance.now() - started;
}
