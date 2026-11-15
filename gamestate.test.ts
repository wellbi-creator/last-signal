import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT_VERSION } from '../../src/config.ts';
import { createCore } from '../../src/core/Core.ts';
import {
  LOCAL_PLAYER_ID,
  cloneState,
  createInitialState,
  getPlayer,
} from '../../src/core/GameState.ts';

describe('createInitialState', () => {
  it('создаёт состояние нового мира с игроком в центре', () => {
    const state = createInitialState({ worldSeed: 'abc' });
    expect(state.version).toBe(SAVE_FORMAT_VERSION);
    expect(state.worldSeed).toBe('abc');
    expect(state.tick).toBe(0);
    expect(getPlayer(state, LOCAL_PLAYER_ID)?.position).toEqual({ x: 4096, y: 4096 });
  });

  it('очищает seed', () => {
    expect(createInitialState({ worldSeed: '  мир \n 1 ' }).worldSeed).toBe('мир 1');
  });

  it('отвергает пустой seed', () => {
    expect(() => createInitialState({ worldSeed: '   ' })).toThrow();
  });

  it('принимает свою точку старта и не хранит ссылку на переданный объект', () => {
    const spawn = { x: 100, y: 200 };
    const state = createInitialState({ worldSeed: 's', spawn });
    spawn.x = 999;
    expect(getPlayer(state, LOCAL_PLAYER_ID)?.position).toEqual({ x: 100, y: 200 });
  });
});

describe('сериализуемость и копирование', () => {
  it('состояние переживает JSON-круг без потерь', () => {
    const state = createInitialState({ worldSeed: 'abc' });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('cloneState создаёт независимую копию', () => {
    const original = createInitialState({ worldSeed: 'abc' });
    const copy = cloneState(original);
    expect(copy).toEqual(original);
    const player = getPlayer(copy, LOCAL_PLAYER_ID);
    if (!player) throw new Error('игрок не найден');
    player.position.x = 1;
    expect(getPlayer(original, LOCAL_PLAYER_ID)?.position.x).toBe(4096);
  });
});

describe('getPlayer', () => {
  it('не находит несуществующих и «служебных» идентификаторов', () => {
    const state = createInitialState({ worldSeed: 'abc' });
    expect(getPlayer(state, 'nobody')).toBeUndefined();
    expect(getPlayer(state, 'toString')).toBeUndefined();
    expect(getPlayer(state, '__proto__')).toBeUndefined();
  });
});

describe('createCore', () => {
  it('собирает состояние, шину и обработчик команд', () => {
    const core = createCore({ worldSeed: 'M0-DEMO' });
    expect(core.state.worldSeed).toBe('M0-DEMO');
    expect(core.bus.listenerCount('player:moved')).toBe(0);
    expect(typeof core.commands.dispatch).toBe('function');
  });
});
