/*
 * Port of HoDoKu's UniquenessSolver — currently BUG+1 and Unique Rectangle
 * Type 1 (the two most common deadly-pattern techniques). UR types 2-6, Hidden
 * Rectangle and Avoidable Rectangle are deferred to a later pass.
 *
 * These techniques assume the puzzle has a unique solution (true for generated /
 * proper puzzles); HoDoKu guards on a strict-validity flag we don't track here.
 */

import { ANZ_VALUES, MASKS, POSSIBLE_VALUES } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import {
  ALL_UNITS,
  BLOCK,
  BLOCKS,
  BUDDIES,
  COL,
  COLS,
  CONSTRAINTS,
  LENGTH,
  LINE,
  LINES,
  UNIT_TEMPLATES,
  getBlock,
  getCol,
  getLine,
} from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const LINE_TPL = UNIT_TEMPLATES.slice(0, 9);
const COL_TPL = UNIT_TEMPLATES.slice(9, 18);

const UR_TYPES = new Set<SolutionType>([
  "UNIQUENESS_1",
  "UNIQUENESS_2",
  "UNIQUENESS_3",
  "UNIQUENESS_4",
  "UNIQUENESS_5",
  "UNIQUENESS_6",
  "HIDDEN_RECTANGLE",
]);

const AR_TYPES = new Set<SolutionType>(["AVOIDABLE_RECTANGLE_1", "AVOIDABLE_RECTANGLE_2"]);

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

function isSameLineOrCol(indices: number[]): boolean {
  if (indices.length === 0) return false;
  let sameLine = true;
  let sameCol = true;
  const line = getLine(indices[0]!);
  const col = getCol(indices[0]!);
  for (let i = 1; i < indices.length; i++) {
    if (getLine(indices[i]!) !== line) sameLine = false;
    if (getCol(indices[i]!) !== col) sameCol = false;
  }
  return sameLine || sameCol;
}

function blockForCheck3(indices: number[]): number {
  if (indices.length === 0) return -1;
  const block = getBlock(indices[0]!);
  for (let i = 1; i < indices.length; i++) if (getBlock(indices[i]!) !== block) return -1;
  return block;
}

