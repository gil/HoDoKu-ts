/*
 * Dispatches a SolutionType to the solver that handles it and applies steps.
 * Currently wires Simple, BruteForce and GiveUp; the intermediate/advanced
 * solvers register here in later phases.
 */

import type { Board } from "../core/board.js";
import { candidatesOf } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { LENGTH } from "../core/tables.js";
import { applyStep } from "./apply-step.js";
import { validSolution } from "./brute-force.js";
import { FishSolver } from "./fish.js";
import { getGiveUpStep } from "./give-up.js";
import { SimpleSolver } from "./simple.js";
import { SingleDigitPatternSolver } from "./single-digit-pattern.js";
import { WingSolver } from "./wing.js";

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

const WING_TYPES = new Set<SolutionType>(["XY_WING", "XYZ_WING", "W_WING"]);

const SDP_TYPES = new Set<SolutionType>(["SKYSCRAPER", "TWO_STRING_KITE", "EMPTY_RECTANGLE"]);

const BASIC_FISH_TYPES = new Set<SolutionType>(["X_WING", "SWORDFISH", "JELLYFISH"]);

export class StepFinder {
  private readonly simple = new SimpleSolver();
  private readonly wing = new WingSolver();
  private readonly sdp = new SingleDigitPatternSolver();
  private readonly fish = new FishSolver();

  private candidates: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  private candDirty = true;

  constructor(public board: Board) {}

  setBoard(board: Board): void {
    this.board = board;
    this.candDirty = true;
  }

  /** Per-digit position sets: candidates[d] = cells where digit d is still a candidate. */
  getCandidates(): CellSet[] {
    if (this.candDirty) {
      for (let d = 1; d <= 9; d++) this.candidates[d]!.clear();
      for (let i = 0; i < LENGTH; i++) {
        for (const d of candidatesOf(this.board.cells[i]!)) this.candidates[d]!.add(i);
      }
      this.candDirty = false;
    }
    return this.candidates;
  }

  getStep(type: SolutionType): SolutionStep | null {
    if (SIMPLE_TYPES.has(type)) return this.simple.getStep(this.board, type);
    if (WING_TYPES.has(type)) return this.wing.getStep(this, type);
    if (SDP_TYPES.has(type)) return this.sdp.getStep(this, type);
    if (BASIC_FISH_TYPES.has(type)) return this.fish.getStep(this, type);
    if (type === "BRUTE_FORCE") return this.getBruteForce();
    if (type === "GIVE_UP") return getGiveUpStep();
    return null;
  }

  /** All instances of `type` in the current grid (for the all-steps / summarize API). */
  findAll(type: SolutionType): SolutionStep[] {
    if (SIMPLE_TYPES.has(type)) return this.simple.findAll(this.board, type);
    if (WING_TYPES.has(type)) return this.wing.findAll(this, type);
    if (SDP_TYPES.has(type)) return this.sdp.findAll(this, type);
    if (BASIC_FISH_TYPES.has(type)) return this.fish.findAll(this, type);
    return [];
  }

  doStep(step: SolutionStep): void {
    applyStep(this.board, step);
    this.candDirty = true;
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
