/**
 * Clan troops that fight (roadmap: "troops that really fight", PR1). Each awake land's holder fields its patrol column
 * and Hold guards as real monsters (MobKind "trooper", server/warTroops.ts): they march the cosmetic route of
 * shared/war/patrols.ts, guard the Hold, hunt the wild monsters of their land and fight heroes sworn to clans at war
 * with theirs, or who provoked them or are Wanted by them (shared/war/feuds.ts, troopStance).
 * The clan rides in the existing Mob.weapon string ("<clanKey>", "<clanKey>*" for the officer), so the synced Mob
 * schema is unchanged; so does a soldier's role (TroopRole: "<clanKey>)" an archer, ">" a rider, "|" a pike). Pure rules
 * and numbers: the room module and the tests read them.
 */
import { MOBS, mobScale } from "../constants";
import type { ClanKey } from "./clans";
import type { HoldTier } from "./holdTiers";
import { TROOP, type Patrol } from "./patrols";
import { atWar, grudgeActive, type FeudState } from "./feuds";
import { isClan, STANDARD } from "./standards";
import { TERRITORIES } from "./territories";

export const WAR_TROOPS = {
  /** Master switch: off, no land ever wakes (the cosmetic client squads stay). */
  live: true,
  /** A land wakes when a living hero above ground is this close to its rect (tiles). */
  wakeTiles: 34,
  /** ...and sleeps (its troops vanish) after this long with no hero that close. */
  sleepMs: 60_000,
  /** A fallen trooper's slot is filled again at the Hold gate after this long. */
  respawnMs: 60_000,
  /** Troopers alive in one room at most (lands nearest the heroes come first; 120 cost too much tick time in npm run bench SPREAD=1). */
  maxTroops: 80,
  /** Sight (px): a trooper picks targets this close to it (twice that for whoever hit it). */
  aggroPx: 160,
  /** Wild monsters are hunted only this many tiles past the land's rect. */
  mobMarginTiles: 2,
  /** No trooper chases anything farther than this past its land's rect (tiles). */
  leashTiles: 6,
  /** Valor (and as much renown) a sworn hero earns for their clan by felling a soldier of a clan at war with theirs, in
   * the land they stand in: a soldier, an officer, a hero sworn to that clan (W2c: valor comes from fighting, not from
   * standing at a standard; carts, rams and tunnel mouths pay through their own rules)... */
  killPts: { soldier: 1, officer: 2, hero: 3 },
  /** ...at most this much per hero per war tick (WAR.tickMs). */
  killValorPerTick: 12,
  /** How often a trooper looks for a target (ms). */
  pickMs: 400,
  /** Score bonuses when picking a foe: an enemy hero comes first, then a trooper of another clan, then wild monsters. */
  heroBonus: 0.5, troopBonus: 0.3,
  /** Score kept by the current target (no flicker between two equal foes). */
  stick: 0.3,
  /** Out of formation by more than this (px), a trooper hurries back at its full speed instead of the march pace. */
  slackPx: 24,
  /** Back in formation, a trooper walks at the column's pace times this (a little quicker, to catch up). */
  catchUp: 1.15,
  /** A trooper's reach (px) past MOB_ATTACK_RANGE: its target's body (mobBody) for a monster, `heroBody` for a hero;
   * the rush blow lands within `rushSlack` of that, a wound-up blow within `swingSlack` (the foe may step back a little). */
  heroBody: 4, rushSlack: 4, swingSlack: 6,
  /** A trooper with no hero within this (px, square) just keeps its place in the column: no walking, no fights nobody sees. */
  livePx: 22 * 32,
  /** A trooper this far from its post (px) with no hero within `warpUnseenPx` is put back on it (stuck behind a wall). */
  warpPx: 10 * 32, warpUnseenPx: 18 * 32,
  /** The soldier's rush: a foe this far off (px) is closed at speedMult for ms, and the blow on arrival hits dmgMult harder
   * (no arrival within missGraceMs after the rush ends: it missed). */
  rush: { min: 36, max: 130, ms: 320, speedMult: 3, everyMs: 4000, dmgMult: 1.3, missGraceMs: 250 },
  /** A javelin thrown at an enemy hero this far off (px): wind-up, then a shot that only hurts heroes the troops fight. */
  javelin: { min: 56, max: 150, everyMs: 4500, windupMs: 450, dmgMult: 0.9, speed: 240, radius: 4 },
};

