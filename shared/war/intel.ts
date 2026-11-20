/**
 * War intel for the map overlays (world map, minimap): what a Hold fields, where the fronts run and the few places a
 * hero's clan calls them to. Pure functions of the war snapshot (view.ts), the clan's own plan (server -> client
 * "warplan", only to its sworn heroes: orders are secret) and the hero's writ, so client and tests read the same.
 * Hold discovery uses the client's fog and needs nothing here.
 */
import { TILE } from "../constants";
import { CLAN_KEYS, type ClanKey } from "./clans";
import { garrisonCount, garrisonSpots, patrolCount, patrolOf, TROOP } from "./patrols";
import { musterOf } from "./standards";
import { TERRITORIES } from "./territories";
import { WAR_TROOPS } from "./troops";
import type { HoldTier } from "./holdTiers";
import type { WarView } from "./view";
import type { WritKind } from "./writs";

/** What a Hold looks like from outside: its holder, Control, the guards and patrol column server/warTroops.ts fields there. */
export interface HoldIntel {
  clan?: ClanKey;
  control: number;
  /** The Hold's tier (holdTiers.ts): 0 outpost, 1 camp, 2 fortress (the camp when the snapshot has no tiers). */
  tier: HoldTier;
  /** Hold guards (garrisonCount at the tier, capped by the guard posts the ground allows). */
  guards: number;
  /** Soldiers in the patrol column (none while a siege is announced: they man the walls). */
  patrol: number;
  /** An announced siege: the attacker and the wall-clock ms it comes due. */
  siege?: [attacker: ClanKey, dueMs: number];
}

/**
 * Territory `t`'s Hold as the war snapshot tells it. Counts follow WarTroops.tick for an awake land; the room's troop
 * cap (WAR_TROOPS.maxTroops) can field fewer when many lands are awake at once.
 */
export function holdIntel(v: WarView, t: number): HoldIntel {
  const clan = CLAN_KEYS[v.owner[t]], control = v.control[t] ?? 100, sg = v.sieges.find((s) => s[0] === t);
  const fields = WAR_TROOPS.live && !!clan && !!patrolOf(t), tier = viewTier(v, t);
  const out: HoldIntel = {
    clan, control, tier,
    guards: fields ? holdGuards(t, control, tier) : 0,
    patrol: fields && !sg ? patrolCount(control) : 0,
  };
  const by = sg && CLAN_KEYS[sg[1]];
  if (sg && by) out.siege = [by, sg[2]];
  return out;
}

/** Territory t's Hold tier in a war snapshot (missing or junk: the camp, as before the tiers). */
export function viewTier(v: Pick<WarView, "tier">, t: number): HoldTier {
  const x = v.tier?.[t];
  return x === 0 || x === 1 || x === 2 ? x : 1;
}
/** Guards an awake land of Control `control` fields at its Hold of `tier`: garrisonCount, capped by the posts the ground allows (server/warTroops.ts and the map read the same). */
export const holdGuards = (t: number, control: number, tier: HoldTier) => Math.min(garrisonCount(control, tier), garrisonSpots(t, TROOP.garrison[tier][1], tier).length);

/** Neighbouring territory pairs [a, b] (a < b) held by different clans: the front lines. `owner` as in WarView. */
export function frontEdges(owner: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const t of TERRITORIES) {
    if (t.id >= owner.length) continue;
    for (const n of t.near) if (n > t.id && n < owner.length && owner[n] !== owner[t.id]) out.push([t.id, n]);
  }
  return out;
}

/**
 * A clan's attacks of the last war tick ("warplan", sent only to its sworn heroes). `tick`: the WarView.tick the plan
 * belongs to. Each march: the target land, the own land it is fed from, and 1 for a Hide-Kin tunnel strike.
 */
export type WarPlan = { tick: number; march: [from: number, to: number, tunnel: 0 | 1][] };

/** One row of the "call to arms" list. `x`, `y`: px of the land's Hold (its centre if it has none), for the map pin. */
export interface CallToArms {
  kind: "siege" | "writ" | "march" | "front";
  t: number;
  /** Territory name and holder (label data). */
  name: string;
  holder?: ClanKey;
  x: number; y: number;
  /** siege: the attacker, the wall-clock ms it comes due, and whether the hero's clan holds the land (defends). */
  by?: ClanKey; due?: number; defend?: boolean;
  /** writ: its kind. */
  writ?: WritKind;
  /** march: the own land the attack comes from, and 1 for a tunnel strike. */
  from?: number; tunnel?: 0 | 1;
}

/** Where a call points on the map: the land's muster (its fort if it has one), else its centre (px). */
export function landPin(t: number): { x: number; y: number } {
  const h = musterOf(t), T = TERRITORIES[t];
  return h ? { x: h.x, y: h.y } : { x: (T.cx + 0.5) * TILE, y: (T.cy + 0.5) * TILE };
}

const CALLS_MAX = 5;

/**
 * Where a hero sworn to `clan` is wanted, at most 5 rows by priority: sieges the clan attacks or defends (soonest
 * first), the active writ's land, the lands the clan marches on, then the front land nearest the hero (px). One row per
 * land (the first, most urgent one). Unsworn heroes get none.
 */
export function callsToArms(v: WarView, plan: WarPlan | undefined, writ: { t: number; kind: WritKind; clan?: ClanKey } | null | undefined,
  clan: ClanKey | undefined, hero: { x: number; y: number }): CallToArms[] {
  if (!clan) return [];
  const ci = CLAN_KEYS.indexOf(clan), out: CallToArms[] = [], used = new Set<number>();
  const ok = (t: number) => Number.isInteger(t) && t >= 0 && t < TERRITORIES.length && t < v.owner.length;
  const add = (t: number, kind: CallToArms["kind"], extra: Partial<CallToArms> = {}) => {
    if (!ok(t) || used.has(t)) return;
    used.add(t);
    out.push({ kind, t, name: TERRITORIES[t].name, holder: CLAN_KEYS[v.owner[t]], ...landPin(t), ...extra });
  };
  for (const [t, by, due] of [...v.sieges].filter((s) => s[1] === ci || v.owner[s[0]] === ci).sort((a, b) => a[2] - b[2] || a[0] - b[0]))
    add(t, "siege", { by: CLAN_KEYS[by], due, defend: v.owner[t] === ci });
  if (writ && (!writ.clan || writ.clan === clan)) add(writ.t, "writ", { writ: writ.kind });
  for (const [from, to, tunnel] of plan?.march ?? []) if (v.owner[to] !== ci) add(to, "march", { from, tunnel });
  let best = -1, bd = Infinity;
  const hx = hero.x / TILE, hy = hero.y / TILE;
  for (const T of TERRITORIES) {
    if (!ok(T.id) || v.owner[T.id] === ci || used.has(T.id) || !T.near.some((n) => v.owner[n] === ci)) continue;
    const d = Math.hypot(Math.max(0, T.x - hx, hx - (T.x + T.w)), Math.max(0, T.y - hy, hy - (T.y + T.h)));
    if (d < bd) { bd = d; best = T.id; }
  }
  if (best >= 0) add(best, "front");
  return out.slice(0, CALLS_MAX);
}
