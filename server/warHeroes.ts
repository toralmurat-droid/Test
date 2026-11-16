/**
 * Heroes in the clan war (shared/war/standards.ts): the oath (saved per hero, sent with the "clan" message; clan and
 * rank only reach other clients through server/warOaths.ts) and the minutes sworn heroes spend in a standard's ring (for old `hold` writs).
 */
import { heroValor, STANDARD, standardAt, isClan, nextOathAt } from "../shared/war/standards";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { wantedTier, type FeudState } from "../shared/war/feuds";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { rallyRenown } from "../shared/war/rules";
import { addValor, warState } from "./war";

export interface WarHero { clan?: ClanKey; clanAt: number; dead: boolean; level: number; x: number; y: number; lastAct: number; renown: number; feud?: FeudState }
export interface ClanView { clan: ClanKey | ""; next: number; minLevel: number; renown: number }

export const clanView = (p: WarHero): ClanView => ({ clan: p.clan ?? "", next: nextOathAt(p.clan, p.clanAt), minLevel: STANDARD.minLevel, renown: Math.floor(p.renown) });

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
  if (wantedTier(p.feud, want, now) >= 1) return `${CLANS[want].name} will not take the oath of a wanted hero.`; // (shared/war/feuds.ts: the debt is paid in blood first)
  p.clan = want; p.clanAt = now;
  return "";
}

/**
 * Seconds each hero has stood in one ring since their last full minute (by session id; leaving the ring starts over). Since
 * W2c the minutes pay no valor (STANDARD.valorPerMin 0); they still complete an old `hold` war writ (`onMinute`), and
 * would pay heroValor again if that number came back. An idle hero (STANDARD.idleMs) counts no minutes.
 */
export class Presence {
  private secs = new Map<string, { std: number; n: number }>();

  /**
   * Call once a second with every hero in the room. Returns the heroes who reached a new renown rank (id, rank name).
   * `onMinute` hears of every full minute a sworn hero stood at a standard of territory t (war writs count them).
   */
  tick(heroes: Iterable<[string, WarHero]>, now = Date.now(), onMinute?: (id: string, t: number) => void): [string, string][] {
    const ranked: [string, string][] = [];
    const seen = new Set<string>();
    for (const [id, p] of heroes) {
      seen.add(id);
      const s = p.clan && !p.dead && now - p.lastAct <= STANDARD.idleMs ? standardAt(p.x, p.y) : undefined;
      if (!s) { this.secs.delete(id); continue; }
      const e = this.secs.get(id);
      const n = e && e.std === s.id ? e.n + 1 : 1;
      if (n >= 60) {
        const v = heroValor(p.level, s.t), was = rankOf(p.renown);
        // effort the war counted earns the hero renown (shared/war/renown.ts), more while the war rallies for their clan
        if (v > 0 && addValor(s.t, p.clan!, v)) p.renown += v * rallyRenown(warState(), p.clan);
        const rank = rankOf(p.renown);
        if (rank > was) ranked.push([id, RENOWN_RANKS[rank].name]);
        this.secs.set(id, { std: s.id, n: 0 });
        onMinute?.(id, s.t);
      }
      else this.secs.set(id, { std: s.id, n });
    }
    for (const id of this.secs.keys()) if (!seen.has(id)) this.secs.delete(id);
    return ranked;
  }
}
