import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { emptyLog, IdeaLog, score, submit, tick, vote, voters, type Asker, type Idea, type Result } from "../shared/ideas";
import { AgeQueue, sameDrained, type Drained } from "./ageQueue";
import { LEASE, Leases } from "./lease";
import type { Kv } from "./store";

/**
 * The idea log lives in one JSON file so it survives restarts (data/ideas.json, or IDEAS_FILE).
 * Network addresses are only stored hashed.
 * Ages (roadmap M5, shared store: initIdeas): the log is kv row `ideas`, written only by the holder of lease
 * `lease:ideas`, which also decides the hourly rounds. Other servers show the row (reloaded every LEASE.renewMs) and
 * queue their heroes' ideas and votes (kv `ideas-q:<holder>`, server/ageQueue.ts); the owner applies each once.
 */
const FILE = path.resolve(process.env.IDEAS_FILE ?? path.join(__dirname, "../data/ideas.json"));

function load(): IdeaLog {
  try {
    const log = JSON.parse(fs.readFileSync(FILE, "utf8")) as IdeaLog;
    if (Array.isArray(log.ideas)) return { ...emptyLog(), ...log };
  } catch (e: any) {
    if (e?.code !== "ENOENT") console.error("Could not read the idea log, starting a new one:", e?.message);
  }
  return emptyLog();
}

export const ideaLog: IdeaLog = load();

let timer: NodeJS.Timeout | undefined;
/** Saves soon (several changes in a row are written once). */
export function saveIdeas() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    if (kv) { void writeRow(); return; } // (Ages: the kv row, the owner only)
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(ideaLog, null, 1));
      fs.renameSync(tmp, FILE); // never leaves a half-written file
    } catch (e: any) {
      console.error("Could not save the idea log:", e?.message);
    }
  }, 500);
}

const SALT = process.env.IDEAS_SALT ?? "pixel-town-ideas";
export const hashAddr = (addr?: string) => (addr ? crypto.createHash("sha256").update(SALT + addr).digest("hex").slice(0, 16) : undefined);

/** The public log (no voter details), served at /ideas.json for Murat and for later tools. */
export function publicLog() {
  return ideaLog.ideas.map((i) => ({
    id: i.id, date: new Date(i.createdAt).toISOString(), author: i.author, text: i.text, status: i.status,
    score: score(i), voters: voters(i), wonAt: i.wonAt ? new Date(i.wonAt).toISOString() : undefined, reason: i.reason,
  })).reverse();
}

// ---- Ages: the shared idea log ----------------------------------------------------------------------------------------

/** What a follower's hero did: ["s", asker, text, at] an idea, ["v", asker, id, vote, at] a vote. */
type IdeaAct = ["s", Asker, string, number] | ["v", Asker, number, number, number];
const str = (x: unknown, max: number) => (typeof x === "string" && x.length <= max ? x : undefined);
function cleanAsker(a: unknown): Asker | undefined {
  const r = a && typeof a === "object" ? (a as Record<string, unknown>) : undefined, name = str(r?.name, 64), addr = r?.addr === undefined ? undefined : str(r.addr, 64);
  if (!r || !name || typeof r.level !== "number" || !Number.isFinite(r.level) || (r.addr !== undefined && !addr)) return undefined;
  return { name, level: r.level, ...(addr ? { addr } : {}) };
}
function cleanIdeaAct(a: unknown): IdeaAct[] {
  if (!Array.isArray(a)) return [];
  const who = cleanAsker(a[1]);
  if (!who) return [];
  if (a[0] === "s" && typeof a[2] === "string" && a[2].length <= 2000 && Number.isFinite(a[3])) return [["s", who, a[2], a[3]]];
  if (a[0] === "v" && Number.isInteger(a[2]) && a[2] > 0 && (a[3] === 1 || a[3] === -1 || a[3] === 0) && Number.isFinite(a[4])) return [["v", who, a[2], a[3], a[4]]];
  return [];
}
const IDEAS_Q = new AgeQueue<{ acts: IdeaAct[] }>("ideas-q:", (b) => (Array.isArray(b.acts) ? { acts: b.acts.flatMap(cleanIdeaAct) } : undefined));
const ROW = "ideas", LEASE_KEY = "lease:ideas", PENDING_MAX = 500;
/** The shared row: the log and the queue marks. */
type Row = IdeaLog & { drained?: Drained };

