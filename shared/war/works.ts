/**
 * Siege works (roadmap M2, "siege works for the Host"): while the Ossuary Host besieges a land and the siege battle is
 * live (server/warSieges.ts), a bone ram rolls from the attackers' approach along the land's patrol loop to the Hold
 * gate, with a small bone crew. Defenders standing in its way stop it; once at the gate it weighs for the attacker in
 * the gate's count. Rival-sworn heroes wreck it. It is a trooper too (weapon "host#", shared/war/troops.ts parseTroop
 * part "ram"), so every trooper gate holds. Pure rules and numbers, the same for the server, the tests and the sims.
 */
import type { ClanKey } from "./clans";
import { patrolPos, type Patrol } from "./patrols";
import { troopStats } from "./troops";
import { warPhase } from "./view";

export const SIEGE_WORKS = {
  /** Master switch: off, no ram ever rolls. */
  live: true,
  /** The one clan whose sieges bring a ram (its doctrine: slow, tough, pushes at night). */
  clan: "host" as ClanKey,
  /** The ram's HP: the clan's soldier HP at the land's soldier level times this. It never strikes. */
  ramHp: 4,
  /** Rolling speed along the loop (px/s): by day (and dusk), and at night (warPhase 2), when the Host pushes. */
  daySpeed: 14,
  nightSpeed: 24,
  /** It stops while a defender trooper or a defender-sworn hero is this close (px). */
  blockPx: 64,
  /** Plain soldiers of its clan walking beside it (fallen ones are not replaced while that ram lives). */
  crew: 2,
  /** Crew places: this far behind the ram along the loop and to its sides (px); they fight within leashPx of it. */
  crewBehind: 22, crewLateral: 16, leashPx: 6 * 32,
  /** At the gate front it counts this many for the attacker in the gate's score (troopers count 1, heroes heroWeight). */
  ramWeight: 3,
  /** Felled by a defender-sworn hero: valor for the defending clan in that land (legal-gated, inside the siege's valor cap) and renown for the killer. */
  wreckValor: 6,
  wreckRenown: 10,
};

/** The ram's HP in a land whose soldiers are `level`. */
export const ramHp = (clan: ClanKey, level: number) => Math.round(troopStats(clan, level).hp * SIEGE_WORKS.ramHp);

/** The ram's speed at wall time `now` (px/s): faster at night. */
export const ramSpeed = (now: number) => (warPhase(now) === 2 ? SIEGE_WORKS.nightSpeed : SIEGE_WORKS.daySpeed);

/** Where the ram stands at distance `d` along the land's loop, and its heading. */
export const ramPos = (p: Patrol, d: number) => patrolPos(p, d);

/** Is anything in `who` within blockPx of (x, y)? (The server passes living defender troopers and defender-sworn heroes.) */
export function ramBlocked(x: number, y: number, who: Iterable<{ x: number; y: number }>): boolean {
  const B = SIEGE_WORKS.blockPx;
  for (const o of who) if (Math.abs(o.x - x) <= B && Math.abs(o.y - y) <= B && Math.hypot(o.x - x, o.y - y) <= B) return true;
  return false;
}

/**
 * One roll of the ram along a loop of length `len`: from `d` toward `goal` (the gate front's arc) the shorter way round,
 * `speed` x `dt` px, not at all while `held`. Returns the new distance, the direction it moved (+1 / -1, 0 when still)
 * and whether it is at the goal.
 */
export function ramStep(d: number, goal: number, len: number, speed: number, dt: number, held: boolean): { d: number; dir: number; arrived: boolean } {
  const L = len || 1;
  let delta = (((goal - d) % L) + L) % L;
  if (delta > L / 2) delta -= L;
  if (Math.abs(delta) < 1e-6) return { d: goal, dir: 0, arrived: true };
  if (held) return { d, dir: 0, arrived: false };
  const step = Math.max(0, speed * dt);
  if (Math.abs(delta) <= step) return { d: goal, dir: Math.sign(delta), arrived: true };
  return { d: d + Math.sign(delta) * step, dir: Math.sign(delta), arrived: false };
}

/** The ram as the "siege" view message carries it (server -> client only). */
export interface RamView { x: number; y: number; hp: number; maxHp: number; state: "rolling" | "held" | "gate" }
