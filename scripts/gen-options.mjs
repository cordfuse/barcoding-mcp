// Codegen: build the barcode option catalog from bwip-js's own shipped sources.
//
//   Tier A (common)      <- dist/bwip-js-gen.d.ts  (BwippOptions + RenderOptions)
//   Tier B (per-symbol)  <- barcode.ps             (BWIPP option-default preambles)
//
// Output: src/data/symbology-options.json  (committed; served by list_symbology_options)
//
// Run: npm run gen:options
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bwipEntry = fileURLToPath(import.meta.resolve("bwip-js"));
const pkgRoot = join(dirname(bwipEntry), ".."); // .../node_modules/bwip-js
const dtsPath = join(pkgRoot, "dist", "bwip-js-gen.d.ts");
const psPath = join(pkgRoot, "barcode.ps");
const outDir = fileURLToPath(new URL("../src/data/", import.meta.url));

// --- type inference from a BWIPP default value -----------------------------
function inferType(raw) {
  const v = raw.trim();
  if (v === "true" || v === "false") return { type: "boolean", default: v === "true" };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { type: "number", default: Number(v) };
  if (/^\(.*\)$/.test(v)) {
    const s = v.slice(1, -1);
    return { type: "string", default: s === "unset" ? undefined : s };
  }
  return { type: "string" };
}

// --- Tier A: common options from the TypeScript declarations ---------------
function parseCommon(dts) {
  const grab = (iface) => {
    const m = dts.match(new RegExp(`interface ${iface}[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`));
    return m ? m[1] : "";
  };
  const body = grab("BwippOptions") + "\n" + grab("RenderOptions");
  const opts = [];
  const seen = new Set();
  const re = /^\s*(\w+)\??:\s*([^;]+?);(?:\s*\/\/\s*(.*))?$/gm;
  let m;
  while ((m = re.exec(body))) {
    const [, name, rawType, comment] = m;
    if (name === "bcid" || name === "text" || seen.has(name)) continue;
    seen.add(name);
    const parts = rawType.split("|").map((s) => s.trim()).filter((s) => s !== "undefined");
    const enums = parts.filter((p) => /^'.*'$/.test(p)).map((p) => p.slice(1, -1));
    let type = "string";
    if (enums.length) type = "enum";
    else if (parts.includes("boolean")) type = "boolean";
    else if (parts.includes("number")) type = "number";
    const entry = { name, type };
    if (enums.length) entry.values = enums;
    if (comment) entry.description = comment.trim();
    opts.push(entry);
  }
  return opts;
}

// --- Tier B: per-symbology options from barcode.ps -------------------------
const DENY = new Set(["dontdraw"]); // bwip-js manages this one itself
// BWIPP's Advanced Sizing Technology preamble is templated into every symbology.
// Hoist it into a single shared "sizing" group instead of repeating it 95x.
const SIZING = new Set([
  "strictspec", "propspec", "loosespec", "mag", "xdim",
  "ast", "xnom", "xmin", "xmax", "modunit",
]);

function extractBlock(ps, bcid) {
  const start = ps.indexOf(`\n/${bcid} {`);
  if (start < 0) return null;
  // Option defaults live between the function open and the processoptions marker.
  const end = ps.indexOf("/options exch def", start);
  if (end < 0) return null;
  const block = ps.slice(start, end);
  const out = [];
  const seen = new Set();
  const re = /^\s*\/([A-Za-z]\w*)\s+(.+?)\s+def\b(?:\s*%\s*(.*))?$/gm;
  let m;
  while ((m = re.exec(block))) {
    const [, name, rawVal, comment] = m;
    if (DENY.has(name) || name.startsWith("_") || seen.has(name)) continue;
    seen.add(name);
    const { type, default: def } = inferType(rawVal);
    const entry = { name, type };
    if (def !== undefined) entry.default = def;
    if (comment) entry.description = comment.trim();
    out.push(entry);
  }
  return out;
}

function parseSymbologies(ps, bcids, commonNames) {
  const symbologyOptions = {};
  const sizing = new Map();
  for (const bcid of bcids) {
    const all = extractBlock(ps, bcid);
    if (!all) continue;
    const specific = [];
    for (const opt of all) {
      if (SIZING.has(opt.name)) {
        if (!sizing.has(opt.name)) sizing.set(opt.name, opt);
        continue;
      }
      if (commonNames.has(opt.name)) continue; // already in the common tier
      specific.push(opt);
    }
    if (specific.length) symbologyOptions[bcid] = specific;
  }
  return { symbologyOptions, sizingOptions: [...sizing.values()] };
}

function parseBcids(dts) {
  const bcids = new Set();
  const re = /export function (\w+)<T>\(opts: RenderOptions/g;
  let m;
  while ((m = re.exec(dts))) bcids.add(m[1]);
  return [...bcids].sort();
}

const dts = await readFile(dtsPath, "utf8");
const ps = await readFile(psPath, "utf8");

const bcids = parseBcids(dts);
const common = parseCommon(dts);
const commonNames = new Set(common.map((o) => o.name));
const { symbologyOptions, sizingOptions } = parseSymbologies(ps, bcids, commonNames);

const catalog = {
  generatedFrom: {
    bwipjs: JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8")).version,
  },
  bcids,
  commonOptions: common,
  sizingOptions,
  symbologyOptions,
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "symbology-options.json"), JSON.stringify(catalog, null, 2) + "\n");

const symCount = Object.keys(symbologyOptions).length;
const specTotal = Object.values(symbologyOptions).reduce((n, o) => n + o.length, 0);
console.log(
  `catalog: ${common.length} common, ${sizingOptions.length} sizing, ` +
    `${symCount}/${bcids.length} symbologies, ${specTotal} symbology-specific options`,
);
