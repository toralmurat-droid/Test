import { BOSS, ELITE, MOBS, SKELETON_WEAPONS, type MobKind } from "../../shared/constants";
import { forgedMobOf } from "./forgePack";
import { CLANS } from "../../shared/war/clans";
import { AFFIXES, championFullName, taintElement, unpackAffixes, type AffixKey } from "../../shared/champions";
import { ELEMENTS, ELEMENT_NAMES, ELEMENT_COLORS, MOB_AFFINITY, MOB_MELEE_ELEMENT, MOB_SHOT_ELEMENT, type Element } from "../../shared/elements";
import { isSummonKind } from "../../shared/summons";
import { TIDE } from "../../shared/tide";
import { earTip, hintFor, RES_STAGES, soundOf } from "./songTables";

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
  kind: string; level?: number; hp?: number; maxHp?: number; title?: string; champion?: number; forge?: string; owner?: string; weapon?: string;
  merged?: number; bones?: number; guard?: string; hidden?: boolean; dead?: boolean; stunned?: boolean; slowed?: boolean; broken?: boolean; winding?: boolean; fx?: string;
}
export interface InfoCtx {
  myLevel: number;
  myClass?: string;
  /** Name of a hero by session id (summon owners). */
  playerName: (id: string) => string | undefined;
}

