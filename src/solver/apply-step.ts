/*
 * Applies a SolutionStep to a board. Singles / full houses / brute-force place a
 * value; every other technique only eliminates candidates. This mirrors the
 * per-solver doStep methods, which all reduce to these two operations.
 */

import type { Board } from "../core/board.js";
import type { SolutionStep } from "../core/solution-step.js";
import { isSingle } from "../core/solution-type.js";

export function applyStep(board: Board, step: SolutionStep): void {
  if (isSingle(step.type) || step.type === "BRUTE_FORCE") {
    board.setCell(step.indices[0]!, step.values[0]!);
    return;
  }
  for (const c of step.candidatesToDelete) board.delCandidate(c.index, c.value);
}
