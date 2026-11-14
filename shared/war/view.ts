/**
 * What players see of the war: a small snapshot the server sends on join and after every war tick (the room
 * message "war" and GET /war.json), and the lookups the HUD needs. The server keeps the full WarState.
 */
import { dayFrac } from "../daynight";
import { CLAN_KEYS, type ClanKey } from "./clans";
import type { WarState } from "./rules";
import { WAR } from "./rules";
import { TERRITORIES, type Territory } from "./territories";

export interface WarView {
  tick: number;
  /** Wall-clock ms of the next war tick (the HUD counts down to it). */
  next: number;
  /** Owner of each territory, as an index into CLAN_KEYS. */
  owner: number[];
  control: number[]; // whole numbers 0..100
  /** Sieges announced: territory id, attacker (CLAN_KEYS index), wall-clock ms when it comes due. */
  sieges: [number, number, number][];
}

export function warView(s: WarState, next: number): WarView {
  const sieges: [number, number, number][] = [];
  s.siege.forEach((sg, t) => { if (sg) sieges.push([t, CLAN_KEYS.indexOf(sg.by), next + (sg.at - s.tick) * WAR.tickMs]); });
  return { tick: s.tick, next, owner: s.owner.map((k) => CLAN_KEYS.indexOf(k)), control: s.control.map(Math.round), sieges };
}

/** The territory a tile lies in (sanctuaries and villages lie in none). */
export function territoryAt(tx: number, ty: number): Territory | undefined {
  return TERRITORIES.find((t) => tx >= t.x && tx < t.x + t.w && ty >= t.y && ty < t.y + t.h);
}

/** The war's time of day from the world clock, so the Host really pushes at night: 0 day, 1 dusk, 2 night. */
export function warPhase(nowMs: number): number {
  const t = dayFrac(nowMs);
  return t >= 0.68 && t < 0.965 ? 2 : t >= 0.6 && t < 0.68 ? 1 : 0;
}

export const clanOfIndex = (i: number): ClanKey | undefined => CLAN_KEYS[i];
