/**
 * The Forge (roadmap M4): a clan researches its own weapon or monster from parts that already exist. Recipes never add
 * numbers or art of their own: a weapon is an existing typed weapon with 1-3 of the gear affixes built in, a new element
 * share and a palette from a closed list; a monster is an existing zone monster with HP / damage / speed multipliers in
 * a narrow range, up to two of its own family's champion affixes, and a palette. Both must fit a power budget
 * (itemPower / mobPower) and pass the sim gate (tools/balance/forgeGate.ts) before they can appear.
 *
 * Runtime model: a forged weapon is a new base item id `fg<seq>_<baseGearId>` (shared/gear.ts setForgedGear resolves it);
 * a forged monster never becomes a new MobKind: it is the base kind with a ForgedMob variant (applyVariant), so every
 * Record<MobKind, ...> table (loot, combat, art) applies unchanged.
 *
 * Pure rules and data. The live loop (registry, research, spawns, drops, sales) is server/forge.ts and server/forgeMobs.ts.
 */
import { BOSS, ELITE, MOBS, SKELETON_WEAPONS, type MobDef, type MobKind } from "./constants";
import { BANDIT_ROLES } from "./bandits";
import { AFFIXES as CHAMP_AFFIXES, FAMILIES, FAMILY_OF, type AffixKey as ChampAffixKey } from "./champions";
import { ELEMENTS, type Element } from "./elements";
import {
  AFFIX_KEYS, AFFIXES as GEAR_AFFIXES, affixFits, affixMax, FORGED_GEAR_RE, GEAR, isForgeWeaponBase, parseForgedGearId,
  type Affix, type AffixKey, type ForgedGearInfo, type ForgeStatus, type GearBonus, type GearDef,
} from "./gear";
import { SPAWN_ZONES } from "./spawns";
import { isSummonKind } from "./summons";
import { CLAN_KEYS, CLANS, type ClanKey } from "./war/clans";

export type { ForgeStatus } from "./gear";

