/*
 * Dispatches a SolutionType to the solver that handles it and applies steps.
 * Currently wires Simple, BruteForce and GiveUp; the intermediate/advanced
 * solvers register here in later phases.
 */

import type { Board } from "../core/board.js";
import { candidatesOf } from "../core/candidates.js";
import { isFish } from "../config/defaults.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { BUDDIES, LENGTH } from "../core/tables.js";
import { applyStep } from "./apply-step.js";
import { validSolution } from "./brute-force.js";
import { AlsSolver } from "./als.js";
import { ChainsSolver } from "./chains.js";
import { ColoringSolver } from "./coloring.js";
import { FishSolver } from "./fish.js";
import { getGiveUpStep } from "./give-up.js";
import { MiscSolver } from "./misc.js";
import { SimpleSolver } from "./simple.js";
import { SingleDigitPatternSolver } from "./single-digit-pattern.js";
import { TablingChainsSolver } from "./tabling-chains.js";
import { TemplateSolver } from "./template.js";
import { UniquenessSolver } from "./uniqueness.js";
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

const SDP_TYPES = new Set<SolutionType>([
  "SKYSCRAPER",
  "TWO_STRING_KITE",
  "EMPTY_RECTANGLE",
  "DUAL_TWO_STRING_KITE",
  "DUAL_EMPTY_RECTANGLE",
]);


const COLORING_TYPES = new Set<SolutionType>([
  "SIMPLE_COLORS",
  "SIMPLE_COLORS_TRAP",
  "SIMPLE_COLORS_WRAP",
  "MULTI_COLORS",
  "MULTI_COLORS_1",
  "MULTI_COLORS_2",
]);

const CHAIN_TYPES = new Set<SolutionType>([
  "X_CHAIN",
  "XY_CHAIN",
  "TURBOT_FISH",
  "REMOTE_PAIR",
]);

// Plain Nice-Loops / AIC use the faithful Trebor-tables engine (byte-exact).
const NICE_LOOP_EXACT = new Set<SolutionType>([
  "NICE_LOOP",
  "CONTINUOUS_NICE_LOOP",
  "DISCONTINUOUS_NICE_LOOP",
  "AIC",
]);

// Grouped nice loops / AIC use the faithful Trebor-tables engine with group nodes.
const GROUPED_NICE_LOOP_EXACT = new Set<SolutionType>([
  "GROUPED_NICE_LOOP",
  "GROUPED_CONTINUOUS_NICE_LOOP",
  "GROUPED_DISCONTINUOUS_NICE_LOOP",
  "GROUPED_AIC",
]);

// Forcing CHAINS use the faithful Trebor-tables engine (contradiction + verity).
const FORCING_CHAIN_EXACT = new Set<SolutionType>([
  "FORCING_CHAIN",
  "FORCING_CHAIN_CONTRADICTION",
  "FORCING_CHAIN_VERITY",
]);

// Forcing NETS use the faithful Trebor-tables engine (net premise tables).
const FORCING_NET_EXACT = new Set<SolutionType>([
  "FORCING_NET",
  "FORCING_NET_CONTRADICTION",
  "FORCING_NET_VERITY",
]);

const UNIQUENESS_TYPES = new Set<SolutionType>([
  "UNIQUENESS_1",
  "UNIQUENESS_2",
  "UNIQUENESS_3",
  "UNIQUENESS_4",
  "UNIQUENESS_5",
  "UNIQUENESS_6",
  "HIDDEN_RECTANGLE",
  "AVOIDABLE_RECTANGLE_1",
  "AVOIDABLE_RECTANGLE_2",
  "BUG_PLUS_1",
]);

export class StepFinder {
  private readonly simple = new SimpleSolver();
  private readonly wing = new WingSolver();
  private readonly sdp = new SingleDigitPatternSolver();
  private readonly fish = new FishSolver();
  private readonly coloring = new ColoringSolver();
  private readonly uniqueness = new UniquenessSolver();
  private readonly chains = new ChainsSolver();
  private readonly misc = new MiscSolver();
  private readonly als = new AlsSolver();
  private readonly template = new TemplateSolver();
  private readonly tablingChains = new TablingChainsSolver();

  private candidates: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  private candDirty = true;
  private allowed: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  private allowedDirty = true;

  constructor(public board: Board) {}

