/*
 * Faithful port of HoDoKu's FishSolver: Basic, Finned, Sashimi, Franken and
 * Mutant fish of every size (X-Wing … Leviathan). Kraken Fish (which needs the
 * tabling chains) is deferred.
 *
 * Base/cover unit search over the 27 constraints (lines 0-8, cols 9-17,
 * blocks 18-26). Sets are CellSets (the Java longs M1/M2). A combination is a
 * fish when #base == #cover; fins = base candidates not in the cover (plus endo
 * fins = overlap inside the base); eliminations are cover-not-base candidates
 * (and cannibalistic = base in 2+ covers) that see all fins.
 */

import { CellSet } from "../core/cell-set.js";
import { SolutionStep } from "../core/solution-step.js";
import type { SolutionType } from "../core/solution-type.js";
import { getFishSize, isSashimiFish } from "../core/solution-type.js";
import { categoryOf, isFrankenFish, isMutantFish } from "../config/defaults.js";
import { BLOCK, COL, LINE, UNIT_TEMPLATES, getCommonBuddies } from "../core/tables.js";
import type { CandidateFinder } from "./wing.js";

const BASIC = 0;
const FRANKEN = 1;
const MUTANT = 2;
const MAX_FINS = 5;
const MAX_ENDO_FINS = 2;

const LINE_MASK = 0x1;
const COL_MASK = 0x2;
const BLOCK_MASK = 0x4;
const TYPE_MASK = [BLOCK_MASK, LINE_MASK, COL_MASK]; // indexed by constraint type (BLOCK=0,LINE=1,COL=2)

const BASIC_TYPES: SolutionType[] = ["X_WING", "SWORDFISH", "JELLYFISH", "SQUIRMBAG", "WHALE", "LEVIATHAN"];
const FINNED_BASIC_TYPES: SolutionType[] = ["FINNED_X_WING", "FINNED_SWORDFISH", "FINNED_JELLYFISH", "FINNED_SQUIRMBAG", "FINNED_WHALE", "FINNED_LEVIATHAN"];
const SASHIMI_BASIC_TYPES: SolutionType[] = ["SASHIMI_X_WING", "SASHIMI_SWORDFISH", "SASHIMI_JELLYFISH", "SASHIMI_SQUIRMBAG", "SASHIMI_WHALE", "SASHIMI_LEVIATHAN"];
const FRANKEN_TYPES: SolutionType[] = ["FRANKEN_X_WING", "FRANKEN_SWORDFISH", "FRANKEN_JELLYFISH", "FRANKEN_SQUIRMBAG", "FRANKEN_WHALE", "FRANKEN_LEVIATHAN"];
const FINNED_FRANKEN_TYPES: SolutionType[] = ["FINNED_FRANKEN_X_WING", "FINNED_FRANKEN_SWORDFISH", "FINNED_FRANKEN_JELLYFISH", "FINNED_FRANKEN_SQUIRMBAG", "FINNED_FRANKEN_WHALE", "FINNED_FRANKEN_LEVIATHAN"];
const MUTANT_TYPES: SolutionType[] = ["MUTANT_X_WING", "MUTANT_SWORDFISH", "MUTANT_JELLYFISH", "MUTANT_SQUIRMBAG", "MUTANT_WHALE", "MUTANT_LEVIATHAN"];
const FINNED_MUTANT_TYPES: SolutionType[] = ["FINNED_MUTANT_X_WING", "FINNED_MUTANT_SWORDFISH", "FINNED_MUTANT_JELLYFISH", "FINNED_MUTANT_SQUIRMBAG", "FINNED_MUTANT_WHALE", "FINNED_MUTANT_LEVIATHAN"];

interface BaseEntry {
  aktIndex: number;
  lastUnit: number;
  cand: CellSet;
  endo: CellSet;
}
interface CoverEntry {
  aktIndex: number;
  lastUnit: number;
  cand: CellSet;
  cannib: CellSet;
}

