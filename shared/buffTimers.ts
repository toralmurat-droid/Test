import type { SkillRuntime } from "./skillEngine";

/**
 * Timed buffs and debuffs on a hero, for the HUD buff row (client/src/buffbar.ts, Murat 2026-11-04):
 * every effect with a duration shows its pixel icon and a countdown.
 *
 * The server writes Player.timers (synced as Player.me.timers, owner only; server/player.ts) only when the set of effects or their end times change, as
 * "seq|id:msLeft,id:msLeft". The client anchors msLeft to its own clock, so no server time is needed.
 */
export const DEBUFFS = ["stun", "slow", "burn", "mark", "weak"] as const;
export type Debuff = (typeof DEBUFFS)[number];
export const isDebuff = (id: string): id is Debuff => (DEBUFFS as readonly string[]).includes(id);

export const STATUS_NAMES: Record<Debuff, string> = {
  stun: "Stunned", slow: "Slowed", burn: "Burning", mark: "Marked", weak: "Weakened",
};

export interface TimerUnit { sk: SkillRuntime; stunUntil?: number; slowUntil?: number }
export interface Timer { id: string; until: number }

/** Every running timed effect: skill buffs and shrine boons, counter stances, then debuffs. */
export function timersOf(u: TimerUnit, now: number): Timer[] {
  const out: Timer[] = [];
  const sk = u.sk;
  for (const b of sk.buffs) if (b.until > now) out.push({ id: b.id, until: b.until });
  if (sk.counter && sk.counter.until > now) out.push({ id: sk.counter.s.id, until: sk.counter.until });
  const deb: [Debuff, number][] = [
    ["stun", u.stunUntil ?? 0], ["slow", u.slowUntil ?? 0], ["burn", sk.burnUntil], ["mark", sk.markUntil], ["weak", sk.weakUntil],
  ];
  for (const [id, until] of deb) if (until > now) out.push({ id, until });
  return out;
}

/** Lasting effects kept topped up while their source lives (the Summoner's golem auras): shown without a countdown. */
export const isLasting = (id: string) => id.startsWith("aura_");

/** Changes only when an effect starts, ends or is refreshed (not every tick); topping up a lasting one changes nothing. */
export const timerSig = (list: Timer[]) => list.map((t) => (isLasting(t.id) ? t.id : `${t.id}@${Math.round(t.until)}`)).join(",");

export const encodeTimers = (seq: number, list: Timer[], now: number) =>
  `${seq}|` + list.map((t) => `${t.id}:${Math.max(0, Math.round(t.until - now))}`).join(",");

export function decodeTimers(s: string): { id: string; left: number }[] {
  const body = s.split("|")[1] ?? "";
  if (!body) return [];
  return body.split(",").map((e) => {
    const i = e.lastIndexOf(":");
    return { id: e.slice(0, i), left: Number(e.slice(i + 1)) || 0 };
  });
}

/** "45s" under a minute, "1:30" above. */
export const formatLeft = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
