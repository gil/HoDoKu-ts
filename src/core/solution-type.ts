/*
 * Port of HoDoKu's SolutionType enum. Represented as a const map from the
 * original Java enum name to its metadata: display name, library-format code
 * and short argument name. Category-dependent predicates (isFish, etc.) live in
 * config/defaults where the StepConfig table (the source of categories) is
 * defined. The pure, intrinsic predicates stay here.
 */

export interface SolutionTypeMeta {
  readonly name: string;
  readonly lib: string;
  readonly arg: string;
}

export const SOLUTION_TYPE_META = {
  FULL_HOUSE: { name: "Full House", lib: "0000", arg: "fh" },
  HIDDEN_SINGLE: { name: "Hidden Single", lib: "0002", arg: "h1" },
  HIDDEN_PAIR: { name: "Hidden Pair", lib: "0210", arg: "h2" },
  HIDDEN_TRIPLE: { name: "Hidden Triple", lib: "0211", arg: "h3" },
  HIDDEN_QUADRUPLE: { name: "Hidden Quadruple", lib: "0212", arg: "h4" },
  NAKED_SINGLE: { name: "Naked Single", lib: "0003", arg: "n1" },
  NAKED_PAIR: { name: "Naked Pair", lib: "0200", arg: "n2" },
  NAKED_TRIPLE: { name: "Naked Triple", lib: "0201", arg: "n3" },
  NAKED_QUADRUPLE: { name: "Naked Quadruple", lib: "0202", arg: "n4" },
  LOCKED_PAIR: { name: "Locked Pair", lib: "0110", arg: "l2" },
  LOCKED_TRIPLE: { name: "Locked Triple", lib: "0111", arg: "l3" },
  LOCKED_CANDIDATES: { name: "Locked Candidates", lib: "xxxx", arg: "lc" },
  LOCKED_CANDIDATES_1: { name: "Locked Candidates Type 1 (Pointing)", lib: "0100", arg: "lc1" },
  LOCKED_CANDIDATES_2: { name: "Locked Candidates Type 2 (Claiming)", lib: "0101", arg: "lc2" },
  SKYSCRAPER: { name: "Skyscraper", lib: "0400", arg: "sk" },
  TWO_STRING_KITE: { name: "2-String Kite", lib: "0401", arg: "2sk" },
  UNIQUENESS_1: { name: "Uniqueness Test 1", lib: "0600", arg: "u1" },
  UNIQUENESS_2: { name: "Uniqueness Test 2", lib: "0601", arg: "u2" },
  UNIQUENESS_3: { name: "Uniqueness Test 3", lib: "0602", arg: "u3" },
  UNIQUENESS_4: { name: "Uniqueness Test 4", lib: "0603", arg: "u4" },
  UNIQUENESS_5: { name: "Uniqueness Test 5", lib: "0604", arg: "u5" },
  UNIQUENESS_6: { name: "Uniqueness Test 6", lib: "0605", arg: "u6" },
  BUG_PLUS_1: { name: "Bivalue Universal Grave + 1", lib: "0610", arg: "bug1" },
  XY_WING: { name: "XY-Wing", lib: "0800", arg: "xy" },
  XYZ_WING: { name: "XYZ-Wing", lib: "0801", arg: "xyz" },
  W_WING: { name: "W-Wing", lib: "0803", arg: "w" },
  X_CHAIN: { name: "X-Chain", lib: "0701", arg: "x" },
  XY_CHAIN: { name: "XY-Chain", lib: "0702", arg: "xyc" },
  REMOTE_PAIR: { name: "Remote Pair", lib: "0703", arg: "rp" },
  NICE_LOOP: { name: "Nice Loop/AIC", lib: "xxxx", arg: "nl" },
  CONTINUOUS_NICE_LOOP: { name: "Continuous Nice Loop", lib: "0706", arg: "cnl" },
  DISCONTINUOUS_NICE_LOOP: { name: "Discontinuous Nice Loop", lib: "0707", arg: "dnl" },
  X_WING: { name: "X-Wing", lib: "0300", arg: "bf2" },
  SWORDFISH: { name: "Swordfish", lib: "0301", arg: "bf3" },
  JELLYFISH: { name: "Jellyfish", lib: "0302", arg: "bf4" },
  SQUIRMBAG: { name: "Squirmbag", lib: "0303", arg: "bf5" },
  WHALE: { name: "Whale", lib: "0304", arg: "bf6" },
  LEVIATHAN: { name: "Leviathan", lib: "0305", arg: "bf7" },
  FINNED_X_WING: { name: "Finned X-Wing", lib: "0310", arg: "fbf2" },
  FINNED_SWORDFISH: { name: "Finned Swordfish", lib: "0311", arg: "fbf3" },
  FINNED_JELLYFISH: { name: "Finned Jellyfish", lib: "0312", arg: "fbf4" },
  FINNED_SQUIRMBAG: { name: "Finned Squirmbag", lib: "0313", arg: "fbf5" },
  FINNED_WHALE: { name: "Finned Whale", lib: "0314", arg: "fbf6" },
  FINNED_LEVIATHAN: { name: "Finned Leviathan", lib: "0315", arg: "fbf7" },
  SASHIMI_X_WING: { name: "Sashimi X-Wing", lib: "0320", arg: "sbf2" },
  SASHIMI_SWORDFISH: { name: "Sashimi Swordfish", lib: "0321", arg: "sbf3" },
  SASHIMI_JELLYFISH: { name: "Sashimi Jellyfish", lib: "0322", arg: "sbf4" },
  SASHIMI_SQUIRMBAG: { name: "Sashimi Squirmbag", lib: "0323", arg: "sbf5" },
  SASHIMI_WHALE: { name: "Sashimi Whale", lib: "0324", arg: "sbf6" },
  SASHIMI_LEVIATHAN: { name: "Sashimi Leviathan", lib: "0325", arg: "sbf7" },
  FRANKEN_X_WING: { name: "Franken X-Wing", lib: "0330", arg: "ff2" },
  FRANKEN_SWORDFISH: { name: "Franken Swordfish", lib: "0331", arg: "ff3" },
  FRANKEN_JELLYFISH: { name: "Franken Jellyfish", lib: "0332", arg: "ff4" },
  FRANKEN_SQUIRMBAG: { name: "Franken Squirmbag", lib: "0333", arg: "ff5" },
  FRANKEN_WHALE: { name: "Franken Whale", lib: "0334", arg: "ff6" },
  FRANKEN_LEVIATHAN: { name: "Franken Leviathan", lib: "0335", arg: "ff7" },
  FINNED_FRANKEN_X_WING: { name: "Finned Franken X-Wing", lib: "0340", arg: "fff2" },
  FINNED_FRANKEN_SWORDFISH: { name: "Finned Franken Swordfish", lib: "0341", arg: "fff3" },
  FINNED_FRANKEN_JELLYFISH: { name: "Finned Franken Jellyfish", lib: "0342", arg: "fff4" },
  FINNED_FRANKEN_SQUIRMBAG: { name: "Finned Franken Squirmbag", lib: "0343", arg: "fff5" },
  FINNED_FRANKEN_WHALE: { name: "Finned Franken Whale", lib: "0344", arg: "fff6" },
  FINNED_FRANKEN_LEVIATHAN: { name: "Finned Franken Leviathan", lib: "0345", arg: "fff7" },
  MUTANT_X_WING: { name: "Mutant X-Wing", lib: "0350", arg: "mf2" },
  MUTANT_SWORDFISH: { name: "Mutant Swordfish", lib: "0351", arg: "mf3" },
  MUTANT_JELLYFISH: { name: "Mutant Jellyfish", lib: "0352", arg: "mf4" },
  MUTANT_SQUIRMBAG: { name: "Mutant Squirmbag", lib: "0353", arg: "mf5" },
  MUTANT_WHALE: { name: "Mutant Whale", lib: "0354", arg: "mf6" },
  MUTANT_LEVIATHAN: { name: "Mutant Leviathan", lib: "0355", arg: "mf7" },
  FINNED_MUTANT_X_WING: { name: "Finned Mutant X-Wing", lib: "0360", arg: "fmf2" },
  FINNED_MUTANT_SWORDFISH: { name: "Finned Mutant Swordfish", lib: "0361", arg: "fmf3" },
  FINNED_MUTANT_JELLYFISH: { name: "Finned Mutant Jellyfish", lib: "0362", arg: "fmf4" },
  FINNED_MUTANT_SQUIRMBAG: { name: "Finned Mutant Squirmbag", lib: "0363", arg: "fmf5" },
  FINNED_MUTANT_WHALE: { name: "Finned Mutant Whale", lib: "0364", arg: "fmf6" },
  FINNED_MUTANT_LEVIATHAN: { name: "Finned Mutant Leviathan", lib: "0365", arg: "fmf7" },
  SUE_DE_COQ: { name: "Sue de Coq", lib: "1101", arg: "sdc" },
  ALS_XZ: { name: "Almost Locked Set XZ-Rule", lib: "0901", arg: "axz" },
  ALS_XY_WING: { name: "Almost Locked Set XY-Wing", lib: "0902", arg: "axy" },
  ALS_XY_CHAIN: { name: "Almost Locked Set XY-Chain", lib: "0903", arg: "ach" },
  DEATH_BLOSSOM: { name: "Death Blossom", lib: "0904", arg: "db" },
  TEMPLATE_SET: { name: "Template Set", lib: "1201", arg: "ts" },
  TEMPLATE_DEL: { name: "Template Delete", lib: "1202", arg: "td" },
  FORCING_CHAIN: { name: "Forcing Chain", lib: "xxxx", arg: "fc" },
  FORCING_CHAIN_CONTRADICTION: { name: "Forcing Chain Contradiction", lib: "1301", arg: "fcc" },
  FORCING_CHAIN_VERITY: { name: "Forcing Chain Verity", lib: "1302", arg: "fcv" },
  FORCING_NET: { name: "Forcing Net", lib: "xxxx", arg: "fn" },
  FORCING_NET_CONTRADICTION: { name: "Forcing Net Contradiction", lib: "1303", arg: "fnc" },
  FORCING_NET_VERITY: { name: "Forcing Net Verity", lib: "1304", arg: "fnv" },
  BRUTE_FORCE: { name: "Brute Force", lib: "xxxx", arg: "bf" },
  INCOMPLETE: { name: "Incomplete Solution", lib: "xxxx", arg: "in" },
  GIVE_UP: { name: "Give Up", lib: "xxxx", arg: "gu" },
  GROUPED_NICE_LOOP: { name: "Grouped Nice Loop/AIC", lib: "xxxx", arg: "gnl" },
  GROUPED_CONTINUOUS_NICE_LOOP: { name: "Grouped Continuous Nice Loop", lib: "0709", arg: "gcnl" },
  GROUPED_DISCONTINUOUS_NICE_LOOP: {
    name: "Grouped Discontinuous Nice Loop",
    lib: "0710",
    arg: "gdnl",
  },
  EMPTY_RECTANGLE: { name: "Empty Rectangle", lib: "0402", arg: "er" },
  HIDDEN_RECTANGLE: { name: "Hidden Rectangle", lib: "0606", arg: "hr" },
  AVOIDABLE_RECTANGLE_1: { name: "Avoidable Rectangle Type 1", lib: "0607", arg: "ar1" },
  AVOIDABLE_RECTANGLE_2: { name: "Avoidable Rectangle Type 2", lib: "0608", arg: "ar2" },
  AIC: { name: "AIC", lib: "0708", arg: "aic" },
  GROUPED_AIC: { name: "Grouped AIC", lib: "0711", arg: "gaic" },
  SIMPLE_COLORS: { name: "Simple Colors", lib: "xxxx", arg: "sc" },
  MULTI_COLORS: { name: "Multi Colors", lib: "xxxx", arg: "mc" },
  KRAKEN_FISH: { name: "Kraken Fish", lib: "xxxx", arg: "kf" },
  TURBOT_FISH: { name: "Turbot Fish", lib: "0403", arg: "tf" },
  KRAKEN_FISH_TYPE_1: { name: "Kraken Fish Type 1", lib: "0371", arg: "kf1" },
  KRAKEN_FISH_TYPE_2: { name: "Kraken Fish Type 2", lib: "0372", arg: "kf2" },
  DUAL_TWO_STRING_KITE: { name: "Dual 2-String Kite", lib: "0404", arg: "d2sk" },
  DUAL_EMPTY_RECTANGLE: { name: "Dual Empty Rectangle", lib: "0405", arg: "der" },
  SIMPLE_COLORS_TRAP: { name: "Simple Colors Trap", lib: "0500", arg: "sc1" },
  SIMPLE_COLORS_WRAP: { name: "Simple Colors Wrap", lib: "0501", arg: "sc2" },
  MULTI_COLORS_1: { name: "Multi Colors 1", lib: "0502", arg: "mc1" },
  MULTI_COLORS_2: { name: "Multi Colors 2", lib: "0503", arg: "mc2" },
} as const satisfies Record<string, SolutionTypeMeta>;

