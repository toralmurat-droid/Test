import { BOSS, ELITE, MOBS, SKELETON_WEAPONS, type MobKind } from "../../shared/constants";
import { AFFIXES, championFullName, taintElement, unpackAffixes, type AffixKey } from "../../shared/champions";
import { ELEMENTS, ELEMENT_NAMES, ELEMENT_COLORS, MOB_AFFINITY, MOB_MELEE_ELEMENT, MOB_SHOT_ELEMENT, type Element } from "../../shared/elements";
import { isSummonKind } from "../../shared/summons";
import { earTip, RES_STAGES, soundOf } from "./songTables";

/**
 * What the top monster bar (monsterBar.ts) says about a monster: pure functions over the monster's synced fields
 * (shared/mobView.ts MOB_FIELDS) and the shared tables, so tests can check them without a browser. Cosmetic only.
 */

/** "Recently hit": a hit by you or your group this recent keeps the monster's world HP bar (display only). */
export const RECENT_HIT_MS = 4000;
/** How long the top bar stays after the cursor leaves a monster. */
export const BAR_HOLD_MS = 400;

export type LevelTone = "trivial" | "even" | "tough" | "deadly";
export const TONE_COLOR: Record<LevelTone, string> = { trivial: "#9e9e9e", even: "#ffffff", tough: "#ffb74d", deadly: "#ff5252" };

/** How tough a monster is for me: grey far below, white even, orange a bit above, red 3+ levels above. */
export function levelTone(mobLv: number, myLv: number): LevelTone {
  const d = (mobLv || 1) - (myLv || 1);
  return d >= 3 ? "deadly" : d >= 1 ? "tough" : d >= -2 ? "even" : "trivial";
}

/** The fields of a monster this reads (Mob / MobState). */
export interface MobLike {
  kind: string; level?: number; hp?: number; maxHp?: number; title?: string; champion?: number; owner?: string; weapon?: string;
  merged?: number; bones?: number; guard?: string; hidden?: boolean; dead?: boolean; stunned?: boolean; slowed?: boolean; broken?: boolean; winding?: boolean; fx?: string;
}
export interface InfoCtx {
  myLevel: number;
  myClass?: string;
  /** Name of a hero by session id (summon owners). */
  playerName: (id: string) => string | undefined;
}

