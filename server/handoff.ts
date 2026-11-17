// Seamless updates: where each hero stood when they left, so coming back puts them right there again.
// Every deploy restarts the server. Before, a returning hero was dropped on the market square with full health,
// out of their group. Now the server remembers each hero's spot, facing, health, mana, stamina and group when
// they leave (or when the server shuts down for an update), keeps it for a few minutes, and writes it next to
// the saves on shutdown so the new server picks it up. A dropped connection uses the same memory.
// Ages (shared store, useHandoffKv): each spot is also kv row `handoff:<account>:<class>`, written when the hero leaves
// and taken (read and deleted at once) when they log in on any server, so a hero moving between servers, or across a
// deploy, comes back where they stood. Rows older than HANDOFF_MS are ignored and pruned. JSON mode: the file, as before.
import fs from "node:fs";
import path from "node:path";
import type { Kv } from "./store";

export interface LiveState {
  x: number; y: number; dir: string;
  hp: number; mana: number; energy: number;
  /** Names of the other heroes in this hero's group (empty when solo). */
  group: string[];
  at: number;
}

/** How long a hero's spot is kept after they left (a deploy takes well under a minute). */
export const HANDOFF_MS = 5 * 60_000;

const FILE = path.join(path.dirname(path.resolve(process.env.SAVE_FILE ?? path.join(__dirname, "../data/saves.json"))), "handoff.json");
const live = new Map<string, LiveState>();
const key = (name: string, cls: string) => `${name.trim().toLowerCase()}:${cls}`;

// Spots left by the previous server (read once at start, then the file is removed so it is never used twice)
try {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, LiveState>;
  const now = Date.now();
  for (const [k, v] of Object.entries(raw)) if (v && now - v.at < HANDOFF_MS) live.set(k, v);
  fs.rmSync(FILE, { force: true });
  if (live.size) console.log(`Handoff: ${live.size} hero(es) will come back where they stood`);
} catch (e: any) {
  if (e?.code !== "ENOENT") console.error("Could not read handoff file:", e);
}

export function rememberLive(name: string, cls: string, s: Omit<LiveState, "at">) {
  const v = { ...s, at: Date.now() };
  live.set(key(name, cls), v);
  if (kv) track(kv.set(KV + key(name, cls), v));
}

let kv: Kv | undefined;
const KV = "handoff:";
/** kv writes under way (shutdown waits for them). */
const writes = new Set<Promise<unknown>>();
function track(p: Promise<unknown>) {
  const w = p.catch((e) => console.error("Could not write a handoff spot:", e?.message ?? e)).finally(() => writes.delete(w));
  writes.add(w);
}
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
/** A spot read from the shared store (another server's: never trusted), or undefined. */
export function cleanLive(raw: unknown): LiveState | undefined {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  if (!r || ![r.x, r.y, r.hp, r.mana, r.energy, r.at].every(num) || typeof r.dir !== "string" || r.dir.length > 16) return undefined;
  const group = Array.isArray(r.group) ? r.group.filter((g): g is string => typeof g === "string" && g.length <= 64).slice(0, 16) : [];
  return { x: r.x as number, y: r.y as number, dir: r.dir, hp: r.hp as number, mana: r.mana as number, energy: r.energy as number, group, at: r.at as number };
}

/**
 * Shared store (DATABASE_URL): spots go to kv too (a store without `take` is ignored). Old rows are pruned. `undefined`:
 * back to the file only (tests).
 */
export async function useHandoffKv(store: Kv | undefined) {
  kv = store?.take ? store : undefined;
  if (kv) await pruneHandoff();
}
/** Deletes the shared spots that ran out (nobody came back for them). */
export async function pruneHandoff(now = Date.now()) {
  if (!kv?.list || !kv.del) return;
  try {
    const rows = await kv.list<unknown>(KV), old = Object.entries(rows).filter(([, v]) => { const s = cleanLive(v); return !s || now - s.at >= HANDOFF_MS; }).map(([k]) => k);
    if (old.length) await kv.del(old);
  } catch (e: any) { console.error("Could not prune the handoff spots:", e?.message ?? e); }
}

/**
 * Before a hero joins (TownRoom onAuth, after the account is this server's): takes their spot from the shared store, if
 * any, so takeLive finds it. The newer of it and this server's own memory wins. Never throws (a login does not wait on it).
 */
export async function fetchLive(name: string, cls: string): Promise<void> {
  if (!kv?.take) return;
  try {
    const k = key(name, cls), got = cleanLive(await kv.take(KV + k)), mine = live.get(k);
    if (got && Date.now() - got.at < HANDOFF_MS && (!mine || got.at > mine.at)) live.set(k, got);
  } catch (e: any) { console.error("Could not read a handoff spot:", e?.message ?? e); }
}

/** The spot this hero left from, if it is recent (used once). */
export function takeLive(name: string, cls: string): LiveState | undefined {
  const k = key(name, cls);
  const s = live.get(k);
  live.delete(k);
  return s && Date.now() - s.at < HANDOFF_MS ? s : undefined;
}

/** Forget a hero's spot (New game). */
export function dropLive(name: string, cls: string) {
  live.delete(key(name, cls));
  if (kv?.del) track(kv.del([KV + key(name, cls)]));
}

/**
 * Write every remembered spot to disk for the next server (called while shutting down). Shared store: the spots went to
 * kv as the heroes left; this waits for those writes.
 */
export function writeHandoff(): Promise<void> {
  if (kv) return Promise.all([...writes]).then(() => {});
  const now = Date.now();
  const out: Record<string, LiveState> = {};
  live.forEach((v, k) => { if (now - v.at < HANDOFF_MS) out[k] = v; });
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(out));
    fs.renameSync(FILE + ".tmp", FILE);
  } catch (e) {
    console.error("Could not write handoff file:", e);
  }
  return Promise.resolve();
}