export type SolutionType = keyof typeof SOLUTION_TYPE_META;

export const SOLUTION_TYPES = Object.keys(SOLUTION_TYPE_META) as SolutionType[];

export function typeName(type: SolutionType): string {
  return SOLUTION_TYPE_META[type].name;
}
export function libraryType(type: SolutionType): string {
  return SOLUTION_TYPE_META[type].lib;
}
export function argName(type: SolutionType): string {
  return SOLUTION_TYPE_META[type].arg;
}

export function isSingle(type: SolutionType): boolean {
  return type === "HIDDEN_SINGLE" || type === "NAKED_SINGLE" || type === "FULL_HOUSE";
}

const SSTS_EXTRA = new Set<SolutionType>([
  "HIDDEN_PAIR",
  "HIDDEN_TRIPLE",
  "HIDDEN_QUADRUPLE",
  "NAKED_PAIR",
  "NAKED_TRIPLE",
  "NAKED_QUADRUPLE",
  "LOCKED_PAIR",
  "LOCKED_TRIPLE",
  "LOCKED_CANDIDATES",
  "LOCKED_CANDIDATES_1",
  "LOCKED_CANDIDATES_2",
  "X_WING",
  "SWORDFISH",
  "JELLYFISH",
  "XY_WING",
  "SIMPLE_COLORS",
  "MULTI_COLORS",
]);

