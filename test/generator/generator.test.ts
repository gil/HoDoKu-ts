import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { countSolutions } from "../../src/solver/brute-force.js";
import { SudokuSolver } from "../../src/solver/solver.js";
import { generateFullGrid, generateSudoku } from "../../src/generator/generator.js";
import { generateByDifficulty } from "../../src/generator/generate-by-difficulty.js";

// Deterministic RNG (mulberry32) for reproducible tests.
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isValidFullGrid(values: ArrayLike<number>): boolean {
  for (let i = 0; i < 81; i++) if (values[i]! < 1 || values[i]! > 9) return false;
  return Board.fromValues(values).checkSudoku();
}

describe("generator", () => {
  it("produces a valid complete grid", () => {
    const full = generateFullGrid(rngFrom(1));
    expect(full).toHaveLength(81);
    expect(isValidFullGrid(full)).toBe(true);
  });

  it("generated puzzle has a unique solution matching its full grid", () => {
    const { board, solution, givens } = generateSudoku(true, rngFrom(2));
    expect(isValidFullGrid(solution)).toBe(true);
    expect(countSolutions(Board.fromValues(givens), 2)).toBe(1);
    // solving the givens reproduces the recorded solution
    expect(new SudokuSolver().solve(board).board.values).toEqual(solution);
  });

  it("is reproducible with a fixed seed", () => {
    const a = generateSudoku(true, rngFrom(42)).givens;
    const b = generateSudoku(true, rngFrom(42)).givens;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("symmetric puzzles have 180°-symmetric given pattern", () => {
    const { givens } = generateSudoku(true, rngFrom(7));
    for (let i = 0; i < 81; i++) {
      const partner = 9 * (8 - Math.floor(i / 9)) + (8 - (i % 9));
      expect(givens[i]! !== 0).toBe(givens[partner]! !== 0);
    }
  });

  it("generates an easy puzzle rated easy with a unique solution", () => {
    const p = generateByDifficulty("easy", { rng: rngFrom(3), maxTries: 3000 });
    expect(p).not.toBeNull();
    expect(p!.difficulty).toBe("easy");
    expect(p!.level.name.toLowerCase()).toBe("easy");
    expect(countSolutions(Board.fromValues(p!.givens), 2)).toBe(1);
  });

  it("generates a hard puzzle rated hard with a unique solution", () => {
    const p = generateByDifficulty("hard", { rng: rngFrom(9), maxTries: 8000 });
    expect(p).not.toBeNull();
    expect(p!.difficulty).toBe("hard");
    expect(countSolutions(Board.fromValues(p!.givens), 2)).toBe(1);
  });
});
