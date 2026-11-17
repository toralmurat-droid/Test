/**
 * Clan plug-ins on the server (Living Code M6 part 1): the `plugin` council provider (server/warCouncil.ts) runs a
 * clan's own code (shared/clans/<clan>/, bundled by tools/clans/build.mjs) in a sandboxed worker
 * (server/clanPluginWorker.ts) once a war day. Murat's rule (2026-11-17): no AI-written code goes live without his OK,
 * and the OK is the hash pin. Off by default: a clan's bundle runs only when CLAN_PLUGINS pins its sha256 and its
 * council is on with provider `plugin`.
 *
 * Fails closed everywhere: not pinned, a hash that does not match, the kill switch, a throw, a hang, a crash, a wrong
 * clan or API, reserved points, a forge order, an oversized or illegal answer all make the provider fail, and the
 * doctrine leads that clan for the day (the council log and the daily digest say why). After CLAN_PLUGIN.failLimit
 * failures in a row a clan's plug-in switches itself off until an admin re-enables it (in memory: a restart re-enables).
 *
 * Config (env, read by configureClanPlugins at start):
 * - CLAN_PLUGINS: `wardens:<hex>,host:<hex>`, each pin at least CLAN_PLUGIN.minPin hex characters of the bundle's
 *   sha256 (server-dist/clans/manifest.json `sha8`, or GET /admin/clan-plugins). Unset: off.
 * - CLAN_PLUGINS_KILL=1: the kill switch (also POST /admin/clan-plugins?kill=1).
 * Admin: GET /admin/clan-plugins (pins, bundle hashes, kill, failures, last runs); POST ?kill=1|0, ?enable=<clan>|all.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { Express, Request } from "express";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import type { CouncilBriefing } from "../shared/war/council";
import { CLAN_PLUGIN, CLAN_PLUGIN_API, RESERVED_POINTS } from "../shared/clans/api";
import { sandboxRun, type SandboxMeta, type SandboxOptions, type SandboxResult } from "./clanPluginWorker";

/** A clan's bundle as the server runs it: the exact code, its sha256, where it came from. */
export interface ClanBundle { code: string; sha256: string; version?: string; source: "dist" | "memory" | "test" }
/** One plug-in run, for the admin view. */
export interface PluginRun { at: number; clan: ClanKey; day: number; ok: boolean; ms: number; sha8?: string; error?: string }

const isClan = (v: unknown): v is ClanKey => typeof v === "string" && CLAN_KEYS.includes(v as ClanKey);
const quiet = () => !!process.env.NODE_TEST_CONTEXT;
const pins = new Map<ClanKey, string>(), fails = new Map<ClanKey, number>(), disabled = new Set<ClanKey>();
const bundles = new Map<ClanKey, ClanBundle>(), testBundles = new Map<ClanKey, string>(), seenVersion = new Map<ClanKey, string>();
const runs: PluginRun[] = [];
let killed = false;

// ---- Config, kill switch -----------------------------------------------------------------------------------------------

/** Reads CLAN_PLUGINS and CLAN_PLUGINS_KILL (module comment). Malformed pins are ignored (logged): fail closed. */
export function configureClanPlugins(env: NodeJS.ProcessEnv = process.env) {
  pins.clear();
  for (const part of (env.CLAN_PLUGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [k, h] = part.split(":").map((x) => x.trim().toLowerCase());
    if (isClan(k) && h && new RegExp(`^[0-9a-f]{${CLAN_PLUGIN.minPin},64}$`).test(h)) pins.set(k, h);
    else console.warn(`Clan plug-ins: ignored pin "${part.slice(0, 80)}" (clan:<${CLAN_PLUGIN.minPin}+ hex of the bundle's sha256>)`);
  }
  killed = env.CLAN_PLUGINS_KILL === "1" || env.CLAN_PLUGINS_KILL === "true";
  if (pins.size && !env.NODE_TEST_CONTEXT) console.log(`Clan plug-ins pinned: ${[...pins].map(([k, h]) => `${k}#${h.slice(0, 8)}`).join(", ")}${killed ? " - KILLED, the doctrine leads" : ""}`);
}
/** The kill switch: on, no plug-in runs (every plugin council falls back to the doctrine). */
export function killClanPlugins(on = true) {
  killed = on;
  console.log(`Clan plug-ins: kill switch ${on ? "on, the doctrine leads" : "off"}`);
}
export const clanPluginsKilled = () => killed;
/** Re-enables a clan's plug-in after auto-disable (and forgets its failures). `all`: every clan. */
export function enableClanPlugin(k: ClanKey | "all") {
  for (const c of k === "all" ? CLAN_KEYS : [k]) { disabled.delete(c); fails.delete(c); }
}

// ---- Bundles -----------------------------------------------------------------------------------------------------------

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const distDir = () => path.join(__dirname, "clans");
/** The manifest's version for a clan (informational; the hash is always taken from the bytes). */
function manifestVersion(k: ClanKey): string | undefined {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(distDir(), "manifest.json"), "utf8")) as { clans?: { clan?: string; version?: unknown }[] };
    const v = m.clans?.find((c) => c.clan === k)?.version;
    return typeof v === "string" ? v : undefined;
  } catch { return undefined; }
}
/**
 * Clan k's bundle: server-dist/clans/<k>.js in the built server; in dev and tests (no built worker next to this file)
 * bundled in memory by tools/clans/build.mjs. Undefined when the clan has none.
 */
