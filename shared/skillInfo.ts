import { CLASSES, ClassKind } from "./classes";
import { attackMult, magicMult, Stats, STATS, STAT_NAMES } from "./powers";
import { AreaDef, levelPower, rankPower, rankTime, scalePower, ShotDef, SkillDef, STACK_POWER, STACK_NAME } from "./skills";

/**
 * Damage numbers for the skill sheet (client/src/talents.ts), computed with the same rules as
 * shared/skillEngine.ts: weapon part (`wpn` x class damage x attack stat) + skill part (`dmg` x Magic),
 * times rank, level and attribute power. Shown for the hero's current stats and gear.
 */
export interface DmgPart { what: string; per: number; n: number }
export interface DmgInfo { parts: DmgPart[]; total: number; burn?: number; stacks?: string }

export function skillDamage(cls: ClassKind, s: SkillDef, rank: number, st: Stats): DmgInfo | undefined {
  if (s.passive) return undefined;
  const r = Math.max(1, rank);
  const power = rankPower(r) * levelPower(s) * (s.power ?? 1) * scalePower(s, st, STATS[cls].base);
  const t = rankTime(r);
  const wpnHit = CLASSES[cls].damage * attackMult(cls, st), mag = magicMult(cls, st);
  const base = (a: { wpn?: number; dmg?: number }) => ((a.wpn ?? 0) * wpnHit + (a.dmg ?? 0) * mag) * power;
  const parts: DmgPart[] = [];
  let burn = 0;
  const add = (what: string, per: number, n: number) => { if (per >= 0.5) parts.push({ what, per: Math.round(per), n }); };
  const effects = (e: { burn?: [number, number] }) => { if (e.burn) burn = Math.max(burn, e.burn[0] * e.burn[1] * t / 1000 * mag); };
  const area = (a: AreaDef, what = "hit") => { add(what, base(a), a.waves ?? 1); effects(a); };
  const shot = (d: ShotDef, what = "shot") => {
    const n = d.n ?? 1;
    add(n > 1 ? `${what}s` : what, base(d), n);
    if (d.explode && (d.wpn || d.dmg)) {/* the blast is the same hit */ }
    if (d.field) field(d.field.ms, d.field);
    effects(d);
  };
  const field = (ms: number, f: NonNullable<SkillDef["field"]>) => {
    const ticks = Math.max(1, Math.floor(ms * t / f.tickMs));
    if (f.wpn || f.dmg) add("per tick", base(f), ticks);
    if (f.zap) add("per bolt", f.zap.dmg * mag * power, ticks * f.zap.n);
    if (f.turret) add("per arrow", base(f.turret), ticks);
    if (f.burst) area(f.burst, "blast");
    effects(f);
  };
  if (s.move?.path) add("per enemy passed", base({ wpn: s.move.path }), 1);
  if (s.move?.kind === "multi") add("per slash", base({ wpn: s.move.wpn ?? 1 }), s.move.hits ?? 1);
  for (const a of s.areas ?? []) area(a);
  if (s.cry && (s.cry.wpn || s.cry.dmg)) area(s.cry);
  if (s.shots) shot(s.shots);
  if (s.field) field(s.field.ms, s.field);
  if (s.counter) {
    const c = s.counter;
    if (c.wpn) add("strike back", base(c), 1);
    if (c.area) area(c.area, "blast");
    if (c.shot) shot(c.shot, "arrow");
  }
  if (s.buff?.onHit?.wpn) add("extra per hit", s.buff.onHit.wpn * wpnHit * power, 1);
  if (s.buff?.onHit) effects(s.buff.onHit);
  if (s.buff?.thorns) add("to attackers", base(s.buff.thorns), 1);
  if (!parts.length && !burn) return undefined;
  const total = Math.round(parts.reduce((x, p) => x + p.per * p.n, 0) + burn);
  const stacks = s.consume ? `+${Math.round(s.buff?.perStack ?? STACK_POWER * 100)}% per ${STACK_NAME[cls]} stack spent` : undefined;
  return { parts, total, burn: burn ? Math.round(burn) : undefined, stacks };
}

/** "54 x2 hits, burns 30" style one-liner. */
export function damageText(d: DmgInfo | undefined): string {
  if (!d) return "";
  const main = d.parts.map((p) => (p.n > 1 ? `${p.per} ×${p.n} ${p.what}` : `${p.per}${p.what === "hit" ? "" : ` ${p.what}`}`)).join(" + ");
  return [main, d.burn ? `burns ${d.burn}` : ""].filter(Boolean).join(", ");
}

/** "+3% per Strength point" */
export const scaleText = (s: SkillDef) => (s.scale ? `+${s.scale.per}% per ${STAT_NAMES[s.scale.stat]} point` : "");
