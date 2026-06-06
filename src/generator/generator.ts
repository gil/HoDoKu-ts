/*
 * Port of SudokuGenerator: builds a random full grid by randomized backtracking,
 * then removes clues (optionally with 180° rotational symmetry) while keeping a
 * unique solution. RNG is injectable for reproducible puzzles.
 */

import { Board } from "../core/board.js";
import { candidatesOf } from "../core/candidates.js";
import { LENGTH } from "../core/tables.js";
import { countSolutions, setAllExposedSingles } from "../solver/brute-force.js";

export type Rng = () => number;

const MIN_CLUES = 17;

function nextInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max) % max;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Index of the 180°-rotation partner of cell `i`. */
function symmetric(i: number): number {
  return 9 * (8 - ((i / 9) | 0)) + (8 - (i % 9));
}

function fillRandom(board: Board, rng: Rng): boolean {
  if (!setAllExposedSingles(board)) return false;
  let idx = -1;
  let best = 10;
  for (let i = 0; i < LENGTH; i++) {
    if (board.values[i] === 0) {
      const n = board.getAnzCandidates(i);
      if (n < best) {
        best = n;
        idx = i;
        if (n === 2) break;
      }
    }
  }
  if (idx < 0) return true;
  for (const cand of shuffle([...candidatesOf(board.cells[idx]!)], rng)) {
    const nb = board.clone();
    if (nb.setCell(idx, cand) && fillRandom(nb, rng)) {
      board.set(nb);
      return true;
    }
  }
  return false;
}

/** Generates a random, fully solved grid as an 81-length value array. */
export function generateFullGrid(rng: Rng = Math.random): Int8Array {
  for (;;) {
    const b = new Board();
    if (fillRandom(b, rng)) return b.values.slice();
  }
}

/**
 * Removes clues from a full grid while the puzzle keeps a unique solution.
 * With `symmetric`, partner cells are removed together. Mirrors generateInitPos.
 */
export function removeClues(full: Int8Array, symmetric_: boolean, rng: Rng): Int8Array {
  const vals = full.slice();
  const used = new Array<boolean>(LENGTH).fill(false);
  let usedCount = LENGTH;
  let clues = LENGTH;

  while (clues > MIN_CLUES && usedCount > 1) {
    let i = nextInt(rng, LENGTH);
    do {
      i = i < 80 ? i + 1 : 0;
    } while (used[i]);
    used[i] = true;
    usedCount--;

    if (vals[i] === 0) continue;
    const isCenter = i === 40;
    if (symmetric_ && !isCenter && vals[symmetric(i)] === 0) continue;

    vals[i] = 0;
    clues--;
    let symmIdx = -1;
    if (symmetric_ && !isCenter) {
      symmIdx = symmetric(i);
      vals[symmIdx] = 0;
      used[symmIdx] = true;
      usedCount--;
      clues--;
    }

    if (countSolutions(Board.fromValues(vals), 2) > 1) {
      vals[i] = full[i]!;
      clues++;
      if (symmIdx >= 0) {
        vals[symmIdx] = full[symmIdx]!;
        clues++;
      }
    }
  }
  return vals;
}

export interface GeneratedGrid {
  /** Board with the givens placed as fixed cells. */
  board: Board;
  /** The complete solution. */
  solution: Int8Array;
  /** Given clue values (0 = empty). */
  givens: Int8Array;
}

/** Generates one random valid puzzle (no difficulty targeting). */
export function generateSudoku(symmetric_ = true, rng: Rng = Math.random): GeneratedGrid {
  const solution = generateFullGrid(rng);
  const givens = removeClues(solution, symmetric_, rng);
  const board = Board.fromValues(givens, true);
  board.setSolution(solution);
  return { board, solution, givens };
}
