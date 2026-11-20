/**
 * The gate ward of the clans' cities in their lands (settlement network step 5): a city with a `site` (shared/capitals.ts)
 * has open, walk-in gates instead of a waygate pair, so W7's entry rules are kept here. Each tick, for heroes within
 * CITY.wardTiles of such a city only: a hero who was outside its walls last tick and is inside now (walked, dashed, rolled
 * or blinked in) is let in if the city admits them (server/warCapitals.ts admitOf: not at war with its clan, not Wanted
 * by it) and they are at least CITY.minLevel; otherwise they are put back where they stood outside, their movement
 * stopped, and told why (WarCapitals.refuse: the "gate stays shut" lines, once per 3 s). A hero who turns up inside
 * without having been seen outside (logged in, came by waystone, woke at a respawn) was checked on that way in. Nobody
 * already inside is thrown out when a war starts (W7's rule). Monsters never enter (the city is a safe zone).
 */
import { TILE } from "../shared/constants";
import { CITY, cityAt, inLandCities, plotBox, type City, type CityAdmit } from "../shared/capitals";
import { admitOf, type CapHero } from "./warCapitals";

/** The parts of a hero the ward reads and writes (TownRoom's Player). */
export interface WardHero extends CapHero { moving: boolean; rolling: boolean; rollUntil: number }

export interface GateWardHost {
  heroes(): Iterable<[string, WardHero]>;
  /** Tell the hero why the gate stays shut (WarCapitals.refuse). */
  refuse(id: string, city: City, why: Exclude<CityAdmit, "ok"> | "level"): void;
  /** The hero was put back outside: the clients snap them there (the "travel" message, why "gate"). */
  snap(id: string, x: number, y: number): void;
}

/** Why `city` keeps this hero out now, or "ok". The level comes first: the untried never get as far as the war's rules. */
export function gateRefusal(p: CapHero, city: City, now = Date.now()): CityAdmit | "level" {
  return p.level < CITY.minLevel ? "level" : admitOf(p, city, now);
}

const WARDED = inLandCities();
/** The city in its land whose watched ground (its box plus CITY.wardTiles) holds (px, py), if any. */
function watchedBy(px: number, py: number): City | undefined {
  const tx = px / TILE, ty = py / TILE, r = CITY.wardTiles;
  for (const c of WARDED) { const b = plotBox(c); if (tx >= b.x - r && ty >= b.y - r && tx < b.x + b.w + r && ty < b.y + b.h + r) return c; }
  return undefined;
}

export class CityGateWard {
  /** Per watched hero: where they last stood outside the walls, and whether they are inside (let in, or found there). */
  private seen = new Map<string, { x: number; y: number; in: boolean }>();
  constructor(private h: GateWardHost) {}

  tick(now = Date.now()) {
    if (!WARDED.length) return;
    for (const [id, p] of this.h.heroes()) {
      const c = p.dead ? undefined : watchedBy(p.x, p.y);
      if (!c) { this.seen.delete(id); continue; }
      const s = this.seen.get(id);
      if (cityAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) !== c) { // outside the walls: remember the spot
        if (s) { s.x = p.x; s.y = p.y; s.in = false; } else this.seen.set(id, { x: p.x, y: p.y, in: false });
        continue;
      }
      if (!s) { this.seen.set(id, { x: p.x, y: p.y, in: true }); continue; } // found inside: came in some other way
      if (s.in) continue;
      const why = gateRefusal(p, c, now);
      if (why === "ok") { s.in = true; continue; }
      p.x = s.x; p.y = s.y; p.moving = false; p.rollUntil = 0; p.rolling = false;
      this.h.snap(id, p.x, p.y);
      this.h.refuse(id, c, why);
    }
  }

  /** The hero left the room. */
  leave(id: string) { this.seen.delete(id); }
}
