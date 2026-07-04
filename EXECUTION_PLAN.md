# barcoding-mcp — Execution Plan

> An MCP server that **encodes 100+ barcode symbologies** and **decodes all the
> common 1D/2D formats**, with **zero native dependencies**. Node runtime,
> serves over both **stdio** and **streamable HTTP**.

Status: planning · Created 2026-07-04 · Home: `cordfuse/barcoding-mcp` (private → public when ready)

---

## 1. Thesis

The MCP ecosystem has QR-only servers, mostly Python, none covering the full
symbology matrix in both directions. That is genuine OSS whitespace.

The value framing is not "barcodes" — it's that a barcode is a **lossless,
error-corrected serialization that survives a visual or physical channel an
agent can't otherwise cross cleanly**. Encode + decode as first-class tools turn
the server into a *transport*, not just a utility.

**Honest scope — the funnel is asymmetric:**

| Direction | Library | Coverage |
|-----------|---------|----------|
| Encode | `bwip-js` (BWIPP port) | **100+** symbologies — widest in the JS ecosystem |
| Decode | `zxing-wasm` (ZXing-C++ → WASM) | **~20-30** common 1D/2D formats |

We **do not** claim "decode anything." The contract is: *encode 100+, decode all
the common ones, round-trip-verified where both overlap.* Overclaiming decode is
the fastest way to erode agent trust (hand it an Australia Post barcode, it
fails). The tool descriptions must state this precisely.

## 1a. Repository layout (monorepo)

```
barcoding-mcp/               repo root — private npm workspace, no publish
  packages/
    mcp/                     @cordfuse/barcoding-mcp (src/, scripts/, dist/)
  docker/                    Dockerfile + compose for the --http server
  package.json               workspaces: ["packages/*"]
```

`node_modules` hoists to the root; the `import.meta.resolve` lookups (bwip-js,
zxing wasm) and the option-catalog data dir are hoist-safe. Docker builds from
the repo root and serves `node packages/mcp/dist/index.js --http` (stdio is
per-invocation, not containerised).

## 2. Stack

