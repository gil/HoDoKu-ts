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
  GROUP_NODE,
  getSCandidate,
  getSCellIndex,
  getSCellIndex2,
  getSCellIndex3,
  getSNodeType,
  isSStrong,
  makeSimpleEntry,
  NORMAL_NODE,
} from "../core/chain.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { TableEntry } from "../core/table-entry.js";
import {
  BUDDIES,
  CONSTRAINTS,
  getBlock,
  getCol,
  getLine,
  LENGTH,
  UNIT_TEMPLATES,
} from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const LINE_TPL = UNIT_TEMPLATES.slice(0, 9);
const COL_TPL = UNIT_TEMPLATES.slice(9, 18);
const BLOCK_TPL = UNIT_TEMPLATES.slice(18, 27);

interface GroupNode {
  cand: number;
  indices: CellSet;
  buddies: CellSet;
  line: number;
  col: number;
  block: number;
  index1: number;
  index2: number;
  index3: number;
}

function makeGroupNode(cand: number, indices: CellSet): GroupNode {
  const arr = indices.toArray();
  const index1 = arr[0]!;
  const index2 = arr[1]!;
  const index3 = arr.length > 2 ? arr[2]! : -1;
  const buddies = BUDDIES[index1]!.clone();
  buddies.and(BUDDIES[index2]!);
  if (index3 >= 0) buddies.and(BUDDIES[index3]!);
  let line = -1;
  let col = -1;
  if (getLine(index1) === getLine(index2)) line = getLine(index1);
  if (getCol(index1) === getCol(index2)) col = getCol(index1);
  return { cand, indices: indices.clone(), buddies, line, col, block: getBlock(index1), index1, index2, index3 };
}

