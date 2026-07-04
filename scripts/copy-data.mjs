// tsc does not emit non-.ts assets; copy the generated catalog into dist.
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/data/", import.meta.url));
const dest = fileURLToPath(new URL("../dist/data/", import.meta.url));
await cp(src, dest, { recursive: true });
console.log("copied src/data -> dist/data");
