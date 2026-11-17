// Bundles each clan plug-in (shared/clans/<clan>/index.ts, Living Code M6) into one plain script for the sandbox
// (server/clanPluginWorker.ts) and writes server-dist/clans/<clan>.js plus server-dist/clans/manifest.json
// ({clan, version, api, sha256, bytes} per clan). Part of `npm run build:server`. The sha256 is of the exact bytes the
// server runs: Murat pins its first 8+ hex characters in CLAN_PLUGINS (docs/war-council-routine.md) to let it go live.
// Usage: node tools/clans/build.mjs [outdir=server-dist/clans]
// The server and the tools also call bundleClan in memory (dev, tests, the gate, the war sim): same options, same bytes.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CLANS_DIR = path.join(ROOT, "shared", "clans");
/** The global the bundle assigns its exports to (the sandbox reads `plugin` from it). */
export const GLOBAL_NAME = "__clan";

/** The clan folders (shared/clans/<clan>/ with an index.ts), sorted. */
export function listClans() {
  if (!fs.existsSync(CLANS_DIR)) return [];
  return fs.readdirSync(CLANS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z]+$/.test(d.name) && fs.existsSync(path.join(CLANS_DIR, d.name, "index.ts")))
    .map((d) => d.name).sort();
}

// The shared modules are data and pure functions: marked free of side effects, the bundle keeps only what the plug-in
// reaches (the kit's scripted council and the Heralds' lines, ~15 kB) instead of the whole map (seconds to load).
// Correctness is checked by tests/clanPlugins.test.ts (the default plug-ins' orders equal the scripted council's).
const pureShared = {
  name: "pure-shared",
  setup(b) {
    b.onResolve({ filter: /.*/ }, async (a) => {
      if (a.kind === "entry-point" || a.pluginData) return undefined;
      const r = await b.resolve(a.path, { resolveDir: a.resolveDir, kind: a.kind, importer: a.importer, pluginData: true });
      if (r.errors.length) return { errors: r.errors };
      return { ...r, sideEffects: !r.path.startsWith(path.join(ROOT, "shared") + path.sep) };
    });
  },
};

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Clan `clan`'s bundle, in memory: { code, sha256 }. Deterministic for the same sources and esbuild version. */
export async function bundleClan(clan) {
  const entry = path.join(CLANS_DIR, clan, "index.ts");
  const r = await esbuild.build({
    entryPoints: [entry], absWorkingDir: ROOT, bundle: true, write: false, format: "iife", globalName: GLOBAL_NAME,
    platform: "neutral", target: "es2022", minify: true, charset: "ascii", legalComments: "none", sourcemap: false,
    logLevel: "silent", plugins: [pureShared],
  });
  const code = r.outputFiles[0].text;
  return { code, sha256: sha256(code) };
}

/** The plug-in's declared {api, clan, version}, read in a bare vm context (codegen off, 1 s). Undefined when it won't load. */
export function bundleMeta(code) {
  try {
    const ctx = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
    vm.runInContext(code, ctx, { timeout: 1000 });
    const out = vm.runInContext(`(() => { const p = ${GLOBAL_NAME} && ${GLOBAL_NAME}.plugin; return JSON.stringify({ api: p && p.api, clan: p && p.clan, version: p && p.version }); })()`, ctx, { timeout: 100 });
    return typeof out === "string" ? JSON.parse(out) : undefined;
  } catch { return undefined; }
}

/** Builds every clan into `outdir` with its manifest. Returns the manifest. */
export async function buildAll(outdir = path.join(ROOT, "server-dist", "clans")) {
  fs.mkdirSync(outdir, { recursive: true });
  for (const f of fs.readdirSync(outdir)) if (f.endsWith(".js") || f === "manifest.json") fs.rmSync(path.join(outdir, f));
  const clans = [];
  for (const clan of listClans()) {
    const { code, sha256: h } = await bundleClan(clan), m = bundleMeta(code) ?? {};
    fs.writeFileSync(path.join(outdir, `${clan}.js`), code);
    clans.push({ clan, version: typeof m.version === "string" ? m.version : "?", api: m.api ?? null, sha256: h, sha8: h.slice(0, 8), bytes: Buffer.byteLength(code) });
  }
  const manifest = { clans };
  fs.writeFileSync(path.join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAll(process.argv[2] ? path.resolve(process.argv[2]) : undefined).then((m) => {
    if (process.env.CLAN_BUILD_VERBOSE) for (const c of m.clans) console.log(`clan plug-in ${c.clan}@${c.version} sha8 ${c.sha8} (${c.bytes} bytes)`);
  }, (e) => { console.error("clan plug-ins: build failed:", e); process.exit(1); });
}
