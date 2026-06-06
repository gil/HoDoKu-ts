/*
 * Port of HoDoKu's SimpleSolver: Full Houses, Naked/Hidden Singles,
 * Naked/Hidden Subsets (with Locked Subset detection) and Locked Candidates.
 *
 * The singles queues from the Java version are a speed optimisation only; here
 * singles are detected directly from `free` and `cells`, which yields identical
 * steps. Subset and Locked-Candidate logic follows the original closely so the
 * LOCKED vs NAKED classification (and thus the score) matches exactly.
 */

import type { Board } from "../core/board.js";
import {
  ANZ_VALUES,
  CAND_FROM_MASK,
  MASKS,
  MAX_MASK,
  POSSIBLE_VALUES,
} from "../core/candidates.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { ALL_UNITS, BLOCKS, BLOCK, COL, COLS, CONSTRAINTS, LINE, LINES } from "../core/tables.js";

function constraintType(c: number): number {
  return c < 9 ? LINE : c < 18 ? COL : BLOCK;
}
function constraintNumber(c: number): number {
  return (c % 9) + 1;
}

export class SimpleSolver {
  /** When non-null, find* methods collect every step here instead of returning the first. */
  private collector: SolutionStep[] | null = null;

  /** Returns all instances of `type` in the grid (used by the all-steps API and golden tests). */
  findAll(board: Board, type: SolutionType): SolutionStep[] {
    const out: SolutionStep[] = [];
    this.collector = out;
    try {
      this.getStep(board, type);
    } finally {
      this.collector = null;
    }
    return out;
  }

  /** Records a found step: collects it (continue) or returns it (stop). */
  private emit(step: SolutionStep): SolutionStep | null {
    if (this.collector) {
      this.collector.push(step);
      return null;
    }
    return step;
  }

  getStep(board: Board, type: SolutionType): SolutionStep | null {
    switch (type) {
      case "FULL_HOUSE":
        return this.findFullHouse(board);
      case "HIDDEN_SINGLE":
        return this.findHiddenSingle(board);
      case "NAKED_SINGLE":
        return this.findNakedSingle(board);
      case "HIDDEN_PAIR":
        return this.findHiddenXle(board, 2);
      case "HIDDEN_TRIPLE":
        return this.findHiddenXle(board, 3);
      case "HIDDEN_QUADRUPLE":
        return this.findHiddenXle(board, 4);
      case "LOCKED_PAIR":
        return this.findNakedXle(board, 2, true);
      case "NAKED_PAIR":
        return this.findNakedXle(board, 2, false);
      case "LOCKED_TRIPLE":
        return this.findNakedXle(board, 3, true);
      case "NAKED_TRIPLE":
        return this.findNakedXle(board, 3, false);
      case "NAKED_QUADRUPLE":
        return this.findNakedXle(board, 4, false);
      case "LOCKED_CANDIDATES":
      case "LOCKED_CANDIDATES_1":
      case "LOCKED_CANDIDATES_2":
        return this.findLockedCandidates(board, type);
      default:
        return null;
    }
  }

  private findFullHouse(board: Board): SolutionStep | null {
    for (let index = 0; index < 81; index++) {
      if (board.values[index] !== 0 || ANZ_VALUES[board.cells[index]!] !== 1) continue;
      const value = CAND_FROM_MASK[board.cells[index]!]!;
      for (const constr of CONSTRAINTS[index]!) {
        let valid = true;
        for (let j = 1; j <= 9; j++) {
          if (j !== value && board.free[constr]![j] !== 0) {
            valid = false;
            break;
          }
        }
        if (valid) {
          const step = new SolutionStep("FULL_HOUSE");
          step.addValue(value);
          step.addIndex(index);
          const r = this.emit(step);
          if (r) return r;
          break; // record a Full House only once per cell
        }
      }
    }
    return null;
  }

  private findNakedSingle(board: Board): SolutionStep | null {
    for (let index = 0; index < 81; index++) {
      if (board.values[index] === 0 && ANZ_VALUES[board.cells[index]!] === 1) {
        const step = new SolutionStep("NAKED_SINGLE");
        step.addValue(CAND_FROM_MASK[board.cells[index]!]!);
        step.addIndex(index);
        const r = this.emit(step);
        if (r) return r;
      }
    }
    return null;
  }

