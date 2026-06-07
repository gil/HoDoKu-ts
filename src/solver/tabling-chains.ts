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

import { ANZ_VALUES, candidatesOf } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import {
  ALS_NODE,
  Chain,
  GROUP_NODE,
  getSAlsIndex,
  getSCandidate,
  getSCellIndex,
  getSCellIndex2,
  getSCellIndex3,
  getSNodeType,
  isSStrong,
  makeAlsEntry,
  makeSEntry,
  makeSimpleEntry,
  NORMAL_NODE,
} from "../core/chain.js";
import { Als, enumerateAlses } from "./als.js";
import type { Board } from "../core/board.js";
import { SimpleSolver } from "./simple.js";
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

/** Sentinel separating net branches in a rendered chain (Java Integer.MIN_VALUE). */
const MIN_MARKER = -2147483648;

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
  private withAlsNodes = false;
  private onlyGroupedNiceLoops = false;
  private extendedTable: TableEntry[] = [];
  private extendedTableMap = new Map<number, number>();
  private extendedTableIndex = 0;
  private groupNodes: GroupNode[] = [];
  private alses: Als[] = [];
  private tmpOnSets: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  private tmpOffSets: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  // Forcing-net state
  private netMode = false;
  private work!: Board;
  private saved!: Board;
  private simple = new SimpleSolver();
  private mins: Int32Array[] = [];
  private minLen: number[] = [];
  private actMin = 0;
  private retIdx = [0, 0, 0, 0, 0];
  private stepLen: number[] = [];

  constructor() {
    for (let i = 0; i < LENGTH * 10; i++) {
      this.onTable.push(new TableEntry());
      this.offTable.push(new TableEntry());
    }
  }

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    const grouped = isGrouped(type);
    const all = this.getNiceLoops(finder, grouped, grouped, grouped);
    return all.find((s) => stepClass(s.type) === stepClass(type)) ?? all[0] ?? null;
  }

  findAll(finder: CandidateFinder, type?: SolutionType): SolutionStep[] {
    const grouped = type ? isGrouped(type) : false;
    // The regression library is generated in all-steps mode, which enables
    // ALS nodes inside tabling chains (ALL_STEPS_ALLOW_ALS_IN_TABLING_CHAINS).
    return this.getNiceLoops(finder, grouped, grouped, grouped);
  }

  private getNiceLoops(
    finder: CandidateFinder,
    withGroupNodes: boolean,
    withAlsNodes: boolean,
    onlyGrouped: boolean,
  ): SolutionStep[] {
    this.finder = finder;
    this.withGroupNodes = withGroupNodes;
    this.withAlsNodes = withAlsNodes;
    this.onlyGroupedNiceLoops = onlyGrouped;
    this.netMode = false;
    this.steps = [];
    this.deletesMap.clear();
    this.stepLen = [];
    for (let i = 0; i < this.onTable.length; i++) {
      this.onTable[i]!.reset();
      this.offTable[i]!.reset();
    }
    this.extendedTableMap.clear();
    this.extendedTableIndex = 0;
    this.fillTables();
    if (this.withGroupNodes) this.fillTablesWithGroupNodes();
    if (this.withAlsNodes) this.fillTablesWithAls();
    this.expandTables(this.onTable);
    this.expandTables(this.offTable);
    this.checkNiceLoops(this.onTable);
    this.checkNiceLoops(this.offTable);
    this.checkAics(this.offTable);
    return this.steps;
  }

  /** Faithful Trebor-tables Forcing Chains (chainsOnly; contradiction + verity). */
  getForcingChains(finder: CandidateFinder): SolutionStep[] {
    this.finder = finder;
    this.withGroupNodes = true;
    this.withAlsNodes = true;
    this.onlyGroupedNiceLoops = false;
    this.netMode = false;
    this.steps = [];
    this.deletesMap.clear();
    this.stepLen = [];
    for (let i = 0; i < this.onTable.length; i++) {
      this.onTable[i]!.reset();
      this.offTable[i]!.reset();
    }
    this.extendedTableMap.clear();
    this.extendedTableIndex = 0;
    this.fillTables();
    this.fillTablesWithGroupNodes();
    this.fillTablesWithAls();
    this.expandTables(this.onTable);
    this.expandTables(this.offTable);
    this.checkForcingChains();
    return this.steps;
  }

  /** Faithful Trebor-tables Forcing Nets (net premise tables + net chains). */
  getForcingNets(finder: CandidateFinder): SolutionStep[] {
    this.finder = finder;
    this.withGroupNodes = true;
    this.withAlsNodes = true;
    this.onlyGroupedNiceLoops = false;
    this.netMode = true;
    this.steps = [];
    this.deletesMap.clear();
    this.stepLen = [];
    for (let i = 0; i < this.onTable.length; i++) {
      this.onTable[i]!.reset();
      this.offTable[i]!.reset();
    }
    this.extendedTableMap.clear();
    this.extendedTableIndex = 0;
    this.fillTablesNet();
    this.fillTablesWithGroupNodes();
    this.fillTablesWithAls();
    this.expandTables(this.onTable);
    this.expandTables(this.offTable);
    this.checkForcingChains();
    this.netMode = false;
    return this.steps;
  }

  /** Net table fill: simulate set/delete + propagate singles, recording net premises. */
  private fillTablesNet(): void {
    this.saved = this.finder.board.clone();
    for (let i = 0; i < LENGTH; i++) {
      if (this.saved.values[i] !== 0) continue;
      for (const cand of this.saved.getAllCandidates(i)) {
        this.work = this.saved.clone();
        this.getTableEntry(this.onTable[i * 10 + cand]!, i, cand, true);
        this.work = this.saved.clone();
        this.getTableEntry(this.offTable[i * 10 + cand]!, i, cand, false);
      }
    }
  }

  private getTableEntry(entry: TableEntry, cellIndex: number, cand: number, set: boolean): void {
    if (set) {
      this.setCellNet(cellIndex, cand, entry, false, false);
    } else {
      this.work.delCandidate(cellIndex, cand);
      entry.addWithRet(cellIndex, cand, false, 0);
      if (this.work.getAnzCandidates(cellIndex) === 1) {
        this.setCellNet(cellIndex, this.work.getAllCandidates(cellIndex)[0]!, entry, false, true);
      }
    }
    for (let pass = 0; pass < 4; pass++) {
      const singles = [
        ...this.simple.findAll(this.work, "NAKED_SINGLE"),
        ...this.simple.findAll(this.work, "HIDDEN_SINGLE"),
      ];
      for (const s of singles) {
        this.setCellNet(s.indices[0]!, s.values[0]!, entry, true, s.type === "NAKED_SINGLE");
      }
    }
  }

  private setCellNet(
    cellIndex: number,
    cand: number,
    entry: TableEntry,
    getRet: boolean,
    nakedSingle: boolean,
  ): void {
    const orig = this.finder.getCandidates();
    const tmp = orig[cand]!.clone();
    tmp.remove(cellIndex);
    tmp.and(BUDDIES[cellIndex]!);
    const cands = this.work.getAllCandidates(cellIndex).slice();
    // smallest house by current free count (for hidden-single ret indices)
    const con = CONSTRAINTS[cellIndex]!;
    let entityTpl = LINE_TPL[getLine(cellIndex)]!;
    let entityFree = this.work.free[con[0]!]![cand]!;
    let d = this.work.free[con[1]!]![cand]!;
    if (d < entityFree) {
      entityTpl = COL_TPL[getCol(cellIndex)]!;
      entityFree = d;
    }
    d = this.work.free[con[2]!]![cand]!;
    if (d < entityFree) {
      entityTpl = BLOCK_TPL[getBlock(cellIndex)]!;
      entityFree = d;
    }
    this.work.setCell(cellIndex, cand);
    const retIndex = entry.index;
    if (getRet) {
      this.retIdx = [0, 0, 0, 0, 0];
      if (nakedSingle) {
        let ri = 0;
        for (const c of this.saved.getAllCandidates(cellIndex)) {
          if (c === cand || ri >= 5) continue;
          this.retIdx[ri++] = entry.getEntryIndexFor(cellIndex, false, c);
        }
      } else {
        const t = orig[cand]!.clone();
        t.remove(cellIndex);
        t.and(entityTpl);
        let ri = 0;
        for (const idx of t.toArray()) {
          if (ri >= 5) break;
          this.retIdx[ri++] = entry.getEntryIndexFor(idx, false, cand);
        }
      }
      entry.addNet(cellIndex, cand, true, this.retIdx[0]!, this.retIdx[1]!, this.retIdx[2]!, this.retIdx[3]!, this.retIdx[4]!);
    } else {
      entry.addSimple(cellIndex, cand, true);
    }
    for (const idx of tmp.toArray()) entry.addWithRet(idx, cand, false, retIndex);
    for (const c of cands) {
      if (c !== cand) entry.addWithRet(cellIndex, c, false, retIndex);
    }
  }

  /** Fills + expands the tables for a Kraken Fish search (chainsOnly). */
  initForKrakenSearch(finder: CandidateFinder, withAls: boolean): void {
    this.finder = finder;
    this.withGroupNodes = true;
    this.withAlsNodes = withAls;
    this.onlyGroupedNiceLoops = false;
    this.netMode = false;
    this.steps = [];
    this.deletesMap.clear();
    this.stepLen = [];
    for (let i = 0; i < this.onTable.length; i++) {
      this.onTable[i]!.reset();
      this.offTable[i]!.reset();
    }
    this.extendedTableMap.clear();
    this.extendedTableIndex = 0;
    this.fillTables();
    this.fillTablesWithGroupNodes();
    if (withAls) this.fillTablesWithAls();
    this.expandTables(this.onTable);
    this.expandTables(this.offTable);
  }

  /** KF Type 1: a weak-weak chain from every fin reaches `cand` OFF in `index`. */
  checkKrakenTypeOne(fins: number[], index: number, cand: number): boolean {
    for (const fin of fins) {
      if (!this.onTable[fin * 10 + cand]!.offSets[cand]!.contains(index)) return false;
    }
    return true;
  }

  /** KF Type 2: chains from all `indices` (fish cand ON) reach a common `endCand` OFF. */
  checkKrakenTypeTwo(indices: number[], startCand: number, endCand: number): CellSet {
    const candidates = this.finder.getCandidates();
    const result = candidates[endCand]!.clone();
    for (const idx of indices) result.remove(idx);
    for (const idx of indices) result.and(this.onTable[idx * 10 + startCand]!.offSets[endCand]!);
    return result;
  }

  /** Reconstructs the Kraken chain from (startIndex,startCand) ON to (endIndex,endCand) OFF. */
  getKrakenChain(startIndex: number, startCand: number, endIndex: number, endCand: number): Chain | null {
    this.globalStep = new SolutionStep("KRAKEN_FISH");
    const ok = this.addChain(this.onTable[startIndex * 10 + startCand]!, endIndex, endCand, false, false, false);
    if (!ok || this.globalStep.chains.length === 0) return null;
    return this.globalStep.chains[0]!;
  }

  /** Exposes the ALS list for chain ALS-node display adjustment. */
  getAlses(): Als[] {
    return this.alses;
  }

  private checkForcingChains(): void {
    for (let i = 0; i < this.onTable.length; i++) {
      this.checkOneChain(this.onTable[i]!);
      this.checkOneChain(this.offTable[i]!);
    }
    for (let i = 0; i < this.onTable.length; i++) {
      this.checkTwoChains(this.onTable[i]!, this.offTable[i]!);
    }
    this.checkAllChainsForHouse(null);
    this.checkAllChainsForHouse(LINE_TPL);
    this.checkAllChainsForHouse(COL_TPL);
    this.checkAllChainsForHouse(BLOCK_TPL);
  }

  private forcingStep(type: SolutionType): SolutionStep {
    const s = new SolutionStep(type);
    this.globalStep = s;
    return s;
  }

  private setPremiseResult(entry: TableEntry): void {
    if (entry.isStrong(0)) {
      this.globalStep.addCandidateToDelete(entry.getCellIndex(0), entry.getCandidate(0));
    } else {
      this.globalStep.addIndex(entry.getCellIndex(0));
      this.globalStep.addValue(entry.getCandidate(0));
    }
  }

  private checkOneChain(entry: TableEntry): void {
    if (entry.index === 0) return;
    const cand0 = entry.getCandidate(0);
    const cell0 = entry.getCellIndex(0);
    // chain contains the inverse of its own premise -> premise false
    if (
      (entry.isStrong(0) && entry.offSets[cand0]!.contains(cell0)) ||
      (!entry.isStrong(0) && entry.onSets[cand0]!.contains(cell0))
    ) {
      this.forcingStep("FORCING_CHAIN_CONTRADICTION");
      this.setPremiseResult(entry);
      this.addChain(entry, cell0, cand0, !entry.isStrong(0), false, false);
      this.replaceOrCopyStep();
    }
    // same candidate set in and deleted from one cell
    for (let i = 1; i <= 9; i++) {
      const t = entry.onSets[i]!.clone();
      t.and(entry.offSets[i]!);
      for (const cell of t.toArray()) {
        this.forcingStep("FORCING_CHAIN_CONTRADICTION");
        this.setPremiseResult(entry);
        this.addChain(entry, cell, i, false, false, false);
        this.addChain(entry, cell, i, true, false, false);
        this.replaceOrCopyStep();
      }
    }
    // two different values set in the same cell
    for (let i = 1; i <= 9; i++) {
      for (let j = i + 1; j <= 9; j++) {
        const t = entry.onSets[i]!.clone();
        t.and(entry.onSets[j]!);
        for (const cell of t.toArray()) {
          this.forcingStep("FORCING_CHAIN_CONTRADICTION");
          this.setPremiseResult(entry);
          this.addChain(entry, cell, i, true, false, false);
          this.addChain(entry, cell, j, true, false, false);
          this.replaceOrCopyStep();
        }
      }
    }
    this.checkHouseSet(entry, LINE_TPL);
    this.checkHouseSet(entry, COL_TPL);
    this.checkHouseSet(entry, BLOCK_TPL);
    // a cell loses all its candidates
    const candidates = this.finder.getCandidates();
    const positions = this.finder.getPositions();
    const tmp = new CellSet();
    tmp.setAll();
    for (let i = 1; i <= 9; i++) {
      const t1 = entry.offSets[i]!.clone();
      t1.orNot(candidates[i]!);
      tmp.and(t1);
    }
    for (let i = 1; i <= 9; i++) tmp.andNot(entry.onSets[i]!);
    const set = new CellSet();
    for (let i = 1; i <= 9; i++) set.or(positions[i]!);
    tmp.andNot(set);
    for (const cell of tmp.toArray()) {
      this.forcingStep("FORCING_CHAIN_CONTRADICTION");
      this.setPremiseResult(entry);
      for (const c of this.finder.board.getAllCandidates(cell)) {
        this.addChain(entry, cell, c, false, false, false);
      }
      this.replaceOrCopyStep();
    }
    this.checkHouseDel(entry, LINE_TPL);
    this.checkHouseDel(entry, COL_TPL);
    this.checkHouseDel(entry, BLOCK_TPL);
  }

  private checkHouseSet(entry: TableEntry, houseSets: readonly CellSet[]): void {
    for (let i = 1; i <= 9; i++) {
      for (const house of houseSets) {
        const t = house.clone();
        t.and(entry.onSets[i]!);
        if (t.size() > 1) {
          this.forcingStep("FORCING_CHAIN_CONTRADICTION");
          this.setPremiseResult(entry);
          for (const cell of t.toArray()) this.addChain(entry, cell, i, true, false, false);
          this.replaceOrCopyStep();
        }
      }
    }
  }

  private checkHouseDel(entry: TableEntry, houseSets: readonly CellSet[]): void {
    const allowed = this.finder.getCandidatesAllowed();
    for (let i = 1; i <= 9; i++) {
      for (const house of houseSets) {
        const t = house.clone();
        t.and(allowed[i]!);
        if (!t.isEmpty() && t.andEquals(entry.offSets[i]!)) {
          this.forcingStep("FORCING_CHAIN_CONTRADICTION");
          this.setPremiseResult(entry);
          for (const cell of t.toArray()) this.addChain(entry, cell, i, false, false, false);
          this.replaceOrCopyStep();
        }
      }
    }
  }

  private checkTwoChains(on: TableEntry, off: TableEntry): void {
    if (on.index === 0 || off.index === 0) return;
    const start = on.getCellIndex(0);
    for (let i = 1; i <= 9; i++) {
      const t = on.onSets[i]!.clone();
      t.and(off.onSets[i]!);
      t.remove(start);
      for (const cell of t.toArray()) {
        this.forcingStep("FORCING_CHAIN_VERITY");
        this.globalStep.addIndex(cell);
        this.globalStep.addValue(i);
        this.addChain(on, cell, i, true, false, false);
        this.addChain(off, cell, i, true, false, false);
        this.replaceOrCopyStep();
      }
    }
    for (let i = 1; i <= 9; i++) {
      const t = on.offSets[i]!.clone();
      t.and(off.offSets[i]!);
      t.remove(start);
      for (const cell of t.toArray()) {
        this.forcingStep("FORCING_CHAIN_VERITY");
        this.globalStep.addCandidateToDelete(cell, i);
        this.addChain(on, cell, i, false, false, false);
        this.addChain(off, cell, i, false, false, false);
        this.replaceOrCopyStep();
      }
    }
  }

  private checkAllChainsForHouse(houseSets: readonly CellSet[] | null): void {
    const candidates = this.finder.getCandidates();
    if (houseSets === null) {
      for (let i = 0; i < LENGTH; i++) {
        if (this.finder.board.values[i] !== 0) continue;
        const list: TableEntry[] = [];
        for (const c of this.finder.board.getAllCandidates(i)) list.push(this.onTable[i * 10 + c]!);
        this.checkEntryList(list);
      }
    } else {
      for (const house of houseSets) {
        for (let j = 1; j <= 9; j++) {
          const t = house.clone();
          t.and(candidates[j]!);
          if (t.isEmpty()) continue;
          const list: TableEntry[] = [];
          for (const cell of t.toArray()) list.push(this.onTable[cell * 10 + j]!);
          this.checkEntryList(list);
        }
      }
    }
  }

  private checkEntryList(list: TableEntry[]): void {
    if (list.length === 0) return;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i]!;
      for (let j = 1; j <= 9; j++) {
        if (i === 0) {
          this.tmpOnSets[j]!.set(entry.onSets[j]!);
          this.tmpOffSets[j]!.set(entry.offSets[j]!);
        } else {
          this.tmpOnSets[j]!.and(entry.onSets[j]!);
          this.tmpOffSets[j]!.and(entry.offSets[j]!);
        }
      }
    }
    for (let j = 1; j <= 9; j++) {
      for (const cell of this.tmpOnSets[j]!.toArray()) {
        this.forcingStep("FORCING_CHAIN_VERITY");
        this.globalStep.addIndex(cell);
        this.globalStep.addValue(j);
        for (const e of list) this.addChain(e, cell, j, true, false, false);
        this.replaceOrCopyStep();
      }
      for (const cell of this.tmpOffSets[j]!.toArray()) {
        this.forcingStep("FORCING_CHAIN_VERITY");
        this.globalStep.addCandidateToDelete(cell, j);
        for (const e of list) this.addChain(e, cell, j, false, false, false);
        this.replaceOrCopyStep();
      }
    }
  }

  /**
   * Adds every ALS referenced by the step's chains to step.alses and rewrites
   * the chain ALS-node indices to the step-local index (HoDoKu adjustChains).
   * Needed so the chain can be rendered ("ALS:r1c2 {39}").
   */
  adjustChains(step: SolutionStep): void {
    const chainAlses = new Map<number, number>();
    let alsIndex = step.alses.length;
    for (const ch of step.chains) {
      for (let j = ch.start; j <= ch.end; j++) {
        const node = ch.nodes[j]!;
        if (node === -2147483648) continue;
        const abs = node < 0 ? -node : node;
        if (getSNodeType(abs) !== ALS_NODE) continue;
        const which = getSAlsIndex(abs);
        let newIndex = chainAlses.get(which);
        if (newIndex === undefined) {
          const als = this.alses[which]!;
          step.addAls(als.indices.toArray(), candidatesOf(als.candidates).slice());
          newIndex = alsIndex++;
          chainAlses.set(which, newIndex);
        }
        const re = makeAlsEntry(getSCellIndex(abs), newIndex, getSCandidate(abs), isSStrong(abs), ALS_NODE);
        ch.nodes[j] = node < 0 ? -re : re;
      }
    }
  }

  private replaceOrCopyStep(): void {
    const step = this.globalStep;
    if (step.chains.length === 0) return;
    // Net detection: a chain node stored as a negative value marks a net branch.
    let net = false;
    for (const c of step.chains) {
      for (let i = c.start; i <= c.end; i++) {
        if (c.nodes[i]! < 0) {
          net = true;
          break;
        }
      }
      if (net) break;
    }
    if (net) {
      if (step.type === "FORCING_CHAIN_CONTRADICTION") step.type = "FORCING_NET_CONTRADICTION";
      else if (step.type === "FORCING_CHAIN_VERITY") step.type = "FORCING_NET_VERITY";
    }
    // In a net search keep only nets; in a chain search keep only chains.
    if (this.netMode && !net) return;
    // length must be computed before adjustChains (chain still has solver-global ALS indices)
    const len = this.chainsLength(step.chains);
    // HoDoKu dedups by getCandidateString(false), which embeds the step name,
    // so contradiction and verity for the same outcome are kept separately.
    const key =
      step.type +
      (step.candidatesToDelete.length > 0
        ? "|d:" + step.candidatesToDelete.map((c) => `${c.value}@${c.index}`).sort().join(",")
        : "|s:" + step.indices.map((idx, k) => `${step.values[k]}@${idx}`).sort().join(","));
    const old = this.deletesMap.get(key);
    if (old !== undefined) {
      if (this.stepLen[old]! > len) {
        this.adjustChains(step);
        this.steps[old] = step.clone();
        this.stepLen[old] = len;
      }
      return;
    }
    this.adjustChains(step);
    this.deletesMap.set(key, this.steps.length);
    this.stepLen[this.steps.length] = len;
    this.steps.push(step.clone());
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

  private getAlsTableEntry(entryCellIndex: number, alsIndex: number, cand: number): TableEntry | null {
    const entry = makeAlsEntry(entryCellIndex, alsIndex, cand, false, ALS_NODE);
    const idx = this.extendedTableMap.get(entry);
    return idx === undefined ? null : this.extendedTable[idx]!;
  }

  private fillTablesWithAls(): void {
    const sudoku = this.finder.board;
    const candidates = this.finder.getCandidates();
    this.alses = enumerateAlses(this.finder).filter((a) => a.indices.size() > 1);
    const alses = this.alses;
    const alsElim: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
    for (let i = 0; i < alses.length; i++) {
      const als = alses[i]!;
      const penalty = chainPenalty(ANZ_VALUES[als.candidates]!);
      for (let j = 1; j <= 9; j++) {
        const ipc = als.indicesPerCandidat[j];
        if (!ipc || ipc.isEmpty()) continue;
        // possible eliminations for this entry candidate
        let elimPresent = false;
        for (let k = 1; k <= 9; k++) {
          alsElim[k]!.clear();
          if (k === j) continue;
          if (als.indicesPerCandidat[k]) {
            alsElim[k]!.set(candidates[k]!);
            alsElim[k]!.and(als.buddiesPerCandidat[k]!);
            if (!alsElim[k]!.isEmpty()) elimPresent = true;
          }
        }
        if (!elimPresent) continue;
        const entryIndex = ipc.toArray()[0]!;
        let offEntry = this.getAlsTableEntry(entryIndex, i, j);
        if (offEntry === null) {
          offEntry = this.getNextExtendedTableEntry(this.extendedTableIndex);
          offEntry.addAlsEntry(entryIndex, i, j, false, 0);
          this.extendedTableMap.set(offEntry.entries[0]!, this.extendedTableIndex);
          this.extendedTableIndex++;
        }
        // put the ALS into the onTables of all entry candidates
        const entrySet = candidates[j]!.clone();
        entrySet.and(als.buddiesPerCandidat[j]!);
        const alsEntryVal = makeAlsEntry(entryIndex, i, j, false, ALS_NODE);
        for (const actIndex of entrySet.toArray()) {
          this.onTable[actIndex * 10 + j]!.addAlsEntry(entryIndex, i, j, false, 0);
          // group nodes that can serve as an entry into the ALS
          for (const gAct of this.groupNodes) {
            if (gAct.cand !== j || !gAct.indices.contains(actIndex)) continue;
            const ov = als.indices.clone();
            if (!ov.andEmpty(gAct.indices)) continue;
            const vis = ipc.clone();
            if (!vis.andEquals(gAct.buddies)) continue;
            const gEntry = makeSEntry(gAct.index1, gAct.index2, gAct.index3, j, true, GROUP_NODE);
            const gIdx = this.extendedTableMap.get(gEntry);
            if (gIdx === undefined) continue;
            const gTmp = this.extendedTable[gIdx]!;
            if (gTmp.indices.has(alsEntryVal)) continue;
            gTmp.addAlsEntry(entryIndex, i, j, false, 0);
          }
        }
        // eliminations: single candidates and group nodes
        for (let k = 1; k <= 9; k++) {
          if (alsElim[k]!.isEmpty()) continue;
          for (const l of alsElim[k]!.toArray()) {
            offEntry.add(l, -1, -1, NORMAL_NODE, k, false, 0, 0, 0, 0, 0, penalty);
          }
          for (const gAct of this.groupNodes) {
            if (gAct.cand !== k) continue;
            const gIdxSet = gAct.indices.clone();
            if (!gIdxSet.andEquals(alsElim[k]!)) continue;
            offEntry.add(gAct.index1, gAct.index2, gAct.index3, GROUP_NODE, k, false, 0, 0, 0, 0, 0, penalty);
          }
        }
        // ALS triggers another ALS when its eliminations cover a whole candidate of it
        for (let k = 0; k < alses.length; k++) {
          if (k === i) continue;
          const tmpAls = alses[k]!;
          const ovv = als.indices.clone();
          if (!ovv.andEmpty(tmpAls.indices)) continue;
          for (let l = 1; l <= 9; l++) {
            const tip = tmpAls.indicesPerCandidat[l];
            if (alsElim[l]!.isEmpty() || !tip || tip.isEmpty()) continue;
            if (!tip.andEquals(alsElim[l]!)) continue; // tip subset of elim
            const tmpAlsIndex = tip.toArray()[0]!;
            if (this.getAlsTableEntry(tmpAlsIndex, k, l) === null) {
              const tmpAlsEntry = this.getNextExtendedTableEntry(this.extendedTableIndex);
              tmpAlsEntry.addAlsEntry(tmpAlsIndex, k, l, false, 0);
              this.extendedTableMap.set(tmpAlsEntry.entries[0]!, this.extendedTableIndex);
              this.extendedTableIndex++;
            }
            offEntry.addAlsEntry(tmpAlsIndex, k, l, false, penalty);
          }
        }
        // forcings: an ALS buddy left with a single candidate is forced
        for (const cellIndex of als.buddies.toArray()) {
          if (sudoku.values[cellIndex] !== 0 || sudoku.getAnzCandidates(cellIndex) === 2) continue;
          let count = 0;
          let forced = 0;
          for (const c of sudoku.getAllCandidates(cellIndex)) {
            if (alsElim[c]!.contains(cellIndex)) continue;
            count++;
            forced = c;
          }
          if (count === 1) {
            offEntry.add(cellIndex, -1, -1, NORMAL_NODE, forced, true, 0, 0, 0, 0, 0, penalty + 1);
          }
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
          const tmp = nodeBuddies(nlChain[i - 1]!, actCand, this.alses);
          tmp.and(nodeBuddies(nlChain[i]!, actCand, this.alses));
          tmp.andNot(this.chainSet);
          tmp.remove(startIndex);
          tmp.and(candidates[actCand]!);
          for (const idx of tmp) this.globalStep.addCandidateToDelete(idx, actCand);

          // ALS node: candidates that are not entry/exit can eliminate; forced exits too
          if (getSNodeType(nlChain[i]!) === ALS_NODE) {
            const isForceExit = i < nlChainIndex && isSStrong(nlChain[i + 1]!);
            const nextCellIndex = getSCellIndex(nlChain[i + 1]!);
            const exitCands = new Set<number>();
            if (isForceExit) {
              const forceCand = getSCandidate(nlChain[i + 1]!);
              for (const c of sudoku.getAllCandidates(nextCellIndex)) if (c !== forceCand) exitCands.add(c);
            } else if (i < nlChainIndex) {
              exitCands.add(getSCandidate(nlChain[i + 1]!));
            }
            const als = this.alses[getSAlsIndex(nlChain[i]!)]!;
            for (let jj = 1; jj <= 9; jj++) {
              if (jj === actCand || exitCands.has(jj) || !als.buddiesPerCandidat[jj]) continue;
              const t = als.buddiesPerCandidat[jj]!.clone();
              t.and(candidates[jj]!);
              for (const idx of t) this.globalStep.addCandidateToDelete(idx, jj);
            }
            if (isForceExit) {
              const nb = BUDDIES[nextCellIndex]!;
              for (const ec of exitCands) {
                if (!als.buddiesPerCandidat[ec]) continue;
                const t = als.buddiesPerCandidat[ec]!.clone();
                t.and(nb);
                t.and(candidates[ec]!);
                for (const idx of t) this.globalStep.addCandidateToDelete(idx, ec);
              }
            }
          }
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

  private finishStep(_chain: Chain): void {
    const del = this.candKey();
    const len = this.chainsLength(this.globalStep.chains);
    const old = this.deletesMap.get(del);
    if (old !== undefined && this.stepLen[old]! <= len) return;
    this.adjustChains(this.globalStep);
    const cloned = this.globalStep.clone();
    if (old !== undefined) {
      this.steps[old] = cloned;
      this.stepLen[old] = len;
    } else {
      this.deletesMap.set(del, this.steps.length);
      this.stepLen[this.steps.length] = len;
      this.steps.push(cloned);
    }
  }

  private chainsLength(chains: Chain[]): number {
    let len = 0;
    for (const ch of chains) len += ch.end - ch.start + 1;
    return len;
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
    let lastCellEntry = -1;
    const firstCellIndex = getSCellIndex(this.chain[this.chainIndex - 1]!);
    let j = 0;
    for (let i = this.chainIndex - 1; i >= 0; i--) {
      const oldEntry = this.chain[i]!;
      const newCellIndex = getSCellIndex(oldEntry);
      if (isNiceLoop || isAic) {
        if (this.lassoSet.contains(newCellIndex)) return false;
        if (lastCellIndex !== -1 && (lastCellIndex !== firstCellIndex || isAic)) {
          this.lassoSet.add(lastCellIndex);
          // group/ALS nodes occupy several cells; a nice loop may not cross any of them
          const lt = getSNodeType(lastCellEntry);
          if (lt === GROUP_NODE) {
            const c2 = getSCellIndex2(lastCellEntry);
            if (c2 !== -1) this.lassoSet.add(c2);
            const c3 = getSCellIndex3(lastCellEntry);
            if (c3 !== -1) this.lassoSet.add(c3);
          } else if (lt === ALS_NODE) {
            this.lassoSet.or(this.alses[getSAlsIndex(lastCellEntry)]!.indices);
          }
        }
      }
      lastCellIndex = newCellIndex;
      lastCellEntry = oldEntry;
      this.tmpChain[j++] = oldEntry;
      // weave in net branches whose connection point is this entry
      for (let k = 0; k < this.actMin; k++) {
        if (this.minLen[k]! > 0 && this.mins[k]![this.minLen[k]! - 1] === oldEntry) {
          for (let l = this.minLen[k]! - 2; l >= 0; l--) this.tmpChain[j++] = -this.mins[k]![l]!;
          this.tmpChain[j++] = MIN_MARKER;
        }
      }
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
    this.actMin = 0;
    const chainEntry = makeSimpleEntry(cellIndex, cand, set);
    let index = -1;
    for (let i = 0; i < entry.index; i++) {
      if (entry.entries[i] === chainEntry) {
        index = i;
        break;
      }
    }
    if (index === -1) return;
    this.chainIndex = this.traceChain(entry, index, this.chain, false);
    // net parts: reconstruct each collected multiple-inference branch
    let m = 0;
    while (m < this.actMin) {
      const startVal = this.mins[m]![0]!;
      const si = entry.getEntryIndex(startVal);
      if (si === 0 && startVal !== entry.entries[0]) {
        this.minLen[m] = 0;
      } else {
        this.minLen[m] = this.traceChain(entry, si, this.mins[m]!, true);
      }
      m++;
    }
  }

  /**
   * Traces one chain from `startIndex` back to the premise, writing entries into
   * `out` (reversed order) and returning its length. For the main chain
   * (isMin=false) all cells are recorded in chainSet and, in net mode, the extra
   * reverse indices spawn net branches (mins). For a branch (isMin=true) the
   * trace stops as soon as it reaches the main chain.
   */
  private traceChain(entry: TableEntry, startIndex: number, out: Int32Array, isMin: boolean): number {
    let idx = 0;
    let cur = entry;
    const org = entry;
    let first = startIndex;
    let expanded = false;
    out[idx++] = cur.entries[first]!;
    if (!isMin) this.addToChainSet(cur.entries[first]!);
    while (first !== 0 && idx < out.length) {
      if (cur.isExpanded(first)) {
        const ti = org.getRetIndex(first, 0);
        if (org.isExtendedTable(first)) cur = this.extendedTable[ti]!;
        else if (org.isOnTable(first)) cur = this.onTable[ti]!;
        else cur = this.offTable[ti]!;
        expanded = true;
        first = cur.getEntryIndex(org.entries[first]!);
      }
      const tmpFirst = first;
      const ri0 = cur.getRetIndex(tmpFirst, 0);
      first = ri0;
      out[idx++] = cur.entries[ri0]!;
      if (!isMin) {
        this.addToChainSet(cur.entries[ri0]!);
      } else if (this.chainSet.contains(cur.getCellIndex(ri0))) {
        for (let j = 0; j < this.chainIndex; j++) {
          if (this.chain[j] === cur.entries[ri0]) return idx;
        }
      }
      if (this.netMode && !isMin) {
        for (let i = 1; i < 5; i++) {
          const ei = cur.getRetIndex(tmpFirst, i);
          if (ei !== 0) {
            if (this.mins[this.actMin] === undefined) this.mins[this.actMin] = new Int32Array(2000);
            this.mins[this.actMin]![0] = cur.entries[ei]!;
            this.minLen[this.actMin] = 1;
            this.actMin++;
          }
        }
      }
      if (expanded && first === 0) {
        const retEntry = cur.entries[0]!;
        cur = org;
        first = cur.getEntryIndex(retEntry);
        expanded = false;
      }
    }
    return idx;
  }

  private addToChainSet(entry: number): void {
    this.chainSet.add(getSCellIndex(entry));
    const nt = getSNodeType(entry);
    if (nt === GROUP_NODE) {
      const c2 = getSCellIndex2(entry);
      if (c2 !== -1) this.chainSet.add(c2);
      const c3 = getSCellIndex3(entry);
      if (c3 !== -1) this.chainSet.add(c3);
    } else if (nt === ALS_NODE) {
      this.chainSet.or(this.alses[getSAlsIndex(entry)]!.indices);
    }
  }
}

/**
 * Node-aware buddies for the given link candidate (HoDoKu Chain.getSNodeBuddies):
 * group node = cells seeing all its cells; ALS = buddiesPerCandidat[candidate].
 * The candidate is the link candidate, NOT the node's stored entry candidate.
 */
function nodeBuddies(entry: number, candidate: number, alses: Als[]): CellSet {
  const nodeType = getSNodeType(entry);
  if (nodeType === GROUP_NODE) {
    const set = BUDDIES[getSCellIndex(entry)]!.clone();
    set.and(BUDDIES[getSCellIndex2(entry)]!);
    const c3 = getSCellIndex3(entry);
    if (c3 !== -1) set.and(BUDDIES[c3]!);
    return set;
  }
  if (nodeType === ALS_NODE) {
    return alses[getSAlsIndex(entry)]!.buddiesPerCandidat[candidate]!.clone();
  }
  return BUDDIES[getSCellIndex(entry)]!.clone();
}

/** ALS chain penalty: prefers chains with fewer/smaller ALS (HoDoKu Als.getChainPenalty). */
function chainPenalty(candSize: number): number {
  if (candSize <= 1) return 0;
  if (candSize === 2) return candSize - 1;
  return (candSize - 1) * 2;
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
