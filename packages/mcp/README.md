# @cordfuse/barcoding-mcp

An MCP server that **encodes 100+ barcode symbologies** (via `bwip-js`) and
**decodes the common 1D/2D formats** (via `zxing-wasm`), with **zero native
dependencies**. Node runtime, served over both **stdio** and **streamable HTTP**,
plus an ASCII/Unicode **terminal QR** for output that needs no image channel.

> Encode 100+, decode the common set, round-trip-verified where both overlap.
> Not "decode anything" — decode is the common 1D/2D set only.

## Install

```bash
npx @cordfuse/barcoding-mcp          # stdio (default)
npx @cordfuse/barcoding-mcp --http   # streamable HTTP on :3900 (PORT env to change)
```

MCP client config (stdio):

```json
{
  "mcpServers": {
    "barcoding": { "command": "npx", "args": ["-y", "@cordfuse/barcoding-mcp"] }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `encode_barcode` | Render a barcode: `bcid` + `text` + typed common options + freeform `options` bag. Returns a PNG. |
| `encode_qr_terminal` | Block-character QR. `style: unicode` (default; safe in codeblocks/logs) or `ansi` (live TTY). |
| `decode_barcode` | Decode 1D/2D barcodes from an image — `base64` / `path` / `url`, PNG or JPEG. |
| `decode_batch` | Decode many images in one call; per-item results, isolated errors. |
| `decode_pdf` | Rasterize a PDF (mupdf WASM) and pull every barcode, tagged with page number. |
| `gs1_parse` | Parse a decoded GS1 string into structured Application Identifiers. |
| `verify_barcode` | Encode → decode the render → assert the payload round-trips. |
| `list_symbologies` | All 111 symbologies (full BWIPP encoder set), each flagged `support: encode / decode / both` with a valid `sample` input. |
| `list_symbology_options` | Valid encode options for a bcid (`specific` / `common` / `sizing`). Call before `encode_barcode` to discover the `options` bag's keys. |

## Options model

Every symbology honors ~50 common render options (typed). Symbology-specific
options (QR `eclevel`/`version`/`mask`, PDF417 `columns`/`rows`, DataMatrix
`format`/`version`, …) are **not** typed by bwip-js, so they pass through the
freeform `options` bag — discover the valid keys per symbology with
`list_symbology_options`.

## Transports

- **stdio** (default) — for Claude Code, Cursor, and local agent wiring.
- **streamable HTTP** (`--http`, `PORT` env or `--port`) — stateful sessions,
  liveness at `GET /health`. A prebuilt image is published to
  `ghcr.io/cordfuse/barcoding-mcp`.

Source, Docker deployment, and contribution docs:
https://github.com/cordfuse/barcoding-mcp

## License

MIT