/**
 * Per-clan multipliers on the trooper's MOBS numbers, a modest spread by doctrine: Wardens tankier, Redfang harder
 * hitting, the Host slow but tough, the Hide-Kin quick, the Veiled few but strong (tools/balance/pve.ts --troops).
 */
export const TROOP_COMBAT: Record<ClanKey, { hp: number; dmg: number; speed: number; cd: number }> = {
  wardens: { hp: 1.15, dmg: 0.9, speed: 1, cd: 1 },
  redfang: { hp: 0.9, dmg: 1.15, speed: 1.05, cd: 1 },
  host: { hp: 1.2, dmg: 1, speed: 0.85, cd: 1.1 },
  hidekin: { hp: 0.9, dmg: 0.95, speed: 1.15, cd: 0.9 },
  veiled: { hp: 1, dmg: 1.1, speed: 1, cd: 1 },
};
/** An officer (the "*" ones: column leader, first guard) on top of his clan's numbers. */
export const TROOP_OFFICER = { hp: 1.7, dmg: 1.25 };
/**
 * Veterans: one MOBS entry serves every land from Lv 5 to 50, but heroes outgrow the plain level curve (zone monsters
 * get tougher kinds as you go), so troops of higher lands gain this share per level above `from` on top of mobScale.
 */
export const TROOP_VETERAN = { from: 8, hp: 0.02, dmg: 0.025 };

/**
 * What a soldier does in the line (Murat: "archers, cavalry, spikemen"): the plain `foot` soldier, an `archer` who shoots
 * from range and steps back, a `rider` who charges from a run-up and a `pike` who holds its place with a longer reach and
 * braces against a charge. Officers are always foot. Carried as one mark on the clan key in Mob.weapon (troopWeapon).
 */
export type TroopRole = "foot" | "archer" | "rider" | "pike";
export const TROOP_ROLES: readonly TroopRole[] = ["foot", "archer", "rider", "pike"];

/**
 * The roles' numbers on top of the clan's (troopStats): `mult` on HP, melee damage and speed; the archer's bow
 * (`ranged`: its shot hits shotMult of a foot soldier's blow, from up to `range`, stepping back from foes inside
 * `keepAway`; a guard archer steps back at most `guardTetherTiles` from its post); the pike's reach past a foot soldier's
 * and how far it leaves its post or column place (`pike.tetherTiles`), its brace (`pike.brace`); the rider's charge
 * (`rider.charge`); the counters between troops (`vs`: attacker role -> defender role -> damage multiplier, troop against
 * troop only: never on heroes or wild monsters).
 */
export const TROOP_ROLE = {
  mult: {
    foot: { hp: 1, dmg: 1, speed: 1 },
    archer: { hp: 0.7, dmg: 0.6, speed: 1 },
    rider: { hp: 1.1, dmg: 1.1, speed: 1.6 },
    pike: { hp: 1.2, dmg: 1, speed: 0.85 },
  } as Record<TroopRole, { hp: number; dmg: number; speed: number }>,
  // (the plan's 0.8 / 170 px / 80 px / 1.6 s cost a lone wizard 10-25 points against a Hold's garrison: pve.ts --garrison keeps it within 10)
  ranged: { shotMult: 0.6, range: 150, keepAway: 64, everyMs: 2000, windupMs: 500, sightPx: 200, radius: 3, guardTetherTiles: 2 },
  /**
   * `brace`: a pike facing a rival rider's charge (winding up or galloping at it, or galloping into its front) braces for
   * `ms` (Mob.winding, so the clients see it) and stops the charge on its point: its blow (x vs.pike.rider, x dmgMult)
   * lands at once and the rider is thrown off its stride for `stunMs`. Only a pike that is not stunned or broken braces.
   */
  pike: { reach: 14, tetherTiles: 3, brace: { ms: 700, stunMs: 900, dmgMult: 1 } },
  /**
   * `fielded`: roleOf fields riders (false: foot in their place). The charge: a rider whose charge is ready and whose foe
   * is `min`..`max` px off winds up for `windupMs` (Mob.winding and an sfx "troop_charge" with the lane: the line is
   * fixed when the wind-up starts, so a hero who steps out of it is missed), then gallops that lane at speedMult x its
   * speed for at most `gallopMs`. The first foe it reaches (its target, within its reach + WAR_TROOPS.rushSlack) takes
   * dmgMult x its blow, a knockback (`kb`, x a blow's) and a `stunMs` stagger; then the charge cools for `everyMs` from
   * the gallop's end. With its charge ready and its foe closer than `min` it wheels away for up to `wheelMs` to get a
   * run-up (once per cooldown: after a wheel that found no room it fights on foot and tries again `everyMs` / 2 later).
   */
  rider: { fielded: true as boolean, charge: { min: 80, max: 200, windupMs: 550, gallopMs: 1000, speedMult: 2.2, dmgMult: 1.7, kb: 2.5, stunMs: 250, everyMs: 6000, wheelMs: 1200 } },
  vs: { archer: { pike: 1.25 }, pike: { rider: 2 }, rider: { archer: 1.5 } } as Partial<Record<TroopRole, Partial<Record<TroopRole, number>>>>,
};

