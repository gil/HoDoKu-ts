import { describe, expect, it } from "vitest";
import { Board } from "../../src/core/board.js";
import { getTypeFromLibraryType, isSingle } from "../../src/core/solution-type.js";
import { validSolution } from "../../src/solver/brute-force.js";
import { StepFinder } from "../../src/solver/step-finder.js";
import { loadReglib } from "../fixtures/reglib.js";

// Every elimination/placement a solver makes must be consistent with the
// puzzle's true solution. This catches false positives in ANY solver
// (including best-effort ones excluded from the strict instance-match golden).
const CODES = new Set([
  "0000", "0002", "0003", "0200", "0201", "0202", "0210", "0211", "0212",
  "0100", "0101", "0800", "0801", "0803", "0400", "0401", "0402", "0300",
  "0301", "0302", "0403", "0701", "0702", "0703", "0500", "0501", "0502",
  "0503", "0600", "0601", "0602", "0603", "0604", "0605", "0606", "0607",
  "0608", "0610", "1101", "1201", "1202", "0901", "0902", "0903", "1301",
  "0706", "0707", "0708", "0709", "0710", "0711", "0903", "0904", "0404", "0405",
  "03111", "03121", "03211", "03221", "03411", "03421", "03621",
]);

const entries = loadReglib().filter((e) => !e.isFail && CODES.has(e.base));

describe("soundness: no solver eliminates/places against the solution", () => {
  let idx = 0;
  for (const e of entries) {
    const type = getTypeFromLibraryType(e.base);
    it(`#${idx++} ${e.base} ${e.candidates}`, () => {
      if (type === null) return;
      const board = Board.fromString(e.raw);
      const solBoard = board.clone();
      if (!validSolution(solBoard)) return; // skip non-unique fixtures
      const solution = solBoard.solution;
      const steps = new StepFinder(board).findAll(type);
      for (const s of steps) {
        for (const c of s.candidatesToDelete) {
          expect(solution[c.index]).not.toBe(c.value); // never remove the true digit
        }
        if (isSingle(type)) {
          expect(solution[s.indices[0]!]).toBe(s.values[0]); // placement matches solution
        } else if (type === "TEMPLATE_SET") {
          for (const idx of s.indices) expect(solution[idx]).toBe(s.values[0]);
        }
      }
    });
  }
});