function constraintType(c: number): number {
  return c < 9 ? LINE : c < 18 ? COL : BLOCK;
}

export class FishSolver {
  private candidatesSet!: CellSet;
  private candidate = 0;
  private fishType = BASIC;
  private withoutFins = false;
  private withFins = false;
  private sashimi = false;
  private withEndoFins = false;
  private minSize = 2;
  private maxSize = 2;

  private baseUnits: number[] = [];
  private baseCands: CellSet[] = [];
  private numBase = 0;
  private allCoverUnits: number[] = [];
  private allCoverCands: CellSet[] = [];
  private numAllCover = 0;
  private coverUnits: number[] = [];
  private coverCands: CellSet[] = [];
  private numCover = 0;
  private baseUsed = new Array<boolean>(27).fill(false);
  private coverUsed = new Array<boolean>(27).fill(false);
  private baseStack: BaseEntry[] = [];
  private coverStack: CoverEntry[] = [];
  private baseLevel = 0;
  private coverLevel = 0;
  private out: SolutionStep[] = [];

  constructor() {
    for (let i = 0; i < 10; i++) {
      this.baseStack.push({ aktIndex: 0, lastUnit: -1, cand: new CellSet(), endo: new CellSet() });
      this.coverStack.push({ aktIndex: 0, lastUnit: -1, cand: new CellSet(), cannib: new CellSet() });
    }
  }

  getStep(finder: CandidateFinder, type: SolutionType): SolutionStep | null {
    const all = this.run(finder, type, false);
    return all[0] ?? null;
  }

  findAll(finder: CandidateFinder, type: SolutionType): SolutionStep[] {
    return this.run(finder, type, true);
  }

  private run(finder: CandidateFinder, type: SolutionType, siamese: boolean): SolutionStep[] {
    const size = getFishSize(type);
    const withFins = type.startsWith("FINNED_") || type.startsWith("SASHIMI_");
    const fishType = isMutantFish(type) ? MUTANT : isFrankenFish(type) ? FRANKEN : BASIC;
    const params = {
      size,
      withoutFins: !withFins,
      withFins,
      sashimi: isSashimiFish(type),
      withEndoFins: fishType !== BASIC,
      fishType,
    };
    // Finned and Sashimi basic fish share a category, so a Siamese pair can mix
    // them. In siamese mode for a basic fish, also collect the sister sub-type so
    // the pairing pool spans the whole FINNED_BASIC_FISH category.
    const sashimiVals =
      siamese && fishType === BASIC && withFins ? [false, true] : [params.sashimi];
    this.out = [];
    for (let cand = 1; cand <= 9; cand++) {
      this.candidate = cand;
      this.candidatesSet = finder.getCandidates()[cand]!;
      this.fishType = params.fishType;
      this.withoutFins = params.withoutFins;
      this.withFins = params.withFins;
      this.withEndoFins = params.withEndoFins;
      this.minSize = size;
      this.maxSize = size;
      for (const sh of sashimiVals) {
        this.sashimi = sh;
        this.searchFishes(true);
        if (this.fishType !== MUTANT) this.searchFishes(false);
      }
    }
    // keep only steps of the requested type
    const fishes = this.out.filter((s) => s.type === type);
    if (siamese) this.appendSiameseFish(fishes, this.out);
    return fishes;
  }