/** All group nodes (>=2 candidates in a line/col ∩ block intersection). */
function getGroupNodes(finder: CandidateFinder): GroupNode[] {
  const out: GroupNode[] = [];
  const candidates = finder.getCandidates();
  for (const houses of [LINE_TPL, COL_TPL]) {
    for (let i = 0; i < 9; i++) {
      for (let cand = 1; cand <= 9; cand++) {
        const candInHouse = houses[i]!.clone();
        candInHouse.and(candidates[cand]!);
        if (candInHouse.isEmpty()) continue;
        for (let b = 0; b < 9; b++) {
          const tmp = candInHouse.clone();
          tmp.and(BLOCK_TPL[b]!);
          if (tmp.size() >= 2) out.push(makeGroupNode(cand, tmp));
        }
      }
    }
  }
  return out;
}

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
  private withGroupNodes = false;
  private onlyGroupedNiceLoops = false;
  private extendedTable: TableEntry[] = [];
  private extendedTableMap = new Map<number, number>();
  private extendedTableIndex = 0;
  private groupNodes: GroupNode[] = [];

  constructor() {
    for (let i = 0; i < LENGTH * 10; i++) {
      this.onTable.push(new TableEntry());
      this.offTable.push(new TableEntry());
    }
  }

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    const grouped = isGrouped(type);
    const all = this.getNiceLoops(finder, grouped, grouped);
    return all.find((s) => stepClass(s.type) === stepClass(type)) ?? all[0] ?? null;
  }

  findAll(finder: CandidateFinder, type?: SolutionType): SolutionStep[] {
    const grouped = type ? isGrouped(type) : false;
    return this.getNiceLoops(finder, grouped, grouped);
  }

  private getNiceLoops(
    finder: CandidateFinder,
    withGroupNodes: boolean,
    onlyGrouped: boolean,
  ): SolutionStep[] {
    this.finder = finder;
    this.withGroupNodes = withGroupNodes;
    this.onlyGroupedNiceLoops = onlyGrouped;
    this.steps = [];
    this.deletesMap.clear();
    for (let i = 0; i < this.onTable.length; i++) {
      this.onTable[i]!.reset();
      this.offTable[i]!.reset();
    }
    this.extendedTableMap.clear();
    this.extendedTableIndex = 0;
    this.fillTables();
    if (this.withGroupNodes) this.fillTablesWithGroupNodes();
    this.expandTables(this.onTable);
    this.expandTables(this.offTable);
    this.checkNiceLoops(this.onTable);
    this.checkNiceLoops(this.offTable);
    this.checkAics(this.offTable);
    return this.steps;
  }

  private getNextExtendedTableEntry(index: number): TableEntry {
    let e = this.extendedTable[index];
    if (e === undefined) {
      e = new TableEntry();
      this.extendedTable[index] = e;
    } else {
      e.reset();
    }
    return e;
  }

  private fillTablesWithGroupNodes(): void {
    const candidates = this.finder.getCandidates();
    this.groupNodes = getGroupNodes(this.finder);
    const gns = this.groupNodes;
    for (let i = 0; i < gns.length; i++) {
      const gn = gns[i]!;
      const onEntry = this.getNextExtendedTableEntry(this.extendedTableIndex);
      onEntry.add(gn.index1, gn.index2, gn.index3, GROUP_NODE, gn.cand, true, 0, 0, 0, 0, 0, 0);
      this.extendedTableMap.set(onEntry.entries[0]!, this.extendedTableIndex);
      this.extendedTableIndex++;
      const offEntry = this.getNextExtendedTableEntry(this.extendedTableIndex);
      offEntry.add(gn.index1, gn.index2, gn.index3, GROUP_NODE, gn.cand, false, 0, 0, 0, 0, 0, 0);
      this.extendedTableMap.set(offEntry.entries[0]!, this.extendedTableIndex);
      this.extendedTableIndex++;

      const seen = candidates[gn.cand]!.clone();
      seen.and(gn.buddies);
      if (!seen.isEmpty()) {
        for (const index of seen.toArray()) {
          onEntry.addSimple(index, gn.cand, false);
          this.onTable[index * 10 + gn.cand]!.add(gn.index1, gn.index2, gn.index3, GROUP_NODE, gn.cand, false, 0, 0, 0, 0, 0, 0);
        }
        const inBlock = seen.clone();
        inBlock.and(BLOCK_TPL[gn.block]!);
        if (inBlock.size() === 1) {
          const idx = inBlock.toArray()[0]!;
          offEntry.addSimple(idx, gn.cand, true);
          this.offTable[idx * 10 + gn.cand]!.add(gn.index1, gn.index2, gn.index3, GROUP_NODE, gn.cand, true, 0, 0, 0, 0, 0, 0);
        }
        const inLineCol = seen.clone();
        inLineCol.and(gn.line !== -1 ? LINE_TPL[gn.line]! : COL_TPL[gn.col]!);
        if (inLineCol.size() === 1) {
          const idx = inLineCol.toArray()[0]!;
          offEntry.addSimple(idx, gn.cand, true);
          this.offTable[idx * 10 + gn.cand]!.add(gn.index1, gn.index2, gn.index3, GROUP_NODE, gn.cand, true, 0, 0, 0, 0, 0, 0);
        }
      }

      // links between two group nodes sharing a house
      let lineAnz = 0;
      let line1 = -1;
      let colAnz = 0;
      let col1 = -1;
      let blockAnz = 0;
      let block1 = -1;
      for (let j = 0; j < gns.length; j++) {
        if (j === i) continue;
        const gn2 = gns[j]!;
        if (gn.cand !== gn2.cand) continue;
        const ov = gn.indices.clone();
        if (!ov.andEmpty(gn2.indices)) continue; // overlap
        if (gn.line !== -1 && gn.line === gn2.line) {
          lineAnz++;
          if (lineAnz === 1) line1 = j;
          onEntry.add(gn2.index1, gn2.index2, gn2.index3, GROUP_NODE, gn.cand, false, 0, 0, 0, 0, 0, 0);
        }
        if (gn.col !== -1 && gn.col === gn2.col) {
          colAnz++;
          if (colAnz === 1) col1 = j;
          onEntry.add(gn2.index1, gn2.index2, gn2.index3, GROUP_NODE, gn.cand, false, 0, 0, 0, 0, 0, 0);
        }
        if (gn.block === gn2.block) {
          blockAnz++;
          if (blockAnz === 1) block1 = j;
          onEntry.add(gn2.index1, gn2.index2, gn2.index3, GROUP_NODE, gn.cand, false, 0, 0, 0, 0, 0, 0);
        }
      }
      const offGroupLink = (house: CellSet, gn2: GroupNode): void => {
        const tmp = house.clone();
        tmp.and(candidates[gn.cand]!);
        tmp.andNot(gn.indices);
        tmp.andNot(gn2.indices);
        if (tmp.isEmpty()) {
          offEntry.add(gn2.index1, gn2.index2, gn2.index3, GROUP_NODE, gn.cand, true, 0, 0, 0, 0, 0, 0);
        }
      };
      if (lineAnz === 1) offGroupLink(LINE_TPL[gn.line]!, gns[line1]!);
      if (colAnz === 1) offGroupLink(COL_TPL[gn.col]!, gns[col1]!);
      if (blockAnz === 1) offGroupLink(BLOCK_TPL[gn.block]!, gns[block1]!);
    }
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
        let srcTableIndex = dest.getCellIndex(j) * 10 + dest.getCandidate(j);
        let isFromExtended = false;
        let isFromOnTable = false;
        let src: TableEntry;
        if (getSNodeType(dest.entries[j]!) !== NORMAL_NODE) {
          const tmpSI = this.extendedTableMap.get(dest.entries[j]!);
          if (tmpSI === undefined) continue;
          srcTableIndex = tmpSI;
          src = this.extendedTable[srcTableIndex]!;
          isFromExtended = true;
        } else {
          isFromOnTable = dest.isStrong(j);
          src = isFromOnTable ? this.onTable[srcTableIndex]! : this.offTable[srcTableIndex]!;
        }
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
              (dest.getDistance(orgIndex) > srcBaseDistance + srcDistance ||
                (dest.getDistance(orgIndex) === srcBaseDistance + srcDistance &&
                  dest.getNodeType(orgIndex) > src.getNodeType(k)))
            ) {
              dest.rets[orgIndex] = { idx: [srcTableIndex, 0, 0, 0, 0], distance: 0, expanded: true, onTable: false, extended: false };
              dest.setExpanded(orgIndex);
              if (isFromExtended) dest.setExtendedTable(orgIndex);
              else if (isFromOnTable) dest.setOnTable(orgIndex);
              dest.setDistance(orgIndex, srcBaseDistance + srcDistance);
            }
          } else {
            const srcCand = src.getCandidate(k);
            const srcStrong = src.isStrong(k);
            if (getSNodeType(srcEntry) === NORMAL_NODE) {
              dest.addWithRet(src.getCellIndex(k), srcCand, srcStrong, srcTableIndex);
            } else {
              dest.add(getSCellIndex(srcEntry), getSCellIndex2(srcEntry), getSCellIndex3(srcEntry), getSNodeType(srcEntry), srcCand, srcStrong, srcTableIndex, 0, 0, 0, 0, 0);
            }
            dest.setExpanded(dest.index - 1);
            if (isFromExtended) dest.setExtendedTable(dest.index - 1);
            else if (isFromOnTable) dest.setOnTable(dest.index - 1);
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
          const tmp = nodeBuddies(nlChain[i - 1]!);
          tmp.and(nodeBuddies(nlChain[i]!));
          tmp.andNot(this.chainSet);
          tmp.remove(startIndex);
          tmp.and(candidates[actCand]!);
          for (const idx of tmp) this.globalStep.addCandidateToDelete(idx, actCand);
        }
      }
    }
    if (this.globalStep.candidatesToDelete.length === 0) return;
    if (!this.reclassifyGrouped(localChain)) return;
    this.finishStep(localChain);
  }

  /**
   * If the chain contains a group node, upgrades the type to its GROUPED_*
   * variant. Returns false when only grouped loops are wanted but the chain is
   * plain (so it should be skipped).
   */
  private reclassifyGrouped(chain: Chain): boolean {
    let grouped = false;
    for (let i = chain.start; i <= chain.end; i++) {
      if (getSNodeType(chain.nodes[i]!) !== NORMAL_NODE) {
        grouped = true;
        break;
      }
    }
    if (grouped) {
      const t = this.globalStep.type;
      if (t === "DISCONTINUOUS_NICE_LOOP") this.globalStep.type = "GROUPED_DISCONTINUOUS_NICE_LOOP";
      else if (t === "CONTINUOUS_NICE_LOOP") this.globalStep.type = "GROUPED_CONTINUOUS_NICE_LOOP";
      else if (t === "AIC") this.globalStep.type = "GROUPED_AIC";
    }
    if (this.onlyGroupedNiceLoops && !grouped) return false;
    return true;
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
    if (!this.reclassifyGrouped(this.globalStep.chains[0]!)) return;
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
    this.addToChainSet(cur.entries[first]!);
    while (first !== 0 && this.chainIndex < this.chain.length) {
      if (cur.isExpanded(first)) {
        const ti = org.getRetIndex(first, 0);
        if (org.isExtendedTable(first)) cur = this.extendedTable[ti]!;
        else if (org.isOnTable(first)) cur = this.onTable[ti]!;
        else cur = this.offTable[ti]!;
        expanded = true;
        first = cur.getEntryIndex(org.entries[first]!);
      }
      const ri0 = cur.getRetIndex(first, 0);
      first = ri0;
      this.chain[this.chainIndex++] = cur.entries[ri0]!;
      this.addToChainSet(cur.entries[ri0]!);
      if (expanded && first === 0) {
        const retEntry = cur.entries[0]!;
        cur = org;
        first = cur.getEntryIndex(retEntry);
        expanded = false;
      }
    }
  }

  private addToChainSet(entry: number): void {
    this.chainSet.add(getSCellIndex(entry));
    if (getSNodeType(entry) === GROUP_NODE) {
      const c2 = getSCellIndex2(entry);
      if (c2 !== -1) this.chainSet.add(c2);
      const c3 = getSCellIndex3(entry);
      if (c3 !== -1) this.chainSet.add(c3);
    }
  }
}

