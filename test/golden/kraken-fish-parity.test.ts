import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { libraryType } from "../../src/core/solution-type.js";
import { StepFinder } from "../../src/solver/step-finder.js";

// Byte-exact parity for Kraken Fish (Type 1 + Type 2) against the compiled
// ORIGINAL Java source (SudokuStepFinder.getAllKrakenFishes, basic+franken,
// size 2-4, ≤2 fins, ALS nodes on). reglib-1.3 has no Kraken cases. HoDoKu's
// addKrakenStep accumulates duplicate steps that share the same finding, so the
// comparison is over the distinct set of (type, fish-candidate, eliminations).
const path = fileURLToPath(new URL("../fixtures/data/kraken-fish-java-reference.tsv", import.meta.url));
const rows = readFileSync(path, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.length > 0)
  .map((l) => {
    const tab = l.indexOf("\t");
    return { puzzle: l.slice(0, tab), expected: l.slice(tab + 1) };
  });

const cand = (c: { index: number; value: number }) =>
  `${c.value}${Math.floor(c.index / 9) + 1}${(c.index % 9) + 1}`;

function tsKrakenSet(puzzle: string): string {
  const sf = new StepFinder(Board.fromString(puzzle));
  const all = [...sf.findAll("KRAKEN_FISH_TYPE_1"), ...sf.findAll("KRAKEN_FISH_TYPE_2")];
  const out = new Set<string>();
  for (const s of all) {
    const elim = s.candidatesToDelete.map(cand).sort((a, b) => a.localeCompare(b)).join(",");
    out.add(`${libraryType(s.type)}:${s.values[0]}:${elim}`);
  }
  return [...out].sort().join("|");
}

describe("kraken fish: byte-exact vs original Java source", () => {
  let idx = 0;
  for (const row of rows) {
    it(`#${idx++}`, () => {
      expect(tsKrakenSet(row.puzzle)).toBe(row.expected);
    });
  }
});
