/*
 * Verbatim port of HoDoKu's Options defaults: DEFAULT_DIFFICULTY_LEVELS and
 * DEFAULT_SOLVER_STEPS. These drive exact rating parity, so values must not be
 * changed. Also hosts category-dependent SolutionType predicates (isFish, …),
 * since StepConfig is the source of a technique's category.
 */

import type { DifficultyLevel } from "../core/difficulty.js";
import { type StepConfig, DifficultyType, SolutionCategory, makeStepConfig as S } from "../core/step-config.js";
import type { SolutionType } from "../core/solution-type.js";

const MAX_INT = 2147483647;
const I = DifficultyType.INCOMPLETE;
const E = DifficultyType.EASY;
const M = DifficultyType.MEDIUM;
const H = DifficultyType.HARD;
const U = DifficultyType.UNFAIR;
const X = DifficultyType.EXTREME;
const C = SolutionCategory;

export const DEFAULT_DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [
  { type: I, ordinal: 0, maxScore: 0, name: "Incomplete" },
  { type: E, ordinal: 1, maxScore: 800, name: "Easy" },
  { type: M, ordinal: 2, maxScore: 1000, name: "Medium" },
  { type: H, ordinal: 3, maxScore: 1600, name: "Hard" },
  { type: U, ordinal: 4, maxScore: 1800, name: "Unfair" },
  { type: X, ordinal: 5, maxScore: MAX_INT, name: "Extreme" },
];

