import { describe, expect, it } from "vitest";
import {
  ALL_UNITS,
  BLOCKS,
  BUDDIES,
  COLS,
  CONSTRAINTS,
  LINES,
  getBlock,
} from "../../src/core/tables.js";
import {
  ANZ_VALUES,
  CAND_FROM_MASK,
  MASKS,
  POSSIBLE_VALUES,
  candidateCount,
  candidatesOf,
} from "../../src/core/candidates.js";

describe("tables (vs Sudoku2 literals)", () => {
  it("LINES/COLS/BLOCKS match Java", () => {
    expect(LINES[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(LINES[8]).toEqual([72, 73, 74, 75, 76, 77, 78, 79, 80]);
    expect(COLS[0]).toEqual([0, 9, 18, 27, 36, 45, 54, 63, 72]);
    expect(COLS[8]).toEqual([8, 17, 26, 35, 44, 53, 62, 71, 80]);
    expect(BLOCKS[0]).toEqual([0, 1, 2, 9, 10, 11, 18, 19, 20]);
    expect(BLOCKS[4]).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50]);
    expect(BLOCKS[8]).toEqual([60, 61, 62, 69, 70, 71, 78, 79, 80]);
  });

  it("ALL_UNITS ordering: lines, cols, blocks", () => {
    expect(ALL_UNITS).toHaveLength(27);
    expect(ALL_UNITS[0]).toEqual(LINES[0]);
    expect(ALL_UNITS[9]).toEqual(COLS[0]);
    expect(ALL_UNITS[18]).toEqual(BLOCKS[0]);
  });

  it("getBlock matches Java BLOCK_FROM_INDEX", () => {
    const expected = [
      0, 0, 0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4,
      4, 4, 5, 5, 5, 3, 3, 3, 4, 4, 4, 5, 5, 5, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8,
      8, 6, 6, 6, 7, 7, 7, 8, 8, 8, 6, 6, 6, 7, 7, 7, 8, 8, 8,
    ];
    for (let i = 0; i < 81; i++) expect(getBlock(i)).toBe(expected[i]);
  });

  it("CONSTRAINTS use line 0-8 / col 9-17 / block 18-26", () => {
    expect(CONSTRAINTS[0]).toEqual([0, 9, 18]);
    expect(CONSTRAINTS[80]).toEqual([8, 17, 26]);
    expect(CONSTRAINTS[40]).toEqual([4, 13, 22]);
  });

  it("BUDDIES has 20 peers excluding self", () => {
    expect(BUDDIES[0]!.size()).toBe(20);
    expect(BUDDIES[0]!.contains(0)).toBe(false);
    expect(BUDDIES[0]!.contains(1)).toBe(true); // same row
    expect(BUDDIES[0]!.contains(9)).toBe(true); // same col
    expect(BUDDIES[0]!.contains(10)).toBe(true); // same block
    expect(BUDDIES[0]!.contains(80)).toBe(false);
  });
});

describe("candidate masks", () => {
  it("MASKS[c] === 1 << (c-1)", () => {
    expect(MASKS[1]).toBe(0x001);
    expect(MASKS[9]).toBe(0x100);
  });

  it("POSSIBLE_VALUES / ANZ_VALUES", () => {
    expect(POSSIBLE_VALUES[0x1ff]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(candidatesOf(0b101)).toEqual([1, 3]);
    expect(candidateCount(0x1ff)).toBe(9);
    expect(ANZ_VALUES[0]).toBe(0);
  });

  it("CAND_FROM_MASK = lowest set digit", () => {
    expect(CAND_FROM_MASK[0b100]).toBe(3);
    expect(CAND_FROM_MASK[0b110]).toBe(2);
    expect(CAND_FROM_MASK[0x100]).toBe(9);
  });
});
