/**
 * Crossing between Ages (roadmap M5, docs/ages-progress.md part 8): a hero playing on one Age (game server) moves to
 * another open Age without logging out by hand. The server decides (server/ageCross.ts): it checks the hero and the
 * target, saves, waits for the account's commit, then tells the client to go and closes the connection. This file holds
 * the rule (`crossRefusal`), the numbers, the texts and the message shapes, so server, client and tests agree.
 *
 * Crossing is on only on a game server with shared accounts (account leases), `AGE_SLOT` and `GATEWAY_URL` set. Off (a
 * single server): no "ages" message is ever sent, "/age" in chat answers `CROSS_TEXT.off`, nothing else changes.
 *
 * Messages (server -> client)
 * - "ages" `AgesMsg` `{ on: true, here, list?, err? }`: sent once when the hero joins, without `list` (show the Esc menu
 *   item "Cross to another Age" only after it). Sent again, with `list`, as the answer to the client's "ages". Each row
 *   `AgeRow` `{ slot, name, here, why? }`: `why` set = greyed out with that text (the hero's own Age has `here: true` and
 *   `why: CROSS_TEXT.here`); no `why` = a Cross button. `err` set (and `list` empty) = the list could not be fetched.
 * - "cross" `CrossMsg` `{ slot }`: the hero is saved and committed; the server closes the connection with `CROSS_CLOSE`
 *   right after. The client goes to `/age/<slot>` (gateway; see the plan) and logs in again there.
 * - Refusals and failures come as a normal chat line: "chat" `{ id: "", name: CROSS_SPEAKER, text }` (a `CROSS_TEXT`).
 *
 * Messages (client -> server), both rate-limited ("ask") and validated
 * - "ages" (no payload): ask for the list.
 * - "cross" `{ slot: string }`: cross to that Age now (`slot` must match `AGE_SLOT_RE`; anything else is ignored).
 * - Chat "/age" lists the Ages as chat lines; "/age <slot>" crosses (the same checks as "cross").
 *
 * Close codes: `CROSS_CLOSE` (4410: crossing, show no "Connection lost"); `AGE_TAKEN_CLOSE` (4409: this hero was opened
 * on another server, no reconnect; also the text `CROSS_TEXT.taken` of a refused login there).
 */
import { ACCOUNT_API } from "./accountApi";

/** Crossing's numbers. */
export const CROSS = {
  /** No crossing this long after the hero was hit or attacked / cast (the 10 s quiet rule). */
  quietMs: 10_000,
  /** Per account, between two crossings (carried to the next Age in the handoff spot: no A -> B -> A bounce). */
  cooldownMs: 5 * 60_000,
  /** The game server keeps the gateway's list this long for the menu (a crossing always fetches it afresh). */
  listCacheMs: 15_000,
  /** How long a fetch of the gateway's list (and the gateway's probe of each Age) may take. */
  fetchMs: 2_000,
  /** The gateway keeps its probed list this long. */
  gatewayCacheMs: 10_000,
  /** The save before leaving (account commit and handoff spot) may take this long; past it the crossing fails. */
  saveMs: 8_000,
};

/** Close code of a crossing hero's connection (the client shows no "Connection lost"). */
export const CROSS_CLOSE = 4410;
/** Close code of a hero opened on another server (server/accountGuard.ts; the client shows a card, no reconnect). */
export const AGE_TAKEN_CLOSE = 4409;
/** Speaker of crossing's chat lines. */
export const CROSS_SPEAKER = "Ages";
/** A slot name (the gateway's GATEWAY_TARGETS rule). */
export const AGE_SLOT_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;
/** Public paths: a game server's own info (probed by the gateway) and the gateway's list of open Ages. */
export const AGE_INFO_PATH = "/age-info.json";
export const GATEWAY_AGES_PATH = "/gateway/ages";

/** User-facing texts (chat lines and greyed rows). */
export const CROSS_TEXT = {
  off: "Only one Age is open.",
  here: "You are here",
  closed: "That Age is not open",
  down: "That Age is not answering right now",
  older: "That Age runs an older version: your hero cannot go there",
  cls: "Your class cannot be played in that Age",
  crossing: "You are already crossing",
  dead: "The dead cannot cross",
  trading: "Finish your trade first",
  fight: `Stay out of combat for ${CROSS.quietMs / 1000} seconds first`,
  cooldown: (ms: number) => `You can cross again in ${Math.max(1, Math.ceil(ms / 60_000))} min`,
  listFail: "Could not reach the other Ages; try again",
  saveFail: "Could not save your hero; try again",
  going: (name: string) => `Crossing to ${name}...`,
  taken: "This hero is playing on another server",
  justClosed: "That Age just closed",
  usage: "Type /age <name> to cross, e.g. /age green.",
};

