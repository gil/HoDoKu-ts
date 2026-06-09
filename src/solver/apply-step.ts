/*
 * Applies a SolutionStep to a board. Singles / full houses / brute-force place a
 * value; every other technique only eliminates candidates. This mirrors the
 * per-solver doStep methods, which all reduce to these two operations.
 */

import type { Board } from "../core/board.js";
import type { SolutionStep } from "../core/solution-step.js";
import { isSingle, type SolutionType } from "../core/solution-type.js";

// Forcing chains/nets conclude either a placement (indices+values) or
// eliminations; HoDoKu's TablingSolver.doStep sets cells when values are present
// and otherwise deletes candidates. Every other elimination technique only
// deletes candidates (its indices are pattern cells, not placements).
const FORCING: ReadonlySet<SolutionType> = new Set<SolutionType>([
  "FORCING_CHAIN",
  "FORCING_CHAIN_CONTRADICTION",
  "FORCING_CHAIN_VERITY",
  "FORCING_NET",
  "FORCING_NET_CONTRADICTION",
  "FORCING_NET_VERITY",
]);

export function applyStep(board: Board, step: SolutionStep): void {
  if (isSingle(step.type) || step.type === "BRUTE_FORCE") {
    board.setCell(step.indices[0]!, step.values[0]!);
    return;
  }
  if (FORCING.has(step.type)) {
    if (step.values.length > 0) {
      for (let i = 0; i < step.values.length; i++) board.setCell(step.indices[i]!, step.values[i]!);
    } else {
      for (const c of step.candidatesToDelete) board.delCandidate(c.index, c.value);
    }
    return;
  }
  for (const c of step.candidatesToDelete) board.delCandidate(c.index, c.value);
}
