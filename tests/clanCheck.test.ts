// The static check on clan plug-in folders (tools/clans/check.ts): every denylisted name, import and construct is
// refused with its line; the folder rules (only .ts files, no subfolders, size cap, index.ts); the real folders pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLAN_PLUGIN } from "../shared/clans/api";
import { checkClan, checkSource, clanFolders, DENIED } from "../tools/clans/check";

const OK = `import { CLAN_PLUGIN_API, kit, type ClanPlugin } from "../api";
export const plugin: ClanPlugin = { api: CLAN_PLUGIN_API, clan: "wardens", version: "2", council: (b) => {
  const o = kit.scriptedCouncil(b), n = Math.max(1, Math.floor(b.seed % 3));
  for (const t of b.targets) if (t.control < 50) return { ...o, targets: [t.id] };
  return { ...o, targets: o.targets.slice(0, n), stance: b.lands.share < 0.15 ? "defend" : "attack" };
} };
`;
const refused = (src: string, re: RegExp) => {
  const p = checkSource("x/index.ts", src);
  assert.ok(p.some((m) => re.test(m)), `${JSON.stringify(src)}: ${p.join("; ") || "passed"}`);
};

test("a plain plug-in passes", () => {
  assert.deepEqual(checkSource("wardens/index.ts", OK), []);
});

test("every denylisted name is refused, as an identifier, a property or a string", () => {
  for (const n of DENIED) {
    refused(`export const a = ${n};`, new RegExp(`${n.replace(/\$/g, "\\$")}: not allowed`));
    refused(`export const a = (x: any) => x.${n};`, new RegExp(`${n}: not allowed`));
    refused(`export const a = (x: any) => x["${n}"];`, new RegExp(`"${n}": not allowed`));
  }
  // the plan's list, spelled out
  for (const n of ["require", "process", "globalThis", "global", "eval", "Function", "constructor", "__proto__", "Reflect", "Proxy", "Date", "performance",
    "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "Promise", "fetch", "WebAssembly", "Atomics", "SharedArrayBuffer", "Worker", "Intl"]) {
    assert.ok((DENIED as readonly string[]).includes(n), n);
  }
});

test("imports: only ../api; no require, dynamic import, import.meta", () => {
  refused(`import fs from "node:fs";`, /may import only "\.\.\/api"/);
  refused(`import { x } from "../../war/rules";`, /may import only/);
  refused(`import { y } from "../host";`, /may import only/);
  refused(`import { z } from "./helper";`, /may import only/);
  refused(`export * from "../../war/council";`, /may import only/);
  refused(`import x = require("fs");`, /require/);
  refused(`export const m = () => import("../api");`, /dynamic imports/);
  refused(`export const u = import.meta.url;`, /import\.meta/);
  assert.deepEqual(checkSource("a.ts", `import type { ClanPlugin } from "../api";\nexport type P = ClanPlugin;`), []);
});

test("unseeded randomness, async, with, declare and namespaces are refused", () => {
  refused(`export const r = Math.random();`, /Math\.random/);
  refused(`export const r = Math["random"]();`, /Math\.random/);
  refused(`const M = Math; export const r = M.floor(1);`, /aliasing/);
  refused(`const { random } = Math; export const r = random;`, /aliasing/);
  refused(`export const f = async () => 1;`, /async/);
  refused(`export async function f() { return 1; }`, /async/);
  refused(`export function* g(x: any) { yield x; } const h = async () => { await 1; };`, /await/);
  refused(`export const f = (o: any) => { with (o) { return 1; } };`, /with/);
  refused(`declare const x: number; export const y = x;`, /declare/);
  refused(`namespace N { export const a = 1; }`, /namespace/);
  refused(`declare global { var z: number }`, /declare global|namespace/);
  assert.deepEqual(checkSource("a.ts", `export const f = (x: number) => Math.floor(x) + Math.max(1, x);`), []);
});

test("problems name the file and line", () => {
  const p = checkSource("wardens/index.ts", `export const a = 1;\nexport const b = Date;\n`);
  assert.deepEqual(p, ["wardens/index.ts:2: Date: not allowed in a plug-in"]);
});

test("folder rules: only .ts files, no subfolders, size cap, index.ts required", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clan-check-"));
  try {
    const c = path.join(dir, "wardens");
    fs.mkdirSync(c);
    fs.writeFileSync(path.join(c, "index.ts"), OK);
    assert.deepEqual(checkClan("wardens", dir), []);
    fs.writeFileSync(path.join(c, "notes.json"), "{}");
    fs.writeFileSync(path.join(c, "types.d.ts"), "export {};");
    fs.mkdirSync(path.join(c, "sub"));
    fs.writeFileSync(path.join(c, "big.ts"), `export const s = "${"x".repeat(CLAN_PLUGIN.maxFileBytes)}";`);
    const p = checkClan("wardens", dir);
    assert.ok(p.some((m) => /notes\.json: only \.ts files/.test(m)), p.join("; "));
    assert.ok(p.some((m) => /types\.d\.ts: only \.ts files/.test(m)));
    assert.ok(p.some((m) => /sub: only \.ts files, no folders/.test(m)));
    assert.ok(p.some((m) => /big\.ts: larger than/.test(m)));
    fs.rmSync(path.join(c, "index.ts"));
    assert.ok(checkClan("wardens", dir).some((m) => /index\.ts: missing/.test(m)));
    assert.match(checkClan("nobody", dir)[0], /no folder/);
    assert.match(checkClan("../etc", dir)[0], /not a clan folder name/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the clan folders in the repository pass", () => {
  const dirs = fs.readdirSync(path.join(__dirname, "../shared/clans"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(clanFolders().sort(), dirs.sort());
  assert.ok(dirs.length >= 5);
  for (const c of dirs) assert.deepEqual(checkClan(c), [], c);
});
