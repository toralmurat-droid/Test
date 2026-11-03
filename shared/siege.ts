import { TILE } from "./constants";
import { AREAS, EMPTY, GROUND, OBJECTS, SIGNPOSTS, T } from "./map";
import { NPCS, NPC_DECOR } from "./npcs";
import { CHESTS } from "./chests";
import { ENGINES } from "./quests";

/**
 * The necromancer's war works. Skeletons were raised by a powerful necromancer to conquer the world: they don't
 * camp, they build. Every skeleton area has work sites with a half-built siege engine (catapult, battering ram or
 * siege tower) and a lumber yard. Skeletons spawned in the zone take a job at a free site (hammering, sawing,
 * carrying planks, hauling a rope) and drop it to attack when a hero comes close (server/TownRoom.ts work()).
 *
 * Deterministic: the server (jobs) and every client (props, tools) compute the same sites.
 */
export type EngineKind = "catapult" | "ram" | "tower";
export type Job = "hammer" | "saw" | "carry" | "haul";

export interface SiegeSite {
  zone: string; // map area name (= spawn zone name)
  engine: EngineKind;
  tx: number; ty: number; // engine foot tile (its centre)
  flip: boolean; // lumber yard to the west instead of the east
  x: number; y: number; // engine foot, world px
  lumber: { x: number; y: number }; // lumber yard foot, world px
  saw: { x: number; y: number }; // sawhorse foot, world px
}
export interface WorkSlot {
  site: number; // index into SIEGE_SITES
  job: Job;
  x: number; y: number; // where the worker stands, world px
  /** Carriers walk from here (the lumber yard) to x,y (the engine) and back. */
  fromX?: number; fromY?: number;
  /** What it faces / works on, world px. */
  lookX: number; lookY: number;
}

/** Areas where the dead are put to work, and how many sites each gets at most. */
export const SIEGE_ZONES: Record<string, { max: number; engines: EngineKind[] }> = {
  "Stonecrag Quarry": { max: 4, engines: ["catapult", "catapult", "ram"] },
  "Old Ruins": { max: 2, engines: ["ram", "catapult"] },
  "Old Watchtower": { max: 2, engines: ["tower", "catapult"] },
  "Barrow Downs": { max: 6, engines: ["catapult", "tower", "ram"] },
  "Greywatch Keep": { max: 4, engines: ["tower", "catapult", "ram"] },
};

const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAD = new Set<number>([T.WATER, T.BRIDGE]);

/** A site needs open ground under the engine (3x3) and the yard (3x3, six tiles to one side), and free tiles for its workers. */
function fits(cx: number, cy: number, flip: boolean, taken: SiegeSite[]): boolean {
  const d = flip ? -1 : 1;
  const free = (x: number, y: number) => { const o = OBJECTS[y]?.[x], g = GROUND[y]?.[x]; return o !== undefined && o === EMPTY && !BAD.has(g); };
  for (let y = cy - 2; y <= cy + 1; y++) for (let i = -1; i <= 1; i++) if (!free(cx + i, y) || !free(cx + d * 6 + i, y)) return false;
  for (const [i, j] of [[-2, 0], [0, 1], [2, 0], [2, -1], [-1, -3], [0, -3], [5, -2], [5, -1], [4, 1], [4, -1], [3, 0]]) if (!free(cx + d * i, cy + j)) return false;
  const px = (cx + 0.5) * TILE, py = (cy + 0.5) * TILE, D = (ax: number, ay: number) => Math.hypot(ax - px, ay - py);
  if (taken.some((s) => Math.abs(s.tx - cx) < 11 && Math.abs(s.ty - cy) < 6)) return false;
  if (NPCS.some((n) => D(n.x, n.y) < 7 * TILE)) return false;
  if (NPC_DECOR.some((n) => D(n.x * TILE, n.y * TILE) < 6 * TILE)) return false;
  if (CHESTS.some((c) => D(c.x, c.y) < 6 * TILE)) return false;
  if (SIGNPOSTS.some((s) => D((s.x + 0.5) * TILE, (s.y + 0.5) * TILE) < 6 * TILE)) return false;
  return true;
}

