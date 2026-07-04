import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface OptionSpec {
  name: string;
  type: "boolean" | "number" | "string" | "enum";
  values?: string[];
  default?: string | number | boolean;
  description?: string;
}

interface Catalog {
  generatedFrom: { bwipjs: string };
  bcids: string[];
  commonOptions: OptionSpec[];
  sizingOptions: OptionSpec[];
  symbologyOptions: Record<string, OptionSpec[]>;
}

let cache: Catalog | null = null;
async function loadCatalog(): Promise<Catalog> {
  if (!cache) {
    const p = fileURLToPath(new URL("../data/symbology-options.json", import.meta.url));
    cache = JSON.parse(await readFile(p, "utf8")) as Catalog;
  }
  return cache;
}

export interface SymbologyOptionsResult {
  bcid: string;
  /** Options unique to this symbology (e.g. QR: eclevel, version, mask). */
  specific: OptionSpec[];
  /** Layout/render options honored by every symbology. */
  common: OptionSpec[];
  /** Advanced physical-sizing options (BWIPP AST), honored broadly. */
  sizing: OptionSpec[];
  source: { bwipjs: string };
}

/** Return the valid encode options for a symbology, segmented by tier. */
export async function listSymbologyOptions(
  bcid: string,
): Promise<SymbologyOptionsResult | null> {
  const c = await loadCatalog();
  if (!c.bcids.includes(bcid)) return null;
  return {
    bcid,
    specific: c.symbologyOptions[bcid] ?? [],
    common: c.commonOptions,
    sizing: c.sizingOptions,
    source: c.generatedFrom,
  };
}

/** All bwip-js symbology ids (bcids). */
export async function allBcids(): Promise<string[]> {
  return (await loadCatalog()).bcids;
}
