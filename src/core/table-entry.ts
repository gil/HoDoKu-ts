/*
 * Port of HoDoKu's TableEntry — all conclusions reachable from one premise
 * (a candidate set ON or OFF). `entries[i]` is a packed Chain node; `rets[i]`
 * carries up to 5 reverse indices (chain/net reconstruction), the distance to
 * the root, and the source-table flags. HoDoKu packs `rets` into a 64-bit long;
 * JS bitwise is 32-bit, so we use an explicit struct (semantically identical).
 */

import {
  getSCandidate,
  getSCellIndex,
  getSNodeType,
  isSStrong,
  makeSEntry,
  makeSimpleEntry,
  NORMAL_NODE,
} from "./chain.js";
import { CellSet } from "./cell-set.js";

const MAX_TABLE_ENTRY_LENGTH = 1000;

export interface RetIndex {
  idx: [number, number, number, number, number]; // reverse indices (idx[0] = largest)
  distance: number;
  expanded: boolean;
  onTable: boolean;
  extended: boolean;
}

function emptyRet(): RetIndex {
  return { idx: [0, 0, 0, 0, 0], distance: 0, expanded: false, onTable: false, extended: false };
}

/** Builds a reverse-index record with the indices sorted so idx[0] is largest. */
export function makeRetIndex(i1: number, i2: number, i3: number, i4: number, i5: number): RetIndex {
  let a = i1 > 4096 ? 0 : i1;
  let b = i2 > 1023 ? 0 : i2;
  let c = i3 > 1023 ? 0 : i3;
  let d = i4 > 1023 ? 0 : i4;
  let e = i5 > 1023 ? 0 : i5;
  let t: number;
  if (b > a) {
    t = b;
    b = a;
    a = t;
  }
  if (c > a) {
    t = c;
    c = a;
    a = t;
  }
  if (d > a) {
    t = d;
    d = a;
    a = t;
  }
  if (e > a) {
    t = e;
    e = a;
    a = t;
  }
  return { idx: [a, b, c, d, e], distance: 0, expanded: false, onTable: false, extended: false };
}

export class TableEntry {
  index = 0;
  entries = new Int32Array(MAX_TABLE_ENTRY_LENGTH);
  rets: RetIndex[] = Array.from({ length: MAX_TABLE_ENTRY_LENGTH }, emptyRet);
  onSets: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  offSets: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  indices = new Map<number, number>();

  reset(): void {
    this.index = 0;
    this.indices.clear();
    for (let i = 1; i <= 9; i++) {
      this.onSets[i]!.clear();
      this.offSets[i]!.clear();
    }
    // entries/rets are overwritten by index; only the live prefix matters
  }

  /** Adds a simple node (initial table fill). */
  addSimple(cellIndex: number, cand: number, set: boolean): void {
    this.add(cellIndex, -1, -1, NORMAL_NODE, cand, set, 0, 0, 0, 0, 0, 0);
  }

  /** Adds a simple node with one reverse index (table expansion). */
  addWithRet(cellIndex: number, cand: number, set: boolean, reverseIndex: number): void {
    this.add(cellIndex, -1, -1, NORMAL_NODE, cand, set, reverseIndex, 0, 0, 0, 0, 0);
  }

  /** Adds a simple node with up to 5 reverse indices (nets). */
  addNet(
    cellIndex: number,
    cand: number,
    set: boolean,
    ri1: number,
    ri2: number,
    ri3: number,
    ri4: number,
    ri5: number,
  ): void {
    this.add(cellIndex, -1, -1, NORMAL_NODE, cand, set, ri1, ri2, ri3, ri4, ri5, 0);
  }

  add(
    cellIndex1: number,
    cellIndex2: number,
    cellIndex3: number,
    nodeType: number,
    cand: number,
    set: boolean,
    ri1: number,
    ri2: number,
    ri3: number,
    ri4: number,
    ri5: number,
    penalty: number,
  ): void {
    if (this.index >= this.entries.length) return;
    if (nodeType === NORMAL_NODE) {
      if ((set && this.onSets[cand]!.contains(cellIndex1)) || (!set && this.offSets[cand]!.contains(cellIndex1))) {
        return; // already there
      }
    }
    const entry = makeSEntry(cellIndex1, cellIndex2, cellIndex3, cand, set, nodeType);
    this.entries[this.index] = entry;
    const ret = makeRetIndex(ri1, ri2, ri3, ri4, ri5);
    this.rets[this.index] = ret;
    if (ri1 < this.rets.length) {
      ret.distance = this.getDistance(ri1) + 1;
    }
    if (nodeType === NORMAL_NODE) {
      if (set) this.onSets[cand]!.add(cellIndex1);
      else this.offSets[cand]!.add(cellIndex1);
    }
    ret.distance += penalty;
    this.indices.set(entry, this.index);
    this.index++;
  }

  getEntry(index: number): number {
    return this.entries[index]!;
  }

  /** Index of (cellIndex,cand,set) in this table, or 0 if absent. */
  getEntryIndexFor(cellIndex: number, set: boolean, cand: number): number {
    const ret = this.indices.get(makeSimpleEntry(cellIndex, cand, set));
    return ret ?? 0;
  }

  getEntryIndex(entry: number): number {
    return this.indices.get(entry) ?? 0;
  }

  isFull(): boolean {
    return this.index === this.entries.length;
  }

  getCellIndex(index: number): number {
    return getSCellIndex(this.entries[index]!);
  }
  isStrong(index: number): boolean {
    return isSStrong(this.entries[index]!);
  }
  getCandidate(index: number): number {
    return getSCandidate(this.entries[index]!);
  }
  getNodeType(index: number): number {
    return getSNodeType(this.entries[index]!);
  }

  getRetIndexAnz(index: number): number {
    const r = this.rets[index]!.idx;
    let anz = 1;
    for (let i = 1; i < 5; i++) if (r[i] !== 0) anz++;
    return anz;
  }

  getRetIndex(index: number, which: number): number {
    if (which === 5) return this.rets[index]!.distance;
    return this.rets[index]!.idx[which]!;
  }

  setDistance(index: number, distance: number): void {
    this.rets[index]!.distance = distance & 0x1ff;
  }
  getDistance(index: number): number {
    return this.rets[index]!.distance & 0x1ff;
  }

  isExpanded(index: number): boolean {
    return this.rets[index]!.expanded;
  }
  setExpanded(index: number): void {
    this.rets[index]!.expanded = true;
  }
  isOnTable(index: number): boolean {
    return this.rets[index]!.onTable;
  }
  setOnTable(index: number): void {
    this.rets[index]!.onTable = true;
  }
  isExtendedTable(index: number): boolean {
    return this.rets[index]!.extended;
  }
  setExtendedTable(index: number): void {
    this.rets[index]!.extended = true;
  }
  setExtendedTableLast(): void {
    this.rets[this.index - 1]!.extended = true;
  }
}
