/*
 * Backtracking solver, ported from SudokuGenerator's solve(). Used for
 * uniqueness counting, recording the solution, and the BRUTE_FORCE last resort.
 * Singles exposed while building the grid are set eagerly (setAllExposedSingles);
 * the search then branches on the cell with the fewest candidates (MRV).
 *
 * Solution count is order-independent, so this need not mirror HoDoKu's exact
 * node order — only the (unique) solution and the count matter.
 */

import { Board } from "../core/board.js";
import { CAND_FROM_MASK, candidatesOf } from "../core/candidates.js";
import { ALL_UNITS, LENGTH } from "../core/tables.js";

/**
 * Eagerly place all naked and hidden singles. Returns false if a contradiction
 * appears (an emptied cell, or a digit with no home in some unit).
 */
export function setAllExposedSingles(b: Board): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < LENGTH; i++) {
      if (b.values[i] !== 0) continue;
      if (b.cells[i] === 0) return false; // emptied cell
      if (b.getAnzCandidates(i) === 1) {
        if (!b.setCell(i, CAND_FROM_MASK[b.cells[i]!]!)) return false;
        changed = true;
      }
    }
    for (let c = 0; c < 27; c++) {
      const unit = ALL_UNITS[c]!;
      const free = b.free[c]!;
      for (let d = 1; d <= 9; d++) {
        if (free[d] === 1) {
          for (const cell of unit) {
            if (b.values[cell] === 0 && b.isCandidate(cell, d)) {
              if (!b.setCell(cell, d)) return false;
              changed = true;
              break;
            }
          }
        } else if (free[d] === 0) {
          // digit d must already be placed somewhere in the unit, else invalid
          let placed = false;
          for (const cell of unit) {
            if (b.values[cell] === d) {
              placed = true;
              break;
            }
          }
          if (!placed) return false;
        }
      }
    }
  }
  return true;
}

interface SearchState {
  count: number;
  max: number;
  solution: Int8Array | null;
}

function search(b: Board, state: SearchState): void {
  if (!setAllExposedSingles(b)) return;
  if (b.isSolved()) {
    state.count++;
    if (state.count === 1) state.solution = b.values.slice();
    return;
  }
  let idx = -1;
  let best = 10;
  for (let i = 0; i < LENGTH; i++) {
    if (b.values[i] === 0) {
      const n = b.getAnzCandidates(i);
      if (n < best) {
        best = n;
        idx = i;
        if (n === 2) break;
      }
    }
  }
  if (idx < 0) return;
  for (const cand of candidatesOf(b.cells[idx]!)) {
    const nb = b.clone();
    if (nb.setCell(idx, cand)) {
      search(nb, state);
      if (state.count >= state.max) return;
    }
  }
}

/**
 * Counts solutions up to `max` (default 2). Returns 0 (invalid), 1 (unique) or
 * >=2 (multiple). Does not mutate `board`.
 */
export function countSolutions(board: Board, max = 2): number {
  const state: SearchState = { count: 0, max, solution: null };
  search(board.clone(), state);
  return state.count;
}

/**
 * If `board` has a unique solution, records it via `board.setSolution` and
 * returns true. Mirrors SudokuGenerator.validSolution.
 */
export function validSolution(board: Board): boolean {
  const state: SearchState = { count: 0, max: 2, solution: null };
  search(board.clone(), state);
  if (state.count === 1 && state.solution) {
    board.setSolution(state.solution);
    return true;
  }
  return false;
}
