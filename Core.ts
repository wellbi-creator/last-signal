import { CommandProcessor, registerCoreCommands } from './Commands.ts';
import { EventBus } from './EventBus.ts';
import type { GameEvents } from './events.ts';
import { createInitialState } from './GameState.ts';
import type { GameState } from './GameState.ts';

/**
 * Ядро одной игровой сессии: состояние, шина событий и обработчик команд.
 * Не зависит от Phaser, поэтому работает и в тестах, и (в будущем) на сервере.
 */
export interface Core {
  state: GameState;
  bus: EventBus<GameEvents>;
  commands: CommandProcessor;
}

export interface CreateCoreOptions {
  worldSeed: string;
}

export function createCore(options: CreateCoreOptions): Core {
  const state = createInitialState({ worldSeed: options.worldSeed });
  const bus = new EventBus<GameEvents>();
  const commands = new CommandProcessor({ state, bus });
  registerCoreCommands(commands);
  return { state, bus, commands };
}
