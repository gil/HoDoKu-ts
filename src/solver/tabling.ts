/*
 * Tabling family via medusa-style implication propagation (a sound, compact
 * stand-in for HoDoKu's full Trebor tables).
 *
 * Assume a candidate is ON, then propagate forced consequences through strong
 * and weak links: an ON candidate turns OFF the other candidates in its cell and
 * the same digit in its buddies; an OFF candidate that leaves a cell or a house
 * with a single placement turns that ON. If the assumption forces a
 * contradiction (a cell/house with no placement, or a candidate both ON and
 * OFF), the candidate can be eliminated. This covers Nice-Loop / AIC / X-Chain /
 * forcing-contradiction eliminations. It is provably sound (soundness harness);
 * it is not byte-identical to HoDoKu's chain selection, and chain reconstruction
 * for display is omitted. Continuous loops / verity nets are not produced.
 */

import { candidatesOf } from "../core/candidates.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { ALL_UNITS, BUDDIES, CONSTRAINTS, LENGTH } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const NICE_LOOP_TYPES = new Set<SolutionType>([
  "NICE_LOOP",
  "CONTINUOUS_NICE_LOOP",
  "DISCONTINUOUS_NICE_LOOP",
  "AIC",
  "GROUPED_NICE_LOOP",
  "GROUPED_CONTINUOUS_NICE_LOOP",
  "GROUPED_DISCONTINUOUS_NICE_LOOP",
  "GROUPED_AIC",
]);
const FORCING_TYPES = new Set<SolutionType>(["FORCING_CHAIN", "FORCING_CHAIN_CONTRADICTION"]);
const NET_TYPES = new Set<SolutionType>([
  "FORCING_NET",
  "FORCING_NET_CONTRADICTION",
  "FORCING_NET_VERITY",
]);