/** One open Age as the gateway lists it (GET /gateway/ages). `accountApi` / `classes` null: unknown (an older build). */
export interface AgeInfo { slot: string; name: string; up: boolean; accountApi: number | null; classes: string[] | null }
/** The gateway's answer: the primary and the open Ages (weight > 0 in AGE_SPLIT), never their addresses. */
export interface AgesList { primary: string; ages: AgeInfo[] }
/** A game server's own info (GET /age-info.json). */
export interface AgeSelf { slot: string; build: string; accountApi: number; classes: string[] }

/** A row of the crossing panel: `why` set = greyed out with that text; none = may cross. */
export interface AgeRow { slot: string; name: string; here: boolean; why?: string }
/** server -> client "ages". */
export interface AgesMsg { on: true; here: string; list?: AgeRow[]; err?: string }
/** server -> client "cross" (the connection closes with CROSS_CLOSE right after); client -> server "cross". */
export interface CrossMsg { slot: string }

/** The shown name of a slot: AGE_NAMES's, else the slot capitalised ("blue" -> "Blue"). */
export const ageName = (slot: string, names: Record<string, string> = {}) => names[slot] || slot.charAt(0).toUpperCase() + slot.slice(1);

const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
/** One Age of the gateway's list, checked (another process's answer: never trusted), or undefined. */
export function cleanAgeInfo(raw: unknown): AgeInfo | undefined {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  if (!r || typeof r.slot !== "string" || !AGE_SLOT_RE.test(r.slot)) return undefined;
  const api = Number.isInteger(r.accountApi) && (r.accountApi as number) >= 1 ? (r.accountApi as number) : null;
  const classes = Array.isArray(r.classes) ? r.classes.filter((c): c is string => str(c, 24)).slice(0, 32) : null;
  return { slot: r.slot, name: str(r.name, 40) ? (r.name as string) : ageName(r.slot), up: r.up === true, accountApi: api, classes };
}
/** The gateway's whole answer, checked, or undefined. */
export function cleanAgesList(raw: unknown): AgesList | undefined {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  if (!r || !Array.isArray(r.ages)) return undefined;
  const ages = r.ages.slice(0, 16).map(cleanAgeInfo).filter((a): a is AgeInfo => !!a);
  return { primary: typeof r.primary === "string" ? r.primary : "", ages };
}

/** What crossRefusal looks at. */
export interface CrossCheck {
  /** Target slot, and this server's slot. */
  slot: string; here: string;
  /** The open Ages (the gateway's list). */
  ages: AgeInfo[];
  cls: string;
  dead: boolean; trading: boolean; crossing: boolean;
  /** Last time the hero was hit, attacked or cast (ms). */
  lastFight: number;
  /** The account's last crossing (ms), if any. */
  crossedAt?: number;
  now: number;
  /** This build's ACCOUNT_API (tests). */
  api?: number;
}

/**
 * Pure: why this hero may not cross to `slot` now (a CROSS_TEXT), or undefined when it may. The target's checks come
 * first (the same for every hero), then the hero's. A target that runs an older account version (or answers no
 * version) would refuse the hero's newer save; one without the hero's class could not load it.
 */
export function crossRefusal(c: CrossCheck): string | undefined {
  if (c.slot === c.here) return CROSS_TEXT.here;
  const t = c.ages.find((a) => a.slot === c.slot);
  if (!t) return CROSS_TEXT.closed;
  if (!t.up) return CROSS_TEXT.down;
  if (t.accountApi === null || t.accountApi < (c.api ?? ACCOUNT_API)) return CROSS_TEXT.older;
  if (!t.classes?.includes(c.cls)) return CROSS_TEXT.cls;
  if (c.crossing) return CROSS_TEXT.crossing;
  if (c.dead) return CROSS_TEXT.dead;
  if (c.trading) return CROSS_TEXT.trading;
  if (c.now - c.lastFight < CROSS.quietMs) return CROSS_TEXT.fight;
  if (c.crossedAt !== undefined && c.now - c.crossedAt < CROSS.cooldownMs) return CROSS_TEXT.cooldown(CROSS.cooldownMs - (c.now - c.crossedAt));
  return undefined;
}