/** One clan's take on a role: its name ("Warden longbowman") and, for archers, what it shoots (a client projectile kind) and how fast (px/s). */
export interface ClanRole { name: string; shot?: string; shotSpeed?: number }
/**
 * Which roles each clan fields, by doctrine rather than the same for all: the Wardens' longbows and pikes, Redfang's
 * slingers (no pikes: they rush), the Host's bone archers and phalanx, the Hide-Kin's burrow-spears (no ranged: they
 * close in), the Veiled's sun-casters; every clan has its riders (Warden lancers, Redfang raiders, the Host's bone riders,
 * Hide-Kin boar riders, Veiled dune riders). A role a clan lacks is filled with foot (roleOf).
 */
export const CLAN_ROLES: Record<ClanKey, Partial<Record<Exclude<TroopRole, "foot">, ClanRole>>> = {
  wardens: { archer: { name: "longbowman", shot: "arrow", shotSpeed: 230 }, pike: { name: "pikeman" }, rider: { name: "lancer" } },
  redfang: { archer: { name: "slinger", shot: "stone", shotSpeed: 170 }, rider: { name: "raider" } },
  host: { archer: { name: "bone archer", shot: "arrow", shotSpeed: 210 }, pike: { name: "pike phalanx" }, rider: { name: "bone rider" } },
  hidekin: { pike: { name: "burrow-spear" }, rider: { name: "boar rider" } },
  veiled: { archer: { name: "sun-caster", shot: "sunbolt", shotSpeed: 160 }, rider: { name: "dune rider" } },
};

/**
 * Who stands in each place: a patrol column of 8 (the officer first) and a Hold's guards per tier (outpost, camp,
 * fortress); `wall`: the guard places (by index) whose archer stands on the fort's walls or towers instead of a post
 * outside (courtyard archers: shared/war/troopRoles.ts wallPost; a clan whose fort has no wall cell there, or that has
 * no archers, keeps the post outside).
 */
export const ROLE_PLAN: { march: TroopRole[]; guard: Record<HoldTier, TroopRole[]>; wall: Record<HoldTier, number[]> } = {
  march: ["foot", "rider", "pike", "pike", "foot", "archer", "foot", "archer"],
  guard: {
    0: ["foot", "archer", "pike"],
    1: ["foot", "archer", "pike", "archer", "foot", "pike"],
    2: ["foot", "archer", "pike", "archer", "pike", "archer", "rider", "foot"],
  },
  wall: { 0: [], 1: [3], 2: [3, 5] },
};

/**
 * The role of place `i` in clan `k`'s patrol column (`march`) or its Hold's guard (`guard`, at Hold `tier`): pure and
 * by index, so the counts never change: place 0 (the officer) is foot, a role the clan lacks or one not fielded yet is foot.
 */
export function roleOf(k: ClanKey, kind: "march" | "guard", tier: HoldTier, i: number): TroopRole {
  const r = (kind === "march" ? ROLE_PLAN.march : ROLE_PLAN.guard[tier] ?? ROLE_PLAN.guard[1])[i] ?? "foot";
  if (r === "foot" || i === 0 || !CLAN_ROLES[k]?.[r] || (r === "rider" && !TROOP_ROLE.rider.fielded)) return "foot";
  return r;
}

