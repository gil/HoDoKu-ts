/*
 * Port of HoDoKu's SolutionStep: the payload describing a single deduction
 * (a hint). Carries everything needed to display the step and to apply it to a
 * board. Display/formatting beyond a concise summary is deferred to core/format.
 *
 * The ALS and restricted-common structures are referenced via lightweight
 * interfaces here and fleshed out by the ALS solver in a later phase.
 */

import { type Candidate, candidate } from "./candidate.js";
import type { Chain } from "./chain.js";
import type { SolutionType } from "./solution-type.js";

/** A constraint (house) referenced by a fish: name = unit type, number = 1-9. */
export interface Entity {
  name: number;
  number: number;
}

/** Forward declaration; refined by the ALS solver. */
export interface AlsInSolutionStep {
  indices: number[];
  candidates: number[];
}

/** Forward declaration; refined by the ALS solver. */
export interface RestrictedCommon {
  als1: number;
  als2: number;
  cand1: number;
  cand2: number;
}

export class SolutionStep {
  type: SolutionType;

  /** Simple-technique entity references (row/col/block). */
  entity = 0;
  entityNumber = 0;
  entity2 = 0;
  entity2Number = 0;
  isSiamese = false;

  /** Digits to place. */
  values: number[] = [];
  /** Cells used or set by the step. */
  indices: number[] = [];
  /** Candidates eliminated by the step. */
  candidatesToDelete: Candidate[] = [];
  /** Candidates that can additionally be placed (cannibalism etc.). */
  cannibalistic: Candidate[] = [];

  /** Fish fins / endo-fins. */
  fins: Candidate[] = [];
  endoFins: Candidate[] = [];
  /** Fish base/cover houses. */
  baseEntities: Entity[] = [];
  coverEntities: Entity[] = [];

  /** Chains for chaining techniques. */
  chains: Chain[] = [];
  /** Almost Locked Sets used by the step. */
  alses: AlsInSolutionStep[] = [];
  /** Restricted commons for ALS chains. */
  restrictedCommons: RestrictedCommon[] = [];
  /** Coloring assignments: cell -> color id. */
  colorCandidates = new Map<number, number>();

  /** Difficulty/forcing score used when ranking candidate steps. */
  progressScore = 0;

  constructor(type: SolutionType) {
    this.type = type;
  }

  addValue(v: number): void {
    this.values.push(v);
  }
  addIndex(i: number): void {
    this.indices.push(i);
  }
  addCandidateToDelete(index: number, value: number): void {
    this.candidatesToDelete.push(candidate(index, value));
  }
  addCannibalistic(index: number, value: number): void {
    this.cannibalistic.push(candidate(index, value));
  }
  addFin(index: number, value: number): void {
    this.fins.push(candidate(index, value));
  }
  addEndoFin(index: number, value: number): void {
    this.endoFins.push(candidate(index, value));
  }
  addBaseEntity(name: number, num: number): void {
    this.baseEntities.push({ name, number: num });
  }
  addCoverEntity(name: number, num: number): void {
    this.coverEntities.push({ name, number: num });
  }
  addChain(chain: Chain): void {
    this.chains.push(chain);
  }
  addAls(indices: number[], candidates: number[]): void {
    this.alses.push({ indices, candidates });
  }

  clone(): SolutionStep {
    const s = new SolutionStep(this.type);
    s.entity = this.entity;
    s.entityNumber = this.entityNumber;
    s.entity2 = this.entity2;
    s.entity2Number = this.entity2Number;
    s.isSiamese = this.isSiamese;
    s.values = this.values.slice();
    s.indices = this.indices.slice();
    s.candidatesToDelete = this.candidatesToDelete.map((c) => ({ ...c }));
    s.cannibalistic = this.cannibalistic.map((c) => ({ ...c }));
    s.fins = this.fins.map((c) => ({ ...c }));
    s.endoFins = this.endoFins.map((c) => ({ ...c }));
    s.baseEntities = this.baseEntities.map((e) => ({ ...e }));
    s.coverEntities = this.coverEntities.map((e) => ({ ...e }));
    s.chains = this.chains.map((c) => c.clone());
    s.alses = this.alses.map((a) => ({ indices: a.indices.slice(), candidates: a.candidates.slice() }));
    s.restrictedCommons = this.restrictedCommons.map((r) => ({ ...r }));
    s.colorCandidates = new Map(this.colorCandidates);
    s.progressScore = this.progressScore;
    return s;
  }
}
