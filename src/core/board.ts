/*
 * Port of HoDoKu's Sudoku2 board model.
 *
 * Cell candidates are 9-bit masks in `cells` (0 = cell already set). `values`
 * holds the placed digit (0 = empty). `free[constraint][digit]` counts how many
 * unsolved cells in a constraint still allow that digit — the basis for Hidden
 * Single detection. The Java singles *queues* are a pure speed optimisation and
 * are intentionally omitted: which singles exist is unchanged, so ratings match.
 */

import { ANZ_VALUES, MASKS, MAX_MASK, POSSIBLE_VALUES, candidatesOf } from "./candidates.js";
import { BUDDIES, CONSTRAINTS, LENGTH, getIndex } from "./tables.js";

const CONSTRAINT_COUNT = 27;

export class Board {
  /** Candidate bitmask per cell; 0 once the cell is set. */
  readonly cells = new Uint16Array(LENGTH);
  /** Placed value per cell, 0 = empty. */
  readonly values = new Int8Array(LENGTH);
  /** Whether the cell is a given. */
  readonly fixed = new Uint8Array(LENGTH);
  /** Known solution per cell (valid only when solutionSet). */
  readonly solution = new Int8Array(LENGTH);
  solutionSet = false;

  /** free[constraint][digit] = count of unsolved cells in the constraint that allow digit (1-9). */
  readonly free: Int16Array[] = Array.from({ length: CONSTRAINT_COUNT }, () => new Int16Array(10));

  unsolvedCells = LENGTH;
  score = 0;
  level = 0;

  constructor() {
    this.clear();
  }

  clear(): void {
    this.cells.fill(MAX_MASK);
    this.values.fill(0);
    this.fixed.fill(0);
    this.solution.fill(0);
    for (const f of this.free) f.fill(9);
    this.unsolvedCells = LENGTH;
    this.solutionSet = false;
  }

  clone(): Board {
    const b = new Board();
    b.set(this);
    return b;
  }

  set(src: Board): this {
    this.cells.set(src.cells);
    this.values.set(src.values);
    this.fixed.set(src.fixed);
    this.solution.set(src.solution);
    for (let i = 0; i < CONSTRAINT_COUNT; i++) this.free[i]!.set(src.free[i]!);
    this.unsolvedCells = src.unsolvedCells;
    this.solutionSet = src.solutionSet;
    this.score = src.score;
    this.level = src.level;
    return this;
  }

  getValue(index: number): number {
    return this.values[index]!;
  }

  isFixed(index: number): boolean {
    return this.fixed[index] === 1;
  }

  isCandidate(index: number, cand: number): boolean {
    return (this.cells[index]! & MASKS[cand]!) !== 0;
  }

  getAnzCandidates(index: number): number {
    return ANZ_VALUES[this.cells[index]!]!;
  }

  getAllCandidates(index: number): readonly number[] {
    return POSSIBLE_VALUES[this.cells[index]!]!;
  }

  /** Whether `value` is allowed at `index` (no buddy already holds it). */
  isValidValue(index: number, value: number): boolean {
    const buds = BUDDIES[index]!.toArray();
    for (let i = 0; i < buds.length; i++) {
      if (this.values[buds[i]!] === value) return false;
    }
    return true;
  }

  /** Delete a candidate; returns false if the cell becomes empty (puzzle invalid). */
  delCandidate(index: number, value: number): boolean {
    return this.setCandidate(index, value, false);
  }

  /**
   * Set or delete a candidate, updating `free`. Returns false only when a
   * deletion empties the cell.
   */
  setCandidate(index: number, value: number, set = true): boolean {
    const bit = MASKS[value]!;
    if (set) {
      if ((this.cells[index]! & bit) === 0) {
        this.cells[index]! |= bit;
        const con = CONSTRAINTS[index]!;
        this.free[con[0]]![value]!++;
        this.free[con[1]]![value]!++;
        this.free[con[2]]![value]!++;
      }
    } else {
      if ((this.cells[index]! & bit) !== 0) {
        this.cells[index]! &= ~bit & MAX_MASK;
        if (this.cells[index] === 0) return false;
        const con = CONSTRAINTS[index]!;
        this.free[con[0]]![value]!--;
        this.free[con[1]]![value]!--;
        this.free[con[2]]![value]!--;
      }
    }
    return true;
  }

  /**
   * Place `value` at `index` (value 0 clears the cell). Eliminates the digit
   * from buddies and keeps `free` / `unsolvedCells` consistent. Returns false if
   * the move makes the puzzle invalid.
   */
  setCell(index: number, value: number, isFixed = false): boolean {
    if (this.values[index] === value) return true;
    let valid = true;
    const oldValue = this.values[index]!;
    this.values[index] = value;
    this.fixed[index] = isFixed ? 1 : 0;

    if (value !== 0) {
      const cands = POSSIBLE_VALUES[this.cells[index]!]!;
      this.cells[index] = 0;
      this.unsolvedCells--;
      const buds = BUDDIES[index]!.toArray();
      for (let i = 0; i < buds.length; i++) {
        if (!this.setCandidate(buds[i]!, value, false)) valid = false;
      }
      for (let i = 0; i < cands.length; i++) {
        const cand = cands[i]!;
        const con = CONSTRAINTS[index]!;
        for (let j = 0; j < 3; j++) {
          const newFree = --this.free[con[j]!]![cand]!;
          if (newFree === 0 && cand !== value) valid = false;
        }
      }
    } else {
      for (let cand = 1; cand <= 9; cand++) {
        if (this.isValidValue(index, cand)) this.setCandidate(index, cand, true);
      }
      const buds = BUDDIES[index]!.toArray();
      for (let i = 0; i < buds.length; i++) {
        const b = buds[i]!;
        if (this.values[b] === 0 && this.isValidValue(b, oldValue)) {
          this.setCandidate(b, oldValue, true);
        }
      }
      this.rebuildInternalData();
    }
    return valid;
  }

