import { actOfTile, BADLANDS_LEVEL, CROWN_LEVEL, MOORS_LEVEL, PLAYER_RADIUS, SINKHOLES_LEVEL, TILE, type Act } from "./constants";
import { CHAINS, chainDone, type Quester } from "./quests";
import { KEL_MARKET, D, WAYGATE_DESERT, WAYGATE_OAKVALE } from "./desert";
import { CAIRN_SQUARE, MOORSGATE_MOORS, MOORSGATE_OAKVALE, MR } from "./moors";
import { REDPASS_BADLANDS, REDPASS_OAKVALE, BR, RUSTWATER_SQUARE } from "./badlands";
import { ROPEWELL_SQUARE, SINKWAY_OAKVALE, SINKWAY_SINKHOLES, SR } from "./sinkholes";
import { CR, crownGateTile, CROWNWAYS, TOLLCROSS_SQUARE } from "./crown";
import { SALT_SQUARE } from "./saltmere";
import { CITIES, CITY, CITY_TEMPLATE, cityOf, cityText, cityTile, type City } from "./capitals";
import { CITY_LINES, cityLine } from "./war/cityText";
import type { ClanKey } from "./war/clans";
import { underground } from "./dungeon";
import { isSolidAt, randomSpawn, SAFE_ZONE } from "./map";
import { roomyTile } from "./npcs";

/**
 * Act 2 (Murat 2026-11-08): the old waygate south of Oakvale and its twin in the desert's Sunstone Circle
 * (shared/desert.ts). It wakes for a hero once the first zone's two last bosses are down: Ostrevar the Hollow King
 * (the Hollow Crown chain) and Grandam Ursk, the Hide-Mother (the Hide Rite chain, the Mawdeep's last quest).
 * Act 3: the moorgate at Act 1's north-east edge and its twin in the Grey Barrow Moors (shared/moors.ts), awake from
 * hero Lv 20 (MOORS_LEVEL.min), no quest needed.
 * Act 4: the Red Pass at Act 1's west edge and its twin at the Red Badlands' east edge (shared/badlands.ts), awake
 * from hero Lv 25 (BADLANDS_LEVEL.min), no quest needed.
 * Act 5: the Sinkway, a cave on the beach south of Sunken Lake, and its far end at the Mawdeep Sinkholes' north-west
 * (shared/sinkholes.ts), open from hero Lv 30 (SINKHOLES_LEVEL.min), no quest needed.
 * Act 6: the five Crownways, one from each homeland (a dais near its seat) to a gate on the Crown of the Marches' rim
 * on that homeland's side (shared/crown.ts CROWNWAYS), open from hero Lv 40 (CROWN_LEVEL.min), no quest needed. Each
 * Crown gate leads back to the homeland it faces.
 * Using an awake gate takes the hero through to its twin, like the Mawdeep's ropes.
 */
export type WaygateId = "oakvale" | "desert" | "moorsgate" | "moors" | "redpass" | "badlands" | "sinkway" | "sinkholes"
  | "crownway_oakvale" | "crown_oakvale" | "crownway_moors" | "crown_moors" | "crownway_badlands" | "crown_badlands"
  | "crownway_sinkholes" | "crown_sinkholes" | "crownway_sunscar" | "crown_sunscar"
  | `citygate_${ClanKey}` | `cityexit_${ClanKey}`;