/** Solver steps in declaration order (as in Options.DEFAULT_SOLVER_STEPS). */
export const DEFAULT_SOLVER_STEPS: readonly StepConfig[] = [
  S(MAX_INT - 1, "INCOMPLETE", I, C.LAST_RESORT, 0, 0, false, false, MAX_INT - 1, false, false),
  S(MAX_INT, "GIVE_UP", X, C.LAST_RESORT, 20000, 0, true, false, MAX_INT, true, false),
  S(100, "FULL_HOUSE", E, C.SINGLES, 4, 0, true, true, 100, true, false),
  S(200, "NAKED_SINGLE", E, C.SINGLES, 4, 0, true, true, 200, true, false),
  S(300, "HIDDEN_SINGLE", E, C.SINGLES, 14, 0, true, true, 300, true, false),
  S(1000, "LOCKED_PAIR", M, C.INTERSECTIONS, 40, 0, true, true, 1000, true, false),
  S(1100, "LOCKED_TRIPLE", M, C.INTERSECTIONS, 60, 0, true, true, 1100, true, false),
  S(1200, "LOCKED_CANDIDATES_1", M, C.INTERSECTIONS, 50, 0, true, true, 1200, true, false),
  S(1300, "NAKED_PAIR", M, C.SUBSETS, 60, 0, true, true, 1300, true, false),
  S(1400, "NAKED_TRIPLE", M, C.SUBSETS, 80, 0, true, true, 1400, true, false),
  S(1500, "HIDDEN_PAIR", M, C.SUBSETS, 70, 0, true, true, 1500, true, false),
  S(1600, "HIDDEN_TRIPLE", M, C.SUBSETS, 100, 0, true, true, 1600, true, false),
  S(2000, "NAKED_QUADRUPLE", H, C.SUBSETS, 120, 0, true, true, 2000, true, false),
  S(2100, "HIDDEN_QUADRUPLE", H, C.SUBSETS, 150, 0, true, true, 2100, true, false),
  S(2200, "X_WING", H, C.BASIC_FISH, 140, 0, true, false, 2200, false, false),
  S(2300, "SWORDFISH", H, C.BASIC_FISH, 150, 0, true, false, 2300, false, false),
  S(2400, "JELLYFISH", H, C.BASIC_FISH, 160, 0, true, false, 2400, false, false),
  S(2500, "SQUIRMBAG", U, C.BASIC_FISH, 470, 0, false, false, 2500, false, false),
  S(2600, "WHALE", U, C.BASIC_FISH, 470, 0, false, false, 2600, false, false),
  S(2700, "LEVIATHAN", U, C.BASIC_FISH, 470, 0, false, false, 2700, false, false),
  S(2800, "REMOTE_PAIR", H, C.CHAINS_AND_LOOPS, 110, 0, true, true, 2800, false, false),
  S(2900, "BUG_PLUS_1", H, C.UNIQUENESS, 100, 0, true, true, 2900, false, false),
  S(3000, "SKYSCRAPER", H, C.SINGLE_DIGIT_PATTERNS, 130, 0, true, true, 3000, false, false),
  S(3200, "W_WING", H, C.WINGS, 150, 0, true, true, 3200, false, false),
  S(3100, "TWO_STRING_KITE", H, C.SINGLE_DIGIT_PATTERNS, 150, 0, true, true, 3100, false, false),
  S(3300, "XY_WING", H, C.WINGS, 160, 0, true, true, 3300, false, false),
  S(3400, "XYZ_WING", H, C.WINGS, 180, 0, true, true, 3400, false, false),
  S(3500, "UNIQUENESS_1", H, C.UNIQUENESS, 100, 0, true, true, 3500, false, false),
  S(3600, "UNIQUENESS_2", H, C.UNIQUENESS, 100, 0, true, true, 3600, false, false),
  S(3700, "UNIQUENESS_3", H, C.UNIQUENESS, 100, 0, true, true, 3700, false, false),
  S(3800, "UNIQUENESS_4", H, C.UNIQUENESS, 100, 0, true, true, 3800, false, false),
  S(3900, "UNIQUENESS_5", H, C.UNIQUENESS, 100, 0, true, true, 3900, false, false),
  S(4000, "UNIQUENESS_6", H, C.UNIQUENESS, 100, 0, true, true, 4000, false, false),
  S(4100, "FINNED_X_WING", H, C.FINNED_BASIC_FISH, 130, 0, true, false, 4100, false, false),
  S(4200, "SASHIMI_X_WING", H, C.FINNED_BASIC_FISH, 150, 0, true, false, 4200, false, false),
  S(4300, "FINNED_SWORDFISH", U, C.FINNED_BASIC_FISH, 200, 0, true, false, 4300, false, false),
  S(4400, "SASHIMI_SWORDFISH", U, C.FINNED_BASIC_FISH, 240, 0, true, false, 4400, false, false),
  S(4500, "FINNED_JELLYFISH", U, C.FINNED_BASIC_FISH, 250, 0, true, false, 4500, false, false),
  S(4600, "SASHIMI_JELLYFISH", U, C.FINNED_BASIC_FISH, 260, 0, true, false, 4600, false, false),
  S(4700, "FINNED_SQUIRMBAG", U, C.FINNED_BASIC_FISH, 470, 0, false, false, 4700, false, false),
  S(4800, "SASHIMI_SQUIRMBAG", U, C.FINNED_BASIC_FISH, 470, 0, false, false, 4800, false, false),
  S(4900, "FINNED_WHALE", U, C.FINNED_BASIC_FISH, 470, 0, false, false, 4900, false, false),
  S(5000, "SASHIMI_WHALE", U, C.FINNED_BASIC_FISH, 470, 0, false, false, 5000, false, false),
  S(5100, "FINNED_LEVIATHAN", U, C.FINNED_BASIC_FISH, 470, 0, false, false, 5100, false, false),
  S(5200, "SASHIMI_LEVIATHAN", U, C.FINNED_BASIC_FISH, 470, 0, false, false, 5200, false, false),
  S(5300, "SUE_DE_COQ", U, C.MISCELLANEOUS, 250, 0, true, true, 5300, false, false),
  S(5400, "X_CHAIN", U, C.CHAINS_AND_LOOPS, 260, 0, true, true, 5400, false, false),
  S(5500, "XY_CHAIN", U, C.CHAINS_AND_LOOPS, 260, 0, true, true, 5500, false, false),
  S(5600, "NICE_LOOP", U, C.CHAINS_AND_LOOPS, 280, 0, true, true, 5600, false, false),
  S(5700, "ALS_XZ", U, C.ALMOST_LOCKED_SETS, 300, 0, true, true, 5700, false, false),
  S(5800, "ALS_XY_WING", U, C.ALMOST_LOCKED_SETS, 320, 0, true, true, 5800, false, false),
  S(5900, "ALS_XY_CHAIN", U, C.ALMOST_LOCKED_SETS, 340, 0, true, true, 5900, false, false),
  S(6000, "DEATH_BLOSSOM", U, C.ALMOST_LOCKED_SETS, 360, 0, false, true, 6000, false, false),
  S(6100, "FRANKEN_X_WING", U, C.FRANKEN_FISH, 300, 0, true, false, 6100, false, false),
  S(6200, "FRANKEN_SWORDFISH", U, C.FRANKEN_FISH, 350, 0, true, false, 6200, false, false),
  S(6300, "FRANKEN_JELLYFISH", U, C.FRANKEN_FISH, 370, 0, false, false, 6300, false, false),
  S(6400, "FRANKEN_SQUIRMBAG", X, C.FRANKEN_FISH, 470, 0, false, false, 6400, false, false),
  S(6500, "FRANKEN_WHALE", X, C.FRANKEN_FISH, 470, 0, false, false, 6500, false, false),
  S(6600, "FRANKEN_LEVIATHAN", X, C.FRANKEN_FISH, 470, 0, false, false, 6600, false, false),
  S(6700, "FINNED_FRANKEN_X_WING", U, C.FINNED_FRANKEN_FISH, 390, 0, true, false, 6700, false, false),
  S(6800, "FINNED_FRANKEN_SWORDFISH", U, C.FINNED_FRANKEN_FISH, 410, 0, true, false, 6800, false, false),
  S(6900, "FINNED_FRANKEN_JELLYFISH", U, C.FINNED_FRANKEN_FISH, 430, 0, false, false, 6900, false, false),
  S(7000, "FINNED_FRANKEN_SQUIRMBAG", X, C.FINNED_FRANKEN_FISH, 470, 0, false, false, 7000, false, false),
  S(7100, "FINNED_FRANKEN_WHALE", X, C.FINNED_FRANKEN_FISH, 470, 0, false, false, 7100, false, false),
  S(7200, "FINNED_FRANKEN_LEVIATHAN", X, C.FINNED_FRANKEN_FISH, 470, 0, false, false, 7200, false, false),
  S(7300, "MUTANT_X_WING", X, C.MUTANT_FISH, 450, 0, false, false, 7300, false, false),
  S(7400, "MUTANT_SWORDFISH", X, C.MUTANT_FISH, 450, 0, false, false, 7400, false, false),
  S(7500, "MUTANT_JELLYFISH", X, C.MUTANT_FISH, 450, 0, false, false, 7500, false, false),
  S(7600, "MUTANT_SQUIRMBAG", X, C.MUTANT_FISH, 470, 0, false, false, 7600, false, false),
  S(7700, "MUTANT_WHALE", X, C.MUTANT_FISH, 470, 0, false, false, 7700, false, false),
  S(7800, "MUTANT_LEVIATHAN", X, C.MUTANT_FISH, 470, 0, false, false, 7800, false, false),
  S(7900, "FINNED_MUTANT_X_WING", X, C.FINNED_MUTANT_FISH, 470, 0, false, false, 7900, false, false),
  S(8000, "FINNED_MUTANT_SWORDFISH", X, C.FINNED_MUTANT_FISH, 470, 0, false, false, 8000, false, false),
  S(8100, "FINNED_MUTANT_JELLYFISH", X, C.FINNED_MUTANT_FISH, 470, 0, false, false, 8100, false, false),
  S(8200, "FINNED_MUTANT_SQUIRMBAG", X, C.FINNED_MUTANT_FISH, 470, 0, false, false, 8200, false, false),
  S(8300, "FINNED_MUTANT_WHALE", X, C.FINNED_MUTANT_FISH, 470, 0, false, false, 8300, false, false),
  S(8400, "FINNED_MUTANT_LEVIATHAN", X, C.FINNED_MUTANT_FISH, 470, 0, false, false, 8400, false, false),
  S(8700, "TEMPLATE_SET", X, C.LAST_RESORT, 10000, 0, false, false, 8700, false, false),
  S(8800, "TEMPLATE_DEL", X, C.LAST_RESORT, 10000, 0, false, false, 8800, false, false),
  S(8500, "FORCING_CHAIN", X, C.LAST_RESORT, 500, 0, true, false, 8500, false, false),
  S(8600, "FORCING_NET", X, C.LAST_RESORT, 700, 0, true, false, 8600, false, false),
  S(8900, "BRUTE_FORCE", X, C.LAST_RESORT, 10000, 0, true, false, 8900, false, false),
  S(5650, "GROUPED_NICE_LOOP", U, C.CHAINS_AND_LOOPS, 300, 0, true, true, 5650, false, false),
  S(3170, "EMPTY_RECTANGLE", H, C.SINGLE_DIGIT_PATTERNS, 120, 0, true, true, 3170, false, false),
  S(4010, "HIDDEN_RECTANGLE", H, C.UNIQUENESS, 100, 0, true, true, 4010, false, false),
  S(4020, "AVOIDABLE_RECTANGLE_1", H, C.UNIQUENESS, 100, 0, true, true, 4020, false, false),
  S(4030, "AVOIDABLE_RECTANGLE_2", H, C.UNIQUENESS, 100, 0, true, true, 4030, false, false),
  S(5330, "SIMPLE_COLORS", H, C.COLORING, 150, 0, true, true, 5330, false, false),
  S(5360, "MULTI_COLORS", H, C.COLORING, 200, 0, true, true, 5360, false, false),
  S(8450, "KRAKEN_FISH", X, C.LAST_RESORT, 500, 0, false, false, 8450, false, false),
  S(3120, "TURBOT_FISH", H, C.SINGLE_DIGIT_PATTERNS, 120, 0, true, true, 3120, false, false),
  S(1210, "LOCKED_CANDIDATES_2", M, C.INTERSECTIONS, 50, 0, true, true, 1210, true, false),
];

