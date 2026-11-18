import { describe, expect, it } from 'vitest';
import { installResizeGuard } from '../src/platform.ts';

/** Минимальная подмена окна: хранит слушатели и таймеры, которые тест запускает вручную. */
function createFakeWindow() {
  const listeners: Record<string, Array<() => void>> = {};
  const viewportListeners: Record<string, Array<() => void>> = {};
  const timers: Array<{ id: number; delay: number; fn: () => void; cleared: boolean }> = [];
  const add = (store: Record<string, Array<() => void>>) => (type: string, fn: () => void) => {
    (store[type] ??= []).push(fn);
  };
  const remove = (store: Record<string, Array<() => void>>) => (type: string, fn: () => void) => {
    store[type] = (store[type] ?? []).filter((item) => item !== fn);
  };
  const fake = {
    addEventListener: add(listeners),
    removeEventListener: remove(listeners),
    visualViewport: {
      addEventListener: add(viewportListeners),
      removeEventListener: remove(viewportListeners),
    },
    setTimeout: (fn: () => void, delay: number) => {
      timers.push({ id: timers.length + 1, delay, fn, cleared: false });
      return timers.length;
    },
    clearTimeout: (id: number) => {
      const timer = timers[id - 1];
      if (timer) timer.cleared = true;
    },
  };
  const fire = (store: Record<string, Array<() => void>>, type: string): void => {
    for (const fn of store[type] ?? []) fn();
  };
  const runTimers = (): void => {
    for (const timer of timers) if (!timer.cleared) timer.fn();
  };
  return { fake: fake as unknown as Window, listeners, viewportListeners, timers, fire, runTimers };
}

describe('installResizeGuard', () => {
  it('после resize, orientationchange и visualViewport.resize пересчитывает размер трижды с задержками', () => {
    for (const source of ['resize', 'orientationchange', 'viewport'] as const) {
      const w = createFakeWindow();
      let refreshed = 0;
      installResizeGuard(() => refreshed++, w.fake);
      if (source === 'viewport') w.fire(w.viewportListeners, 'resize');
      else w.fire(w.listeners, source);
      expect(w.timers.map((t) => t.delay)).toEqual([0, 150, 500]);
      w.runTimers();
      expect(refreshed).toBe(3);
    }
  });

  it('возвращённая функция снимает слушатели и отменяет ожидающие пересчёты', () => {
    const w = createFakeWindow();
    let refreshed = 0;
    const dispose = installResizeGuard(() => refreshed++, w.fake);
    w.fire(w.listeners, 'resize');
    dispose();
    w.runTimers();
    expect(refreshed).toBe(0);
    expect(w.listeners.resize).toEqual([]);
    expect(w.listeners.orientationchange).toEqual([]);
    expect(w.viewportListeners.resize).toEqual([]);
  });

  it('работает и без visualViewport', () => {
    const w = createFakeWindow();
    (w.fake as unknown as { visualViewport: undefined }).visualViewport = undefined;
    expect(() => installResizeGuard(() => {}, w.fake)).not.toThrow();
  });
});