/** `out`: where a hero coming out of this gate stands, in tiles south of it (negative: north; default 2.4). */
export interface Waygate { id: WaygateId; x: number; y: number; to: WaygateId; label: string; out?: number }
const px = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
export const WAYGATES: Waygate[] = [
  { id: "oakvale", ...px(WAYGATE_OAKVALE), to: "desert", label: "Step through the waygate to the Sunscar" },
  { id: "desert", ...px(WAYGATE_DESERT), to: "oakvale", label: "Step through the waygate home to Oakvale" },
  { id: "moorsgate", ...px(MOORSGATE_OAKVALE), to: "moors", label: "Step through the moorgate to the Grey Barrow Moors" },
  { id: "moors", ...px(MOORSGATE_MOORS), to: "moorsgate", label: "Step through the moorgate home to Oakvale" },
  { id: "redpass", ...px(REDPASS_OAKVALE), to: "badlands", label: "Go through the Red Pass to the Red Badlands" },
  { id: "badlands", ...px(REDPASS_BADLANDS), to: "redpass", label: "Go back through the Red Pass home to Oakvale" },
  { id: "sinkway", ...px(SINKWAY_OAKVALE), to: "sinkholes", label: "Go down the Sinkway to the Mawdeep Sinkholes" },
  { id: "sinkholes", ...px(SINKWAY_SINKHOLES), to: "sinkway", label: "Go back up the Sinkway home to Oakvale" },
  // the Crownways (Act 6): each homeland's dais ("crownway_<land>") and its gate on the Crown's rim ("crown_<land>")
  ...CROWNWAYS.flatMap((c): Waygate[] => [
    { id: `crownway_${c.from}`, ...px(c.home), to: `crown_${c.from}`, label: "Take the Crownway to the Crown of the Marches" },
    { id: `crown_${c.from}`, ...px(crownGateTile(c)), to: `crownway_${c.from}`, label: `Go back through ${c.name.replace(/^The /, "the ")} home to ${c.land}` },
  ]),
  // the clans' capitals (W7, shared/capitals.ts): the city gate beside the seat ("citygate_<clan>") and the city's main
  // gate inside its south wall ("cityexit_<clan>", heroes come out north of it, into the gate square)
  ...CITIES.flatMap((c): Waygate[] => [
    { id: `citygate_${c.clan}`, ...px(c.outer), to: `cityexit_${c.clan}`, label: cityText(c).enter },
    { id: `cityexit_${c.clan}`, ...px(cityTile(c, CITY_TEMPLATE.gate)), to: `citygate_${c.clan}`, label: cityText(c).leave, out: -2.4 },
  ]),
];
/** How close a hero must stand to use a waygate (click it or press E), like a portal stone's PORTAL_RANGE. */
export const WAYGATE_RANGE = 1.6 * TILE;
export const waygateById = (id: string) => WAYGATES.find((g) => g.id === id);
/** Where a hero coming out of gate `g` stands: a few steps south of it, off the gate. */
export const waygateArrival = (g: Waygate) => ({ x: g.x, y: g.y + (g.out ?? 2.4) * TILE });
/** The capital a gate belongs to, and whether it is the city's own (inner) gate or the city gate out in the land. */
export function cityGateOf(g: Waygate): { city: City; inner: boolean } | undefined {
  const m = /^city(gate|exit)_(\w+)$/.exec(g.id), city = m ? cityOf(m[2]) : undefined;
  return city && { city, inner: m![1] === "exit" };
}
/**
 * The homelands' gate pairs (Acts 3 and up): each wakes at its act's minimum hero level, no quest, and says `shut`
 * (then "Return at level N.") while it is cold. A new homeland is one row here (an act reached by several pairs, like
 * the Crown's five Crownways, lists them all in its row). The Sunscar's pair is not in it: it wants Act 1's last bosses
 * (act2Open).
 */
export const HOMELAND_GATES: { act: Act; ids: readonly WaygateId[]; level: number; shut: string }[] = [
  { act: 3, ids: ["moorsgate", "moors"], level: MOORS_LEVEL.min, shut: "The gate is cold." },
  { act: 4, ids: ["redpass", "badlands"], level: BADLANDS_LEVEL.min, shut: "The pass is held shut." },
  { act: 5, ids: ["sinkway", "sinkholes"], level: SINKHOLES_LEVEL.min, shut: "The tunnel is caved in." },
  // the Crown: five pairs lead to one act, so one row holds all ten gates
  { act: 6, ids: CROWNWAYS.flatMap((c): WaygateId[] => [`crownway_${c.from}`, `crown_${c.from}`]), level: CROWN_LEVEL.min, shut: "The road is barred." },
];
/** The homeland gate row `g` belongs to (undefined for the Sunscar's waygates). */
export const homelandGate = (g: Waygate) => HOMELAND_GATES.find((h) => h.ids.includes(g.id));
/** True for the moorgate pair (Act 3), false for the others. */
export const isMoorsGate = (g: Waygate) => homelandGate(g)?.act === 3;
/** True for the Red Pass pair (Act 4). */
export const isBadlandsGate = (g: Waygate) => homelandGate(g)?.act === 4;
/** True for the Sinkway pair (Act 5). */
export const isSinkholesGate = (g: Waygate) => homelandGate(g)?.act === 5;
/** True for any of the five Crownways' gates (Act 6), on either side. */
export const isCrownGate = (g: Waygate) => homelandGate(g)?.act === 6;

