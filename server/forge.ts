/**
 * The Forge on the server (roadmap M4, PR2; shared/forge.ts has the rules): the registry of every forging, research,
 * the sim gate, and what the rest of the server asks (forged monsters, drops, a capital's stock, the client's pack).
 *
 * - A clan commissions a recipe (commission: a war council's order, server/warCouncil.ts sessionForge). It is
 *   validated, paid with FORGE.armyCost of the clan's army (server/war.ts warSpendArmy), checked by the sim gate
 *   (tools/balance/forgeGate.ts, in a worker thread with a timeout; any error fails it) and goes live FORGE.researchDays
 *   war days later (forgeClock). At most FORGE.perDay commissions a war day, all clans together; past FORGE.perClan live
 *   forgings of a kind the clan's oldest retires.
 * - Statuses (shared/gear.ts ForgeStatus): `active` spawns, drops and sells; `retired` keeps its stats (items in bags,
 *   monsters alive) but makes no new ones; `revoked` falls back to the base (items keep the name). Defs are never deleted:
 *   item ids in saves point at them forever.
 * - Every change goes through rebuild(): setForgedGear (clears both gear caches), the monster index, the pack version,
 *   and the listeners (each room re-sends the pack and recomputes its heroes' stats).
 * - Saved under its own kv key "forge" (the war's store, not the war save), one write at a time (like server/war.ts).
 * - Kill switch: killForge(on) or FORGE_KILL=1 stops spawns, drops, sales and commissions at once; items keep working.
 * - No email: everything is logged (capped), forgeDayLines(day) gives the day's lines for the war digest.
 * - The Herald (M4 PR4): a lead commission ("the forges are burning"), a forging gone live and a failed gate queue a
 *   plain-text line; server/war.ts takes them (takeForgeNews) with the next war tick's news.
 */
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { Express, Request } from "express";
import {
  defFromRecipe, FORGE, liveWeapons, FORGED_GEAR_RE, forgeLookup, forgedGearId, forgedMobId, parseForgedGearId, parseForgedMobId, validateRecipe,
  type Forged, type ForgedMob, type ForgedWeapon, type ForgeRecipe, type ForgeStatus, type MonsterRecipe, type WeaponRecipe,
} from "../shared/forge";
import { rollAffixes, setForgedGear, withLevel } from "../shared/gear";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { warDay, type ForgeBriefCtx } from "../shared/war/council";
import { openKv, type Kv } from "./store";
import { warSpendArmy, warState } from "./war";

export type ForgeMode = "lead" | "shadow";
/** A commission in research: its registry number is taken, it goes live on `liveDay` once the gate passed. */
export interface ForgeProject { seq: number; recipe: ForgeRecipe; day: number; liveDay: number; at: number; gate: "pending" | "pass" }
export type ForgeLogKind = "commission" | "shadow" | "refused" | "cost" | "gate_pass" | "gate_fail" | "live" | "retire" | "revoke" | "kill" | "load";
export interface ForgeLogEntry { at: number; day?: number; clan?: ClanKey; kind: ForgeLogKind; id?: string; text: string }
export interface ForgeSave {
  v: 1;
  /** Last registry number given (weapons and monsters share it). */
  seq: number;
  /** Every forging that ever went live, any status. Never deleted. */
  defs: Forged[];
  projects: Partial<Record<ClanKey, ForgeProject[]>>;
  log: ForgeLogEntry[];
  /** Commissions of one war day (FORGE.perDay). */
  daily?: { day: number; n: number };
  killed?: boolean;
  /** Saved forgings this build could not read: kept as they were, never thrown away. */
  lost?: unknown[];
}
/** What a client gets: the forgings it needs to name and draw items and monsters. `v` changes with every change. */
/** `killed`: the kill switch is on (no forged stock is sold), which a client cannot tell from the live list alone. */
export interface ForgePack { v: number; defs: Forged[]; killed?: boolean }
export interface GateVerdict { ok: boolean; reasons: string[] }
export type GateRunner = (def: Forged) => Promise<GateVerdict>;