/** Forge rules and budgets. Owner defaults of 2026-11-17 are marked; the budgets are calibrated with forgeGate (docs/forge-progress.md). */
export const FORGE = {
  /** Owner default: a recipe takes one day of research before it can be forged. */
  researchDays: 1,
  /** Owner default: forging costs this share of the clan's army (spent by the server loop, PR2). */
  armyCost: 0.1,
  /** Owner default: forged monsters walk only in the clan's own lands for now (not in its troops or garrisons). */
  mobsIn: "lands" as const,
  /** Live loop (server/forge.ts, PR2): in a land its clan holds, a spawn of a forged monster's base kind comes as the forging this often. */
  spawnShare: 0.25,
  /** A forged monster leaves one of its clan's forged weapons this often (on top of its normal loot). */
  dropChance: 0.05,
  /** Live forgings per clan and kind: a new one past this retires the clan's oldest of that kind. */
  perClan: { weapon: 2, monster: 2 } as Record<"weapon" | "monster", number>,
  /** Commissions per war day, all clans together. */
  perDay: 5,
  /** Forge log entries kept (oldest dropped first). */
  logMax: 200,
  nameMax: 32,
  /** Weapons: the element share may be at most this, in steps of shareStep. */
  maxShare: 0.5, shareStep: 0.05,
  minImplicits: 1, maxImplicits: 3,
  /** Monsters: at most this many champion affixes of the base's own family (no family = none, e.g. Act 3-6 kinds without one). */
  maxAffixes: 2,
  /** Monster multiplier ranges (inclusive). */
  range: { hp: [0.8, 1.6], dmg: [0.8, 1.4], speed: [0.9, 1.15] } as Record<"hp" | "dmg" | "speed", [number, number]>,
  /**
   * itemPower weights per bonus point. reach: per 1.0 (+100%); share: per 1.0 of element share, times the weapon's attack
   * (0.15 x atk per 0.1). reach was planned at 60 per 1.0; calibrated to 8 so the three tier-3 weapons (Dragonfire 12.9,
   * Skyreach 12.8, Starfire 11.8) come out level, the way the designers traded attack for reach (Longreach: -1 atk, +0.4 reach).
   * elemFlat was planned at 0.9; at 1.2 because flat elemental damage rides every hit of a fast caster (forgeGate: an Oak
   * Staff with +3 fire per hit made the Wizard kill 17% faster at 0.9's budget).
   */
  weight: { atk: 1, str: 0.6, mag: 0.6, dex: 0.6, sta: 0.6, elemFlat: 1.2, reach: 8, share: 1.5 },
  /** A forged weapon's itemPower may be at most this times the strongest tier-3 weapon's (GEAR, item level 1). */
  weaponBudget: 1.1,
  /** A forged monster's mobPower (hp x dmg x speed^0.5 x (1 + affix costs + affixPair)) may be at most this. */
  mobBudget: 1.8,
  /**
   * What each champion affix adds to mobPower, measured with forgeGate (time to kill and HP lost against the plain monster,
   * no champion HP or damage multiplier). Kept on the high side so the cheap ones can't stack into a wall.
   */
  affixCost: {
    split: 0.75, taint: 0.2, siege: 0.35, risen: 0.35, stitched: 0.2, gang: 1.25, sunborn: 0.25, buried: 0.15, deepvenom: 0.2,
    veil: 0.15, brand: 0.25,
  } as Record<ChampAffixKey, number>,
  /** Two affixes feed each other (a Risen siegewright gets up beside its ballista): this much more on top of their costs. */
  affixPair: 0.2,
  /** The sim gate (tools/balance/forgeGate.ts). */
  gate: {
    /** Fights per class and level (planned 12; 24 halves the noise of a cell and still runs in about a second for a monster). */
    runs: 24, timeoutMs: 60_000,
    /** Monsters: the hero must still win this often, or as often as against the plain monster when that is lower. */
    minWin: 0.7,
    /**
     * Monsters: seconds and HP lost per kill may grow at most this times mobPower against the plain monster (mobPower
     * capped at mobBudget, so the sim holds the budget even if the formula were bypassed).
     */
    mobSlack: 1.3,
    /** Monsters: HP lost per kill under this share of the hero's HP counts as this much: a fight that costs less is easy either way (no division by ~0). */
    hpFloor: 0.1,
    /** Weapons: zone runs may get at most this much faster per kill than with the usual weapon. */
    weaponGain: 0.15,
    /** Weapons: same-class duels with the forged weapon against the usual one may be won at most this often. */
    duelMax: 0.6,
    /** Weapons: duels per run (sides swapped); both weapon checks are judged per class over all levels tested. */
    duelsPerRun: 4,
    /** Weapons: hero levels tested when the recipe sets none (tier-3 gear from 20). */
    weaponLevels: [22, 30],
  },
};

// ---- Palettes ------------------------------------------------------------------------------------------------
/** The colours a forging may wear: each clan's banner and a few materials. A closed list: no free hex values. */
export const FORGE_PALETTES = {
  wardens: { name: "Hearth banner", color: CLANS.wardens.cloth, accent: CLANS.wardens.trim },
  redfang: { name: "Redfang banner", color: CLANS.redfang.cloth, accent: CLANS.redfang.sigil },
  host: { name: "Ossuary banner", color: CLANS.host.trim, accent: CLANS.host.sigil },
  hidekin: { name: "Hide-Kin banner", color: CLANS.hidekin.cloth, accent: CLANS.hidekin.trim },
  veiled: { name: "Veiled banner", color: CLANS.veiled.cloth, accent: CLANS.veiled.trim },
  iron: { name: "Iron", color: 0x9aa3ad, accent: 0x5a626c },
  bronze: { name: "Bronze", color: 0xcd7f32, accent: 0xffd08a },
  bone: { name: "Bone", color: 0xe6dcc0, accent: 0x8a7a5a },
  ember: { name: "Ember", color: 0x8a3a1c, accent: 0xff8a3c },
  frost: { name: "Frost", color: 0x7fd8ff, accent: 0xe8fbff },
  venom: { name: "Venom", color: 0x3e4a26, accent: 0x9bdc4a },
  gilt: { name: "Gilt", color: 0xf2c14e, accent: 0xb3262e },
  shadow: { name: "Shadow", color: 0x2b2e48, accent: 0xb68cff },
} satisfies Record<string, { name: string; color: number; accent: number }>;
export type PaletteKey = keyof typeof FORGE_PALETTES;
export const PALETTE_KEYS = Object.keys(FORGE_PALETTES) as PaletteKey[];

