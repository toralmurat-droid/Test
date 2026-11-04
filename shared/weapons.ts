import { CLASSES, ClassDef, ClassKind } from "./classes";
import { Equipped, NATIVE_WEAPON, WeaponType, weaponStat, weaponType } from "./gear";
import { DMG_PER_POINT, STATS, Stats } from "./powers";

/**
 * The basic attack follows the main-hand weapon, for every class (Murat 2026-11-04): a bow shoots arrows, a sword
 * swings in melee, a staff throws fireballs, a wand fires magic bolts that cost Magic, bare hands punch.
 * A weapon the class is trained with plays exactly like that class always did (same numbers as CLASSES).
 */
export interface AttackProfile {
  type: WeaponType;
  damage: number;
  attackCooldownMs: number;
  attackRange: number; // melee reach, px (0 for ranged)
  projectile?: ClassDef["projectile"] | { speed: number; range: number; radius: number; kind: "arcane" };
  combo: ClassDef["combo"];
  /** Mana spent per shot (wands, shared/mana.ts). */
  mana?: number;
}

/** The class each weapon kind comes from: that class's attack numbers are the weapon's. */
const OWNER: Partial<Record<WeaponType, ClassKind>> = Object.fromEntries(
  (Object.entries(NATIVE_WEAPON) as [ClassKind, WeaponType][]).map(([c, t]) => [t, c]));

const WAND_COST = 6;
const WAND: AttackProfile = {
  type: "wand", damage: 19, attackCooldownMs: 380, attackRange: 0, mana: WAND_COST,
  projectile: { speed: 330, range: 165, radius: 4, kind: "arcane" },
  combo: [
    { damage: 1, knockback: 0.4 },
    { damage: 1, knockback: 0.4 },
    { damage: 1.6, knockback: 1.2, shotScale: 1.4, cooldownMs: 600 }, // a bigger bolt
  ],
};

const FISTS: AttackProfile = {
  type: "fists", damage: 9, attackCooldownMs: 380, attackRange: 14,
  combo: [
    { damage: 1, knockback: 0.6 },
    { damage: 1, knockback: 0.6 },
    { damage: 1.6, knockback: 1.6, lunge: 8, cooldownMs: 600 }, // haymaker
  ],
};

export const isWeaponType = (v: unknown): v is WeaponType => typeof v === "string" && v in ATTACK_WORDS;

export function profileOf(type: WeaponType): AttackProfile {
  if (type === "wand") return WAND;
  if (type === "fists") return FISTS;
  const c = CLASSES[OWNER[type]!];
  return { type, damage: c.damage, attackCooldownMs: c.attackCooldownMs, attackRange: c.attackRange, projectile: c.projectile, combo: c.combo };
}

/** The basic attack of a hero with this gear on. */
export function attackProfile(cls: string, eq: Equipped): AttackProfile {
  return profileOf(weaponType(cls, eq.weapon));
}

/** Damage multiplier of the basic attack: the weapon's stat (Magic for staves and wands, Strength otherwise) above the class's base. */
export function weaponAttackMult(cls: ClassKind, s: Stats, type: WeaponType): number {
  const k = weaponStat(type), base = STATS[cls].base[k];
  return 1 + (s[k] - base) * DMG_PER_POINT;
}

/** HUD / tooltip words for the basic attack. */
export const ATTACK_WORDS: Record<WeaponType, string> = {
  sword: "melee swings", katana: "fast melee cuts", axe: "heavy melee chops", bow: "shoots arrows",
  staff: "throws fireballs", wand: `fires magic bolts (${WAND_COST} mana each)`, fists: "punches",
};

/**
 * How a hero stands and swings: each class has its own family, and holding a weapon of another family switches the
 * hero's animations to that family (an archer with a sword chops like a fighter instead of drawing a bow).
 * Art convention: sheets `assets/hd/characters/{hero}-{family}.webp` and overlays `assets/hd/gear/{hero}-{family}_{item}.webp`.
 */
export type PoseFamily = "melee" | "bow" | "caster";
export const POSE_FAMILIES: PoseFamily[] = ["melee", "bow", "caster"];
export const weaponFamily = (t: WeaponType): PoseFamily => (t === "bow" ? "bow" : t === "staff" || t === "wand" ? "caster" : "melee");
export const nativeFamily = (cls: ClassKind): PoseFamily => weaponFamily(NATIVE_WEAPON[cls]);
/** Sheet name for a hero holding this weapon: the class itself, or "archer-melee" style for another family. */
export function poseSheet(cls: ClassKind, eq: Equipped): string {
  const f = weaponFamily(weaponType(cls, eq.weapon));
  return f === nativeFamily(cls) ? cls : `${cls}-${f}`;
}

/** Does the hero hold what the skill needs (SkillDef.needs)? */
export function weaponOk(s: { needs?: "bow" | "melee" | "shield" } | undefined, cls: string, eq: Equipped): boolean {
  if (!s?.needs) return true;
  if (s.needs === "shield") return !!eq.shield;
  const t = weaponType(cls, eq.weapon);
  return s.needs === "bow" ? t === "bow" : t === "sword" || t === "katana" || t === "axe";
}
