import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.ts';

type TestEvents = {
  ping: { n: number };
  pong: { text: string };
};

function createBus() {
  const errors: Array<{ event: string; error: unknown }> = [];
  const bus = new EventBus<TestEvents>((event, error) => errors.push({ event, error }));
  return { bus, errors };
}

describe('EventBus', () => {
  it('доставляет данные подписчикам в порядке подписки', () => {
    const { bus } = createBus();
    const log: string[] = [];
    bus.on('ping', ({ n }) => log.push(`a${n}`));
    bus.on('ping', ({ n }) => log.push(`b${n}`));
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['a1', 'b1']);
  });

  it('не вызывает подписчиков других событий', () => {
    const { bus } = createBus();
    let called = 0;
    bus.on('pong', () => called++);
    bus.emit('ping', { n: 1 });
    expect(called).toBe(0);
  });

  it('возвращаемая функция отписывает обработчик', () => {
    const { bus } = createBus();
    let called = 0;
    const off = bus.on('ping', () => called++);
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(called).toBe(1);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('off отписывает конкретный обработчик', () => {
    const { bus } = createBus();
    let a = 0;
    let b = 0;
    const handlerA = () => a++;
    bus.on('ping', handlerA);
    bus.on('ping', () => b++);
    bus.off('ping', handlerA);
    bus.emit('ping', { n: 1 });
    expect(a).toBe(0);
    expect(b).toBe(1);
  });

  it('once срабатывает один раз', () => {
    const { bus } = createBus();
    const received: number[] = [];
    bus.once('ping', ({ n }) => received.push(n));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(received).toEqual([1]);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('ошибка в обработчике не мешает остальным и попадает в onError', () => {
    const { bus, errors } = createBus();
    const boom = new Error('сбой');
    let reached = false;
    bus.on('ping', () => {
      throw boom;
    });
    bus.on('ping', () => {
      reached = true;
    });
    bus.emit('ping', { n: 1 });
    expect(reached).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.event).toBe('ping');
    expect(errors[0]?.error).toBe(boom);
  });

  it('обработчик, отписанный во время эмиссии, больше не вызывается', () => {
    const { bus } = createBus();
    const log: string[] = [];
    const second = () => log.push('second');
    bus.on('ping', () => {
      log.push('first');
      bus.off('ping', second);
    });
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['first']);
  });

  it('подписка во время эмиссии срабатывает только со следующего события', () => {
    const { bus } = createBus();
    const log: string[] = [];
    bus.once('ping', () => {
      bus.on('ping', () => log.push('late'));
    });
    bus.emit('ping', { n: 1 });
    expect(log).toEqual([]);
    bus.emit('ping', { n: 2 });
    expect(log).toEqual(['late']);
  });

  it('clear(event) удаляет подписчиков события, clear() — всех', () => {
    const { bus } = createBus();
    bus.on('ping', () => undefined);
    bus.on('pong', () => undefined);
    bus.clear('ping');
    expect(bus.listenerCount('ping')).toBe(0);
    expect(bus.listenerCount('pong')).toBe(1);
    bus.clear();
    expect(bus.listenerCount('pong')).toBe(0);
  });

  it('emit без подписчиков безопасен', () => {
    const { bus } = createBus();
    bus.emit('pong', { text: 'никого нет' });
    expect(bus.listenerCount('pong')).toBe(0);
  });
});
