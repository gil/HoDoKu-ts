/*
 * Faithful port of HoDoKu's TablingSolver for plain Nice Loops and AICs
 * (chainsOnly = direct binary links, no group/ALS nodes — exactly the default
 * NICE_LOOP / CONTINUOUS / DISCONTINUOUS / AIC search).
 *
 * Trebor's tables: one TableEntry per (cell,candidate) ON and OFF holds every
 * direct consequence. expandTables() chases the implications transitively. Then
 * a loop back to the start cell is a Nice Loop; a strong-ended chain that can
 * eliminate is an AIC. Chains are reconstructed from the reverse indices.
 * Grouped variants (group/ALS nodes) and forcing nets are handled elsewhere.
 */

import { CellSet } from "../core/cell-set.js";
import {
  Chain,
  getSCandidate,
  getSCellIndex,
  isSStrong,
  makeSimpleEntry,
} from "../core/chain.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { TableEntry } from "../core/table-entry.js";
import { BUDDIES, CONSTRAINTS, LENGTH, UNIT_TEMPLATES } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

export class TablingChainsSolver {
  private onTable: TableEntry[] = [];
  private offTable: TableEntry[] = [];
  private chain = new Int32Array(2000);
  private chainIndex = 0;
  private tmpChain = new Int32Array(2000);
  private chainSet = new CellSet();
  private lassoSet = new CellSet();
  private steps: SolutionStep[] = [];
  private deletesMap = new Map<string, number>();
  private finder!: CandidateFinder;
  private globalStep = new SolutionStep("AIC");

