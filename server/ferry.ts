import { FERRY_COMBAT_MS, FERRY_FEE, FERRY_RANGE, ferryOpen, ferryStopById, ferryStopNear } from "../shared/ferry";
import type { Quester } from "../shared/quests";

/**
 * Pell's ferry (shared/ferry.ts has the stops and the numbers): one "ferry" message {to: stop id} from a hero standing
 * at a stop rides to another for FERRY_FEE gold. Checked like a portal stone's "travel" (server/TownRoom.ts travel):
 * dead heroes, lantern carriers and heroes hit in the last FERRY_COMBAT_MS don't go. TownRoom rate-limits the
 * message and calls in through the small FerryHost below, so the room itself only gains the handler.
 */

/** The parts of a hero a ride reads and moves (TownRoom's Player). */
export type FerryHero = Quester & {
  x: number; y: number; dead: boolean; gold: number; lastHurt: number;
  moving: boolean; rollUntil: number; rolling: boolean; emote: string;
};
export interface FerryHost {
  send(type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** A hero carrying a quest lantern walks it (TownRoom lanternHeld tells them why). True = blocked. */
  lanternHeld(): boolean;
}
/** What came of a ride: "ok", or why not. The ones a player can act on go to the client as "ferryno" {why}. */
export type FerryResult = "ok" | "bad" | "dead" | "closed" | "far" | "same" | "lantern" | "fight" | "gold";
const TOLD: ReadonlySet<FerryResult> = new Set(["closed", "far", "fight", "gold"]);

/** Server lag slack on the range, as for portal stones (PORTAL_RANGE * 1.5). */
const RANGE = FERRY_RANGE * 1.5;

export function rideFerry(h: FerryHost, pid: string, p: FerryHero | undefined, msg: unknown, now = Date.now()): FerryResult {
  const r = ride(h, pid, p, msg, now);
  if (TOLD.has(r)) h.send("ferryno", { why: r });
  return r;
}

function ride(h: FerryHost, pid: string, p: FerryHero | undefined, msg: unknown, now: number): FerryResult {
  const to = (msg as { to?: unknown } | null)?.to;
  const dest = typeof to === "string" && to.length <= 20 ? ferryStopById(to) : undefined;
  if (!p || !dest) return "bad";
  if (p.dead) return "dead";
  if (!ferryOpen(p)) return "closed";
  const from = ferryStopNear(p.x, p.y, RANGE);
  if (!from) return "far";
  if (from.id === dest.id) return "same";
  if (h.lanternHeld()) return "lantern";
  if (now - p.lastHurt < FERRY_COMBAT_MS) return "fight";
  if (p.gold < FERRY_FEE) return "gold";
  p.gold -= FERRY_FEE;
  const x1 = Math.round(p.x), y1 = Math.round(p.y);
  p.x = dest.x; p.y = dest.y; p.moving = false;
  p.rollUntil = 0; p.rolling = false;
  p.emote = "";
  const x = Math.round(dest.x), y = Math.round(dest.y);
  // the jump itself goes out like a quest warp (the client snaps instead of walking), the ride as its own sound event
  h.broadcast("travel", { id: pid, from: "", to: "", x, y, why: "ferry" });
  h.broadcast("sfx", { ev: "ferry", id: pid, from: from.id, to: dest.id, x1, y1, x, y, fee: FERRY_FEE });
  return "ok";
}