  private findHiddenSingle(board: Board): SolutionStep | null {
    const seen = new Set<number>();
    for (let c = 0; c < 27; c++) {
      const unit = ALL_UNITS[c]!;
      for (let value = 1; value <= 9; value++) {
        if (board.free[c]![value] !== 1) continue;
        for (const index of unit) {
          if (board.values[index] === 0 && board.isCandidate(index, value)) {
            if (seen.has(index * 10 + value)) break;
            seen.add(index * 10 + value);
            const step = new SolutionStep("HIDDEN_SINGLE");
            step.addValue(value);
            step.addIndex(index);
            const r = this.emit(step);
            if (r) return r;
            break;
          }
        }
      }
    }
    return null;
  }

  private findNakedXle(board: Board, anz: number, lockedOnly: boolean): SolutionStep | null {
    let step = this.findNakedXleInEntity(board, BLOCKS, anz, lockedOnly, !lockedOnly);
    if (!this.collector && (step !== null || lockedOnly)) return step;
    if (lockedOnly) return null; // Locked Subsets are found in blocks only
    step = this.findNakedXleInEntity(board, LINES, anz, lockedOnly, !lockedOnly);
    if (!this.collector && step !== null) return step;
    step = this.findNakedXleInEntity(board, COLS, anz, lockedOnly, !lockedOnly);
    return this.collector ? null : step;
  }