export async function clanBundle(k: ClanKey): Promise<ClanBundle | undefined> {
  const t = testBundles.get(k);
  if (t !== undefined) return { code: t, sha256: sha256(t), source: "test" };
  const had = bundles.get(k);
  if (had) return had;
  let b: ClanBundle | undefined;
  const file = path.join(distDir(), `${k}.js`);
  if (fs.existsSync(file)) {
    const code = fs.readFileSync(file, "utf8");
    b = { code, sha256: sha256(code), source: "dist", ...(manifestVersion(k) ? { version: manifestVersion(k) } : {}) };
  } else if (!fs.existsSync(path.join(__dirname, "clanPlugin.cjs"))) { // (dev, tests: the sources; the path is not spelled out, so the bundle never carries the tool)
    const src = "../tools/clans/build.mjs";
    const { bundleClan, bundleMeta, listClans } = (await import(src)) as {
      bundleClan(c: string): Promise<{ code: string; sha256: string }>; bundleMeta(code: string): { version?: unknown } | undefined; listClans(): string[];
    };
    if (listClans().includes(k)) {
      const r = await bundleClan(k), v = bundleMeta(r.code)?.version;
      b = { code: r.code, sha256: r.sha256, source: "memory", ...(typeof v === "string" ? { version: v } : {}) };
    }
  }
  if (b) bundles.set(k, b);
  return b;
}

// ---- The worker --------------------------------------------------------------------------------------------------------

let workerCode: string | undefined;
/** The worker: server-dist/clanPlugin.cjs when built; in dev and tests server/clanPluginWorker.ts bundled in memory. */
async function workerSpec(): Promise<{ file: string } | { code: string }> {
  const file = path.join(__dirname, "clanPlugin.cjs");
  if (fs.existsSync(file)) return { file };
  if (!workerCode) {
    const esb = "esbuild";
    const { build } = (await import(esb)) as typeof import("esbuild");
    const r = await build({ entryPoints: [path.join(__dirname, "clanPluginWorker.ts")], bundle: true, platform: "node", format: "cjs", target: "node22", write: false, logLevel: "silent" });
    workerCode = r.outputFiles[0].text;
  }
  return { code: workerCode };
}

/**
 * Runs bundle `code` on `inputs` (briefings as JSON) in a fresh worker thread: no env, no execArgv, CLAN_PLUGIN's
 * memory and stack limits, terminated after its budget plus CLAN_PLUGIN.killMarginMs. Never rejects: a crash, an
 * out-of-memory or a kill answers every input with an error. Also the gate's runner (tools/clans/gate.ts).
 */
export async function runInWorker(code: string, inputs: string[], callMs: number = CLAN_PLUGIN.callMs): Promise<SandboxResult[]> {
  const fail = (error: string): SandboxResult[] => inputs.map(() => ({ ok: false, error }));
  let spec: { file: string } | { code: string };
  try { spec = await workerSpec(); } catch (e) { return fail(`no sandbox: ${(e as Error)?.message ?? e}`.slice(0, 200)); }
  const opt: SandboxOptions = { callMs, loadMs: callMs, maxOut: CLAN_PLUGIN.maxOut };
  const budget = inputs.length * 2 * callMs + CLAN_PLUGIN.killMarginMs;
  return new Promise((resolve) => {
    let done = false, w: Worker | undefined;
    const finish = (r: SandboxResult[]) => {
      if (done) return;
      done = true; clearTimeout(t);
      w?.terminate().catch(() => {});
      resolve(r);
    };
    const t = setTimeout(() => finish(fail(`killed: no answer within ${budget} ms`)), budget);
    t.unref?.();
    try {
      w = new Worker("file" in spec ? spec.file : spec.code, {
        eval: !("file" in spec), workerData: { clanPlugin: true, code, inputs, opt }, env: {}, execArgv: [], argv: [],
        resourceLimits: { maxOldGenerationSizeMb: CLAN_PLUGIN.oldMb, maxYoungGenerationSizeMb: CLAN_PLUGIN.youngMb, stackSizeMb: CLAN_PLUGIN.stackMb },
      });
    } catch (e) { finish(fail(`the worker did not start: ${(e as Error)?.message ?? e}`.slice(0, 200))); return; }
    w.on("message", (m: unknown) => finish(Array.isArray(m) && m.length === inputs.length ? (m as SandboxResult[]) : fail("the worker gave no answer")));
    w.on("error", (e) => finish(fail(`the worker crashed: ${String(e?.message ?? e).slice(0, 160)}`)));
    w.on("exit", (c) => finish(fail(`the worker stopped (${c})`)));
  });
}

