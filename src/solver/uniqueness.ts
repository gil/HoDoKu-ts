/*
 * Port of HoDoKu's UniquenessSolver — currently BUG+1 and Unique Rectangle
 * Type 1 (the two most common deadly-pattern techniques). UR types 2-6, Hidden
 * Rectangle and Avoidable Rectangle are deferred to a later pass.
 *
 * These techniques assume the puzzle has a unique solution (true for generated /
 * proper puzzles); HoDoKu guards on a strict-validity flag we don't track here.
 */

import { MASKS } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import {
  ALL_UNITS,
  BLOCKS,
  BUDDIES,
  CONSTRAINTS,
  LENGTH,
  getBlock,
  getCol,
  getLine,
} from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const UR_TYPES = new Set<SolutionType>(["UNIQUENESS_1", "UNIQUENESS_2", "UNIQUENESS_5"]);

function popcount(mask: number): number {
  let c = 0;
  while (mask) {
    mask &= mask - 1;
    c++;
  }
  return c;
}

function lowestDigit(mask: number): number {
  let d = 1;
  while ((mask & (1 << (d - 1))) === 0) d++;
  return d;
}

export class UniquenessSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (type === "BUG_PLUS_1") return this.getBugPlus1(finder);
    if (UR_TYPES.has(type)) return this.enumerateUR(finder).find((s) => s.type === type) ?? null;
    return null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (type === "BUG_PLUS_1") {
      const s = this.getBugPlus1(finder);
      return s ? [s] : [];
    }
    if (UR_TYPES.has(type)) return this.enumerateUR(finder).filter((s) => s.type === type);
    return [];
  }

  /** Enumerates every Unique Rectangle in the grid and classifies each. */
  private enumerateUR(finder: CandidateFinder): SolutionStep[] {
    const sudoku = finder.board;
    const out: SolutionStep[] = [];
    const seen = new Set<number>();
    const allowed = finder.getCandidatesAllowed();
    for (let i = 0; i < LENGTH; i++) {
      if (sudoku.getAnzCandidates(i) !== 2) continue;
      const cands = sudoku.getAllCandidates(i);
      this.startCell(finder, allowed, i, cands[0]!, cands[1]!, seen, out);
    }
    return out;
  }

  private startCell(
    finder: CandidateFinder,
    allowed: CellSet[],
    index11: number,
    cand1: number,
    cand2: number,
    seen: Set<number>,
    out: SolutionStep[],
  ): void {
    const sudoku = finder.board;
    const line11 = getLine(index11);
    const col11 = getCol(index11);
    const block11 = getBlock(index11);
    // allowMissing is on by default in HoDoKu: corners need the candidates to be
    // *allowed*, not necessarily pencilled.
    const a1 = allowed[cand1]!;
    const a2 = allowed[cand2]!;

    for (const index12 of BLOCKS[block11]!) {
      if (index12 === index11) continue;
      if (line11 !== getLine(index12) && col11 !== getCol(index12)) continue;
      if (sudoku.values[index12] !== 0) continue;
      if (!a1.contains(index12) || !a2.contains(index12)) continue;

      const isLines = line11 === getLine(index12);
      const unit11 = ALL_UNITS[isLines ? getCol(index11) + 9 : getLine(index11)]!;
      const unit12 = ALL_UNITS[isLines ? getCol(index12) + 9 : getLine(index12)]!;
      for (let j = 0; j < unit11.length; j++) {
        const index21 = unit11[j]!;
        const index22 = unit12[j]!;
        if (getBlock(index21) === block11) continue;
        if (!(a1.contains(index21) && a1.contains(index22) && a2.contains(index22))) continue;

        const corners = [index11, index12, index21, index22];
        const key = rectKey(corners);
        if (seen.has(key)) continue;
        seen.add(key);
        this.classify(finder, corners, cand1, cand2, out);
      }
    }
  }

  /** Classifies a rectangle into UR Type 1 / 2 / 5 steps (others: TODO). */
  private classify(
    finder: CandidateFinder,
    corners: number[],
    cand1: number,
    cand2: number,
    out: SolutionStep[],
  ): void {
    const sudoku = finder.board;
    const urMask = MASKS[cand1]! | MASKS[cand2]!;
    const extraMask = ~urMask & 0x1ff;
    const additional: number[] = [];
    let twoCount = 0;
    for (const idx of corners) {
      if ((sudoku.cells[idx]! & extraMask) === 0) twoCount++;
      else additional.push(idx);
    }

    // Type 1: exactly one corner has extra candidates -> remove the UR candidates from it.
    if (twoCount === 3) {
      const delIndex = additional[0]!;
      const step = new SolutionStep("UNIQUENESS_1");
      step.addValue(cand1);
      step.addValue(cand2);
      for (const c of corners) step.addIndex(c);
      if (sudoku.isCandidate(delIndex, cand1)) step.addCandidateToDelete(delIndex, cand1);
      if (sudoku.isCandidate(delIndex, cand2)) step.addCandidateToDelete(delIndex, cand2);
      if (step.candidatesToDelete.length > 0) out.push(step);
    }

    // Type 2 / 5: the extra corners share exactly one extra candidate, removable
    // from cells that see all of them. Two extra corners in a line/col -> Type 2,
    // otherwise (diagonal, or three corners) -> Type 5.
    if (twoCount === 2 || twoCount === 1) {
      let addMask = 0;
      const tmp = new CellSet();
      tmp.setAll();
      for (const idx of additional) {
        addMask |= sudoku.cells[idx]! & extraMask;
        if (popcount(addMask) > 1) break;
        tmp.and(BUDDIES[idx]!);
      }
      if (popcount(addMask) === 1) {
        const addCand = lowestDigit(addMask);
        tmp.and(finder.getCandidates()[addCand]!);
        if (!tmp.isEmpty()) {
          const i1 = additional[0]!;
          const i2 = additional[1]!;
          const type =
            additional.length === 3 || (getLine(i1) !== getLine(i2) && getCol(i1) !== getCol(i2))
              ? "UNIQUENESS_5"
              : "UNIQUENESS_2";
          const step = new SolutionStep(type);
          step.addValue(cand1);
          step.addValue(cand2);
          for (const c of corners) step.addIndex(c);
          for (const idx of tmp) step.addCandidateToDelete(idx, addCand);
          out.push(step);
        }
      }
    }
  }

  private getBugPlus1(finder: CandidateFinder): SolutionStep | null {
    const sudoku = finder.board;
    let index3 = -1;
    for (let i = 0; i < LENGTH; i++) {
      const anz = sudoku.getAnzCandidates(i);
      if (anz > 3) return null;
      if (anz === 3) {
        if (index3 !== -1) return null;
        index3 = i;
      }
    }
    if (index3 === -1) return null;

    let cand3 = -1;
    const bugConstraints = [-1, -1, -1];
    for (let constr = 0; constr < 27; constr++) {
      for (let cand = 1; cand <= 9; cand++) {
        const anz = sudoku.free[constr]![cand]!;
        if (anz > 3) return null;
        if (anz === 3) {
          if (bugConstraints[(constr / 9) | 0] !== -1 || (cand3 !== -1 && cand3 !== cand)) {
            return null;
          }
          cand3 = cand;
          bugConstraints[(constr / 9) | 0] = constr;
        }
      }
    }
    const con = CONSTRAINTS[index3]!;
    if (
      cand3 !== -1 &&
      sudoku.isCandidate(index3, cand3) &&
      con[0] === bugConstraints[0] &&
      con[1] === bugConstraints[1] &&
      con[2] === bugConstraints[2]
    ) {
      const step = new SolutionStep("BUG_PLUS_1");
      for (const c of sudoku.getAllCandidates(index3)) {
        if (c !== cand3) step.addCandidateToDelete(index3, c);
      }
      return step;
    }
    return null;
  }
}

function rectKey(corners: number[]): number {
  const s = [...corners].sort((a, b) => a - b);
  return ((s[0]! * 81 + s[1]!) * 81 + s[2]!) * 81 + s[3]!;
}