export type Rank = "normal" | "elite" | "boss" | "champion" | "quest" | "summon" | "thrall";
export type Frame = "bronze" | "gold" | "blood";
export interface AffixLine { key: AffixKey; name: string; text: string; color: number; icon: number[] }
export interface Chip { id: string; label: string; color: string; icon?: Element }
export interface MonsterInfo {
  /** Same for the same look of the bar (everything but the live HP): the bar re-renders only when it changes. */
  key: string;
  name: string;
  /** The monster's own kind name when `name` is a champion / quest title or an owner's ("Skeleton"). */
  sub: string;
  level: number;
  tone: LevelTone;
  rank: Rank;
  /** Badge text: "ELITE", "BOSS", "CHAMPION", "" ... */
  badge: string;
  frame: Frame;
  hp: number;
  maxHp: number;
  affixes: AffixLine[];
  weak: Element[];
  resist: Element[];
  /** Elements of its blows ("Hits with Cold") */
  hits: Element[];
  weapon: string;
  extras: string[];
  /** Live conditions: stunned, burning, an elemental mark... */
  states: Chip[];
  /** Songweaver only: how it hears. */
  ear?: { tier: string; pitch?: string; tip: string };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const elCss = (e: Element) => "#" + ELEMENT_COLORS[e].toString(16).padStart(6, "0");

/** Status words in Mob.fx and the flags, as chips (unknown words are skipped). */
function stateChips(p: MobLike): Chip[] {
  const out: Chip[] = [];
  if (p.stunned) out.push({ id: "stun", label: "Stunned", color: "#fff176" });
  if (p.broken) out.push({ id: "broken", label: "Broken", color: "#ffd166" });
  if (p.slowed) out.push({ id: "slow", label: "Slowed", color: "#90caf9" });
  for (const w of (p.fx ?? "").split(",")) {
    if (!w) continue;
    if (w === "burn") out.push({ id: w, label: "Burning", color: "#ff8a3c" });
    else if (w === "bleed") out.push({ id: w, label: "Bleeding", color: "#e63946" });
    else if (w === "boil") out.push({ id: w, label: "Boiling blood", color: "#ff5252" });
    else if (w === "mark") out.push({ id: w, label: "Marked", color: "#e63946" });
    else if (w === "weak") out.push({ id: w, label: "Weakened", color: "#c8b8a0" });
    else if (w === "steam") out.push({ id: w, label: "Steam", color: "#d7ccc8" });
    else if (w === "corrode") out.push({ id: w, label: "Corroded", color: "#9bdc4a" });
    else if (w.startsWith("em_") && (ELEMENTS as string[]).includes(w.slice(3))) {
      const el = w.slice(3) as Element;
      out.push({ id: w, label: `${ELEMENT_NAMES[el]} mark`, color: elCss(el), icon: el });
    } else if (/^res[123]$/.test(w)) out.push({ id: w, label: RES_STAGES[+w[3] - 1], color: "#ffd24d" });
  }
  return out;
}

/** Everything the bar shows for one monster. */
export function monsterInfo(p: MobLike, ctx: InfoCtx): MonsterInfo {
  const kind = p.kind as MobKind, def = MOBS[kind];
  const kindName = def?.name ?? "Monster";
  const level = p.level ?? 1;
  const affixKeys = p.champion ? unpackAffixes(p.champion) : [];
  const owner = p.owner ? ctx.playerName(p.owner) : undefined;
  const summon = isSummonKind(p.kind) || p.kind === "bride" || p.kind === "wisp";
  let name = kindName, sub = "", rank: Rank = "normal", badge = "", frame: Frame = "bronze";
  if (p.owner) {
    name = `${owner ?? "Someone"}'s ${kindName}${summon ? "" : " thrall"}`;
    rank = summon ? "summon" : "thrall"; badge = summon ? "SUMMON" : "THRALL";
  } else if (p.champion && p.title) {
    name = championFullName(p.title, p.champion); sub = kindName; rank = "champion"; badge = "CHAMPION"; frame = "gold";
  } else if (BOSS[kind]) { rank = "boss"; badge = "BOSS"; frame = "blood"; if (p.title) { name = p.title; sub = kindName; } }
  else if (ELITE[kind]) { rank = "elite"; badge = "ELITE"; frame = "gold"; if (p.title) { name = p.title; sub = kindName; } }
  else if (p.title) { name = p.title; sub = kindName; rank = "quest"; badge = "QUEST"; frame = "gold"; }

  const aff = MOB_AFFINITY[kind] ?? {};
  const weak = ELEMENTS.filter((e) => (aff[e] ?? 1) > 1), resist = ELEMENTS.filter((e) => (aff[e] ?? 1) < 1);
  const hits: Element[] = [];
  const mel = MOB_MELEE_ELEMENT[kind], shot = MOB_SHOT_ELEMENT[kind];
  if (mel) hits.push(mel);
  if (shot && shot !== mel) hits.push(shot);
  if (affixKeys.includes("taint") || affixKeys.includes("deepvenom")) {
    const t: Element = affixKeys.includes("deepvenom") ? "poison" : taintElement(kind);
    if (!hits.includes(t)) hits.push(t);
  }

  const extras: string[] = [];
  if ((p.merged ?? 1) > 1) extras.push(`Holds ${p.merged} blobs`);
  if ((p.bones ?? 0) > 0) extras.push(`Wears ${p.bones} bone${p.bones === 1 ? "" : "s"}`);
  if (p.guard) extras.push("Guards a chest");

  const snd = ctx.myClass === "songweaver" ? soundOf(p.kind) : undefined;
  const states = stateChips(p);
  const weapon = p.kind === "skeleton" && p.weapon && p.weapon in SKELETON_WEAPONS ? cap(p.weapon) : "";
  const info: MonsterInfo = {
    key: "", name, sub, level, tone: levelTone(level, ctx.myLevel), rank, badge, frame, hp: p.hp ?? 0, maxHp: Math.max(1, p.maxHp ?? 1),
    affixes: affixKeys.map((k) => ({ key: k, name: AFFIXES[k].name, text: AFFIXES[k].text, color: AFFIXES[k].color, icon: AFFIXES[k].icon })),
    weak, resist, hits, weapon, extras, states,
    ear: snd ? { tier: snd.tier, pitch: snd.pitch, tip: earTip(p.kind) } : undefined,
  };
  info.key = [name, sub, level, info.tone, rank, p.kind, affixKeys.join("."), weak.join("."), resist.join("."), hits.join("."), weapon, extras.join("|"), states.map((s) => s.id).join("."), snd ? snd.tier + snd.pitch : ""].join("/");
  return info;
}

/** Should the in-world HP bar of this monster be drawn now? (Owner rules: any damaged monster, hover, target, a hit by me
 *  or my group in the last RECENT_HIT_MS even if a shield took it; own summons always. A monster at full health shows none.) */
export function showWorldBar(o: { hovered: boolean; targeted: boolean; lastMineHitAt?: number; now: number; dead: boolean; hidden: boolean; ownSummon: boolean; damaged: boolean }): boolean {
  if (o.dead || o.hidden) return false;
  if (o.damaged || o.ownSummon || o.hovered || o.targeted) return true;
  return o.lastMineHitAt !== undefined && o.now - o.lastMineHitAt < RECENT_HIT_MS;
}

/** Is the "hit" message's `by` (the responsible player's session id) me or someone in my group? A missing `by` is "not mine". */
export function isMineOrGroup(by: string | undefined, me: string, group: ReadonlySet<string>): boolean {
  return !!by && (by === me || group.has(by));
}