export type Rank = "normal" | "elite" | "boss" | "champion" | "named" | "quest" | "summon" | "thrall";
/** The six plate frames (plateArt.ts). Your own summons and thralls use the normal one. */
export type Frame = "normal" | "elite" | "champion" | "named" | "quest" | "boss";
export interface AffixLine { key: AffixKey; name: string; text: string; color: number; icon: number[] }
/** `glyph` names the 7x7 status icon in plateArt.ts. */
export interface Chip { id: string; label: string; color: string; icon?: Element; glyph: string }
export interface MonsterInfo {
  /** Same for the same look of the bar (everything but the live HP): the bar re-renders only when it changes. */
  key: string;
  name: string;
  /** The monster's own kind name when `name` is a champion / quest title or an owner's ("Skeleton"). */
  sub: string;
  level: number;
  tone: LevelTone;
  rank: Rank;
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
  ear?: { tier: string; pitch?: string; tip: string; hint: string };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const elCss = (e: Element) => "#" + ELEMENT_COLORS[e].toString(16).padStart(6, "0");

/** Status words in Mob.fx and the flags, as chips (unknown words are skipped). */
function stateChips(p: MobLike): Chip[] {
  const out: Chip[] = [];
  if (p.stunned) out.push({ id: "stun", label: "Stunned", color: "#fff176", glyph: "stun" });
  if (p.broken) out.push({ id: "broken", label: "Broken", color: "#ffd166", glyph: "broken" });
  if (p.slowed) out.push({ id: "slow", label: "Slowed", color: "#90caf9", glyph: "slow" });
  for (const w of (p.fx ?? "").split(",")) {
    if (!w) continue;
    if (w === "burn") out.push({ id: w, label: "Burning", color: "#ff8a3c", glyph: w });
    else if (w === "bleed") out.push({ id: w, label: "Bleeding", color: "#e63946", glyph: w });
    else if (w === "boil") out.push({ id: w, label: "Boiling blood", color: "#ff5252", glyph: w });
    else if (w === "mark") out.push({ id: w, label: "Marked", color: "#e63946", glyph: w });
    else if (w === "weak") out.push({ id: w, label: "Weakened", color: "#c8b8a0", glyph: w });
    else if (w === "steam") out.push({ id: w, label: "Steam", color: "#d7ccc8", glyph: w });
    else if (w === "corrode") out.push({ id: w, label: "Corroded", color: "#9bdc4a", glyph: w });
    else if (w.startsWith("em_") && (ELEMENTS as string[]).includes(w.slice(3))) {
      const el = w.slice(3) as Element;
      out.push({ id: w, label: `${ELEMENT_NAMES[el]} mark`, color: elCss(el), icon: el, glyph: "mark" });
    } else if (/^res[123]$/.test(w)) out.push({ id: w, label: RES_STAGES[+w[3] - 1], color: "#ffd24d", glyph: "res" });
  }
  return out;
}

/**
 * Kinds whose titled members are unique monsters that belong to no quest (the Night Raiders, server/TownRoom.ts
 * raiders). The client cannot tell a quest target from another titled monster otherwise: `Mob.summonFor` is not synced.
 * Add a kind here when more named monsters appear.
 */
export const NAMED_KINDS: ReadonlySet<string> = new Set(["nightraider"]);

/** Everything the bar shows for one monster. */
export function monsterInfo(p: MobLike, ctx: InfoCtx): MonsterInfo {
  const kind = p.kind as MobKind, def = MOBS[kind];
  const kindName = def?.name ?? "Monster";
  const level = p.level ?? 1;
  const affixKeys = p.champion ? unpackAffixes(p.champion) : [];
  const owner = p.owner ? ctx.playerName(p.owner) : undefined;
  const summon = isSummonKind(p.kind) || p.kind === "bride" || p.kind === "wisp";
  let name = kindName, sub = "", rank: Rank = "normal", frame: Frame = "normal";
  if (p.owner) {
    name = `${owner ?? "Someone"}'s ${kindName}${summon ? "" : " thrall"}`;
    rank = summon ? "summon" : "thrall";
  } else if (p.forge && forgedMobOf(p.forge)) { // a clan's forged monster: its own name, its clan below; its affixes show but it is no champion
    const f = forgedMobOf(p.forge)!;
    name = f.name; sub = `${kindName} · Forged by ${CLANS[f.clan]?.name ?? "a clan"}${f.status === "active" ? "" : ` (${f.status})`}`;
  } else if (p.champion && p.title) {
    name = championFullName(p.title, p.champion); sub = kindName; rank = "champion"; frame = "champion";
  } else if (BOSS[kind]) { rank = "boss"; frame = "boss"; if (p.title) { name = p.title; sub = kindName; } }
  else if (ELITE[kind]) { rank = "elite"; frame = "elite"; if (p.title) { name = p.title; sub = kindName; } }
  else if (p.title === TIDE.title) { /* a Gloam Tide marcher is a plain monster with a wave label */ }
  else if (p.title && NAMED_KINDS.has(p.kind)) { name = p.title; sub = kindName; rank = "named"; frame = "named"; }
  else if (p.title) { name = p.title; sub = kindName; rank = "quest"; frame = "quest"; }

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
    key: "", name, sub, level, tone: levelTone(level, ctx.myLevel), rank, frame, hp: p.hp ?? 0, maxHp: Math.max(1, p.maxHp ?? 1),
    affixes: affixKeys.map((k) => ({ key: k, name: AFFIXES[k].name, text: AFFIXES[k].text, color: AFFIXES[k].color, icon: AFFIXES[k].icon })),
    weak, resist, hits, weapon, extras, states,
    ear: snd ? { tier: snd.tier, pitch: snd.pitch, tip: earTip(p.kind), hint: hintFor(p.kind) || earTip(p.kind) } : undefined,
  };
  info.key = [p.forge ?? "", name, sub, level, info.tone, rank, p.kind, affixKeys.join("."), weak.join("."), resist.join("."), hits.join("."), weapon, extras.join("|"), states.map((s) => s.id).join("."), snd ? snd.tier + snd.pitch : ""].join("/");
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

const names = (els: Element[]) => els.map((e) => ELEMENT_NAMES[e]).join(", ");
const DOT = " \u00b7 ";

/** "Weak to Fire, Faith · resists Cold, Poison · hits with Cold" (the Alt details). */
export function affinityLine(i: MonsterInfo): string {
  const parts = [i.weak.length ? `Weak to ${names(i.weak)}` : "", i.resist.length ? `resists ${names(i.resist)}` : "", i.hits.length ? `hits with ${names(i.hits)}` : ""].filter(Boolean);
  return parts.length ? cap(parts.join(DOT)) : "";
}
/** "Wields Spear · Holds 3 blobs · Guards a chest" */
export const extraLine = (i: MonsterInfo): string => [i.weapon ? `Wields ${i.weapon}` : "", ...i.extras].filter(Boolean).join(DOT);
/** "Burning, Stunned" */
export const statusLine = (i: MonsterInfo): string => i.states.map((s) => s.label).join(", ");
/** "822 / 1370" */
export const hpText = (hp: number, maxHp: number): string => `${Math.max(0, Math.ceil(hp))} / ${Math.ceil(maxHp)}`;

/** Which rows the plate shows: A always; B (affix names + ear icons) for ranked monsters that have something to say; C (details) while Alt is held. */
export function plateRows(i: MonsterInfo, alt: boolean): { traits: boolean; details: boolean } {
  return { traits: !alt && i.frame !== "normal" && (i.affixes.length > 0 || !!i.ear), details: alt };
}

/** The sentence-case lines of the Alt details (affixes and the hint are drawn with icons in monsterBar.ts). */
export interface DetailLines { affixes: { key: AffixKey; name: string; text: string; color: number }[]; hint: string; affinity: string; status: string; extra: string; hp: string }
export function detailLines(i: MonsterInfo): DetailLines {
  return { affixes: i.affixes.map((a) => ({ key: a.key, name: a.name, text: a.text, color: a.color })), hint: i.ear?.hint ?? "", affinity: affinityLine(i), status: statusLine(i), extra: extraLine(i), hp: hpText(i.hp, i.maxHp) };
}

/** Should this keydown be kept from the browser? Alt + a game key (letters, digits, arrows, Space, Home…) outside text
 *  fields; never Enter (Alt+Enter is full screen), Tab, Escape or the F-keys, and never AltGr characters. */
export function altBlocks(ev: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; key: string }, focus: { tagName?: string } | null): boolean {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.key === "Alt" || ev.key === "AltGraph") return false;
  const tag = focus?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return false;
  return !/^(Enter|Tab|Escape|F\d{1,2})$/.test(ev.key);
}
