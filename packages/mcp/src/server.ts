import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeBarcode } from "./tools/encode.js";
import { encodeQrTerminal } from "./tools/asciiQr.js";
import { decodeBarcode, decodeBatch } from "./tools/decode.js";
import { decodePdf } from "./tools/decodePdf.js";
import { listSymbologies } from "./tools/symbologies.js";
import { listSymbologyOptions } from "./tools/symbologyOptions.js";
import { verifyBarcode } from "./tools/verify.js";
import { parseGs1 } from "./tools/gs1.js";

/** Shared input shape for the bwip-js encode path (encode_barcode + verify). */
const encodeInputSchema = {
  bcid: z.string().describe('Symbology id, e.g. "qrcode", "code128", "pdf417".'),
  text: z.string().describe("Data to encode."),
  scale: z.number().optional(),
  height: z.number().optional(),
  width: z.number().optional(),
  rotate: z.enum(["N", "R", "L", "I"]).optional(),
  includetext: z.boolean().optional(),
  textsize: z.number().optional(),
  backgroundcolor: z.string().optional(),
  barcolor: z.string().optional(),
  padding: z.number().optional(),
  options: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Freeform symbology-specific options, forwarded to bwip-js."),
};

export const SERVER_NAME = "barcoding-mcp";
export const SERVER_VERSION = "0.0.1";