  /** Fast cell set for the brute-force solver: no `free` / validity bookkeeping. */
  setCellBS(index: number, value: number): void {
    this.values[index] = value;
    this.cells[index] = 0;
    const buds = BUDDIES[index]!.toArray();
    for (let i = 0; i < buds.length; i++) this.cells[buds[i]!]! &= ~MASKS[value]! & MAX_MASK;
  }

  /** Recompute `free`, `unsolvedCells` from `cells` / `values`. */
  rebuildInternalData(): void {
    for (const f of this.free) f.fill(0);
    let anz = 0;
    for (let index = 0; index < LENGTH; index++) {
      if (this.values[index] !== 0) {
        this.cells[index] = 0;
      } else {
        anz++;
        const cands = POSSIBLE_VALUES[this.cells[index]!]!;
        const con = CONSTRAINTS[index]!;
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i]!;
          this.free[con[0]]![c]!++;
          this.free[con[1]]![c]!++;
          this.free[con[2]]![c]!++;
        }
      }
    }
    this.unsolvedCells = anz;
  }

  /** Validate against placed values / solution; rebuilds internal data. */
  checkSudoku(): boolean {
    this.rebuildInternalData();
    for (let index = 0; index < LENGTH; index++) {
      if (this.values[index] !== 0) {
        if (!this.isValidValue(index, this.values[index]!)) return false;
        if (this.solutionSet && this.solution[index] !== this.values[index]) return false;
      } else {
        const cands = POSSIBLE_VALUES[this.cells[index]!]!;
        for (let i = 0; i < cands.length; i++) {
          if (!this.isValidValue(index, cands[i]!)) return false;
        }
        if (this.solutionSet && !this.isCandidate(index, this.solution[index]!)) return false;
      }
    }
    return true;
  }

  isSolved(): boolean {
    return this.unsolvedCells === 0;
  }

  getCandidates(index: number): readonly number[] {
    return candidatesOf(this.cells[index]!);
  }

  setSolution(sol: ArrayLike<number>): void {
    this.solution.set(sol as Int8Array);
    this.solutionSet = true;
  }

  /** Serialize placed values to an 81-char string ('.' for empty). */
  toString(): string {
    let s = "";
    for (let i = 0; i < LENGTH; i++) s += this.values[i] === 0 ? "." : String(this.values[i]);
    return s;
  }

  /** 81-char string of candidate counts is not produced here; see core/format. */
  static fromString(init: string): Board {
    const b = new Board();
    b.loadString(init);
    return b;
  }

  /** Builds a board by placing every non-zero value (as givens by default). */
  static fromValues(values: ArrayLike<number>, fixed = true): Board {
    const b = new Board();
    for (let i = 0; i < LENGTH; i++) {
      const v = values[i]!;
      if (v) b.setCell(i, v, fixed);
    }
    return b;
  }

  /**
   * Loads a puzzle. Supports the plain 81-character format (digits 1-9, with
   * '.' or '0' for empty) and the HoDoKu library format
   * `:technique:candidates:givens:deletions:...` used by the regression library.
   */
  loadString(init: string): void {
    this.clear();
    if (!init) return;

    let givens = init;
    let candDelStr = "";
    let libraryFormat = false;
    const colonCount = (init.match(/:/g) ?? []).length;
    if (!init.includes("\n") && (colonCount === 6 || colonCount === 7)) {
      libraryFormat = true;
      const parts = init.split(":");
      givens = parts[3] ?? "";
      candDelStr = parts[4] ?? "";
    }

    // In library format a '+' before a digit marks a placed-but-not-given cell.
    let cell = 0;
    let notGiven = false;
    for (const ch of givens) {
      if (cell >= LENGTH) break;
      if (ch === "+") {
        notGiven = true;
        continue;
      }
      if (ch >= "1" && ch <= "9") {
        this.setCell(cell, ch.charCodeAt(0) - 48, !notGiven);
        cell++;
      } else if (ch === "." || ch === "0") {
        cell++;
      }
      notGiven = false;
    }

    if (libraryFormat && candDelStr.length > 0) {
      for (const token of candDelStr.split(" ")) {
        if (token.length === 0) continue;
        let candPos = parseInt(token, 10);
        const col = candPos % 10;
        candPos = (candPos / 10) | 0;
        const row = candPos % 10;
        candPos = (candPos / 10) | 0;
        this.setCandidate(getIndex(row - 1, col - 1), candPos, false);
      }
    }
  }
}
