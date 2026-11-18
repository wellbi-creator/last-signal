import { describe, expect, it } from 'vitest';
import {
  canStep,
  countFree,
  createPassGrid,
  createWorldPassGrid,
  inGrid,
  isFree,
  reachable,
  setBlocked,
} from '../../src/systems/world/passability.ts';
import type { PassGrid } from '../../src/systems/world/passability.ts';
import { Tile } from '../../src/systems/world/types.ts';
import { data } from './objectsHelpers.ts';

/** Окно из строк: '#' — блок, '.' — свободно; левый верхний угол в (10, 20). */
function gridOf(rows: string[]): PassGrid {
  const grid = createPassGrid(10, 20, rows[0]?.length ?? 0, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') setBlocked(grid, 10 + x, 20 + y, true);
  });
  return grid;
}

function reachCount(grid: PassGrid, x: number, y: number): number {
  return reachable(grid, x, y).reduce((a, b) => a + b, 0);
}

describe('canStep', () => {
  it('ортогональные шаги по свободным клеткам', () => {
    const g = gridOf(['...', '...', '...']);
    expect(canStep(g, 11, 21, 12, 21)).toBe(true);
    expect(canStep(g, 11, 21, 11, 20)).toBe(true);
    expect(canStep(g, 11, 21, 11, 21)).toBe(false);
    expect(canStep(g, 10, 20, 12, 20)).toBe(false);
  });

  it('нельзя входить в блок, выходить из блока и выходить за окно', () => {
    const g = gridOf(['.#.', '...']);
    expect(canStep(g, 10, 20, 11, 20)).toBe(false);
    expect(canStep(g, 11, 20, 10, 20)).toBe(false);
    expect(canStep(g, 10, 20, 9, 20)).toBe(false);
    expect(inGrid(g, 9, 20)).toBe(false);
    expect(isFree(g, 11, 20)).toBe(false);
  });

  it('диагональ разрешена только без срезания углов', () => {
    const open = gridOf(['..', '..']);
    expect(canStep(open, 10, 20, 11, 21)).toBe(true);
    const cornerA = gridOf(['.#', '..']);
    expect(canStep(cornerA, 10, 20, 11, 21)).toBe(false);
    const cornerB = gridOf(['..', '#.']);
    expect(canStep(cornerB, 10, 20, 11, 21)).toBe(false);
    expect(canStep(cornerB, 11, 21, 10, 20)).toBe(false);
    const cornerC = gridOf(['...', '.#.', '...']);
    expect(canStep(cornerC, 10, 20, 11, 21)).toBe(false);
    expect(canStep(cornerC, 10, 20, 11, 20)).toBe(true);
  });

  it('шаг симметричен', () => {
    const g = gridOf(['.#.', '...', '#..']);
    for (let y = 20; y < 23; y++)
      for (let x = 10; x < 13; x++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            expect(canStep(g, x, y, x + dx, y + dy)).toBe(canStep(g, x + dx, y + dy, x, y));
          }
  });
});

describe('reachable', () => {
  it('заливает всю связную область', () => {
    const g = gridOf(['....', '....']);
    expect(reachCount(g, 10, 20)).toBe(8);
  });

  it('стена делит окно на части', () => {
    const g = gridOf(['..#..', '..#..', '..#..']);
    expect(reachCount(g, 10, 20)).toBe(6);
    expect(reachCount(g, 13, 20)).toBe(6);
  });

  it('диагональная щель между двумя блоками не пропускает (нет срезания углов)', () => {
    const g = gridOf(['.#', '#.']);
    expect(reachCount(g, 10, 20)).toBe(1);
  });

  it('замкнутый карман недостижим', () => {
    const g = gridOf(['.....', '.###.', '.#.#.', '.###.', '.....']);
    expect(reachCount(g, 10, 20)).toBe(countFree(g) - 1);
  });

  it('заблокированный или внешний старт даёт пустую область', () => {
    const g = gridOf(['#.', '..']);
    expect(reachCount(g, 10, 20)).toBe(0);
    expect(reachCount(g, 0, 0)).toBe(0);
  });
});

describe('createWorldPassGrid', () => {
  it('вода и блокирующие объекты закрыты, кусты проходимы', () => {
    const tiles = new Uint8Array(256 * 256).fill(Tile.Grass);
    tiles[5 * 256 + 5] = Tile.Water;
    const grid = createWorldPassGrid(
      tiles,
      [
        { id: 'a', type: 'boulder_large', x: 10, y: 10 },
        { id: 'b', type: 'bush', x: 20, y: 20 },
      ],
      data,
    );
    expect(isFree(grid, 5, 5)).toBe(false);
    expect(isFree(grid, 10, 10)).toBe(false);
    expect(isFree(grid, 11, 11)).toBe(false);
    expect(isFree(grid, 12, 12)).toBe(true);
    expect(isFree(grid, 20, 20)).toBe(true);
  });
});
