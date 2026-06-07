import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { validSolution } from "../../src/solver/brute-force.js";
import { StepFinder } from "../../src/solver/step-finder.js";
import { loadReglib } from "../fixtures/reglib.js";

describe("forcing chain (contradiction) — sound", () => {
  const sample = loadReglib()
    .filter((e) => !e.isFail)
    .slice(0, 120);

  it("finds eliminations and never removes a solution-true candidate", () => {
    let withSteps = 0;
    for (const e of sample) {
      const board = Board.fromString(e.raw);
      const sol = board.clone();
      if (!validSolution(sol)) continue;
      const steps = new StepFinder(board).findAll("FORCING_CHAIN_CONTRADICTION");
      if (steps.length > 0) withSteps++;
      for (const s of steps) {
        for (const c of s.candidatesToDelete) {
          expect(sol.solution[c.index]).not.toBe(c.value);
        }
      }
    }
    expect(withSteps).toBeGreaterThan(0);
  });
});
