import { BOSS, ELITE, type MobKind } from "./constants";
import type { Element } from "./elements";

/**
 * Champions (game design review, Nov 2026, Lot F): about one zone monster in twenty comes as a champion. It has 1 or 2
 * affixes drawn from its family's lore, 2.5x HP, a proper name ("Morgrul the Risen", shown over it as Mob.title) and
 * always drops a rune. Bosses, elites and lair mini-bosses, the Night Raiders and anything summoned (heroes' creatures,
 * a necromancer's raised dead, a Mother Blob's bloblings, a champion's own helpers) never are.
 *
 * Pure rules: the server (server/champions.ts) runs the affixes, the client (client/src/championFx.ts) draws the
 * family tint, the glowing outline, the affix icons and the painted detail (tools/art/paint/mobs.ts champOverlay).
 * Mob.champion carries the affixes packed as bits (packAffixes), so the client knows a champion and what it can do.
 */

export const CHAMPION = {
  chance: 0.05, // share of zone spawns that come as champions
  hpMult: 2.5,
  twoAffixChance: 0.5, // a family with two affixes: chance a champion has both
};

export type ChampionFamily = "gloam" | "necro" | "beast" | "redfang" | "veiled" | "kharsun" | "scorpion" | "nomad" | "camel";
export type AffixKey = "split" | "taint" | "siege" | "risen" | "stitched" | "gang" | "sunborn" | "buried" | "deepvenom" | "veil" | "brand";

export interface FamilyDef {
  name: string; // who they are in the lore
  tint: number; // light multiply tint on the sprite
  aura: number; // glowing outline and the ring under the feet
  affixes: AffixKey[];
  names: string[]; // proper names a champion of the family is given
}

/** Monster families, from the lore of each enemy (shared/quests.ts, siege.ts, dungeon.ts, desert.ts). */
export const FAMILIES: Record<ChampionFamily, FamilyDef> = {
  // the Gloam (shared/quests.ts): one vast ooze broken into pieces that remember enough to bud and fuse
  gloam: { name: "The Gloam", tint: 0xd6ffc4, aura: 0x8dff5a, affixes: ["split", "taint"],
    names: ["Mucklet", "Ooznar", "Slurrow", "Gloopa", "Quagmar", "Squelda", "Brimble", "Old Drip"] },
  // the Pale Marshal's dead, raised by the necromancer to build his siege works (shared/siege.ts)
  necro: { name: "The Necromancer's dead", tint: 0xdcd0ff, aura: 0xa070ff, affixes: ["siege", "risen"],
    names: ["Morgrul", "Ossian", "Vexbone", "Grimhal", "Marrowin", "Rattigan", "Sallow Tam", "Cobb Dustgrave"] },
  // the beast-folk of the Mawdeep (shared/dungeon.ts): sewn into animal hides by the Hide-Mother's rite
  beast: { name: "The beast-folk", tint: 0xffd6bc, aura: 0xff6a3a, affixes: ["stitched"],
    names: ["Rhask", "Gorrak", "Skarn", "Nettle", "Vessa", "Ulda", "Brakk", "Old Mother Teeth"] },
  // the Redfang outlaws (shared/bandits.ts): their Chief holds the camp together and calls up more men
  redfang: { name: "The Redfang", tint: 0xffc8c0, aura: 0xff3030, affixes: ["gang"],
    names: ["Red Jory", "Black Dunne", "Mags", "Harl", "Vinny Knives", "Sela", "One-Ear Coll", "Brisk"] },
  // the Veiled Circle (shared/quests.ts SUN_QUESTS): sun-priests feeding a second sun on the Thornspire
  veiled: { name: "The Veiled Circle", tint: 0xfff0b8, aura: 0xffc830, affixes: ["sunborn"],
    names: ["Ishra", "Somal", "Kaveh", "Neriah", "Zuhal", "Talmar", "Adept Oren", "Hazarin"] },
  // Kharsun's dead and the guardians of its tombs: the city that drank the second sun and lies under the sand
  kharsun: { name: "The dead of Kharsun", tint: 0xf4e0b0, aura: 0xe8b450, affixes: ["buried"],
    names: ["Akhet", "Nebsun", "Tahmose", "Seret", "Khaba", "Meritsand", "Iunu", "Sobekh"] },
  // the Dune Scorpions, driven out of the deep sand "as if something drove them" (Out of the Old Gate)
  scorpion: { name: "The Dune Scorpions", tint: 0xdcffc0, aura: 0x9be04a, affixes: ["deepvenom"],
    names: ["Old Sting", "Sabbak", "Qarra", "Duneclaw", "Hesh", "Grandmother Barb"] },
  // the Dustriders, paid by the Circle and carrying its Veil Tokens (Dustrider Silver)
  nomad: { name: "The Dustriders", tint: 0xe4dcff, aura: 0xb4a4ff, affixes: ["veil"],
    names: ["Rasul", "Jaddar", "Faisa", "Zarik", "Oman Quickhand", "Taziri"] },
  // the camel-folk of the Humpback Mesas, branded with the Circle's veiled sun (Brands of the Sun)
  camel: { name: "The camel-folk", tint: 0xffdcae, aura: 0xff9830, affixes: ["brand"],
    names: ["Humbar", "Old Ghazi", "Tamrit", "Bashar", "Hessa Woolmother", "Qadir"] },
};

