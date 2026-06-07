/*
 * Port of HoDoKu's TemplateSolver: Template Set and Template Delete.
 *
 * For each digit, intersect every still-valid single-digit template (one that
 * covers the digit's placements and avoids forbidden cells) iteratively
 * refined so two digits can't claim the same cell. Cells common to all valid
 * templates can be placed (Set); cells in no valid template can be removed (Del).
 */

import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { LENGTH } from "../core/tables.js";
import { getSingleDigitTemplates } from "../core/templates.js";
import type { CandidateFinder } from "./wing.js";

interface TemplateData {
  setValue: CellSet[]; // [1..9] cells set in every valid template
  delCand: CellSet[]; // [1..9] cells where the digit can NOT be placed
}

export class TemplateSolver {
  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    if (type === "TEMPLATE_SET") return this.templateSet(finder)[0] ?? null;
    if (type === "TEMPLATE_DEL") return this.templateDel(finder)[0] ?? null;
    return null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    if (type === "TEMPLATE_SET") return this.templateSet(finder);
    if (type === "TEMPLATE_DEL") return this.templateDel(finder);
    return [];
  }

  private templateSet(finder: CandidateFinder): SolutionStep[] {
    const { setValue } = compute(finder);
    const positions = getPositions(finder);
    const out: SolutionStep[] = [];
    for (let i = 1; i <= 9; i++) {
      const set = setValue[i]!.clone();
      set.andNot(positions[i]!);
      if (set.isEmpty()) continue;
      const step = new SolutionStep("TEMPLATE_SET");
      step.addValue(i);
      for (const idx of set) step.addIndex(idx);
      out.push(step);
    }
    return out;
  }

  private templateDel(finder: CandidateFinder): SolutionStep[] {
    const { delCand } = compute(finder);
    const candidates = finder.getCandidates();
    const out: SolutionStep[] = [];
    for (let i = 1; i <= 9; i++) {
      const set = delCand[i]!.clone();
      set.and(candidates[i]!);
      if (set.isEmpty()) continue;
      const step = new SolutionStep("TEMPLATE_DEL");
      step.addValue(i);
      for (const idx of set) step.addCandidateToDelete(idx, i);
      out.push(step);
    }
    return out;
  }
}

function getPositions(finder: CandidateFinder): CellSet[] {
  const positions: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  for (let i = 0; i < LENGTH; i++) {
    const v = finder.board.values[i]!;
    if (v !== 0) positions[v]!.add(i);
  }
  return positions;
}

function compute(finder: CandidateFinder): TemplateData {
  const templates = getSingleDigitTemplates();
  const allowed = finder.getCandidates();
  const positions = getPositions(finder);
  const setValue: CellSet[] = Array.from({ length: 10 }, () => new CellSet(true));
  const delCand: CellSet[] = Array.from({ length: 10 }, () => new CellSet());
  const candTemplates: CellSet[][] = Array.from({ length: 10 }, () => []);
  const forbidden: CellSet[] = Array.from({ length: 10 }, () => new CellSet());

  for (let i = 1; i <= 9; i++) {
    forbidden[i]!.set(positions[i]!);
    forbidden[i]!.or(allowed[i]!);
    forbidden[i]!.not();
  }

  // First pass: collect every valid template and seed setValue/delCand.
  for (const t of templates) {
    for (let j = 1; j <= 9; j++) {
      if (!positions[j]!.andEquals(t)) continue; // template must contain all placements
      if (!forbidden[j]!.andEmpty(t)) continue; // template must avoid forbidden cells
      candTemplates[j]!.push(t);
      setValue[j]!.and(t);
      delCand[j]!.or(t);
    }
  }

  // Refine: a template of digit j is invalid if it claims a cell that must hold
  // another digit (its setValue). Repeat until stable.
  let removals: number;
  do {
    removals = 0;
    for (let j = 1; j <= 9; j++) {
      setValue[j]!.setAll();
      delCand[j]!.clear();
      const kept: CellSet[] = [];
      for (const t of candTemplates[j]!) {
        let removed = false;
        for (let k = 1; k <= 9; k++) {
          if (k !== j && !t.andEmpty(setValue[k]!)) {
            removed = true;
            removals++;
            break;
          }
        }
        if (!removed) {
          kept.push(t);
          setValue[j]!.and(t);
          delCand[j]!.or(t);
        }
      }
      candTemplates[j] = kept;
    }
  } while (removals > 0);

  for (let i = 1; i <= 9; i++) delCand[i]!.not();
  return { setValue, delCand };
}