const KEY = "forge";
const LOST_MAX = 1000; // never expected near: a forging only lands here when a later build cannot read it
const STATUSES: readonly ForgeStatus[] = ["active", "retired", "revoked"];
/** A forging's id as a client may ask for it ("forgeQ"): a weapon's base id or a monster's. */
export const FORGE_ID_RE = /^(?:fg[1-9]\d{0,8}_[a-z0-9_]{1,40}|fm[1-9]\d{0,8})$/;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDay = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;
const isClan = (v: unknown): v is ClanKey => typeof v === "string" && (CLAN_KEYS as readonly string[]).includes(v);
const fresh = (): ForgeSave => ({ v: 1, seq: 0, defs: [], projects: {}, log: [] });

/** A forging's recipe (registry number and status left out): what validateRecipe checks. */
function recipeOf(f: Forged): ForgeRecipe {
  if (f.kind === "weapon") {
    const r: WeaponRecipe = { kind: "weapon", clan: f.clan, name: f.name, base: f.base, implicit: f.implicit, palette: f.palette };
    if (f.elem) r.elem = f.elem;
    if (f.level !== undefined) r.level = f.level;
    return r;
  }
  const r: MonsterRecipe = { kind: "monster", clan: f.clan, name: f.name, base: f.base, affixes: f.affixes, hp: f.mult?.hp, dmg: f.mult?.dmg, speed: f.mult?.speed, palette: f.palette };
  if (f.weapon !== undefined) r.weapon = f.weapon;
  return r;
}
/**
 * A recipe as checked when it was saved: everything must hold except the power budget (a forging that passed its gate
 * stays, even if the budgets are tuned down later).
 */
function savedRecipe(raw: unknown): ForgeRecipe | undefined {
  const c = validateRecipe(raw);
  if (c.ok) return c.recipe;
  return c.errors.length === 1 && c.errors[0].code === "over_budget" ? (raw as ForgeRecipe) : undefined;
}
function cleanDef(raw: unknown): Forged | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Forged, seq = d.seq;
  if (!Number.isInteger(seq) || seq < 1 || !STATUSES.includes(d.status)) return undefined;
  if (d.kind !== "weapon" && d.kind !== "monster") return undefined;
  if (d.kind === "monster" && (!d.mult || typeof d.mult !== "object")) return undefined;
  const r = savedRecipe(recipeOf(d));
  if (!r) return undefined;
  const out = defFromRecipe(r, seq);
  if (out.id !== d.id) return undefined;
  out.status = d.status;
  return out;
}

/** A loaded forge save, whatever was stored: never throws; unreadable forgings are kept aside in `lost`. */
export function cleanForge(raw: unknown): ForgeSave {
  try {
    const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const s = fresh();
    const lost: unknown[] = [];
    const seen = new Set<number>();
    // forgings set aside by an earlier build are tried again: a later fix brings them back
    for (const x of [...(Array.isArray(r.defs) ? r.defs : []), ...(Array.isArray(r.lost) ? r.lost : [])]) {
      const d = cleanDef(x);
      if (d && !seen.has(d.seq)) { seen.add(d.seq); s.defs.push(d); } else lost.push(x);
    }
    const projects = (r.projects && typeof r.projects === "object" ? r.projects : {}) as Record<string, unknown>;
    for (const k of CLAN_KEYS) {
      const list = Array.isArray(projects[k]) ? (projects[k] as unknown[]) : [];
      for (const x of list) {
        const p = x as ForgeProject | null;
        const rec = p && typeof p === "object" ? validateRecipe(p.recipe) : undefined;
        if (!p || !rec?.ok || rec.recipe.clan !== k || !Number.isInteger(p.seq) || p.seq < 1 || seen.has(p.seq) || !isDay(p.day) || !isDay(p.liveDay)) { if (x) lost.push({ project: k, raw: x }); continue; }
        seen.add(p.seq);
        (s.projects[k] ??= []).push({ seq: p.seq, recipe: rec.recipe, day: p.day, liveDay: p.liveDay, at: isNum(p.at) ? p.at : 0, gate: p.gate === "pass" ? "pass" : "pending" });
      }
    }
    s.log = (Array.isArray(r.log) ? r.log : []).filter((e): e is ForgeLogEntry => !!e && typeof e === "object" && isNum((e as ForgeLogEntry).at) && typeof (e as ForgeLogEntry).text === "string")
      .slice(-FORGE.logMax);
    s.seq = Math.max(Number.isInteger(r.seq) && (r.seq as number) > 0 ? (r.seq as number) : 0, 0, ...seen);
    const dl = r.daily as ForgeSave["daily"];
    if (dl && isDay(dl.day) && isDay(dl.n)) s.daily = { day: dl.day, n: dl.n };
    if (r.killed === true) s.killed = true;
    if (lost.length) s.lost = lost.slice(-LOST_MAX);
    return s;
  } catch {
    return fresh();
  }
}

