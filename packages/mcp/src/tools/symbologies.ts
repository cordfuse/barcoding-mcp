/**
 * Symbology capability table, derived at load from bwip-js's own `symbolList`
 * (the authoritative BWIPP encoder set) rather than hand-maintained. Every
 * entry carries a `support` member describing whether this server can encode,
 * decode, or do both — the encode set is all of bwip-js; the decode set is the
 * zxing-wasm reader set. The asymmetry is intentional — see EXECUTION_PLAN.md.
 */
import bwipjs from "bwip-js";

export type SymbologySupport = "encode" | "decode" | "both";

export interface SymbologyInfo {
  bcid: string;
  name: string;
  /** What this server can do with the symbology: encode, decode, or both. */
  support: SymbologySupport;
  encode: boolean;
  decode: boolean;
  /** A valid sample input for the symbology (BWIPP metadata) — feed it to encode_barcode. */
  sample: string;
}

/** zxing-wasm reader set — the symbologies `decode_barcode` can READ. */
const DECODABLE = new Set<string>([
  "qrcode",
  "microqrcode",
  "datamatrix",
  "azteccode",
  "pdf417",
  "code128",
  "code39",
  "code93",
  "ean13",
  "ean8",
  "upca",
  "upce",
  "interleaved2of5",
  "rationalizedCodabar",
  "databarexpanded",
  "maxicode",
]);

interface BwipSymbol {
  bcid: string;
  desc: string;
  text: string;
  opts: string;
}

function supportOf(encode: boolean, decode: boolean): SymbologySupport {
  return encode && decode ? "both" : decode ? "decode" : "encode";
}

function buildTable(): SymbologyInfo[] {
  const symbolList = (bwipjs as unknown as { symbolList: BwipSymbol[] }).symbolList;
  const table: SymbologyInfo[] = symbolList.map((s) => {
    const decode = DECODABLE.has(s.bcid);
    return { bcid: s.bcid, name: s.desc, support: supportOf(true, decode), encode: true, decode, sample: s.text };
  });
  // Include any decode-only symbology that isn't in the encoder list (none today,
  // but keeps the table honest if the reader set ever outgrows the writer set).
  for (const bcid of DECODABLE) {
    if (!table.some((e) => e.bcid === bcid)) {
      table.push({ bcid, name: bcid, support: "decode", encode: false, decode: true, sample: "" });
    }
  }
  return table;
}

export const SYMBOLOGIES: SymbologyInfo[] = buildTable();

export function listSymbologies(): SymbologyInfo[] {
  return SYMBOLOGIES;
}