  constructor() {
    for (let i = 0; i < LENGTH * 10; i++) {
      this.onTable.push(new TableEntry());
      this.offTable.push(new TableEntry());
    }
  }

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    const all = this.getNiceLoops(finder);
    return all.find((s) => stepClass(s.type) === stepClass(type)) ?? all[0] ?? null;
  }

  findAll(finder: CandidateFinder): SolutionStep[] {
    return this.getNiceLoops(finder);
  }

  private getNiceLoops(finder: CandidateFinder): SolutionStep[] {
    this.finder = finder;
    this.steps = [];
    this.deletesMap.clear();
    for (let i = 0; i < this.onTable.length; i++) {
      this.onTable[i]!.reset();
      this.offTable[i]!.reset();
    }
    this.fillTables();
    this.expandTables(this.onTable);
    this.expandTables(this.offTable);
    this.checkNiceLoops(this.onTable);
    this.checkNiceLoops(this.offTable);
    this.checkAics(this.offTable);
    return this.steps;
  }

  private fillTables(): void {
    const sudoku = this.finder.board;
    const candidates = this.finder.getCandidates();
    for (let i = 0; i < LENGTH; i++) {
      if (sudoku.values[i] !== 0) continue;
      const cands = sudoku.getAllCandidates(i);
      for (const cand of cands) {
        const on = this.onTable[i * 10 + cand]!;
        const off = this.offTable[i * 10 + cand]!;
        on.addSimple(i, cand, true);
        off.addSimple(i, cand, false);
        // other candidates in the same cell
        for (const other of cands) {
          if (other === cand) continue;
          on.addSimple(i, other, false);
          if (cands.length === 2) off.addSimple(i, other, true);
        }
        // houses
        const tmp1 = candidates[cand]!.clone();
        tmp1.remove(i);
        for (const constr of CONSTRAINTS[i]!) {
          const anz = sudoku.free[constr]![cand]!;
          if (anz < 2) continue;
          const tmp = tmp1.clone();
          tmp.and(UNIT_TEMPLATES[constr]!);
          if (tmp.isEmpty()) continue;
          const arr = tmp.toArray();
          for (const k of arr) on.addSimple(k, cand, false);
          if (anz === 2) off.addSimple(arr[0]!, cand, true);
        }
      }
    }
  }

  private expandTables(table: TableEntry[]): void {
    for (let i = 0; i < table.length; i++) {
      const dest = table[i]!;
      if (dest.index === 0) continue;
      for (let j = 1; j < dest.entries.length; j++) {
        if (dest.entries[j] === 0) break;
        if (dest.isFull()) break;
        const srcTableIndex = dest.getCellIndex(j) * 10 + dest.getCandidate(j);
        const isFromOnTable = dest.isStrong(j);
        const src = isFromOnTable ? this.onTable[srcTableIndex]! : this.offTable[srcTableIndex]!;
        if (src.index === 0) continue;
        const srcBaseDistance = dest.getDistance(j);
        for (let k = 1; k < src.index; k++) {
          if (src.isExpanded(k)) continue;
          const srcDistance = src.getDistance(k);
          const srcEntry = src.entries[k]!;
          if (dest.indices.has(srcEntry)) {
            const orgIndex = dest.getEntryIndex(srcEntry);
            if (
              dest.isExpanded(orgIndex) &&
              dest.getDistance(orgIndex) > srcBaseDistance + srcDistance
            ) {
              dest.rets[orgIndex] = { idx: [srcTableIndex, 0, 0, 0, 0], distance: 0, expanded: true, onTable: isFromOnTable, extended: false };
              dest.setDistance(orgIndex, srcBaseDistance + srcDistance);
            }
          } else {
            const srcCellIndex = src.getCellIndex(k);
            const srcCand = src.getCandidate(k);
            const srcStrong = src.isStrong(k);
            dest.addWithRet(srcCellIndex, srcCand, srcStrong, srcTableIndex);
            dest.setExpanded(dest.index - 1);
            if (isFromOnTable) dest.setOnTable(dest.index - 1);
            dest.setDistance(dest.index - 1, srcBaseDistance + srcDistance);
          }
        }
      }
    }
  }

  private checkNiceLoops(tables: TableEntry[]): void {
    for (const t of tables) {
      if (t.index === 0) continue;
      const startIndex = t.getCellIndex(0);
      for (let j = 1; j < t.index; j++) {
        if (t.getCellIndex(j) === startIndex) this.checkNiceLoop(t, j);
      }
    }
  }

  private checkAics(tables: TableEntry[]): void {
    const sudoku = this.finder.board;
    const candidates = this.finder.getCandidates();
    for (const t of tables) {
      if (t.index === 0) continue;
      const startIndex = t.getCellIndex(0);
      const startCandidate = t.getCandidate(0);
      const buddies = BUDDIES[startIndex]!;
      for (let j = 1; j < t.index; j++) {
        if (!t.isStrong(j) || t.getCellIndex(j) === startIndex) continue;
        const endIndex = t.getCellIndex(j);
        if (startCandidate === t.getCandidate(j)) {
          const tmp = buddies.clone();
          tmp.and(BUDDIES[endIndex]!);
          tmp.and(candidates[startCandidate]!);
          if (tmp.size() >= 2) this.checkAic(t, j);
        } else {
          if (!buddies.contains(endIndex)) continue;
          if (sudoku.isCandidate(endIndex, startCandidate) && sudoku.isCandidate(startIndex, t.getCandidate(j))) {
            this.checkAic(t, j);
          }
        }
      }
    }
  }

  private checkNiceLoop(entry: TableEntry, entryIndex: number): void {
    if (entry.getDistance(entryIndex) <= 2) return;
    const sudoku = this.finder.board;
    const candidates = this.finder.getCandidates();
    this.globalStep = new SolutionStep("DISCONTINUOUS_NICE_LOOP");
    const built = this.addChain(entry, entry.getCellIndex(entryIndex), entry.getCandidate(entryIndex), entry.isStrong(entryIndex), true, false);
    if (!built || this.globalStep.chains.length === 0) return;
    const localChain = this.globalStep.chains[0]!;
    const nlChain = localChain.nodes;
    if (getSCellIndex(nlChain[0]!) === getSCellIndex(nlChain[1]!)) return;
    const nlChainIndex = localChain.end;

    const firstLinkStrong = entry.isStrong(1);
    const lastLinkStrong = entry.isStrong(entryIndex);
    const startCandidate = entry.getCandidate(0);
    const endCandidate = entry.getCandidate(entryIndex);
    const startIndex = entry.getCellIndex(0);

    if (!firstLinkStrong && !lastLinkStrong && startCandidate === endCandidate) {
      this.globalStep.addCandidateToDelete(startIndex, startCandidate);
    } else if (firstLinkStrong && lastLinkStrong && startCandidate === endCandidate) {
      for (const c of sudoku.getAllCandidates(startIndex)) {
        if (c !== startCandidate) this.globalStep.addCandidateToDelete(startIndex, c);
      }
    } else if (firstLinkStrong !== lastLinkStrong && startCandidate !== endCandidate) {
      if (!firstLinkStrong) this.globalStep.addCandidateToDelete(startIndex, startCandidate);
      else this.globalStep.addCandidateToDelete(startIndex, endCandidate);
    } else if (
      (!firstLinkStrong && !lastLinkStrong && sudoku.getAnzCandidates(startIndex) === 2 && startCandidate !== endCandidate) ||
      (firstLinkStrong && lastLinkStrong && startCandidate !== endCandidate) ||
      (firstLinkStrong !== lastLinkStrong && startCandidate === endCandidate)
    ) {
      this.globalStep.type = "CONTINUOUS_NICE_LOOP";
      for (let i = 0; i <= nlChainIndex; i++) {
        // cell entered and left with a strong link
        if (
          (i === 0 && firstLinkStrong && lastLinkStrong) ||
          (i > 0 && isSStrong(nlChain[i]!) && i <= nlChainIndex - 2 && getSCellIndex(nlChain[i - 1]!) !== getSCellIndex(nlChain[i]!))
        ) {
          if (
            i === 0 ||
            (!isSStrong(nlChain[i + 1]!) && getSCellIndex(nlChain[i]!) === getSCellIndex(nlChain[i + 1]!) &&
              isSStrong(nlChain[i + 2]!) && getSCellIndex(nlChain[i + 1]!) !== getSCellIndex(nlChain[i + 2]!))
          ) {
            let c1 = getSCandidate(nlChain[i]!);
            let c2 = getSCandidate(nlChain[i + 2]!);
            if (i === 0) {
              c1 = startCandidate;
              c2 = endCandidate;
            }
            for (const c of sudoku.getAllCandidates(getSCellIndex(nlChain[i]!))) {
              if (c !== c1 && c !== c2) this.globalStep.addCandidateToDelete(getSCellIndex(nlChain[i]!), c);
            }
          }
        }
        // weak link between cells
        if (i > 0 && !isSStrong(nlChain[i]!) && getSCellIndex(nlChain[i - 1]!) !== getSCellIndex(nlChain[i]!)) {
          const actCand = getSCandidate(nlChain[i]!);
          const tmp = BUDDIES[getSCellIndex(nlChain[i - 1]!)]!.clone();
          tmp.and(BUDDIES[getSCellIndex(nlChain[i]!)]!);
          tmp.andNot(this.chainSet);
          tmp.remove(startIndex);
          tmp.and(candidates[actCand]!);
          for (const idx of tmp) this.globalStep.addCandidateToDelete(idx, actCand);
        }
      }
    }
    this.finishStep(localChain);
  }

  private checkAic(entry: TableEntry, entryIndex: number): void {
    if (entry.getDistance(entryIndex) <= 2) return;
    const sudoku = this.finder.board;
    const candidates = this.finder.getCandidates();
    this.globalStep = new SolutionStep("AIC");
    const startCandidate = entry.getCandidate(0);
    const endCandidate = entry.getCandidate(entryIndex);
    const startIndex = entry.getCellIndex(0);
    const endIndex = entry.getCellIndex(entryIndex);
    if (startCandidate === endCandidate) {
      const tmp = BUDDIES[startIndex]!.clone();
      tmp.and(BUDDIES[endIndex]!);
      tmp.and(candidates[startCandidate]!);
      if (tmp.size() > 1) for (const idx of tmp) if (idx !== startIndex) this.globalStep.addCandidateToDelete(idx, startCandidate);
    } else {
      if (sudoku.isCandidate(startIndex, endCandidate)) this.globalStep.addCandidateToDelete(startIndex, endCandidate);
      if (sudoku.isCandidate(endIndex, startCandidate)) this.globalStep.addCandidateToDelete(endIndex, startCandidate);
    }
    if (this.globalStep.candidatesToDelete.length === 0) return;
    const built = this.addChain(entry, entry.getCellIndex(entryIndex), entry.getCandidate(entryIndex), entry.isStrong(entryIndex), false, true);
    if (!built || this.globalStep.chains.length === 0) return;
    this.finishStep(this.globalStep.chains[0]!);
  }

  private finishStep(chain: Chain): void {
    const del = this.candKey();
    const len = chain.end - chain.start;
    const old = this.deletesMap.get(del);
    if (old !== undefined && this.steps[old]!.chains[0]!.end - this.steps[old]!.chains[0]!.start <= len) return;
    this.deletesMap.set(del, this.steps.length);
    this.steps.push(this.globalStep.clone());
  }

  private candKey(): string {
    return this.globalStep.candidatesToDelete
      .map((c) => `${c.value}@${c.index}`)
      .sort()
      .join(",");
  }

  /** Builds and reverses the chain; returns false if it is a lasso. */
  private addChain(
    entry: TableEntry,
    cellIndex: number,
    cand: number,
    set: boolean,
    isNiceLoop: boolean,
    isAic: boolean,
  ): boolean {
    this.buildChain(entry, cellIndex, cand, set);
    if (this.chainIndex === 0) return false;
    this.lassoSet.clear();
    if (isNiceLoop && getSCellIndex(this.chain[0]!) === getSCellIndex(this.chain[1]!)) return false;
    let lastCellIndex = -1;
    const firstCellIndex = getSCellIndex(this.chain[this.chainIndex - 1]!);
    let j = 0;
    for (let i = this.chainIndex - 1; i >= 0; i--) {
      const oldEntry = this.chain[i]!;
      const newCellIndex = getSCellIndex(oldEntry);
      if (isNiceLoop || isAic) {
        if (this.lassoSet.contains(newCellIndex)) return false;
        if (lastCellIndex !== -1 && (lastCellIndex !== firstCellIndex || isAic)) {
          this.lassoSet.add(lastCellIndex);
        }
      }
      lastCellIndex = newCellIndex;
      this.tmpChain[j++] = oldEntry;
    }
    if (j > 0) {
      this.globalStep.addChain(new Chain(0, j - 1, Array.from(this.tmpChain.slice(0, j))));
      return true;
    }
    return false;
  }

  private buildChain(entry: TableEntry, cellIndex: number, cand: number, set: boolean): void {
    this.chainIndex = 0;
    this.chainSet.clear();
    const chainEntry = makeSimpleEntry(cellIndex, cand, set);
    let index = -1;
    for (let i = 0; i < entry.index; i++) {
      if (entry.entries[i] === chainEntry) {
        index = i;
        break;
      }
    }
    if (index === -1) return;
    // single-reverse-index traversal (chainsOnly => no nets)
    let cur = entry;
    const org = entry;
    let first = index;
    let expanded = false;
    this.chain[this.chainIndex++] = cur.entries[first]!;
    this.chainSet.add(cur.getCellIndex(first));
    while (first !== 0 && this.chainIndex < this.chain.length) {
      if (cur.isExpanded(first)) {
        const ti = org.getRetIndex(first, 0);
        cur = cur.isOnTable(first) ? this.onTable[ti]! : this.offTable[ti]!;
        expanded = true;
        first = cur.getEntryIndex(org.entries[first]!);
      }
      const ri0 = cur.getRetIndex(first, 0);
      first = ri0;
      this.chain[this.chainIndex++] = cur.entries[ri0]!;
      this.chainSet.add(cur.getCellIndex(ri0));
      if (expanded && first === 0) {
        const retEntry = cur.entries[0]!;
        cur = org;
        first = cur.getEntryIndex(retEntry);
        expanded = false;
      }
    }
  }
}

/** Maps any nice-loop/AIC variant to its umbrella class for getStep matching. */
function stepClass(type: SolutionType): string {
  if (type === "CONTINUOUS_NICE_LOOP" || type === "DISCONTINUOUS_NICE_LOOP" || type === "NICE_LOOP") {
    return "NICE_LOOP";
  }
  return type;
}