/** Which family each kind belongs to. Kinds missing here are never champions (elites, bosses, summons, bloblings...). */
export const FAMILY_OF: Partial<Record<MobKind, ChampionFamily>> = {
  slime: "gloam", shooterblob: "gloam", warriorblob: "gloam", healerblob: "gloam", motherblob: "gloam",
  venomblob: "gloam", frostblob: "gloam", fireblob: "gloam", stormblob: "gloam",
  skeleton: "necro", skeletonmage: "necro",
  gnawkin: "beast", tuskborn: "beast", silkwretch: "beast", duskwing: "beast", crowseer: "beast",
  bandit: "redfang",
  veiled: "veiled",
  sanddead: "kharsun", sphinx: "kharsun",
  scorpion: "scorpion",
  nomad: "nomad",
  camelfolk: "camel",
};

export interface AffixDef {
  name: string; // shown in tooltips / patch notes
  epithet: string; // "Morgrul the Risen"
  family: ChampionFamily;
  text: string; // what it does, for players
  color: number; // icon colour
  icon: number[]; // 5x5 glyph drawn over the monster (bit 4 = left column)
  overlay: "head" | "body" | "feet"; // where the painted detail sits (mob_champ_<key>)
}

/** The affixes. Effect numbers live in AFFIX_FX below (tunable). */
export const AFFIXES: Record<AffixKey, AffixDef> = {
  split: { name: "Splitting", epithet: "the Twofold", family: "gloam", color: 0x8dff5a, overlay: "body",
    text: "Splits in two at half health, like the Mother Blobs that bud.", icon: [0b01010, 0b11111, 0b01010, 0b00000, 0b01010] },
  taint: { name: "Tainted", epithet: "the Tainted", family: "gloam", color: 0x6ad040, overlay: "feet",
    text: "Leaves puddles of its element wherever it crawls.", icon: [0b00100, 0b01110, 0b11111, 0b11111, 0b01110] },
  siege: { name: "Siegewright", epithet: "the Siegewright", family: "necro", color: 0xc8a070, overlay: "head",
    text: "Sets up a ballista from the necromancer's war works, and it shoots.", icon: [0b10001, 0b01010, 0b00100, 0b01010, 0b10001] },
  risen: { name: "Risen", epithet: "the Risen", family: "necro", color: 0xb890ff, overlay: "head",
    text: "Gets back up once when struck down, with 30% of its health.", icon: [0b10101, 0b11111, 0b01110, 0b01010, 0b01110] },
  stitched: { name: "Hide-Stitched", epithet: "the Hide-Stitched", family: "beast", color: 0xff8050, overlay: "body",
    text: "Tears into its other skin at half health: faster, and quicker to strike.", icon: [0b10101, 0b01010, 0b10101, 0b01010, 0b10101] },
  gang: { name: "Ringleader", epithet: "the Ringleader", family: "redfang", color: 0xff4040, overlay: "head",
    text: "Whistles up two cutthroats when it spots you.", icon: [0b11111, 0b10101, 0b11111, 0b01110, 0b00100] },
  sunborn: { name: "Sunborn", epithet: "the Sunborn", family: "veiled", color: 0xffd040, overlay: "head",
    text: "Burns with the second sun: heroes close by burn and their Heat climbs.", icon: [0b10101, 0b01110, 0b11111, 0b01110, 0b10101] },
  buried: { name: "Sand-Buried", epithet: "the Sand-Buried", family: "kharsun", color: 0xe8c070, overlay: "feet",
    text: "Sinks into the sand and bursts out beside a hero.", icon: [0b00100, 0b00100, 0b10101, 0b01110, 0b11111] },
  deepvenom: { name: "Deep-Venomed", epithet: "of the Deep Sand", family: "scorpion", color: 0x9dff6a, overlay: "body",
    text: "Driven up from the deep sand: leaves a trail of venom behind it.", icon: [0b00110, 0b00001, 0b00110, 0b01000, 0b11100] },
  veil: { name: "Veil-Bearer", epithet: "the Veil-Bearer", family: "nomad", color: 0xb4a4ff, overlay: "head",
    text: "Wraps itself in a Veil Token and steps out behind you.", icon: [0b01110, 0b11111, 0b10101, 0b11111, 0b10101] },
  brand: { name: "Sun-Branded", epithet: "the Sun-Branded", family: "camel", color: 0xff9830, overlay: "body",
    text: "Each blow stamps the Circle's brand on you; the third flares up.", icon: [0b01110, 0b10101, 0b11111, 0b10101, 0b01110] },
};
/** Fixed order of the affix bits in Mob.champion (never reorder: append only). */
export const AFFIX_KEYS: AffixKey[] = ["split", "taint", "siege", "risen", "stitched", "gang", "sunborn", "buried", "deepvenom", "veil", "brand"];