  /**
   * Two fish of the same type, candidate and base set but with different
   * eliminations form a Siamese Fish (reglib 5-digit codes, e.g. 03111). The
   * combined step carries both cover sets, fins and eliminations. Only produced
   * in the all-steps catalog (HoDoKu's isAllowDualsAndSiamese), never in solve.
   */
  private appendSiameseFish(fishes: SolutionStep[], pool: SolutionStep[]): void {
    const maxIndex = pool.length;
    for (let i = 0; i < maxIndex - 1; i++) {
      for (let j = i + 1; j < maxIndex; j++) {
        const s1 = pool[i]!;
        const s2 = pool[j]!;
        if (s1.values[0] !== s2.values[0]) continue;
        if (s1.baseEntities.length !== s2.baseEntities.length) continue;
        if (categoryOf(s1.type) !== categoryOf(s2.type)) continue;
        let baseEqual = true;
        for (let k = 0; k < s1.baseEntities.length; k++) {
          const a = s1.baseEntities[k]!;
          const b = s2.baseEntities[k]!;
          if (a.name !== b.name || a.number !== b.number) {
            baseEqual = false;
            break;
          }
        }
        if (!baseEqual) continue;
        const d1 = s1.candidatesToDelete[0]!;
        const d2 = s2.candidatesToDelete[0]!;
        if (d1.index === d2.index && d1.value === d2.value) continue;
        const sia = s1.clone();
        sia.isSiamese = true;
        for (const e of s2.coverEntities) sia.addCoverEntity(e.name, e.number);
        for (const f of s2.fins) sia.addFin(f.index, f.value);
        for (const c of s2.candidatesToDelete) sia.addCandidateToDelete(c.index, c.value);
        fishes.push(sia);
      }
    }
  }

  private searchFishes(lines: boolean): void {
    this.initForCandidate(lines);
    this.baseUsed.fill(false);
    this.baseLevel = 1;
    this.baseStack[0]!.cand.clear();
    this.baseStack[0]!.endo.clear();
    this.baseStack[1]!.aktIndex = 0;
    this.baseStack[1]!.lastUnit = -1;
    const aktEndo = new CellSet();

    for (;;) {
      while (this.baseStack[this.baseLevel]!.aktIndex >= this.numBase) {
        const e = this.baseStack[this.baseLevel]!;
        if (e.lastUnit !== -1) {
          this.baseUsed[e.lastUnit] = false;
          e.lastUnit = -1;
        }
        this.baseLevel--;
        if (this.baseLevel <= 0) return;
      }
      const bEntry = this.baseStack[this.baseLevel]!;
      const aktBaseIndex = bEntry.aktIndex++;
      const prev = this.baseStack[this.baseLevel - 1]!;

      aktEndo.setAnd(prev.cand, this.baseCands[aktBaseIndex]!);
      if (!aktEndo.isEmpty()) {
        if (!this.withFins || !this.withEndoFins || prev.endo.size() + aktEndo.size() > MAX_ENDO_FINS) {
          continue;
        }
      }
      bEntry.cand.setOr(prev.cand, this.baseCands[aktBaseIndex]!);
      bEntry.endo.set(prev.endo);
      bEntry.endo.or(aktEndo);
      if (bEntry.lastUnit !== -1) this.baseUsed[bEntry.lastUnit] = false;
      bEntry.lastUnit = this.baseUnits[aktBaseIndex]!;
      this.baseUsed[bEntry.lastUnit] = true;

      if (this.baseLevel >= this.minSize && this.baseLevel <= this.maxSize) {
        this.searchCovers(bEntry.cand, bEntry.endo);
      }
      if (this.baseLevel < this.maxSize) {
        this.baseLevel++;
        const next = this.baseStack[this.baseLevel]!;
        next.aktIndex = aktBaseIndex + 1;
        next.lastUnit = -1;
      }
    }
  }