// ---- Monster bases ---------------------------------------------------------------------------------------------
/** The monster weapons a forging may pick (the roles pve.ts models; a lookout never leaves its perch, so it is left out). */
export const FORGE_MOB_WEAPONS: Partial<Record<MobKind, readonly string[]>> = {
  skeleton: Object.keys(SKELETON_WEAPONS),
  bandit: (["cutthroat", "brute", "archer"] as const).filter((r) => r in BANDIT_ROLES),
};
/** Each zone monster's natural level band: lowest and highest level of the spawn zones it lives in. */
export const FORGE_MOB_BAND: Partial<Record<MobKind, [number, number]>> = {};
for (const z of SPAWN_ZONES) for (const [k, n] of Object.entries(z.mobs) as [MobKind, number][]) {
  if (!n) continue;
  const b = FORGE_MOB_BAND[k];
  FORGE_MOB_BAND[k] = b ? [Math.min(b[0], z.levels[0]), Math.max(b[1], z.levels[1])] : [z.levels[0], z.levels[1]];
}
/**
 * The kinds a forging may build on: zone monsters (they spawn in some SPAWN_ZONES territory) that are not bosses, elites,
 * anybody's summons, clan troopers or Night Raiders. Derived, so a new zone monster becomes forgeable by itself.
 */
export const FORGE_MOB_BASES: MobKind[] = (Object.keys(MOBS) as MobKind[]).filter((k) =>
  !!FORGE_MOB_BAND[k] && !ELITE[k] && !BOSS[k] && !isSummonKind(k) && k !== "bride" && k !== "wisp" && k !== "blobling"
  && k !== "trooper" && k !== "nightraider");
/** The champion affixes a forged monster of this kind may carry: its family's (none without a family). */
export const forgeMobAffixes = (base: MobKind): ChampAffixKey[] => {
  const f = FAMILY_OF[base];
  return f ? [...FAMILIES[f].affixes] : [];
};
/** The weapons a forging may build on: typed weapons anyone can find (shared/gear.ts isForgeWeaponBase). */
export const FORGE_WEAPON_BASES: string[] = Object.keys(GEAR).filter(isForgeWeaponBase);
/** The gear affixes a weapon recipe may build in. */
export const FORGE_IMPLICIT_KEYS: AffixKey[] = AFFIX_KEYS.filter((k) => affixFits(k, "weapon"));

// ---- Recipes and forged things -------------------------------------------------------------------------------
export interface WeaponRecipe {
  kind: "weapon"; clan: ClanKey; name: string;
  /** A FORGE_WEAPON_BASES id: its wtype decides the attack, its bonuses are the start. */
  base: string;
  /** Replaces the base's element share. */
  elem?: { el: Element; share: number };
  /** 1-3 gear affixes built into the base bonus (they grow with the item level like it). */
  implicit: Affix[];
  palette: PaletteKey;
  /** The item level the gate tests it at (hero level = this); unset = FORGE.gate.weaponLevels. */
  level?: number;
}
export interface MonsterRecipe {
  kind: "monster"; clan: ClanKey; name: string;
  base: MobKind;
  affixes: ChampAffixKey[];
  /** Mob.weapon of the base (skeleton weapon, bandit role), FORGE_MOB_WEAPONS. */
  weapon?: string;
  hp: number; dmg: number; speed: number;
  palette: PaletteKey;
}
export type ForgeRecipe = WeaponRecipe | MonsterRecipe;

