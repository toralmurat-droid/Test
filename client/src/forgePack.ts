import { forgeLookup, type Forged, type ForgedMob, type ForgedWeapon } from "../../shared/forge";
import { baseId, parseForgedGearId, setForgedGear } from "../../shared/gear";
import { shopWithForged, type Shop } from "../../shared/shops";
import { CLANS } from "../../shared/war/clans";

/**
 * The forgings this client has heard of (server/forge.ts packFor: "forge" on join and on every change, "forgeQ" for
 * retired ones). Weapons go into the shared gear registry so names and stats show like the server's; art is in
 * forgeArt.ts. Nothing here decides anything: it only mirrors what the server sent.
 */
const known = new Map<string, Forged>();
let version = 0;

/**
 * Merges forgings from the server and refreshes the gear registry. Malformed entries are skipped. `pack`: the list is
 * the server's live set, so a forging we held as active that is missing now has changed state: forget it and ask again.
 */
export function takeForged(defs: unknown, pack = false) {
  if (!Array.isArray(defs)) return;
  const ids = new Set<string>();
  for (const d of defs) if (d && typeof d === "object" && typeof (d as Forged).id === "string") { known.set((d as Forged).id, d as Forged); ids.add((d as Forged).id); asked.delete((d as Forged).id); }
  // The pack lists live forgings only: one we held as active that is missing was retired or revoked: ask for its current state
  if (pack) for (const [id, d] of known) if (d.status === "active" && !ids.has(id)) { asked.add(id); queue.add(id); if (!timer) timer = setTimeout(flush, 400); }
  version++;
  setForgedGear(forgeLookup([...known.values()].filter((d): d is ForgedWeapon => d.kind === "weapon")));
}
/** Changes whenever the pack changes (a shop window redraws on it). */
export const forgeVersion = () => version;

/** The forging behind an item id ("fg12_ws_bastard@30~...") or a monster's forge id ("fm3"); undefined while unknown. */
export const forgedOf = (id: string): Forged | undefined => known.get(parseForgedGearId(id) ? baseId(id) : id);
export const forgedMobOf = (id: string): ForgedMob | undefined => { const f = id ? known.get(id) : undefined; return f?.kind === "monster" ? f : undefined; };
/** Tooltip line: "Forged by The Redfang Compact (retired)", or "" for an item that is not a known forging. */
export function forgedLine(id: string): string {
  const f = forgedOf(id);
  if (!f) return "";
  return `Forged by ${CLANS[f.clan]?.name ?? "a clan"}${f.status === "active" ? "" : ` (${f.status})`}`;
}

/** Clan k's live forged weapons in the server's order (seq), for shopWithForged: the indices must match the server's. */
const stockOf = (clan: string): string[] =>
  [...known.values()].filter((d): d is ForgedWeapon => d.kind === "weapon" && d.clan === clan && d.status === "active").sort((a, b) => a.seq - b.seq).map((d) => d.id);
/** A shop as the server sells it: a capital quartermaster also stocks its clan's forged weapons. */
export const shopOf = (id: string | undefined): Shop | undefined =>
  id ? shopWithForged(id, id.startsWith("cap_") ? stockOf(id.slice(4)) : []) : undefined;

// ---- Asking about forgings we do not know (bags, stash, worn items, monsters), batched and never twice ------------
const asked = new Set<string>();
const queue = new Set<string>();
let sender: ((ids: string[]) => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
/** The scene hands over how to send "forgeQ" {ids}. */
export function setForgeSender(f: (ids: string[]) => void) { sender = f; asked.clear(); queue.clear(); }
/** An item id or monster forge id was seen: ask the server for it once if the pack lacks it (max 20 per message, 0.4 s apart). */
export function noteForged(id: string | undefined) {
  if (!id) return;
  const key = id.startsWith("fm") ? id : parseForgedGearId(id) ? baseId(id) : /^fg\d/.test(id) ? baseId(id) : "";
  if (!key || known.has(key) || asked.has(key)) return;
  asked.add(key); queue.add(key);
  if (!timer) timer = setTimeout(flush, 400);
}
function flush() {
  timer = undefined;
  if (!sender || !queue.size) return;
  const ids = [...queue].slice(0, 20);
  for (const i of ids) queue.delete(i);
  sender(ids);
  if (queue.size) timer = setTimeout(flush, 1500);
}

/** Dev/QA only (?forgetest=1): a forged pack without the server's help. */
export function testPack(defs: Forged[]) { takeForged(defs); }
if (typeof location !== "undefined" && /[?&]forgetest\b/.test(location.search)) (window as any).__forgeTest = { takeForged: testPack, shopOf };