/** A trooper's fighting numbers at `level` (server/warTroops.ts and the PvE sim read the same); `shot` only for an archer (its bow's damage). */
export function troopStats(k: ClanKey, level: number, officer = false, role: TroopRole = "foot"): { hp: number; dmg: number; speed: number; cd: number; shot?: number } {
  const d = MOBS.trooper, c = TROOP_COMBAT[k], o = officer ? TROOP_OFFICER : { hp: 1, dmg: 1 }, V = TROOP_VETERAN, up = Math.max(0, level - V.from);
  const r = TROOP_ROLE.mult[role] ?? TROOP_ROLE.mult.foot, base = d.damage * mobScale(level, "damage") * c.dmg * o.dmg;
  const st: { hp: number; dmg: number; speed: number; cd: number; shot?: number } = {
    hp: Math.max(1, Math.round(d.maxHp * mobScale(level, "hp") * c.hp * o.hp * r.hp * (1 + V.hp * up))),
    dmg: Math.max(1, Math.round(base * r.dmg * (1 + V.dmg * up))),
    speed: d.speed * c.speed * r.speed, cd: d.attackCooldownMs * c.cd };
  if (role === "archer") st.shot = Math.max(1, Math.round(base * TROOP_ROLE.ranged.shotMult * (1 + V.dmg * up)));
  return st;
}

/** What a trooper is: a fighting soldier or officer, or an object heroes wreck (a supply cart, a siege ram: shared/war/works.ts, a Hide-Kin tunnel mouth: shared/war/tunnels.ts). */
export type TroopPart = "soldier" | "officer" | "cart" | "ram" | "mouth";
/** The suffix each part carries on its clan key in Mob.weapon. */
const PART_MARK: Record<TroopPart, string> = { soldier: "", officer: "*", cart: "^", ram: "#", mouth: "~" };
const MARK_PART: Record<string, TroopPart> = { "*": "officer", "^": "cart", "#": "ram", "~": "mouth" };
/** The suffix a soldier's role carries (foot: none). Only a soldier has one, and one at most. */
export const ROLE_MARK: Record<TroopRole, string> = { foot: "", archer: ")", rider: ">", pike: "|" };
const MARK_ROLE: Record<string, Exclude<TroopRole, "foot">> = { ")": "archer", ">": "rider", "|": "pike" };

/**
 * The Mob.weapon value of a trooper of clan `k`: "<clan>", "<clan>*" for an officer, "<clan>^" for a supply cart
 * (shared/war/caravans.ts), "<clan>#" for a siege ram (shared/war/works.ts, `ram`), "<clan>~" for a tunnel mouth (shared/war/tunnels.ts, `mouth`);
 * a soldier of another `role` than foot: "<clan>)" an archer, "<clan>>" a rider, "<clan>|" a pike (officers and objects carry none).
 */
export const troopWeapon = (k: ClanKey, officer = false, cart = false, ram = false, mouth = false, role: TroopRole = "foot") => {
  const part: TroopPart = mouth ? "mouth" : ram ? "ram" : cart ? "cart" : officer ? "officer" : "soldier";
  return k + (part === "soldier" ? ROLE_MARK[role] ?? "" : PART_MARK[part]);
};

/**
 * A parsed trooper weapon. `object` (a cart, a ram or a tunnel mouth) never fights and is never fought by troopers;
 * `officer`/`cart` are kept for older callers; `role` is set only on a soldier marked with one (absent: foot, so an
 * older weapon string parses exactly as it did): read it as `role ?? "foot"`.
 */
export interface TroopInfo { clan: ClanKey; part: TroopPart; officer: boolean; cart: boolean; object: boolean; role?: Exclude<TroopRole, "foot"> }

/** A trooper's clan, part and role from its Mob.weapon (carts and rams are troopers too, so every trooper gate applies), or undefined for anything else. */
export function parseTroop(w: unknown): TroopInfo | undefined {
  if (typeof w !== "string") return undefined;
  const last = w.slice(-1), role = MARK_ROLE[last];
  const part: TroopPart = MARK_PART[last] ?? "soldier";
  const k = part === "soldier" && !role ? w : w.slice(0, -1);
  if (!isClan(k)) return undefined;
  const t: TroopInfo = { clan: k, part, officer: part === "officer", cart: part === "cart", object: part === "cart" || part === "ram" || part === "mouth" };
  if (role) t.role = role;
  return t;
}

