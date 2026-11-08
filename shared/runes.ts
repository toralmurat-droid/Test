/**
 * Runes (Murat 2026-11-08): small carved stones that drop from monsters and chests. Set one into a weapon or a piece
 * of armour ("cast") and it gives that item a passive effect with a chance to fire: when the hero hits with a basic
 * attack or a skill, when they cast a skill, or when they are struck. Taking it out again ("de-cast") gives the rune
 * back whole, so runes can move from item to item.
 *
 * Ids: a loose rune in the bag is "rune:ember:2" (key + rank 1..3). Set runes are written at the end of the item id
 * after "^": "w_frost@17~R:atk3^ember2.thorn1" (shared/gear.ts socketsOf / itemRunes / withRunes).
 * Weapons take weapon runes, armour, shields, hats and shoes take armour runes. Every item has one socket, Rare and
 * Legendary items two. The ranged slot has none.
 * Several of the same rune on a hero add their chances (capped at RUNE_MAX_CHANCE); the strongest rank sets the power.
 */
export type RuneKey = "ember" | "rime" | "venom" | "storm" | "blood" | "echo" | "thorn" | "ward" | "mend" | "frost";
/** weapon = goes in the main-hand weapon; armour = armour, shield, hat or shoes. */
export type RuneKind = "weapon" | "armour";
/** hit = a basic attack or a skill lands, cast = a skill is cast, struck = the hero is hit by a foe. */
export type RuneTrigger = "hit" | "cast" | "struck";

