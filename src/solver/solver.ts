/*
 * Top-level solver, ported from SudokuSolver. `getHint` returns the next step
 * (easiest enabled technique first). `solve` repeatedly applies hints,
 * accumulating the score and escalating the difficulty level exactly as HoDoKu
 * does, then classifies the puzzle.
 */

import type { Board } from "../core/board.js";
import type { DifficultyLevel } from "../core/difficulty.js";
import type { SolutionStep } from "../core/solution-step.js";
import { isSingle } from "../core/solution-type.js";
import type { StepConfig } from "../core/step-config.js";
import { DifficultyType } from "../core/step-config.js";
import { DEFAULT_DIFFICULTY_LEVELS, SOLVER_STEPS_SORTED } from "../config/defaults.js";
import { StepFinder } from "./step-finder.js";

export interface Hint {
  step: SolutionStep;
  config: StepConfig;
}

export interface SolveResult {
  solved: boolean;
  score: number;
  level: DifficultyLevel;
  /** Generation acceptance: solved, within maxLevel, and (if requested) not too easy. */
  accepted: boolean;
  steps: SolutionStep[];
  configs: StepConfig[];
  board: Board;
}

export interface SolveOptions {
  /** Highest difficulty to attempt; harder steps abort the solve. Default EXTREME. */
  maxLevel?: DifficultyType;
  /** Only try singles. */
  singlesOnly?: boolean;
  /** Solver steps to use (default = sorted DEFAULT_SOLVER_STEPS). */
  steps?: readonly StepConfig[];
  /** Reject puzzles whose score is below the previous level's ceiling (generation). */
  rejectTooLowScore?: boolean;
}

const LEVELS = DEFAULT_DIFFICULTY_LEVELS;

export class SudokuSolver {
  private readonly finder: StepFinder;

  constructor(board?: Board) {
    this.finder = new StepFinder(board ?? (undefined as unknown as Board));
  }

  get stepFinder(): StepFinder {
    return this.finder;
  }

  /**
   * Returns the next logical step for `board` without mutating it, or null if no
   * enabled technique applies. Used by the public hint() API.
   */
  getHint(board: Board, opts: SolveOptions = {}): Hint | null {
    const work = board.clone();
    this.finder.setBoard(work);
    if (work.isSolved()) return null;
    const steps = opts.steps ?? SOLVER_STEPS_SORTED;
    const singlesOnly = opts.singlesOnly ?? false;
    for (const cfg of steps) {
      if (!cfg.enabled) continue;
      if (singlesOnly && !isSingle(cfg.type)) continue;
      const step = this.finder.getStep(cfg.type);
      if (step) return { step, config: cfg };
    }
    return null;
  }

  /**
   * Solves a clone of `board`, accumulating score and difficulty level. Returns
   * the full step list, final score/level and whether the puzzle was solved.
   */
  solve(board: Board, opts: SolveOptions = {}): SolveResult {
    const work = board.clone();
    this.finder.setBoard(work);
    const steps = opts.steps ?? SOLVER_STEPS_SORTED;
    const singlesOnly = opts.singlesOnly ?? false;
    const maxLevel = LEVELS[opts.maxLevel ?? DifficultyType.EXTREME]!;

    let score = 0;
    let level = LEVELS[DifficultyType.EASY]!;
    const usedSteps: SolutionStep[] = [];
    const usedConfigs: StepConfig[] = [];

    while (!work.isSolved()) {
      let found: SolutionStep | null = null;
      let foundCfg: StepConfig | null = null;
      let aborted = false;
      for (const cfg of steps) {
        if (!cfg.enabled) continue;
        if (singlesOnly && !isSingle(cfg.type)) continue;
        const step = this.finder.getStep(cfg.type);
        if (step) {
          score += cfg.baseScore;
          const stepLevel = LEVELS[cfg.level]!;
          if (stepLevel.ordinal > level.ordinal) level = stepLevel;
          if (level.ordinal > maxLevel.ordinal || score >= maxLevel.maxScore) {
            aborted = true;
          } else {
            found = step;
            foundCfg = cfg;
          }
          break;
        }
      }
      if (aborted || !found || !foundCfg) break;
      usedSteps.push(found);
      usedConfigs.push(foundCfg);
      this.finder.doStep(found);
      if (found.type === "GIVE_UP") break;
    }

    while (score > level.maxScore && level.ordinal < DifficultyType.EXTREME) {
      level = LEVELS[level.ordinal + 1]!;
    }

    const solved = work.isSolved();
    let accepted = solved && level.ordinal <= maxLevel.ordinal;
    if (
      accepted &&
      opts.rejectTooLowScore &&
      level.ordinal > DifficultyType.EASY &&
      score < LEVELS[level.ordinal - 1]!.maxScore
    ) {
      accepted = false;
    }

    return {
      solved,
      score,
      level,
      accepted,
      steps: usedSteps,
      configs: usedConfigs,
      board: work,
    };
  }

  /** Rates a puzzle: full solve with EXTREME ceiling, returns score + level. */
  rate(board: Board): { score: number; level: DifficultyLevel; solved: boolean } {
    const r = this.solve(board);
    return { score: r.score, level: r.level, solved: r.solved };
  }
}
