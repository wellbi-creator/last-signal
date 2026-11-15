import { describe, expect, it } from 'vitest';
import { WORLD_PIXELS } from '../../src/config.ts';
import { CommandProcessor } from '../../src/core/Commands.ts';
import type { Command } from '../../src/core/Commands.ts';
import { createCore } from '../../src/core/Core.ts';
import { LOCAL_PLAYER_ID, getPlayer } from '../../src/core/GameState.ts';

function setPosition(x: number, y: number, playerId = LOCAL_PLAYER_ID): Command {
  return { type: 'SET_PLAYER_POSITION', playerId, tick: 0, position: { x, y } };
}

function setup() {
  const core = createCore({ worldSeed: 'test' });
  const events: string[] = [];
  core.bus.on('command:applied', (e) => events.push(`applied:${e.type}`));
  core.bus.on('command:rejected', (e) => events.push(`rejected:${e.type}:${e.reason}`));
  core.bus.on('player:moved', (e) => events.push(`moved:${e.position.x},${e.position.y}`));
  return { core, events };
}

describe('SET_PLAYER_POSITION', () => {
  it('меняет позицию игрока и сообщает об этом событиями', () => {
    const { core, events } = setup();
    const result = core.commands.dispatch(setPosition(100, 250.5));
    expect(result).toEqual({ ok: true });
    expect(getPlayer(core.state, LOCAL_PLAYER_ID)?.position).toEqual({ x: 100, y: 250.5 });
    expect(events).toEqual(['moved:100,250.5', 'applied:SET_PLAYER_POSITION']);
  });

  it('копирует позицию из команды, а не хранит ссылку на неё', () => {
    const { core } = setup();
    const command = setPosition(10, 20);
    core.commands.dispatch(command);
    command.position.x = 999;
    expect(getPlayer(core.state, LOCAL_PLAYER_ID)?.position.x).toBe(10);
  });

  it('принимает границы мира включительно слева-сверху и не включая правую-нижнюю', () => {
    const { core } = setup();
    expect(core.commands.dispatch(setPosition(0, 0)).ok).toBe(true);
    expect(core.commands.dispatch(setPosition(WORLD_PIXELS - 1, WORLD_PIXELS - 1)).ok).toBe(true);
    expect(core.commands.dispatch(setPosition(WORLD_PIXELS, 0))).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    });
  });

  it('отклоняет выход за границы и не меняет состояние', () => {
    const { core, events } = setup();
    const before = JSON.stringify(core.state);
    expect(core.commands.dispatch(setPosition(-5, 10))).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    });
    expect(JSON.stringify(core.state)).toBe(before);
    expect(events).toEqual(['rejected:SET_PLAYER_POSITION:out_of_bounds']);
  });

  it('отклоняет NaN и бесконечность', () => {
    const { core } = setup();
    const before = JSON.stringify(core.state);
    expect(core.commands.dispatch(setPosition(Number.NaN, 1))).toEqual({
      ok: false,
      reason: 'invalid_position',
    });
    expect(core.commands.dispatch(setPosition(1, Number.POSITIVE_INFINITY))).toEqual({
      ok: false,
      reason: 'invalid_position',
    });
    expect(JSON.stringify(core.state)).toBe(before);
  });

  it('отклоняет команду от несуществующего игрока', () => {
    const { core, events } = setup();
    expect(core.commands.dispatch(setPosition(10, 10, 'ghost'))).toEqual({
      ok: false,
      reason: 'unknown_player',
    });
    expect(events).toEqual(['rejected:SET_PLAYER_POSITION:unknown_player']);
  });
});

describe('CommandProcessor', () => {
  it('отклоняет неизвестный тип команды', () => {
    const { core } = setup();
    const unknown = {
      type: 'FLY_TO_MOON',
      playerId: LOCAL_PLAYER_ID,
      tick: 0,
    } as unknown as Command;
    expect(core.commands.dispatch(unknown)).toEqual({ ok: false, reason: 'unknown_command' });
  });

  it('не позволяет зарегистрировать обработчик дважды', () => {
    const { core } = setup();
    expect(() => core.commands.register('SET_PLAYER_POSITION', () => ({ ok: true }))).toThrow();
  });

  it('сбой обработчика превращается в отказ, а не в падение игры', () => {
    const core = createCore({ worldSeed: 'test' });
    const reported: unknown[] = [];
    const processor = new CommandProcessor({ state: core.state, bus: core.bus }, (e) =>
      reported.push(e),
    );
    const boom = new Error('баг в обработчике');
    processor.register('SET_PLAYER_POSITION', () => {
      throw boom;
    });
    expect(processor.dispatch(setPosition(1, 1))).toEqual({ ok: false, reason: 'handler_error' });
    expect(reported).toEqual([boom]);
  });
});
