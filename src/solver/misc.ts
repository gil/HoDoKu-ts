/*
 * Port of HoDoKu's MiscellaneousSolver: Sue de Coq.
 *
 * At a box/line(or col) intersection of >=2 empty cells whose candidates exceed
 * the cell count by N (>=2), find N cells split across the line and the box (>=1
 * each) drawn only from those candidates, with disjoint candidate sets. The
 * construction lets candidates be eliminated from the rest of the box and line.
 * Two-level non-recursive stack search (line cells, then box cells).
 */

import { ANZ_VALUES, MAX_MASK, candidatesOf } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { UNIT_TEMPLATES } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const LINE_TPL = UNIT_TEMPLATES.slice(0, 9);
const COL_TPL = UNIT_TEMPLATES.slice(9, 18);
const BLOCK_TPL = UNIT_TEMPLATES.slice(18, 27);

interface StackEntry {
  aktIndex: number;
  indices: CellSet;
  candidates: number;
}

function newStack(): StackEntry[] {
  return Array.from({ length: 9 }, () => ({ aktIndex: 0, indices: new CellSet(), candidates: 0 }));
}

export class MiscSolver {
  private sudoku!: CandidateFinder["board"];
  private steps: SolutionStep[] = [];
  private onlyOne = false;

  private nonBlockSet = new CellSet();
  private blockSet = new CellSet();
  private intersectionSet = new CellSet();
  private intersectionActSet = new CellSet();
  private intersectionActCandSet = 0;
  private nonBlockActSet = new CellSet();
  private nonBlockActCandSet = 0;
  private blockActSet = new CellSet();
  private blockActCandSet = 0;
  private blockSourceSet = new CellSet();
  private nonBlockSourceSet = new CellSet();
  private tmpSet = new CellSet();
  private stack1 = newStack();
  private stack2 = newStack();
  private emptyCells = new CellSet();

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (type !== "SUE_DE_COQ") return null;
    this.steps = [];
    this.onlyOne = true;
    return this.getSueDeCoq(finder);
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (type !== "SUE_DE_COQ") return [];
    this.steps = [];
    this.onlyOne = false;
    this.getSueDeCoq(finder);
    return this.steps;
  }

  private getSueDeCoq(finder: CandidateFinder): SolutionStep | null {
    this.sudoku = finder.board;
    this.emptyCells = finder.getEmptyCells();
    const step = this.sueDeCoqInt(LINE_TPL);
    if (this.onlyOne && step) return step;
    return this.sueDeCoqInt(COL_TPL);
  }

  private sueDeCoqInt(nonBlocks: readonly CellSet[]): SolutionStep | null {
    for (const nb of nonBlocks) {
      this.nonBlockSet.setAnd(nb, this.emptyCells);
      for (const blk of BLOCK_TPL) {
        this.blockSet.setAnd(blk, this.emptyCells);
        this.intersectionSet.set(this.nonBlockSet);
        this.intersectionSet.and(this.blockSet);
        if (this.intersectionSet.size() < 2) continue;
        const step = this.checkIntersection();
        if (this.onlyOne && step) return step;
      }
    }
    return null;
  }

  private checkIntersection(): SolutionStep | null {
    const inter = this.intersectionSet.toArray();
    const max = inter.length;
    this.intersectionActSet.clear();
    for (let i1 = 0; i1 < max - 1; i1++) {
      const index1 = inter[i1]!;
      this.intersectionActSet.add(index1);
      const cand1 = this.sudoku.cells[index1]!;
      for (let i2 = i1 + 1; i2 < max; i2++) {
        const index2 = inter[i2]!;
        const cand2 = cand1 | this.sudoku.cells[index2]!;
        this.intersectionActSet.add(index2);
        if (ANZ_VALUES[cand2]! - 2 >= 2) {
          const step = this.checkHousesEntry(ANZ_VALUES[cand2]! - 2, cand2);
          if (this.onlyOne && step) return step;
        }
        for (let i3 = i2 + 1; i3 < max; i3++) {
          const index3 = inter[i3]!;
          const cand3 = cand2 | this.sudoku.cells[index3]!;
          if (ANZ_VALUES[cand3]! - 3 >= 2) {
            this.intersectionActSet.add(index3);
            const step = this.checkHousesEntry(ANZ_VALUES[cand3]! - 3, cand3);
            if (this.onlyOne && step) return step;
            this.intersectionActSet.remove(index3);
          }
        }
        this.intersectionActSet.remove(index2);
      }
      this.intersectionActSet.remove(index1);
    }
    return null;
  }

  private checkHousesEntry(nPlus: number, cand: number): SolutionStep | null {
    this.intersectionActCandSet = cand;
    this.nonBlockSourceSet.set(this.nonBlockSet);
    this.nonBlockSourceSet.andNot(this.intersectionActSet);
    return this.checkHouses(nPlus, this.nonBlockSourceSet, MAX_MASK, false);
  }

  private checkHouses(
    nPlus: number,
    sourceSet: CellSet,
    allowedCandSet: number,
    secondCheck: boolean,
  ): SolutionStep | null {
    if (sourceSet.isEmpty()) return null;
    const src = sourceSet.toArray();
    const stack = secondCheck ? this.stack2 : this.stack1;
    const max = src.length;
    let level = 1;
    stack[0]!.aktIndex = -1;
    stack[0]!.candidates = 0;
    stack[0]!.indices.clear();
    stack[1]!.aktIndex = -1;
    for (;;) {
      while (stack[level]!.aktIndex >= max - 1) {
        level--;
        if (level <= 0) return null;
      }
      stack[level]!.aktIndex++;
      const cellIdx = src[stack[level]!.aktIndex]!;
      stack[level]!.indices.set(stack[level - 1]!.indices);
      stack[level]!.indices.add(cellIdx);
      stack[level]!.candidates = stack[level - 1]!.candidates | this.sudoku.cells[cellIdx]!;

      const cands = stack[level]!.candidates;
      if ((cands & ~allowedCandSet) === 0) {
        const anzContained = ANZ_VALUES[cands & this.intersectionActCandSet]!;
        const extraMask = cands & ~this.intersectionActCandSet & MAX_MASK;
        const anzExtra = ANZ_VALUES[extraMask]!;

        if (!secondCheck) {
          if (anzContained > 0 && level > anzExtra && level - anzExtra < nPlus) {
            this.nonBlockActSet = stack[level]!.indices.clone();
            this.nonBlockActCandSet = stack[level]!.candidates;
            this.blockSourceSet.set(this.blockSet);
            this.blockSourceSet.andNot(this.intersectionActSet);
            this.blockSourceSet.andNot(this.nonBlockActSet);
            let blockAllowed = this.nonBlockActCandSet;
            blockAllowed &= ~extraMask;
            blockAllowed = ~blockAllowed;
            const step = this.checkHouses(
              nPlus - (this.nonBlockActSet.size() - anzExtra),
              this.blockSourceSet,
              blockAllowed,
              true,
            );
            if (this.onlyOne && step) return step;
          }
        } else {
          if (anzContained > 0 && stack[level]!.indices.size() - anzExtra === nPlus) {
            const step = this.buildStep(stack[level]!);
            if (this.onlyOne && step) return step;
          }
        }
      }

      if (stack[level]!.aktIndex < max - 1) {
        level++;
        stack[level]!.aktIndex = stack[level - 1]!.aktIndex;
      }
    }
  }

  private buildStep(blockEntry: StackEntry): SolutionStep | null {
    const step = new SolutionStep("SUE_DE_COQ");
    this.blockActSet = blockEntry.indices.clone();
    this.blockActCandSet = blockEntry.candidates;
    const bothExtra = this.blockActCandSet & this.nonBlockActCandSet;

    // eliminations in the block
    this.tmpSet.set(this.blockSet);
    this.tmpSet.andNot(this.blockActSet);
    this.tmpSet.andNot(this.intersectionActSet);
    let candMask =
      (((this.intersectionActCandSet | this.blockActCandSet) & ~this.nonBlockActCandSet) |
        bothExtra) &
      MAX_MASK;
    this.checkCandidatesToDelete(step, this.tmpSet, candMask);

    // eliminations in the row/col
    this.tmpSet.set(this.nonBlockSet);
    this.tmpSet.andNot(this.nonBlockActSet);
    this.tmpSet.andNot(this.intersectionActSet);
    candMask =
      (((this.intersectionActCandSet | this.nonBlockActCandSet) & ~this.blockActCandSet) |
        bothExtra) &
      MAX_MASK;
    this.checkCandidatesToDelete(step, this.tmpSet, candMask);

    if (step.candidatesToDelete.length === 0) return null;

    for (const idx of this.intersectionActSet) step.addIndex(idx);
    for (const c of candidatesOf(this.intersectionActCandSet)) step.addValue(c);
    this.addSetCandidates(this.nonBlockActSet, this.nonBlockActCandSet, step.fins);
    this.addSetCandidates(this.blockActSet, this.blockActCandSet, step.endoFins);
    step.addAls(this.intersectionActSet.toArray(), candidatesOf(this.intersectionActCandSet).slice());
    step.addAls(this.blockActSet.toArray(), candidatesOf(this.blockActCandSet).slice());
    step.addAls(this.nonBlockActSet.toArray(), candidatesOf(this.nonBlockActCandSet).slice());
    this.steps.push(step);
    return step;
  }

  private addSetCandidates(
    srcSet: CellSet,
    candSet: number,
    dest: { index: number; value: number }[],
  ): void {
    this.tmpSet.set(srcSet);
    this.tmpSet.or(this.intersectionActSet);
    for (const index of this.tmpSet) {
      const m = this.sudoku.cells[index]! & candSet;
      if (m !== 0) for (const c of candidatesOf(m)) dest.push({ index, value: c });
    }
  }

  private checkCandidatesToDelete(step: SolutionStep, set: CellSet, candMask: number): void {
    if (set.isEmpty() || ANZ_VALUES[candMask & MAX_MASK] === 0) return;
    for (const index of set) {
      const m = this.sudoku.cells[index]! & candMask;
      if (m === 0) continue;
      for (const c of candidatesOf(m)) step.addCandidateToDelete(index, c);
    }
  }
}