let kv: Kv | undefined;
let lease: Leases | undefined;
let mine = false, drained: Drained | undefined, seenRow = "", beat: NodeJS.Timeout | undefined, busy = false;
let pending: IdeaAct[] = [];
/** Bumped whenever the log changed under the rooms (another server's ideas or votes, a reload): rooms refresh the board. */
let ver = 0;
/** Ideas that won on the owner since a reload here (a follower's rooms announce them), by version. */
const wins: { ver: number; idea: Idea }[] = [];

/** True when another server keeps the idea log (this one shows its row and queues its heroes' ideas and votes). */
export const ideasFollow = () => !!kv && !mine;
/** For a room: the log's version, and the ideas that won elsewhere since version `since`. */
export const ideaNews = (since: number) => ({ ver, won: wins.filter((w) => w.ver > since).map((w) => w.idea) });

/** A hero's idea: on the owner (or without a shared store) into the log; on a follower checked here and queued. */
export function submitIdea(a: Asker, text: unknown, now = Date.now()): Result & { queued?: boolean } {
  if (!ideasFollow()) return submit(ideaLog, a, text, now);
  if (pending.length >= PENDING_MAX) return { ok: false, error: "The idea box is busy. Try again in a minute." };
  const r = localSubmit(a, text, now);
  if (r.ok) pending.push(["s", { ...a }, String(text), now]);
  return { ...r, queued: true };
}
/** A vote: as submitIdea. On a follower it shows here at once and reaches the owner with the next beat. */
export function voteIdea(a: Asker, id: number, v: number, now = Date.now()): Result & { queued?: boolean } {
  if (!ideasFollow()) return vote(ideaLog, a, id, v, now);
  if (pending.length >= PENDING_MAX) return { ok: false, error: "The idea box is busy. Try again in a minute." };
  const r = vote(ideaLog, a, id, v, now);
  if (r.ok && id > 0) pending.push(["v", { ...a }, id, v === 1 || v === -1 ? v : 0, now]);
  return { ...r, queued: true };
}
/** The hourly round: decided by the owner only (a follower hears the winners through ideaNews). */
export function ideaRoundNow(now = Date.now()) { return ideasFollow() ? { winners: [] as Idea[], expired: [] as Idea[] } : tick(ideaLog, now); }

/**
 * A follower's idea shown here at once (until the owner's row has it): checked against the log as this server knows
 * it, under a temporary negative id (never queued as a vote target), the daily limit noted.
 */
function localSubmit(a: Asker, text: unknown, now: number): Result {
  const probe: IdeaLog = { ...ideaLog, ideas: ideaLog.ideas, submitted: { ...ideaLog.submitted } };
  probe.nextId = -1 - ideaLog.ideas.filter((i) => i.id < 0).length;
  const r = submit(probe, a, text, now);
  if (r.ok) { ideaLog.submitted = probe.submitted; }
  return r;
}

/** An act from a queue (or this server's own, on taking over), applied to the log as if done here. */
function applyIdeaAct(a: IdeaAct, now: number) {
  const at = Math.min(now, Math.max(now - 3_600_000, a[a[0] === "s" ? 3 : 4] as number)); // (the hero's time, within the last hour)
  if (a[0] === "s") { const r = submit(ideaLog, a[1], a[2], at); if (r.ok) console.log(`Idea #${r.idea!.id} by ${r.idea!.author} (another server): ${r.idea!.text}`); }
  else vote(ideaLog, a[1], a[2], a[3], at);
}

/** Every key of the row but the marks, in place: the rooms and index.ts keep the same `ideaLog` object. */
function adopt(row: Row, announce = true) {
  const before = new Map(ideaLog.ideas.map((i) => [i.id, i.status]));
  const clean = { ...emptyLog(), ...row };
  ideaLog.nextId = Number.isInteger(clean.nextId) ? clean.nextId : 1;
  ideaLog.lastRound = Number.isFinite(clean.lastRound) ? clean.lastRound : ideaLog.lastRound;
  ideaLog.ideas = Array.isArray(clean.ideas) ? clean.ideas : [];
  ideaLog.submitted = clean.submitted && typeof clean.submitted === "object" ? clean.submitted : {};
  drained = row.drained;
  ver++;
  if (announce) for (const i of ideaLog.ideas) if (i.status === "won" && before.has(i.id) && before.get(i.id) !== "won") wins.push({ ver, idea: i });
  if (wins.length > 20) wins.splice(0, wins.length - 20);
}