- **Runtime:** Node (LTS). No Bun — decode WASM + broad tooling, node-native is
  the point. No native addons (the DOA-native-addon failure class is exactly
  what we're avoiding).
- **Encode:** [`bwip-js`](https://github.com/metafloor/bwip-js) — pure JS, MIT,
  full BWIPP symbology set, options are name-value pairs.
- **Decode:** [`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) — WASM, MIT,
  ES/CJS + types, runs on Node. Full common 1D + 2D (QR, Micro QR, DataMatrix,
  Aztec, PDF417, MaxiCode, Code128/39/93, EAN/UPC, ITF, Codabar, DataBar).
- **Terminal QR:** [`qrcode`](https://github.com/soldair/node-qrcode) — pure JS,
  MIT, types included. `toString(data, { type: 'terminal', small: true })`
  renders a QR from Unicode block characters — a **text** output that needs no
  image channel.
- **MCP SDK:** `@modelcontextprotocol/sdk` (TypeScript).
- **Language:** TypeScript, compiled with `tsc` (no experimental node flags).
- **Image I/O:** bwip-js renders PNG/SVG; decode accepts image bytes / base64 /
  file path / URL and feeds RGBA to zxing-wasm.

## 3. Transports — stdio + streamable HTTP

Both are first-class, selected at launch:

- **stdio** — default. `barcoding-mcp` (no args) → `StdioServerTransport`. For
  Claude Code / Cursor / local agent wiring.
- **streamable HTTP (shttp)** — `barcoding-mcp --http [--port N]` →
  `StreamableHTTPServerTransport` behind a minimal HTTP listener. For remote /
  metamcp-style wiring (same pattern as the nano-banana remote endpoint).

The server core (tool registration + handlers) is transport-agnostic; the entry
point picks the transport. One code path for tools, two for I/O.

## 4. Tools

| Tool | Purpose |
|------|---------|
| `encode_barcode` | Render a barcode. `bcid` + typed common options + freeform `options` bag. Returns image (base64 PNG and/or SVG). |
| `encode_qr_terminal` | Encode data to an **ASCII / Unicode-block QR** for direct terminal display. Text output, no image channel. QR-only. Options: `small`, `errorCorrectionLevel`, invert. |
| `decode_barcode` | Read barcodes from an image (bytes/base64/path/URL). Returns text + symbology + position for each detected code. |
| `list_symbologies` | List supported symbologies, flagged `encode` / `decode` / `both`. Makes the asymmetry legible to the agent. |
| `list_symbology_options` | Given a `bcid`, return valid encode option names + types + descriptions. **This is what makes the 100-symbology option surface actually drivable.** |
| `verify_barcode` | Encode → decode the render → assert the payload round-trips. Self-verifying label QA. Only valid where symbology is in the decode set. |

### 4.1 Schema design — the options problem

bwip-js takes a single options object of name-value pairs; hundreds of
symbology-specific keys (QR `eclevel`/`version`/`mask`, DataMatrix
`rows`/`columns`/`format`, Code128 `parse`/`parsefnc`, …). MCP supports this
fully via JSON Schema. Capability is not the question — **discoverability is.**

Shape = **hybrid**, not pure-freeform:

1. **Typed top-level params** for the universal options every symbology honors:
   `scale`, `height`, `width`, `rotate`, `includetext`, `textsize`,
   `backgroundcolor`, `barcolor`, `padding`. Model gets these with descriptions.
2. **Freeform `options` object** —
   `additionalProperties: { type: ["string","number","boolean"] }` — forwarded
   verbatim to bwip-js. The 100-symbology long tail, nothing walled off.
3. **`list_symbology_options` discovery tool** — turns "technically supports
   every option" into "an agent can actually drive every option." Without it the
   long tail is dead weight.

**RESOLVED — catalog generated from bwip-js's own sources (no passthrough, no
web scraping).** `scripts/gen-options.mjs` mines two shipped files:
- **Tier A (common, 53 opts):** parsed from `dist/bwip-js-gen.d.ts`
  (`BwippOptions` + `RenderOptions`) — the render/layout options honored by all.
- **Tier B (symbology-specific, 415 opts across 92/111 symbologies):** parsed
  from `barcode.ps`, whose BWIPP option-default preamble (`/name default def`
  with inline `%` descriptions) is regular and machine-readable.
- **Sizing (10 opts):** BWIPP's Advanced Sizing Technology family, templated
  into every symbology, hoisted into one shared group instead of repeating 92x.

Output committed to `src/data/symbology-options.json`, copied into `dist` at
build, served by `list_symbology_options`. Regenerate on bwip-js bump with
`npm run gen:options`. Confirms the schema thesis: symbology-specific options are
**not** typed by bwip-js, so the freeform `options` bag is the only channel.

## 5. Phases

### Phase 0 — Decode spike (proves the project exists)
- Prove `zxing-wasm` decodes **DataMatrix + PDF417 + a linear code** from real
  photos in Node, pure WASM, no native deps. If decode is weak or falls back to
  native, the whole thesis is at risk — do this first.
- Confirm bwip-js encode → zxing-wasm decode round-trips for the overlap set.
- Nail down the symbology-name mapping between the two libs (they don't name
  formats identically).

### Phase 1 — Core encode/decode over stdio
- MCP server skeleton, `StdioServerTransport`.
- `encode_barcode` (bwip-js, hybrid schema) + `decode_barcode` (zxing-wasm).
- `list_symbologies` with encode/decode/both flags.

### Phase 2 — streamable HTTP transport [DONE]
- `--http [--port N]`, `StreamableHTTPServerTransport`, **stateful sessions**
  (initialize mints a `mcp-session-id`; later requests route back to the same
  server+transport; evict on close).
- Verified with a real `StreamableHTTPClient`: initialize -> tools/list ->
  encode_qr_terminal + list_symbology_options + encode_barcode -> clean close.

### Phase 3 — Option discoverability [DONE]
- ~~Build/ship the BWIPP option catalog.~~ `scripts/gen-options.mjs` →
  `src/data/symbology-options.json` (53 common, 10 sizing, 415 specific).
- ~~`list_symbology_options(bcid)`.~~ Shipped, segments specific/common/sizing.

### Phase 4 — Self-verify + polish
- ~~`verify_barcode` round-trip (overlap set only).~~ Shipped: encode -> decode
  own render -> assert. Decodable symbologies round-trip; encode-only ones
  report `roundTrips:false` with an honest "expected, outside decode set" note.
- ~~README with the honest funnel table, examples, both transport setups.~~
  Done: root README + `packages/mcp/README.md` (npm-facing).
- ~~CI: build + test on Node LTS.~~ Done: `.github/workflows/ci.yml` (typecheck
  + build + `node:test` smoke suite on Node 20 & 22). Test suite added.

### Phase 5 — Publish [WORKFLOWS READY]
- `.github/workflows/release.yml` — a `v*` tag publishes npm
  (`@cordfuse/barcoding-mcp`) + GHCR (`ghcr.io/cordfuse/barcoding-mcp`).
- **Blocked on:** add this repo to the org `NPM_TOKEN` selected-repo allow-list
  (GHCR needs no secret — built-in `GITHUB_TOKEN`). Then bump version, tag, push.
- Remaining: flip repo public. Register the `--http` endpoint in metamcp.

## 6. Non-goals

- No Python anywhere (encode and decode are both pure JS/WASM).
- No native addons / node-gyp.
- No "decode anything" claim — decode is the common set only.
- No per-symbology hand-written schemas for all 100 (freeform bag + discovery
  tool instead).

## 7. Open decisions

1. `list_symbology_options` — passthrough vs generated BWIPP catalog (resolve in
   Phase 0/3).
2. Decode input: which forms to accept (bytes / base64 / path / URL — likely all).
3. Whether `verify_barcode` ships in v1 or is deferred.
4. Package scope confirmed `@cordfuse/barcoding-mcp` at publish time.

---

*Encode via bwip-js. Decode via zxing-wasm. Node. stdio + streamable HTTP.*