  private findNakedXleInEntity(
    board: Board,
    units: readonly (readonly number[])[],
    anz: number,
    lockedOnly: boolean,
    nakedOnly: boolean,
  ): SolutionStep | null {
    const tmp = new Array<number>(9);
    for (const unit of units) {
      let maxIndex = 0;
      for (const cellIdx of unit) {
        const tmpAnz = ANZ_VALUES[board.cells[cellIdx]!]!;
        if (tmpAnz !== 0 && tmpAnz <= anz) tmp[maxIndex++] = cellIdx;
      }
      if (maxIndex < anz) continue;
      for (let i1 = 0; i1 < maxIndex - anz + 1; i1++) {
        const cell1 = board.cells[tmp[i1]!]!;
        for (let i2 = i1 + 1; i2 < maxIndex - anz + 2; i2++) {
          const cell2 = cell1 | board.cells[tmp[i2]!]!;
          if (ANZ_VALUES[cell2]! > anz) continue;
          if (anz === 2) {
            if (ANZ_VALUES[cell2] === anz) {
              const step = this.createSubsetStep(
                board,
                [tmp[i1]!, tmp[i2]!],
                cell2,
                "NAKED_PAIR",
                lockedOnly,
                nakedOnly,
              );
              if (step !== null) return step;
            }
          } else {
            for (let i3 = i2 + 1; i3 < maxIndex - anz + 3; i3++) {
              const cell3 = cell2 | board.cells[tmp[i3]!]!;
              if (ANZ_VALUES[cell3]! > anz) continue;
              if (anz === 3) {
                if (ANZ_VALUES[cell3] === anz) {
                  const step = this.createSubsetStep(
                    board,
                    [tmp[i1]!, tmp[i2]!, tmp[i3]!],
                    cell3,
                    "NAKED_TRIPLE",
                    lockedOnly,
                    nakedOnly,
                  );
                  if (step !== null) return step;
                }
              } else {
                for (let i4 = i3 + 1; i4 < maxIndex; i4++) {
                  const cell4 = cell3 | board.cells[tmp[i4]!]!;
                  if (ANZ_VALUES[cell4]! > anz) continue;
                  if (ANZ_VALUES[cell4] === anz) {
                    const step = this.createSubsetStep(
                      board,
                      [tmp[i1]!, tmp[i2]!, tmp[i3]!, tmp[i4]!],
                      cell4,
                      "NAKED_QUADRUPLE",
                      lockedOnly,
                      nakedOnly,
                    );
                    if (step !== null) return step;
                  }
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  private findHiddenXle(board: Board, anz: number): SolutionStep | null {
    let step = this.findHiddenXleInEntity(board, 18, BLOCKS, anz);
    if (!this.collector && step !== null) return step;
    step = this.findHiddenXleInEntity(board, 0, LINES, anz);
    if (!this.collector && step !== null) return step;
    step = this.findHiddenXleInEntity(board, 9, COLS, anz);
    return this.collector ? null : step;
  }

  private findHiddenXleInEntity(
    board: Board,
    constraintBase: number,
    units: readonly (readonly number[])[],
    anz: number,
  ): SolutionStep | null {
    const ipcMask = new Array<number>(10).fill(0);
    for (let entity = 0; entity < units.length; entity++) {
      const unit = units[entity]!;
      let maxIndex = 0;
      for (const cellIdx of unit) if (board.cells[cellIdx] !== 0) maxIndex++;
      if (maxIndex <= anz) continue;

      let candMask = 0;
      const free = board.free[constraintBase + entity]!;
      for (let i = 1; i <= 9; i++) {
        const actFree = free[i]!;
        if (actFree !== 0 && actFree <= anz) {
          candMask |= MASKS[i]!;
          ipcMask[i] = 0;
          for (let j = 0; j < 9; j++) {
            if ((board.cells[unit[j]!]! & MASKS[i]!) !== 0) ipcMask[i] = ipcMask[i]! | MASKS[j + 1]!;
          }
        }
      }
      if (ANZ_VALUES[candMask]! < anz) continue;

      const candArr = POSSIBLE_VALUES[candMask]!;
      for (let i1 = 0; i1 < candArr.length - anz + 1; i1++) {
        const cand1 = MASKS[candArr[i1]!]!;
        const c1 = ipcMask[candArr[i1]!]!;
        for (let i2 = i1 + 1; i2 < candArr.length - anz + 2; i2++) {
          const cand2 = cand1 | MASKS[candArr[i2]!]!;
          const cell2 = c1 | ipcMask[candArr[i2]!]!;
          if (anz === 2) {
            if (ANZ_VALUES[cell2] === anz) {
              const t = POSSIBLE_VALUES[cell2]!;
              const step = this.createSubsetStep(
                board,
                [unit[t[0]! - 1]!, unit[t[1]! - 1]!],
                cand2,
                "HIDDEN_PAIR",
                true,
                true,
              );
              if (step !== null) return step;
            }
          } else {
            for (let i3 = i2 + 1; i3 < candArr.length - anz + 3; i3++) {
              const cand3 = cand2 | MASKS[candArr[i3]!]!;
              const cell3 = cell2 | ipcMask[candArr[i3]!]!;
              if (anz === 3) {
                if (ANZ_VALUES[cell3] === anz) {
                  const t = POSSIBLE_VALUES[cell3]!;
                  const step = this.createSubsetStep(
                    board,
                    [unit[t[0]! - 1]!, unit[t[1]! - 1]!, unit[t[2]! - 1]!],
                    cand3,
                    "HIDDEN_TRIPLE",
                    true,
                    true,
                  );
                  if (step !== null) return step;
                }
              } else {
                for (let i4 = i3 + 1; i4 < candArr.length; i4++) {
                  const cand4 = cand3 | MASKS[candArr[i4]!]!;
                  const cell4 = cell3 | ipcMask[candArr[i4]!]!;
                  if (ANZ_VALUES[cell4] === anz) {
                    const t = POSSIBLE_VALUES[cell4]!;
                    const step = this.createSubsetStep(
                      board,
                      [unit[t[0]! - 1]!, unit[t[1]! - 1]!, unit[t[2]! - 1]!, unit[t[3]! - 1]!],
                      cand4,
                      "HIDDEN_QUADRUPLE",
                      true,
                      true,
                    );
                    if (step !== null) return step;
                  }
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  private createSubsetStep(
    board: Board,
    indices: number[],
    cands: number,
    type: SolutionType,
    lockedOnly: boolean,
    nakedHiddenOnly: boolean,
  ): SolutionStep | null {
    const step = new SolutionStep(type);
    const isHidden =
      type === "HIDDEN_PAIR" || type === "HIDDEN_TRIPLE" || type === "HIDDEN_QUADRUPLE";

    const sameConstraint = [true, true, true];
    const constraint = [
      CONSTRAINTS[indices[0]!]![0],
      CONSTRAINTS[indices[0]!]![1],
      CONSTRAINTS[indices[0]!]![2],
    ];
    for (let i = 1; i < indices.length; i++) {
      const con = CONSTRAINTS[indices[i]!]!;
      for (let j = 0; j < 3; j++) {
        if (sameConstraint[j] && constraint[j] !== con[j]) sameConstraint[j] = false;
      }
    }

    let anzFoundConstraints = 0;
    if (isHidden) {
      for (const idx of indices) {
        const candsToDelete = board.cells[idx]! & ~cands & MAX_MASK;
        if (candsToDelete === 0) continue;
        for (const c of POSSIBLE_VALUES[candsToDelete]!) step.addCandidateToDelete(idx, c);
      }
    } else {
      const foundConstraint = [false, false, false];
      for (let i = 0; i < 3; i++) {
        if (!sameConstraint[i]) continue;
        const cells = ALL_UNITS[constraint[i]!]!;
        for (const cell of cells) {
          if (indices.includes(cell)) continue;
          const candsToDelete = board.cells[cell]! & cands;
          if (candsToDelete === 0) continue;
          for (const c of POSSIBLE_VALUES[candsToDelete]!) {
            step.addCandidateToDelete(cell, c);
            if (
              !foundConstraint[i] &&
              (i === 2 || CONSTRAINTS[cell]![2] !== constraint[2])
            ) {
              foundConstraint[i] = true;
              anzFoundConstraints++;
            }
          }
        }
      }
    }

    if (step.candidatesToDelete.length === 0) return null;

    let isLocked = false;
    if (
      indices.length < 4 &&
      anzFoundConstraints > 1 &&
      !isHidden &&
      ((sameConstraint[2] && sameConstraint[0]) || (sameConstraint[2] && sameConstraint[1]))
    ) {
      isLocked = true;
    }

    if (isLocked) {
      if (type === "NAKED_PAIR") step.type = "LOCKED_PAIR";
      else if (type === "NAKED_TRIPLE") step.type = "LOCKED_TRIPLE";
    }
    for (const idx of indices) step.addIndex(idx);
    for (const c of POSSIBLE_VALUES[cands]!) step.addValue(c);

    if (lockedOnly && !nakedHiddenOnly) {
      if (!isLocked) return null;
    } else if (nakedHiddenOnly && !lockedOnly) {
      if (isLocked) return null;
    }
    return this.emit(step);
  }

  private findLockedCandidates(board: Board, type: SolutionType): SolutionStep | null {
    if (type === "LOCKED_CANDIDATES" || type === "LOCKED_CANDIDATES_1") {
      const step = this.findLockedCandidatesInEntity(board, 18, BLOCKS);
      if (!this.collector && step !== null) return step;
    }
    if (type === "LOCKED_CANDIDATES" || type === "LOCKED_CANDIDATES_2") {
      let step = this.findLockedCandidatesInEntity(board, 0, LINES);
      if (!this.collector && step !== null) return step;
      step = this.findLockedCandidatesInEntity(board, 9, COLS);
      if (!this.collector && step !== null) return step;
    }
    return null;
  }

  private findLockedCandidatesInEntity(
    board: Board,
    constraintBase: number,
    units: readonly (readonly number[])[],
  ): SolutionStep | null {
    for (let constr = 0; constr < 9; constr++) {
      const unit = units[constr]!;
      for (let cand = 1; cand <= 9; cand++) {
        const unitFree = board.free[constr + constraintBase]![cand]!;
        if (unitFree !== 2 && unitFree !== 3) continue;
        const sameConstraint = [true, true, true];
        const constraint = [-1, -1, -1];
        let first = true;
        for (const index of unit) {
          if ((board.cells[index]! & MASKS[cand]!) === 0) continue;
          const con = CONSTRAINTS[index]!;
          if (first) {
            constraint[0] = con[0];
            constraint[1] = con[1];
            constraint[2] = con[2];
            first = false;
          } else {
            for (let j = 0; j < 3; j++) {
              if (sameConstraint[j] && constraint[j] !== con[j]) sameConstraint[j] = false;
            }
          }
        }
        const skipConstraint = constraintBase + constr;
        if (constraintBase === 18) {
          let aktConstraint = -1;
          if (sameConstraint[0] && board.free[constraint[0]!]![cand]! > unitFree)
            aktConstraint = constraint[0]!;
          else if (sameConstraint[1] && board.free[constraint[1]!]![cand]! > unitFree)
            aktConstraint = constraint[1]!;
          else continue;
          const r = this.emit(
            this.createLockedCandidatesStep(
              board,
              "LOCKED_CANDIDATES_1",
              cand,
              skipConstraint,
              ALL_UNITS[aktConstraint]!,
            ),
          );
          if (r) return r;
        } else {
          if (sameConstraint[2] && board.free[constraint[2]!]![cand]! > unitFree) {
            const r = this.emit(
              this.createLockedCandidatesStep(
                board,
                "LOCKED_CANDIDATES_2",
                cand,
                skipConstraint,
                ALL_UNITS[constraint[2]!]!,
              ),
            );
            if (r) return r;
          }
        }
      }
    }
    return null;
  }

  private createLockedCandidatesStep(
    board: Board,
    type: SolutionType,
    cand: number,
    skipConstraint: number,
    indices: readonly number[],
  ): SolutionStep {
    const step = new SolutionStep(type);
    step.addValue(cand);
    step.entity = constraintType(skipConstraint);
    step.entityNumber = constraintNumber(skipConstraint);
    for (const index of indices) {
      if ((board.cells[index]! & MASKS[cand]!) !== 0) {
        const con = CONSTRAINTS[index]!;
        if (con[0] === skipConstraint || con[1] === skipConstraint || con[2] === skipConstraint) {
          step.addIndex(index);
        } else {
          step.addCandidateToDelete(index, cand);
        }
      }
    }
    return step;
  }
}