// ---- State --------------------------------------------------------------------------------------------------------

let kv: Kv | undefined;
let save: ForgeSave = fresh();
let ver = 1;
let timer: NodeJS.Timeout | undefined;
const mobs = new Map<string, ForgedMob>();
const listeners = new Set<(p: ForgePack) => void>();
const envKill = () => process.env.FORGE_KILL === "1";

/** Every change of the registry ends here: the gear lookup (and both caches), the monster index, the pack, the rooms. */
function rebuild() {
  setForgedGear(forgeLookup(save.defs.filter((d): d is ForgedWeapon => d.kind === "weapon")));
  mobs.clear();
  for (const d of save.defs) if (d.kind === "monster") mobs.set(d.id, d);
  ver++;
  const pack = packFor();
  listeners.forEach((f) => { try { f(pack); } catch (e) { console.error("Forge listener:", e); } });
}

/** Forge saves run one after another, each writing the forge as it stands then (never two writes in flight). */
let saving: Promise<void> = Promise.resolve();
function persist(): Promise<void> {
  const write = async () => { if (kv) await kv.set(KEY, save).catch((e) => console.error("Forge: could not save:", e)); };
  saving = saving.then(write, write);
  return saving;
}
function log(e: Omit<ForgeLogEntry, "at"> & { at?: number }) {
  save.log.push({ at: Date.now(), ...e });
  if (save.log.length > FORGE.logMax) save.log.splice(0, save.log.length - FORGE.logMax);
  if (!process.env.NODE_TEST_CONTEXT) console.log(`Forge: ${e.text}`);
}

/** Herald lines waiting for the next war tick's news (server/war.ts step: news.forge). */
const news: { clan: ClanKey; text: string }[] = [];
export const takeForgeNews = () => news.splice(0);
/** The Herald's plain-text line for a forge moment: a lead commission, a forging gone live, a gate failed. */
export function forgeLine(moment: "burning" | "live" | "failed", clan: ClanKey, name: string, kind: "weapon" | "monster"): string {
  const c = CLANS[clan].name;
  if (moment === "burning") return `The forges of ${c} are burning: its smiths work on a new ${kind === "weapon" ? "weapon" : "beast"}.`;
  if (moment === "live") return `${c} has forged ${name}! ${kind === "weapon" ? "The blade is sold in its capital and dropped by its beasts." : "The beast now walks in its lands."}`;
  return `The forge of ${c} failed: ${name} did not survive its trials.`;
}

/** The current war day (undefined before the war is loaded: then nothing goes live). */
const today = (): number | undefined => { const s = warState(); return s ? warDay(s.tick) : undefined; };

/** Loads the forge (before the server listens: saves with forged items need the registry) and starts its clock. */
export async function initForge(store?: Kv) {
  kv = store ?? (await openKv());
  const got = await kv.get<unknown>(KEY);
  save = cleanForge(got);
  if (got !== undefined && (!got || typeof got !== "object" || Array.isArray(got))) {
    await kv.set(`${KEY}-old-${Date.now()}`, got); // a forge that cannot be read at all: kept aside, not lost
    console.log("Forge: the saved forge cannot be read, a new registry begins (old one kept)");
  }
  rebuild();
  for (const k of CLAN_KEYS) for (const p of save.projects[k] ?? []) if (p.gate === "pending") startGate(k, p);
  if (envKill()) console.log("Forge: FORGE_KILL=1, the forge is off");
  console.log(`Forge: ${save.defs.length} forgings (${save.defs.filter((d) => d.status === "active").length} live)`);
  if (timer) clearInterval(timer);
  timer = setInterval(() => { try { forgeClock(); } catch (e) { console.error("Forge: clock failed:", e); } }, 15_000);
  timer.unref?.();
}
/** Last write while shutting down (blocking where the store can). */
export function flushForge() { if (kv?.setSync) try { kv.setSync(KEY, save); } catch (e) { console.error("Forge: could not save:", e); } }

