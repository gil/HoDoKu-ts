/*
 * Port of HoDoKu's SingleDigitPatternSolver: Skyscraper, 2-String Kite and
 * Empty Rectangle. (Dual variants and Turbot Fish are handled elsewhere.)
 * Operates on one candidate digit at a time using conjugate pairs (free == 2)
 * and, for Empty Rectangles, precomputed per-block empty-cell patterns.
 */

import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import {
  ALL_UNITS,
  BLOCK,
  BLOCKS,
  BUDDIES,
  COLS,
  LINES,
  UNIT_TEMPLATES,
  getBlock,
  getCol,
  getIndex,
  getLine,
} from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const LINE_TPL = UNIT_TEMPLATES.slice(0, 9);
const COL_TPL = UNIT_TEMPLATES.slice(9, 18);
const BLOCK_TPL = UNIT_TEMPLATES.slice(18, 27);

// Empty-rectangle empty-cell offsets (relative to block top-left) + ER line/col offsets.
const ER_OFFSETS = [
  [0, 1, 9, 10],
  [0, 2, 9, 11],
  [1, 2, 10, 11],
  [0, 1, 18, 19],
  [0, 2, 18, 20],
  [1, 2, 19, 20],
  [9, 10, 18, 19],
  [9, 11, 18, 20],
  [10, 11, 19, 20],
];
const ER_LINE_OFFSETS = [2, 2, 2, 1, 1, 1, 0, 0, 0];
const ER_COL_OFFSETS = [2, 1, 0, 2, 1, 0, 2, 1, 0];

const ER_SETS: CellSet[][] = [];
const ER_LINES: number[][] = [];
const ER_COLS: number[][] = [];
for (let b = 0; b < 9; b++) {
  const base = BLOCKS[b]![0]!;
  const lineBase = ((b / 3) | 0) * 3;
  const colBase = (b % 3) * 3;
  ER_SETS[b] = ER_OFFSETS.map((offs) => CellSet.fromIndices(offs.map((o) => base + o)));
  ER_LINES[b] = ER_LINE_OFFSETS.map((o) => o + lineBase);
  ER_COLS[b] = ER_COL_OFFSETS.map((o) => o + colBase);
}

/** Empty rectangles with only two candidates degenerate into X-Chains; off by default. */
const ALLOW_ERS_WITH_ONLY_TWO = false;

