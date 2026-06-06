/*
 * Port of HoDoKu's ColoringSolver: Simple Colors (Trap/Wrap) and Multi Colors.
 *
 * For a digit, every candidate that belongs to a conjugate pair is two-colored
 * along conjugate links, forming independent color pairs. Eliminations:
 *  - Simple Wrap: two same-colored cells see each other -> that color is false.
 *  - Simple Trap: a candidate seeing both colors of a pair is removed.
 *  - Multi Colors: relations between two different color pairs.
 * Caching is omitted (recomputed per call); results are identical.
 */

import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { BUDDIES, CONSTRAINTS, UNIT_TEMPLATES } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

type ColorPair = [CellSet, CellSet];

const SIMPLE_TYPES = new Set<SolutionType>([
  "SIMPLE_COLORS",
  "SIMPLE_COLORS_TRAP",
  "SIMPLE_COLORS_WRAP",
]);

export class ColoringSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    const all = SIMPLE_TYPES.has(type) ? this.simpleSteps(finder) : this.multiSteps(finder);
    return all[0] ?? null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    return SIMPLE_TYPES.has(type) ? this.simpleSteps(finder) : this.multiSteps(finder);
  }

  private simpleSteps(finder: CandidateFinder): SolutionStep[] {
    const out: SolutionStep[] = [];
    for (let cand = 1; cand <= 9; cand++) {
      const pairs = this.doColoring(finder, cand);
      for (const [set1, set2] of pairs) {
        // Color Wrap
        const wrap = new SolutionStep("SIMPLE_COLORS_WRAP");
        if (this.checkColorWrap(set1)) for (const c of set1) wrap.addCandidateToDelete(c, cand);
        if (this.checkColorWrap(set2)) for (const c of set2) wrap.addCandidateToDelete(c, cand);
        if (wrap.candidatesToDelete.length > 0) {
          wrap.addValue(cand);
          addColors(wrap, set1, 0);
          addColors(wrap, set2, 1);
          out.push(wrap);
        }
        // Color Trap
        const trap = new SolutionStep("SIMPLE_COLORS_TRAP");
        this.checkCandidateToDelete(finder, set1, set2, cand, trap);
        if (trap.candidatesToDelete.length > 0) {
          trap.addValue(cand);
          addColors(trap, set1, 0);
          addColors(trap, set2, 1);
          out.push(trap);
        }
      }
    }
    return out;
  }

  private multiSteps(finder: CandidateFinder): SolutionStep[] {
    const out: SolutionStep[] = [];
    for (let cand = 1; cand <= 9; cand++) {
      const pairs = this.doColoring(finder, cand);
      for (let i = 0; i < pairs.length; i++) {
        for (let j = 0; j < pairs.length; j++) {
          if (i === j) continue;
          const [s11, s12] = pairs[i]!;
          const [s21, s22] = pairs[j]!;

          const mc2 = new SolutionStep("MULTI_COLORS_2");
          if (this.checkMultiColor1(s11, s21, s22)) for (const c of s11) mc2.addCandidateToDelete(c, cand);
          if (this.checkMultiColor1(s12, s21, s22)) for (const c of s12) mc2.addCandidateToDelete(c, cand);
          if (mc2.candidatesToDelete.length > 0) {
            mc2.addValue(cand);
            addColors(mc2, s11, 0);
            addColors(mc2, s12, 1);
            addColors(mc2, s21, 2);
            addColors(mc2, s22, 3);
            out.push(mc2);
          }

          const mc1 = new SolutionStep("MULTI_COLORS_1");
          if (this.checkMultiColor2(s11, s21)) this.checkCandidateToDelete(finder, s12, s22, cand, mc1);
          if (this.checkMultiColor2(s11, s22)) this.checkCandidateToDelete(finder, s12, s21, cand, mc1);
          if (this.checkMultiColor2(s12, s21)) this.checkCandidateToDelete(finder, s11, s22, cand, mc1);
          if (this.checkMultiColor2(s12, s22)) this.checkCandidateToDelete(finder, s11, s21, cand, mc1);
          if (mc1.candidatesToDelete.length > 0) {
            mc1.addValue(cand);
            addColors(mc1, s11, 0);
            addColors(mc1, s12, 1);
            addColors(mc1, s21, 2);
            addColors(mc1, s22, 3);
            out.push(mc1);
          }
        }
      }
    }
    return out;
  }

  private checkColorWrap(set: CellSet): boolean {
    const a = set.toArray();
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = i + 1; j < a.length; j++) {
        if (BUDDIES[a[i]!]!.contains(a[j]!)) return true;
      }
    }
    return false;
  }

  private checkCandidateToDelete(
    finder: CandidateFinder,
    set1: CellSet,
    set2: CellSet,
    cand: number,
    step: SolutionStep,
  ): void {
    const candidates = finder.getCandidates();
    const deleteSet = new CellSet();
    const tmp = new CellSet();
    for (const i of set1) {
      for (const j of set2) {
        tmp.set(BUDDIES[i]!);
        tmp.and(BUDDIES[j]!);
        tmp.and(candidates[cand]!);
        deleteSet.or(tmp);
      }
    }
    for (const idx of deleteSet) step.addCandidateToDelete(idx, cand);
  }

  private checkMultiColor1(set: CellSet, s21: CellSet, s22: CellSet): boolean {
    let see21 = false;
    let see22 = false;
    for (const i of set) {
      if (!BUDDIES[i]!.andEmpty(s21)) see21 = true;
      if (!BUDDIES[i]!.andEmpty(s22)) see22 = true;
      if (see21 && see22) return true;
    }
    return false;
  }

  private checkMultiColor2(set1: CellSet, set2: CellSet): boolean {
    for (const i of set1) {
      for (const j of set2) if (BUDDIES[i]!.contains(j)) return true;
    }
    return false;
  }

  private doColoring(finder: CandidateFinder, cand: number): ColorPair[] {
    const board = finder.board;
    const candidates = finder.getCandidates();
    const startSet = candidates[cand]!.clone();
    // keep only candidates that are part of at least one conjugate pair
    for (const index of startSet.toArray()) {
      const con = CONSTRAINTS[index]!;
      if (
        board.free[con[0]]![cand] !== 2 &&
        board.free[con[1]]![cand] !== 2 &&
        board.free[con[2]]![cand] !== 2
      ) {
        startSet.remove(index);
      }
    }
    const pairs: ColorPair[] = [];
    while (!startSet.isEmpty()) {
      const c1 = new CellSet();
      const c2 = new CellSet();
      this.colorRecursive(finder, startSet, c1, c2, startSet.get(0), cand, true);
      if (!c1.isEmpty() && !c2.isEmpty()) pairs.push([c1, c2]);
    }
    return pairs;
  }

  private colorRecursive(
    finder: CandidateFinder,
    startSet: CellSet,
    c1: CellSet,
    c2: CellSet,
    index: number,
    cand: number,
    on: boolean,
  ): void {
    if (index === -1 || !startSet.contains(index)) return;
    (on ? c1 : c2).add(index);
    startSet.remove(index);
    const con = CONSTRAINTS[index]!;
    for (let k = 0; k < 3; k++) {
      const next = this.getConjugateIndex(finder, index, cand, con[k]!);
      this.colorRecursive(finder, startSet, c1, c2, next, cand, !on);
    }
  }

  private getConjugateIndex(
    finder: CandidateFinder,
    index: number,
    cand: number,
    constraint: number,
  ): number {
    if (finder.board.free[constraint]![cand] !== 2) return -1;
    const tmp = finder.getCandidates()[cand]!.clone();
    tmp.and(UNIT_TEMPLATES[constraint]!);
    let result = tmp.get(0);
    if (result === index) result = tmp.get(1);
    return result;
  }
}

function addColors(step: SolutionStep, set: CellSet, color: number): void {
  for (const idx of set) step.colorCandidates.set(idx, color);
}
