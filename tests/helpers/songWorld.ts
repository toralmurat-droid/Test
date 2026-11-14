// A tiny world for the skill engine (as in tests/songgauge.test.ts), shared by the Songweaver DI tests: books, songs,
// the lute and its traits.
import { cleanRanks, SKILLS } from "../../shared/skills";
import { afterHit, castSkill, FieldInst, HitOpts, newRuntime, ShotSpec, SkillHost, tickField, tickUnit, Unit } from "../../shared/skillEngine";
import { GAUGE, SONG } from "../../shared/songs";

export function world() {
  let now = 100_000;
  const units = new Map<string, Unit>();
  const hits: { from: string; to: string; dmg: number; o: HitOpts }[] = [];
  const heals: { id: string; amount: number; from?: string }[] = [];
  const fx: any[] = [];
  const fields: FieldInst[] = [];
  const shots: ShotSpec[] = [];
  const later: { at: number; fn: () => void }[] = [];
  const h: SkillHost = {
    now: () => now,
    later: (ms, fn) => later.push({ at: now + ms, fn }),
    unit: (id) => units.get(id),
    canAct: (id) => !units.get(id)?.dead,
    enemies: (x, y, r, of) => [...units.entries()].filter(([id, u]) => id !== of && !u.dead && !u.cls && Math.hypot(u.x - x, u.y - y) <= r).map(([id]) => id),
    allies: (x, y, r, of) => [...units.entries()].filter(([id, u]) => id !== of && !u.dead && !!u.cls && Math.hypot(u.x - x, u.y - y) <= r).map(([id]) => id),
    hit: (from, to, dmg, _push, o) => { hits.push({ from, to, dmg, o }); afterHit(h, from, to, o); },
    heal: (id, amount, from) => { heals.push({ id, amount, from }); const u = units.get(id)!; u.hp = Math.min(u.maxHp!, (u.hp ?? 0) + amount); },
    aim: () => [1, 0], face: () => {}, move: () => {}, place: () => true, invuln: () => {},
    shoot: (s) => shots.push(s), addField: (f) => fields.push(f),
    fear: () => {}, weaponHit: () => 20, magic: () => 1, cooldownMult: () => 1,
    fx: (e) => fx.push(e),
  };
  const add = (id: string, x: number, extra: Partial<Unit> = {}) => {
    const u: Unit = { x, y: 0, dead: false, level: 30, sk: newRuntime(), hp: 200, maxHp: 200, ...extra };
    units.set(id, u);
    return u;
  };
  const step = (ms: number) => {
    now += ms;
    for (const l of later.filter((x) => x.at <= now)) { later.splice(later.indexOf(l), 1); l.fn(); }
    for (const f of [...fields]) if (!tickField(h, f)) fields.splice(fields.indexOf(f), 1);
    for (const id of units.keys()) tickUnit(h, id);
  };
  return { h, add, hits, heals, fx, fields, shots, step, units, get now() { return now; } };
}
export type World = ReturnType<typeof world>;

/** Every Songweaver skill at rank 1 (cleanRanks keeps only what has its parent). */
export const allRanks = () => cleanRanks("songweaver", 30, Object.fromEntries(SKILLS.songweaver.map((s) => [s.id, 1])));
export const singer = (w: World, extra: Partial<Unit> = {}) =>
  w.add("sw", 0, { cls: "songweaver", talents: allRanks(), mana: 0, maxMana: GAUGE.max, ...extra });
/** Casts with its cooldown cleared; steps 500 ms so buildups land. */
export const play = (w: World, skill: string, id = "sw") => {
  const u = w.units.get(id)!;
  u.sk.last = {}; u.attackReadyAt = 0;
  if (u.sk.song) u.sk.song.at -= SONG.changeMs;
  const ok = castSkill(w.h, id, skill);
  w.step(500);
  return ok;
};
export const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