export class SingleDigitPatternSolver {
  private collector: SolutionStep[] | null = null;

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    const out: SolutionStep[] = [];
    this.collector = out;
    try {
      this.getStep(finder, type);
    } finally {
      this.collector = null;
    }
    return out;
  }

  private emit(step: SolutionStep): SolutionStep | null {
    if (this.collector) {
      this.collector.push(step);
      return null;
    }
    return step;
  }

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    switch (type) {
      case "SKYSCRAPER":
        return this.findSkyscraper(finder);
      case "TWO_STRING_KITE":
        return this.findTwoStringKite(finder);
      case "EMPTY_RECTANGLE":
        return this.findEmptyRectangle(finder);
      default:
        return null;
    }
  }

  private findSkyscraper(finder: CandidateFinder): SolutionStep | null {
    const r = this.skyscraper(finder, true);
    if (r && !this.collector) return r;
    return this.skyscraper(finder, false);
  }

  private skyscraper(finder: CandidateFinder, lines: boolean): SolutionStep | null {
    const sudoku = finder.board;
    const candidates = finder.getCandidates();
    const cStart = lines ? 0 : 9;
    const cEnd = lines ? 9 : 18;
    const only2: number[][] = [];
    const firstUnit = new CellSet();

    for (let cand = 1; cand <= 9; cand++) {
      only2.length = 0;
      for (let constr = cStart; constr < cEnd; constr++) {
        if (sudoku.free[constr]![cand] !== 2) continue;
        const pair: number[] = [];
        for (const idx of ALL_UNITS[constr]!) {
          if (sudoku.isCandidate(idx, cand)) {
            pair.push(idx);
            if (pair.length >= 2) break;
          }
        }
        only2.push(pair);
      }
      for (let i = 0; i < only2.length; i++) {
        for (let j = i + 1; j < only2.length; j++) {
          const a = only2[i]!;
          const b = only2[j]!;
          const coord = lines ? getCol : getLine;
          let found = false;
          let otherIndex = 1;
          if (coord(a[0]!) === coord(b[0]!)) found = true;
          else if (coord(a[1]!) === coord(b[1]!)) {
            found = true;
            otherIndex = 0;
          }
          if (!found) continue;
          // free ends in the same unit would be an X-Wing
          if (coord(a[otherIndex]!) === coord(b[otherIndex]!)) continue;
          firstUnit.setAnd(candidates[cand]!, BUDDIES[a[otherIndex]!]!);
          firstUnit.and(BUDDIES[b[otherIndex]!]!);
          if (firstUnit.isEmpty()) continue;

          const step = new SolutionStep("SKYSCRAPER");
          step.addValue(cand);
          const base = otherIndex === 0 ? 0 : 1;
          const other = otherIndex === 0 ? 1 : 0;
          step.addIndex(a[base]!);
          step.addIndex(b[base]!);
          step.addIndex(a[other]!);
          step.addIndex(b[other]!);
          for (const e of firstUnit) step.addCandidateToDelete(e, cand);
          const r = this.emit(step);
          if (r) return r;
        }
      }
    }
    return null;
  }

  private findTwoStringKite(finder: CandidateFinder): SolutionStep | null {
    const sudoku = finder.board;
    const lineEnds: number[][] = [];
    const colEnds: number[][] = [];
    for (let cand = 1; cand <= 9; cand++) {
      lineEnds.length = 0;
      colEnds.length = 0;
      for (let constr = 0; constr < 18; constr++) {
        if (sudoku.free[constr]![cand] !== 2) continue;
        const pair: number[] = [];
        for (const idx of ALL_UNITS[constr]!) {
          if (sudoku.isCandidate(idx, cand)) {
            pair.push(idx);
            if (pair.length >= 2) break;
          }
        }
        if (constr < 9) lineEnds.push(pair);
        else colEnds.push(pair);
      }
      for (const li of lineEnds) {
        for (const co of colEnds) {
          // arrange so the box-connected ends are at [0], free ends at [1]
          const a = li.slice();
          const b = co.slice();
          if (getBlock(a[0]!) === getBlock(b[0]!)) {
            // ok
          } else if (getBlock(a[0]!) === getBlock(b[1]!)) {
            [b[0], b[1]] = [b[1]!, b[0]!];
          } else if (getBlock(a[1]!) === getBlock(b[0]!)) {
            [a[0], a[1]] = [a[1]!, a[0]!];
          } else if (getBlock(a[1]!) === getBlock(b[1]!)) {
            [b[0], b[1]] = [b[1]!, b[0]!];
            [a[0], a[1]] = [a[1]!, a[0]!];
          } else continue;
          if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
          const crossIndex = getIndex(getLine(b[1]!), getCol(a[1]!));
          if (!sudoku.isCandidate(crossIndex, cand)) continue;

          const step = new SolutionStep("TWO_STRING_KITE");
          step.addValue(cand);
          step.addIndex(a[1]!);
          step.addIndex(b[1]!);
          step.addIndex(a[0]!);
          step.addIndex(b[0]!);
          step.addCandidateToDelete(crossIndex, cand);
          step.addFin(a[0]!, cand);
          step.addFin(b[0]!, cand);
          const r = this.emit(step);
          if (r) return r;
        }
      }
    }
    return null;
  }

  private findEmptyRectangle(finder: CandidateFinder): SolutionStep | null {
    for (let cand = 1; cand <= 9; cand++) {
      const r = this.emptyRectanglesForCandidate(finder, cand);
      if (r && !this.collector) return r;
    }
    return null;
  }

  private emptyRectanglesForCandidate(finder: CandidateFinder, cand: number): SolutionStep | null {
    const sudoku = finder.board;
    const candidates = finder.getCandidates();
    const blockCands = new CellSet();
    const tmp = new CellSet();
    for (let i = 0; i < 9; i++) {
      const f = sudoku.free[18 + i]![cand]!;
      if (f < 2 || f > 5) continue;
      blockCands.set(candidates[cand]!);
      blockCands.and(BLOCK_TPL[i]!);
      for (let j = 0; j < ER_SETS[i]!.length; j++) {
        let notEnough = true;
        tmp.setAnd(blockCands, ER_SETS[i]![j]!);
        if (!tmp.isEmpty()) continue;
        const erLine = ER_LINES[i]![j]!;
        const erCol = ER_COLS[i]![j]!;
        tmp.setAnd(blockCands, LINE_TPL[erLine]!);
        if (tmp.size() >= 2) notEnough = false;
        tmp.andNot(COL_TPL[erCol]!);
        if (tmp.isEmpty()) continue;
        tmp.setAnd(blockCands, COL_TPL[erCol]!);
        if (tmp.size() >= 2) notEnough = false;
        tmp.andNot(LINE_TPL[erLine]!);
        if (tmp.isEmpty()) continue;
        if (notEnough && !ALLOW_ERS_WITH_ONLY_TWO) continue;

        let step = this.checkEmptyRectangle(
          finder, cand, i, blockCands, LINES[erLine]!, LINE_TPL, COL_TPL, erCol, false,
        );
        if (step && !this.collector) return step;
        step = this.checkEmptyRectangle(
          finder, cand, i, blockCands, COLS[erCol]!, COL_TPL, LINE_TPL, erLine, true,
        );
        if (step && !this.collector) return step;
      }
    }
    return null;
  }

  private checkEmptyRectangle(
    finder: CandidateFinder,
    cand: number,
    block: number,
    blockCands: CellSet,
    indices: readonly number[],
    lineTemplates: readonly CellSet[],
    colTemplates: readonly CellSet[],
    firstCol: number,
    reversed: boolean,
  ): SolutionStep | null {
    const sudoku = finder.board;
    const candidates = finder.getCandidates();
    const tmp = new CellSet();
    for (const index of indices) {
      if (sudoku.values[index] !== 0) continue;
      if (getBlock(index) === block) continue;
      if (!sudoku.isCandidate(index, cand)) continue;
      const actCol = reversed ? getLine(index) : getCol(index);
      tmp.set(candidates[cand]!);
      tmp.and(colTemplates[actCol]!);
      if (tmp.size() !== 2) continue;
      let index2 = tmp.get(0);
      if (index2 === index) index2 = tmp.get(1);
      const actLine = reversed ? getCol(index2) : getLine(index2);
      tmp.set(candidates[cand]!);
      tmp.and(lineTemplates[actLine]!);
      for (const indexDel of tmp.toArray()) {
        if (getBlock(indexDel) === block) continue;
        const colDel = reversed ? getLine(indexDel) : getCol(indexDel);
        if (colDel !== firstCol) continue;
        const step = new SolutionStep("EMPTY_RECTANGLE");
        step.entity = BLOCK;
        step.entityNumber = block + 1;
        step.addValue(cand);
        step.addIndex(index);
        step.addIndex(index2);
        for (const c of blockCands) step.addFin(c, cand);
        step.addCandidateToDelete(indexDel, cand);
        const r = this.emit(step);
        if (r) return r;
        break;
      }
    }
    return null;
  }
}