/** Node-aware buddies: a group node's buddies are the cells that see all its cells. */
function nodeBuddies(entry: number): CellSet {
  const set = BUDDIES[getSCellIndex(entry)]!.clone();
  if (getSNodeType(entry) === GROUP_NODE) {
    set.and(BUDDIES[getSCellIndex2(entry)]!);
    const c3 = getSCellIndex3(entry);
    if (c3 !== -1) set.and(BUDDIES[c3]!);
  }
  return set;
}

function isGrouped(type: SolutionType): boolean {
  return (
    type === "GROUPED_NICE_LOOP" ||
    type === "GROUPED_CONTINUOUS_NICE_LOOP" ||
    type === "GROUPED_DISCONTINUOUS_NICE_LOOP" ||
    type === "GROUPED_AIC"
  );
}

/** Maps any nice-loop/AIC variant to its umbrella class for getStep matching. */
function stepClass(type: SolutionType): string {
  if (type === "CONTINUOUS_NICE_LOOP" || type === "DISCONTINUOUS_NICE_LOOP" || type === "NICE_LOOP") {
    return "NICE_LOOP";
  }
  if (
    type === "GROUPED_CONTINUOUS_NICE_LOOP" ||
    type === "GROUPED_DISCONTINUOUS_NICE_LOOP" ||
    type === "GROUPED_NICE_LOOP"
  ) {
    return "GROUPED_NICE_LOOP";
  }
  return type;
}