export class TablingSolver {
  // assign[cell*9 + digit-1]: 0 unknown, 1 ON, 2 OFF
  private assign = new Int8Array(LENGTH * 9);
  private queue: number[] = [];

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (NET_TYPES.has(type)) return this.forcingNet(finder, true)[0] ?? null;
    const outType = this.outType(type);
    if (!outType) return null;
    return this.search(finder, outType, true)[0] ?? null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (NET_TYPES.has(type)) return this.forcingNet(finder, false);
    const outType = this.outType(type);
    if (!outType) return [];
    return this.search(finder, outType, false);
  }

  /**
   * Forcing-net verity: if every possible value of a cell forces the same
   * candidate OFF, that candidate can be eliminated. Values whose assumption is
   * itself contradictory are skipped (the cell cannot take them).
   */
  private forcingNet(finder: CandidateFinder, onlyOne: boolean): SolutionStep[] {
    const board = finder.board;
    const out: SolutionStep[] = [];
    for (let cell = 0; cell < LENGTH; cell++) {
      if (board.values[cell] !== 0) continue;
      const cands = candidatesOf(board.cells[cell]!);
      if (cands.length < 2) continue;
      let common: Set<number> | null = null;
      for (const d of cands) {
        const off = this.propagate(board, cell, d);
        if (off === null) continue; // contradictory value -> cell can't be d
        const set = new Set(off);
        if (common === null) common = set;
        else for (const k of common) if (!set.has(k)) common.delete(k);
        if (common.size === 0) break;
      }
      if (!common || common.size === 0) continue;
      const step = new SolutionStep("FORCING_NET_VERITY");
      for (const k of common) {
        const c2 = (k / 9) | 0;
        const d2 = (k % 9) + 1;
        if (c2 !== cell && board.values[c2] === 0 && board.isCandidate(c2, d2)) {
          step.addCandidateToDelete(c2, d2);
        }
      }
      if (step.candidatesToDelete.length > 0) {
        step.addIndex(cell);
        out.push(step);
        if (onlyOne) return out;
      }
    }
    return out;
  }

  private outType(type: SolutionType): SolutionType | null {
    if (NICE_LOOP_TYPES.has(type)) return "DISCONTINUOUS_NICE_LOOP";
    if (FORCING_TYPES.has(type)) return "FORCING_CHAIN_CONTRADICTION";
    return null;
  }

  private search(finder: CandidateFinder, outType: SolutionType, onlyOne: boolean): SolutionStep[] {
    const board = finder.board;
    const out: SolutionStep[] = [];
    for (let cell = 0; cell < LENGTH; cell++) {
      if (board.values[cell] !== 0) continue;
      for (const d of candidatesOf(board.cells[cell]!)) {
        if (this.propagate(board, cell, d) === null) {
          const step = new SolutionStep(outType);
          step.addValue(d);
          step.addIndex(cell);
          step.addCandidateToDelete(cell, d);
          out.push(step);
          if (onlyOne) return out;
        }
      }
    }
    return out;
  }

  /**
   * Propagates the assumption (cell,digit) = ON. Returns the list of forced-OFF
   * candidate keys (cell*9 + digit-1), or null if the assumption is contradictory.
   */
  private propagate(
    board: CandidateFinder["board"],
    cell: number,
    digit: number,
  ): number[] | null {
    this.assign.fill(0);
    this.queue.length = 0;
    if (!this.setOn(cell, digit)) return null;
    while (this.queue.length > 0) {
      const packed = this.queue.pop()!;
      const c = (packed / 16) | 0;
      const d = packed & 15;
      const state = this.assign[c * 9 + d - 1];
      if (state === 1) {
        for (const d2 of candidatesOf(board.cells[c]!)) {
          if (d2 !== d && !this.setOff(c, d2)) return null;
        }
        for (const b of BUDDIES[c]!) {
          if (board.values[b] === 0 && board.isCandidate(b, d) && !this.setOff(b, d)) {
            return null;
          }
        }
      } else {
        if (!this.checkCell(board, c)) return null;
        const con = CONSTRAINTS[c]!;
        for (let k = 0; k < 3; k++) {
          if (!this.checkHouse(board, con[k]!, d)) return null;
        }
      }
    }
    const off: number[] = [];
    for (let k = 0; k < this.assign.length; k++) if (this.assign[k] === 2) off.push(k);
    return off;
  }

  private checkCell(board: CandidateFinder["board"], c: number): boolean {
    if (board.values[c] !== 0) return true;
    let remaining = 0;
    let last = 0;
    for (const x of candidatesOf(board.cells[c]!)) {
      if (this.assign[c * 9 + x - 1] !== 2) {
        remaining++;
        last = x;
      }
    }
    if (remaining === 0) return false; // contradiction
    if (remaining === 1) return this.setOn(c, last);
    return true;
  }

  private checkHouse(board: CandidateFinder["board"], con: number, d: number): boolean {
    let count = 0;
    let lastCell = -1;
    let placed = false;
    for (const x of ALL_UNITS[con]!) {
      if (board.values[x] === d) {
        placed = true;
        break;
      }
      if (board.values[x] === 0 && board.isCandidate(x, d) && this.assign[x * 9 + d - 1] !== 2) {
        count++;
        lastCell = x;
      }
    }
    if (placed) return true;
    if (count === 0) return false; // contradiction
    if (count === 1) return this.setOn(lastCell, d);
    return true;
  }

  private setOn(c: number, d: number): boolean {
    const k = c * 9 + d - 1;
    if (this.assign[k] === 2) return false;
    if (this.assign[k] === 1) return true;
    this.assign[k] = 1;
    this.queue.push(c * 16 + d);
    return true;
  }

  private setOff(c: number, d: number): boolean {
    const k = c * 9 + d - 1;
    if (this.assign[k] === 1) return false;
    if (this.assign[k] === 2) return true;
    this.assign[k] = 2;
    this.queue.push(c * 16 + d);
    return true;
  }
}
