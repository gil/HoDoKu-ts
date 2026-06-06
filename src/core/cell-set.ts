/*
 * Port of HoDoKu's SudokuSet / SudokuSetBase.
 *
 * Represents a set of the 81 cell indices (0-80). The original Java stored the
 * set as two 64-bit longs (mask1: 0-63, mask2: 64-80). JavaScript bitwise ops
 * are 32-bit, so the set is backed by three unsigned 32-bit words:
 *   w0: cells 0-31, w1: cells 32-63, w2: cells 64-80 (low 17 bits used).
 * Word/bit indexing therefore mirrors `index >>> 5` / `index & 31`.
 */

const W2_MASK = 0x1ffff; // bits 0-16 -> cells 64-80

function bitCount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  n = (n + (n >>> 4)) & 0x0f0f0f0f;
  return (n * 0x01010101) >>> 24;
}

export class CellSet {
  w0 = 0;
  w1 = 0;
  w2 = 0;

  private cache: number[] | null = null;

  constructor(full = false) {
    if (full) this.setAll();
  }

  static fromIndices(indices: Iterable<number>): CellSet {
    const s = new CellSet();
    for (const i of indices) s.add(i);
    return s;
  }

  clone(): CellSet {
    const s = new CellSet();
    s.w0 = this.w0;
    s.w1 = this.w1;
    s.w2 = this.w2;
    return s;
  }

  set(other: CellSet): this {
    this.w0 = other.w0;
    this.w1 = other.w1;
    this.w2 = other.w2;
    this.cache = null;
    return this;
  }

  add(index: number): void {
    const bit = (1 << (index & 31)) >>> 0;
    if (index >= 64) this.w2 = (this.w2 | bit) >>> 0;
    else if (index >= 32) this.w1 = (this.w1 | bit) >>> 0;
    else this.w0 = (this.w0 | bit) >>> 0;
    this.cache = null;
  }

  remove(index: number): void {
    const bit = ~(1 << (index & 31)) >>> 0;
    if (index >= 64) this.w2 = (this.w2 & bit) >>> 0;
    else if (index >= 32) this.w1 = (this.w1 & bit) >>> 0;
    else this.w0 = (this.w0 & bit) >>> 0;
    this.cache = null;
  }

  contains(index: number): boolean {
    const bit = (1 << (index & 31)) >>> 0;
    if (index >= 64) return (this.w2 & bit) !== 0;
    if (index >= 32) return (this.w1 & bit) !== 0;
    return (this.w0 & bit) !== 0;
  }

  clear(): void {
    this.w0 = this.w1 = this.w2 = 0;
    this.cache = null;
  }

  setAll(): void {
    this.w0 = 0xffffffff;
    this.w1 = 0xffffffff;
    this.w2 = W2_MASK;
    this.cache = null;
  }

  isEmpty(): boolean {
    return this.w0 === 0 && this.w1 === 0 && this.w2 === 0;
  }

  size(): number {
    return bitCount(this.w0) + bitCount(this.w1) + bitCount(this.w2);
  }

  equals(other: CellSet): boolean {
    return this.w0 === other.w0 && this.w1 === other.w1 && this.w2 === other.w2;
  }

  intersects(other: CellSet): boolean {
    return (
      (this.w0 & other.w0) !== 0 ||
      (this.w1 & other.w1) !== 0 ||
      (this.w2 & other.w2) !== 0
    );
  }

  /** True if `other` is fully contained in this set (other ⊆ this). */
  containsAll(other: CellSet): boolean {
    return (
      (other.w0 & ~this.w0) === 0 &&
      (other.w1 & ~this.w1) === 0 &&
      (other.w2 & ~this.w2) === 0
    );
  }

  or(other: CellSet): void {
    this.w0 = (this.w0 | other.w0) >>> 0;
    this.w1 = (this.w1 | other.w1) >>> 0;
    this.w2 = (this.w2 | other.w2) >>> 0;
    this.cache = null;
  }

  and(other: CellSet): void {
    this.w0 = (this.w0 & other.w0) >>> 0;
    this.w1 = (this.w1 & other.w1) >>> 0;
    this.w2 = (this.w2 & other.w2) >>> 0;
    this.cache = null;
  }

  andNot(other: CellSet): void {
    this.w0 = (this.w0 & ~other.w0) >>> 0;
    this.w1 = (this.w1 & ~other.w1) >>> 0;
    this.w2 = (this.w2 & ~other.w2) >>> 0;
    this.cache = null;
  }

