// Seamless updates: where each hero stood when they left, so coming back puts them right there again.
// Every deploy restarts the server. Before, a returning hero was dropped on the market square with full health,
// out of their group. Now the server remembers each hero's spot, facing, health, mana, stamina and group when
// they leave (or when the server shuts down for an update), keeps it for a few minutes, and writes it next to
// the saves on shutdown so the new server picks it up. A dropped connection uses the same memory.
import fs from "node:fs";
import path from "node:path";

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
  live.set(key(name, cls), { ...s, at: Date.now() });
}

/** The spot this hero left from, if it is recent (used once). */
export function takeLive(name: string, cls: string): LiveState | undefined {
  const k = key(name, cls);
  const s = live.get(k);
  live.delete(k);
  return s && Date.now() - s.at < HANDOFF_MS ? s : undefined;
}

/** Forget a hero's spot (New game). */
export function dropLive(name: string, cls: string) { live.delete(key(name, cls)); }

/** Write every remembered spot to disk for the next server (called while shutting down). */
export function writeHandoff() {
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
}
