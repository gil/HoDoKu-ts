/*
 * Port of HoDoKu's AlsSolver: ALS-XZ (incl. doubly-linked), ALS-XY-Wing,
 * ALS-XY-Chain and Death Blossom, over a shared ALS + Restricted Common layer.
 *
 * An Almost Locked Set (ALS) is a set of N cells holding N+1 candidates. A
 * Restricted Common (RC) is a candidate shared by two ALS where every instance
 * in both sees each other. ALS-XZ: for two ALS linked by an RC X, any other
 * common candidate Z that is seen by all its occurrences in both ALS is removed.
 */

import { ANZ_VALUES, MASKS, MAX_MASK, candidatesOf } from "../core/candidates.js";
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

/** A Restricted Common between two ALS, with the adjacency check used by ALS chains. */
export class RestrictedCommon {
  /** 0 none, 1 cand1 only, 2 cand2 only, 3 both — set during chain propagation. */
  actualRC = 0;
  constructor(
    public als1: number,
    public als2: number,
    public cand1: number,
    public cand2 = 0,
  ) {}

  checkRC(rc: RestrictedCommon | null, firstTry: boolean): boolean {
    this.actualRC = this.cand2 === 0 ? 1 : 3;
    if (rc === null) {
      if (this.cand2 !== 0) this.actualRC = firstTry ? 1 : 2;
      return this.actualRC !== 0;
    }
    switch (rc.actualRC) {
      case 1:
        this.actualRC = checkRCInt(rc.cand1, 0, this.cand1, this.cand2);
        break;
      case 2:
        this.actualRC = checkRCInt(rc.cand2, 0, this.cand1, this.cand2);
        break;
      case 3:
        this.actualRC = checkRCInt(rc.cand1, rc.cand1, this.cand1, this.cand2);
        break;
      default:
        break;
    }
    return this.actualRC !== 0;
  }

  clone(): RestrictedCommon {
    const r = new RestrictedCommon(this.als1, this.als2, this.cand1, this.cand2);
    r.actualRC = this.actualRC;
    return r;
  }
}

function checkRCInt(c11: number, c12: number, c21: number, c22: number): number {
  if (c12 === 0) {
    if (c22 === 0) return c11 === c21 ? 0 : 1;
    if (c11 === c22) return 1;
    if (c11 === c21) return 2;
    return 3;
  }
  if (c22 === 0) return c11 === c21 || c12 === c21 ? 0 : 1;
  if ((c11 === c21 && c12 === c22) || (c11 === c22 && c12 === c21)) return 0;
  if (c11 === c22 || c12 === c22) return 1;
  if (c11 === c21 || c12 === c21) return 2;
  return 3;
}

