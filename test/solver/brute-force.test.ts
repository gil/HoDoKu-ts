import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { countSolutions, validSolution } from "../../src/solver/brute-force.js";

// A well-known unique puzzle and its solution.
const PUZZLE =
  "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

describe("brute-force solver", () => {
  it("finds the unique solution", () => {
    const b = Board.fromString(PUZZLE);
    expect(validSolution(b)).toBe(true);
    expect(b.solutionSet).toBe(true);
    let sol = "";
    for (let i = 0; i < 81; i++) sol += String(b.solution[i]);
    expect(sol).toBe(SOLUTION);
  });

  it("counts exactly one solution for a proper puzzle", () => {
    expect(countSolutions(Board.fromString(PUZZLE))).toBe(1);
  });

  it("counts multiple solutions for an under-constrained grid", () => {
    const empty = new Board();
    expect(countSolutions(empty, 2)).toBe(2);
  });

  it("counts zero for a contradictory grid", () => {
    // two 5s in row 1
    const bad = Board.fromString("5" + "5" + "...............................................................................");
    expect(countSolutions(bad)).toBe(0);
  });

  it("does not mutate the input board", () => {
    const b = Board.fromString(PUZZLE);
    const before = b.toString();
    countSolutions(b);
    expect(b.toString()).toBe(before);
  });
});
