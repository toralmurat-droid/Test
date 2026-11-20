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
  stick: 0.45,
  /** Murat 2026-11-20 (battles read as confused): a soldier locked in melee with its foe (within its reach + this, px), or
   * with a blow, rush, aimed shot or charge under way, keeps that foe and does not look round for another... */
  lockPx: 14,
  /** ...and when picking, each soldier of its own side already on a foe costs that foe this much score (troopers only:
   * the lines pair off along the front instead of piling onto a few men while others stand idle). */
  gangPen: 0.18,
  /** Walking into a tree or a rock with less than this share of the step made, a soldier steers round it (45 then 90
   * degrees, the same side for `sideMs` so it does not dither) instead of pushing on the spot. */
  unstick: { minShare: 0.35, sideMs: 900 },
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
  ranged: { shotMult: 0.6, range: 150, keepAway: 64, everyMs: 2000, windupMs: 500, sightPx: 200, radius: 3, guardTetherTiles: 2,
    /** A courtyard archer on its wall or tower shoots farther (range, sight: px), so a ranged hero (Summoner 220 px, Wizard 170) can't
     *  shoot it from just outside its bow without being shot back. */
    wall: { range: 230, sightPx: 260 } },
  /**
   * A courtyard archer (ROLE_PLAN.wall) or a Hold's guard pike whose target stays out of its reach (out of the archer's
   * bow or clear line, beyond the pike's blow) for `ms` drops it and won't pick it again for `shunMs`: it turns to another foe.
   */
  giveUp: { ms: 4000, shunMs: 8000 },
  /**
   * Role soldiers in the squads that fight a lone hero (planRole kinds: war road columns, caravan escorts, manhunters, the
   * ram crew; phase 4: tunnel waves, town gate guards) on top of their role's numbers (HP, damage: troopStats `mod`): at
   * full strength the roles cost a lone Songweaver up to 14 points and a Vampire 12 (tools/balance/pve.ts --column
   * --caravan --hunters --siege; the rule: every hero row within about 10 of the all-foot squads); a tunnel's waves up to
   * 31 (Songweaver Lv45, --tunnel), a gate's guard up to 15 (--troops --garrison). Patrols, guards, sieges, battles and a
   * ritual's acolytes (a sun-caster and a dune rider: within 10 untrimmed, --ritual) fight at full strength.
   */
  squad: { column: { hp: 0.9, dmg: 0.9 }, escort: { hp: 0.8, dmg: 0.8 }, hunt: { hp: 0.92, dmg: 0.92 }, ram: { hp: 0.85, dmg: 1 }, tunnel: { hp: 0.8, dmg: 0.8 }, gate: { hp: 0.9, dmg: 0.9 } } as Partial<Record<RolePlace, { hp: number; dmg: number }>>,
  /**
   * `brace`: a pike facing a rival rider's charge (winding up or galloping at it, or galloping into its front) braces for
   * `ms` (Mob.winding, so the clients see it) and stops the charge on its point: its blow (x vs.pike.rider, x dmgMult)
   * lands at once and the rider is thrown off its stride for `stunMs`. Only a pike that is not stunned or broken braces.
   */
  /**
   * `call`: a tethered pike struck by a hero it cannot reach from its tether (a Wizard or Songweaver shooting from just
   * beyond it) calls the `mates` nearest soldiers of its clan within `px` of it that can answer (not tethered pikes) onto
   * that hero: for `ms` each sees them from up to `sightPx` and favours them by `bonus` when it picks a foe. With no one
   * to call, the pike sallies itself: for `ms` its tether doesn't hold it back from that hero. At most once per `everyMs`.
   */
  pike: { reach: 14, tetherTiles: 3, brace: { ms: 700, stunMs: 900, dmgMult: 1 }, call: { px: 256, mates: 2, sightPx: 400, bonus: 0.5, ms: 6000, everyMs: 1000 } },
  /**
   * `fielded`: roleOf fields riders (false: foot in their place). The charge: a rider whose charge is ready and whose foe
   * is `min`..`max` px off winds up for `windupMs` (Mob.winding and an sfx "troop_charge" with the lane: the line is
   * fixed when the wind-up starts, so a hero who steps out of it is missed), then gallops that lane at speedMult x its
   * speed for at most `gallopMs`. The first foe it reaches (its target, within its reach + WAR_TROOPS.rushSlack) takes
   * dmgMult x its blow, a knockback (`kb`, x a blow's) and a `stunMs` stagger; then the charge cools for `everyMs` from
   * the gallop's end (a charge broken off before it struck or missed, by a stun or a lost foe: `breakMs`). With its charge
   * ready and its foe closer than `min` it wheels away for up to `wheelMs` to get a run-up (once per cooldown: after a
   * wheel that found no room it fights on foot and tries again `everyMs` / 2 later). The gallop moves in strides of at
   * most `stridePx` (several per tick when the server's ticks run long), each checked for a braced pike and its target:
   * below the brace reach (32 px) and the blow's (22 px on a hero), so a slow tick never carries the rider through either.
   */
  rider: { fielded: true as boolean, charge: { min: 80, max: 200, windupMs: 550, gallopMs: 1000, speedMult: 2.2, dmgMult: 1.7, kb: 2.5, stunMs: 250, everyMs: 6000, breakMs: 2000, wheelMs: 1200, stridePx: 12 } },
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
 * The other troop modules (phase 3; planRole, battleRole): `column` a war road column (server/warMarches.ts, the officer
 * at the anchor and the men two abreast behind him, so archers march at the rear); `siege` the places at one siege front
 * per side (server/warSieges.ts; place 0 the gate front's officer, the last places on the line's flank: ROLE_FORM puts
 * archers behind the line and riders out on the flank; a smaller force drops the last places first); `ram` the bone ram's
 * crew (server/warWorks.ts: a pike tethered to the ram beside a foot soldier; two pikes cost a lone Songweaver 20 points in pve.ts --siege); `battle` the field battles' lines (server/warBattles.ts,
 * battleRole: the front line's places cycle through `front` with `wings` riders at each end, the rear line's through
 * `rear`; captains are foot); `escort` a caravan's escorts (server/warCaravans.ts: place 0 rides ahead of the cart);
 * `hunt` a manhunter squad (server/warFeuds.ts, place 0 the captain). Phase 4: `tunnel` the places of each wave out of a
 * Hide-Kin tunnel mouth (server/warTunnels.ts; by place in the wave); `ritual` a Veiled circle's acolytes
 * (server/warRituals.ts: archers stand inside the circle, the others on it); `gate` a contested town's gate guard
 * (server/warTowns.ts, place 0 the captain on the gate: shared/war/troopRoles.ts gateGuardPosts puts the pikes on the ring's
 * outer side and the archers behind them, toward the town). Head counts never change: only who is what.
 */