export interface RuneDef {
  name: string;
  kind: RuneKind;
  trigger: RuneTrigger;
  /** Chance to fire, by rank 1..3 (index 0 unused). */
  chance: [number, number, number, number];
  /** Effect size, by rank: a share of the hit, of max HP, of max mana, or milliseconds (see `text`). */
  power: [number, number, number, number];
  /** Shortest time between two firings for one hero. */
  icdMs: number;
  color: number; // stone glow and effect colour
  glyph: number[]; // 5x7 glyph carved in the stone, one row per number (bit 4 = left column)
  /** What it does, for tooltips ("12% on hit: ..."). */
  text: (power: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export const RUNES: Record<RuneKey, RuneDef> = {
  // ---- Weapon runes ----
  ember: { name: "Ember Rune", kind: "weapon", trigger: "hit", chance: [0, 0.1, 0.13, 0.16], power: [0, 0.5, 0.7, 0.9], icdMs: 500, color: 0xff7a2a,
    glyph: [0b00100, 0b00100, 0b01010, 0b01010, 0b10101, 0b10001, 0b01110], text: (p) => `bursts into flame: ${pct(p)} of the hit as Fire to all foes close by` },
  rime: { name: "Rime Rune", kind: "weapon", trigger: "hit", chance: [0, 0.08, 0.1, 0.12], power: [0, 600, 800, 1000], icdMs: 3000, color: 0x8fd8ff,
    glyph: [0b00100, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00100], text: (p) => `freezes the target solid for ${sec(p)}` },
  venom: { name: "Venom Rune", kind: "weapon", trigger: "hit", chance: [0, 0.14, 0.18, 0.22], power: [0, 0.6, 0.8, 1], icdMs: 500, color: 0x9bdc4a,
    glyph: [0b01110, 0b10001, 0b10101, 0b10001, 0b01110, 0b00100, 0b01110], text: (p) => `poisons: ${pct(p)} of the hit as Poison over 2s` },
  storm: { name: "Storm Rune", kind: "weapon", trigger: "hit", chance: [0, 0.1, 0.13, 0.16], power: [0, 0.4, 0.55, 0.7], icdMs: 500, color: 0xb8a8ff,
    glyph: [0b00011, 0b00110, 0b01100, 0b11111, 0b00110, 0b01100, 0b11000], text: (p) => `lightning leaps to up to ${p >= 0.7 ? 4 : p >= 0.55 ? 3 : 2} foes, ${pct(p)} of the hit each` },
  blood: { name: "Blood Rune", kind: "weapon", trigger: "hit", chance: [0, 0.12, 0.15, 0.18], power: [0, 0.03, 0.045, 0.06], icdMs: 500, color: 0xd0263a,
    glyph: [0b00100, 0b00100, 0b01110, 0b01110, 0b11111, 0b11111, 0b01110], text: (p) => `drinks blood: heals ${pct(p)} of your max HP` },
  echo: { name: "Echo Rune", kind: "weapon", trigger: "cast", chance: [0, 0.2, 0.25, 0.3], power: [0, 0.06, 0.09, 0.12], icdMs: 1500, color: 0x5ea8ff,
    glyph: [0b10001, 0b01010, 0b00100, 0b11111, 0b00100, 0b01010, 0b10001], text: (p) => `on casting a skill: gives back ${pct(p)} of your max mana` },
  // ---- Armour runes ----
  thorn: { name: "Thorn Rune", kind: "armour", trigger: "struck", chance: [0, 0.2, 0.25, 0.3], power: [0, 0.4, 0.6, 0.8], icdMs: 400, color: 0x8a9a3a,
    glyph: [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0b00100], text: (p) => `when struck: hurls back ${pct(p)} of the damage` },
  ward: { name: "Ward Rune", kind: "armour", trigger: "struck", chance: [0, 0.08, 0.11, 0.14], power: [0, 0.8, 0.8, 0.8], icdMs: 1000, color: 0xffd84a,
    glyph: [0b11111, 0b10001, 0b10101, 0b10101, 0b10001, 0b01010, 0b00100], text: (p) => `when struck: a ward stops ${pct(p)} of the blow` },
  mend: { name: "Mend Rune", kind: "armour", trigger: "struck", chance: [0, 0.1, 0.13, 0.16], power: [0, 0.04, 0.06, 0.08], icdMs: 1500, color: 0x6ee08a,
    glyph: [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000], text: (p) => `when struck: heals ${pct(p)} of your max HP` },
  frost: { name: "Frost Rune", kind: "armour", trigger: "struck", chance: [0, 0.15, 0.2, 0.25], power: [0, 1200, 1600, 2000], icdMs: 1000, color: 0xcfefff,
    glyph: [0b00100, 0b01110, 0b01110, 0b11111, 0b01110, 0b01110, 0b00100], text: (p) => `when struck: chills the attacker (slowed ${sec(p)})` },
};
export const RUNE_KEYS = Object.keys(RUNES) as RuneKey[];
export const RANK_NAMES = ["", "Lesser", "", "Greater"];
export const RUNE_MAX_CHANCE = 0.5;

export interface Rune { key: RuneKey; rank: number }

export const runeId = (key: RuneKey, rank: number) => `rune:${key}:${rank}`;

/** A loose rune id ("rune:ember:2"), or undefined. */
export function parseRune(id: unknown): Rune | undefined {
  if (typeof id !== "string" || !id.startsWith("rune:")) return undefined;
  const [, key, r] = id.split(":");
  const rank = Number(r);
  if (!(key in RUNES) || !Number.isInteger(rank) || rank < 1 || rank > 3 || id !== runeId(key as RuneKey, rank)) return undefined;
  return { key: key as RuneKey, rank };
}
export const isRuneId = (id: unknown): id is string => !!parseRune(id);

export function runeName(r: Rune): string {
  const pre = RANK_NAMES[r.rank];
  return pre ? `${pre} ${RUNES[r.key].name}` : RUNES[r.key].name;
}
export const runeIdName = (id: string) => { const r = parseRune(id); return r ? runeName(r) : id; };

/** "16% on hit: bursts into flame..." */
export function runeText(r: Rune): string {
  const d = RUNES[r.key];
  const when = d.trigger === "hit" ? "on hit" : d.trigger === "cast" ? "on cast" : "when struck";
  return `${pct(d.chance[r.rank])} ${when}: ${d.text(d.power[r.rank]).replace(/^(when struck|on casting a skill): /, "")}`;
}

export const RUNE_KIND_NAMES: Record<RuneKind, string> = { weapon: "Weapon rune", armour: "Armour rune" };

/** A rune set in an item, written "ember2" in the item id. */
export const runeCode = (r: Rune) => `${r.key}${r.rank}`;
export function parseRuneCode(code: string): Rune | undefined {
  const m = /^([a-z]+)([123])$/.exec(code);
  return m && m[1] in RUNES ? { key: m[1] as RuneKey, rank: Number(m[2]) } : undefined;
}

/** All runes a hero has set in the worn items that count, merged by key: chances add (capped), the best rank wins. */
export interface RuneEffect { chance: number; rank: number; power: number }
export function mergeRunes(runes: Rune[]): Partial<Record<RuneKey, RuneEffect>> {
  const out: Partial<Record<RuneKey, RuneEffect>> = {};
  for (const r of runes) {
    const d = RUNES[r.key], cur = out[r.key];
    const rank = Math.max(cur?.rank ?? 0, r.rank);
    out[r.key] = { chance: Math.min(RUNE_MAX_CHANCE, (cur?.chance ?? 0) + d.chance[r.rank]), rank, power: d.power[rank] };
  }
  return out;
}

// ---- Drops ----
/** Bosses and big monsters drop runes this often; everyone else RUNE_DROP.base, a little more per level. */
export const RUNE_DROP = { base: 0.025, perLevel: 0.04, boss: 0.35, chest: 0.25 };

/** Rune rank for a monster or chest level: Lesser below 12, plain below 24, Greater above (with a small chance of one better). */
export function rollRank(level: number, rnd = Math.random): number {
  const r = level < 12 ? 1 : level < 24 ? 2 : 3;
  return Math.min(3, r + (rnd() < 0.12 ? 1 : 0));
}

export function rollRune(level: number, rnd = Math.random): string {
  const key = RUNE_KEYS[Math.floor(rnd() * RUNE_KEYS.length)];
  return runeId(key, rollRank(level, rnd));
}

/** A monster's rune drop: `gearChance` is its gear drop chance (bosses have 0.75 and more), 0 = never (summons, golems). */
export function rollMobRune(gearChance: number, level: number, rnd = Math.random): string | undefined {
  if (gearChance <= 0) return undefined;
  const chance = gearChance >= 0.75 ? RUNE_DROP.boss : RUNE_DROP.base * (1 + RUNE_DROP.perLevel * Math.max(0, level - 1));
  return rnd() < chance ? rollRune(level, rnd) : undefined;
}
