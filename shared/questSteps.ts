import { TILE, type MobKind } from "./constants";
import { isUndeadNight } from "./daynight";
import { GROUND, T } from "./map";
import type { ArcMap, QuestDef, QuestObject, Quester, QuestStep, Summon } from "./quests";

/**
 * Quest steps that ask more than kill / collect / use (docs/quest-concepts-progress.md): the step specs, the choice
 * flags and the pure rules that server/questSteps.ts and the client share. Type-only imports from quests.ts, so the
 * two files can use each other without a load-order cycle.
 */

/** A circle on the map (px): where to carry something, where to hold, a checkpoint. */
export interface Area { x: number; y: number; r: number; label: string }
/** carry: take `take` to `to` while its light lasts (drain per second, times the multipliers that apply). */
export interface CarrySpec { take: QuestObject; to: Area; light: number; drain: number; waterMult: number; darkMult: number; groundMult: number; lure: number }
/**
 * hold: keep `npc` alive in `at` for `ms` while waves come at him: every `everyMs` n[0]..n[1] monsters of `kinds`, level
 * level[0]..level[1], at most `maxAlive` up at once. A wave monster parked by him with no hero to fight takes `npcDmg`
 * off him every HOLD.hurtMs. Out of the area longer than `leaveMs` (or him at 0) and the run starts over.
 */
export interface HoldSpec { at: Area; ms: number; npc: string; npcHp: number; npcDmg: number; waves: { kinds: MobKind[]; n: [number, number]; everyMs: number; level: [number, number] }; maxAlive: number; leaveMs: number }
/**
 * pick: E on one of `objects`; only `answer` (index) is right, checked on the server. A wrong one raises `wrong` (an
 * ambush that outlives the step) and sends the hero back to stage `back` (1-based). `sets` is the choice a right pick records.
 */
export interface PickSpec { objects: QuestObject[]; answer: number; wrong: Summon; back: number; sets?: { flag: ChoiceId; v: number } }
/** unseen: walk the checkpoints without being targeted; `night` / `cover` scale aggro range, never below `floor`. */
export interface UnseenSpec { checkpoints: Area[]; night: number; cover: number; floor: number }
/** sync: both seals turned within `windowMs` (a group) or `soloMs` (alone); a summon within `summonReach` turns one too. */
export interface SyncSpec { seals: [QuestObject, QuestObject]; windowMs: number; soloMs: number; summonReach: number }
/** choose: one of `options` (v 1..3, 0 = not chosen yet) is written to choice `flag`; the "quest" message carries it as `opt`. */
export interface ChoiceSpec { flag: ChoiceId; options: { label: string; v: number }[] }

/**
 * The hero's choices, 2 bits each in the reserved arcs key `$f` (0 = not made). Append-only: a new choice takes the
 * next index, an old one never moves (saves keep the packed number).
 */
export const CHOICES = { letters: 0, bargain: 1, grave: 2 } as const;
export type ChoiceId = keyof typeof CHOICES;
/** Reserved keys in Player.arcs for numbers that are not arc progress (arc ids never start with "$"). */
export const META = { flags: "$f", cosm: "$c" } as const;
export type MetaKey = (typeof META)[keyof typeof META];

/** A reserved number out of the arcs map (missing = 0). */
export function metaOf(p: Quester | undefined, key: MetaKey): number {
  const m: ArcMap | undefined = p?.arcs;
  if (!m) return 0;
  const v = typeof (m as { get?: unknown }).get === "function" ? (m as { get(k: string): number | undefined }).get(key) : (m as Record<string, number>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** What the hero chose (0 = nothing yet). */
export function choiceOf(p: Quester | undefined, id: ChoiceId): number {
  return (metaOf(p, META.flags) >>> (CHOICES[id] * 2)) & 3;
}
/** `flags` with choice `id` set to v (0..3). */
export function withChoice(flags: number, id: ChoiceId, v: number): number {
  const sh = CHOICES[id] * 2;
  return ((flags & ~(3 << sh)) | ((v & 3) << sh)) >>> 0;
}

/** Does this step apply to the hero (no `onlyIf`, or their choice is one it lists)? */
export const stepOn = (s: QuestStep | undefined, p: Quester | undefined): boolean => !s?.onlyIf || s.onlyIf.v.includes(choiceOf(p, s.onlyIf.flag));

/** The stage after `stage` that applies to the hero (skips `onlyIf` mismatches); steps.length + 1 = the quest is done. */
export function nextStage(d: QuestDef, stage: number, p: Quester | undefined): number {
  let s = stage + 1;
  while (s <= d.steps.length && !stepOn(d.steps[s - 1], p)) s++;
  return s;
}

/** A step's lines for this hero: the `sayBy` variant for their choice if there is one, else `say`. */
export function sayFor(s: QuestStep, p: Quester | undefined): string[] {
  return (s.sayBy && s.sayBy.lines[choiceOf(p, s.sayBy.flag)]) || s.say || [];
}

/** Rules every carry / hold step shares (the per-step numbers are in its spec). */
export const CARRY = {
  /** Below this share of its light the lantern gutters ("lanterndim" once per lighting) */
  dimAt: 0.25,
  /** How close (px) a hero must stand to a lantern on the ground to pick it up (USE_RANGE-like slack) */
  pickR: 1.3 * TILE * 1.5,
};
export const HOLD = {
  /** How often parked wave monsters hurt the one being guarded (ms), and how close they must be (px) */
  hurtMs: 500, reach: 1.2 * TILE,
  /** Wave monsters on the whole server at most (each run is capped by its own maxAlive too) */
  serverCap: 30,
};
/** "qstate" goes out at most this often (ms) per carry / hold run, and only when something changed. */
export const QSTATE_MS = 250;

/** Light the carried thing loses in dtS seconds: its base drain times the multipliers that apply. */
export function lightDrain(s: CarrySpec, ctx: { water: boolean; dark: boolean; ground: boolean }, dtS: number): number {
  return s.drain * (ctx.water ? s.waterMult : 1) * (ctx.dark ? s.darkMult : 1) * (ctx.ground ? s.groundMult : 1) * Math.max(0, dtS);
}
/** Dusk to dawn for the quest steps: the same window the dead keep (shared/daynight.ts UNDEAD_NIGHT), no new clock numbers. */
export const isDark = (t: number): boolean => isUndeadNight(t);
/** On or right beside water (a bridge, a marsh pool's edge, a river bank): heroes can't stand in water, so beside it counts. */
export function wetAt(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (GROUND[ty]?.[tx] === T.BRIDGE) return true;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (GROUND[ty + dy]?.[tx + dx] === T.WATER) return true;
  return false;
}

/** Every map object a step uses (use objects, pick candidates, sync seals, the carried thing). */
export function stepObjects(s: QuestStep): QuestObject[] {
  return [...(s.objects ?? []), ...(s.pick?.objects ?? []), ...(s.sync?.seals ?? []), ...(s.carry ? [s.carry.take] : [])];
}
