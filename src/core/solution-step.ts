/*
 * Port of HoDoKu's SolutionStep: the payload describing a single deduction
 * (a hint). Carries everything needed to display the step and to apply it to a
 * board. Display/formatting beyond a concise summary is deferred to core/format.
 *
 * The ALS and restricted-common structures are referenced via lightweight
 * interfaces here and fleshed out by the ALS solver in a later phase.
 */

import { type Candidate, candidate } from "./candidate.js";
import {
  type Chain,
  getSAlsIndex,
  getSCandidate,
  getSCellIndex,
  getSCellIndex2,
  getSCellIndex3,
  getSNodeType,
  isSStrong,
  NORMAL_NODE,
  GROUP_NODE,
} from "./chain.js";
import { type SolutionType, typeName } from "./solution-type.js";

const MIN_MARKER = -2147483648;
/** Short entity names indexed by BLOCK=0, LINE=1, COL=2, CELL=3. */
const ENTITY_SHORT = ["b", "r", "c", ""];

function getLine(index: number): number {
  return (index / 9) | 0;
}
function getCol(index: number): number {
  return index % 9;
}

/** "r1c2" or "[r1c2]". */
function cellPrint(index: number, withParen = false): string {
  const s = `r${getLine(index) + 1}c${getCol(index) + 1}`;
  return withParen ? `[${s}]` : s;
}