export const ROLE_PLAN: {
  march: TroopRole[]; guard: Record<HoldTier, TroopRole[]>; wall: Record<HoldTier, number[]>;
  column: TroopRole[]; siege: { atk: TroopRole[]; def: TroopRole[] }; ram: TroopRole[];
  battle: { front: TroopRole[]; rear: TroopRole[]; wings: number }; escort: TroopRole[]; hunt: TroopRole[];
  tunnel: TroopRole[]; ritual: TroopRole[]; gate: TroopRole[];
} = {
  march: ["foot", "rider", "pike", "pike", "foot", "archer", "foot", "archer"],
  guard: {
    0: ["foot", "archer", "pike"],
    1: ["foot", "archer", "pike", "archer", "foot", "pike"],
    2: ["foot", "archer", "pike", "archer", "pike", "archer", "rider", "foot"],
  },
  wall: { 0: [], 1: [3], 2: [3, 5] },
  column: ["foot", "rider", "pike", "pike", "foot", "archer", "foot", "archer"],
  siege: { atk: ["foot", "archer", "pike", "rider"], def: ["foot", "pike", "archer", "archer"] },
  ram: ["pike", "foot"],
  battle: { front: ["foot", "pike"], rear: ["archer", "archer", "foot"], wings: 3 },
  escort: ["rider", "foot", "foot"],
  hunt: ["foot", "rider", "archer", "pike", "foot"],
  tunnel: ["pike", "foot", "rider"],
  ritual: ["pike", "archer", "rider"],
  gate: ["foot", "pike", "archer", "pike", "archer"],
};
/** Formation shifts by role (px) where a module stands its men in a line (sieges, battles: shared/war/troopRoles.ts rolePlace): archers this far behind their place, riders this far out on their flank. */
export const ROLE_FORM = { archerBack: 20, riderWide: 18 };

