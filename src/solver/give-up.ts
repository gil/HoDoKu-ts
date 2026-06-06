/*
 * Last-resort solver: always yields a GIVE_UP step. Used when no enabled
 * technique applies (mirrors HoDoKu's GiveUpSolver).
 */

import { SolutionStep } from "../core/solution-step.js";

export function getGiveUpStep(): SolutionStep {
  return new SolutionStep("GIVE_UP");
}
