import { describe, expect, it } from "vitest";
import { CellSet } from "../../src/core/cell-set.js";

describe("CellSet", () => {
  it("add/contains/remove across word boundaries", () => {
    const s = new CellSet();
    for (const i of [0, 31, 32, 63, 64, 80]) s.add(i);
    for (const i of [0, 31, 32, 63, 64, 80]) expect(s.contains(i)).toBe(true);
    for (const i of [1, 30, 33, 62, 65, 79]) expect(s.contains(i)).toBe(false);
    expect(s.size()).toBe(6);
    s.remove(32);
    expect(s.contains(32)).toBe(false);
    expect(s.size()).toBe(5);
  });

  it("toArray returns sorted indices", () => {
    const s = CellSet.fromIndices([80, 0, 64, 31, 32, 63]);
    expect(s.toArray()).toEqual([0, 31, 32, 63, 64, 80]);
  });

  it("setAll covers exactly 81 cells", () => {
    const s = new CellSet(true);
    expect(s.size()).toBe(81);
    for (let i = 0; i < 81; i++) expect(s.contains(i)).toBe(true);
    expect(s.contains(81)).toBe(false);
  });

  it("not stays within 81 cells", () => {
    const s = CellSet.fromIndices([0, 64, 80]);
    s.not();
    expect(s.size()).toBe(78);
    expect(s.contains(0)).toBe(false);
    expect(s.contains(80)).toBe(false);
    expect(s.contains(1)).toBe(true);
  });

  it("and/or/andNot", () => {
    const a = CellSet.fromIndices([0, 1, 64, 80]);
    const b = CellSet.fromIndices([1, 2, 80]);
    const or = a.clone();
    or.or(b);
    expect(or.toArray()).toEqual([0, 1, 2, 64, 80]);
    const and = a.clone();
    and.and(b);
    expect(and.toArray()).toEqual([1, 80]);
    const andNot = a.clone();
    andNot.andNot(b);
    expect(andNot.toArray()).toEqual([0, 64]);
  });

  it("intersects / containsAll", () => {
    const a = CellSet.fromIndices([0, 1, 2, 64]);
    const b = CellSet.fromIndices([1, 2]);
    const c = CellSet.fromIndices([5, 70]);
    expect(a.intersects(b)).toBe(true);
    expect(a.intersects(c)).toBe(false);
    expect(a.containsAll(b)).toBe(true);
    expect(b.containsAll(a)).toBe(false);
  });

  it("andEquals / andNotEquals / andEmpty", () => {
    const a = CellSet.fromIndices([0, 1, 64]);
    const sup = CellSet.fromIndices([0, 1, 2, 64, 80]);
    expect(a.andEquals(sup)).toBe(true); // a ⊆ sup
    expect(sup.andEquals(a)).toBe(false);
    const disjoint = CellSet.fromIndices([3, 70]);
    expect(a.andEmpty(disjoint)).toBe(true);
    expect(a.andNotEquals(disjoint)).toBe(true); // a & ~disjoint == a
  });

  it("isCovered fills fins with uncovered elements", () => {
    const a = CellSet.fromIndices([0, 1, 64, 80]);
    const s1 = CellSet.fromIndices([0, 1]);
    const fins = new CellSet();
    expect(a.isCovered(s1, fins)).toBe(false);
    expect(fins.toArray()).toEqual([64, 80]);
    const full = CellSet.fromIndices([0, 1, 64, 80]);
    const fins2 = new CellSet();
    expect(a.isCovered(full, fins2)).toBe(true);
    expect(fins2.isEmpty()).toBe(true);
  });

  it("setAnd / setOr / orAndAnd", () => {
    const a = CellSet.fromIndices([0, 1, 2]);
    const b = CellSet.fromIndices([1, 2, 3]);
    const r = new CellSet();
    r.setAnd(a, b);
    expect(r.toArray()).toEqual([1, 2]);
    r.setOr(a, b);
    expect(r.toArray()).toEqual([0, 1, 2, 3]);
    const acc = CellSet.fromIndices([10]);
    acc.orAndAnd(a, b);
    expect(acc.toArray()).toEqual([1, 2, 10]);
  });
});
