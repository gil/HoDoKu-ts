import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { libraryType } from "../../src/core/solution-type.js";
import { StepFinder } from "../../src/solver/step-finder.js";

// Byte-exact parity for Forcing Chains (contradiction + verity) against the
// compiled ORIGINAL Java source (SudokuStepFinder.getAllForcingChains, all-steps
// mode with ALS nodes). reglib-1.3 has no forcing-chain cases, so this asserts
// the TS Trebor-tables engine yields the identical set of (type, outcome) as the
// original for the deepest non-net tabling search. "outcome" is the placement
// (S<value>@<cell>) or the elimination set (D<v><r><c>,...).
const path = fileURLToPath(
  new URL("../fixtures/data/forcing-chains-java-reference.tsv", import.meta.url),
);
const rows = readFileSync(path, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.length > 0)
  .map((l) => {
    const tab = l.indexOf("\t");
    return { puzzle: l.slice(0, tab), expected: l.slice(tab + 1) };
  });

const cand = (c: { index: number; value: number }) =>
  `${c.value}${Math.floor(c.index / 9) + 1}${(c.index % 9) + 1}`;

function tsForcingSet(puzzle: string): string {
  const sf = new StepFinder(Board.fromString(puzzle));
  const all = [
    ...sf.findAll("FORCING_CHAIN_CONTRADICTION"),
    ...sf.findAll("FORCING_CHAIN_VERITY"),
  ];
  const out = new Set<string>();
  for (const s of all) {
    const r =
      s.indices.length > 0
        ? `S${s.values[0]}@${s.indices[0]}`
        : "D" + s.candidatesToDelete.map(cand).sort((a, b) => a.localeCompare(b)).join(",");
    out.add(`${libraryType(s.type)}:${r}`);
  }
  return [...out].sort().join("|");
}

describe("forcing chains: byte-exact vs original Java source", () => {
  let idx = 0;
  for (const row of rows) {
    it(`#${idx++}`, () => {
      expect(tsForcingSet(row.puzzle)).toBe(row.expected);
    });
  }
});
