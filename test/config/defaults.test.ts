import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY_LEVELS,
  DEFAULT_SOLVER_STEPS,
  SOLVER_STEPS_SORTED,
  categoryOf,
  getStepConfig,
  isFish,
} from "../../src/config/defaults.js";
import { SolutionCategory } from "../../src/core/step-config.js";

describe("default config (vs Options)", () => {
  it("has 92 solver steps", () => {
    expect(DEFAULT_SOLVER_STEPS).toHaveLength(92);
  });

  it("difficulty thresholds match Java", () => {
    const byName = Object.fromEntries(DEFAULT_DIFFICULTY_LEVELS.map((l) => [l.name, l.maxScore]));
    expect(byName.Easy).toBe(800);
    expect(byName.Medium).toBe(1000);
    expect(byName.Hard).toBe(1600);
    expect(byName.Unfair).toBe(1800);
    expect(byName.Extreme).toBe(2147483647);
  });

  it("base scores match Java", () => {
    expect(getStepConfig("FULL_HOUSE")!.baseScore).toBe(4);
    expect(getStepConfig("NAKED_SINGLE")!.baseScore).toBe(4);
    expect(getStepConfig("HIDDEN_SINGLE")!.baseScore).toBe(14);
    expect(getStepConfig("LOCKED_PAIR")!.baseScore).toBe(40);
    expect(getStepConfig("X_WING")!.baseScore).toBe(140);
    expect(getStepConfig("XY_WING")!.baseScore).toBe(160);
  });

  it("sorted steps are ascending by index, singles first", () => {
    for (let i = 1; i < SOLVER_STEPS_SORTED.length; i++) {
      expect(SOLVER_STEPS_SORTED[i]!.index).toBeGreaterThanOrEqual(SOLVER_STEPS_SORTED[i - 1]!.index);
    }
    expect(SOLVER_STEPS_SORTED[0]!.type).toBe("FULL_HOUSE");
  });

  it("getStepConfig normalizes variants", () => {
    expect(getStepConfig("AIC")).toBe(getStepConfig("NICE_LOOP"));
    expect(getStepConfig("MULTI_COLORS_1")).toBe(getStepConfig("MULTI_COLORS"));
    expect(getStepConfig("KRAKEN_FISH_TYPE_2")).toBe(getStepConfig("KRAKEN_FISH"));
    expect(getStepConfig("DUAL_EMPTY_RECTANGLE")).toBe(getStepConfig("EMPTY_RECTANGLE"));
  });

  it("isFish / categoryOf", () => {
    expect(isFish("X_WING")).toBe(true);
    expect(isFish("FINNED_MUTANT_WHALE")).toBe(true);
    expect(isFish("XY_WING")).toBe(false);
    expect(categoryOf("X_WING")).toBe(SolutionCategory.BASIC_FISH);
    expect(categoryOf("SUE_DE_COQ")).toBe(SolutionCategory.MISCELLANEOUS);
  });
});