// ---- Commissions, research, the gate --------------------------------------------------------------------------------

export type CommissionResult = { ok: true; seq?: number; liveDay?: number } | { ok: false; code: string; msg: string };

/**
 * Clan `clan` orders a forging for war day `day` (PR4: a council's order). `shadow`: only logged, nothing spent or made.
 * `lead`: validated, paid, gated in the background, live FORGE.researchDays later. Never trusts `recipe`.
 */
export function commission(clan: unknown, recipe: unknown, day: unknown, mode: ForgeMode = "lead", now = Date.now()): CommissionResult {
  const no = (code: string, msg: string, k?: ClanKey): CommissionResult => {
    log({ at: now, kind: "refused", clan: k, day: isDay(day) ? day : undefined, text: `${k ? CLANS[k].name : "?"}: forging refused (${code}: ${msg})` });
    return { ok: false, code, msg };
  };
  if (!isClan(clan)) return no("bad_clan", `clan must be one of ${CLAN_KEYS.join(", ")}`);
  if (!isDay(day)) return no("bad_day", "day is a war day (a whole number from 0)", clan);
  if (forgeKilled()) return no("killed", "the forge is off", clan);
  const c = validateRecipe(recipe);
  if (!c.ok) return no(c.errors[0].code, c.errors.map((e) => e.msg).join("; "), clan);
  if (c.recipe.clan !== clan) return no("clan_mismatch", "the recipe is another clan's", clan);
  const name = CLANS[clan].name, what = `${c.recipe.kind} "${c.recipe.name}" on ${c.recipe.base}`;
  if (mode === "shadow") { log({ at: now, kind: "shadow", clan, day, text: `${name} would forge ${what} (shadow: nothing made)` }); void persist(); return { ok: true }; }
  const d = save.daily && save.daily.day === day ? save.daily : { day, n: 0 };
  if (d.n >= FORGE.perDay) return no("day_cap", `${FORGE.perDay} forgings a war day at most`, clan);
  save.daily = { day, n: d.n + 1 };
  const seq = ++save.seq, liveDay = day + FORGE.researchDays;
  const p: ForgeProject = { seq, recipe: c.recipe, day, liveDay, at: now, gate: "pending" };
  (save.projects[clan] ??= []).push(p);
  log({ at: now, kind: "commission", clan, day, id: idOf(p), text: `${name} commissioned ${what} (#${seq}, live on war day ${liveDay} if the gate passes)` });
  const spent = warSpendArmy(clan, FORGE.armyCost, now);
  log({ at: now, kind: "cost", clan, day, id: idOf(p), text: spent === undefined ? `${name}: no army spent (the war is not loaded)` : `${name} spent ${Math.round(spent)} men on the forging` });
  news.push({ clan, text: forgeLine("burning", clan, c.recipe.name, c.recipe.kind) });
  void persist();
  startGate(clan, p);
  return { ok: true, seq, liveDay };
}
const idOf = (p: ForgeProject) => (p.recipe.kind === "weapon" ? forgedGearId(p.seq, p.recipe.base) : forgedMobId(p.seq));

/** Gates run one after another (each takes a few seconds of CPU). */
let gating: Promise<void> = Promise.resolve();
function startGate(clan: ClanKey, p: ForgeProject) {
  const run = async () => {
    if (!(save.projects[clan] ?? []).includes(p)) return; // gone meanwhile (a reset)
    let v: GateVerdict;
    try { v = await runGate(defFromRecipe(p.recipe, p.seq)); } catch (e) { v = { ok: false, reasons: [`error: ${(e as Error)?.message ?? e}`] }; }
    gateDone(clan, p, v);
  };
  gating = gating.then(run, run);
}
function gateDone(clan: ClanKey, p: ForgeProject, v: GateVerdict) {
  const list = save.projects[clan] ?? [];
  if (!list.includes(p)) return;
  const name = CLANS[clan].name;
  if (v.ok) {
    p.gate = "pass";
    log({ kind: "gate_pass", clan, day: p.day, id: idOf(p), text: `${name}'s "${p.recipe.name}" passed the sim gate` });
    forgeClock();
  } else {
    list.splice(list.indexOf(p), 1);
    log({ kind: "gate_fail", clan, day: p.day, id: idOf(p), text: `${name}'s "${p.recipe.name}" failed the sim gate: ${v.reasons.slice(0, 5).join("; ")}` });
    news.push({ clan, text: forgeLine("failed", clan, p.recipe.name, p.recipe.kind) });
  }
  void persist();
}

