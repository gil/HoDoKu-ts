/*
 * Dispatches a SolutionType to the solver that handles it and applies steps.
 * Currently wires Simple, BruteForce and GiveUp; the intermediate/advanced
 * solvers register here in later phases.
 */

import type { Board } from "../core/board.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { LENGTH } from "../core/tables.js";
import { applyStep } from "./apply-step.js";
import { validSolution } from "./brute-force.js";
import { getGiveUpStep } from "./give-up.js";
import { SimpleSolver } from "./simple.js";

const SIMPLE_TYPES = new Set<SolutionType>([
  "FULL_HOUSE",
  "HIDDEN_SINGLE",
  "NAKED_SINGLE",
  "HIDDEN_PAIR",
  "HIDDEN_TRIPLE",
  "HIDDEN_QUADRUPLE",
  "LOCKED_PAIR",
  "NAKED_PAIR",
  "LOCKED_TRIPLE",
  "NAKED_TRIPLE",
  "NAKED_QUADRUPLE",
  "LOCKED_CANDIDATES",
  "LOCKED_CANDIDATES_1",
  "LOCKED_CANDIDATES_2",
]);

export class StepFinder {
  private readonly simple = new SimpleSolver();

  constructor(public board: Board) {}

  setBoard(board: Board): void {
    this.board = board;
  }

  getStep(type: SolutionType): SolutionStep | null {
    if (SIMPLE_TYPES.has(type)) return this.simple.getStep(this.board, type);
    if (type === "BRUTE_FORCE") return this.getBruteForce();
    if (type === "GIVE_UP") return getGiveUpStep();
    return null;
  }

  doStep(step: SolutionStep): void {
    applyStep(this.board, step);
  }

  private getBruteForce(): SolutionStep | null {
    const b = this.board;
    if (!b.solutionSet && !validSolution(b)) return null;
    const unsolved: number[] = [];
    for (let i = 0; i < LENGTH; i++) if (b.getValue(i) === 0) unsolved.push(i);
    if (unsolved.length === 0) return null;
    const index = unsolved[Math.floor(unsolved.length / 2)]!;
    const step = new SolutionStep("BRUTE_FORCE");
    step.addIndex(index);
    step.addValue(b.solution[index]!);
    return step;
  }
}