  private searchCovers(baseSet: CellSet, endoFin: CellSet): void {
    this.numCover = 0;
    for (let i = 0; i < this.numAllCover; i++) {
      if (this.baseUsed[this.allCoverUnits[i]!]) continue;
      if (baseSet.andEmpty(this.allCoverCands[i]!)) continue;
      this.coverUnits[this.numCover] = this.allCoverUnits[i]!;
      this.coverCands[this.numCover] = this.allCoverCands[i]!;
      this.numCover++;
    }
    this.coverUsed.fill(false);
    this.coverLevel = 1;
    this.coverStack[0]!.cand.clear();
    this.coverStack[0]!.cannib.clear();
    this.coverStack[1]!.aktIndex = 0;
    this.coverStack[1]!.lastUnit = -1;
    const aktCannib = new CellSet();
    const fins = new CellSet();
    const tmp = new CellSet();

    for (;;) {
      while (this.coverStack[this.coverLevel]!.aktIndex >= this.numCover - this.baseLevel + this.coverLevel) {
        const e = this.coverStack[this.coverLevel]!;
        if (e.lastUnit !== -1) {
          this.coverUsed[e.lastUnit] = false;
          e.lastUnit = -1;
        }
        this.coverLevel--;
        if (this.coverLevel <= 0) return;
      }
      const cEntry = this.coverStack[this.coverLevel]!;
      const aktCoverIndex = cEntry.aktIndex++;
      const prev = this.coverStack[this.coverLevel - 1]!;
      aktCannib.setAnd(prev.cand, this.coverCands[aktCoverIndex]!);
      cEntry.cand.setOr(prev.cand, this.coverCands[aktCoverIndex]!);
      cEntry.cannib.set(prev.cannib);
      cEntry.cannib.or(aktCannib);
      if (cEntry.lastUnit !== -1) this.coverUsed[cEntry.lastUnit] = false;
      cEntry.lastUnit = this.coverUnits[aktCoverIndex]!;
      this.coverUsed[cEntry.lastUnit] = true;

      if (this.coverLevel === this.baseLevel) {
        // fins = base \ cover
        fins.set(baseSet);
        fins.andNot(cEntry.cand);
        const isCovered = fins.isEmpty();
        fins.or(endoFin);
        const finSize = fins.size();
        if (isCovered && this.withoutFins && finSize === 0) {
          tmp.set(cEntry.cand);
          tmp.andNot(baseSet);
          if (!tmp.isEmpty() || !cEntry.cannib.isEmpty()) {
            this.createStep(baseSet, fins, endoFin, tmp, cEntry.cannib);
          }
        } else if (this.withFins && finSize > 0 && finSize <= MAX_FINS) {
          const finBuddies = getCommonBuddies(fins); // cells seeing every fin
          if (!finBuddies.isEmpty()) {
            tmp.set(cEntry.cand);
            tmp.andNot(baseSet);
            tmp.and(finBuddies);
            const cannib = cEntry.cannib.clone();
            cannib.and(finBuddies);
            if (!tmp.isEmpty() || !cannib.isEmpty()) {
              this.createStep(baseSet, fins, endoFin, tmp, cannib);
            }
          }
        }
      }
      if (this.coverLevel < this.maxSize) {
        this.coverLevel++;
        const next = this.coverStack[this.coverLevel]!;
        next.aktIndex = aktCoverIndex + 1;
        next.lastUnit = -1;
      }
    }
  }

