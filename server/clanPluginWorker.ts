/**
 * The clan plug-in sandbox (Living Code M6). server/clanPlugins.ts starts this file (bundled to
 * server-dist/clanPlugin.cjs) as a worker thread with resource limits, an empty env and no execArgv; the worker runs a
 * plug-in bundle (tools/clans/build.mjs) on one or more briefings and posts the answers back. The war sim and the gate
 * call sandboxRun directly (same code, same answers, no worker).
 *
 * Inside: a fresh vm context per call with string and wasm code generation off; Date, Intl, Function, eval, Proxy,
 * Reflect, WebAssembly, SharedArrayBuffer, Atomics and the other non-pure globals removed; no require, process or
 * timers (a vm context never has them); Math.random seeded from the briefing; the briefing parsed and deep-frozen inside
 * the context; the call bounded by `callMs` (vm timeout, microtasks included) and its answer, as JSON, by `maxOut`.
 * Only strings cross between the context and this file.
 *
 * NOT a security boundary: node:vm can be escaped by determined code. What keeps hostile code out is the static check
 * (tools/clans/check.ts), the empty env and the worker's limits, review, and above all Murat's hash pin (CLAN_PLUGINS):
 * no bundle runs that he has not pinned.
 */
import vm from "node:vm";
import { isMainThread, parentPort, workerData } from "node:worker_threads";

/** One call's result: `out` (the plug-in's answer as JSON) or `error`; `meta` is what the plug-in declared. */
export type SandboxResult = { ok: true; out: string; meta: SandboxMeta } | { ok: false; error: string; meta?: SandboxMeta };
/** What the bundle's `plugin` declares: its fields (names only beyond these) and whether `council` is a function. */
export interface SandboxMeta { api: unknown; clan: unknown; version: unknown; keys: string[]; council: boolean }
export interface SandboxOptions { callMs: number; loadMs: number; maxOut: number }

/** Globals a plug-in never gets (clock, locale, code generation, reflection, shared memory, wasm, weak refs). */
export const REMOVED_GLOBALS = [
  "Date", "Intl", "Function", "eval", "Proxy", "Reflect", "WebAssembly", "SharedArrayBuffer", "Atomics", "Promise",
  "FinalizationRegistry", "WeakRef", "queueMicrotask", "globalThis",
];

// Runs first in every context: strips the globals, seeds Math.random, defines the two entry points. Every built-in it
// needs is captured here, before the plug-in's code could replace one.
const PRELUDE = `"use strict";
(() => {
  const g = globalThis, M = Math, J = JSON, O = Object, parse = J.parse, str = J.stringify, keys = O.keys, freezeO = O.freeze, isFrozen = O.isFrozen;
  for (const n of ${JSON.stringify(REMOVED_GLOBALS)}) { try { delete g[n]; } catch (e) {} }
  let seed = 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = M.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + M.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  M.random = rnd;
  const freeze = (o) => { if (o && typeof o === "object" && !isFrozen(o)) { freezeO(o); for (const k of keys(o)) freeze(o[k]); } return o; };
  const why = (e) => { try { return (e && typeof e === "object" ? String(e.name) + ": " + String(e.message) : String(e)).slice(0, 200); } catch (x) { return "?"; } };
  const plug = () => { const c = g.__clan; return c && typeof c === "object" ? c.plugin : undefined; };
  O.defineProperty(g, "__clanMeta", { value: () => {
    try {
      const p = plug();
      if (!p || typeof p !== "object") return "E:the bundle exports no plugin object";
      return "M:" + str({ api: p.api, clan: p.clan, version: p.version, keys: keys(p), council: typeof p.council === "function" });
    } catch (e) { return "E:" + why(e); }
  } });
  O.defineProperty(g, "__clanRun", { value: (inp) => {
    try {
      const b = freeze(parse(inp));
      let h = 2166136261;
      const s = String(b && b.seed) + ":" + String(b && b.day) + ":" + String(b && b.clan);
      for (let i = 0; i < s.length; i++) h = M.imul(h ^ s.charCodeAt(i), 16777619);
      seed = h | 0; M.random = rnd;
      const out = plug().council(b);
      const j = str(out === undefined ? null : out);
      return "O:" + (typeof j === "string" ? j : "null");
    } catch (e) { return "E:" + why(e); }
  } });
})();`;

/** An error's code and message, read as plain data only (no getter of an object from the context ever runs here). */
function errMsg(e: unknown): string {
  const own = (k: string) => { try { const d = e && typeof e === "object" ? Object.getOwnPropertyDescriptor(e, k) : undefined; return d && "value" in d && typeof d.value === "string" ? d.value : undefined; } catch { return undefined; } };
  const code = own("code"), msg = own("message") ?? "the sandbox failed";
  return `${code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "timeout: " : ""}${msg}`.slice(0, 200);
}

/**
 * Runs bundle `code` on each input (a briefing as JSON) in a fresh context: the plug-in loads (bounded by loadMs),
 * declares itself (meta) and answers (bounded by callMs, at most maxOut characters of JSON). Never throws.
 */
export function sandboxRun(code: string, inputs: string[], opt: SandboxOptions): SandboxResult[] {
  let script: vm.Script, prelude: vm.Script;
  try { script = new vm.Script(code, { filename: "clan-plugin.js" }); prelude = new vm.Script(PRELUDE); } catch (e) {
    return inputs.map(() => ({ ok: false as const, error: `the bundle does not compile: ${errMsg(e)}` }));
  }
  const metaCall = new vm.Script("__clanMeta()"), runCall = new vm.Script("__clanRun(__in)");
  return inputs.map((inp): SandboxResult => {
    let meta: SandboxMeta | undefined;
    try {
      const ctx = vm.createContext({}, { codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });
      prelude.runInContext(ctx, { timeout: opt.loadMs });
      script.runInContext(ctx, { timeout: opt.loadMs });
      const m = metaCall.runInContext(ctx, { timeout: opt.callMs });
      if (typeof m !== "string" || !m.startsWith("M:")) return { ok: false, error: typeof m === "string" ? m.slice(2) : "no meta" };
      meta = JSON.parse(m.slice(2)) as SandboxMeta;
      (ctx as Record<string, unknown>).__in = inp;
      const r = runCall.runInContext(ctx, { timeout: opt.callMs });
      if (typeof r !== "string") return { ok: false, error: "no answer", meta };
      if (r.startsWith("E:")) return { ok: false, error: `threw: ${r.slice(2)}`, meta };
      const out = r.slice(2);
      if (out.length > opt.maxOut) return { ok: false, error: `answer too large: ${out.length} > ${opt.maxOut} characters of JSON`, meta };
      return { ok: true, out, meta };
    } catch (e) {
      return { ok: false, error: errMsg(e), ...(meta ? { meta } : {}) };
    }
  });
}

// The worker side: workerData { clanPlugin: true, code, inputs, opt }; posts the results, then ends.
if (!isMainThread && parentPort && workerData && (workerData as { clanPlugin?: boolean }).clanPlugin) {
  const d = workerData as { code: string; inputs: string[]; opt: SandboxOptions };
  parentPort.postMessage(sandboxRun(String(d.code), Array.isArray(d.inputs) ? d.inputs.map(String) : [], d.opt));
}
