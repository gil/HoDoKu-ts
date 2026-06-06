/*
 * Candidate-mask helpers. A cell's candidates are held in a 9-bit number where
 * bit (digit - 1) is set when that digit is possible. Mirrors the MASKS /
 * POSSIBLE_VALUES / ANZ_VALUES / CAND_FROM_MASK lookup tables in Sudoku2.
 */

export const MAX_MASK = 0x1ff; // digits 1-9 all set

/** Bitmask for a single digit (1-9). MASKS[c] === 1 << (c - 1). */
export const MASKS: readonly number[] = (() => {
  const m = [0];
  for (let c = 1; c <= 9; c++) m.push(1 << (c - 1));
  return m;
})();

/** POSSIBLE_VALUES[mask] = sorted array of digits (1-9) present in the mask. */
export const POSSIBLE_VALUES: readonly (readonly number[])[] = (() => {
  const out: number[][] = new Array(0x200);
  for (let i = 0; i <= 0x1ff; i++) {
    const digits: number[] = [];
    for (let c = 1; c <= 9; c++) if ((i & (1 << (c - 1))) !== 0) digits.push(c);
    out[i] = digits;
  }
  return out;
})();

/** ANZ_VALUES[mask] = number of digits set in the mask (popcount over 9 bits). */
export const ANZ_VALUES: readonly number[] = (() => {
  const out = new Array<number>(0x200);
  for (let i = 0; i <= 0x1ff; i++) out[i] = POSSIBLE_VALUES[i]!.length;
  return out;
})();

/** CAND_FROM_MASK[mask] = digit of the least-significant set bit (0 if none). */
export const CAND_FROM_MASK: readonly number[] = (() => {
  const out = new Array<number>(0x200).fill(0);
  for (let i = 1; i <= 0x1ff; i++) {
    let c = 1;
    while ((i & (1 << (c - 1))) === 0) c++;
    out[i] = c;
  }
  return out;
})();

export function maskOf(digit: number): number {
  return MASKS[digit]!;
}

export function candidatesOf(mask: number): readonly number[] {
  return POSSIBLE_VALUES[mask & MAX_MASK]!;
}

export function candidateCount(mask: number): number {
  return ANZ_VALUES[mask & MAX_MASK]!;
}

export function hasCandidate(mask: number, digit: number): boolean {
  return (mask & MASKS[digit]!) !== 0;
}
