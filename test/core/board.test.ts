import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { getIndex } from "../../src/core/tables.js";

const PUZZLE81 =
  "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79.";

describe("Board parsing & propagation", () => {
  it("loads an 81-char puzzle and counts givens", () => {
    const b = Board.fromString(PUZZLE81);
    const givens = [...PUZZLE81].filter((c) => c >= "1" && c <= "9").length;
    expect(b.unsolvedCells).toBe(81 - givens);
    expect(b.getValue(0)).toBe(5);
    expect(b.isFixed(0)).toBe(true);
    expect(b.getValue(2)).toBe(0);
  });

  it("placing a value eliminates it from buddies", () => {
    const b = Board.fromString(PUZZLE81);
    // r1c1 = 5 -> no buddy of cell 0 may have candidate 5
    expect(b.isCandidate(1, 5)).toBe(false); // same row
    expect(b.isCandidate(9, 5)).toBe(false); // same col
    expect(b.isCandidate(10, 5)).toBe(false); // same block
    expect(b.isValidValue(2, 5)).toBe(false);
  });

  it("free counts reflect placed digits", () => {
    const b = Board.fromString(PUZZLE81);
    // digit 5 is placed in row 0 (constraint 0) -> 0 free cells allow it there
    expect(b.free[0]![5]).toBe(0);
  });

  it("setCell then clear restores candidates", () => {
    const b = Board.fromString(PUZZLE81);
    const idx = 2; // empty cell
    const before = b.getCandidates(idx).slice();
    expect(b.setCell(idx, before[0]!)).toBe(true);
    expect(b.getValue(idx)).toBe(before[0]);
    b.setCell(idx, 0); // clear
    expect(b.getValue(idx)).toBe(0);
    expect(b.getCandidates(idx)).toEqual(before);
  });

  it("parses HoDoKu library format with '+' and deletions", () => {
    const line =
      ":0100:1:.+92....+365...3+697..3+6.+94...+2.58.1.+9+3+3.96.28.....9.32..+9+5+34+6..2..87+32+9..56+2....3.+9:811 515 715 538 761 595 795:193 198::";
    const b = Board.fromString(line);
    // '+9' at r1c2 means cell 1 is placed (value 9) but not a given
    expect(b.getValue(getIndex(0, 1))).toBe(9);
    expect(b.isFixed(getIndex(0, 1))).toBe(false);
    // deleted candidate "811" => r1c1 <> 8
    expect(b.isCandidate(getIndex(0, 0), 8)).toBe(false);
    // "515" => r1c5 <> 5
    expect(b.isCandidate(getIndex(0, 4), 5)).toBe(false);
  });

  it("checkSudoku passes for a consistent grid", () => {
    const b = Board.fromString(PUZZLE81);
    expect(b.checkSudoku()).toBe(true);
  });
});
