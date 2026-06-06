/*
 * Port of HoDoKu's Chain. A chain is a slice [start..end] into a shared `nodes`
 * array of packed 32-bit entries. Each entry encodes a cell (or group/ALS) node,
 * a candidate, a strong/weak flag and a node type. A NEGATIVE entry marks the
 * "off" state of the node (the candidate is removed there); decoders therefore
 * negate the entry before extracting fields. Bit layout (Chain.java):
 *   bits  0-3 : candidate (1-9)
 *   bit   4   : strong-link flag
 *   bits  5-11: cell index 1 (7 bits)
 *   bits 12-18: cell/ALS index 2 (7 bits, 0x7f = none)
 *   bits 19-25: cell/ALS index 3 (7 bits, 0x7f = none)
 *   bits 26-27: node type (0 normal, 1 group, 2 ALS)
 */

export const NORMAL_NODE = 0;
export const GROUP_NODE = 1;
export const ALS_NODE = 2;

const CAND_MASK = 0xf;
const STRONG_MASK = 0x10;
const INDEX_MASK = 0x7f;
const INDEX1_OFFSET = 5;
const INDEX2_OFFSET = 12;
const INDEX3_OFFSET = 19;
const ALS_INDEX_MASK = 0x3fff000;
const ALS_INDEX_OFFSET = 12;
const NO_INDEX = 0x7f;
const MODE_MASK = 0x3c000000;
const MODE_OFFSET = 26;
const GROUP_NODE_MASK = 0x4000000;
const ALS_NODE_MASK = 0x8000000;

function abs(entry: number): number {
  return entry > 0 ? entry : -entry;
}

export function makeSEntry(
  cellIndex1: number,
  cellIndex2: number,
  cellIndex3: number,
  candidate: number,
  isStrong: boolean,
  nodeType: number,
): number {
  let entry = (cellIndex1 << INDEX1_OFFSET) | candidate;
  if (isStrong) entry |= STRONG_MASK;
  if (nodeType === GROUP_NODE) entry |= GROUP_NODE_MASK;
  else if (nodeType === ALS_NODE) entry |= ALS_NODE_MASK;

  let i2 = cellIndex2;
  let i3 = cellIndex3;
  if (i2 === -1) i2 = nodeType === NORMAL_NODE ? 0 : NO_INDEX;
  if (i3 === -1) i3 = nodeType === NORMAL_NODE ? 0 : NO_INDEX;
  entry |= i2 << INDEX2_OFFSET;
  entry |= i3 << INDEX3_OFFSET;
  return entry;
}

export function makeSimpleEntry(cellIndex: number, candidate: number, isStrong: boolean): number {
  return makeSEntry(cellIndex, 0, 0, candidate, isStrong, NORMAL_NODE);
}

export function makeNodeEntry(
  cellIndex: number,
  candidate: number,
  isStrong: boolean,
  nodeType: number,
): number {
  return makeSEntry(cellIndex, 0, 0, candidate, isStrong, nodeType);
}

/** Build an ALS-node entry, splitting `alsIndex` (14-bit) into its two 7-bit halves. */
export function makeAlsEntry(
  cellIndex: number,
  alsIndex: number,
  candidate: number,
  isStrong: boolean,
  nodeType: number,
): number {
  const higher = (alsIndex >> 7) & INDEX_MASK;
  const lower = alsIndex & INDEX_MASK;
  return makeSEntry(cellIndex, lower, higher, candidate, isStrong, nodeType);
}

export function getSCellIndex(entry: number): number {
  return (abs(entry) >> INDEX1_OFFSET) & INDEX_MASK;
}

export function getSCellIndex2(entry: number): number {
  const r = (abs(entry) >> INDEX2_OFFSET) & INDEX_MASK;
  return r === INDEX_MASK ? -1 : r;
}

export function getSCellIndex3(entry: number): number {
  const r = (abs(entry) >> INDEX3_OFFSET) & INDEX_MASK;
  return r === INDEX_MASK ? -1 : r;
}

export function getSAlsIndex(entry: number): number {
  return (abs(entry) & ALS_INDEX_MASK) >> ALS_INDEX_OFFSET;
}

export function getSCandidate(entry: number): number {
  return abs(entry) & CAND_MASK;
}

export function isSStrong(entry: number): boolean {
  return (abs(entry) & STRONG_MASK) !== 0;
}

export function getSNodeType(entry: number): number {
  return (abs(entry) & MODE_MASK) >> MODE_OFFSET;
}

export class Chain {
  constructor(
    public start: number,
    public end: number,
    public nodes: number[],
    public length = 0,
  ) {}

  clone(): Chain {
    return new Chain(this.start, this.end, this.nodes.slice(), this.length);
  }
}