let runner: GateRunner | undefined;
/** Tests: replace the gate (undefined: the real one). */
export function _setGateRunner(r?: GateRunner) { runner = r; }
/**
 * The sim gate on a forging. In the built server (server-dist/forgeGate.cjs next to this bundle) it runs in a worker
 * thread, killed after FORGE.gate.timeoutMs plus a margin; in dev and tests in this process. Fails closed: a forging
 * whose id doesn't match itself, a timeout, a crash or a strange answer are all a fail.
 */
export async function runGate(def: Forged): Promise<GateVerdict> {
  const bad = idProblem(def);
  if (bad) return { ok: false, reasons: [bad] };
  if (runner) return runner(def);
  const file = path.join(__dirname, "forgeGate.cjs");
  if (fs.existsSync(file)) return inWorker(file, def, FORGE.gate.timeoutMs);
  // (dev and tests: the sims straight from the source; the path is not spelled out, so the bundle never carries them)
  const src = "../tools/balance/forgeGate";
  const { forgeGate } = (await import(src)) as typeof import("../tools/balance/forgeGate");
  const r = forgeGate(def);
  return { ok: r.ok, reasons: r.reasons };
}
function idProblem(def: Forged): string | undefined {
  if (def.kind === "weapon") {
    const p = parseForgedGearId(def.id);
    return !p || p.seq !== def.seq || p.base !== def.base ? `bad_id: ${def.id} is not forging ${def.seq} on ${def.base}` : undefined;
  }
  return parseForgedMobId(def.id) !== def.seq ? `bad_id: ${def.id} is not monster forging ${def.seq}` : undefined;
}
function inWorker(file: string, def: Forged, timeoutMs: number): Promise<GateVerdict> {
  return new Promise((resolve) => {
    let done = false, w: Worker | undefined;
    const finish = (v: GateVerdict) => {
      if (done) return;
      done = true; clearTimeout(t);
      w?.terminate().catch(() => {});
      resolve(v);
    };
    const t = setTimeout(() => finish({ ok: false, reasons: [`timeout: the gate took over ${timeoutMs} ms`] }), timeoutMs + 5000);
    t.unref?.();
    try { w = new Worker(file, { workerData: { def } }); } catch (e) { finish({ ok: false, reasons: [`error: ${(e as Error)?.message ?? e}`] }); return; }
    w.on("message", (r: unknown) => {
      const v = r as GateVerdict;
      finish(v && typeof v === "object" && typeof v.ok === "boolean" && Array.isArray(v.reasons) ? { ok: v.ok, reasons: v.reasons.map(String) } : { ok: false, reasons: ["error: the gate gave no verdict"] });
    });
    w.on("error", (e) => finish({ ok: false, reasons: [`error: ${e?.message ?? e}`] }));
    w.on("exit", (code) => finish({ ok: false, reasons: [`error: the gate stopped (${code})`] }));
  });
}