async function writeRow() {
  if (!kv || !mine || !lease?.held(LEASE_KEY)) return;
  const row: Row = { ...ideaLog, ideas: ideaLog.ideas.filter((i) => i.id > 0), ...(drained && Object.keys(drained).length ? { drained } : {}) };
  await kv.set(ROW, row).catch((e) => console.error("Could not save the idea log:", e?.message ?? e));
}

/**
 * Shared store (DATABASE_URL): the log moves to kv row `ideas` (the file's log is copied there once, when the row does
 * not exist yet) and the lease beat starts. `leases`: tests. Without a shared store nothing changes (the file).
 */
export async function initIdeas(store: Kv, leases?: Leases) {
  kv = store;
  lease = (leases ?? new Leases(store.leases)).want(LEASE_KEY);
  if (store.insertIfAbsent && (await store.get(ROW)) === undefined) await store.insertIfAbsent(ROW, { ...ideaLog });
  mine = false; seenRow = ""; pending = [];
  await ideasBeat(Date.now());
  if (!leases) { beat = setInterval(() => { void ideasBeat(Date.now()); }, LEASE.renewMs); beat.unref?.(); }
}

/**
 * Every LEASE.renewMs: renew the lease. The owner (on taking over: reloads the row, then its own unsent acts) applies
 * every queue's new acts and writes the log with the marks; a follower reloads the row when it changed, puts its own
 * acts not counted yet back on top (shown here), and writes its queue.
 */
export async function ideasBeat(now = Date.now()) {
  if (!kv || !lease || busy) return;
  busy = true;
  try {
    await lease.renew();
    const held = lease.held(LEASE_KEY), raw = await kv.get<Row>(ROW), text = raw === undefined ? "" : JSON.stringify(raw);
    let took = false;
    if (held && !mine) { // taking over: the row as the last owner left it, then this server's acts not queued yet
      if (raw) adopt(raw, false);
      mine = true; took = true; seenRow = text;
      const own = pending; pending = [];
      for (const a of own) applyIdeaAct(a, now);
      console.log(`Ideas: ${lease.holder} keeps the idea log`);
    } else if (!held && mine) { mine = false; seenRow = ""; console.log("Ideas: lost the idea log's lease: following"); }
    if (mine) {
      const before = drained;
      const d = await IDEAS_Q.drain(kv, before, (b) => { for (const a of b.acts) applyIdeaAct(a, now); });
      const moved = !!d && !sameDrained(d, before);
      if (moved) { drained = d; ver++; }
      if (moved || took) await writeRow(); // (the rounds stay with the rooms' clock, which announces the winners)
    } else {
      if (raw && text !== seenRow) {
        adopt(raw, seenRow !== ""); seenRow = text; // (the first read after start or a lost lease: no old winners announced)
        const seen = drained?.[lease.holder] ?? 0;
        for (const b of IDEAS_Q.unseen(seen)) for (const a of b.acts) localApply(a, now);
        for (const a of pending) localApply(a, now);
      }
      const acts = pending; pending = [];
      await IDEAS_Q.push(kv, lease.holder, drained?.[lease.holder] ?? 0, acts.length ? { acts } : undefined);
    }
  } catch (e: any) { console.error("Ideas: beat failed:", e?.message ?? e); }
  finally { busy = false; }
}
/** A follower's own act shown on the reloaded row until the owner counts it. */
function localApply(a: IdeaAct, now: number) {
  if (a[0] === "s") localSubmit(a[1], a[2], now);
  else vote(ideaLog, a[1], a[2], a[3], now);
}

/** Shutting down: the owner writes once more and gives the lease back; a follower writes its last acts. */
export async function flushIdeas() {
  if (!kv || !lease) return;
  if (beat) clearInterval(beat);
  beat = undefined;
  if (timer) { clearTimeout(timer); timer = undefined; }
  if (mine) await writeRow();
  else if (pending.length) { const acts = pending; pending = []; await IDEAS_Q.push(kv, lease.holder, drained?.[lease.holder] ?? 0, { acts }).catch(() => {}); }
  mine = false;
  await lease.release();
}

/** Tests: back to the file mode with an empty log. */
export function _resetIdeas() {
  if (beat) clearInterval(beat);
  kv = undefined; lease = undefined; beat = undefined; mine = false; drained = undefined; seenRow = ""; pending = []; busy = false;
  wins.length = 0; ver = 0; IDEAS_Q.reset();
  Object.assign(ideaLog, emptyLog());
}
