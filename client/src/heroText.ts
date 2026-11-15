import { CDR_PER_MAG, CRIT_PER_DEX, DMG_PER_POINT, HP_PER_STA, HP_PER_STR, MAJOR_LEVELS, StatKind, STATS } from "../../shared/powers";
import { MANA } from "../../shared/mana";
import type { ClassKind } from "../../shared/classes";

/**
 * Plain-language text and colour kinds for the Character and Skills tabs (sidepanel / TownScene.showHeroMenu). Pure:
 * every number comes from the `shared/` rule constants, so the lines stay true when the rules change.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One plain sentence: what one more point of an attribute gives this class. */
export function attrEffect(k: StatKind, cls: ClassKind): string {
  const main = STATS[cls].attackStat;
  switch (k) {
    case "sta": return `+${HP_PER_STA} health and faster regen per point`;
    case "str": return `+${HP_PER_STR} health${main === "str" ? ` and +${pct(DMG_PER_POINT)} attack` : ""} per point`;
    case "mag": return `+${pct(DMG_PER_POINT)} spell damage${main === "mag" ? " and attack" : ""}, ${pct(CDR_PER_MAG)} shorter cooldowns, +${MANA.perMag} mana` +
      `${main === "mag" ? `, +${HP_PER_STR} health` : ""} per point`;
    case "dex": return `+${pct(CRIT_PER_DEX)} critical chance per point`;
  }
}

/** Colour kind of a stat value: what the number is about. */
export type StatTone = "health" | "mana" | "spell" | "attack" | "gold" | "speed" | "plain";
export const STAT_TONE: Record<string, StatTone> = {
  hp: "health", mana: "mana", spell: "spell", atk: "attack", dps: "attack", crit: "gold", rate: "gold", speed: "speed", def: "plain", poise: "plain",
};
export const toneOf = (key: string): StatTone => STAT_TONE[key] ?? "plain";

/** Attribute tag letters and colours (STR red, STA amber, MAG blue, DEX green). */
export const ATTR_TAG: Record<StatKind, { tag: string; color: string }> = {
  str: { tag: "STR", color: "#e0604a" }, sta: { tag: "STA", color: "#e3b04a" }, mag: { tag: "MAG", color: "#7a9cff" }, dex: { tag: "DEX", color: "#6fd27a" },
};

/** The stat-point rule as one sentence (the "?" next to Stat points). */
export const pointsRule = () => `1 stat point per level, 3 at levels ${MAJOR_LEVELS.slice(0, -1).join(", ")} and ${MAJOR_LEVELS[MAJOR_LEVELS.length - 1]}.`;

/** Skills tab hint line (dim). */
export const skillHint = (free: number) => `${free} point${free === 1 ? "" : "s"} · 1 per level · a skill needs the one above it`;