  private createStep(
    baseSet: CellSet,
    fins: CellSet,
    endoFin: CellSet,
    deleteSet: CellSet,
    cannib: CellSet,
  ): void {
    const size = this.coverLevel;
    const baseMask = this.unitMask(this.baseUsed);
    const coverMask = this.unitMask(this.coverUsed);

    let isSashimi = false;
    if ((baseMask === LINE_MASK && coverMask === COL_MASK) || (baseMask === COL_MASK && coverMask === LINE_MASK)) {
      for (let i = 0; i < this.numBase; i++) {
        if (this.baseUsed[this.baseUnits[i]!]) {
          const t = this.baseCands[i]!.clone();
          t.andNot(fins);
          if (t.size() <= 1) {
            isSashimi = true;
            break;
          }
        }
      }
    }

    let type: SolutionType;
    if ((baseMask === LINE_MASK && coverMask === COL_MASK) || (baseMask === COL_MASK && coverMask === LINE_MASK)) {
      type = isSashimi ? SASHIMI_BASIC_TYPES[size - 2]! : this.withFins ? FINNED_BASIC_TYPES[size - 2]! : BASIC_TYPES[size - 2]!;
    } else if (
      ((baseMask === LINE_MASK || baseMask === (LINE_MASK | BLOCK_MASK)) &&
        (coverMask === COL_MASK || coverMask === (COL_MASK | BLOCK_MASK))) ||
      ((baseMask === COL_MASK || baseMask === (COL_MASK | BLOCK_MASK)) &&
        (coverMask === LINE_MASK || coverMask === (LINE_MASK | BLOCK_MASK)))
    ) {
      type = this.withFins ? FINNED_FRANKEN_TYPES[size - 2]! : FRANKEN_TYPES[size - 2]!;
    } else {
      type = this.withFins ? FINNED_MUTANT_TYPES[size - 2]! : MUTANT_TYPES[size - 2]!;
    }

    // single-step search caches finned/sashimi mismatches; we just drop them
    if (this.fishType === BASIC && this.withFins && this.sashimi !== isSashimi) return;

    const step = new SolutionStep(type);
    step.addValue(this.candidate);
    const baseCells = baseSet.clone();
    baseCells.andNot(fins);
    for (const idx of baseCells) step.addIndex(idx);
    for (let i = 0; i < 27; i++) {
      if (this.baseUsed[i]) step.addBaseEntity(constraintType(i), (i % 9) + 1);
    }
    for (let i = 0; i < 27; i++) {
      if (this.coverUsed[i]) step.addCoverEntity(constraintType(i), (i % 9) + 1);
    }
    for (const idx of deleteSet) step.addCandidateToDelete(idx, this.candidate);
    for (const idx of cannib) {
      step.addCannibalistic(idx, this.candidate);
      step.addCandidateToDelete(idx, this.candidate);
    }
    const finCells = fins.clone();
    finCells.andNot(endoFin);
    for (const idx of finCells) step.addFin(idx, this.candidate);
    for (const idx of endoFin) step.addEndoFin(idx, this.candidate);
    this.out.push(step);
  }

  private unitMask(used: boolean[]): number {
    let mask = 0;
    for (let i = 0; i < 27; i++) if (used[i]) mask |= TYPE_MASK[constraintType(i)]!;
    return mask;
  }

  private initForCandidate(lines: boolean): void {
    this.numBase = 0;
    this.numAllCover = 0;
    for (let i = 0; i < 27; i++) {
      if (i >= 18 && this.fishType === BASIC) continue;
      const set = UNIT_TEMPLATES[i]!.clone();
      set.and(this.candidatesSet);
      if (set.isEmpty()) continue;
      if (i < 9) {
        if (lines || this.fishType === MUTANT) {
          this.addUnit(i, set, true);
          if (this.fishType === MUTANT) this.addUnit(i, set, false);
        } else {
          this.addUnit(i, set, false);
          if (this.fishType === MUTANT) this.addUnit(i, set, true);
        }
      } else if (i < 18) {
        if (lines || this.fishType === MUTANT) {
          this.addUnit(i, set, false);
          if (this.fishType === MUTANT) this.addUnit(i, set, true);
        } else {
          this.addUnit(i, set, true);
          if (this.fishType === MUTANT) this.addUnit(i, set, false);
        }
      } else {
        if (this.fishType !== BASIC) {
          this.addUnit(i, set, false);
          this.addUnit(i, set, true);
        }
      }
    }
  }

  private addUnit(unit: number, set: CellSet, base: boolean): void {
    if (base) {
      if (this.withFins || set.size() <= this.maxSize) {
        this.baseUnits[this.numBase] = unit;
        this.baseCands[this.numBase] = set;
        this.numBase++;
      }
    } else {
      this.allCoverUnits[this.numAllCover] = unit;
      this.allCoverCands[this.numAllCover] = set;
      this.numAllCover++;
    }
  }
}