  setBoard(board: Board): void {
    this.board = board;
    this.candDirty = true;
    this.allowedDirty = true;
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

  /** Set of all unsolved cells. */
  getEmptyCells(): CellSet {
    const s = new CellSet();
    for (let i = 0; i < LENGTH; i++) if (this.board.values[i] === 0) s.add(i);
    return s;
  }

  /** Per-digit sets of cells already SET to that digit (solved placements). */
  getPositions(): CellSet[] {
    const pos: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
    for (let i = 0; i < LENGTH; i++) {
      const v = this.board.values[i]!;
      if (v !== 0) pos[v]!.add(i);
    }
    return pos;
  }

  /** Per-digit sets of cells where the digit is a valid placement (even if not pencilled). */
  getCandidatesAllowed(): CellSet[] {
    if (this.allowedDirty) {
      const empty = new CellSet();
      empty.setAll();
      for (let d = 1; d <= 9; d++) this.allowed[d]!.setAll();
      for (let i = 0; i < LENGTH; i++) {
        const v = this.board.values[i]!;
        if (v !== 0) {
          this.allowed[v]!.andNot(BUDDIES[i]!);
          empty.remove(i);
        }
      }
      for (let d = 1; d <= 9; d++) this.allowed[d]!.and(empty);
      this.allowedDirty = false;
    }
    return this.allowed;
  }

  getStep(type: SolutionType): SolutionStep | null {
    if (SIMPLE_TYPES.has(type)) return this.simple.getStep(this.board, type);
    if (WING_TYPES.has(type)) return this.wing.getStep(this, type);
    if (SDP_TYPES.has(type)) return this.sdp.getStep(this, type);
    if (type === "KRAKEN_FISH" || type === "KRAKEN_FISH_TYPE_1" || type === "KRAKEN_FISH_TYPE_2") {
      const all = this.fish.getKrakenFishes(this);
      return all.find((s) => s.type === type) ?? all[0] ?? null;
    }
    if (isFish(type)) return this.fish.getStep(this, type);
    if (COLORING_TYPES.has(type)) return this.coloring.getStep(this, type);
    if (UNIQUENESS_TYPES.has(type)) return this.uniqueness.getStep(this, type);
    if (CHAIN_TYPES.has(type)) return this.chains.getStep(this, type);
    if (type === "SUE_DE_COQ") return this.misc.getStep(this, type);
    if (type === "ALS_XZ" || type === "ALS_XY_WING" || type === "ALS_XY_CHAIN" || type === "DEATH_BLOSSOM") return this.als.getStep(this, type);
    if (type === "TEMPLATE_SET" || type === "TEMPLATE_DEL") return this.template.getStep(this, type);
    if (NICE_LOOP_EXACT.has(type)) return this.tablingChains.getStep(this, type);
    if (GROUPED_NICE_LOOP_EXACT.has(type)) return this.tablingChains.getStep(this, type);
    if (FORCING_CHAIN_EXACT.has(type)) {
      const all = this.tablingChains.getForcingChains(this, false);
      return all.find((s) => s.type === type) ?? all[0] ?? null;
    }
    if (FORCING_NET_EXACT.has(type)) {
      const all = this.tablingChains.getForcingNets(this, false);
      return all.find((s) => s.type === type) ?? all[0] ?? null;
    }
    if (type === "BRUTE_FORCE") return this.getBruteForce();
    if (type === "GIVE_UP") return getGiveUpStep();
    return null;
  }

  /** All instances of `type` in the current grid (for the all-steps / summarize API). */
  findAll(type: SolutionType): SolutionStep[] {
    if (SIMPLE_TYPES.has(type)) return this.simple.findAll(this.board, type);
    if (WING_TYPES.has(type)) return this.wing.findAll(this, type);
    if (SDP_TYPES.has(type)) return this.sdp.findAll(this, type);
    if (type === "KRAKEN_FISH" || type === "KRAKEN_FISH_TYPE_1" || type === "KRAKEN_FISH_TYPE_2") {
      return this.fish.getKrakenFishes(this).filter((s) => s.type === type);
    }
    if (isFish(type)) return this.fish.findAll(this, type);
    if (COLORING_TYPES.has(type)) return this.coloring.findAll(this, type);
    if (UNIQUENESS_TYPES.has(type)) return this.uniqueness.findAll(this, type);
    if (CHAIN_TYPES.has(type)) return this.chains.findAll(this, type);
    if (type === "SUE_DE_COQ") return this.misc.findAll(this, type);
    if (type === "ALS_XZ" || type === "ALS_XY_WING" || type === "ALS_XY_CHAIN" || type === "DEATH_BLOSSOM") return this.als.findAll(this, type);
    if (type === "TEMPLATE_SET" || type === "TEMPLATE_DEL") return this.template.findAll(this, type);
    if (NICE_LOOP_EXACT.has(type)) return this.tablingChains.findAll(this, type);
    if (GROUPED_NICE_LOOP_EXACT.has(type)) return this.tablingChains.findAll(this, type);
    if (FORCING_CHAIN_EXACT.has(type)) {
      return this.tablingChains.getForcingChains(this).filter((s) => s.type === type);
    }
    if (FORCING_NET_EXACT.has(type)) {
      return this.tablingChains.getForcingNets(this).filter((s) => s.type === type);
    }
    return [];
  }

  doStep(step: SolutionStep): void {
    applyStep(this.board, step);
    this.candDirty = true;
    this.allowedDirty = true;
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