// ---- Checking an answer ------------------------------------------------------------------------------------------------

const ALLOWED_KEYS = ["api", "clan", "version", "council"];
const VERSION_RE = new RegExp(`^[A-Za-z0-9._-]{1,${CLAN_PLUGIN.versionMax}}$`);
/** What is wrong with a plug-in's declaration for clan k (undefined: nothing). Pure. */
export function metaProblem(m: SandboxMeta | undefined, k: ClanKey): string | undefined {
  if (!m) return "the plug-in did not declare itself";
  if (m.api !== CLAN_PLUGIN_API) return `api: the server runs API ${CLAN_PLUGIN_API}, the plug-in declares ${JSON.stringify(m.api)?.slice(0, 20)}`;
  if (m.clan !== k) return `clan: the plug-in is for ${JSON.stringify(m.clan)?.slice(0, 20)}, not ${k}`;
  if (typeof m.version !== "string" || !VERSION_RE.test(m.version)) return `version: 1-${CLAN_PLUGIN.versionMax} of A-Z a-z 0-9 . _ -`;
  const reserved = m.keys.filter((x) => (RESERVED_POINTS as readonly string[]).includes(x));
  if (reserved.length) return `reserved points are not in API ${CLAN_PLUGIN_API}: ${reserved.join(", ")}`;
  const extra = m.keys.filter((x) => !ALLOWED_KEYS.includes(x));
  if (extra.length) return `unknown fields: ${extra.slice(0, 5).join(", ").slice(0, 80)}`;
  if (!m.council) return "council: not a function";
  return undefined;
}

/**
 * A sandbox result as orders for clan k, or the problem: the declaration (metaProblem), the JSON, a forge order (a
 * plug-in never commissions: the forge belongs to the remote councils), then `check` (validateCouncil's errors).
 */
export function answerOf(r: SandboxResult, k: ClanKey, check: (raw: unknown) => string[]): { raw: unknown } | { error: string } {
  if (!r.ok) return { error: r.error };
  const bad = metaProblem(r.meta, k);
  if (bad) return { error: bad };
  let raw: unknown;
  try { raw = JSON.parse(r.out); } catch { return { error: "the answer is not JSON" }; }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "forge" in raw) return { error: "forge: a plug-in may not commission forgings" };
  const errs = check(raw);
  if (errs.length) return { error: `illegal orders: ${errs.slice(0, 3).join("; ")}`.slice(0, 200) };
  return { raw };
}

// ---- The provider --------------------------------------------------------------------------------------------------------

function note(run: PluginRun) {
  runs.push(run);
  if (runs.length > 50) runs.splice(0, runs.length - 50);
}
function failed(k: ClanKey, day: number, t0: number, sha8: string | undefined, error: string): Error {
  note({ at: Date.now(), clan: k, day, ok: false, ms: Date.now() - t0, ...(sha8 ? { sha8 } : {}), error });
  const n = (fails.get(k) ?? 0) + 1;
  fails.set(k, n);
  let msg = `plug-in failed: ${error}`;
  if (n >= CLAN_PLUGIN.failLimit && !disabled.has(k)) {
    disabled.add(k);
    msg = `plug-in switched off after ${n} failures in a row (admin: enable=${k}); last: ${error}`;
    console.warn(`Clan plug-ins: ${k} switched off after ${n} failures in a row (POST /admin/clan-plugins?enable=${k})`);
  } else if (!quiet()) console.warn(`Clan plug-ins: ${k} failed (${n} in a row): ${error}`);
  return new Error(msg);
}

/** The council log's provider id for clan k: `plugin:<clan>@<version>#<sha8>` once its bundle is known. */
export function pluginLabel(k: ClanKey): string {
  const b = testBundles.has(k) ? { sha256: sha256(testBundles.get(k)!), version: undefined } : bundles.get(k);
  const v = seenVersion.get(k) ?? b?.version ?? "?";
  return b ? `plugin:${k}@${v.slice(0, CLAN_PLUGIN.versionMax)}#${b.sha256.slice(0, 8)}` : `plugin:${k}`;
}

/**
 * Clan b.clan's plug-in's orders for briefing `b` (server/warCouncil.ts provider `plugin`). Rejects (the doctrine leads)
 * unless the plug-in is pinned, its bundle matches the pin, nothing switched it off, and it answered legal orders
 * (`check`: validateCouncil's errors) in time. Failures of the plug-in itself count towards the auto switch-off.
 */