/** Research done: projects that passed the gate go live on their day. Runs every 15 s and after each gate. */
export function forgeClock(day = today()) {
  if (day === undefined || forgeKilled()) return;
  const due: [ClanKey, ForgeProject][] = [];
  for (const k of CLAN_KEYS) for (const p of save.projects[k] ?? []) if (p.gate === "pass" && day >= p.liveDay) due.push([k, p]);
  if (!due.length) return;
  for (const [k, p] of due) {
    const list = save.projects[k]!;
    list.splice(list.indexOf(p), 1);
    goLive(defFromRecipe(p.recipe, p.seq), day);
    news.push({ clan: k, text: forgeLine("live", k, p.recipe.name, p.recipe.kind) });
  }
  rebuild();
  void persist();
}
/** A forging enters the registry; past FORGE.perClan live ones of its kind, the clan's oldest retires. (Caller rebuilds.) */
function goLive(def: Forged, day?: number) {
  save.defs.push(def);
  const name = CLANS[def.clan].name;
  log({ kind: "live", clan: def.clan, day, id: def.id, text: `${name}'s ${def.kind} "${def.name}" is forged (${def.id})` });
  const mine = save.defs.filter((d) => d.clan === def.clan && d.kind === def.kind && d.status === "active").sort((a, b) => a.seq - b.seq);
  for (const old of mine.slice(0, Math.max(0, mine.length - FORGE.perClan[def.kind]))) {
    old.status = "retired";
    log({ kind: "retire", clan: old.clan, day, id: old.id, text: `${name}'s "${old.name}" retires (a newer forging took its place)` });
  }
}

// ---- Admin ------------------------------------------------------------------------------------------------------------

const defById = (id: string) => save.defs.find((d) => d.id === id);
/** No new copies (items and living monsters keep their stats). */
export function retireForged(id: string): boolean {
  const d = defById(id);
  if (!d || d.status !== "active") return false;
  d.status = "retired";
  log({ kind: "retire", clan: d.clan, id, text: `"${d.name}" (${id}) retired by an admin` });
  rebuild(); void persist();
  return true;
}
/** Back to the base's stats everywhere (names kept); rooms recompute their heroes' stats. */
export function revokeForged(id: string): boolean {
  const d = defById(id);
  if (!d || d.status === "revoked") return false;
  d.status = "revoked";
  log({ kind: "revoke", clan: d.clan, id, text: `"${d.name}" (${id}) revoked: its items fall back to the base` });
  rebuild(); void persist();
  return true;
}
/** The kill switch: no forged spawns, drops, sales or commissions while on. */
export function killForge(on: boolean) {
  if (!!save.killed === on) return;
  if (on) save.killed = true; else delete save.killed;
  log({ kind: "kill", text: on ? "the forge was switched off" : "the forge was switched back on" });
  rebuild(); void persist();
}
export const forgeKilled = () => envKill() || !!save.killed;

/** The forge log's lines of war day `day` (the war digest's forge section). */
export const forgeDayLines = (day: number): string[] => save.log.filter((e) => e.day === day).map((e) => e.text);
/** The day's forge lines as one text (the admin view; no email). */
export function forgeDigest(day: number): string {
  const lines = forgeDayLines(day).map((t) => `- ${t}`);
  return lines.length ? `The Forge, war day ${day}:\n${lines.join("\n")}` : `The Forge, war day ${day}: nothing forged.`;
}
/** Clan k's side of the Forge for its council's briefing (shared/war/council.ts ForgeBriefCtx). */
export function forgeBrief(k: ClanKey, day: number): ForgeBriefCtx {
  const used = save.daily && save.daily.day === day ? save.daily.n : 0;
  const out: ForgeBriefCtx = {
    live: save.defs.filter((d) => d.clan === k && d.status === "active").map((d) => ({ id: d.id, kind: d.kind, name: d.name, base: d.base, palette: d.palette })),
    projects: (save.projects[k] ?? []).map((p) => ({ seq: p.seq, kind: p.recipe.kind, name: p.recipe.name, base: p.recipe.base, day: p.day, liveDay: p.liveDay, gate: p.gate })),
    leftToday: Math.max(0, FORGE.perDay - used),
  };
  if (forgeKilled()) out.killed = true;
  return out;
}
/** Is the forge's own 15 s clock running (initForge)? If not, the war councils' clock drives forgeClock. */
export const forgeTicking = () => !!timer;
export function forgeAdmin(n = 50) {
  const d = today();
  return {
    killed: forgeKilled(), envKill: envKill(), seq: save.seq, day: d,
    defs: save.defs.map((x) => ({ id: x.id, kind: x.kind, clan: x.clan, name: x.name, status: x.status })),
    projects: save.projects, lost: save.lost?.length ?? 0, log: save.log.slice(-n),
    digest: d !== undefined && d > 0 ? forgeDigest(d - 1) : undefined,
  };
}
/** GET /admin/forge (state and log), POST /admin/forge?kill=1|0&retire=<id>&revoke=<id>: behind index.ts's admin key. */
export function mountForgeAdmin(app: Express, ok: (req: Request) => boolean) {
  app.get("/admin/forge", (req, res) => {
    if (!ok(req)) { res.sendStatus(404); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json(forgeAdmin());
  });
  app.post("/admin/forge", (req, res) => {
    if (!ok(req)) { res.sendStatus(404); return; }
    const q = req.query, done: Record<string, boolean> = {};
    if (q.kill === "1" || q.kill === "0") killForge(q.kill === "1");
    if (typeof q.retire === "string" && FORGE_ID_RE.test(q.retire)) done.retired = retireForged(q.retire);
    if (typeof q.revoke === "string" && FORGE_ID_RE.test(q.revoke)) done.revoked = revokeForged(q.revoke);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...done, ...forgeAdmin(10) });
  });
}