const BY_TYPE = new Map<SolutionType, StepConfig>();
for (const step of DEFAULT_SOLVER_STEPS) BY_TYPE.set(step.type, step);

/** Steps sorted by ascending `index` (the solver's easiest-first attempt order). */
export const SOLVER_STEPS_SORTED: readonly StepConfig[] = [...DEFAULT_SOLVER_STEPS].sort(
  (a, b) => a.index - b.index,
);

/**
 * Maps a SolutionType to the StepConfig that governs it, applying the same
 * normalization HoDoKu uses (variants share a base config).
 */
export function getStepConfig(type: SolutionType): StepConfig | undefined {
  let t: SolutionType = type;
  if (t === "CONTINUOUS_NICE_LOOP" || t === "DISCONTINUOUS_NICE_LOOP" || t === "AIC")
    t = "NICE_LOOP";
  else if (
    t === "GROUPED_CONTINUOUS_NICE_LOOP" ||
    t === "GROUPED_DISCONTINUOUS_NICE_LOOP" ||
    t === "GROUPED_AIC"
  )
    t = "GROUPED_NICE_LOOP";
  else if (t === "FORCING_CHAIN_CONTRADICTION" || t === "FORCING_CHAIN_VERITY") t = "FORCING_CHAIN";
  else if (t === "FORCING_NET_CONTRADICTION" || t === "FORCING_NET_VERITY") t = "FORCING_NET";
  else if (t === "KRAKEN_FISH_TYPE_1" || t === "KRAKEN_FISH_TYPE_2") t = "KRAKEN_FISH";
  else if (t === "DUAL_TWO_STRING_KITE") t = "TWO_STRING_KITE";
  else if (t === "DUAL_EMPTY_RECTANGLE") t = "EMPTY_RECTANGLE";
  else if (t === "SIMPLE_COLORS_TRAP" || t === "SIMPLE_COLORS_WRAP") t = "SIMPLE_COLORS";
  else if (t === "MULTI_COLORS_1" || t === "MULTI_COLORS_2") t = "MULTI_COLORS";
  return BY_TYPE.get(t);
}

export function categoryOf(type: SolutionType): SolutionCategory | undefined {
  return getStepConfig(type)?.category;
}

const FISH_CATEGORIES = new Set<SolutionCategory>([
  C.BASIC_FISH,
  C.FINNED_BASIC_FISH,
  C.FRANKEN_FISH,
  C.FINNED_FRANKEN_FISH,
  C.MUTANT_FISH,
  C.FINNED_MUTANT_FISH,
]);

export function isFish(type: SolutionType): boolean {
  const cat = categoryOf(type);
  return cat !== undefined && FISH_CATEGORIES.has(cat);
}

export function isBasicFish(type: SolutionType): boolean {
  const cat = categoryOf(type);
  return cat === C.BASIC_FISH || cat === C.FINNED_BASIC_FISH;
}

export function isFrankenFish(type: SolutionType): boolean {
  const cat = categoryOf(type);
  return cat === C.FRANKEN_FISH || cat === C.FINNED_FRANKEN_FISH;
}

export function isMutantFish(type: SolutionType): boolean {
  const cat = categoryOf(type);
  return cat === C.MUTANT_FISH || cat === C.FINNED_MUTANT_FISH;
}
