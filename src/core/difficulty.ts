/*
 * Port of DifficultyLevel (GUI colors dropped). `ordinal` equals the
 * DifficultyType ordinal and the index into the difficulty-level array.
 */

import { DifficultyType } from "./step-config.js";

export interface DifficultyLevel {
  type: DifficultyType;
  ordinal: number;
  /** Inclusive upper score bound for this level. */
  maxScore: number;
  name: string;
}

/** Public lowercase difficulty identifiers exposed by the library API. */
export type Difficulty = "incomplete" | "easy" | "medium" | "hard" | "unfair" | "extreme";

export const DIFFICULTY_NAMES: Record<DifficultyType, Difficulty> = {
  [DifficultyType.INCOMPLETE]: "incomplete",
  [DifficultyType.EASY]: "easy",
  [DifficultyType.MEDIUM]: "medium",
  [DifficultyType.HARD]: "hard",
  [DifficultyType.UNFAIR]: "unfair",
  [DifficultyType.EXTREME]: "extreme",
};

export function difficultyOf(name: Difficulty): DifficultyType {
  switch (name) {
    case "incomplete":
      return DifficultyType.INCOMPLETE;
    case "easy":
      return DifficultyType.EASY;
    case "medium":
      return DifficultyType.MEDIUM;
    case "hard":
      return DifficultyType.HARD;
    case "unfair":
      return DifficultyType.UNFAIR;
    case "extreme":
      return DifficultyType.EXTREME;
  }
}
