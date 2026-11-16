import { SAVE_FORMAT_VERSION, WORLD_GEN_VERSION } from '../config.ts';
import { getWorldSpawnPoint } from './coords.ts';
import { sanitizeSeedText } from './Seed.ts';
import type { PlayerId, Tick, Vec2 } from './types.ts';

/** Идентификатор единственного игрока в одиночной игре v1. */
export const LOCAL_PLAYER_ID: PlayerId = 'p1';

export interface PlayerState {
  id: PlayerId;
  /** Позиция в пикселях мира. */
  position: Vec2;
}

/**
 * Корневое состояние игры. Только простые сериализуемые данные (числа, строки, объекты,
 * массивы): без классов, функций, Map/Set и ссылок на Phaser. Благодаря этому его можно
 * сохранить через JSON и в будущем передавать по сети.
 *
 * Изменяется ТОЛЬКО обработчиками команд (см. Commands.ts).
 * Новые поля (инвентарь, постройки, квест…) добавляются на своих этапах вместе с
 * повышением SAVE_FORMAT_VERSION и миграцией.
 */
export interface GameState {
  /** Версия формата (SAVE_FORMAT_VERSION). */
  version: number;
  /** Канонический (очищенный) текст seed мира. */
  worldSeed: string;
  /**
   * Версия алгоритма генерации мира (WORLD_GEN_VERSION). Один и тот же seed при разных версиях
   * даёт разные миры, поэтому версия хранится вместе с seed.
   */
  worldGenVersion: number;
  tick: Tick;
  players: Record<PlayerId, PlayerState>;
}

export interface CreateStateOptions {
  worldSeed: string;
  spawn?: Vec2;
}

/** Создаёт состояние нового мира. Seed очищается; пустой seed недопустим. */
export function createInitialState(options: CreateStateOptions): GameState {
  const worldSeed = sanitizeSeedText(options.worldSeed);
  if (worldSeed === '') {
    throw new Error('Seed мира не может быть пустым');
  }
  const spawn = options.spawn ?? getWorldSpawnPoint();
  return {
    version: SAVE_FORMAT_VERSION,
    worldSeed,
    worldGenVersion: WORLD_GEN_VERSION,
    tick: 0,
    players: {
      [LOCAL_PLAYER_ID]: { id: LOCAL_PLAYER_ID, position: { x: spawn.x, y: spawn.y } },
    },
  };
}

/** Глубокая копия состояния. Работает именно потому, что состояние сериализуемо. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState | undefined {
  return Object.hasOwn(state.players, playerId) ? state.players[playerId] : undefined;
}