/** The chains that must be finished: the Hollow Crown (Ostrevar) and the Hide Rite (the Hide-Mother). */
export const ACT2_KEYS = ["crown", "beast"] as const;
const chainIx = (id: string) => CHAINS.findIndex((c) => c.id === id);
/** True once the hero has beaten both of the first zone's last bosses (their quests handed in). */
export function act2Open(p: Quester | undefined): boolean {
  return ACT2_KEYS.every((k) => { const c = chainIx(k); return c >= 0 && chainDone(p, c); });
}
/** What is still missing, for the "the gate is cold" note. */
export function act2Missing(p: Quester | undefined): string[] {
  return ACT2_KEYS.filter((k) => { const c = chainIx(k); return c < 0 || !chainDone(p, c); }).map((k) => (k === "crown" ? "Ostrevar the Hollow King" : "the Hide-Mother of the Mawdeep"));
}
/** True once the hero is strong enough for the moors (Act 3): hero level only, no quest. */
export const moorsOpen = (p: { level: number } | undefined) => !!p && p.level >= MOORS_LEVEL.min;
/** True once the hero is strong enough for the badlands (Act 4): hero level only, no quest. */
export const badlandsOpen = (p: { level: number } | undefined) => !!p && p.level >= BADLANDS_LEVEL.min;
/** The Sun Gate's two ends lead into or out of the Sunscar, so they also want Act 2 unlocked (no way round its lock). */
export const isSunGate = (g: Waygate) => g.id === "crown_sunscar" || g.id === "crownway_sunscar";
/** Whether gate `g` is awake for this hero. */
export const gateOpen = (g: Waygate, p: (Quester & { level: number }) | undefined) => {
  const cg = cityGateOf(g);
  if (cg) return cg.inner || (!!p && p.level >= CITY.minLevel); // a capital's own gate always lets heroes out
  const h = homelandGate(g);
  return h ? !!p && p.level >= h.level && (!isSunGate(g) || act2Open(p)) : act2Open(p);
};
/** The note a hero gets at a cold gate. */
export function gateColdNote(g: Waygate, p: Quester | undefined): string {
  if (cityGateOf(g)) return cityLine(CITY_LINES.shutLevel, { level: CITY.minLevel });
  const h = homelandGate(g);
  if (h && (!isSunGate(g) || ((p as { level?: number } | undefined)?.level ?? 0) < h.level)) return `${h.shut} Return at level ${h.level}.`;
  const miss = act2Missing(p);
  return `The waygate's stones are cold. It will wake when ${miss.join(" and ")} ${miss.length > 1 ? "are" : "is"} beaten.`;
}
/** Whether a hero saved in act `act` may log back in there (else Oakvale): the act's gate must still be awake for them. */
export function actOpen(act: number, p: (Quester & { level: number }) | undefined): boolean {
  if (act === 1) return true;
  if (act === 2) return act2Open(p);
  const h = HOMELAND_GATES.find((o) => o.act === act);
  return !!h && !!p && p.level >= h.level;
}

/** Which act a point (px) is in (the Lantern Crypt, deep under the desert's west, is Act 1's). */
export const actAt = (py: number, px: number): Act => actOfTile(Math.floor(px / TILE), Math.floor(py / TILE));
/**
 * Kel Ashar's market: where heroes in the desert come back after dying, and where they log in if they left from Act 2.
 * Only open ground with free tiles all round (Murat 2026-11-15: a reload put him between a crate and a barrel by the
 * south stalls); the desert waygate's arrival spot if none is found.
 */
export function desertSpawn(): { x: number; y: number } {
  const M = KEL_MARKET;
  for (let i = 0; i < 80; i++) {
    const tx = M.x + 1 + Math.floor(Math.random() * (M.w - 2)), ty = D(M.y + 1) + Math.floor(Math.random() * (M.h - 2));
    if (roomyTile(tx, ty)) return { x: (tx + 0.2 + Math.random() * 0.6) * TILE, y: (ty + 0.2 + Math.random() * 0.6) * TILE };
  }
  return waygateArrival(waygateById("desert")!);
}
/**
 * Cairnwatch's square (shared/moors.ts): where heroes in the moors come back after dying, and where they log in if
 * they left from Act 3. Free ground only; the moorgate's arrival spot if none is found.
 */
