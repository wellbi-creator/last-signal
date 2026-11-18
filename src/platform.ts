/**
 * Особенности браузеров, не связанные с игровой логикой (в первую очередь iPhone Safari).
 * Этот файл зависит от DOM, поэтому лежит вне core/ и systems/.
 */

/** Есть ли у устройства сенсорный экран. */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Отключает поведение браузера, которое мешает игре на телефоне:
 * - жесты масштабирования Safari (gesturestart/gesturechange/gestureend), которые
 *   не отключаются через viewport и touch-action на iOS;
 * - контекстное меню (долгое нажатие / правая кнопка) поверх игры.
 * Прокрутка и «резиновая» оттяжка страницы отключены стилями в index.html
 * (overflow: hidden, overscroll-behavior: none, touch-action: none).
 */
export function installPlatformGuards(target: Document = document): void {
  const prevent = (event: Event): void => event.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    target.addEventListener(type, prevent, { passive: false });
  }
  target.addEventListener('contextmenu', prevent);
}

/** Задержки (мс) повторного пересчёта размера после поворота экрана или смены окна. */
const RESIZE_REFRESH_DELAYS = [0, 150, 500];

/**
 * Браузеры сообщают о новом размере окна раньше, чем перестраивается вёрстка (`100dvh`, панели
 * Safari на iPhone): Phaser читает ещё старый размер родителя и остаётся на нём до следующего
 * события. Поэтому после resize, orientationchange и изменения visualViewport размер
 * пересчитывается несколько раз с небольшими задержками. Возвращает функцию снятия слушателей.
 */
export function installResizeGuard(refresh: () => void, target: Window = window): () => void {
  const timers: number[] = [];
  const schedule = (): void => {
    for (const delay of RESIZE_REFRESH_DELAYS) timers.push(target.setTimeout(refresh, delay));
    if (timers.length > 30) timers.splice(0, timers.length - 30);
  };
  target.addEventListener('resize', schedule);
  target.addEventListener('orientationchange', schedule);
  target.visualViewport?.addEventListener('resize', schedule);
  return () => {
    target.removeEventListener('resize', schedule);
    target.removeEventListener('orientationchange', schedule);
    target.visualViewport?.removeEventListener('resize', schedule);
    for (const timer of timers) target.clearTimeout(timer);
  };
}
