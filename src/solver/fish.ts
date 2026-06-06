/*
 * Basic Fish: X-Wing (2), Swordfish (3), Jellyfish (4).
 *
 * For one digit, pick N base units (rows or cols) in which the digit's positions
 * fall within exactly N perpendicular cover units; the digit can then be removed
 * from the cover units outside the base. Both orientations (rows-base, cols-base)
 * are tried. Finned/Sashimi/Franken/Mutant variants are handled by the full Fish
 * port in a later phase.
 */

import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { COL, COLS, LINE, LINES, getIndex } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const SIZE: Record<string, number> = { X_WING: 2, SWORDFISH: 3, JELLYFISH: 4 };

export class FishSolver {
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
    const size = SIZE[type];
    if (size === undefined) return null;
    const r = this.search(finder, size, true); // rows as base
    if (r && !this.collector) return r;
    return this.search(finder, size, false); // cols as base
  }

  private search(finder: CandidateFinder, size: number, rowsBase: boolean): SolutionStep | null {
    const sudoku = finder.board;
    const baseUnits = rowsBase ? LINES : COLS;
    const baseFreeOffset = rowsBase ? 0 : 9; // free[] index offset
    const type: SolutionType = size === 2 ? "X_WING" : size === 3 ? "SWORDFISH" : "JELLYFISH";

    for (let cand = 1; cand <= 9; cand++) {
      // candidate base units: digit present in 2..size cells, with their cover bitmask
      const units: { unit: number; mask: number }[] = [];
      for (let u = 0; u < 9; u++) {
        const f = sudoku.free[baseFreeOffset + u]![cand]!;
        if (f < 2 || f > size) continue;
        let mask = 0;
        const cells = baseUnits[u]!;
        for (let p = 0; p < 9; p++) {
          if (sudoku.isCandidate(cells[p]!, cand)) mask |= 1 << p;
        }
        units.push({ unit: u, mask });
      }
      const step = this.combine(finder, cand, size, rowsBase, type, units);
      if (step && !this.collector) return step;
    }
    return null;
  }

  private combine(
    finder: CandidateFinder,
    cand: number,
    size: number,
    rowsBase: boolean,
    type: SolutionType,
    units: { unit: number; mask: number }[],
  ): SolutionStep | null {
    const chosen: number[] = [];
    const search = (start: number, mask: number): SolutionStep | null => {
      if (chosen.length === size) {
        if (popcount(mask) !== size) return null;
        const step = this.makeStep(finder, cand, rowsBase, type, chosen, mask, units);
        if (step) {
          const r = this.emit(step);
          if (r) return r;
        }
        return null;
      }
      for (let i = start; i < units.length; i++) {
        const m = mask | units[i]!.mask;
        if (popcount(m) > size) continue;
        chosen.push(i);
        const r = search(i + 1, m);
        if (r) return r;
        chosen.pop();
      }
      return null;
    };
    return search(0, 0);
  }

  private makeStep(
    finder: CandidateFinder,
    cand: number,
    rowsBase: boolean,
    type: SolutionType,
    chosen: number[],
    coverMask: number,
    units: { unit: number; mask: number }[],
  ): SolutionStep | null {
    const sudoku = finder.board;
    const baseUnitNums = chosen.map((i) => units[i]!.unit);
    const coverUnitNums: number[] = [];
    for (let p = 0; p < 9; p++) if (coverMask & (1 << p)) coverUnitNums.push(p);

    // Eliminations: digit in cover units, in cells not belonging to a base unit.
    const elim: number[] = [];
    const baseSet = new Set(baseUnitNums);
    for (const cover of coverUnitNums) {
      for (const base of allNineUnits()) {
        if (baseSet.has(base)) continue;
        const index = rowsBase ? getIndex(base, cover) : getIndex(cover, base);
        if (sudoku.isCandidate(index, cand)) elim.push(index);
      }
    }
    if (elim.length === 0) return null;

    const step = new SolutionStep(type);
    step.addValue(cand);
    const baseType = rowsBase ? LINE : COL;
    const coverType = rowsBase ? COL : LINE;
    for (const u of baseUnitNums) step.addBaseEntity(baseType, u + 1);
    for (const c of coverUnitNums) step.addCoverEntity(coverType, c + 1);
    for (const base of baseUnitNums) {
      for (const cover of coverUnitNums) {
        const index = rowsBase ? getIndex(base, cover) : getIndex(cover, base);
        if (sudoku.isCandidate(index, cand)) step.addIndex(index);
      }
    }
    for (const e of elim) step.addCandidateToDelete(e, cand);
    return step;
  }
}

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

const NINE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
function allNineUnits(): number[] {
  return NINE;
}