export function moorsSpawn(): { x: number; y: number } {
  const Q = CAIRN_SQUARE, r = PLAYER_RADIUS;
  for (let i = 0; i < 60; i++) {
    const x = (Q.x + 1 + Math.random() * (Q.w - 2)) * TILE, y = (MR(Q.y) + 1 + Math.random() * (Q.h - 2)) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return waygateArrival(waygateById("moors")!);
}
/**
 * The Rustwater Post's square (shared/badlands.ts): where heroes in the badlands come back after dying, and where
 * they log in if they left from Act 4. The post is still bare ground (its buildings come with the zones); free ground
 * only, the Red Pass's arrival spot if none is found.
 */
export function badlandsSpawn(): { x: number; y: number } {
  const Q = RUSTWATER_SQUARE, r = PLAYER_RADIUS;
  for (let i = 0; i < 60; i++) {
    const x = (Q.x + 1 + Math.random() * (Q.w - 2)) * TILE, y = (BR(Q.y) + 1 + Math.random() * (Q.h - 2)) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return waygateArrival(waygateById("badlands")!);
}
/**
 * Ropewell's square (shared/sinkholes.ts): where heroes in the sinkholes come back after dying, and where they log in
 * if they left from Act 5. Free ground only (the well stands in its middle), the Sinkway's arrival spot if none is found.
 */
export function sinkholesSpawn(): { x: number; y: number } {
  const Q = ROPEWELL_SQUARE, r = PLAYER_RADIUS;
  for (let i = 0; i < 60; i++) {
    const x = (Q.x + 1 + Math.random() * (Q.w - 2)) * TILE, y = (SR(Q.y) + 1 + Math.random() * (Q.h - 2)) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return waygateArrival(waygateById("sinkholes")!);
}
/**
 * Tollcross Square (shared/crown.ts): where heroes in the Crown come back after dying, and where they log in if they
 * left from Act 6. Tollcross is still bare ground; free ground only, the Greenward Gate's arrival spot if none is found.
 */
export function crownSpawn(): { x: number; y: number } {
  const Q = TOLLCROSS_SQUARE, r = PLAYER_RADIUS;
  for (let i = 0; i < 60; i++) {
    const x = (Q.x + 1 + Math.random() * (Q.w - 2)) * TILE, y = (CR(Q.y) + 1 + Math.random() * (Q.h - 2)) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return waygateArrival(waygateById("crown_oakvale")!);
}
/**
 * Saltmere's harbour square (shared/saltmere.ts), Act 1's second safe town: free ground only, the square's centre if
 * none is found. Only a respawn lands here (act1Home); Act 1 logins still start in Oakvale.
 */
export function saltmereSpawn(): { x: number; y: number } {
  const Q = SALT_SQUARE, r = PLAYER_RADIUS;
  for (let i = 0; i < 60; i++) {
    const x = (Q.x + 1 + Math.random() * (Q.w - 2)) * TILE, y = (Q.y + 1 + Math.random() * (Q.h - 2)) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return { x: (Q.x + Q.w / 2) * TILE, y: (Q.y + Q.h / 2) * TILE };
}
/**
 * Where an Act 1 hero who died at (x, y) px comes back (owner 2026-11-15, docs/saltmere-rework-progress.md): once
 * they have woken Saltmere's waystone, at whichever of Oakvale and Saltmere is nearer in a straight line, so a death
 * on the coast doesn't mean the long walk back from Oakvale. Deaths underground (the Mawdeep, the Lantern Crypt), and
 * heroes who never reached Saltmere, wake in Oakvale. No save field: the woken waystones are saved already.
 */
export function act1Home(x: number, y: number, woke: (id: string) => boolean): { x: number; y: number } {
  if (!woke("saltmere") || underground(y) || actAt(y, x) !== 1) return randomSpawn();
  const O = SAFE_ZONE, S = SALT_SQUARE;
  const dO = Math.hypot(x - (O.x + O.w / 2) * TILE, y - (O.y + O.h / 2) * TILE);
  const dS = Math.hypot(x - (S.x + S.w / 2) * TILE, y - (S.y + S.h / 2) * TILE);
  return dS < dO ? saltmereSpawn() : randomSpawn();
}
/** The town (or camp) of an act, for a login or a respawn there; anything else is Oakvale's square (`home`). */
export function actSpawn(act: number, home: () => { x: number; y: number }): { x: number; y: number } {
  return act === 6 ? crownSpawn() : act === 5 ? sinkholesSpawn() : act === 4 ? badlandsSpawn() : act === 3 ? moorsSpawn() : act === 2 ? desertSpawn() : home();
}
