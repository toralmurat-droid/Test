import { ClassKind } from "./classes";
import { ELEMENTS, Element } from "./elements";
import { activeGear, canWear, Equipped, gearBlock, gearDef, gearResist, gearSpeedMult, gearStats, HeroReqInfo, itemRarity, weaponElements } from "./gear";
import { maxManaFor } from "./mana";
import { critChance, heroSpeed, magicMult, maxHpFromStats, statsFor, Stats } from "./powers";
import { Ranks, talentBonus, talentMult, talentReduce } from "./skills";
import { Feast, feastMult } from "./devour";
import { attackProfile, weaponAttackMult } from "./weapons";

/**
 * The hero's character sheet: the numbers the side panel (client/src/sidepanel.ts) always shows, computed with the
 * same rules as the server (TownRoom.applyStats, damagePlayer, the basic hit and shared/skillInfo.ts). Pure, so the
 * panel can also preview a sheet with another item worn or another skill rank, and the bag can spot useless items.
 */
/** feast: monsters the hero has eaten with Devour (shared/devour.ts). */
export interface SheetHero { cls: ClassKind; level: number; pts: Stats; talents: Ranks; feast?: Feast }
export interface Sheet {
  hp: number; mana: number;
  /** Damage cut by shield block and armour passives, in %. */
  def: number;
  /** Basic hit damage (weapon + attack stat + passives + flat elemental damage). */
  atk: number;
  /** Basic attack damage per second, crits included. */
  dps: number;
  /** Magic stat (gear included). */
  magic: number;
  /** Skill damage bonus from Magic and skill passives, in % (100 = base). */
  spell: number;
  crit: number; speed: number;
  res: Record<Element, number>;
  stats: Stats;
}

/** Sheet keys shown in the panel, in order, with their labels. */
export const SHEET_ROWS: { key: keyof Omit<Sheet, "res" | "stats">; label: string; pct?: boolean }[] = [
  { key: "hp", label: "Health" },
  { key: "mana", label: "Mana" },
  { key: "def", label: "Defense", pct: true },
  { key: "atk", label: "Attack" },
  { key: "dps", label: "Damage/s" },
  { key: "magic", label: "Magic" },
  { key: "spell", label: "Spell dmg", pct: true },
  { key: "crit", label: "Crit", pct: true },
];

const reqOf = (h: SheetHero): HeroReqInfo => ({ cls: h.cls, level: h.level, pts: h.pts });

/** Character sheet with this gear worn (pieces whose requirements are unmet give nothing, like on the server). */
export function heroSheet(h: SheetHero, worn: Equipped, talents: Ranks = h.talents, ignoreReq = false): Sheet {
  const eq = ignoreReq ? worn : activeGear(worn, reqOf(h));
  const st = statsFor(h.cls, h.pts);
  const g = gearStats(h.cls, eq);
  st.sta += g.sta; st.str += g.str; st.mag += g.mag; st.dex += g.dex;
  const wp = attackProfile(h.cls, eq);
  const flat = Object.values(weaponElements(eq).flat).reduce((a, v) => a + (v ?? 0), 0);
  const atk = Math.round(wp.damage * weaponAttackMult(h.cls, st, wp.type) * talentMult(h.cls, talents, "dmg") * feastMult(h.feast, "dmg") + flat);
  const crit = critChance(st, talentBonus(h.cls, talents, "crit"));
  const res = Object.fromEntries(ELEMENTS.map((e) => [e, Math.round(gearResist(eq, e) * 100)])) as Record<Element, number>;
  return {
    hp: Math.round(maxHpFromStats(h.cls, st, h.level) * talentMult(h.cls, talents, "hp") * feastMult(h.feast, "hp")),
    mana: maxManaFor(st, h.level),
    def: Math.round((1 - (1 - gearBlock(eq)) * talentReduce(h.cls, talents, "armor")) * 100),
    atk,
    dps: Math.round(atk * (1000 / wp.attackCooldownMs) * (1 + crit)),
    magic: st.mag,
    spell: Math.round(magicMult(h.cls, st) * talentMult(h.cls, talents, "skill") * feastMult(h.feast, "skill") * 100),
    crit: Math.round(crit * 100),
    speed: Math.round(heroSpeed(h.cls, false) * gearSpeedMult(eq) * feastMult(h.feast, "speed")),
    res, stats: st,
  };
}

/** The worn set with `id` put on in its slot. */
export function wearing(worn: Equipped, id: string): Equipped {
  const d = gearDef(id);
  return d ? { ...worn, [d.slot]: id } : worn;
}

/** True when wearing `id` (requirements assumed met) would raise no number on the sheet: safe to throw away. */
export function uselessItem(h: SheetHero, worn: Equipped, id: string): boolean {
  if (!gearDef(id) || !canWear(h.cls, id)) return true;
  const now = heroSheet(h, worn, h.talents, true), next = heroSheet(h, wearing(worn, id), h.talents, true);
  const keys: (keyof Sheet)[] = ["hp", "mana", "def", "atk", "dps", "magic", "spell", "crit", "speed"];
  if (keys.some((k) => (next[k] as number) > (now[k] as number))) return false;
  if (ELEMENTS.some((e) => next.res[e] > now.res[e])) return false;
  // an item with an effect the sheet does not show (longer reach, a ranged shot, an element) is kept
  const d = gearDef(id)!, cur = worn[d.slot] ? gearDef(worn[d.slot]!) : undefined;
  if ((d.bonus.reach ?? 0) > (cur?.bonus.reach ?? 0)) return false;
  if (d.slot === "ranged" && !worn.ranged) return false;
  return true;
}

/** Loot filter: which gear drops a hero picks up when walking over them (gold, potions and quest items always). */
export interface LootFilter { minRarity: number; ownClass: boolean }
export const DEFAULT_FILTER: LootFilter = { minRarity: 0, ownClass: false };
export function cleanFilter(f: unknown): LootFilter {
  const o = (f ?? {}) as Partial<LootFilter>;
  const r = Math.floor(Number(o.minRarity));
  return { minRarity: Number.isFinite(r) ? Math.max(0, Math.min(3, r)) : 0, ownClass: o.ownClass === true };
}
export function passesFilter(f: LootFilter, cls: string, id: string): boolean {
  if (itemRarity(id) < f.minRarity) return false;
  if (f.ownClass && !canWear(cls, id)) return false;
  return true;
}
