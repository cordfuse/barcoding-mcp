/**
 * Curated capability table. The encode column is a small sample of bwip-js's
 * 100+ symbologies; the decode column reflects the zxing-wasm reader set. The
 * asymmetry is intentional and load-bearing — see EXECUTION_PLAN.md.
 *
 * TODO(Phase 1): generate the full encode list from bwip-js metadata rather
 * than hand-maintaining it here.
 */
export interface SymbologyInfo {
  bcid: string;
  name: string;
  encode: boolean;
  decode: boolean;
}

export const SYMBOLOGIES: SymbologyInfo[] = [
  { bcid: "qrcode", name: "QR Code", encode: true, decode: true },
  { bcid: "microqrcode", name: "Micro QR Code", encode: true, decode: true },
  { bcid: "datamatrix", name: "Data Matrix", encode: true, decode: true },
  { bcid: "azteccode", name: "Aztec Code", encode: true, decode: true },
  { bcid: "pdf417", name: "PDF417", encode: true, decode: true },
  { bcid: "code128", name: "Code 128", encode: true, decode: true },
  { bcid: "code39", name: "Code 39", encode: true, decode: true },
  { bcid: "code93", name: "Code 93", encode: true, decode: true },
  { bcid: "ean13", name: "EAN-13", encode: true, decode: true },
  { bcid: "ean8", name: "EAN-8", encode: true, decode: true },
  { bcid: "upca", name: "UPC-A", encode: true, decode: true },
  { bcid: "upce", name: "UPC-E", encode: true, decode: true },
  { bcid: "interleaved2of5", name: "ITF", encode: true, decode: true },
  { bcid: "codabar", name: "Codabar", encode: true, decode: true },
  { bcid: "databarexpanded", name: "GS1 DataBar Expanded", encode: true, decode: true },
  { bcid: "maxicode", name: "MaxiCode", encode: true, decode: true },
  // encode-only long tail (sample) — bwip-js writes these, zxing can't read them
  { bcid: "gs1-128", name: "GS1-128", encode: true, decode: false },
  { bcid: "royalmail", name: "Royal Mail 4-State", encode: true, decode: false },
  { bcid: "auspost", name: "Australia Post 4-State", encode: true, decode: false },
  { bcid: "onecode", name: "USPS Intelligent Mail", encode: true, decode: false },
  { bcid: "pharmacode", name: "Pharmacode", encode: true, decode: false },
];

export function listSymbologies(): SymbologyInfo[] {
  return SYMBOLOGIES;
}
