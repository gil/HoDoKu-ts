/*
 * generate -> rate -> filter loop (BackgroundGenerator without the GUI/threading).
 * Generates random symmetric puzzles and keeps the first whose rated difficulty
 * level equals the requested one, applying HoDoKu's acceptance rules.
 */

import type { Board } from "../core/board.js";
import { type Difficulty, type DifficultyLevel, difficultyOf } from "../core/difficulty.js";
import type { SolutionStep } from "../core/solution-step.js";
import { SudokuSolver } from "../solver/solver.js";
import { type Rng, generateSudoku } from "./generator.js";

const MAX_TRIES = 20000;

export interface GeneratedPuzzle {
  board: Board;
  givens: Int8Array;
  solution: Int8Array;
  score: number;
  level: DifficultyLevel;
  difficulty: Difficulty;
  steps: SolutionStep[];
}

export interface GenerateByDifficultyOptions {
  symmetric?: boolean;
  rng?: Rng;
  maxTries?: number;
}

/**
 * Generates a puzzle whose rated difficulty equals `target`, or null if none was
 * found within `maxTries`. NOTE: levels above what the current solver set can
 * recognise are unreachable until the corresponding techniques are ported.
 */
export function generateByDifficulty(
  target: Difficulty,
  opts: GenerateByDifficultyOptions = {},
): GeneratedPuzzle | null {
  const solver = new SudokuSolver();
  const targetOrd = difficultyOf(target);
  const symmetric = opts.symmetric ?? true;
  const rng = opts.rng ?? Math.random;
  const maxTries = opts.maxTries ?? MAX_TRIES;

  for (let tries = 0; tries < maxTries; tries++) {
    const g = generateSudoku(symmetric, rng);
    const r = solver.solve(g.board, { maxLevel: targetOrd, rejectTooLowScore: true });
    if (r.accepted && r.level.ordinal === targetOrd) {
      return {
        board: g.board,
        givens: g.givens,
        solution: g.solution,
        score: r.score,
        level: r.level,
        difficulty: target,
        steps: r.steps,
      };
    }
  }
  return null;
}

/** Generates one random puzzle and returns it with its rating (any difficulty). */
export function generateRated(opts: GenerateByDifficultyOptions = {}): GeneratedPuzzle {
  const solver = new SudokuSolver();
  const symmetric = opts.symmetric ?? true;
  const rng = opts.rng ?? Math.random;
  const g = generateSudoku(symmetric, rng);
  const r = solver.solve(g.board);
  return {
    board: g.board,
    givens: g.givens,
    solution: g.solution,
    score: r.score,
    level: r.level,
    difficulty: r.level.name.toLowerCase() as Difficulty,
    steps: r.steps,
  };
}
