import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { SudokuSolver } from "../../src/solver/solver.js";

const PUZZLE =
  "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

describe("SudokuSolver", () => {
  it("solves a puzzle end-to-end to the correct grid", () => {
    const solver = new SudokuSolver();
    const r = solver.solve(Board.fromString(PUZZLE));
    expect(r.solved).toBe(true);
    let out = "";
    for (let i = 0; i < 81; i++) out += String(r.board.values[i]);
    expect(out).toBe(SOLUTION);
  });

  it("does not need brute force for an easy puzzle", () => {
    const solver = new SudokuSolver();
    const r = solver.solve(Board.fromString(PUZZLE));
    expect(r.steps.some((s) => s.type === "BRUTE_FORCE")).toBe(false);
    expect(r.steps.every((s) => s.type !== "GIVE_UP")).toBe(true);
  });

  it("returns a next-move hint without mutating the board", () => {
    const solver = new SudokuSolver();
    const board = Board.fromString(PUZZLE);
    const before = board.toString();
    const hint = solver.getHint(board);
    expect(hint).not.toBeNull();
    expect(hint!.step.indices.length + hint!.step.candidatesToDelete.length).toBeGreaterThan(0);
    expect(board.toString()).toBe(before);
  });

  it("rates the puzzle with a score and a level", () => {
    const solver = new SudokuSolver();
    const { score, level, solved } = solver.rate(Board.fromString(PUZZLE));
    expect(solved).toBe(true);
    expect(score).toBeGreaterThan(0);
    expect(["easy", "medium", "hard", "unfair", "extreme"]).toContain(
      level.name.toLowerCase(),
    );
  });

  it("singlesOnly hint only returns singles", () => {
    const solver = new SudokuSolver();
    const hint = solver.getHint(Board.fromString(PUZZLE), { singlesOnly: true });
    if (hint) expect(["FULL_HOUSE", "NAKED_SINGLE", "HIDDEN_SINGLE"]).toContain(hint.step.type);
  });
});