  not(): void {
    this.w0 = ~this.w0 >>> 0;
    this.w1 = ~this.w1 >>> 0;
    this.w2 = (~this.w2 & W2_MASK) >>> 0;
    this.cache = null;
  }

  /** this = s1 & s2 */
  setAnd(s1: CellSet, s2: CellSet): void {
    this.w0 = (s1.w0 & s2.w0) >>> 0;
    this.w1 = (s1.w1 & s2.w1) >>> 0;
    this.w2 = (s1.w2 & s2.w2) >>> 0;
    this.cache = null;
  }

  /** this = s1 | s2 */
  setOr(s1: CellSet, s2: CellSet): void {
    this.w0 = (s1.w0 | s2.w0) >>> 0;
    this.w1 = (s1.w1 | s2.w1) >>> 0;
    this.w2 = (s1.w2 | s2.w2) >>> 0;
    this.cache = null;
  }

  /** this |= (s1 & s2) */
  orAndAnd(s1: CellSet, s2: CellSet): void {
    this.w0 = (this.w0 | (s1.w0 & s2.w0)) >>> 0;
    this.w1 = (this.w1 | (s1.w1 & s2.w1)) >>> 0;
    this.w2 = (this.w2 | (s1.w2 & s2.w2)) >>> 0;
    this.cache = null;
  }

  /** Returns ((this & set) == this). */
  andEquals(other: CellSet): boolean {
    return (
      (this.w0 & other.w0) >>> 0 === this.w0 &&
      (this.w1 & other.w1) >>> 0 === this.w1 &&
      (this.w2 & other.w2) >>> 0 === this.w2
    );
  }

  /** Returns ((this & ~set) == this). */
  andNotEquals(other: CellSet): boolean {
    return (
      (this.w0 & ~other.w0) >>> 0 === this.w0 &&
      (this.w1 & ~other.w1) >>> 0 === this.w1 &&
      (this.w2 & ~other.w2) >>> 0 === this.w2
    );
  }

  /** Returns ((this & set) == 0). */
  andEmpty(other: CellSet): boolean {
    return (
      (this.w0 & other.w0) === 0 &&
      (this.w1 & other.w1) === 0 &&
      (this.w2 & other.w2) === 0
    );
  }

  /**
   * Tests whether every element of this set is in `s1`. Elements not covered
   * are written into `fins`. Mirrors SudokuSet.isCovered.
   */
  isCovered(s1: CellSet, fins: CellSet): boolean {
    const m0 = (~s1.w0 & this.w0) >>> 0;
    const m1 = (~s1.w1 & this.w1) >>> 0;
    const m2 = (~s1.w2 & this.w2) >>> 0;
    let covered = true;
    if (m0 !== 0) {
      covered = false;
      fins.w0 = m0;
    }
    if (m1 !== 0) {
      covered = false;
      fins.w1 = m1;
    }
    if (m2 !== 0) {
      covered = false;
      fins.w2 = m2;
    }
    fins.cache = null;
    return covered;
  }

  private computeValues(): number[] {
    const out: number[] = [];
    let w = this.w0;
    while (w !== 0) {
      const b = w & -w;
      out.push(31 - Math.clz32(b));
      w = (w & (w - 1)) >>> 0;
    }
    w = this.w1;
    while (w !== 0) {
      const b = w & -w;
      out.push(32 + (31 - Math.clz32(b)));
      w = (w & (w - 1)) >>> 0;
    }
    w = this.w2;
    while (w !== 0) {
      const b = w & -w;
      out.push(64 + (31 - Math.clz32(b)));
      w = (w & (w - 1)) >>> 0;
    }
    return out;
  }

  /** Sorted array of the cell indices in the set (cached until mutated). */
  toArray(): number[] {
    if (this.cache === null) this.cache = this.computeValues();
    return this.cache;
  }

  get(index: number): number {
    return this.toArray()[index]!;
  }

  forEach(fn: (index: number) => void): void {
    const a = this.toArray();
    for (let i = 0; i < a.length; i++) fn(a[i]!);
  }

  [Symbol.iterator](): Iterator<number> {
    return this.toArray()[Symbol.iterator]();
  }

  toString(): string {
    const a = this.toArray();
    return a.length === 0 ? "empty!" : a.join(" ");
  }
}