export function isSSTS(type: SolutionType): boolean {
  return isSingle(type) || SSTS_EXTRA.has(type);
}

export function isHiddenSubset(type: SolutionType): boolean {
  return (
    isSingle(type) ||
    type === "HIDDEN_PAIR" ||
    type === "HIDDEN_TRIPLE" ||
    type === "HIDDEN_QUADRUPLE"
  );
}

/** Fish degree: X-Wing=2 … Leviathan=7 (and all finned/franken/mutant variants). */
export function getFishSize(type: SolutionType): number {
  if (type.endsWith("X_WING") && type !== "XY_WING" && type !== "XYZ_WING" && type !== "W_WING")
    return 2;
  if (type.endsWith("SWORDFISH")) return 3;
  if (type.endsWith("JELLYFISH")) return 4;
  if (type.endsWith("SQUIRMBAG")) return 5;
  if (type.endsWith("WHALE")) return 6;
  return 7;
}

const SASHIMI = new Set<SolutionType>([
  "SASHIMI_X_WING",
  "SASHIMI_SWORDFISH",
  "SASHIMI_JELLYFISH",
  "SASHIMI_SQUIRMBAG",
  "SASHIMI_WHALE",
  "SASHIMI_LEVIATHAN",
]);
export function isSashimiFish(type: SolutionType): boolean {
  return SASHIMI.has(type);
}