/** Effect numbers. Distances in px, times in ms, damage as a multiple of the champion's own (levelled) damage. */
export const AFFIX_FX = {
  split: { hpFrac: 0.5 }, // at this share of its max HP it splits: a twin with the same HP comes out
  taint: { everyMs: 1100, radius: 16, ms: 3500, tickMs: 500, dmgMult: 0.3 },
  siege: { range: 170, castMs: 900, lifeMs: 18000, shotEveryMs: 2400, shotRange: 210, shotSpeed: 200, shotRadius: 3, dmgMult: 0.8, cooldownMs: 24000 },
  risen: { hpFrac: 0.3, stunMs: 900 },
  stitched: { hpFrac: 0.5, speed: 1.4, cooldown: 0.8 },
  gang: { count: 2, levelDrop: 1, spread: 26 },
  sunborn: { radius: 56, everyMs: 1000, dmgMult: 0.22, heat: 7 },
  buried: { firstMs: 3000, everyMs: 9000, minDist: 50, underMs: 1300, surfaceDist: 22 },
  deepvenom: { everyMs: 900, radius: 13, ms: 3000, tickMs: 500, dmgMult: 0.25 },
  veil: { firstMs: 4000, everyMs: 10000, goneMs: 900, behind: 26 },
  brand: { stacks: 3, ms: 6000, dmgMult: 1.2, heat: 25 },
};

/** The element a Tainted blob's puddles carry. */
export function taintElement(kind: MobKind): Element {
  return kind === "frostblob" ? "cold" : kind === "fireblob" ? "fire" : kind === "stormblob" ? "shock" : "poison";
}

export const familyOf = (kind: MobKind): ChampionFamily | undefined => FAMILY_OF[kind];

/** Whether this monster may come as a champion: a family member, not an elite or boss, nobody's creature. */
export function canBeChampion(kind: MobKind, o: { owner?: string; summoned?: boolean } = {}): boolean {
  if (o.owner || o.summoned) return false;
  if (ELITE[kind] || BOSS[kind] || kind === "nightraider") return false;
  return !!FAMILY_OF[kind];
}

/** Affixes for a fresh zone monster, or null when it comes as a plain one (CHAMPION.chance). */
export function rollChampion(kind: MobKind, rnd: () => number = Math.random, o: { owner?: string; summoned?: boolean } = {}): AffixKey[] | null {
  if (!canBeChampion(kind, o) || rnd() >= CHAMPION.chance) return null;
  return pickAffixes(kind, rnd);
}

/** 1 or 2 of the family's affixes (a family with one gives that one). */
export function pickAffixes(kind: MobKind, rnd: () => number = Math.random): AffixKey[] {
  const pool = FAMILIES[FAMILY_OF[kind]!].affixes;
  if (pool.length === 1) return [pool[0]];
  if (rnd() < CHAMPION.twoAffixChance) return [...pool];
  return [pool[Math.floor(rnd() * pool.length) % pool.length]];
}

/** "Morgrul the Risen": a name from the family's list and the first affix's epithet. */
export function championName(kind: MobKind, affixes: AffixKey[], rnd: () => number = Math.random): string {
  const names = FAMILIES[FAMILY_OF[kind]!].names;
  return `${names[Math.floor(rnd() * names.length) % names.length]} ${AFFIXES[affixes[0]].epithet}`;
}

export const championHp = (maxHp: number) => Math.round(maxHp * CHAMPION.hpMult);

export function packAffixes(a: AffixKey[]): number {
  let n = 0;
  for (const k of a) { const i = AFFIX_KEYS.indexOf(k); if (i >= 0) n |= 1 << i; }
  return n;
}
export function unpackAffixes(n: number): AffixKey[] {
  const out: AffixKey[] = [];
  if (!n) return out;
  AFFIX_KEYS.forEach((k, i) => { if (n & (1 << i)) out.push(k); });
  return out;
}
export const hasAffix = (n: number, k: AffixKey) => !!(n & (1 << AFFIX_KEYS.indexOf(k)));
