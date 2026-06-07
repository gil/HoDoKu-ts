/*
 * Beginning of the tabling family — sound Forcing-Chain (Contradiction).
 *
 * The full HoDoKu TablingSolver (Trebor's Tables: Nice Loops, AIC, Forcing
 * Chains/Nets with group + ALS nodes) is a large dedicated port. This is a
 * sound first step: assume a candidate, propagate Naked/Hidden Singles to a
 * fixpoint; if that contradicts (a cell is emptied), the candidate is false and
 * can be eliminated. Eliminations are provably correct (verified by the
 * soundness harness); it finds the subset of forcing chains reachable through
 * singles propagation. Chain reconstruction for display is omitted for now.
 */

import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { LENGTH } from "../core/tables.js";
import { setAllExposedSingles } from "./brute-force.js";
import type { CandidateFinder } from "./wing.js";

const FORCING_TYPES = new Set<SolutionType>([
  "FORCING_CHAIN",
  "FORCING_CHAIN_CONTRADICTION",
]);

export class TablingSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (FORCING_TYPES.has(type)) return this.forcing(finder, true)[0] ?? null;
    return null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (FORCING_TYPES.has(type)) return this.forcing(finder, false);
    return [];
  }

  private forcing(finder: CandidateFinder, onlyOne: boolean): SolutionStep[] {
    const base = finder.board;
    const out: SolutionStep[] = [];
    for (let i = 0; i < LENGTH; i++) {
      if (base.values[i] !== 0) continue;
      for (const c of base.getAllCandidates(i)) {
        const b = base.clone();
        const ok = b.setCell(i, c) && setAllExposedSingles(b) && noEmptyCell(b);
        if (!ok) {
          const step = new SolutionStep("FORCING_CHAIN_CONTRADICTION");
          step.addValue(c);
          step.addIndex(i);
          step.addCandidateToDelete(i, c);
          out.push(step);
          if (onlyOne) return out;
        }
      }
    }
    return out;
  }
}

function noEmptyCell(board: { values: Int8Array; cells: Uint16Array }): boolean {
  for (let i = 0; i < LENGTH; i++) {
    if (board.values[i] === 0 && board.cells[i] === 0) return false;
  }
  return true;
}