/** Groups cells sharing a row/col: r1c2+r1c3 -> "r1c23", r1c2+r3c2 -> "r13c2". */
function compactCellPrint(indices: number[]): string {
  const set = [...new Set(indices)].sort((a, b) => a - b);
  let out = "";
  let first = true;
  while (set.length > 0) {
    const index = set.shift()!;
    const line = getLine(index);
    const col = getCol(index);
    let anzLines = 1;
    let anzCols = 1;
    if (first) first = false;
    else out += ",";
    out += `[${cellPrint(index)}]`;
    for (let i = 0; i < set.length; ) {
      const i1 = set[i]!;
      const l1 = getLine(i1);
      const c1 = getCol(i1);
      if (l1 === line && anzLines === 1) {
        const p = out.lastIndexOf("]");
        out = out.slice(0, p) + (c1 + 1) + out.slice(p);
        set.splice(i, 1);
        anzCols++;
      } else if (c1 === col && anzCols === 1) {
        const p = out.lastIndexOf("c");
        out = out.slice(0, p) + (l1 + 1) + out.slice(p);
        set.splice(i, 1);
        anzLines++;
      } else {
        i++;
      }
    }
  }
  return out.replace(/[[\]]/g, "");
}

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
  /** Underlying fish type for a Kraken Fish (for display). */
  subType: SolutionType | null = null;

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

  /** Human-readable description, faithful to HoDoKu's SolutionStep.toString(art). */
  toString(art = 2): string {
    const t = this.type;
    const name = typeName(t);
    const del = (): string => this.candDelStr();
    if (t === "FULL_HOUSE" || t === "HIDDEN_SINGLE" || t === "NAKED_SINGLE") {
      if (art < 2) return art === 1 ? `${name}: ${this.values[0]}` : name;
      return `${name}: ${cellPrint(this.indices[0]!)}=${this.values[0]}`;
    }
    if (
      t === "HIDDEN_PAIR" || t === "NAKED_PAIR" || t === "LOCKED_PAIR" ||
      t === "HIDDEN_TRIPLE" || t === "NAKED_TRIPLE" || t === "LOCKED_TRIPLE" ||
      t === "HIDDEN_QUADRUPLE" || t === "NAKED_QUADRUPLE"
    ) {
      let s = `${name}: ${this.values.join(",")}`;
      if (art >= 2) s += ` in ${compactCellPrint(this.indices)}${del()}`;
      return s;
    }
    if (t === "LOCKED_CANDIDATES" || t === "LOCKED_CANDIDATES_1" || t === "LOCKED_CANDIDATES_2") {
      let s = `${name}: ${this.values[0]}`;
      if (art >= 2) s += ` in ${ENTITY_SHORT[this.entity]}${this.entityNumber}${del()}`;
      return s;
    }
    if (t === "SKYSCRAPER" || t === "TWO_STRING_KITE" || t === "DUAL_TWO_STRING_KITE") {
      let s = `${name}: ${this.values[0]}`;
      if (art >= 2) {
        s += ` in ${compactCellPrint(this.indices.slice(0, 2))}`;
        if (t === "DUAL_TWO_STRING_KITE") s += `/in ${compactCellPrint(this.indices.slice(4, 6))}`;
        s += ` (connected by ${compactCellPrint(this.indices.slice(2, 4))})${del()}`;
      }
      return s;
    }
    if (t === "EMPTY_RECTANGLE" || t === "DUAL_EMPTY_RECTANGLE") {
      let s = `${name}: ${this.values[0]}`;
      if (art >= 2) {
        s += ` in ${ENTITY_SHORT[this.entity]}${this.entityNumber} (${compactCellPrint(this.indices.slice(0, 2))}`;
        if (t === "DUAL_EMPTY_RECTANGLE") s += `/${compactCellPrint(this.indices.slice(2, 4))}`;
        s += `)${del()}`;
      }
      return s;
    }
    if (t === "XY_WING" || t === "XYZ_WING") {
      let s = `${name}: ${this.values[0]}/${this.values[1]}`;
      if (art >= 2) s += `/${this.values[2]} in ${compactCellPrint(this.indices)}${del()}`;
      return s;
    }
    if (t === "W_WING") {
      let s = `${name}: ${this.values[0]}/${this.values[1]}`;
      if (art >= 2) {
        s += ` in ${compactCellPrint(this.indices.slice(0, 2))} connected by ${this.values[1]} in ${this.finSetStr(this.fins)}${del()}`;
      }
      return s;
    }
    if (
      t === "SIMPLE_COLORS" || t === "SIMPLE_COLORS_TRAP" || t === "SIMPLE_COLORS_WRAP" ||
      t === "MULTI_COLORS" || t === "MULTI_COLORS_1" || t === "MULTI_COLORS_2"
    ) {
      let s = `${name}: ${this.values[0]}`;
      if (art >= 2) s += this.colorCellStr() + del();
      return s;
    }
    if (this.isChainType(t)) {
      let s = name;
      if (t === "REMOTE_PAIR") s += `: ${this.values[0]}/${this.values[1]}`;
      else s += `: ${this.candDelDigits()}`;
      if (art >= 2) s += " " + this.chainDisplay() + del();
      return s;
    }
    if (this.isForcingType(t)) {
      let s = name;
      if (art >= 2) {
        if (t === "FORCING_CHAIN_CONTRADICTION" || t === "FORCING_NET_CONTRADICTION") {
          s += ` in ${this.entityShortNameNumber()}`;
        }
        if (this.indices.length > 0) s += ` => ${cellPrint(this.indices[0]!)}=${this.values[0]}`;
        else s += del();
        for (const c of this.chains) s += "\r\n  " + this.forcingChainStr(c);
      }
      return s;
    }
    if (this.isUniquenessType(t)) {
      let s = `${name}: ${this.values[0]}/${this.values[1]}`;
      if (art >= 2) s += ` in ${compactCellPrint(this.indices)}${del()}`;
      return s;
    }
    if (t === "BUG_PLUS_1") return art >= 2 ? name + del() : name;
    if (this.isFishType(t)) return this.fishStr(art);
    if (t === "SUE_DE_COQ") {
      let s = `${name}: ${this.indexValueSet()}`;
      if (art >= 2) s += ` (${this.finSetStr(this.fins)}, ${this.finSetStr(this.endoFins)})${del()}`;
      return s;
    }
    if (t === "ALS_XZ") {
      let s = `${name}: A=${this.alsStr(0)}`;
      if (art >= 2) {
        s += `, B=${this.alsStr(1)}, X=${this.alsXorZ(true)}`;
        if (this.fins.length > 0) s += `, Z=${this.alsXorZ(false)}`;
        s += del();
      }
      return s;
    }
    if (t === "ALS_XY_WING") {
      if (art < 2) return `${name}: C=${this.alsStr(2)}`;
      return `${name}: A=${this.alsStr(0)}, B=${this.alsStr(1)}, C=${this.alsStr(2)}, X,Y=${this.alsXorZ(true)}, Z=${this.alsXorZ(false)}${del()}`;
    }
    if (t === "ALS_XY_CHAIN") {
      if (art < 2) return name;
      let s = `${name}: `;
      s += this.alses.map((_, i) => `${String.fromCharCode(65 + i)}=${this.alsStr(i)}`).join(", ");
      s += `, RCs=${this.alsXorZ(true)}, X=${this.alsXorZ(false)}${del()}`;
      return s;
    }
    if (t === "DEATH_BLOSSOM") {
      let s = `${name}: ${cellPrint(this.indices[0]!)}`;
      if (art >= 2) {
        for (let i = 0; i < this.alses.length; i++) s += `, ${this.alsStr(i)}`;
        s += del();
      }
      return s;
    }
    if (t === "TEMPLATE_SET") {
      return art >= 2 ? `${name}: ${compactCellPrint(this.indices)}=${this.values[0]}` : `${name}: ${this.values[0]}`;
    }
    if (t === "TEMPLATE_DEL") return art >= 2 ? `${name}: ${this.candDelStr().slice(4)}` : name;
    if (t === "BRUTE_FORCE") {
      return art >= 2 ? `${name}: ${compactCellPrint(this.indices)}=${this.values[0]}` : name;
    }
    return name;
  }

  private candDelStr(): string {
    if (this.candidatesToDelete.length === 0) return "";
    // HoDoKu sorts candidatesToDelete in place (value, then index) before display.
    const rest = this.candidatesToDelete
      .map((c) => ({ ...c }))
      .sort((a, b) => a.value - b.value || a.index - b.index);
    const groups: string[] = [];
    while (rest.length > 0) {
      const first = rest.shift()!;
      const cells = [first.index];
      for (let i = 0; i < rest.length; ) {
        if (rest[i]!.value === first.value) {
          cells.push(rest[i]!.index);
          rest.splice(i, 1);
        } else i++;
      }
      groups.push(`${compactCellPrint(cells)}<>${first.value}`);
    }
    return " => " + groups.join(", ");
  }

  private candDelDigits(): string {
    return [...new Set(this.candidatesToDelete.map((c) => c.value))].sort((a, b) => a - b).join("/");
  }

  private colorCellStr(): string {
    const bufs: string[] = [];
    for (const [index, color] of this.colorCandidates) {
      bufs[color] = (bufs[color] === undefined ? "(" : bufs[color] + ",") + cellPrint(index);
    }
    let out = " ";
    for (let i = 0; i < bufs.length; i++) {
      if (bufs[i] === undefined) continue;
      if (i % 2 !== 0) out += " / ";
      else if (i > 0) out += ", ";
      out += bufs[i] + ")";
    }
    return out;
  }

  private finSetStr(fins: Candidate[]): string {
    const idx = [...new Set(fins.map((c) => c.index))].filter((i) => !this.indices.includes(i));
    const cands = [...new Set(fins.map((c) => c.value))].sort((a, b) => a - b);
    return `${compactCellPrint(idx)} - {${cands.join("")}}`;
  }

  private indexValueSet(): string {
    return `${compactCellPrint(this.indices)} - {${this.values.join("")}}`;
  }

  private alsStr(i: number): string {
    const als = this.alses[i]!;
    return `${compactCellPrint(als.indices)} {${als.candidates.join("")}}`;
  }

  private alsXorZ(x: boolean): string {
    const list = x ? this.endoFins : this.fins;
    return [...new Set(list.map((c) => c.value))].sort((a, b) => a - b).join(",");
  }

  private entityShortNameNumber(): string {
    if (this.entity === 3) return cellPrint(this.entityNumber);
    return ENTITY_SHORT[this.entity]! + (this.entityNumber + 1);
  }

  private isChainType(t: SolutionType): boolean {
    return (
      t === "X_CHAIN" || t === "XY_CHAIN" || t === "REMOTE_PAIR" || t === "TURBOT_FISH" ||
      t === "NICE_LOOP" || t === "CONTINUOUS_NICE_LOOP" || t === "DISCONTINUOUS_NICE_LOOP" ||
      t === "GROUPED_NICE_LOOP" || t === "GROUPED_CONTINUOUS_NICE_LOOP" ||
      t === "GROUPED_DISCONTINUOUS_NICE_LOOP" || t === "AIC" || t === "GROUPED_AIC"
    );
  }

  private isForcingType(t: SolutionType): boolean {
    return (
      t === "FORCING_CHAIN" || t === "FORCING_CHAIN_CONTRADICTION" || t === "FORCING_CHAIN_VERITY" ||
      t === "FORCING_NET" || t === "FORCING_NET_CONTRADICTION" || t === "FORCING_NET_VERITY"
    );
  }

  private isUniquenessType(t: SolutionType): boolean {
    return (
      t === "UNIQUENESS_1" || t === "UNIQUENESS_2" || t === "UNIQUENESS_3" || t === "UNIQUENESS_4" ||
      t === "UNIQUENESS_5" || t === "UNIQUENESS_6" || t === "HIDDEN_RECTANGLE" ||
      t === "AVOIDABLE_RECTANGLE_1" || t === "AVOIDABLE_RECTANGLE_2"
    );
  }

  private isFishType(t: SolutionType): boolean {
    return t.includes("WING") === false && (
      /X_WING|SWORDFISH|JELLYFISH|SQUIRMBAG|WHALE|LEVIATHAN|KRAKEN_FISH/.test(t)
    );
  }

  private chainDisplay(): string {
    const ch = this.chains[0]!;
    const buf = this.chainStr(ch);
    const t = this.type;
    if (t === "CONTINUOUS_NICE_LOOP" || t === "GROUPED_CONTINUOUS_NICE_LOOP") {
      let start = ch.start;
      let cellIndex = getSCellIndex(ch.nodes[start]!);
      while (getSCellIndex(ch.nodes[start]!) === cellIndex) start++;
      let end = ch.end;
      cellIndex = getSCellIndex(ch.nodes[end]!);
      while (getSCellIndex(ch.nodes[end]!) === cellIndex) end--;
      end++;
      return `${getSCandidate(ch.nodes[end]!)}= ${buf} =${getSCandidate(ch.nodes[start]!)}`;
    }
    if (t === "AIC" || t === "GROUPED_AIC" || t === "XY_CHAIN") {
      return `${getSCandidate(ch.nodes[ch.start]!)}- ${buf} -${getSCandidate(ch.nodes[ch.end]!)}`;
    }
    return buf;
  }

  /** Nice-loop/AIC chain string with =N=/-N- links (HoDoKu getChainString, alternate=false). */
  private chainStr(ch: Chain): string {
    let out = "";
    let lastIndex = -1;
    for (let i = ch.start; i <= ch.end; i++) {
      const node = ch.nodes[i]!;
      if (getSCellIndex(node) === lastIndex) continue;
      lastIndex = getSCellIndex(node);
      if (i > ch.start) {
        const cand = getSCandidate(node);
        out += isSStrong(node) ? ` =${cand}= ` : ` -${cand}- `;
      }
      out += this.nodeStr(node);
    }
    return out;
  }

  private nodeStr(node: number): string {
    const nt = getSNodeType(node);
    if (nt === GROUP_NODE) {
      return compactCellPrint([getSCellIndex(node), getSCellIndex2(node), getSCellIndex3(node)].filter((x) => x !== -1));
    }
    if (nt === NORMAL_NODE) return cellPrint(getSCellIndex(node));
    const als = this.alses[getSAlsIndex(node)];
    return als ? `ALS:${compactCellPrint(als.indices)}` : "ALS:?";
  }

  private forcingChainStr(ch: Chain): string {
    let out = "";
    let inMin = false;
    out += this.forcingEntry(ch.nodes[ch.start]!);
    for (let i = ch.start + 1; i <= ch.end - 1; i++) {
      const node = ch.nodes[i]!;
      let blank = true;
      if (node === MIN_MARKER) {
        out += ")";
        inMin = false;
        continue;
      }
      if (
        !isSStrong(node) &&
        (node > 0 || (node < 0 && ch.nodes[i + 1]! < 0 && ch.nodes[i + 1] !== MIN_MARKER))
      ) {
        if (getSNodeType(node) === NORMAL_NODE) continue;
      }
      if (node < 0 && !inMin) {
        out += " (";
        inMin = true;
        blank = false;
      }
      if (node > 0 && inMin) {
        out += ")";
        inMin = false;
      }
      if (blank) out += " ";
      out += this.forcingEntry(node);
    }
    out += " " + this.forcingEntry(ch.nodes[ch.end]!);
    return out;
  }

  private forcingEntry(chainEntry: number): string {
    const entry = chainEntry < 0 ? -chainEntry : chainEntry;
    return this.nodeStr(entry) + (isSStrong(entry) ? "=" : "<>") + getSCandidate(entry);
  }

  private fishStr(art: number): string {
    const t = this.type;
    const kraken = t === "KRAKEN_FISH" || t === "KRAKEN_FISH_TYPE_1" || t === "KRAKEN_FISH_TYPE_2";
    let out = (this.isSiamese ? "Siamese " : "") + typeName(t);
    if (art >= 1) {
      if (kraken) {
        out += `: ${this.candDelStr().slice(4)}`;
        if (this.subType) out += `\r\n  ${typeName(this.subType)}`;
      }
      out += `: ${this.values[0]}`;
    }
    if (art >= 2) {
      out += " " + this.entitiesStr(this.baseEntities) + " " + this.entitiesStr(this.coverEntities);
      if (this.fins.length > 0) out += " " + this.finsStr(this.fins, "f");
      if (this.endoFins.length > 0) out += " " + this.finsStr(this.endoFins, "ef");
      if (!kraken) out += this.candDelStr();
    }
    if (kraken) for (const c of this.chains) out += "\r\n  " + this.chainStr(c);
    return out;
  }

  private entitiesStr(entities: Entity[]): string {
    let out = "";
    let last = -1;
    for (const e of entities) {
      if (last !== e.name) out += ENTITY_SHORT[e.name];
      out += e.number;
      last = e.name;
    }
    return out;
  }

  private finsStr(list: Candidate[], prefix: string): string {
    return list.map((c) => prefix + cellPrint(c.index)).join(" ");
  }

  clone(): SolutionStep {
    const s = new SolutionStep(this.type);
    s.entity = this.entity;
    s.entityNumber = this.entityNumber;
    s.entity2 = this.entity2;
    s.entity2Number = this.entity2Number;
    s.isSiamese = this.isSiamese;
    s.subType = this.subType;
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