export class UniquenessSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (type === "BUG_PLUS_1") return this.getBugPlus1(finder);
    if (UR_TYPES.has(type)) return this.enumerateUR(finder).find((s) => s.type === type) ?? null;
    if (AR_TYPES.has(type)) return this.enumerateAR(finder).find((s) => s.type === type) ?? null;
    return null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (type === "BUG_PLUS_1") {
      const s = this.getBugPlus1(finder);
      return s ? [s] : [];
    }
    if (UR_TYPES.has(type)) return this.enumerateUR(finder).filter((s) => s.type === type);
    if (AR_TYPES.has(type)) return this.enumerateAR(finder).filter((s) => s.type === type);
    return [];
  }

  /**
   * Enumerates Avoidable Rectangles. Start corners are placed-but-not-given cells;
   * assumes the givens have a unique solution (true for proper puzzles).
   */
  private enumerateAR(finder: CandidateFinder): SolutionStep[] {
    const sudoku = finder.board;
    const out: SolutionStep[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < LENGTH; i++) {
      if (sudoku.values[i] === 0 || sudoku.isFixed(i)) continue;
      this.startCellAR(finder, i, sudoku.values[i]!, seen, out);
    }
    return out;
  }

  private startCellAR(
    finder: CandidateFinder,
    index11: number,
    cand1: number,
    seen: Set<number>,
    out: SolutionStep[],
  ): void {
    const sudoku = finder.board;
    const line11 = getLine(index11);
    const col11 = getCol(index11);
    const block11 = getBlock(index11);
    for (const index12 of BLOCKS[block11]!) {
      if (index12 === index11) continue;
      if (line11 !== getLine(index12) && col11 !== getCol(index12)) continue;
      if (sudoku.values[index12] === 0 || sudoku.isFixed(index12)) continue;
      const cand2 = sudoku.values[index12]!;
      const isLines = line11 === getLine(index12);
      const unit11 = ALL_UNITS[isLines ? getCol(index11) + 9 : getLine(index11)]!;
      const unit12 = ALL_UNITS[isLines ? getCol(index12) + 9 : getLine(index12)]!;
      for (let j = 0; j < unit11.length; j++) {
        const i21 = unit11[j]!;
        const i22 = unit12[j]!;
        if (getBlock(i21) === block11) continue;
        const v21 = sudoku.values[i21]!;
        const v22 = sudoku.values[i22]!;
        const ok =
          (v21 === cand2 && !sudoku.isFixed(i21) && v22 === 0 && sudoku.isCandidate(i22, cand1) &&
            sudoku.getAnzCandidates(i22) === 2) ||
          (v22 === cand1 && !sudoku.isFixed(i22) && v21 === 0 && sudoku.isCandidate(i21, cand2) &&
            sudoku.getAnzCandidates(i21) === 2) ||
          (v21 === 0 && sudoku.isCandidate(i21, cand2) && sudoku.getAnzCandidates(i21) === 2 &&
            v22 === 0 && sudoku.isCandidate(i22, cand1) && sudoku.getAnzCandidates(i22) === 2);
        if (!ok) continue;
        const corners = [index11, index12, i21, i22];
        const key = rectKey(corners);
        if (seen.has(key)) continue;
        seen.add(key);
        this.checkAvoidableRectangle(finder, corners, cand1, cand2, i21, i22, out);
      }
    }
  }

  private checkAvoidableRectangle(
    finder: CandidateFinder,
    corners: number[],
    cand1: number,
    cand2: number,
    i21: number,
    i22: number,
    out: SolutionStep[],
  ): void {
    const sudoku = finder.board;
    if (sudoku.values[i21] !== 0 || sudoku.values[i22] !== 0) {
      // Type 1: one opposite corner is solved -> the other can't hold the matching digit.
      const step = this.makeURStep("AVOIDABLE_RECTANGLE_1", corners, cand1, cand2);
      if (sudoku.values[i21] !== 0) {
        if (sudoku.isCandidate(i22, cand1)) step.addCandidateToDelete(i22, cand1);
      } else if (sudoku.isCandidate(i21, cand2)) {
        step.addCandidateToDelete(i21, cand2);
      }
      if (step.candidatesToDelete.length > 0) out.push(step);
    } else {
      // Type 2: both opposite corners bivalue with the same extra candidate.
      const cands = sudoku.getAllCandidates(i21);
      let addCand = cands[0]!;
      if (addCand === cand2) addCand = cands[1]!;
      if (!sudoku.isCandidate(i22, addCand)) return;
      const set = BUDDIES[i21]!.clone();
      set.and(BUDDIES[i22]!);
      set.and(finder.getCandidates()[addCand]!);
      if (set.isEmpty()) return;
      const step = this.makeURStep("AVOIDABLE_RECTANGLE_2", corners, cand1, cand2);
      for (const idx of set) step.addCandidateToDelete(idx, addCand);
      step.addEndoFin(i21, addCand);
      step.addEndoFin(i22, addCand);
      out.push(step);
    }
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
    const cands = finder.getCandidates();
    const urMask = MASKS[cand1]! | MASKS[cand2]!;
    const extraMask = ~urMask & 0x1ff;
    const additional: number[] = [];
    const twoCells: number[] = [];
    let twoCount = 0;
    for (const idx of corners) {
      if ((sudoku.cells[idx]! & extraMask) === 0) {
        twoCount++;
        twoCells.push(idx);
      } else additional.push(idx);
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

    if (twoCount === 2) {
      const i1 = additional[0]!;
      const i2 = additional[1]!;
      // Type 3: the two extra corners + (k-1) further cells in a shared house form
      // a naked subset of k candidates -> those candidates leave the other cells.
      const u3Cands = (sudoku.cells[i1]! & extraMask) | (sudoku.cells[i2]! & extraMask);
      if (getLine(i1) === getLine(i2)) {
        this.checkUniqueness3(finder, LINE, LINES[getLine(i1)]!, u3Cands, urMask, corners, cand1, cand2, additional, out);
      }
      if (getCol(i1) === getCol(i2)) {
        this.checkUniqueness3(finder, COL, COLS[getCol(i1)]!, u3Cands, urMask, corners, cand1, cand2, additional, out);
      }
      if (getBlock(i1) === getBlock(i2)) {
        this.checkUniqueness3(finder, BLOCK, BLOCKS[getBlock(i1)]!, u3Cands, urMask, corners, cand1, cand2, additional, out);
      }
    }

    if (twoCount === 2) {
      const i1 = additional[0]!;
      const i2 = additional[1]!;
      // Type 4: extra corners aligned; in cells seeing both, one UR candidate is
      // absent -> the other UR candidate is removable from the extra corners.
      if (getLine(i1) === getLine(i2) || getCol(i1) === getCol(i2)) {
        const shared = BUDDIES[i1]!.clone();
        shared.and(BUDDIES[i2]!);
        let delCand = -1;
        const t = shared.clone();
        t.and(cands[cand1]!);
        if (t.isEmpty()) delCand = cand2;
        else {
          t.set(shared);
          t.and(cands[cand2]!);
          if (t.isEmpty()) delCand = cand1;
        }
        if (delCand !== -1) {
          const step = this.makeURStep("UNIQUENESS_4", corners, cand1, cand2);
          if (sudoku.isCandidate(i1, delCand)) step.addCandidateToDelete(i1, delCand);
          if (sudoku.isCandidate(i2, delCand)) step.addCandidateToDelete(i2, delCand);
          if (step.candidatesToDelete.length > 0) out.push(step);
        }
      }
      // Type 6: extra corners diagonal; if a UR candidate is absent from both lines
      // and cols (outside the UR) it is removable from the diagonal corners.
      if (getLine(i1) !== getLine(i2) && getCol(i1) !== getCol(i2)) {
        const set = LINE_TPL[getLine(i1)]!.clone();
        set.or(COL_TPL[getCol(i1)]!);
        set.or(LINE_TPL[getLine(i2)]!);
        set.or(COL_TPL[getCol(i2)]!);
        for (const idx of additional) set.remove(idx);
        for (const idx of twoCells) set.remove(idx);
        let delCand = -1;
        const t = set.clone();
        t.and(cands[cand1]!);
        if (t.isEmpty()) delCand = cand1;
        else {
          t.set(set);
          t.and(cands[cand2]!);
          if (t.isEmpty()) delCand = cand2;
        }
        if (delCand !== -1) {
          const step = this.makeURStep("UNIQUENESS_6", corners, cand1, cand2);
          if (sudoku.isCandidate(i1, delCand)) step.addCandidateToDelete(i1, delCand);
          if (sudoku.isCandidate(i2, delCand)) step.addCandidateToDelete(i2, delCand);
          if (step.candidatesToDelete.length > 0) out.push(step);
        }
      }
    }

    // Hidden Rectangle: one (or two diagonal) bivalue corner(s); if a UR candidate
    // is confined to the corner's two conjugate links in both the line and col of
    // the opposite corner, the other UR candidate is removable at that corner.
    if (twoCount === 2 || twoCount === 1) {
      let doCheck = true;
      if (twoCount === 2) {
        const a = twoCells[0]!;
        const b = twoCells[1]!;
        if (getLine(a) === getLine(b) || getCol(a) === getCol(b)) doCheck = false;
      }
      if (doCheck) {
        const cornersSet = CellSet.fromIndices(corners);
        this.checkHiddenRectangle(finder, twoCells[0]!, additional, cand1, cand2, cornersSet, out);
        if (twoCount === 2) {
          this.checkHiddenRectangle(finder, twoCells[1]!, additional, cand1, cand2, cornersSet, out);
        }
      }
    }
  }

  private checkHiddenRectangle(
    finder: CandidateFinder,
    corner: number,
    additional: number[],
    cand1: number,
    cand2: number,
    cornersSet: CellSet,
    out: SolutionStep[],
  ): void {
    const lineC = getLine(corner);
    const colC = getCol(corner);
    const i1 = additional[0]!;
    const i2 = additional[1]!;
    let line1 = getLine(i1);
    if (line1 === lineC) line1 = getLine(i2);
    let col1 = getCol(i1);
    if (col1 === colC) col1 = getCol(i2);
    this.checkCandHR(finder, line1, col1, cand1, cand2, cornersSet, out);
    this.checkCandHR(finder, line1, col1, cand2, cand1, cornersSet, out);
  }

  private checkCandHR(
    finder: CandidateFinder,
    line: number,
    col: number,
    cand1: number,
    cand2: number,
    cornersSet: CellSet,
    out: SolutionStep[],
  ): void {
    const cands = finder.getCandidates();
    const t = cands[cand1]!.clone();
    t.and(LINE_TPL[line]!);
    t.andNot(cornersSet);
    if (!t.isEmpty()) return;
    t.set(cands[cand1]!);
    t.and(COL_TPL[col]!);
    t.andNot(cornersSet);
    if (!t.isEmpty()) return;
    const delIndex = line * 9 + col;
    if (finder.board.isCandidate(delIndex, cand2)) {
      const step = new SolutionStep("HIDDEN_RECTANGLE");
      step.addValue(cand1);
      step.addValue(cand2);
      for (const c of cornersSet) step.addIndex(c);
      step.addCandidateToDelete(delIndex, cand2);
      out.push(step);
    }
  }

  private checkUniqueness3(
    finder: CandidateFinder,
    unitType: number,
    unit: readonly number[],
    u3Cands: number,
    urMask: number,
    corners: number[],
    cand1: number,
    cand2: number,
    additional: number[],
    out: SolutionStep[],
  ): void {
    const sudoku = finder.board;
    const cornerSet = new Set(corners);
    const u3Indices: number[] = [];
    for (const idx of unit) {
      if (sudoku.cells[idx]! !== 0 && (sudoku.cells[idx]! & urMask) === 0 && !cornerSet.has(idx)) {
        u3Indices.push(idx);
      }
    }
    if (u3Indices.length === 0) return;
    this.u3Recursive(finder, unitType, unit, u3Indices, u3Cands, [...additional], 0, corners, cand1, cand2, out);
  }

  private u3Recursive(
    finder: CandidateFinder,
    unitType: number,
    unit: readonly number[],
    u3Indices: number[],
    candsIncluded: number,
    indicesIncluded: number[],
    startIndex: number,
    corners: number[],
    cand1: number,
    cand2: number,
    out: SolutionStep[],
  ): void {
    const sudoku = finder.board;
    for (let i = startIndex; i < u3Indices.length; i++) {
      const aktCands = candsIncluded | sudoku.cells[u3Indices[i]!]!;
      const aktIndices = [...indicesIncluded, u3Indices[i]!];
      if (unitType !== BLOCK || !isSameLineOrCol(aktIndices)) {
        if (ANZ_VALUES[aktCands]! === aktIndices.length - 1) {
          const step = this.makeURStep("UNIQUENESS_3", corners, cand1, cand2);
          const aktSet = new Set(aktIndices);
          for (const idx of unit) {
            if (sudoku.values[idx] === 0 && !aktSet.has(idx)) {
              for (const c of POSSIBLE_VALUES[sudoku.cells[idx]! & aktCands]!) {
                step.addCandidateToDelete(idx, c);
              }
            }
          }
          if (step.candidatesToDelete.length > 0) {
            for (const c of POSSIBLE_VALUES[aktCands]!) {
              for (const idx of aktIndices) if (sudoku.isCandidate(idx, c)) step.addFin(idx, c);
            }
            if (unitType === LINE || unitType === COL) {
              const block = blockForCheck3(aktIndices);
              if (block !== -1) {
                for (const idx of BLOCKS[block]!) {
                  if (sudoku.values[idx] === 0 && !aktSet.has(idx)) {
                    for (const c of POSSIBLE_VALUES[sudoku.cells[idx]! & aktCands]!) {
                      step.addCandidateToDelete(idx, c);
                    }
                  }
                }
              }
            }
            out.push(step);
          }
        }
      }
      this.u3Recursive(finder, unitType, unit, u3Indices, aktCands, aktIndices, i + 1, corners, cand1, cand2, out);
    }
  }

  private makeURStep(
    type: SolutionType,
    corners: number[],
    cand1: number,
    cand2: number,
  ): SolutionStep {
    const step = new SolutionStep(type);
    step.addValue(cand1);
    step.addValue(cand2);
    for (const c of corners) step.addIndex(c);
    return step;
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
