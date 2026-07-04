# barcoding-mcp

An MCP server that **encodes 100+ barcode symbologies** (via `bwip-js`) and
**decodes all the common 1D/2D formats** (via `zxing-wasm`), with **zero native
dependencies**. Node runtime, served over both **stdio** and **streamable HTTP**.

> The funnel is asymmetric on purpose: encode 100+, decode the common set,
> round-trip-verified where both overlap. We do not claim "decode anything."

Status: **planning**. See [EXECUTION_PLAN.md](EXECUTION_PLAN.md).