// ---- What the game asks -----------------------------------------------------------------------------------------------

/** A forged monster by id, any status (callers check it). */
export const forgedMobById = (id: string): ForgedMob | undefined => mobs.get(id);
/** Clan k's live forged monsters (none while the forge is off). */
export function liveMobsOf(k: ClanKey): ForgedMob[] {
  if (forgeKilled()) return [];
  const out: ForgedMob[] = [];
  for (const m of mobs.values()) if (m.clan === k && m.status === "active") out.push(m);
  return out;
}
const liveWeaponsOf = (k: ClanKey): ForgedWeapon[] =>
  forgeKilled() ? [] : liveWeapons(save.defs, k);
/** A forged monster's drop: one of its clan's live forged weapons (FORGE.dropChance), at the monster's level, rolled like any find. */
export function forgedDrop(k: ClanKey, level: number, rnd: () => number = Math.random): string | undefined {
  const list = liveWeaponsOf(k);
  if (!list.length || rnd() >= FORGE.dropChance) return undefined;
  return rollAffixes(withLevel(list[Math.floor(rnd() * list.length)].id, level), 1, rnd);
}
/** The base ids clan k's capital quartermaster sells (shared/shops.ts shopWithForged). */
export const forgedStock = (k: ClanKey | string): string[] => (isClan(k) ? liveWeaponsOf(k).map((d) => d.id) : []);

/** The pack for clients: every live forging, or (ids) those asked for, any status. */
export function packFor(ids?: readonly string[]): ForgePack {
  const defs = ids ? save.defs.filter((d) => ids.includes(d.id)) : save.defs.filter((d) => d.status === "active");
  return { v: ver, defs: structuredClone(defs), ...(forgeKilled() ? { killed: true } : {}) };
}
/** Listen to every change of the registry (a room: re-send the pack, recompute stats). Returns the unsubscribe. */
export function onForge(f: (p: ForgePack) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
/** Checks a client's "forgeQ" ids: an array of 1-20 forged ids (weapon base ids or monster ids), else undefined. */
export function forgeQuery(msg: unknown): string[] | undefined {
  const ids = (msg as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 20) return undefined;
  if (!ids.every((x) => typeof x === "string" && x.length <= 60 && FORGE_ID_RE.test(x) && (x.startsWith("fm") || FORGED_GEAR_RE.test(x)))) return undefined;
  return [...new Set(ids as string[])];
}

// ---- Tests ------------------------------------------------------------------------------------------------------------

/** Tests: start over from this save (cleaned) and store (none: nothing written). */
export function _resetForge(raw?: unknown, store?: Kv) {
  save = cleanForge(raw); kv = store; runner = undefined; gating = Promise.resolve(); news.length = 0;
  if (timer) { clearInterval(timer); timer = undefined; }
  rebuild();
}
/** Tests only (no route or message reaches it): commission and force a recipe live at once, no cost, no gate. */
export function _forgeNow(recipe: unknown): Forged {
  const c = validateRecipe(recipe);
  if (!c.ok) throw new Error(c.errors.map((e) => e.code).join(", "));
  const def = defFromRecipe(c.recipe, ++save.seq);
  goLive(def);
  rebuild();
  return def;
}
/** Tests: wait for the gates queued so far. */
export const _gatesDone = () => gating;
export const _forgeSave = () => save;
