/**
 * hodoku-ts — TypeScript port of the HoDoKu Sudoku generator and human-style
 * solver/hint engine.
 *
 * The high-level facade (generate / hint / solve / summarize / listTechniques)
 * is added as the solver and generator phases land. Core data types are exported
 * now for advanced use.
 */

export const VERSION = "0.0.0";

export { CellSet } from "./core/cell-set.js";
export { Board } from "./core/board.js";
export {
  type SolutionType,
  SOLUTION_TYPE_META,
  SOLUTION_TYPES,
  typeName,
  libraryType,
  argName,
} from "./core/solution-type.js";
export { SolutionStep } from "./core/solution-step.js";
export { Chain } from "./core/chain.js";
export { type Candidate } from "./core/candidate.js";
export {
  type Difficulty,
  type DifficultyLevel,
  DIFFICULTY_NAMES,
  difficultyOf,
} from "./core/difficulty.js";
export {
  type StepConfig,
  DifficultyType,
  SolutionCategory,
  CATEGORY_NAMES,
} from "./core/step-config.js";
export {
  DEFAULT_DIFFICULTY_LEVELS,
  DEFAULT_SOLVER_STEPS,
  SOLVER_STEPS_SORTED,
  getStepConfig,
  categoryOf,
  isFish,
} from "./config/defaults.js";
