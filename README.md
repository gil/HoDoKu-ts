# hodoku-ts

A TypeScript port of [HoDoKu](https://hodoku.sourceforge.net/), the Sudoku
generator and human-style solver / hint engine. Headless library — no GUI.

Provides:

- **Generation** of puzzles by difficulty (with HoDoKu's rating model)
- **Hints** for the next logical move
- **Solution path** — the ordered list of human techniques that solve a puzzle
- **Technique summary** — which techniques a puzzle needs, and the catalog

Zero runtime dependencies. Ships ESM + CJS + type declarations.

Every solving technique is validated against HoDoKu's
own regression library (`reglib-1.3`) and, for the techniques with no reglib
cases, byte-for-byte against the compiled original Java engine, 2226 tests in total:

- **Singles, subsets, intersections, wings, single-digit patterns** (Skyscraper,
  2-String Kite + dual, Empty Rectangle + dual, Turbot), **coloring**, the full
  **uniqueness** family (UR 1-6, Hidden/Avoidable Rectangle, BUG+1).
- **All Fish** — basic / finned / sashimi / franken / mutant, sizes 2-7, plus
  **Siamese Fish** and **Kraken Fish** (Type 1 & 2).
- **Chains** — X/XY-Chain, Remote Pair, Nice Loops + AIC, **grouped** Nice
  Loops/AIC (group + ALS nodes), and **Forcing Chains & Nets** (contradiction +
  verity) via a faithful port of Trebor's Tables.
- **ALS** — ALS-XZ, ALS-XY-Wing, ALS-XY-Chain, Death Blossom; **Sue de Coq**;
  **Templates** (Set + Delete).

Generation by difficulty and rating match HoDoKu's defaults exactly across all
five levels. A global soundness harness proves no technique ever makes an
invalid elimination. Parity is locked in by golden tests against `reglib` plus
`*-java-reference.tsv` fixtures captured from the original jar.

> [!IMPORTANT]
> This port is **very experimental**. It is still being tested and improved
> upon, and its API and behavior may change.

## Install

```sh
pnpm add hodoku-ts
```

## Usage

```ts
import { generate, hint, solve, summarize, listTechniques, rate, countSolutions } from "hodoku-ts";

// Generate a puzzle of a given difficulty
const puzzle = generate({ difficulty: "easy" });
// { givens: "53..7...", solution: "534678...", score, difficulty, clues }

// Next-move hint
const h = hint(puzzle.givens);
// { technique: "HIDDEN_SINGLE", name, difficulty, score, placements, eliminations, explanation, raw }
console.log(h?.explanation); // "Hidden Single: r2c8=7"

// Full solution path
const result = solve(puzzle.givens);
// { solved, score, difficulty, steps: Hint[] }

// Per-technique summary
summarize(puzzle.givens);
// [{ technique, name, count, totalScore }, ...]

// Technique catalog (solver attempt order)
listTechniques();
// [{ technique, name, category, difficulty, baseScore, enabled }, ...]

// Rate / count solutions
rate(puzzle.givens); // { score, difficulty, solved }
countSolutions(puzzle.givens); // 0 (invalid) | 1 (unique) | 2 (multiple)
```

### Board input

Functions accept a `BoardInput`: an 81-character string (`.` or `0` for empty),
a length-81 number array, or a `Board` instance. The HoDoKu library format
(`:technique:candidates:givens:deletions:...`) is also parsed.

### Reproducible generation

```ts
let seed = 42;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
generate({ difficulty: "medium", rng });
```

## Difficulty levels

`easy` ≤ 800 · `medium` ≤ 1000 · `hard` ≤ 1600 · `unfair` ≤ 1800 · `extreme` > 1800,
matching HoDoKu's default score thresholds.

## Development

```sh
pnpm install
pnpm test        # vitest (incl. reglib golden tests)
pnpm build       # tsdown -> dist (ESM + CJS + d.ts)
pnpm typecheck
pnpm lint
```

## License

GPL-3.0-or-later — derivative of HoDoKu (© 2008–12 Bernhard Hobiger). See `COPYING`.