/**
 * Build a fully-wired MCP server. Transport-agnostic: the entry point decides
 * stdio vs streamable HTTP. Called once for stdio, and per-request in the
 * stateless HTTP path.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // --- encode_barcode: bwip-js, 100+ symbologies ---------------------------
  server.registerTool(
    "encode_barcode",
    {
      title: "Encode barcode",
      description:
        "Render a barcode (100+ symbologies via bwip-js). Provide bcid + text, " +
        "typed common options, and an optional freeform `options` bag for " +
        "symbology-specific keys. Returns a PNG image.",
      inputSchema: encodeInputSchema,
    },
    async (args) => {
      const png = await encodeBarcode(args);
      return {
        content: [
          { type: "image", data: png.toString("base64"), mimeType: "image/png" },
        ],
      };
    },
  );

  // --- encode_qr_terminal: ASCII/Unicode-block QR --------------------------
  server.registerTool(
    "encode_qr_terminal",
    {
      title: "Encode QR to terminal",
      description:
        "Encode data to a block-character QR for direct display. Pure text " +
        "output — no image channel required. QR only. Use style 'unicode' " +
        "(default) for codeblocks/chat/logs, or 'ansi' for a live terminal.",
      inputSchema: {
        data: z.string().describe("Data to encode into the QR."),
        style: z
          .enum(["unicode", "ansi"])
          .optional()
          .describe(
            "'unicode' (default): plain blocks, safe in codeblocks/transcripts. " +
              "'ansi': coloured blocks, sharp in a TTY but garbles elsewhere.",
          ),
        small: z.boolean().optional().describe("Half-height blocks (default true)."),
        errorCorrectionLevel: z.enum(["L", "M", "Q", "H"]).optional(),
      },
    },
    async (args) => {
      const art = await encodeQrTerminal(args);
      return { content: [{ type: "text", text: art }] };
    },
  );

  // --- decode_barcode: zxing-wasm, common 1D/2D ----------------------------
  server.registerTool(
    "decode_barcode",
    {
      title: "Decode barcode",
      description:
        "Detect and decode all common 1D/2D barcodes in an image (via " +
        "zxing-wasm). Provide exactly one of base64, path, or url.",
      inputSchema: {
        base64: z.string().optional().describe("Base64-encoded image bytes."),
        path: z.string().optional().describe("Local filesystem path to an image."),
        url: z.string().optional().describe("URL to fetch an image from."),
        maxSymbols: z.number().optional(),
      },
    },
    async (args) => {
      const results = await decodeBarcode(args);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // --- decode_batch: many images in one call -------------------------------
  server.registerTool(
    "decode_batch",
    {
      title: "Decode a batch of images",
      description:
        "Decode many images in one call. Each item takes base64/path/url (like " +
        "decode_barcode) plus an optional label; results come back per item " +
        "with all detected barcodes. Per-item errors are isolated, not fatal.",
      inputSchema: {
        items: z
          .array(
            z.object({
              base64: z.string().optional(),
              path: z.string().optional(),
              url: z.string().optional(),
              label: z.string().optional().describe("Echoed back (e.g. a filename)."),
              maxSymbols: z.number().optional(),
            }),
          )
          .describe("Images to decode; each needs one of base64, path, or url."),
      },
    },
    async ({ items }) => ({
      content: [
        { type: "text", text: JSON.stringify(await decodeBatch(items), null, 2) },
      ],
    }),
  );

  // --- decode_pdf: rasterize PDF pages and pull every barcode --------------
  server.registerTool(
    "decode_pdf",
    {
      title: "Decode barcodes from a PDF",
      description:
        "Rasterize each page of a PDF (via mupdf, pure WASM) and decode every " +
        "1D/2D barcode on it, tagged with its page number. Provide one of " +
        "base64/path/url. dpi defaults to 300 (raise for dense/tiny codes).",
      inputSchema: {
        base64: z.string().optional().describe("Base64-encoded PDF bytes."),
        path: z.string().optional().describe("Local filesystem path to a PDF."),
        url: z.string().optional().describe("URL to fetch a PDF from."),
        dpi: z.number().optional().describe("Render resolution (default 300)."),
        maxSymbolsPerPage: z.number().optional(),
      },
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await decodePdf(args), null, 2) },
      ],
    }),
  );

  // --- list_symbologies: capability table ----------------------------------
  server.registerTool(
    "list_symbologies",
    {
      title: "List symbologies",
      description:
        "List every supported symbology (the full bwip-js/BWIPP encoder set), each " +
        "flagged support: encode | decode | both, with a valid `sample` input you can " +
        "pass straight to encode_barcode. Makes the encode-wide / decode-narrow " +
        "asymmetry legible before you encode.",
      inputSchema: {},
    },
    async () => ({
      content: [
        { type: "text", text: JSON.stringify(listSymbologies(), null, 2) },
      ],
    }),
  );

  // --- list_symbology_options: discovery for the encode option surface -----
  server.registerTool(
    "list_symbology_options",
    {
      title: "List symbology options",
      description:
        "Given a bcid, return the valid encode options segmented into: " +
        "`specific` (unique to this symbology, e.g. QR eclevel/version/mask), " +
        "`common` (layout/render options honored by all), and `sizing` " +
        "(advanced physical sizing). Call before encode_barcode to discover " +
        "which keys the freeform `options` bag accepts. Catalog generated from " +
        "bwip-js's own sources.",
      inputSchema: {
        bcid: z.string().describe('Symbology id, e.g. "qrcode", "pdf417".'),
      },
    },
    async ({ bcid }) => {
      const result = await listSymbologyOptions(bcid);
      if (!result) {
        return {
          content: [
            { type: "text", text: `Unknown bcid: ${bcid}. Use list_symbologies.` },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- verify_barcode: encode -> decode its own render -> assert round-trip -
  server.registerTool(
    "verify_barcode",
    {
      title: "Verify barcode",
      description:
        "Encode a barcode and decode its own render to prove the payload " +
        "round-trips (i.e. it actually scans). Takes the same input as " +
        "encode_barcode. Only meaningful where the symbology is in the decode " +
        "set — encode-only symbologies can render fine yet never round-trip.",
      inputSchema: encodeInputSchema,
    },
    async (args) => {
      const result = await verifyBarcode(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.roundTrips,
      };
    },
  );

  // --- gs1_parse: decoded GS1 string -> structured Application Identifiers --
  server.registerTool(
    "gs1_parse",
    {
      title: "Parse GS1 element string",
      description:
        "Parse a GS1 element string (from decode_barcode on a GS1-128, GS1 " +
        "DataMatrix, GS1 QR, or GS1 DataBar) into structured Application " +
        "Identifiers — GTIN (01), dates (11/15/17), batch (10), serial (21), " +
        "weights/measures (31xx), and more. Accepts both the bracketed HRI " +
        "form '(01)...(17)...' and the raw FNC1/GS-separated form.",
      inputSchema: {
        data: z
          .string()
          .describe("The GS1 element string, e.g. decode_barcode's text output."),
      },
    },
    async ({ data }) => ({
      content: [{ type: "text", text: JSON.stringify(parseGs1(data), null, 2) }],
    }),
  );

  return server;
}
