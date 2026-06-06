/*
 * Port of HoDoKu's ChainSolver for X-Chain, XY-Chain and Turbot Fish.
 * (Remote Pair and Nice Loops/AIC are deferred — the latter live in the
 * tabling engine.)
 *
 * A link table is built per chain type (strong/weak links between candidate
 * nodes), then a depth-first stack search walks alternating links. A chain is
 * valid when its first and last links are strong, for the start candidate, and
 * some cell sees both ends (eliminating that candidate). Shorter chains win per
 * elimination set (deletesMap), matching HoDoKu.
 */

import { ANZ_VALUES, POSSIBLE_VALUES } from "../core/candidates.js";
import { CellSet } from "../core/cell-set.js";
import {
  Chain,
  getSCandidate,
  getSCellIndex,
  isSStrong,
  makeSimpleEntry,
  setSStrong,
} from "../core/chain.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { ALL_UNITS, BUDDIES, CONSTRAINTS, LENGTH, getCol, getLine } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const MAX_CHAIN_LENGTH = 20;

interface StackEntry {
  cellIndex: number;
  candidate: number;
  strongOnly: boolean;
  aktIndex: number;
  endIndex: number;
}

export class ChainsSolver {
  private sudoku!: CandidateFinder["board"];
  private candidates!: CellSet[];
  private links: number[] = [];
  private startIdx = new Int32Array(810);
  private endIdx = new Int32Array(810);
  private chain = new Int32Array(MAX_CHAIN_LENGTH + 4);
  private stack: StackEntry[] = Array.from({ length: MAX_CHAIN_LENGTH + 4 }, () => ({
    cellIndex: 0,
    candidate: 0,
    strongOnly: false,
    aktIndex: 0,
    endIndex: 0,
  }));
  private stackLevel = 0;
  private chainSet = new CellSet();
  private startCellSet = new CellSet();
  private startCellSet2 = new CellSet();
  private startIndex = 0;
  private startCandidate = 0;
  private startCandidate2 = 0;
  private rpCell = 0;
  private steps: SolutionStep[] = [];
  private deletesMap = new Map<string, number>();

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    const all = this.getChains(finder, type);
    if (all.length === 0) return null;
    all.sort(chainCompare);
    return all[0]!;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    return this.getChains(finder, type);
  }

  private getChains(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    this.sudoku = finder.board;
    this.candidates = finder.getCandidates();
    this.steps = [];
    this.deletesMap.clear();
    this.buildLinks(type);
    const chainMaxLength = type === "TURBOT_FISH" ? 3 : MAX_CHAIN_LENGTH - 1;

    const sudoku = this.sudoku;
    for (this.startIndex = 0; this.startIndex < LENGTH; this.startIndex++) {
      if (sudoku.values[this.startIndex] !== 0) continue;
      for (const startCandidate of sudoku.getAllCandidates(this.startIndex)) {
        this.startCandidate = startCandidate;
        const linkStart = this.startIndex * 10 + startCandidate;
        for (let li = this.startIdx[linkStart]!; li < this.endIdx[linkStart]!; li++) {
          const link = this.links[li]!;
          if (!isSStrong(link)) continue;
          if ((type === "X_CHAIN" || type === "TURBOT_FISH") && getSCandidate(link) !== startCandidate)
            continue;
          if (
            (type === "XY_CHAIN" || type === "REMOTE_PAIR") &&
            sudoku.getAnzCandidates(getSCellIndex(link)) !== 2
          )
            continue;
          if (
            (type === "XY_CHAIN" || type === "REMOTE_PAIR") &&
            getSCellIndex(link) !== this.startIndex
          )
            continue;

          if (type === "REMOTE_PAIR") {
            this.rpCell = sudoku.cells[this.startIndex]!;
            const cs = sudoku.getAllCandidates(this.startIndex);
            this.startCandidate2 = cs[0] === startCandidate ? cs[1]! : cs[0]!;
          }

          this.stackLevel = 1;
          this.chain[0] = makeSimpleEntry(this.startIndex, startCandidate, false);
          this.chain[1] = link;
          const e = this.stack[1]!;
          e.cellIndex = getSCellIndex(link);
          e.candidate = getSCandidate(link);
          e.strongOnly = !isSStrong(link);
          e.aktIndex = this.startIdx[e.cellIndex * 10 + e.candidate]!;
          e.endIndex = this.endIdx[e.cellIndex * 10 + e.candidate]!;
          this.chainSet.clear();
          this.chainSet.add(this.startIndex);
          this.startCellSet.set(BUDDIES[this.startIndex]!);
          this.startCellSet.and(this.candidates[startCandidate]!);
          if (type === "REMOTE_PAIR") {
            this.startCellSet2.set(BUDDIES[this.startIndex]!);
            this.startCellSet2.and(this.candidates[this.startCandidate2]!);
          }
          this.getChain(type, chainMaxLength);
        }
      }
    }
    return this.steps;
  }

  private getChain(type: SolutionType, chainMaxLength: number): void {
    let level = this.stackLevel;
    let entry = this.stack[level]!;
    const sudoku = this.sudoku;
    for (;;) {
      while (entry.aktIndex >= entry.endIndex) {
        level--;
        this.stackLevel = level;
        entry = this.stack[level]!;
        this.chainSet.remove(entry.cellIndex);
        if (level <= 0) return;
      }
      let newLink = this.links[entry.aktIndex++]!;
      let newLinkIsStrong = isSStrong(newLink);
      if (entry.strongOnly && !newLinkIsStrong) continue;
      const newLinkIndex = getSCellIndex(newLink);
      const newLinkCandidate = getSCandidate(newLink);
      if (entry.cellIndex === newLinkIndex && entry.candidate === newLinkCandidate) continue;
      if (type === "REMOTE_PAIR" && sudoku.cells[newLinkIndex] !== this.rpCell) continue;
      if ((type === "XY_CHAIN" || type === "REMOTE_PAIR") && sudoku.getAnzCandidates(newLinkIndex) !== 2)
        continue;
      if ((type === "X_CHAIN" || type === "TURBOT_FISH") && newLinkCandidate !== this.startCandidate)
        continue;
      if (
        (type === "XY_CHAIN" || type === "REMOTE_PAIR") &&
        entry.strongOnly &&
        newLinkIndex !== entry.cellIndex
      )
        continue;

      let isLoop = false;
      if (this.chainSet.contains(newLinkIndex)) {
        if (this.startIndex !== newLinkIndex) continue;
        isLoop = true;
      }
      this.chainSet.add(entry.cellIndex);
      if (!entry.strongOnly && newLinkIsStrong) {
        newLink = setSStrong(newLink, false);
        newLinkIsStrong = false;
      }
      this.chain[++level] = newLink;
      this.stackLevel = level;

      if (level > 1 && newLinkIsStrong && newLinkCandidate === this.startCandidate) {
        const check = this.startCellSet.clone();
        check.and(BUDDIES[newLinkIndex]!);
        if (!check.isEmpty()) {
          if (type === "X_CHAIN") this.addChainStep(check, "X_CHAIN", level);
          else if (type === "TURBOT_FISH") {
            if (level === 3) this.addChainStep(check, "TURBOT_FISH", level);
          } else if (type === "XY_CHAIN") this.addChainStep(check, "XY_CHAIN", level);
          else if (type === "REMOTE_PAIR") {
            if (level >= 7) this.checkRemotePairs(check, newLinkIndex, level);
          }
        }
      }

      const oldStrongOnly = entry.strongOnly;
      level = this.stackLevel;
      entry = this.stack[level]!;
      if (level < chainMaxLength && !isLoop) {
        entry.cellIndex = newLinkIndex;
        entry.candidate = newLinkCandidate;
        entry.strongOnly = !oldStrongOnly;
        entry.aktIndex = this.startIdx[newLinkIndex * 10 + newLinkCandidate]!;
        entry.endIndex = this.endIdx[newLinkIndex * 10 + newLinkCandidate]!;
      } else {
        entry.aktIndex = entry.endIndex;
      }
    }
  }

  private addChainStep(check: CellSet, type: SolutionType, level: number): void {
    const step = new SolutionStep(type);
    step.addValue(this.startCandidate);
    for (const idx of check) step.addCandidateToDelete(idx, this.startCandidate);
    if (type !== "TURBOT_FISH") {
      const key = step.candidatesToDelete
        .map((c) => `${c.value}@${c.index}`)
        .sort()
        .join(",");
      const old = this.deletesMap.get(key);
      if (old !== undefined && old <= level) return;
      this.deletesMap.set(key, level);
    }
    step.addChain(new Chain(0, level, Array.from(this.chain.slice(0, level + 1))));
    this.steps.push(step);
  }

  private checkRemotePairs(check: CellSet, endIndex: number, level: number): void {
    const step = new SolutionStep("REMOTE_PAIR");
    const rpCand1 = new CellSet();
    const rpCand2 = new CellSet();
    if (level > 7) {
      for (let i = 0; i <= level; i += 2) {
        for (let j = i + 6; j <= level; j += 4) {
          const rpTmp = BUDDIES[getSCellIndex(this.chain[i]!)]!.clone();
          rpTmp.and(BUDDIES[getSCellIndex(this.chain[j]!)]!);
          const cb = rpTmp.clone();
          cb.and(this.candidates[this.startCandidate]!);
          rpCand1.or(cb);
          const cb2 = rpTmp.clone();
          cb2.and(this.candidates[this.startCandidate2]!);
          rpCand2.or(cb2);
        }
      }
    } else {
      rpCand1.set(check);
      const c2 = this.startCellSet2.clone();
      c2.and(BUDDIES[endIndex]!);
      rpCand2.set(c2);
    }
    step.addValue(this.startCandidate);
    step.addValue(this.startCandidate2);
    for (const idx of rpCand1) step.addCandidateToDelete(idx, this.startCandidate);
    for (const idx of rpCand2) step.addCandidateToDelete(idx, this.startCandidate2);
    if (step.candidatesToDelete.length === 0) return;
    const key = step.candidatesToDelete
      .map((c) => `${c.value}@${c.index}`)
      .sort()
      .join(",");
    const old = this.deletesMap.get(key);
    if (old !== undefined && old <= level) return;
    this.deletesMap.set(key, level);
    step.addChain(new Chain(0, level, Array.from(this.chain.slice(0, level + 1))));
    this.steps.push(step);
  }

  private buildLinks(type: SolutionType): void {
    const sudoku = this.sudoku;
    const links: number[] = [];
    let index = 0;
    for (let cellIndex = 0; cellIndex < LENGTH; cellIndex++) {
      const cell = sudoku.cells[cellIndex]!;
      if (
        cell === 0 ||
        ((type === "XY_CHAIN" || type === "REMOTE_PAIR") && ANZ_VALUES[cell] !== 2)
      )
        continue;
      for (let cellCandidate = 1; cellCandidate <= 9; cellCandidate++) {
        const se = cellIndex * 10 + cellCandidate;
        if (!sudoku.isCandidate(cellIndex, cellCandidate)) {
          this.startIdx[se] = index;
          this.endIdx[se] = index;
          continue;
        }
        this.startIdx[se] = index;
        const cands = POSSIBLE_VALUES[cell]!;
        if (ANZ_VALUES[cell] === 2 && type !== "X_CHAIN" && type !== "TURBOT_FISH") {
          let cand = cands[0]!;
          if (cand === cellCandidate) cand = cands[1]!;
          links[index++] = makeSimpleEntry(cellIndex, cand, true);
        }
        const con = CONSTRAINTS[cellIndex]!;
        for (let c = 0; c < 3; c++) {
          const constr = con[c]!;
          const strong =
            sudoku.free[constr]![cellCandidate] === 2 &&
            (type === "X_CHAIN" || type === "TURBOT_FISH");
          for (const k of ALL_UNITS[constr]!) {
            if (k === cellIndex || !sudoku.isCandidate(k, cellCandidate)) continue;
            if (type === "REMOTE_PAIR" && sudoku.cells[k] !== cell) continue;
            if (type === "XY_CHAIN" && ANZ_VALUES[sudoku.cells[k]!] !== 2) continue;
            if (c === 2 && (getLine(cellIndex) === getLine(k) || getCol(cellIndex) === getCol(k)))
              continue;
            links[index++] = makeSimpleEntry(k, cellCandidate, strong);
          }
        }
        this.endIdx[se] = index;
      }
    }
    this.links = links;
  }
}

/** Sort: shorter chains first, then by eliminations. */
function chainCompare(a: SolutionStep, b: SolutionStep): number {
  const la = a.chains[0] ? a.chains[0].end - a.chains[0].start : 0;
  const lb = b.chains[0] ? b.chains[0].end - b.chains[0].start : 0;
  if (la !== lb) return la - lb;
  if (a.candidatesToDelete.length !== b.candidatesToDelete.length)
    return b.candidatesToDelete.length - a.candidatesToDelete.length;
  return 0;
}