function buildSites(): SiegeSite[] {
  const out: SiegeSite[] = [];
  for (const [zone, cfg] of Object.entries(SIEGE_ZONES)) {
    const a = AREAS.find((r) => r.name === zone);
    if (!a) continue;
    let n = 0;
    for (let k = 0; k < 900 && n < cfg.max; k++) {
      const cx = a.x + 3 + Math.floor(hash(k, zone.length, 701) * (a.w - 6));
      const cy = a.y + 3 + Math.floor(hash(zone.length, k, 702) * (a.h - 6));
      const flip = hash(cx, cy, 703) < 0.5;
      if (!fits(cx, cy, flip, out)) continue;
      const s = (flip ? -1 : 1);
      const lumber = { x: (cx + 0.5 + s * 6) * TILE, y: (cy + 0.7) * TILE };
      const saw = { x: (cx + 0.5 + s * 5) * TILE, y: (cy - 1.6) * TILE };
      out.push({ zone, engine: cfg.engines[n % cfg.engines.length], tx: cx, ty: cy, flip, x: (cx + 0.5) * TILE, y: (cy + 0.9) * TILE, lumber, saw });
      n++;
    }
  }
  return out;
}

export const SIEGE_SITES = buildSites();

// The skeleton quest "Engines of the Dead" burns the engines at Stonecrag Quarry (shared/quests.ts ENGINES):
// put its objects on those sites (quests.ts can't import this file: we need the chests, which need the quests).
const NAMES: Record<EngineKind, string> = { catapult: "Half-built catapult", ram: "Half-built battering ram", tower: "Half-built siege tower" };
{
  const quarry = SIEGE_SITES.filter((s) => s.zone === "Stonecrag Quarry");
  if (quarry.length) ENGINES.length = Math.min(ENGINES.length, quarry.length); // the step's goal follows the sites
  quarry.forEach((s, i) => {
    const o = ENGINES[i];
    if (!o) return;
    o.x = s.x; o.y = s.y + TILE * 0.6; o.name = NAMES[s.engine]; // just in front of it, where a hero can reach
  });
}

function buildSlots(): WorkSlot[] {
  const out: WorkSlot[] = [];
  SIEGE_SITES.forEach((s, i) => {
    const d = s.flip ? -1 : 1, T_ = TILE;
    const look = { lookX: s.x, lookY: s.y - 0.6 * T_ };
    out.push({ site: i, job: "hammer", x: s.x - d * 1.9 * T_, y: s.y - 0.2 * T_, ...look });
    out.push({ site: i, job: "hammer", x: s.x + d * 0.4 * T_, y: s.y + 0.9 * T_, ...look });
    out.push({ site: i, job: "saw", x: s.saw.x - d * 0.2 * T_, y: s.saw.y + 0.75 * T_, lookX: s.saw.x, lookY: s.saw.y - 4 });
    out.push({ site: i, job: "carry", x: s.x + d * 2.1 * T_, y: s.y + 0.1 * T_, fromX: s.lumber.x - d * 1.4 * T_, fromY: s.lumber.y + 0.5 * T_, ...look });
    out.push({ site: i, job: "carry", x: s.x + d * 1.8 * T_, y: s.y - 1.2 * T_, fromX: s.lumber.x - d * 1.2 * T_, fromY: s.lumber.y - 0.7 * T_, ...look });
    out.push({ site: i, job: "haul", x: s.x - d * 0.6 * T_, y: s.y - 2.6 * T_, ...look });
  });
  return out;
}

/** Every job at every site. Skeletons take them by index (Mob.job). */
export const WORK_SLOTS = buildSlots();

/** Slot indices per zone name. */
export const SLOTS_BY_ZONE = new Map<string, number[]>();
WORK_SLOTS.forEach((w, i) => {
  const z = SIEGE_SITES[w.site].zone;
  (SLOTS_BY_ZONE.get(z) ?? SLOTS_BY_ZONE.set(z, []).get(z)!).push(i);
});

/** Where a hauler's rope is tied on the engine (world px, the rope's top end), by engine kind. */
export function ropeTop(s: SiegeSite): { x: number; y: number; lift: number } {
  return s.engine === "tower" ? { x: s.x, y: s.y, lift: 70 } : s.engine === "catapult" ? { x: s.x, y: s.y, lift: 34 } : { x: s.x, y: s.y, lift: 26 };
}
