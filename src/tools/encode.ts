import bwipjs from "bwip-js";

/** Universal options honored across (nearly) all symbologies. */
export interface CommonEncodeOptions {
  scale?: number;
  height?: number;
  width?: number;
  rotate?: "N" | "R" | "L" | "I";
  includetext?: boolean;
  textsize?: number;
  backgroundcolor?: string;
  barcolor?: string;
  padding?: number;
}

export interface EncodeBarcodeArgs extends CommonEncodeOptions {
  /** bwip-js / BWIPP symbology id, e.g. "qrcode", "code128", "datamatrix", "pdf417". */
  bcid: string;
  /** Data to encode. */
  text: string;
  /**
   * Long-tail, symbology-specific options as a freeform name-value bag,
   * forwarded verbatim to bwip-js (e.g. { eclevel: "H" } for QR,
   * { columns: 6 } for pdf417). Discover valid keys via list_symbology_options.
   */
  options?: Record<string, string | number | boolean>;
}

/** Render a barcode to a PNG buffer via bwip-js. */
export async function encodeBarcode(args: EncodeBarcodeArgs): Promise<Buffer> {
  const { bcid, text, options, ...common } = args;
  // Default to an opaque white background: bwip-js renders on a transparent
  // canvas otherwise, which decoders read as all-black and cannot scan.
  const opts: Record<string, unknown> = {
    bcid,
    text,
    backgroundcolor: "FFFFFF",
    ...(options ?? {}),
  };
  // Typed common options win on key collision, but never let `undefined`
  // clobber a default (spreading an unset optional would do exactly that).
  for (const [k, v] of Object.entries(common)) {
    if (v !== undefined) opts[k] = v;
  }
  return bwipjs.toBuffer(opts as unknown as Parameters<typeof bwipjs.toBuffer>[0]);
}
