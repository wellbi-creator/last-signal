import type { PlayerId, Vec2 } from './types.ts';

/**
 * Все события игры в одном месте: опечатка в названии или неверный формат данных не пройдёт
 * компиляцию. Каждый этап разработки добавляет сюда события своих систем
 * (chunk:loaded, resource:gathered, building:placed и т.д. — см. docs/ARCHITECTURE.md, раздел 5).
 *
 * Правило именования: `область:действие`. Данные события — простой сериализуемый объект.
 */
export type GameEvents = {
  /** Команда выполнена. */
  'command:applied': { type: string; playerId: PlayerId };
  /** Команда отклонена. reason — короткий машинный код причины. */
  'command:rejected': { type: string; playerId: PlayerId; reason: string };
  /** Игрок переместился (после успешной команды SET_PLAYER_POSITION). */
  'player:moved': { playerId: PlayerId; position: Vec2 };
};