export function isKrakenFish(type: SolutionType): boolean {
  return type === "KRAKEN_FISH" || type === "KRAKEN_FISH_TYPE_1" || type === "KRAKEN_FISH_TYPE_2";
}

const SIMPLE_CHAIN_OR_LOOP = new Set<SolutionType>([
  "NICE_LOOP",
  "DISCONTINUOUS_NICE_LOOP",
  "CONTINUOUS_NICE_LOOP",
  "GROUPED_NICE_LOOP",
  "GROUPED_DISCONTINUOUS_NICE_LOOP",
  "GROUPED_CONTINUOUS_NICE_LOOP",
  "X_CHAIN",
  "XY_CHAIN",
  "REMOTE_PAIR",
  "AIC",
  "GROUPED_AIC",
]);
export function isSimpleChainOrLoop(type: SolutionType): boolean {
  return SIMPLE_CHAIN_OR_LOOP.has(type);
}

const USE_CAND_TO_DEL_IN_LIBRARY = new Set<SolutionType>([
  "NICE_LOOP",
  "CONTINUOUS_NICE_LOOP",
  "DISCONTINUOUS_NICE_LOOP",
  "GROUPED_NICE_LOOP",
  "GROUPED_CONTINUOUS_NICE_LOOP",
  "GROUPED_DISCONTINUOUS_NICE_LOOP",
  "AIC",
  "GROUPED_AIC",
  "FORCING_CHAIN_CONTRADICTION",
  "FORCING_NET_CONTRADICTION",
  "ALS_XZ",
  "ALS_XY_WING",
  "ALS_XY_CHAIN",
  "DEATH_BLOSSOM",
  "SUE_DE_COQ",
]);
export function useCandToDelInLibraryFormat(type: SolutionType): boolean {
  return USE_CAND_TO_DEL_IN_LIBRARY.has(type);
}

export function getTypeFromArgName(arg: string): SolutionType | null {
  for (const t of SOLUTION_TYPES) {
    if (SOLUTION_TYPE_META[t].arg.toLowerCase() === arg.toLowerCase()) return t;
  }
  return null;
}

export function getTypeFromLibraryType(lib: string): SolutionType | null {
  const find = (s: string): SolutionType | null => {
    for (const t of SOLUTION_TYPES) {
      if (SOLUTION_TYPE_META[t].lib.toLowerCase() === s.toLowerCase()) return t;
    }
    return null;
  };
  let ret = find(lib);
  // Siamese fish: a trailing '1' may be appended.
  if (ret === null && lib.endsWith("1")) ret = find(lib.slice(0, -1));
  return ret;
}
