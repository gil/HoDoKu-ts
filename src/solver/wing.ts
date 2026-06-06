/*
 * Port of HoDoKu's WingSolver: XY-Wing, XYZ-Wing and W-Wing.
 *
 * XY/XYZ: a pivot bivalue (XY) or trivalue (XYZ) cell with two bivalue pincers;
 *   the three cells share exactly three candidates, the pincers share candidate
 *   z, which is eliminated from cells that see both pincers (and the pivot, XYZ).
 * W-Wing: two bivalue cells with the same candidates {x,y} joined by a strong
 *   link on y; x is eliminated from cells seeing both bivalue cells.
 */

import type { Board } from "../core/board.js";
import { ANZ_VALUES, CAND_FROM_MASK } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { ALL_UNITS, BUDDIES, LENGTH } from "../core/tables.js";

/** Minimal view of the step finder needed by the wing search. */
export interface CandidateFinder {
  board: Board;
  getCandidates(): CellSet[];
}

export class WingSolver {
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
      case "XY_WING":
        return this.getWing(finder, false);
      case "XYZ_WING":
        return this.getWing(finder, true);
      case "W_WING":
        return this.getWWing(finder);
      default:
        return null;
    }
  }

  private getWing(finder: CandidateFinder, xyz: boolean): SolutionStep | null {
    const sudoku = finder.board;
    const candidates = finder.getCandidates();
    const biCells: number[] = [];
    const triCells: number[] = [];
    for (let i = 0; i < LENGTH; i++) {
      const n = sudoku.getAnzCandidates(i);
      if (n === 2) biCells.push(i);
      else if (xyz && n === 3) triCells.push(i);
    }
    const biTri = xyz ? triCells : biCells;
    const endIndex = biTri.length;
    const elimSet = new CellSet();

    for (let i = 0; i < endIndex; i++) {
      for (let j = xyz ? 0 : i + 1; j < biCells.length; j++) {
        if (ANZ_VALUES[sudoku.cells[biTri[i]!]! | sudoku.cells[biCells[j]!]!]! !== 3) continue;
        for (let k = j + 1; k < biCells.length; k++) {
          let index1 = biTri[i]!;
          let index2 = biCells[j]!;
          let index3 = biCells[k]!;
          let cell1 = sudoku.cells[index1]!;
          let cell2 = sudoku.cells[index2]!;
          let cell3 = sudoku.cells[index3]!;
          if (ANZ_VALUES[cell1 | cell2 | cell3]! !== 3) continue;
          if (cell1 === cell2 || cell2 === cell3 || cell3 === cell1) continue;

          const maxTries = xyz ? 1 : 3;
          for (let tries = 0; tries < maxTries; tries++) {
            if (tries === 1) {
              index1 = biCells[j]!;
              index2 = biTri[i]!;
              index3 = biCells[k]!;
              cell1 = sudoku.cells[index1]!;
              cell2 = sudoku.cells[index2]!;
              cell3 = sudoku.cells[index3]!;
            } else if (tries === 2) {
              index1 = biCells[k]!;
              index2 = biCells[j]!;
              index3 = biTri[i]!;
              cell1 = sudoku.cells[index1]!;
              cell2 = sudoku.cells[index2]!;
              cell3 = sudoku.cells[index3]!;
            }
            if (!BUDDIES[index1]!.contains(index2) || !BUDDIES[index1]!.contains(index3)) continue;
            const cell = cell2 & cell3;
            if (ANZ_VALUES[cell]! !== 1) continue;
            const candZ = CAND_FROM_MASK[cell]!;
            elimSet.setAnd(BUDDIES[index2]!, BUDDIES[index3]!);
            elimSet.and(candidates[candZ]!);
            if (xyz) elimSet.and(BUDDIES[index1]!);
            if (elimSet.isEmpty()) continue;

            const step = new SolutionStep(xyz ? "XYZ_WING" : "XY_WING");
            const cands = sudoku.getAllCandidates(index1);
            step.addValue(cands[0]!);
            step.addValue(cands[1]!);
            if (xyz) step.addValue(cands[2]!);
            else step.addValue(candZ);
            step.addIndex(index1);
            step.addIndex(index2);
            step.addIndex(index3);
            if (xyz) step.addFin(index1, candZ);
            step.addFin(index2, candZ);
            step.addFin(index3, candZ);
            for (const e of elimSet) step.addCandidateToDelete(e, candZ);
            const r = this.emit(step);
            if (r) return r;
          }
        }
      }
    }
    return null;
  }

  private getWWing(finder: CandidateFinder): SolutionStep | null {
    const sudoku = finder.board;
    const candidates = finder.getCandidates();
    const preCalc1 = new CellSet();
    const preCalc2 = new CellSet();
    const elimSet = new CellSet();

    for (let i = 0; i < LENGTH; i++) {
      if (sudoku.values[i] !== 0 || sudoku.getAnzCandidates(i) !== 2) continue;
      const cell1 = sudoku.cells[i]!;
      const cands = sudoku.getAllCandidates(i);
      const cand1 = cands[0]!;
      const cand2 = cands[1]!;
      preCalc1.setAnd(BUDDIES[i]!, candidates[cand1]!);
      preCalc2.setAnd(BUDDIES[i]!, candidates[cand2]!);
      for (let j = i + 1; j < LENGTH; j++) {
        if (sudoku.cells[j] !== cell1) continue;
        elimSet.setAnd(preCalc1, BUDDIES[j]!);
        if (!elimSet.isEmpty()) {
          const step = this.checkLink(finder, cand1, cand2, i, j, elimSet);
          if (step) return step;
        }
        elimSet.setAnd(preCalc2, BUDDIES[j]!);
        if (!elimSet.isEmpty()) {
          const step = this.checkLink(finder, cand2, cand1, i, j, elimSet);
          if (step) return step;
        }
      }
    }
    return null;
  }

  private checkLink(
    finder: CandidateFinder,
    cand1: number,
    cand2: number,
    index1: number,
    index2: number,
    elimSet: CellSet,
  ): SolutionStep | null {
    const sudoku = finder.board;
    for (let constr = 0; constr < 27; constr++) {
      if (sudoku.free[constr]![cand2] !== 2) continue;
      let wIndex1 = -1;
      let wIndex2 = -1;
      let sees1 = false;
      let sees2 = false;
      for (const aktIndex of ALL_UNITS[constr]!) {
        if (aktIndex !== index1 && aktIndex !== index2 && sudoku.isCandidate(aktIndex, cand2)) {
          if (BUDDIES[aktIndex]!.contains(index1)) {
            sees1 = true;
            wIndex1 = aktIndex;
          } else if (BUDDIES[aktIndex]!.contains(index2)) {
            sees2 = true;
            wIndex2 = aktIndex;
          }
        }
        if (sees1 && sees2) break;
      }
      if (sees1 && sees2) {
        const step = new SolutionStep("W_WING");
        step.addValue(cand1);
        step.addValue(cand2);
        step.addIndex(index1);
        step.addIndex(index2);
        step.addFin(index1, cand2);
        step.addFin(index2, cand2);
        step.addFin(wIndex1, cand2);
        step.addFin(wIndex2, cand2);
        for (const e of elimSet) step.addCandidateToDelete(e, cand1);
        const r = this.emit(step);
        if (r) return r;
      }
    }
    return null;
  }
}