export class AlsSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (type === "ALS_XZ") return this.alsXZ(finder, true)[0] ?? null;
    if (type === "ALS_XY_WING") return this.alsXYWing(finder, true, false)[0] ?? null;
    if (type === "ALS_XY_CHAIN") return this.alsXYChain(finder, true, 50)[0] ?? null;
    if (type === "DEATH_BLOSSOM") return this.deathBlossom(finder)[0] ?? null;
    return null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (type === "ALS_XZ") return this.alsXZ(finder, false);
    if (type === "ALS_XY_WING") return this.alsXYWing(finder, false, true);
    if (type === "ALS_XY_CHAIN") return this.alsXYChain(finder, false, 6);
    if (type === "DEATH_BLOSSOM") return this.deathBlossom(finder);
    return [];
  }

  private alsXZ(finder: CandidateFinder, onlyOne: boolean): SolutionStep[] {
    const alses = enumerateAlses(finder);
    const { rcs } = computeRestrictedCommons(alses);
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

  private alsXYWing(finder: CandidateFinder, onlyOne: boolean, allowOverlap: boolean): SolutionStep[] {
    const alses = enumerateAlses(finder);
    const { rcs } = computeRestrictedCommons(alses);
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
        if (!allowOverlap && !a.indices.andEmpty(b.indices)) continue;
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

  private alsXYChain(finder: CandidateFinder, onlyForward: boolean, MAX_RC: number): SolutionStep[] {
    const alses = enumerateAlses(finder);
    const { rcs, starts, ends } = computeRestrictedCommons(alses, true, onlyForward);
    const out: SolutionStep[] = [];
    const deletes = new Map<string, number>(); // elim key -> step index
    const alsCountAt: number[] = [];
    const chainArr: RestrictedCommon[] = [];
    const inChain = new Array<boolean>(alses.length).fill(false);
    let firstRC: RestrictedCommon | null = null;
    let startAls: Als = alses[0]!;

    const recurse = (alsIndex: number, lastRC: RestrictedCommon | null): void => {
      if (chainArr.length >= MAX_RC) return;
      let firstTry = true;
      for (let idx = starts[alsIndex]!; idx < ends[alsIndex]!; idx++) {
        const rc = rcs[idx]!;
        if (chainArr.length >= MAX_RC || !rc.checkRC(lastRC, firstTry)) continue;
        if (inChain[rc.als2]) continue;
        const aktAls = alses[rc.als2]!;
        if (chainArr.length === 0) firstRC = rc;
        chainArr.push(rc);
        inChain[rc.als2] = true;

        if (chainArr.length >= 3) {
          let c1 = firstRC!.cand1;
          let c2 = firstRC!.cand2;
          if (firstRC!.actualRC === 1) c2 = 0;
          else if (firstRC!.actualRC === 2) c1 = 0;
          let c3 = 0;
          let c4 = 0;
          if (rc.actualRC === 1) c3 = rc.cand1;
          else if (rc.actualRC === 2) c3 = rc.cand2;
          else if (rc.actualRC === 3) {
            c3 = rc.cand1;
            c4 = rc.cand2;
          }
          const restrMask =
            (c1 ? MASKS[c1]! : 0) | (c2 ? MASKS[c2]! : 0) | (c3 ? MASKS[c3]! : 0) | (c4 ? MASKS[c4]! : 0);
          const step = new SolutionStep("ALS_XY_CHAIN");
          checkCandidatesToDelete(step, startAls, aktAls, restrMask);
          if (step.candidatesToDelete.length > 0) {
            step.addAls(startAls.indices.toArray(), candidatesOf(startAls.candidates).slice());
            for (const link of chainArr) {
              const a = alses[link.als2]!;
              step.addAls(a.indices.toArray(), candidatesOf(a.candidates).slice());
            }
            const alsCount = chainArr.length + 1;
            const key = step.candidatesToDelete
              .map((c) => `${c.value}@${c.index}`)
              .sort()
              .join(",");
            const old = deletes.get(key);
            if (old === undefined) {
              deletes.set(key, out.length);
              alsCountAt[out.length] = alsCount;
              out.push(step);
            } else if (alsCountAt[old]! > alsCount) {
              out[old] = step;
              alsCountAt[old] = alsCount;
            }
          }
        }

        recurse(rc.als2, rc);
        inChain[rc.als2] = false;
        chainArr.pop();

        if (lastRC === null) {
          if (rc.cand2 !== 0 && firstTry) {
            firstTry = false;
            idx--;
          } else {
            firstTry = true;
          }
        }
      }
    };

    for (let i = 0; i < alses.length; i++) {
      startAls = alses[i]!;
      chainArr.length = 0;
      inChain.fill(false);
      inChain[i] = true;
      firstRC = null;
      recurse(i, null);
    }
    return out;
  }

  private deathBlossom(finder: CandidateFinder): SolutionStep[] {
    const alses = enumerateAlses(finder);
    const sudoku = finder.board;
    const candidates = finder.getCandidates();
    // For each cell: which ALS can the cell "see" via each candidate.
    const rcdb: ({ candMask: number; als: number[][] } | null)[] = new Array(81).fill(null);
    for (let i = 0; i < alses.length; i++) {
      const act = alses[i]!;
      for (let j = 1; j <= 9; j++) {
        if ((act.candidates & MASKS[j]!) === 0) continue;
        for (const index of act.buddiesPerCandidat[j]!) {
          let r = rcdb[index];
          if (!r) {
            r = { candMask: 0, als: Array.from({ length: 10 }, () => [] as number[]) };
            rcdb[index] = r;
          }
          r.als[j]!.push(i);
          r.candMask |= MASKS[j]!;
        }
      }
    }

    const out: SolutionStep[] = [];
    const deletes = new Map<string, number>();
    const alsCountAt: number[] = [];
    const aktDBIndices = new CellSet();
    let aktDBCandidates = MAX_MASK;
    const aktDBAls = new Array<number>(10).fill(-1);
    const incDBCand = new Array<number>(10).fill(0);
    let stemCell = 0;
    let maxDBCand = 0;
    let aktRcdb: { candMask: number; als: number[][] };

    const leaf = (): void => {
      const step = new SolutionStep("DEATH_BLOSSOM");
      let found = false;
      for (const checkCand of candidatesOf(aktDBCandidates)) {
        if (aktDBAls[checkCand] !== -1) continue;
        let acc: CellSet | null = null;
        for (let k = 1; k <= 9; k++) {
          if (aktDBAls[k] === -1) continue;
          const ip = alses[aktDBAls[k]!]!.indicesPerCandidat[checkCand];
          if (!ip) continue;
          if (acc === null) acc = ip.clone();
          else acc.or(ip);
        }
        if (!acc) continue;
        const bud = getCommonBuddies(acc);
        bud.andNot(aktDBIndices);
        bud.remove(stemCell);
        bud.and(candidates[checkCand]!);
        if (!bud.isEmpty()) {
          found = true;
          for (const idx of bud) step.addCandidateToDelete(idx, checkCand);
        }
      }
      if (!found) return;
      step.addIndex(stemCell);
      let alsCount = 0;
      for (let k = 1; k <= 9; k++) {
        if (aktDBAls[k] === -1) continue;
        const a = alses[aktDBAls[k]!]!;
        for (const idx of a.indicesPerCandidat[k]!) step.addFin(idx, k);
        step.addFin(stemCell, k);
        step.addAls(a.indices.toArray(), candidatesOf(a.candidates).slice());
        alsCount++;
      }
      const key = step.candidatesToDelete
        .map((c) => `${c.value}@${c.index}`)
        .sort()
        .join(",");
      const old = deletes.get(key);
      if (old === undefined) {
        deletes.set(key, out.length);
        alsCountAt[out.length] = alsCount;
        out.push(step);
      } else if (alsCountAt[old]! > alsCount) {
        out[old] = step;
        alsCountAt[old] = alsCount;
      }
    };

    const recurse = (cand: number): void => {
      if (cand > maxDBCand) return;
      if (aktRcdb.als[cand]!.length > 0) {
        for (const alsIdx of aktRcdb.als[cand]!) {
          const als = alses[alsIdx]!;
          // overlap allowed (all-steps default)
          if ((aktDBCandidates & als.candidates) === 0) continue;
          aktDBAls[cand] = alsIdx;
          incDBCand[cand] = aktDBCandidates & ~als.candidates;
          aktDBCandidates &= als.candidates;
          aktDBIndices.or(als.indices);
          if (cand < maxDBCand) recurse(cand + 1);
          else leaf();
          aktDBCandidates |= incDBCand[cand]!;
          aktDBIndices.andNot(als.indices);
        }
      } else {
        aktDBAls[cand] = -1;
        recurse(cand + 1);
      }
    };

    for (let i = 0; i < 81; i++) {
      if (sudoku.values[i] !== 0) continue;
      const r = rcdb[i];
      if (!r || sudoku.cells[i] !== r.candMask) continue;
      stemCell = i;
      aktRcdb = r;
      maxDBCand = 0;
      for (let j = 1; j <= 9; j++) if (r.als[j]!.length > 0) maxDBCand = j;
      aktDBIndices.clear();
      aktDBCandidates = MAX_MASK;
      aktDBAls.fill(-1);
      recurse(1);
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
export interface RcResult {
  rcs: RestrictedCommon[];
  /** starts[i]/ends[i] = range in `rcs` of RCs whose first ALS is i (forward search). */
  starts: number[];
  ends: number[];
}

export function computeRestrictedCommons(
  alses: Als[],
  withOverlap = true,
  onlyForward = true,
): RcResult {
  const rcs: RestrictedCommon[] = [];
  const starts = new Array<number>(alses.length).fill(0);
  const ends = new Array<number>(alses.length).fill(0);
  const inter = new CellSet();
  for (let i = 0; i < alses.length; i++) {
    const als1 = alses[i]!;
    starts[i] = rcs.length;
    for (let j = onlyForward ? i + 1 : 0; j < alses.length; j++) {
      if (i === j) continue;
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
            rc = new RestrictedCommon(i, j, cand);
            rcs.push(rc);
          } else {
            rc.cand2 = cand;
          }
        }
      }
    }
    ends[i] = rcs.length;
  }
  return { rcs, starts, ends };
}
