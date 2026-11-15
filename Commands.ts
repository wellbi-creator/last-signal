import { isPointInWorld } from './coords.ts';
import type { GameEvents } from './events.ts';
import type { EventBus } from './EventBus.ts';
import { getPlayer } from './GameState.ts';
import type { GameState } from './GameState.ts';
import type { PlayerId, Tick, Vec2 } from './types.ts';

/**
 * Команды — единственный способ изменить GameState. Интерфейс, ввод и системы не меняют
 * состояние напрямую, а отправляют команду; обработчик проверяет её и применяет.
 * В будущем те же команды можно отправлять на сервер (мультиплеер), поэтому каждая команда
 * содержит playerId и tick.
 *
 * Как добавить команду:
 * 1. Добавить её данные в CommandMap.
 * 2. Написать обработчик и зарегистрировать его через CommandProcessor.register.
 */
export interface CommandMap {
  /** Установить позицию игрока (появление в мире, загрузка, телепорт). */
  SET_PLAYER_POSITION: { position: Vec2 };
}

export type CommandType = keyof CommandMap;

/** Команда выбранного типа (или любая, если тип не указан). */
export type Command<T extends CommandType = CommandType> = {
  [K in T]: { type: K; playerId: PlayerId; tick: Tick } & CommandMap[K];
}[T];

export type CommandResult = { ok: true } | { ok: false; reason: string };

export interface CommandContext {
  state: GameState;
  bus: EventBus<GameEvents>;
}

export type CommandHandler<K extends CommandType> = (
  context: CommandContext,
  command: Command<K>,
) => CommandResult;

export type CommandErrorReporter = (error: unknown) => void;

const OK: CommandResult = { ok: true };

function reject(reason: string): CommandResult {
  return { ok: false, reason };
}

export class CommandProcessor {
  private readonly context: CommandContext;
  private readonly onError: CommandErrorReporter;
  private readonly handlers = new Map<CommandType, CommandHandler<CommandType>>();

  constructor(
    context: CommandContext,
    onError: CommandErrorReporter = (error) => console.error('[Commands] Сбой обработчика:', error),
  ) {
    this.context = context;
    this.onError = onError;
  }

  /** Регистрирует обработчик. На один тип команды — один обработчик. */
  register<K extends CommandType>(type: K, handler: CommandHandler<K>): void {
    if (this.handlers.has(type)) {
      throw new Error(`Обработчик команды ${type} уже зарегистрирован`);
    }
    this.handlers.set(type, handler as unknown as CommandHandler<CommandType>);
  }

  /** Проверяет и применяет команду. Никогда не бросает исключений, результат — в возвращаемом значении. */
  dispatch(command: Command): CommandResult {
    const result = this.run(command);
    const { bus } = this.context;
    if (result.ok) {
      bus.emit('command:applied', { type: command.type, playerId: command.playerId });
    } else {
      bus.emit('command:rejected', {
        type: command.type,
        playerId: command.playerId,
        reason: result.reason,
      });
    }
    return result;
  }

  private run(command: Command): CommandResult {
    const handler = this.handlers.get(command.type);
    if (!handler) return reject('unknown_command');
    if (!getPlayer(this.context.state, command.playerId)) return reject('unknown_player');
    try {
      return handler(this.context, command);
    } catch (error) {
      this.onError(error);
      return reject('handler_error');
    }
  }
}

/** Регистрирует команды ядра. Команды систем регистрируются в самих системах. */
export function registerCoreCommands(processor: CommandProcessor): void {
  processor.register('SET_PLAYER_POSITION', ({ state, bus }, command) => {
    const player = getPlayer(state, command.playerId);
    if (!player) return reject('unknown_player');
    const { x, y } = command.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return reject('invalid_position');
    if (!isPointInWorld(command.position)) return reject('out_of_bounds');
    player.position = { x, y };
    bus.emit('player:moved', { playerId: player.id, position: { x, y } });
    return OK;
  });
}
