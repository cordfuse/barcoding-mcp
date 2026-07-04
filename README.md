# barcoding-mcp

[![CI](https://github.com/cordfuse/barcoding-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/cordfuse/barcoding-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@cordfuse/barcoding-mcp)](https://www.npmjs.com/package/@cordfuse/barcoding-mcp)

An MCP server that **encodes 100+ barcode symbologies** (via `bwip-js`) and
**decodes all the common 1D/2D formats** (via `zxing-wasm`), with **zero native
dependencies**. Node runtime, served over both **stdio** and **streamable HTTP**.
Plus an ASCII/Unicode **terminal QR** for output that needs no image channel.

> The funnel is asymmetric on purpose: **encode 100+, decode the common set,**
> round-trip-verified where both overlap. We do not claim "decode anything."

| Direction | Library | Coverage |
|-----------|---------|----------|
| Encode | [`bwip-js`](https://github.com/metafloor/bwip-js) | **100+** symbologies (full BWIPP) |
| Decode | [`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) | **~20** common 1D/2D (QR, Micro QR, DataMatrix, Aztec, PDF417, MaxiCode, Code128/39/93, EAN/UPC, ITF, Codabar, DataBar) |
| Terminal QR | [`qrcode`](https://github.com/soldair/node-qrcode) | block-character QR, pure text |

## Tools

| Tool | Purpose |
|------|---------|
| `encode_barcode` | Render a barcode (bcid + text + typed common options + freeform `options` bag). Returns a PNG. |
| `encode_qr_terminal` | Encode data to a block-character QR. `style: unicode` (default, safe in codeblocks/logs) or `ansi` (live TTY). |
| `decode_barcode` | Detect + decode 1D/2D barcodes from an image (`base64` / `path` / `url`; PNG or JPEG). |
| `decode_batch` | Decode many images in one call; per-item results, isolated errors. |
| `decode_pdf` | Rasterize a PDF (mupdf WASM) and pull every barcode, tagged with page number. |
| `gs1_parse` | Parse a decoded GS1 string into structured Application Identifiers (GTIN, dates, batch, serial, weights…). |
| `verify_barcode` | Encode → decode the render → assert the payload round-trips. Self-verifying label QA. |
| `list_symbologies` | Supported symbologies flagged encode / decode / both. |
| `list_symbology_options` | Valid encode options for a bcid, segmented `specific` / `common` / `sizing`. Discover the `options` bag's keys before encoding. |

## Install & run

### npm (stdio — for Claude Code, Cursor, local agents)

```bash
npx @cordfuse/barcoding-mcp          # stdio transport (default)
npx @cordfuse/barcoding-mcp --http   # streamable HTTP on :3900
```

MCP client config (stdio):

```json
{
  "mcpServers": {
    "barcoding": { "command": "npx", "args": ["-y", "@cordfuse/barcoding-mcp"] }
  }
}
```

### Docker / GHCR (streamable HTTP — for remote / metamcp wiring)

```bash
docker run -p 3900:3900 ghcr.io/cordfuse/barcoding-mcp:latest
# or, from a checkout:
docker compose -f docker/compose.yaml up
```

Serves streamable HTTP at `http://<host>:3900/mcp`, with a liveness probe at
`/health`. Port is settable via the `PORT` env. stdio is per-invocation and not
containerised — the image is the HTTP endpoint.

## Repository layout (monorepo)

```
barcoding-mcp/
  packages/
    mcp/          @cordfuse/barcoding-mcp  (the server)  →  packages/mcp/README.md
  docker/         Dockerfile + compose.yaml (the --http server)
  .github/        CI + release workflows
```

npm workspace; `node_modules` hoists to the root.

## Development

```bash
npm ci                                     # install (root)
npm run build   -w @cordfuse/barcoding-mcp # tsc + copy option catalog into dist
npm test        -w @cordfuse/barcoding-mcp # node:test smoke suite
npm run gen:options -w @cordfuse/barcoding-mcp  # regenerate the option catalog from bwip-js
```

The `list_symbology_options` catalog is generated from bwip-js's own sources
(`dist/bwip-js-gen.d.ts` for common options, `barcode.ps` for the per-symbology
option preambles) into `packages/mcp/src/data/symbology-options.json`.

## CI / Release

- **CI** (`.github/workflows/ci.yml`) — typecheck + build + test on Node 20 & 22
  for every push and PR to `main`.
- **Release** (`.github/workflows/release.yml`) — pushing a `v*` tag publishes:
  - the npm package `@cordfuse/barcoding-mcp` (guards that the tag matches the
    package version), and
  - the Docker image `ghcr.io/cordfuse/barcoding-mcp:<version>` + `:latest`.

```bash
npm version patch -w @cordfuse/barcoding-mcp
git commit -am "release vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags
```

**Secrets:** npm publish needs the org `NPM_TOKEN` (this repo must be on the
org token's selected-repo allow-list). GHCR uses the built-in `GITHUB_TOKEN`
(`packages: write`) — no secret required.

## License

MIT
