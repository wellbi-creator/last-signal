/**
 * Типизированная шина событий. Системы общаются через неё, а не вызывают друг друга напрямую.
 *
 * Использование:
 *   const bus = new EventBus<GameEvents>();
 *   const off = bus.on('player:moved', ({ playerId }) => ...);
 *   bus.emit('player:moved', { playerId, position });
 *   off();
 *
 * Ошибка в одном обработчике не мешает остальным: она передаётся в onError (по умолчанию —
 * в console.error) и эмиссия продолжается.
 */

export type Handler<TPayload> = (payload: TPayload) => void;
export type ErrorReporter = (eventName: string, error: unknown) => void;

const defaultErrorReporter: ErrorReporter = (eventName, error) => {
  console.error(`[EventBus] Ошибка в обработчике «${eventName}»:`, error);
};

export class EventBus<TEvents extends object> {
  private readonly listeners = new Map<keyof TEvents, Set<Handler<unknown>>>();
  private readonly onError: ErrorReporter;

  constructor(onError: ErrorReporter = defaultErrorReporter) {
    this.onError = onError;
  }

  /** Подписка. Возвращает функцию отписки. */
  on<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const stored = handler as Handler<unknown>;
    set.add(stored);
    return () => this.removeListener(event, stored);
  }

  /** Подписка на одно срабатывание. Возвращает функцию отписки. */
  once<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /** Отписка конкретного обработчика. */
  off<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>): void {
    this.removeListener(event, handler as Handler<unknown>);
  }

  /** Вызывает всех подписчиков события синхронно, в порядке подписки. */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Работаем с копией: подписка/отписка внутри обработчика не ломает обход.
    for (const handler of [...set]) {
      // Если обработчик был отписан ранее в этом же вызове, не вызываем его.
      if (!set.has(handler)) continue;
      try {
        handler(payload);
      } catch (error) {
        this.onError(String(event), error);
      }
    }
  }

  /** Удаляет все обработчики события или вообще все, если событие не указано. */
  clear(event?: keyof TEvents): void {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }
  }

  listenerCount(event: keyof TEvents): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  private removeListener(event: keyof TEvents, handler: Handler<unknown>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.listeners.delete(event);
  }
}
