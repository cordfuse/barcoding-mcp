// Runs against the built dist (CI builds first; locally run `npm run build`).
import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeBarcode } from "../dist/tools/encode.js";
import { decodeBarcode } from "../dist/tools/decode.js";
import { encodeQrTerminal } from "../dist/tools/asciiQr.js";
import { verifyBarcode } from "../dist/tools/verify.js";
import { listSymbologyOptions, allBcids } from "../dist/tools/symbologyOptions.js";

const hasAnsi = (s) => /\x1b\[/.test(s);

test("encode -> decode round-trips across symbologies", async () => {
  for (const [bcid, text] of [
    ["qrcode", "ROUNDTRIP-QR"],
    ["datamatrix", "ROUNDTRIP-DM"],
    ["pdf417", "ROUNDTRIP-PDF"],
    ["code128", "ROUNDTRIP-128"],
    ["ean13", "5901234123457"],
  ]) {
    const png = await encodeBarcode({ bcid, text, padding: 4 });
    const decoded = await decodeBarcode({ base64: png.toString("base64") });
    assert.ok(
      decoded.some((d) => d.text === text),
      `${bcid} did not round-trip`,
    );
  }
});

test("terminal QR: unicode has no ANSI, ansi does, default is unicode", async () => {
  const uni = await encodeQrTerminal({ data: "x", style: "unicode" });
  const ansi = await encodeQrTerminal({ data: "x", style: "ansi" });
  const def = await encodeQrTerminal({ data: "x" });
  assert.equal(hasAnsi(uni), false);
  assert.equal(hasAnsi(ansi), true);
  assert.equal(hasAnsi(def), false);
  assert.ok(uni.includes("█"));
});

test("verify_barcode reports round-trip for decodable symbologies", async () => {
  const v = await verifyBarcode({ bcid: "pdf417", text: "VERIFY", options: { columns: 6 } });
  assert.equal(v.roundTrips, true);
});

test("verify_barcode flags encode-only symbologies honestly", async () => {
  const v = await verifyBarcode({ bcid: "royalmail", text: "LE28HS9Z" });
  assert.equal(v.roundTrips, false);
  assert.match(v.note ?? "", /encode-only/);
});

test("option catalog: 111 bcids, pdf417 exposes its specific options", async () => {
  const ids = await allBcids();
  assert.equal(ids.length, 111);
  const opt = await listSymbologyOptions("pdf417");
  assert.equal(opt.specific.length, 8);
  assert.ok(opt.specific.some((o) => o.name === "columns"));
  assert.equal(await listSymbologyOptions("not-a-real-bcid"), null);
});
