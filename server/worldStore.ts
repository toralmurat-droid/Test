import fs from "node:fs";
import path from "node:path";
import { postgresStore, type Store } from "./store";

/**
 * State of the world that belongs to no hero and must survive a restart: for now the Gloam Tide's meter (server/tide.ts).
 * JSON file (WORLD_FILE; default world.json next to SAVE_FILE, else data/world.json), written like the idea log (a temp
 * file renamed over the old one); with DATABASE_URL a "world" table of the same shape as the accounts table, one row.
 * Until initWorld() runs (tests, the bench) it lives in memory only and nothing is written.
 */
export interface WorldState {
  v: 1;
  /** Blob kills toward the next march (0..TIDE.goal). */
  tide: number;
  /** When the next march sets out (server time, ms); none while the meter fills or a march is under way. */
  marchAt?: number;
  /** Marches so far. */
  marches: number;
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
  return w;
}

let state: WorldState = fresh();
let pg: Store<WorldState> | undefined;
let live = false, dirty = false, writing: Promise<void> | undefined;

/** The world state (the same object until a restart: change it in place, then call worldChanged). */
export function world(): WorldState { return state; }
export function worldChanged() { dirty = true; }

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
  } else state = readFile();
  live = true;
  setInterval(() => { if (dirty) void flushWorld(); }, FLUSH_MS).unref();
}

/** Writes the world if it changed (one write at a time). */
export async function flushWorld() {
  if (!live || !dirty) return;
  if (writing) return writing;
  dirty = false;
  const snap = structuredClone(state);
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
}
