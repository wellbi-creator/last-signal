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
