/*
 * Port of HoDoKu's AlsSolver — currently ALS-XZ (incl. doubly-linked).
 * ALS-XY-Wing / XY-Chain / Death Blossom build on the same ALS + Restricted
 * Common machinery and are deferred to a later pass.
 *
 * An Almost Locked Set (ALS) is a set of N cells holding N+1 candidates. A
 * Restricted Common (RC) is a candidate shared by two ALS where every instance
 * in both sees each other. ALS-XZ: for two ALS linked by an RC X, any other
 * common candidate Z that is seen by all its occurrences in both ALS is removed.
 */

import { ANZ_VALUES, MASKS, candidatesOf } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { ALL_UNITS, getCommonBuddies } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

export class Als {
  indicesPerCandidat: (CellSet | null)[] = new Array(10).fill(null);
  buddiesPerCandidat: (CellSet | null)[] = new Array(10).fill(null);
  buddiesAlsPerCandidat: (CellSet | null)[] = new Array(10).fill(null);
  buddies = new CellSet();

  constructor(
    public indices: CellSet,
    public candidates: number,
  ) {}

  computeFields(candPositions: CellSet[]): void {
    for (let i = 1; i <= 9; i++) {
      if ((this.candidates & MASKS[i]!) === 0) continue;
      const ip = this.indices.clone();
      ip.and(candPositions[i]!);
      this.indicesPerCandidat[i] = ip;
      const bp = getCommonBuddies(ip);
      bp.andNot(this.indices);
      bp.and(candPositions[i]!);
      this.buddiesPerCandidat[i] = bp;
      const bap = bp.clone();
      bap.or(ip);
      this.buddiesAlsPerCandidat[i] = bap;
      this.buddies.or(bp);
    }
  }
}

export interface RestrictedCommon {
  als1: number;
  als2: number;
  cand1: number;
  cand2: number;
}

export class AlsSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (type === "ALS_XZ") return this.alsXZ(finder, true)[0] ?? null;
    if (type === "ALS_XY_WING") return this.alsXYWing(finder, true)[0] ?? null;
    return null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (type === "ALS_XZ") return this.alsXZ(finder, false);
    if (type === "ALS_XY_WING") return this.alsXYWing(finder, false);
    return [];
  }

  private alsXZ(finder: CandidateFinder, onlyOne: boolean): SolutionStep[] {
    const alses = enumerateAlses(finder);
    const rcs = computeRestrictedCommons(alses);
    const out: SolutionStep[] = [];
    for (const rc of rcs) {
      const als1 = alses[rc.als1]!;
      const als2 = alses[rc.als2]!;
      const step = new SolutionStep("ALS_XZ");
      checkCandidatesToDelete(step, als1, als2, MASKS[rc.cand1]!);
      if (rc.cand2 !== 0) {
        checkCandidatesToDelete(step, als1, als2, MASKS[rc.cand2]!);
        const d1 = checkDoublyLinkedAls(step, als1, als2, rc.cand1, rc.cand2);
        const d2 = checkDoublyLinkedAls(step, als2, als1, rc.cand1, rc.cand2);
        if (d1 || d2) step.fins.length = 0;
      }
      if (step.candidatesToDelete.length > 0) {
        step.addAls(als1.indices.toArray(), candidatesOf(als1.candidates).slice());
        step.addAls(als2.indices.toArray(), candidatesOf(als2.candidates).slice());
        addRestrictedCommon(step, als1, als2, rc.cand1);
        if (rc.cand2 !== 0) addRestrictedCommon(step, als1, als2, rc.cand2);
        out.push(step);
        if (onlyOne) return out;
      }
    }
    return out;
  }

  private alsXYWing(finder: CandidateFinder, onlyOne: boolean): SolutionStep[] {
    const alses = enumerateAlses(finder);
    const rcs = computeRestrictedCommons(alses);
    const out: SolutionStep[] = [];
    for (let i = 0; i < rcs.length; i++) {
      const rc1 = rcs[i]!;
      for (let j = i + 1; j < rcs.length; j++) {
        const rc2 = rcs[j]!;
        if (rc1.cand2 === 0 && rc2.cand2 === 0 && rc1.cand1 === rc2.cand1) continue;
        // the two RCs must connect three distinct ALS sharing one (= c)
        let cI = -1;
        let aI = -1;
        let bI = -1;
        if (rc1.als1 === rc2.als1 && rc1.als2 !== rc2.als2) {
          cI = rc1.als1;
          aI = rc1.als2;
          bI = rc2.als2;
        } else if (rc1.als2 === rc2.als1 && rc1.als1 !== rc2.als2) {
          cI = rc1.als2;
          aI = rc1.als1;
          bI = rc2.als2;
        } else if (rc1.als1 === rc2.als2 && rc1.als2 !== rc2.als1) {
          cI = rc1.als1;
          aI = rc1.als2;
          bI = rc2.als1;
        } else if (rc1.als2 === rc2.als2 && rc1.als1 !== rc2.als1) {
          cI = rc1.als2;
          aI = rc1.als1;
          bI = rc2.als1;
        } else continue;

        const a = alses[aI]!;
        const b = alses[bI]!;
        const c = alses[cI]!;
        if (!a.indices.andEmpty(b.indices)) continue; // no overlap (overlap disabled)
        const union = a.indices.clone();
        union.or(b.indices);
        if (union.equals(a.indices) || union.equals(b.indices)) continue;

        const step = new SolutionStep("ALS_XY_WING");
        const restrMask =
          MASKS[rc1.cand1]! |
          (rc1.cand2 ? MASKS[rc1.cand2]! : 0) |
          MASKS[rc2.cand1]! |
          (rc2.cand2 ? MASKS[rc2.cand2]! : 0);
        checkCandidatesToDelete(step, a, b, restrMask);
        if (step.candidatesToDelete.length > 0) {
          step.addAls(a.indices.toArray(), candidatesOf(a.candidates).slice());
          step.addAls(b.indices.toArray(), candidatesOf(b.candidates).slice());
          step.addAls(c.indices.toArray(), candidatesOf(c.candidates).slice());
          addRestrictedCommon(step, a, c, rc1.cand1);
          if (rc1.cand2 !== 0) addRestrictedCommon(step, a, c, rc1.cand2);
          addRestrictedCommon(step, b, c, rc2.cand1);
          if (rc2.cand2 !== 0) addRestrictedCommon(step, b, c, rc2.cand2);
          out.push(step);
          if (onlyOne) return out;
        }
      }
    }
    return out;
  }
}

