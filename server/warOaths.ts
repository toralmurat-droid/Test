/**
 * Tabards (roadmap M2): every client learns which clan each hero in the room is sworn to and their Renown rank, so
 * it can draw the clan's pennant by the name and the rank title. The Player schema is full (64 fields), so this goes
 * by message, server -> client only: the full map on join, then deltas when an entry changes or a hero leaves.
 * Diffing against what was last sent covers every way renown grows (standards, troop kills, writs, caravans) without
 * hooking each one; the room calls `sync()` once a second and right after an oath.
 */
import type { ClanKey } from "../shared/war/clans";
import { rankOf, type Oath, type OathsMsg } from "../shared/war/renown";

export interface OathHero { clan?: ClanKey; renown: number }
export interface OathsHost {
  heroes(): Iterable<[string, OathHero]>;
  broadcast(msg: OathsMsg): void;
}

const oathOf = (p: OathHero): Oath | undefined => (p.clan ? [p.clan, rankOf(p.renown)] : undefined);

export class WarOaths {
  /** What every client was last told: session id -> "clan:rank". Unsworn heroes are never listed. */
  private sent = new Map<string, string>();
  constructor(private h: OathsHost) {}

  /** The whole map, for a client that just joined. */
  full(): OathsMsg {
    const o: Record<string, Oath> = {};
    for (const [id, p] of this.h.heroes()) { const v = oathOf(p); if (v) o[id] = v; }
    return { full: true, o };
  }

  /** Tells everyone what changed since the last call (sworn, another clan, a rank up); nothing when nothing did. */
  sync() {
    const o: Record<string, Oath> = {}, seen = new Set<string>(), gone: string[] = [];
    let n = 0;
    for (const [id, p] of this.h.heroes()) {
      const v = oathOf(p);
      if (!v) continue;
      seen.add(id);
      const sig = `${v[0]}:${v[1]}`;
      if (this.sent.get(id) !== sig) { this.sent.set(id, sig); o[id] = v; n++; }
    }
    for (const id of this.sent.keys()) if (!seen.has(id)) { this.sent.delete(id); gone.push(id); }
    if (n || gone.length) this.h.broadcast(gone.length ? { o, gone } : { o });
  }

  /** A hero left the room: their entry goes for everyone (call after the player is removed from the state). */
  leave(id: string) {
    if (this.sent.delete(id)) this.h.broadcast({ o: {}, gone: [id] });
  }
}
