import { readFile } from "node:fs/promises";
import * as mupdf from "mupdf";
import { decodeImageData, type DecodedBarcode } from "./decode.js";

export interface DecodePdfArgs {
  /** Base64-encoded PDF bytes. */
  base64?: string;
  /** Local filesystem path to a PDF. */
  path?: string;
  /** URL to fetch a PDF from. */
  url?: string;
  /** Render resolution. Higher = better for dense/linear codes. Default 300. */
  dpi?: number;
  /** Max symbols to detect per page. Default 16. */
  maxSymbolsPerPage?: number;
}

export interface PdfPageResult {
  page: number;
  barcodes: DecodedBarcode[];
}

export interface DecodePdfResult {
  pageCount: number;
  totalBarcodes: number;
  /** Only pages where at least one barcode was found. */
  results: PdfPageResult[];
}

async function loadPdfBytes(args: DecodePdfArgs): Promise<Uint8Array> {
  if (args.base64) return new Uint8Array(Buffer.from(args.base64, "base64"));
  if (args.path) return new Uint8Array(await readFile(args.path));
  if (args.url) {
    const res = await fetch(args.url);
    if (!res.ok) throw new Error(`fetch ${args.url} → ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("decode_pdf requires one of: base64, path, url");
}

/**
 * Rasterize each PDF page (mupdf, pure WASM) and decode every barcode on it,
 * tagged with its page number. Zero native deps.
 */
export async function decodePdf(args: DecodePdfArgs): Promise<DecodePdfResult> {
  const bytes = await loadPdfBytes(args);
  const dpi = args.dpi ?? 300;
  const scale = dpi / 72;

  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount = doc.countPages();
  const results: PdfPageResult[] = [];
  let totalBarcodes = 0;

  for (let i = 0; i < pageCount; i++) {
    const pix = doc
      .loadPage(i)
      .toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true);
    const barcodes = await decodeImageData(
      {
        data: new Uint8ClampedArray(pix.getPixels()),
        width: pix.getWidth(),
        height: pix.getHeight(),
      },
      args.maxSymbolsPerPage ?? 16,
    );
    pix.destroy();
    if (barcodes.length) {
      results.push({ page: i + 1, barcodes });
      totalBarcodes += barcodes.length;
    }
  }

  return { pageCount, totalBarcodes, results };
}