/** A trooper's level in territory `t`: soldiers at the middle of its monster band, officers at the top. */
export function troopLevel(t: number, officer = false): number {
  const lv = TERRITORIES[t]?.levels ?? [1, 1];
  const want = officer ? lv[1] : Math.round((lv[0] + lv[1]) / 2);
  return Math.max(1, Math.min(lv[1], want));
}

export type TroopStance = "ally" | "neutral" | "enemy";
/**
 * How clan `troop`'s soldiers see a hero: their own sworn heroes are allies; heroes sworn to a clan at war with them
 * (feuds.ts atWar), and anyone they hold a grudge against or want (a provocation, kills: feuds.ts), are enemies;
 * everyone else (unsworn heroes, heroes of clans far away, anyone under STANDARD.minLevel) is left alone and can't hurt
 * them either (a stray Blizzard starts no fight: the server's WarTroops.canHurt and the client's attack cursor read this).
 */
export function troopStance(troop: ClanKey, hero: { clan?: ClanKey; level: number; feud?: FeudState }, now = Date.now()): TroopStance {
  if (hero.level < STANDARD.minLevel) return "neutral";
  if (hero.clan === troop) return "ally";
  if (hero.clan && atWar(hero.clan, troop)) return "enemy";
  return grudgeActive(hero.feud, troop, now) ? "enemy" : "neutral";
}

/** A short name for a trooper (name label, death messages): "Redfang soldier", "Redfang captain", "Redfang supply cart", "Ossuary Host bone ram", "Hide-Kin tunnel", "Warden longbowman" (a role: CLAN_ROLES). */
export function troopName(k: ClanKey, officer = false, cart = false, ram = false, mouth = false, role: TroopRole = "foot"): string {
  if (mouth) return `${TROOP_SHORT[k]} tunnel`;
  if (ram) return `${k === "host" ? "Ossuary Host" : TROOP_SHORT[k]} bone ram`;
  const named = !cart && !officer && role !== "foot" ? CLAN_ROLES[k]?.[role]?.name : undefined;
  return `${TROOP_SHORT[k]} ${named ?? (cart ? "supply cart" : officer ? "captain" : "soldier")}`;
}
/** The word a clan's soldiers go by (name tags): "The Hearthbound Wardens" -> "Warden". */
export const TROOP_SHORT: Record<ClanKey, string> = { wardens: "Warden", redfang: "Redfang", host: "Ossuary", hidekin: "Hide-Kin", veiled: "Veiled" };

const arcCache = new WeakMap<Patrol, { arcs: number[]; cycle: number }>();
/** Per-stop arc positions (px, ascending) and the virtual loop length with one pause per stop. */
function arcsOf(p: Patrol) {
  let c = arcCache.get(p);
  if (!c) {
    let acc = 0;
    const at = p.pts.map((a, i) => { const s = acc, b = p.pts[(i + 1) % p.pts.length]; acc += Math.hypot(b.x - a.x, b.y - a.y); return s; });
    const arcs = p.stops.map((i) => at[i]).sort((a, b) => a - b);
    c = { arcs, cycle: p.len + arcs.length * pauseD() };
    arcCache.set(p, c);
  }
  return c;
}
const pauseD = () => (TROOP.speed * TROOP.pauseMs) / 1000;

/**
 * Distance along the loop of a column's leader at wall time `wall`, and whether it stands at a stop: one speed with a
 * pause spliced in at every stop, phased per land like the client's cosmetic squads (client/src/warTroops.ts lead).
 */
export function columnLead(p: Patrol, wall: number): { d: number; paused: boolean } {
  const { arcs, cycle } = arcsOf(p), pd = pauseD();
  if (cycle <= 0) return { d: 0, paused: true };
  const phase = (p.t * 977) % cycle, u = ((((wall / 1000) * TROOP.speed + phase) % cycle) + cycle) % cycle;
  for (let k = 0; k < arcs.length; k++) {
    const arrive = arcs[k] + k * pd;
    if (u < arrive) return { d: u - k * pd, paused: false };
    if (u < arrive + pd) return { d: arcs[k], paused: true };
  }
  return { d: u - arcs.length * pd, paused: false };
}
