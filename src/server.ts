import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeBarcode } from "./tools/encode.js";
import { encodeQrTerminal } from "./tools/asciiQr.js";
import { decodeBarcode } from "./tools/decode.js";
import { listSymbologies } from "./tools/symbologies.js";
import { listSymbologyOptions } from "./tools/symbologyOptions.js";

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
      inputSchema: {
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
      },
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

  // --- list_symbologies: capability table ----------------------------------
  server.registerTool(
    "list_symbologies",
    {
      title: "List symbologies",
      description:
        "List supported symbologies flagged encode / decode / both. Makes the " +
        "encode-wide / decode-narrow asymmetry legible before you encode.",
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

  return server;
}