export async function pluginCouncil(b: CouncilBriefing, check: (raw: unknown) => string[]): Promise<unknown> {
  const k = b.clan, t0 = Date.now();
  if (!isClan(k)) throw new Error("no such clan");
  if (killed) throw new Error("clan plug-ins are killed (kill switch)");
  const pin = pins.get(k);
  if (!pin) throw new Error(`no hash pinned for ${k} (CLAN_PLUGINS): unpinned code never runs`);
  if (disabled.has(k)) throw new Error(`the plug-in of ${k} is switched off after ${CLAN_PLUGIN.failLimit} failures in a row (admin: enable=${k})`);
  const bundle = await clanBundle(k);
  if (!bundle) throw new Error(`no bundle for ${k}`);
  const sha8 = bundle.sha256.slice(0, 8);
  if (!bundle.sha256.startsWith(pin)) {
    note({ at: Date.now(), clan: k, day: b.day, ok: false, ms: 0, sha8, error: "hash mismatch" });
    throw new Error(`hash mismatch: pinned ${pin.slice(0, 16)}, the bundle is ${sha8} (pin the new hash to run it)`);
  }
  const [r] = await runInWorker(bundle.code, [JSON.stringify(b)]);
  if (r?.meta && typeof r.meta.version === "string" && VERSION_RE.test(r.meta.version)) seenVersion.set(k, r.meta.version);
  if (killed) throw new Error("clan plug-ins were killed during the run");
  const a = r ? answerOf(r, k, check) : { error: "no answer" };
  if ("error" in a) throw failed(k, b.day, t0, sha8, a.error);
  fails.delete(k);
  note({ at: Date.now(), clan: k, day: b.day, ok: true, ms: Date.now() - t0, sha8 });
  return a.raw;
}

/** In-process run for the war sim (tools/balance/war.ts --plugin): the same sandbox and checks, no worker, no pins. */
export function pluginCouncilSync(code: string, b: CouncilBriefing, check: (raw: unknown) => string[], callMs: number = CLAN_PLUGIN.callMs): { raw: unknown } | { error: string } {
  const [r] = sandboxRun(code, [JSON.stringify(b)], { callMs, loadMs: callMs, maxOut: CLAN_PLUGIN.maxOut });
  return answerOf(r, b.clan, check);
}

// ---- Admin -------------------------------------------------------------------------------------------------------------

/** The admin view: pins, each clan's bundle hash and whether it matches its pin, kill, failures, the last runs. */
export async function clanPluginsAdmin(n = 30) {
  const clans: Record<string, unknown> = {};
  for (const k of CLAN_KEYS) {
    let b: ClanBundle | undefined;
    try { b = await clanBundle(k); } catch { b = undefined; }
    const pin = pins.get(k);
    clans[k] = {
      pin: pin ?? null, ...(b ? { sha256: b.sha256, sha8: b.sha256.slice(0, 8), source: b.source, version: seenVersion.get(k) ?? b.version ?? null } : { bundle: null }),
      live: !!(pin && b && b.sha256.startsWith(pin) && !disabled.has(k) && !killed), failsInARow: fails.get(k) ?? 0, disabled: disabled.has(k),
    };
  }
  return { killed, api: CLAN_PLUGIN_API, clans, runs: runs.slice(-n) };
}

/** GET /admin/clan-plugins and POST /admin/clan-plugins?kill=1|0&enable=<clan>|all, behind the admin key (else 404). */
export function mountClanPluginAdmin(app: Express, ok: (req: Request) => boolean) {
  app.get("/admin/clan-plugins", async (req, res) => {
    if (!ok(req)) { res.sendStatus(404); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json(await clanPluginsAdmin());
  });
  app.post("/admin/clan-plugins", async (req, res) => {
    if (!ok(req)) { res.sendStatus(404); return; }
    const q = req.query;
    if (q.kill === "1" || q.kill === "0") killClanPlugins(q.kill === "1");
    if (q.enable === "all" || isClan(q.enable)) enableClanPlugin(q.enable as ClanKey | "all");
    res.setHeader("Cache-Control", "no-store");
    res.json(await clanPluginsAdmin(10));
  });
}

/** Tests: a clan's bundle code (undefined: the real one); forget pins, failures, runs and cached bundles. */
export function _setClanBundle(k: ClanKey, code?: string) { if (code === undefined) testBundles.delete(k); else testBundles.set(k, code); seenVersion.delete(k); }
export function _resetClanPlugins() {
  testBundles.clear(); seenVersion.clear(); fails.clear(); disabled.clear(); runs.length = 0;
  configureClanPlugins({ NODE_TEST_CONTEXT: "1" });
}

configureClanPlugins();
