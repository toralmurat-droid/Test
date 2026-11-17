import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TIDE } from "../shared/tide";
import { AgeQueue, sameDrained, type Drained } from "./ageQueue";
import { LEASE, Leases } from "./lease";
import { openKv, postgresStore, type Kv, type Store } from "./store";

/**
 * State of the world that belongs to no hero and must survive a restart: for now the Gloam Tide's meter (server/tide.ts).
 * JSON file (WORLD_FILE; default world.json next to SAVE_FILE, else data/world.json), written like the idea log (a temp
 * file renamed over the old one); with DATABASE_URL a "world" table of the same shape as the accounts table, one row.
 * Until initWorld() runs (tests, the bench) it lives in memory only and nothing is written.
 * Several servers on one Postgres (Ages, a deploy's overlap): only the holder of lease `lease:world` (server/lease.ts; a
 * primary Age) writes the row, and on taking the lease over it first reloads what the last holder wrote. The others
 * (followers) reload the row every LEASE.renewMs and queue their heroes' blob kills (kv `world-tide:<holder>`,
 * server/ageQueue.ts); the owner adds them to the meter once (by `drained`, written with the meter).
 */
export interface WorldState {
  v: 1;
  /** Blob kills toward the next march (0..TIDE.goal). */
  tide: number;
  /** When the next march sets out (server time, ms); none while the meter fills or a march is under way. */
  marchAt?: number;
  /** Marches so far. */
  marches: number;
  /** Ages (M5): a stamp of the write (unique per write), so a server regaining the lease knows whether anyone else wrote. Optional. */
  wrote?: string;
  /** Ages (M5): per following server (holder id), the last batch of its Tide kill queue counted into `tide`. Optional. */
  drained?: Drained;
}

const FILE = path.resolve(process.env.WORLD_FILE
  ?? (process.env.SAVE_FILE ? path.join(path.dirname(path.resolve(process.env.SAVE_FILE)), "world.json") : path.join(__dirname, "../data/world.json")));
const KEY = "world";
/** How often a changed world is written (it changes with every blob kill, so not on every change). */
const FLUSH_MS = 10_000;

const fresh = (): WorldState => ({ v: 1, tide: 0, marches: 0 });
const int = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

/** A loaded world, whatever was in the file: bad or missing fields fall back to their defaults (v 1 is the first version). */
export function cleanWorld(raw: unknown): WorldState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const w: WorldState = { v: 1, tide: int(r.tide, 1e9), marches: int(r.marches, 1e9) };
  if (typeof r.marchAt === "number" && Number.isFinite(r.marchAt) && r.marchAt > 0) w.marchAt = Math.floor(r.marchAt);
  if (typeof r.wrote === "string" && r.wrote.length <= 100) w.wrote = r.wrote;
  if (r.drained && typeof r.drained === "object") {
    const d: Drained = {};
    for (const [h, n] of Object.entries(r.drained as Record<string, unknown>)) if (h.length <= 200 && typeof n === "number" && Number.isInteger(n) && n > 0) d[h] = n;
    if (Object.keys(d).length) w.drained = d;
  }
  return w;
}

let state: WorldState = fresh();
let pg: Store<WorldState> | undefined;
let live = false, dirty = false, writing: Promise<void> | undefined;
const LEASE_KEY = "lease:world";
let lease: Leases | undefined, mine = false;
/** Ages: the kv of the follower queues (shared store only), the queue, and blob kills here not yet written to it. */
let kv: Kv | undefined;
const TIDE_Q = new AgeQueue<{ kills: number }>("world-tide:", (b) => (typeof b.kills === "number" && Number.isInteger(b.kills) && b.kills > 0 ? { kills: Math.min(b.kills, TIDE.goal) } : undefined));
let pendingKills = 0;
/** This server showed another server's world since it last owned it (its meter then holds kills not counted yet: reload on taking over). */
let followed = false;
/** Stamps of the rows this process wrote, and the row it loaded (NONE: one without a stamp). Trimmed to the last 64. */
const ours = new Set<string>(), NONE = "-";
const own = (w: WorldState) => ours.has(w.wrote ?? NONE);
function stamp(): string {
  const id = randomUUID();
  ours.add(id);
  if (ours.size > 64) ours.delete(ours.values().next().value!);
  return id;
}

/** The world state (the same object until a restart: change it in place, then call worldChanged). */
export function world(): WorldState { return state; }
export function worldChanged() { dirty = true; }
/** Ages: another server owns the world (a shared store, this one does not hold its lease): the Tide queues its kills. */
export const worldFollows = (): boolean => live && !!lease?.shared && !mine;
/** Ages: a blob kill on a follower, for the owner's meter (written to this server's queue at the next beat). */
export function queueTideKill() { if (pendingKills < TIDE.goal) pendingKills++; }

/** The owner: blob kills from the queues fill the meter like kills here (not while it is full or a march is called). */
function addKills(n: number) {
  if (!(n > 0) || state.marchAt !== undefined || state.tide >= TIDE.goal) return;
  state.tide = Math.min(TIDE.goal, state.tide + n);
  dirty = true;
}

function readFile(): WorldState {
  try {
    return cleanWorld(JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch (e: any) {
    if (e?.code !== "ENOENT") console.error("Could not read the world file, starting a new one:", e?.message);
    return fresh();
  }
}
function writeFile() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE); // never leaves a half-written file
}