/** Clan `k`'s soldier for a planned role: a role the clan lacks (CLAN_ROLES), or riders while not fielded, is foot. */
export function fieldRole(k: ClanKey, r: TroopRole | undefined): TroopRole {
  if (!r || r === "foot" || !CLAN_ROLES[k]?.[r] || (r === "rider" && !TROOP_ROLE.rider.fielded)) return "foot";
  return r;
}

/**
 * The role of place `i` in clan `k`'s patrol column (`march`) or its Hold's guard (`guard`, at Hold `tier`): pure and
 * by index, so the counts never change: place 0 (the officer) is foot, a role the clan lacks or one not fielded yet is foot.
 */
export function roleOf(k: ClanKey, kind: "march" | "guard", tier: HoldTier, i: number): TroopRole {
  const r = (kind === "march" ? ROLE_PLAN.march : ROLE_PLAN.guard[tier] ?? ROLE_PLAN.guard[1])[i] ?? "foot";
  return i === 0 ? "foot" : fieldRole(k, r);
}

/** The squad multipliers (TROOP_ROLE.squad) of a `role` soldier in a `kind` of squad: undefined for foot, or a kind with none. */
export const squadMod = (kind: RolePlace, role: TroopRole): { hp: number; dmg: number } | undefined => (role === "foot" ? undefined : TROOP_ROLE.squad[kind]);

/**
 * The places the other troop modules plan by index (ROLE_PLAN): a war road column, a siege front's attackers or
 * defenders, a ram's crew, a caravan's escorts, a manhunter squad; a tunnel wave, a ritual's acolytes, a town's gate guard.
 */
export type RolePlace = "column" | "siegeAtk" | "siegeDef" | "ram" | "escort" | "hunt" | "tunnel" | "ritual" | "gate";
/**
 * The role of place `i` of clan `k` in one of those (ROLE_PLAN; battles: shared/war/troopRoles.ts battleRole). Pure and
 * by index; places past the plan are foot. Officers stay foot whatever the plan (the caller passes the officer's place).
 */
export function planRole(k: ClanKey, kind: RolePlace, i: number): TroopRole {
  const P = ROLE_PLAN, plan = kind === "siegeAtk" ? P.siege.atk : kind === "siegeDef" ? P.siege.def : P[kind];
  return fieldRole(k, plan[i]);
}

/**
 * A trooper's fighting numbers at `level` (server/warTroops.ts and the PvE sim read the same); `shot` only for an archer
 * (its bow's damage). `mod`: a role soldier's squad multipliers (TROOP_ROLE.squad, squadMod); never on foot.
 */
export function troopStats(k: ClanKey, level: number, officer = false, role: TroopRole = "foot", mod?: { hp: number; dmg: number }): { hp: number; dmg: number; speed: number; cd: number; shot?: number } {
  const d = MOBS.trooper, c = TROOP_COMBAT[k], o = officer ? TROOP_OFFICER : { hp: 1, dmg: 1 }, V = TROOP_VETERAN, up = Math.max(0, level - V.from);
  const q = role !== "foot" && mod ? mod : { hp: 1, dmg: 1 };
  const r0 = TROOP_ROLE.mult[role] ?? TROOP_ROLE.mult.foot, r = { hp: r0.hp * q.hp, dmg: r0.dmg * q.dmg, speed: r0.speed }, base = d.damage * mobScale(level, "damage") * c.dmg * o.dmg;
  const st: { hp: number; dmg: number; speed: number; cd: number; shot?: number } = {
    hp: Math.max(1, Math.round(d.maxHp * mobScale(level, "hp") * c.hp * o.hp * r.hp * (1 + V.hp * up))),
    dmg: Math.max(1, Math.round(base * r.dmg * (1 + V.dmg * up))),
    speed: d.speed * c.speed * r.speed, cd: d.attackCooldownMs * c.cd };
  if (role === "archer") st.shot = Math.max(1, Math.round(base * TROOP_ROLE.ranged.shotMult * q.dmg * (1 + V.dmg * up)));
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