function checkCandidatesToDelete(step: SolutionStep, als1: Als, als2: Als, restrMask: number): void {
  const prc = als1.candidates & als2.candidates & ~restrMask;
  if (prc === 0) return;
  if (als1.buddies.andEmpty(als2.buddies)) return;
  for (const cand of candidatesOf(prc)) {
    const set = als1.buddiesPerCandidat[cand]!.clone();
    set.and(als2.buddiesPerCandidat[cand]!);
    if (set.isEmpty()) continue;
    for (const idx of set) step.addCandidateToDelete(idx, cand);
    const fins = als1.indicesPerCandidat[cand]!.clone();
    fins.or(als2.indicesPerCandidat[cand]!);
    for (const idx of fins) step.addFin(idx, cand);
  }
}

function checkDoublyLinkedAls(
  step: SolutionStep,
  als1: Als,
  als2: Als,
  rc1: number,
  rc2: number,
): boolean {
  const prc = als1.candidates & ~MASKS[rc1]! & ~MASKS[rc2]!;
  if (prc === 0) return false;
  let isDoubly = false;
  for (const cand of candidatesOf(prc)) {
    const set = als1.buddiesPerCandidat[cand]!.clone();
    set.andNot(als2.indices);
    if (set.isEmpty()) continue;
    for (const idx of set) step.addCandidateToDelete(idx, cand);
    isDoubly = true;
  }
  return isDoubly;
}

function addRestrictedCommon(step: SolutionStep, als1: Als, als2: Als, cand: number): void {
  const set = als1.indicesPerCandidat[cand]!.clone();
  set.or(als2.indicesPerCandidat[cand]!);
  for (const idx of set) step.addEndoFin(idx, cand);
}

/** Recursive ALS enumeration over every house (cells N hold N+1 candidates). */
export function enumerateAlses(finder: CandidateFinder): Als[] {
  const sudoku = finder.board;
  const alses: Als[] = [];
  const seen = new Set<string>();
  const indexSet = new CellSet();
  const candSets = new Int16Array(10);

  const recurse = (count: number, startIndex: number, unit: readonly number[]): void => {
    count++;
    if (count > unit.length - 1) return;
    for (let i = startIndex; i < unit.length; i++) {
      const houseIndex = unit[i]!;
      if (sudoku.values[houseIndex] !== 0) continue;
      indexSet.add(houseIndex);
      candSets[count] = candSets[count - 1]! | sudoku.cells[houseIndex]!;
      if (ANZ_VALUES[candSets[count]!]! - count === 1) {
        const key = `${indexSet.w0}_${indexSet.w1}_${indexSet.w2}`;
        if (!seen.has(key)) {
          seen.add(key);
          alses.push(new Als(indexSet.clone(), candSets[count]!));
        }
      }
      recurse(count, i + 1, unit);
      indexSet.remove(houseIndex);
    }
  };

  for (const unit of ALL_UNITS) {
    for (let j = 0; j < unit.length; j++) {
      indexSet.clear();
      candSets[0] = 0;
      recurse(0, j, unit);
    }
  }
  const candPositions = finder.getCandidates();
  for (const als of alses) als.computeFields(candPositions);
  return alses;
}

/**
 * Forward-only (i<j) Restricted Commons. Overlapping ALS are allowed by default
 * (matching HoDoKu's all-steps RC generation); an RC instance may not lie in the
 * overlap. Each pair yields 0-2 RC candidates.
 */
export function computeRestrictedCommons(alses: Als[], withOverlap = true): RestrictedCommon[] {
  const rcs: RestrictedCommon[] = [];
  const inter = new CellSet();
  for (let i = 0; i < alses.length; i++) {
    const als1 = alses[i]!;
    for (let j = i + 1; j < alses.length; j++) {
      const als2 = alses[j]!;
      inter.set(als1.indices);
      inter.and(als2.indices);
      if (!withOverlap && !inter.isEmpty()) continue;
      const possible = als1.candidates & als2.candidates;
      if (possible === 0) continue;
      let rc: RestrictedCommon | null = null;
      for (const cand of candidatesOf(possible)) {
        const idxSet = als1.indicesPerCandidat[cand]!.clone();
        idxSet.or(als2.indicesPerCandidat[cand]!);
        if (!idxSet.andEmpty(inter)) continue; // RC instance inside overlap -> forbidden
        const budSet = als1.buddiesAlsPerCandidat[cand]!.clone();
        budSet.and(als2.buddiesAlsPerCandidat[cand]!);
        if (idxSet.andEquals(budSet)) {
          if (rc === null) {
            rc = { als1: i, als2: j, cand1: cand, cand2: 0 };
            rcs.push(rc);
          } else {
            rc.cand2 = cand;
          }
        }
      }
    }
  }
  return rcs;
}
