/*
 * Port of DifficultyType, SolutionCategory and StepConfig from HoDoKu.
 * StepConfig drives both solver order and puzzle rating.
 */

import type { SolutionType } from "./solution-type.js";

/** Ordinals match Java DifficultyType (INCOMPLETE = 0 … EXTREME = 5). */
export enum DifficultyType {
  INCOMPLETE = 0,
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
  UNFAIR = 4,
  EXTREME = 5,
}

/** Ordinals match Java SolutionCategory declaration order. */
export enum SolutionCategory {
  SINGLES = 0,
  INTERSECTIONS = 1,
  SUBSETS = 2,
  BASIC_FISH = 3,
  FINNED_BASIC_FISH = 4,
  FRANKEN_FISH = 5,
  FINNED_FRANKEN_FISH = 6,
  MUTANT_FISH = 7,
  FINNED_MUTANT_FISH = 8,
  SINGLE_DIGIT_PATTERNS = 9,
  COLORING = 10,
  UNIQUENESS = 11,
  CHAINS_AND_LOOPS = 12,
  WINGS = 13,
  ALMOST_LOCKED_SETS = 14,
  ENUMERATIONS = 15,
  MISCELLANEOUS = 16,
  LAST_RESORT = 17,
}

export const CATEGORY_NAMES: Record<SolutionCategory, string> = {
  [SolutionCategory.SINGLES]: "Singles",
  [SolutionCategory.INTERSECTIONS]: "Intersections",
  [SolutionCategory.SUBSETS]: "Subsets",
  [SolutionCategory.BASIC_FISH]: "Basic Fish",
  [SolutionCategory.FINNED_BASIC_FISH]: "(Sashimi) Finned Fish",
  [SolutionCategory.FRANKEN_FISH]: "Franken Fish",
  [SolutionCategory.FINNED_FRANKEN_FISH]: "Finned Franken Fish",
  [SolutionCategory.MUTANT_FISH]: "Mutant Fish",
  [SolutionCategory.FINNED_MUTANT_FISH]: "Finned Mutant Fish",
  [SolutionCategory.SINGLE_DIGIT_PATTERNS]: "Single Digit Patterns",
  [SolutionCategory.COLORING]: "Coloring",
  [SolutionCategory.UNIQUENESS]: "Uniqueness",
  [SolutionCategory.CHAINS_AND_LOOPS]: "Chains and Loops",
  [SolutionCategory.WINGS]: "Wings",
  [SolutionCategory.ALMOST_LOCKED_SETS]: "Almost Locked Sets",
  [SolutionCategory.ENUMERATIONS]: "Enumerations",
  [SolutionCategory.MISCELLANEOUS]: "Miscellaneous",
  [SolutionCategory.LAST_RESORT]: "Last Resort",
};

export interface StepConfig {
  /** Search order when solving (lower = tried earlier). */
  index: number;
  type: SolutionType;
  /** DifficultyType ordinal this technique requires. */
  level: number;
  category: SolutionCategory;
  /** Points added to the puzzle score per instance. */
  baseScore: number;
  adminScore: number;
  enabled: boolean;
  allStepsEnabled: boolean;
  indexProgress: number;
  enabledProgress: boolean;
  enabledTraining: boolean;
}

export function makeStepConfig(
  index: number,
  type: SolutionType,
  level: number,
  category: SolutionCategory,
  baseScore: number,
  adminScore: number,
  enabled: boolean,
  allStepsEnabled: boolean,
  indexProgress: number,
  enabledProgress: boolean,
  enabledTraining: boolean,
): StepConfig {
  return {
    index,
    type,
    level,
    category,
    baseScore,
    adminScore,
    enabled,
    allStepsEnabled,
    indexProgress,
    enabledProgress,
    enabledTraining,
  };
}
