/*
 * Static lookup tables, ported from Sudoku2's static initializer. Cells are
 * indexed 0-80 in row-major order. Constraints are numbered:
 *   lines  0-8, columns 9-17, blocks 18-26   (27 total)
 * matching CONSTRAINTS / ALL_UNITS in the Java source.
 */

import { CellSet } from "./cell-set.js";

export const LENGTH = 81;
export const UNITS = 9;

// Unit types (as in Sudoku2)
export const BLOCK = 0;
export const LINE = 1;
export const COL = 2;
export const CELL = 3;

export const LINES: readonly (readonly number[])[] = buildLines();
export const COLS: readonly (readonly number[])[] = buildCols();
export const BLOCKS: readonly (readonly number[])[] = buildBlocks();

/** All 27 constraints: lines (0-8), then columns (9-17), then blocks (18-26). */
export const ALL_UNITS: readonly (readonly number[])[] = [...LINES, ...COLS, ...BLOCKS];

export function getLine(index: number): number {
  return (index / 9) | 0;
}
export function getCol(index: number): number {
  return index % 9;
}
export function getBlock(index: number): number {
  return ((getLine(index) / 3) | 0) * 3 + ((getCol(index) / 3) | 0);
}
export function getIndex(row: number, col: number): number {
  return row * 9 + col;
}

/** CONSTRAINTS[cell] = [lineConstraint, colConstraint, blockConstraint]. */
export const CONSTRAINTS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < LENGTH; i++) {
    out.push([getLine(i), 9 + getCol(i), 18 + getBlock(i)]);
  }
  return out;
})();

/** Cells sharing a line, column, or block with each cell (excluding itself). */
export const BUDDIES: readonly CellSet[] = (() => {
  const out: CellSet[] = [];
  for (let i = 0; i < LENGTH; i++) {
    const s = new CellSet();
    for (const c of LINES[getLine(i)]!) s.add(c);
    for (const c of COLS[getCol(i)]!) s.add(c);
    for (const c of BLOCKS[getBlock(i)]!) s.add(c);
    s.remove(i);
    out.push(s);
  }
  return out;
})();

/** CellSet for each of the 27 constraints. */
export const UNIT_TEMPLATES: readonly CellSet[] = ALL_UNITS.map((u) => CellSet.fromIndices(u));

/** Common buddies: cells that see EVERY cell in `indices` (intersection of buddies). */
export function getCommonBuddies(indices: CellSet): CellSet {
  const s = new CellSet(true);
  for (const i of indices) s.and(BUDDIES[i]!);
  return s;
}

function buildLines(): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: number[] = [];
    for (let c = 0; c < 9; c++) row.push(r * 9 + c);
    out.push(row);
  }
  return out;
}

function buildCols(): number[][] {
  const out: number[][] = [];
  for (let c = 0; c < 9; c++) {
    const col: number[] = [];
    for (let r = 0; r < 9; r++) col.push(r * 9 + c);
    out.push(col);
  }
  return out;
}

function buildBlocks(): number[][] {
  const out: number[][] = [];
  for (let b = 0; b < 9; b++) {
    const cells: number[] = [];
    const rowBase = ((b / 3) | 0) * 3;
    const colBase = (b % 3) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) cells.push((rowBase + r) * 9 + (colBase + c));
    }
    out.push(cells);
  }
  return out;
}