/** A forged weapon: its recipe, its registry number and where it stands. Item ids: forgedGearId(seq, base). */
export interface ForgedWeapon extends WeaponRecipe { id: string; seq: number; status: ForgeStatus }
/** A forged monster: a variant of its base kind (applyVariant), never a MobKind of its own. */
export interface ForgedMob {
  kind: "monster"; id: string; seq: number; base: MobKind;
  mult: { hp: number; dmg: number; speed: number };
  affixes: ChampAffixKey[]; weapon?: string; palette: PaletteKey; name: string; clan: ClanKey; status: ForgeStatus;
}
export type Forged = ForgedWeapon | ForgedMob;

/** "fg12_ws_bastard": the base id of every copy of forging 12 (add level, affixes and runes as for any item). */
export const forgedGearId = (seq: number, base: string) => `fg${seq}_${base}`;
export { FORGED_GEAR_RE, parseForgedGearId };
export const forgedMobId = (seq: number) => `fm${seq}`;
export function parseForgedMobId(id: string): number | undefined {
  const m = /^fm([1-9]\d{0,8})$/.exec(id);
  return m ? Number(m[1]) : undefined;
}

// ---- Validation -------------------------------------------------------------------------------------------------
export type ForgeErrorCode =
  | "not_object" | "bad_kind" | "bad_clan" | "bad_palette"
  | "name_missing" | "name_too_long" | "name_chars"
  | "base_unknown" | "base_not_forgeable"
  | "elem_bad" | "elem_share" | "implicit_count" | "implicit_key" | "implicit_dup" | "implicit_value" | "level_bad"
  | "affix_count" | "affix_key" | "affix_dup" | "affix_family" | "weapon_bad" | "mult_bad" | "mult_range"
  | "over_budget";
export interface ForgeError { code: ForgeErrorCode; msg: string }
export type ForgeCheck<T> = { ok: true; recipe: T; errors: [] } | { ok: false; errors: ForgeError[] };

