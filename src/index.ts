/**
 * hodoku-ts — TypeScript port of the HoDoKu Sudoku generator and human-style
 * solver/hint engine.
 *
 * The high-level facade (generate / hint / solve / summarize / listTechniques)
 * is added as the solver and generator phases land. Core data types are exported
 * now for advanced use.
 */

export const VERSION = "0.0.0";

// Primary facade: generation, hints, solution path, technique summary.
export {
  generate,
  hint,
  solve,
  rate,
  countSolutions,
  summarize,
  listTechniques,
  type BoardInput,
  type Hint,
  type CellRef,
  type SolvePathResult,
  type TechniqueSummaryEntry,
  type TechniqueInfo,
  type GeneratedPuzzleResult,
  type GenerateOptions,
} from "./api.js";

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

export { SudokuSolver, type SolveResult, type SolveOptions } from "./solver/solver.js";
export { StepFinder } from "./solver/step-finder.js";
export { validSolution } from "./solver/brute-force.js";
export {
  generateFullGrid,
  generateSudoku,
  removeClues,
  type Rng,
  type GeneratedGrid,
} from "./generator/generator.js";
export {
  generateByDifficulty,
  generateRated,
  type GeneratedPuzzle,
  type GenerateByDifficultyOptions,
} from "./generator/generate-by-difficulty.js";
