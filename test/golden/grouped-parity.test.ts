import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { libraryType } from "../../src/core/solution-type.js";
import { StepFinder } from "../../src/solver/step-finder.js";

// Byte-exact parity for Grouped Nice Loops / AIC against the ORIGINAL Java
// source (not reglib-1.3, whose 5 grouped entries are stale — the original
// source itself cannot reproduce them). The reference was produced by running
// HoDoKu's SudokuStepFinder.getAllGroupedNiceLoops (all-steps mode, ALS nodes
// enabled) on each puzzle; this asserts the TS engine yields the identical set
// of (type, eliminations) for the deepest tabling subsystem (group + ALS nodes).
const path = fileURLToPath(new URL("../fixtures/data/grouped-java-reference.tsv", import.meta.url));
const rows = readFileSync(path, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.length > 0)
  .map((l) => {
    const tab = l.indexOf("\t");
    return { puzzle: l.slice(0, tab), expected: l.slice(tab + 1) };
  });

const cand = (c: { index: number; value: number }) =>
  `${c.value}${Math.floor(c.index / 9) + 1}${(c.index % 9) + 1}`;

function tsGroupedSet(puzzle: string): string {
  const sf = new StepFinder(Board.fromString(puzzle));
  const all = [
    ...sf.findAll("GROUPED_DISCONTINUOUS_NICE_LOOP"),
    ...sf.findAll("GROUPED_CONTINUOUS_NICE_LOOP"),
    ...sf.findAll("GROUPED_AIC"),
  ];
  const out = new Set<string>();
  for (const s of all) {
    const elim = s.candidatesToDelete
      .map(cand)
      .sort((a, b) => a.localeCompare(b))
      .join(",");
    out.add(`${libraryType(s.type)}:${elim}`);
  }
  return [...out].sort().join("|");
}

describe("grouped nice loops/AIC: byte-exact vs original Java source", () => {
  let idx = 0;
  for (const row of rows) {
    it(`#${idx++} ${row.puzzle.split(":").slice(1, 3).join(":")}`, () => {
      expect(tsGroupedSet(row.puzzle)).toBe(row.expected);
    });
  }
});