/** Loads the world (Postgres when DATABASE_URL is set) and starts writing it every FLUSH_MS when it changed. */
export async function initWorld() {
  const url = process.env.DATABASE_URL;
  if (url) {
    pg = await postgresStore<WorldState>(url, undefined, "world");
    state = cleanWorld((await pg.load())[KEY]);
    kv = await openKv(url);
  } else state = readFile();
  ours.add(state.wrote ?? NONE);
  lease = new Leases(kv?.leases).want(LEASE_KEY);
  await lease.renew();
  mine = lease.held(LEASE_KEY);
  live = true;
  setInterval(() => { if (dirty) void flushWorld(); }, FLUSH_MS).unref();
  if (lease.shared) setInterval(() => { void claimWorld(); }, LEASE.renewMs).unref();
}

/**
 * Renews the world's lease. On taking it (back): when another server wrote the row since this one last wrote or loaded
 * it, reloads it in place (callers keep `world()`) and drops what was not saved here; when nobody did (this server lost
 * the lease to a database outage, say), keeps its own world, unsaved progress and all.
 */
async function claimWorld() {
  if (!lease) return;
  await lease.renew();
  const now = lease.held(LEASE_KEY);
  if (now && !mine && pg) {
    try {
      const raw = await loadRow(), got = cleanWorld(raw);
      if (raw === undefined || (own(got) && !followed)) console.log("World: the world's lease is back and nobody wrote the world meanwhile (unsaved progress kept)");
      else {
        replace(got);
        ours.add(got.wrote ?? NONE);
        dirty = false;
        console.log("World: took over the world's writes (reloaded the world another server saved)");
      }
    } catch (e: any) { console.error("World: could not reload on taking over, not writing yet:", e?.message ?? e); return; }
    followed = false;
    const n = pendingKills; pendingKills = 0; addKills(n); // (kills here not queued yet: counted at once)
  } else if (!now && mine) console.log("World: lost the world's lease (another server holds it, or the database cannot be reached): not writing");
  mine = now;
  if (mine) await drainKills();
  else await followWorld();
}
const loadRow = () => (pg!.loadOne ? pg!.loadOne(KEY) : pg!.load().then((r) => r[KEY]));
/** The world as another server saved it, in place (callers keep `world()`). */
function replace(got: WorldState) {
  delete state.marchAt; delete state.wrote; delete state.drained;
  Object.assign(state, got);
}
/** The owner, every beat: the followers' blob kills into the meter, once (their marks written with it). */
async function drainKills() {
  if (!kv) return;
  const before = state.drained;
  const d = await TIDE_Q.drain(kv, before, (b) => addKills(b.kills));
  if (!d || !mine || sameDrained(d, before)) return;
  if (Object.keys(d).length) state.drained = d; else delete state.drained;
  dirty = true;
  await flushWorld();
}
/**
 * A follower, every beat: writes its kills since the last beat to its queue and shows the owner's world, plus its own
 * kills the owner has not counted yet (the meter as it will be).
 */
async function followWorld() {
  if (!kv || !pg || !lease) return;
  try {
    const raw = await loadRow();
    if (mine) return;
    if (raw !== undefined) { replace(cleanWorld(raw)); followed = true; }
    const n = pendingKills; pendingKills = 0;
    const seen = state.drained?.[lease.holder] ?? 0;
    await TIDE_Q.push(kv, lease.holder, seen, n ? { kills: n } : undefined);
    const ahead = TIDE_Q.unseen(seen).reduce((a, b) => a + b.kills, 0);
    if (ahead && state.marchAt === undefined && state.tide < TIDE.goal) state.tide = Math.min(TIDE.goal, state.tide + ahead);
  } catch (e: any) { console.error("World: could not follow the world:", e?.message ?? e); }
}
/** Tests: a world store and lease of their own (no Postgres), as initWorld would set them up. */
export function _setupWorld(store: Store<WorldState>, l: Leases, s: WorldState, queues?: Kv) {
  pg = store; lease = l.want(LEASE_KEY); state = s; dirty = false; live = true; writing = undefined;
  kv = queues; pendingKills = 0; followed = false; TIDE_Q.reset();
  ours.clear(); ours.add(s.wrote ?? NONE); mine = lease.held(LEASE_KEY);
}
/** Tests: one lease beat (claimWorld). */
export const _claimWorld = () => claimWorld();

/** Writes the world if it changed (one write at a time). */
export async function flushWorld() {
  if (!live || !dirty || !(lease?.held(LEASE_KEY) ?? true) || !mine) return;
  if (writing) return writing;
  dirty = false;
  const snap = structuredClone(state);
  if (pg) snap.wrote = stamp();
  writing = (async () => {
    try {
      if (pg) await pg.save({ [KEY]: snap }, {});
      else writeFile();
    } catch (e: any) {
      dirty = true;
      console.error("Could not save the world:", e?.message ?? e);
    } finally { writing = undefined; }
  })();
  return writing;
}

/** Last write while shutting down: waits for one under way, then writes what is left. */
export async function flushWorldFinal() {
  if (!live) return;
  if (writing) await writing;
  await flushWorld();
  if (!mine && kv && lease?.shared && pendingKills) { // (a follower: its last kills to its queue)
    const n = pendingKills; pendingKills = 0;
    await TIDE_Q.push(kv, lease.holder, state.drained?.[lease.holder] ?? 0, { kills: n }).catch(() => {});
  }
  await lease?.release(); // (the next server takes the world over at once, reloading what was just written)
  mine = false;
}
