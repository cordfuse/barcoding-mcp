import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareZXingModule,
  readBarcodesFromImageFile,
  readBarcodesFromImageData,
} from "zxing-wasm/reader";

export interface DecodeBarcodeArgs {
  /** Base64-encoded image bytes (PNG/JPEG/etc.). */
  base64?: string;
  /** Local filesystem path to an image. */
  path?: string;
  /** URL to fetch an image from. */
  url?: string;
  /** Max number of symbols to detect. Default 16. */
  maxSymbols?: number;
}

export interface DecodedBarcode {
  text: string;
  format: string;
  valid: boolean;
}

/**
 * Lazily instantiate the zxing-wasm reader module once. Node's global fetch
 * cannot load the packaged `file://` .wasm, so we hand Emscripten the bytes
 * directly via the `wasmBinary` override. Without this the reader silently
 * returns no results.
 */
let moduleReady: Promise<unknown> | null = null;
function ensureModule(): Promise<unknown> {
  if (!moduleReady) {
    const readerEntry = fileURLToPath(import.meta.resolve("zxing-wasm/reader"));
    const wasmPath = join(dirname(readerEntry), "../../reader/zxing_reader.wasm");
    moduleReady = readFile(wasmPath).then((buf) =>
      prepareZXingModule({
        overrides: {
          wasmBinary: buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength,
          ) as ArrayBuffer,
        },
        fireImmediately: true,
      }),
    );
  }
  return moduleReady;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

async function loadBytes(args: DecodeBarcodeArgs): Promise<ArrayBuffer> {
  if (args.base64) return toArrayBuffer(Buffer.from(args.base64, "base64"));
  if (args.path) return toArrayBuffer(await readFile(args.path));
  if (args.url) {
    const res = await fetch(args.url);
    if (!res.ok) throw new Error(`fetch ${args.url} → ${res.status}`);
    return res.arrayBuffer();
  }
  throw new Error("decode_barcode requires one of: base64, path, url");
}

/** Decode all detectable 1D/2D barcodes from an image via zxing-wasm. */
export async function decodeBarcode(
  args: DecodeBarcodeArgs,
): Promise<DecodedBarcode[]> {
  await ensureModule();
  const buffer = await loadBytes(args);
  const blob = new Blob([buffer]);
  const results = await readBarcodesFromImageFile(blob, {
    tryHarder: true,
    maxNumberOfSymbols: args.maxSymbols ?? 16,
  });
  return results.map((r) => ({
    text: r.text,
    format: r.format,
    valid: r.isValid,
  }));
}

/** Decode raw RGBA pixels (e.g. a rasterized PDF page) via zxing-wasm. */
export async function decodeImageData(
  image: { data: Uint8ClampedArray; width: number; height: number },
  maxSymbols = 16,
): Promise<DecodedBarcode[]> {
  await ensureModule();
  // zxing's runtime is duck-typed; its TS type is the DOM ImageData (wants
  // colorSpace). Cast to satisfy the compiler — the extra field is ignored.
  const results = await readBarcodesFromImageData(image as unknown as ImageData, {
    tryHarder: true,
    maxNumberOfSymbols: maxSymbols,
  });
  return results.map((r) => ({ text: r.text, format: r.format, valid: r.isValid }));
}

export interface BatchItem extends DecodeBarcodeArgs {
  /** Optional caller label echoed back in the result (e.g. a filename). */
  label?: string;
}

export interface BatchResult {
  index: number;
  label?: string;
  barcodes?: DecodedBarcode[];
  error?: string;
}

/** Decode many images in one call; per-item errors are isolated, not fatal. */
export async function decodeBatch(items: BatchItem[]): Promise<BatchResult[]> {
  return Promise.all(
    items.map(async (item, index): Promise<BatchResult> => {
      const base: BatchResult = { index, label: item.label };
      try {
        return { ...base, barcodes: await decodeBarcode(item) };
      } catch (e) {
        return { ...base, error: String(e instanceof Error ? e.message : e) };
      }
    }),
  );
}
