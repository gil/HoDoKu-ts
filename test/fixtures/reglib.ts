import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ReglibEntry {
  /** Raw technique field, may carry a "-N" variant or "-x" fail marker. */
  tech: string;
  /** Base technique code (library type), without variant suffix. */
  base: string;
  /** True when the case asserts the technique is NOT found. */
  isFail: boolean;
  candidates: string;
  givens: string;
  deletions: string;
  eliminations: string;
  placements: string;
  raw: string;
}

/** Parses a `<cand><line><col>` token into {index, value}. */
export function parseCandToken(token: string): { index: number; value: number } {
  const value = token.charCodeAt(0) - 48;
  const line = token.charCodeAt(1) - 48;
  const col = token.charCodeAt(2) - 48;
  return { index: (line - 1) * 9 + (col - 1), value };
}

export function parseCandList(field: string): { index: number; value: number }[] {
  return field
    .split(" ")
    .filter((t) => t.length === 3)
    .map(parseCandToken);
}

export function loadReglib(): ReglibEntry[] {
  const path = fileURLToPath(new URL("./data/reglib-1.3.txt", import.meta.url));
  const text = readFileSync(path, "utf8");
  const entries: ReglibEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith("#")) continue;
    if (!line.startsWith(":")) continue;
    const parts = line.split(":");
    const tech = parts[1] ?? "";
    const dash = tech.indexOf("-");
    const base = dash >= 0 ? tech.slice(0, dash) : tech;
    entries.push({
      tech,
      base,
      isFail: tech.endsWith("-x") || tech.endsWith("x"),
      candidates: parts[2] ?? "",
      givens: parts[3] ?? "",
      deletions: parts[4] ?? "",
      eliminations: parts[5] ?? "",
      placements: parts[6] ?? "",
      raw: line,
    });
  }
  return entries;
}
