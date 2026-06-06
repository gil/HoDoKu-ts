/*
 * Port of HoDoKu's Candidate: an (index, value) pair, sorted by value then index.
 */

export interface Candidate {
  /** Cell index 0-80. */
  index: number;
  /** Digit 1-9. */
  value: number;
}

export function candidate(index: number, value: number): Candidate {
  return { index, value };
}

export function compareCandidates(a: Candidate, b: Candidate): number {
  return a.value !== b.value ? a.value - b.value : a.index - b.index;
}
