import { encodeBarcode, type EncodeBarcodeArgs } from "./encode.js";
import { decodeBarcode } from "./decode.js";
import { SYMBOLOGIES } from "./symbologies.js";

export interface VerifyResult {
  bcid: string;
  text: string;
  /** True iff the rendered barcode decoded back to the exact input text. */
  roundTrips: boolean;
  decoded: { text: string; format: string; valid: boolean }[];
  note?: string;
}

/**
 * Self-verify: encode a barcode, decode its own render, and assert the payload
 * survives the round-trip. Only meaningful where the symbology is in the decode
 * set — encode-only symbologies can render fine yet never round-trip here.
 */
export async function verifyBarcode(
  args: EncodeBarcodeArgs,
): Promise<VerifyResult> {
  const png = await encodeBarcode(args);
  const decoded = await decodeBarcode({ base64: png.toString("base64") });
  const roundTrips = decoded.some((d) => d.text === args.text);

  let note: string | undefined;
  if (!roundTrips) {
    const cap = SYMBOLOGIES.find((s) => s.bcid === args.bcid);
    note =
      cap && !cap.decode
        ? `${args.bcid} is encode-only in this server's decode set (zxing-wasm ` +
          `cannot read it), so a round-trip failure is expected. The barcode may ` +
          `still be valid — confirm with a dedicated reader for this symbology.`
        : `Rendered but did not round-trip. Check options (quiet zone, scale) or ` +
          `the payload, or the symbology may be outside the decode set.`;
  }
  return { bcid: args.bcid, text: args.text, roundTrips, decoded, note };
}
