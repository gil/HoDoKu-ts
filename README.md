# hodoku-ts

A TypeScript port of [HoDoKu](https://hodoku.sourceforge.net/), the Sudoku
generator and human-style solver / hint engine. Headless library — no GUI.

Provides:

- **Generation** of puzzles by difficulty (with HoDoKu's rating model)
- **Hints** for the next logical move
- **Solution path** — the ordered list of human techniques that solve a puzzle
- **Technique summary** — which techniques a puzzle needs, and the catalog

Zero runtime dependencies. Ships ESM + CJS + type declarations.

> Port status: the core engine, generator and many techniques are complete and
> validated against HoDoKu's regression library (`reglib`). Advanced techniques
> (chains, ALS, tabling, templates, finned/franken/mutant fish) and some
> uniqueness variants are in progress; until they land, puzzles requiring them
> rate as harder than HoDoKu would. Easy/Medium generation and rating are exact.

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
rate(puzzle.givens);          // { score, difficulty, solved }
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
