import { TILE } from "../../shared/constants";
import { GROUND, isSolidTile, T } from "../../shared/map";
import { SALT_BUILDINGS, SALT_PIERS, SALT_LANE, SALT_RACKS, SALT_SQUARE, SALT_STASH, SALT_TOWN, saltDoorStep } from "../../shared/saltmere";
import type { CharacterName } from "./artAssets";

/** Where a Saltmere fisherman can spend a while (all read from shared/saltmere.ts and the map, no hand-written tiles). */
export type SpotKind = "net" | "pier" | "fire" | "chat" | "door";
export interface FolkSpot {
  kind: SpotKind;
  /** px */
  x: number; y: number;
  /** direction to look once there (dx, dy), if any */
  look?: [number, number];
}

/** Garrick's beach fire (shared/npcs.ts has him beside it). */
export const SALT_FIRE = { x: 129, y: 189 };
/** Seven fisherfolk: existing villager sheets only. */
export const SALT_FOLK: CharacterName[] = ["peasant", "labourer", "farmwife", "goodwife", "villager", "peasant", "labourer"];
/** Stroll bounds (tiles): the lanes and the beach, a ring round the whole village. */
export const SALT_AREA = { x0: SALT_TOWN.x, y0: SALT_TOWN.y + 6, x1: SALT_TOWN.x + SALT_TOWN.w, y1: SALT_TOWN.y + SALT_TOWN.h };

const centre = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
const walkable = (tx: number, ty: number) => !isSolidTile(tx, ty) && GROUND[ty]?.[tx] !== T.WATER;

/** The last bridge tile of a pier column, walking south from the beach lane. */
export function pierHead(x: number): number {
  let y = SALT_LANE;
  while (y < SALT_LANE + 30 && GROUND[y]?.[x] !== T.BRIDGE) y++; // the deck starts where the sand ends
  while (GROUND[y + 1]?.[x] === T.BRIDGE) y++;
  return y;
}

/** True for a spot the idle folk keep clear: the stash chest, the door steps and the buildings. */
export function keepOff(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  if (Math.abs(tx - (SALT_STASH.x + 0.5)) < 1.2 && Math.abs(ty - (SALT_STASH.y + 0.5)) < 1.2) return true;
  for (const b of SALT_BUILDINGS) {
    if (tx >= b.x - 0.3 && tx < b.x + b.w + 0.3 && ty >= b.y && ty < b.y + b.h + 0.1) return true;
    const d = saltDoorStep(b);
    if (Math.abs(tx - (d.x + 0.5)) < 1 && Math.abs(ty - (d.y + 0.5)) < 0.9) return true;
  }
  return false;
}

/** All activity spots of the village. */
export function saltmereSpots(): FolkSpot[] {
  const out: FolkSpot[] = [];
  // mending nets: beside the drying racks, facing them
  for (const [rx, ry] of SALT_RACKS)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]] as const) {
      const tx = rx + dx, ty = ry + dy;
      if (SALT_RACKS.some(([a, b]) => a === tx && b === ty) || !walkable(tx, ty)) continue;
      const c = centre(tx, ty);
      if (!keepOff(c.x, c.y)) out.push({ kind: "net", ...c, look: [-dx, -dy] });
    }
  // piers: stand near the head, looking out to sea (one tile in from the end, the head stays free for the ferry later)
  for (const px of SALT_PIERS) {
    const hy = pierHead(px);
    if (hy > SALT_LANE) out.push({ kind: "pier", ...centre(px, hy - 1), look: [0, 1] });
  }
  // the fire: a ring of places round it
  for (const [dx, dy] of [[-1.4, 0.2], [1.4, 0.2], [-1, -1.2], [1, -1.2], [0, 1.4]]) {
    const x = (SALT_FIRE.x + 0.5 + dx) * TILE, y = (SALT_FIRE.y + 0.5 + dy) * TILE;
    if (walkable(Math.floor(x / TILE), Math.floor(y / TILE)) && !keepOff(x, y)) out.push({ kind: "fire", x, y, look: [-dx, -dy] });
  }
  // chat: spots across the square (never the stash)
  for (let i = 0; i < 6; i++) {
    const x = (SALT_SQUARE.x + 1.5 + (i % 3) * 4.5) * TILE, y = (SALT_SQUARE.y + 1.5 + Math.floor(i / 3) * 3) * TILE;
    if (!keepOff(x, y) && walkable(Math.floor(x / TILE), Math.floor(y / TILE))) out.push({ kind: "chat", x, y });
  }
  // doors: the step in front of each one
  for (const b of SALT_BUILDINGS) { const s = saltDoorStep(b); out.push({ kind: "door", ...centre(s.x, s.y), look: [0, -1] }); }
  return out;
}

/** Fisherfolk are indoors while it is properly dark (details.dayPhase: darkness 0..1). */
export const isHomeTime = (dark: number) => dark >= 0.5;

/** Picks the next kind of doing by weight (r in 0..1); the weights are the day's rhythm. */
export function pickKind(r: number): SpotKind | "stroll" {
  const w: [SpotKind | "stroll", number][] = [["net", 0.22], ["pier", 0.14], ["fire", 0.14], ["chat", 0.16], ["door", 0.1], ["stroll", 0.24]];
  let a = 0;
  for (const [k, p] of w) { a += p; if (r < a) return k; }
  return "stroll";
}
