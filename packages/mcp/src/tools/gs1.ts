// Parse a GS1 element string (as produced by decode_barcode on a GS1-128,
// GS1 DataMatrix, GS1 QR, or GS1 DataBar) into structured Application
// Identifiers. Handles both the raw FNC1/GS-separated form scanners emit and
// the human-readable bracketed form "(01)...(17)...".

const GS = "\x1d"; // FNC1 / group separator emitted by decoders for GS1

interface AiSpec {
  title: string;
  /** Fixed value length, or null for variable-length (terminated by GS/end). */
  len: number | null;
  /** Max length for variable AIs (informational). */
  max?: number;
}

// Core GS1 Application Identifiers. Fixed-length AIs let us split a
// concatenated string with no separators; variable ones run to the next GS.
const AIS: Record<string, AiSpec> = {
  "00": { title: "SSCC", len: 18 },
  "01": { title: "GTIN", len: 14 },
  "02": { title: "GTIN of contained trade items", len: 14 },
  "10": { title: "Batch/Lot number", len: null, max: 20 },
  "11": { title: "Production date (YYMMDD)", len: 6 },
  "12": { title: "Due date (YYMMDD)", len: 6 },
  "13": { title: "Packaging date (YYMMDD)", len: 6 },
  "15": { title: "Best before date (YYMMDD)", len: 6 },
  "16": { title: "Sell by date (YYMMDD)", len: 6 },
  "17": { title: "Expiration date (YYMMDD)", len: 6 },
  "20": { title: "Internal product variant", len: 2 },
  "21": { title: "Serial number", len: null, max: 20 },
  "22": { title: "Consumer product variant", len: null, max: 20 },
  "240": { title: "Additional product identification", len: null, max: 30 },
  "241": { title: "Customer part number", len: null, max: 30 },
  "242": { title: "Made-to-order variation number", len: null, max: 6 },
  "243": { title: "Packaging component number", len: null, max: 20 },
  "250": { title: "Secondary serial number", len: null, max: 30 },
  "251": { title: "Reference to source entity", len: null, max: 30 },
  "253": { title: "GDTI", len: null, max: 30 },
  "254": { title: "GLN extension component", len: null, max: 20 },
  "255": { title: "GCN", len: null, max: 25 },
  "30": { title: "Variable count of items", len: null, max: 8 },
  "37": { title: "Count of trade items", len: null, max: 8 },
  "400": { title: "Customer purchase order number", len: null, max: 30 },
  "401": { title: "GINC", len: null, max: 30 },
  "402": { title: "GSIN", len: 17 },
  "403": { title: "Routing code", len: null, max: 30 },
  "410": { title: "Ship to / deliver to GLN", len: 13 },
  "411": { title: "Bill to / invoice to GLN", len: 13 },
  "412": { title: "Purchased from GLN", len: 13 },
  "413": { title: "Ship for / deliver for GLN", len: 13 },
  "414": { title: "Identification of a physical location (GLN)", len: 13 },
  "415": { title: "GLN of the invoicing party", len: 13 },
  "417": { title: "Party GLN", len: 13 },
  "420": { title: "Ship to / deliver to postal code", len: null, max: 20 },
  "421": { title: "Ship to / deliver to postal code with ISO country", len: null, max: 12 },
  "422": { title: "Country of origin", len: 3 },
  "8003": { title: "GRAI", len: null, max: 30 },
  "8004": { title: "GIAI", len: null, max: 30 },
  "8005": { title: "Price per unit of measure", len: 6 },
  "8006": { title: "ITIP", len: 18 },
  "8008": { title: "Date and time of production", len: null, max: 12 },
  "8010": { title: "CPID", len: null, max: 30 },
  "8011": { title: "CPID serial number", len: null, max: 12 },
  "8017": { title: "GSRN – Provider", len: 18 },
  "8018": { title: "GSRN – Recipient", len: 18 },
  "8020": { title: "Payment slip reference number", len: null, max: 25 },
  "8200": { title: "Extended packaging URL", len: null, max: 70 },
};

// Measurement families: 4-digit AI where the leading 3 digits pick the measure
// and the 4th digit is the implied decimal position; value is always 6 digits.
const MEASURE: Record<string, string> = {
  "310": "Net weight (kg)",
  "311": "Length/1st dimension (m)",
  "312": "Width/2nd dimension (m)",
  "313": "Height/3rd dimension (m)",
  "314": "Area (m²)",
  "315": "Net volume (l)",
  "316": "Net volume (m³)",
  "320": "Net weight (lb)",
  "330": "Gross weight (kg)",
  "390": "Amount payable (local currency)",
  "391": "Amount payable with ISO currency",
  "392": "Amount payable for a variable measure item",
  "393": "Amount payable with ISO currency (variable measure)",
};

export interface Gs1Element {
  ai: string;
  title: string;
  value: string;
  /** Decimal-adjusted numeric value for measurement AIs. */
  numeric?: number;
}

export interface Gs1ParseResult {
  elements: Gs1Element[];
  /** AIs the parser could not classify (unknown or malformed). */
  unparsed?: string;
}

/** Parse the bracketed human-readable form "(01)0…(17)…". */
function parseBracketed(input: string): Gs1Element[] {
  const out: Gs1Element[] = [];
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    out.push(describe(m[1], m[2]));
  }
  return out;
}

/** Look up value length for an AI at the current scan position. */
function specFor(ai: string): AiSpec | null {
  if (AIS[ai]) return AIS[ai];
  if (ai.length === 4 && MEASURE[ai.slice(0, 3)]) {
    return { title: MEASURE[ai.slice(0, 3)], len: 6 };
  }
  return null;
}

function describe(ai: string, value: string): Gs1Element {
  const el: Gs1Element = { ai, title: specFor(ai)?.title ?? "Unknown AI", value };
  if (ai.length === 4 && MEASURE[ai.slice(0, 3)]) {
    const dec = Number(ai[3]);
    const n = Number(value);
    if (!Number.isNaN(n)) el.numeric = dec ? n / 10 ** dec : n;
  }
  return el;
}

/** Parse the raw scanner form: AIs concatenated, variable fields end at GS. */
function parseRaw(input: string): Gs1ParseResult {
  const s = input.startsWith(GS) ? input.slice(1) : input;
  const out: Gs1Element[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    // Try 4-, 3-, then 2-digit AI prefixes.
    let ai: string | null = null;
    let spec: AiSpec | null = null;
    for (const n of [4, 3, 2]) {
      const cand = s.slice(i, i + n);
      if (cand.length === n && /^\d+$/.test(cand)) {
        const sp = specFor(cand);
        if (sp) {
          ai = cand;
          spec = sp;
          break;
        }
      }
    }
    if (!ai || !spec) return { elements: out, unparsed: s.slice(i) };
    i += ai.length;
    let value: string;
    if (spec.len != null) {
      value = s.slice(i, i + spec.len);
      i += spec.len;
    } else {
      const gsIdx = s.indexOf(GS, i);
      const end = gsIdx === -1 ? s.length : gsIdx;
      value = s.slice(i, end);
      i = end;
    }
    out.push(describe(ai, value));
  }
  return { elements: out };
}

/** Parse a GS1 element string into structured Application Identifiers. */
export function parseGs1(input: string): Gs1ParseResult {
  if (input.includes("(") && /\(\d{2,4}\)/.test(input)) {
    return { elements: parseBracketed(input) };
  }
  return parseRaw(input);
}
