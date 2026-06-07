import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { SudokuSolver } from "../../src/solver/solver.js";
import { loadReglib } from "../fixtures/reglib.js";

describe("solver completeness", () => {
  it("solves reglib puzzles by deduction (no brute-force fallback)", () => {
    const solver = new SudokuSolver();
    const sample = loadReglib()
      .filter((e) => !e.isFail)
      .slice(0, 250);
    let solved = 0;
    let pureDeduction = 0;
    for (const e of sample) {
      const r = solver.solve(Board.fromString(e.raw));
      if (r.solved) solved++;
      if (r.solved && !r.steps.some((s) => s.type === "BRUTE_FORCE" || s.type === "GIVE_UP")) {
        pureDeduction++;
      }
    }
    expect(solved).toBe(sample.length);
    expect(pureDeduction).toBe(sample.length);
  });
});