/** A forging's name: whitespace folded (like shared/ideas.ts cleanText), then letters, digits, spaces, ' and - only. */
export function cleanForgeName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}
const NAME_OK = /^[A-Za-z0-9' -]+$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * Check a recipe from anywhere (a council's order, a player's draft, a JSON file). Every problem is reported with a
 * code; on success the cleaned recipe comes back (name folded, unknown fields dropped).
 */
export function validateRecipe(raw: unknown): ForgeCheck<ForgeRecipe> {
  const errors: ForgeError[] = [];
  const err = (code: ForgeErrorCode, msg: string) => { errors.push({ code, msg }); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: [{ code: "not_object", msg: "A recipe is an object" }] };
  const r = raw as Record<string, unknown>;
  if (r.kind !== "weapon" && r.kind !== "monster") return { ok: false, errors: [{ code: "bad_kind", msg: "kind must be weapon or monster" }] };
  if (!has(CLAN_KEYS, r.clan)) err("bad_clan", `clan must be one of ${CLAN_KEYS.join(", ")}`);
  if (!has(PALETTE_KEYS, r.palette)) err("bad_palette", `palette must be one of ${PALETTE_KEYS.join(", ")}`);
  const name = cleanForgeName(r.name);
  if (!name) err("name_missing", "A forging needs a name");
  else {
    if (name.length > FORGE.nameMax) err("name_too_long", `Names are at most ${FORGE.nameMax} characters`);
    if (!NAME_OK.test(name)) err("name_chars", "Names use letters, digits, spaces, ' and - only");
  }
  if (r.kind === "weapon") {
    const base = r.base;
    if (typeof base !== "string" || !GEAR[base]) err("base_unknown", "base must be a weapon id from GEAR");
    else if (!isForgeWeaponBase(base)) err("base_not_forgeable", "base must be a typed weapon anyone can find (no class kit, book or lute)");
    let elem: WeaponRecipe["elem"];
    if (r.elem !== undefined) {
      const e = r.elem as Record<string, unknown> | null;
      if (!e || typeof e !== "object" || !has(ELEMENTS, e.el) || !isNum(e.share)) err("elem_bad", "elem is { el: element, share: number }");
      else if (e.share <= 0 || e.share > FORGE.maxShare + 1e-9 || Math.abs(Math.round(e.share / FORGE.shareStep) * FORGE.shareStep - e.share) > 1e-9)
        err("elem_share", `elem share is above 0, at most ${FORGE.maxShare}, in steps of ${FORGE.shareStep}`);
      else elem = { el: e.el as Element, share: Math.round(e.share * 100) / 100 };
    }
    const imp: Affix[] = [];
    if (!Array.isArray(r.implicit) || r.implicit.length < FORGE.minImplicits || r.implicit.length > FORGE.maxImplicits)
      err("implicit_count", `A weapon has ${FORGE.minImplicits}-${FORGE.maxImplicits} built-in bonuses`);
    else for (const a of r.implicit as unknown[]) {
      const o = a as Record<string, unknown> | null;
      if (!o || typeof o !== "object" || !has(FORGE_IMPLICIT_KEYS, o.key)) { err("implicit_key", `Built-in bonuses are ${FORGE_IMPLICIT_KEYS.join(", ")}`); continue; }
      if (imp.some((x) => x.key === o.key)) { err("implicit_dup", `Bonus ${o.key} twice`); continue; }
      const max = implicitMax(o.key);
      if (!isNum(o.value) || !Number.isInteger(o.value) || o.value < 1 || o.value > max) { err("implicit_value", `${o.key} is a whole number 1-${max}`); continue; }
      imp.push({ key: o.key, value: o.value });
    }
    if (r.level !== undefined && (!isNum(r.level) || !Number.isInteger(r.level) || r.level < 1 || r.level > 50)) err("level_bad", "level is a whole number 1-50");
    if (errors.length) return { ok: false, errors };
    const recipe: WeaponRecipe = { kind: "weapon", clan: r.clan as ClanKey, name, base: base as string, implicit: imp, palette: r.palette as PaletteKey };
    if (elem) recipe.elem = elem;
    if (r.level !== undefined) recipe.level = r.level as number;
    const p = itemPower(weaponInfo(recipe)), cap = weaponCap();
    if (p > cap + 1e-9) return { ok: false, errors: [{ code: "over_budget", msg: `Item power ${p.toFixed(2)} is over the budget ${cap.toFixed(2)}` }] };
    return { ok: true, recipe, errors: [] };
  }
  const base = r.base as MobKind;
  if (typeof base !== "string" || !(base in MOBS)) err("base_unknown", "base must be a monster kind");
  else if (!FORGE_MOB_BASES.includes(base)) err("base_not_forgeable", "base must be a zone monster (no boss, elite, summon, trooper or Night Raider)");
  const okBase = typeof base === "string" && FORGE_MOB_BASES.includes(base);
  const aff: ChampAffixKey[] = [];
  if (!Array.isArray(r.affixes) || r.affixes.length > FORGE.maxAffixes) err("affix_count", `A monster has 0-${FORGE.maxAffixes} affixes`);
  else for (const a of r.affixes as unknown[]) {
    if (typeof a !== "string" || !(a in CHAMP_AFFIXES)) { err("affix_key", `Unknown affix ${String(a)}`); continue; }
    if (aff.includes(a as ChampAffixKey)) { err("affix_dup", `Affix ${a} twice`); continue; }
    if (okBase && !forgeMobAffixes(base).includes(a as ChampAffixKey)) { err("affix_family", `${a} is not of the ${base}'s family`); continue; }
    aff.push(a as ChampAffixKey);
  }
  if (r.weapon !== undefined && (typeof r.weapon !== "string" || !okBase || !FORGE_MOB_WEAPONS[base]?.includes(r.weapon)))
    err("weapon_bad", okBase && FORGE_MOB_WEAPONS[base] ? `weapon is one of ${FORGE_MOB_WEAPONS[base]!.join(", ")}` : "This monster carries no weapon choice");
  for (const k of ["hp", "dmg", "speed"] as const) {
    const v = r[k], [lo, hi] = FORGE.range[k];
    if (!isNum(v)) err("mult_bad", `${k} is a number`);
    else if (v < lo - 1e-9 || v > hi + 1e-9) err("mult_range", `${k} is ${lo}-${hi}`);
  }
  if (errors.length) return { ok: false, errors };
  const recipe: MonsterRecipe = { kind: "monster", clan: r.clan as ClanKey, name, base, affixes: aff, hp: r.hp as number, dmg: r.dmg as number, speed: r.speed as number, palette: r.palette as PaletteKey };
  if (r.weapon !== undefined) recipe.weapon = r.weapon as string;
  const p = mobPower(recipe);
  if (p > FORGE.mobBudget + 1e-9) return { ok: false, errors: [{ code: "over_budget", msg: `Monster power ${p.toFixed(2)} is over the budget ${FORGE.mobBudget}` }] };
  return { ok: true, recipe, errors: [] };
}

/** Highest value a built-in bonus may have: a level-1 Legendary roll (it then grows with the item level). */
export const implicitMax = (key: AffixKey) => affixMax(key, 1, 3);

// ---- Power budgets ----------------------------------------------------------------------------------------------
/** A weapon's power at item level 1: weighted bonuses plus its element share (worth a share of its attack). */
export function itemPower(d: { bonus: GearBonus; elem?: { share: number } }): number {
  const b = d.bonus, W = FORGE.weight;
  const atk = b.atk ?? 0;
  return atk * W.atk + ((b.str ?? 0) + (b.mag ?? 0) + (b.dex ?? 0) + (b.sta ?? 0)) * W.str
    + ((b.fireDmg ?? 0) + (b.coldDmg ?? 0) + (b.poisonDmg ?? 0) + (b.faithDmg ?? 0) + (b.shockDmg ?? 0)) * W.elemFlat
    + (b.reach ?? 0) * W.reach + (d.elem?.share ?? 0) * W.share * atk;
}
/** The strongest tier-3 weapon's itemPower: the roof every forging is measured against. */
export const TOP_WEAPON_POWER = Math.max(...Object.values(GEAR).filter((d) => d.slot === "weapon" && d.tier === 3 && !d.cls).map(itemPower));
export const weaponCap = () => FORGE.weaponBudget * TOP_WEAPON_POWER;
/** The tier a forged weapon counts as (requirements per level): the lowest whose strongest GEAR weapon it doesn't beat. */
export function forgeTier(power: number): 1 | 2 | 3 {
  for (const t of [1, 2] as const) {
    const top = Math.max(...Object.values(GEAR).filter((d) => d.slot === "weapon" && d.tier === t && !d.cls).map(itemPower));
    if (power <= top + 1e-9) return t;
  }
  return 3;
}
/** A monster's power against its plain base: 1 = the same. Multiplies its XP and gold (forgedRewardMult). */
export function mobPower(v: { hp: number; dmg: number; speed: number; affixes: readonly ChampAffixKey[] } | ForgedMob): number {
  const m = "mult" in v ? v.mult : v, aff: readonly ChampAffixKey[] = v.affixes;
  const cost = aff.reduce((s, a) => s + (FORGE.affixCost[a] ?? 0), 0) + (aff.length > 1 ? FORGE.affixPair : 0);
  return m.hp * m.dmg * Math.sqrt(m.speed) * (1 + cost);
}
/** XP and gold of a forged monster against its base kind. */
export const forgedRewardMult = (v: ForgedMob) => mobPower(v);

// ---- From recipe to the game ------------------------------------------------------------------------------------
/** A checked recipe made into a forging with registry number `seq` (status active). */
export function defFromRecipe(r: WeaponRecipe, seq: number): ForgedWeapon;
export function defFromRecipe(r: MonsterRecipe, seq: number): ForgedMob;
export function defFromRecipe(r: ForgeRecipe, seq: number): Forged;
export function defFromRecipe(r: ForgeRecipe, seq: number): Forged {
  if (r.kind === "weapon") return { ...r, implicit: r.implicit.map((a) => ({ ...a })), elem: r.elem && { ...r.elem }, id: forgedGearId(seq, r.base), seq, status: "active" };
  const out: ForgedMob = {
    kind: "monster", id: forgedMobId(seq), seq, base: r.base, mult: { hp: r.hp, dmg: r.dmg, speed: r.speed }, affixes: [...r.affixes],
    palette: r.palette, name: r.name, clan: r.clan, status: "active",
  };
  if (r.weapon !== undefined) out.weapon = r.weapon;
  return out;
}

/** What a weapon recipe or forging gives its items (shared/gear.ts ForgedGearInfo): base bonus + built-ins, element, palette. */
export function weaponInfo(w: WeaponRecipe & { status?: ForgeStatus }): ForgedGearInfo {
  const b = GEAR[w.base], bonus: GearBonus = { ...b.bonus };
  for (const a of w.implicit) {
    const k = GEAR_AFFIXES[a.key].bonus;
    bonus[k] = ((bonus[k] as number | undefined) ?? 0) + a.value;
  }
  const elem = w.elem ? { ...w.elem } : b.elem && { ...b.elem };
  const pal = FORGE_PALETTES[w.palette];
  const info: ForgedGearInfo = { base: w.base, name: w.name, tier: 1, bonus, color: pal.color, accent: pal.accent, status: w.status ?? "active" };
  if (elem) info.elem = elem;
  info.tier = forgeTier(itemPower(info));
  return info;
}
/** The full item definition of a forging at item level 1 (what gearDef gives for its base id while it is registered). */
export function forgedGearDef(w: ForgedWeapon): GearDef {
  const b = GEAR[w.base], i = weaponInfo(w);
  return { ...b, id: w.id, name: i.name, tier: i.tier, bonus: i.bonus, elem: i.elem, color: i.color, accent: i.accent };
}
/** A lookup for shared/gear.ts setForgedGear over a list of forgings. */
export function forgeLookup(list: Iterable<ForgedWeapon>): (seq: number) => ForgedGearInfo | undefined {
  const by = new Map<number, ForgedGearInfo>();
  for (const w of list) by.set(w.seq, weaponInfo(w));
  return (seq) => by.get(seq);
}

/**
 * A monster definition with a forged variant on it: life, damage and speed multiplied, XP by mobPower, the forging's
 * name. The server's mob definition and pve.ts mobSpec both go through it. Affixes are run by the champion machinery
 * (without the champion's own HP / damage multipliers, rune or title).
 */
export function applyVariant(def: MobDef, v: ForgedMob): MobDef {
  return {
    ...def, name: v.name,
    maxHp: Math.max(1, Math.round(def.maxHp * v.mult.hp)),
    damage: Math.round(def.damage * v.mult.dmg * 10) / 10,
    speed: Math.round(def.speed * v.mult.speed * 10) / 10,
    xp: Math.round(def.xp * mobPower(v)),
  };
}

// ---- The Codex: what a recipe may use, in one plain object -------------------------------------------------------
/** A machine-readable list of every part a recipe may name and the numbers it is judged by. */
export interface ForgeCodex {
  name: { max: number; chars: string };
  palettes: Record<string, string>;
  weapon: {
    bases: { id: string; name: string; wtype: string; tier: number; power: number; bonus: GearBonus; elem?: { el: Element; share: number } }[];
    implicit: Record<string, { stat: string; max: number; powerPerPoint: number }>;
    implicitCount: [number, number];
    elements: readonly Element[]; maxShare: number; shareStep: number;
    /** itemPower = sum of bonus x weight + element share x share weight x attack; must be at most powerCap. */
    weights: typeof FORGE.weight; powerCap: number;
  };
  monster: {
    bases: { kind: MobKind; name: string; levels: [number, number]; affixes: ChampAffixKey[]; weapons?: readonly string[] }[];
    maxAffixes: number; affixCost: Record<string, number>; affixPair: number;
    range: typeof FORGE.range;
    /** mobPower = hp x dmg x sqrt(speed) x (1 + affix costs, + affixPair with two); must be at most budget. */
    budget: number;
  };
  /** One legal recipe of each kind (clan left out: the council's own). */
  examples: { weapon: Omit<WeaponRecipe, "clan">; monster: Omit<MonsterRecipe, "clan"> };
}
const r2f = (x: number) => Math.round(x * 100) / 100;
let codex: ForgeCodex | undefined;
/** The Codex (built once): a council reads it to write a recipe validateRecipe accepts. */
export function forgeCodex(): ForgeCodex {
  if (codex) return codex;
  const W = FORGE.weight, perPoint = (stat: string) =>
    stat === "atk" ? W.atk : ["str", "mag", "dex", "sta"].includes(stat) ? W.str : /Dmg$/.test(stat) ? W.elemFlat : 0;
  const implicit: ForgeCodex["weapon"]["implicit"] = {};
  for (const k of FORGE_IMPLICIT_KEYS) { const stat = GEAR_AFFIXES[k].bonus as string; implicit[k] = { stat, max: implicitMax(k), powerPerPoint: perPoint(stat) }; }
  codex = {
    name: { max: FORGE.nameMax, chars: "ASCII letters, digits, spaces, ' and -" },
    palettes: Object.fromEntries(PALETTE_KEYS.map((k) => [k, FORGE_PALETTES[k].name])),
    weapon: {
      bases: FORGE_WEAPON_BASES.map((id) => {
        const d = GEAR[id], b: ForgeCodex["weapon"]["bases"][number] = { id, name: d.name, wtype: d.wtype ?? "", tier: d.tier, power: r2f(itemPower(d)), bonus: { ...d.bonus } };
        if (d.elem) b.elem = { ...d.elem };
        return b;
      }),
      implicit, implicitCount: [FORGE.minImplicits, FORGE.maxImplicits],
      elements: ELEMENTS, maxShare: FORGE.maxShare, shareStep: FORGE.shareStep,
      weights: FORGE.weight, powerCap: r2f(weaponCap()),
    },
    monster: {
      bases: FORGE_MOB_BASES.map((kind) => {
        const b: ForgeCodex["monster"]["bases"][number] = { kind, name: MOBS[kind].name, levels: [...FORGE_MOB_BAND[kind]!] as [number, number], affixes: forgeMobAffixes(kind) };
        if (FORGE_MOB_WEAPONS[kind]) b.weapons = FORGE_MOB_WEAPONS[kind];
        return b;
      }),
      maxAffixes: FORGE.maxAffixes, affixCost: { ...FORGE.affixCost }, affixPair: FORGE.affixPair, range: FORGE.range, budget: FORGE.mobBudget,
    },
    examples: {
      weapon: { kind: "weapon", name: "Fang of Rourke", base: "ws_bastard", implicit: [{ key: "atk", value: 2 }, { key: "str", value: 1 }], palette: "redfang" },
      monster: { kind: "monster", name: "Gore-Sewn Tusker", base: "tuskborn", affixes: ["stitched"], hp: 1.2, dmg: 1.1, speed: 1, palette: "hidekin" },
    },
  };
  return codex;
}
