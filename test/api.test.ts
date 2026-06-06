import { describe, expect, it } from "vitest";
import {
  countSolutions,
  generate,
  hint,
  listTechniques,
  rate,
  solve,
  summarize,
} from "../src/api.js";

const PUZZLE =
  "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("public API", () => {
  it("solve returns the full path and final grid", () => {
    const r = solve(PUZZLE);
    expect(r.solved).toBe(true);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps[0]!.explanation).toMatch(/:/);
    expect(["easy", "medium", "hard", "unfair", "extreme"]).toContain(r.difficulty);
  });

  it("hint returns the next move without mutating input", () => {
    const board = PUZZLE;
    const h = hint(board);
    expect(h).not.toBeNull();
    expect(h!.technique).toBeTruthy();
    expect(h!.placements.length + h!.eliminations.length).toBeGreaterThan(0);
  });

  it("rate gives score + difficulty", () => {
    const r = rate(PUZZLE);
    expect(r.solved).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  it("countSolutions confirms uniqueness", () => {
    expect(countSolutions(PUZZLE)).toBe(1);
    expect(countSolutions(SOLUTION)).toBe(1);
  });

  it("summarize aggregates techniques", () => {
    const s = summarize(PUZZLE);
    expect(s.length).toBeGreaterThan(0);
    const total = s.reduce((a, e) => a + e.count, 0);
    expect(total).toBe(solve(PUZZLE).steps.length);
    for (const e of s) expect(e.totalScore).toBe(e.count * (e.totalScore / e.count));
  });

  it("listTechniques returns the catalog", () => {
    const list = listTechniques();
    expect(list.length).toBe(92);
    const fh = list.find((t) => t.technique === "FULL_HOUSE");
    expect(fh!.baseScore).toBe(4);
    expect(fh!.category).toBe("Singles");
  });

  it("generate produces an easy puzzle with unique solution", () => {
    const p = generate({ difficulty: "easy", rng: rngFrom(11), maxTries: 3000 });
    expect(p).not.toBeNull();
    expect(p!.difficulty).toBe("easy");
    expect(p!.clues).toBeGreaterThanOrEqual(17);
    expect(countSolutions(p!.givens)).toBe(1);
    expect(p!.solution).toHaveLength(81);
  });

  it("generate without difficulty returns a rated puzzle", () => {
    const p = generate({ rng: rngFrom(5) });
    expect(p).not.toBeNull();
    expect(p!.givens).toHaveLength(81);
  });
});
