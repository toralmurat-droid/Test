/**
 * Heroes in the clan war (shared/war/standards.ts): the oath (saved per hero, sent with the "clan" message, never
 * synced to other clients yet) and the minutes sworn heroes spend in a standard's ring, reported to the war as valor.
 */
import { STANDARD, standardAt, isClan, nextOathAt } from "../shared/war/standards";
import type { ClanKey } from "../shared/war/clans";
import { addValor } from "./war";

export interface WarHero { clan?: ClanKey; clanAt: number; dead: boolean; level: number; x: number; y: number }
export interface ClanView { clan: ClanKey | ""; next: number; minLevel: number }

export const clanView = (p: WarHero): ClanView => ({ clan: p.clan ?? "", next: nextOathAt(p.clan, p.clanAt), minLevel: STANDARD.minLevel });

/** Old or broken save values become "not sworn". */
export function cleanOath(clan: unknown, at: unknown): { clan?: ClanKey; clanAt: number } {
  return isClan(clan) ? { clan, clanAt: typeof at === "number" && Number.isFinite(at) ? at : 0 } : { clanAt: 0 };
}

/** A hero asks to swear to `want`. Returns an error line for the hero, or "" when sworn. */
export function swear(p: WarHero, want: unknown, now = Date.now()): string {
  if (!isClan(want)) return "No such clan.";
  if (p.level < STANDARD.minLevel) return `Heroes swear from level ${STANDARD.minLevel}.`;
  if (p.clan === want) return "";
  if (now < nextOathAt(p.clan, p.clanAt)) return "You swore an oath less than a day ago.";
  p.clan = want; p.clanAt = now;
  return "";
}

/** Seconds each hero has stood in a ring since their last report (by session id). */
export class Presence {
  private secs = new Map<string, number>();

  /** Call once a second with every hero in the room. */
  tick(heroes: Iterable<[string, WarHero]>) {
    const seen = new Set<string>();
    for (const [id, p] of heroes) {
      seen.add(id);
      if (!p.clan || p.dead) continue;
      const s = standardAt(p.x, p.y);
      if (!s) continue;
      const n = (this.secs.get(id) ?? 0) + 1;
      if (n >= 60) { addValor(s.t, p.clan, STANDARD.valorPerMin); this.secs.set(id, n - 60); }
      else this.secs.set(id, n);
    }
    for (const id of this.secs.keys()) if (!seen.has(id)) this.secs.delete(id);
  }
}
