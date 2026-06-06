/*
 * Public, ergonomic facade over the engine. Exposes the four capabilities the
 * library targets: puzzle generation, next-move hints, a technique summary, and
 * the full solution path — plus rating and uniqueness helpers.
 */

import { Board } from "./core/board.js";
import { type Candidate } from "./core/candidate.js";
import { type Difficulty, DIFFICULTY_NAMES } from "./core/difficulty.js";
import { SolutionStep } from "./core/solution-step.js";
import { type SolutionType, typeName } from "./core/solution-type.js";
import { CATEGORY_NAMES, DifficultyType } from "./core/step-config.js";
import { SOLVER_STEPS_SORTED, getStepConfig } from "./config/defaults.js";
import { countSolutions as countSolutionsInternal } from "./solver/brute-force.js";
import { SudokuSolver } from "./solver/solver.js";
import {
  type GenerateByDifficultyOptions,
  generateByDifficulty,
  generateRated,
} from "./generator/generate-by-difficulty.js";

/** Anything that can be turned into a board: an 81-char string, a value array, or a Board. */
export type BoardInput = string | ArrayLike<number> | Board;

export interface CellRef {
  index: number;
  row: number;
  col: number;
  value: number;
}

export interface Hint {
  technique: SolutionType;
  name: string;
  difficulty: Difficulty;
  /** baseScore of the technique (its contribution to the puzzle score). */
  score: number;
  /** Cells the step places a value into (singles / full house / brute force). */
  placements: CellRef[];
  /** Candidates the step eliminates. */
  eliminations: CellRef[];
  /** Human-readable one-line description. */
  explanation: string;
  /** The underlying step for advanced consumers. */
  raw: SolutionStep;
}

export interface SolvePathResult {
  solved: boolean;
  score: number;
  difficulty: Difficulty;
  steps: Hint[];
}

export interface TechniqueSummaryEntry {
  technique: SolutionType;
  name: string;
  count: number;
  totalScore: number;
}

export interface TechniqueInfo {
  technique: SolutionType;
  name: string;
  category: string;
  difficulty: Difficulty;
  baseScore: number;
  enabled: boolean;
}

export interface GeneratedPuzzleResult {
  /** Givens as an 81-char string ('.' = empty). */
  givens: string;
  /** Full solution as an 81-char string. */
  solution: string;
  score: number;
  difficulty: Difficulty;
  clues: number;
}

export interface GenerateOptions extends GenerateByDifficultyOptions {
  difficulty?: Difficulty;
}

function toBoard(input: BoardInput): Board {
  if (input instanceof Board) return input.clone();
  if (typeof input === "string") return Board.fromString(input);
  return Board.fromValues(input, true);
}

function cellRef(index: number, value: number): CellRef {
  return { index, row: (index / 9) | 0, col: index % 9, value };
}

function cellName(index: number): string {
  return `r${((index / 9) | 0) + 1}c${(index % 9) + 1}`;
}

function explain(step: SolutionStep): string {
  const name = typeName(step.type);
  if (step.indices.length > 0 && step.values.length > 0 && step.candidatesToDelete.length === 0) {
    return `${name}: ${cellName(step.indices[0]!)}=${step.values[0]}`;
  }
  if (step.candidatesToDelete.length > 0) {
    const elims = step.candidatesToDelete
      .map((c) => `${cellName(c.index)}<>${c.value}`)
      .join(", ");
    return `${name}: ${elims}`;
  }
  return name;
}

function toHint(step: SolutionStep): Hint {
  const config = getStepConfig(step.type);
  const isPlacement = step.candidatesToDelete.length === 0 && step.values.length > 0;
  const placements: CellRef[] = isPlacement
    ? step.indices.slice(0, 1).map((idx) => cellRef(idx, step.values[0]!))
    : [];
  const eliminations: CellRef[] = step.candidatesToDelete.map((c: Candidate) =>
    cellRef(c.index, c.value),
  );
  const levelOrdinal = config ? config.level : DifficultyType.EXTREME;
  return {
    technique: step.type,
    name: typeName(step.type),
    difficulty: DIFFICULTY_NAMES[levelOrdinal as DifficultyType],
    score: config ? config.baseScore : 0,
    placements,
    eliminations,
    explanation: explain(step),
    raw: step,
  };
}

/** Generates a puzzle. With `difficulty`, targets that level; otherwise returns a random rated puzzle. */
export function generate(opts: GenerateOptions = {}): GeneratedPuzzleResult | null {
  const puzzle = opts.difficulty
    ? generateByDifficulty(opts.difficulty, opts)
    : generateRated(opts);
  if (!puzzle) return null;
  const givens = valuesToString(puzzle.givens);
  return {
    givens,
    solution: valuesToString(puzzle.solution),
    score: puzzle.score,
    difficulty: puzzle.difficulty,
    clues: [...puzzle.givens].filter((v) => v !== 0).length,
  };
}

/** Returns the next logical move for `board`, or null if none/solved. Does not mutate input. */
export function hint(board: BoardInput): Hint | null {
  const result = new SudokuSolver().getHint(toBoard(board));
  return result ? toHint(result.step) : null;
}

/** Solves `board`, returning the ordered list of human steps plus the final rating. */
export function solve(board: BoardInput): SolvePathResult {
  const r = new SudokuSolver().solve(toBoard(board));
  return {
    solved: r.solved,
    score: r.score,
    difficulty: r.level.name.toLowerCase() as Difficulty,
    steps: r.steps.map(toHint),
  };
}

/** Rates a puzzle: full solve, returns score + difficulty. */
export function rate(board: BoardInput): { score: number; difficulty: Difficulty; solved: boolean } {
  const r = new SudokuSolver().rate(toBoard(board));
  return { score: r.score, difficulty: r.level.name.toLowerCase() as Difficulty, solved: r.solved };
}

/** Counts solutions up to `max` (default 2): 0 invalid, 1 unique, >=2 multiple. */
export function countSolutions(board: BoardInput, max = 2): number {
  return countSolutionsInternal(toBoard(board), max);
}

/** Per-technique usage summary for a full solve of `board`. */
export function summarize(board: BoardInput): TechniqueSummaryEntry[] {
  const { steps } = solve(board);
  const byType = new Map<SolutionType, TechniqueSummaryEntry>();
  for (const s of steps) {
    const e = byType.get(s.technique);
    if (e) {
      e.count++;
      e.totalScore += s.score;
    } else {
      byType.set(s.technique, {
        technique: s.technique,
        name: s.name,
        count: 1,
        totalScore: s.score,
      });
    }
  }
  return [...byType.values()];
}

/** The technique catalog (sorted by solver attempt order). */
export function listTechniques(): TechniqueInfo[] {
  return SOLVER_STEPS_SORTED.map((cfg) => ({
    technique: cfg.type,
    name: typeName(cfg.type),
    category: CATEGORY_NAMES[cfg.category],
    difficulty: DIFFICULTY_NAMES[cfg.level as DifficultyType],
    baseScore: cfg.baseScore,
    enabled: cfg.enabled,
  }));
}

function valuesToString(values: ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < 81; i++) s += values[i] === 0 ? "." : String(values[i]);
  return s;
}
