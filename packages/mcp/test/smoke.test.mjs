// Runs against the built dist (CI builds first; locally run `npm run build`).
import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeBarcode } from "../dist/tools/encode.js";
import { decodeBarcode, decodeBatch } from "../dist/tools/decode.js";
import { encodeQrTerminal } from "../dist/tools/asciiQr.js";
import { verifyBarcode } from "../dist/tools/verify.js";
import { listSymbologyOptions, allBcids } from "../dist/tools/symbologyOptions.js";
import { parseGs1 } from "../dist/tools/gs1.js";
import { decodePdf } from "../dist/tools/decodePdf.js";
import { PDFDocument } from "pdf-lib";

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

test("decode_batch: multiple images, per-item error isolation", async () => {
  const a = (await encodeBarcode({ bcid: "qrcode", text: "BATCH-A", padding: 4 })).toString("base64");
  const b = (await encodeBarcode({ bcid: "code128", text: "BATCH-B" })).toString("base64");
  const res = await decodeBatch([
    { base64: a, label: "a.png" },
    { base64: b, label: "b.png" },
    { label: "bad" }, // no input -> isolated error, not fatal
  ]);
  assert.equal(res.length, 3);
  assert.equal(res[0].barcodes[0].text, "BATCH-A");
  assert.equal(res[0].label, "a.png");
  assert.equal(res[1].barcodes[0].text, "BATCH-B");
  assert.ok(res[2].error && !res[2].barcodes);
});

test("decode_pdf: rasterize pages and pull barcodes with page numbers", async () => {
  // page 1: QR, page 2: Code128 — each drawn fully within a roomy page.
  const qr = await encodeBarcode({ bcid: "qrcode", text: "PDF-P1", scale: 6, padding: 4 });
  const c128 = await encodeBarcode({ bcid: "code128", text: "PDF-P2", scale: 3, includetext: true, padding: 6 });
  const pdf = await PDFDocument.create();
  for (const png of [qr, c128]) {
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([500, 500]);
    const w = 360, h = (img.height / img.width) * w;
    page.drawImage(img, { x: 70, y: 250 - h / 2, width: w, height: h });
  }
  const base64 = Buffer.from(await pdf.save()).toString("base64");

  const res = await decodePdf({ base64 });
  assert.equal(res.pageCount, 2);
  assert.equal(res.totalBarcodes, 2);
  const p1 = res.results.find((r) => r.page === 1);
  const p2 = res.results.find((r) => r.page === 2);
  assert.equal(p1.barcodes[0].text, "PDF-P1");
  assert.equal(p2.barcodes[0].text, "PDF-P2");
});

test("gs1_parse: bracketed HRI form -> structured AIs", () => {
  const r = parseGs1("(01)09521234543213(15)261231(10)ABC123(21)SN-987");
  assert.equal(r.elements.length, 4);
  assert.deepEqual(
    r.elements.map((e) => [e.ai, e.value]),
    [["01", "09521234543213"], ["15", "261231"], ["10", "ABC123"], ["21", "SN-987"]],
  );
  assert.equal(r.elements[0].title, "GTIN");
});

test("gs1_parse: raw GS-separated form + measurement decimal", () => {
  const GS = "\x1d";
  // 01 (fixed 14) + 3103 net weight (6 digits, 3 implied decimals) +
  // 10 batch (variable, ends at GS) + 21 serial (variable, to end)
  const raw = "01" + "09521234543213" + "3103" + "001250" + "10" + "LOT9" + GS + "21" + "SER-1";
  const r = parseGs1(raw);
  const by = (ai) => r.elements.find((e) => e.ai === ai);
  assert.equal(by("01").value, "09521234543213");
  assert.equal(by("3103").numeric, 1.25); // 001250 with 3 implied decimals
  assert.equal(by("10").value, "LOT9");
  assert.equal(by("21").value, "SER-1");
});

test("option catalog: 111 bcids, pdf417 exposes its specific options", async () => {
  const ids = await allBcids();
  assert.equal(ids.length, 111);
  const opt = await listSymbologyOptions("pdf417");
  assert.equal(opt.specific.length, 8);
  assert.ok(opt.specific.some((o) => o.name === "columns"));
  assert.equal(await listSymbologyOptions("not-a-real-bcid"), null);
});
