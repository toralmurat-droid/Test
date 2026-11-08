// What a Summoner's golems do on their own besides their slam (Void Lord rework, Murat 2026-11-08): each element has a
// power (shared/summons.ts GOLEM_SKILL) and bursts out when the golem dies (GOLEM_DEATH). The server
// (server/TownRoom.ts updateSummon) and the duel simulator (tools/balance/duel.ts) both run them through a SkillHost,
// so they follow the same rules. Every blow is dealt in the owner's name, flagged `pet` (SUMMON.pvp applies on heroes).
import { area, type SkillHost } from "./skillEngine";
import { GOLEM_DEATH, GOLEM_SKILL, type AttuneElement } from "./summons";

/** What the AI remembers of one golem. `els`: its element, or both for a Colossus; `boost`: the Colossus's extra. */
export interface GolemMind {
  els: AttuneElement[];
  boost: number;
  strikes: number;
  next: Partial<Record<AttuneElement, number>>;
}
export const newMind = (els: AttuneElement[], boost = 1): GolemMind => ({ els, boost, strikes: 0, next: {} });

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Timed powers, every tick while the golem has a target (`blow`: the damage of one of its slams): the fire golem bursts
 * into flames when a foe is close, the venom golem leaves a pool under its foe, the storm golem throws chain lightning.
 */
export function golemTick(h: SkillHost, owner: string, g: { x: number; y: number }, mind: GolemMind, target: string | undefined, blow: number, power: number) {
  const now = h.now(), t = target ? h.unit(target) : undefined;
  if (!t || t.dead) return;
  const d = dist(g, t);
  for (const el of mind.els) {
    if (now < (mind.next[el] ?? 0)) continue;
    if (el === "fire" && d <= GOLEM_SKILL.fire.r) {
      const S = GOLEM_SKILL.fire;
      mind.next.fire = now + S.everyMs;
      for (const e of h.enemies(g.x, g.y, S.r * mind.boost, owner)) {
        const u = h.unit(e);
        if (u) h.hit(owner, e, blow * S.mult * mind.boost, push(g, u), { kb: 0.8, burn: S.burn, pet: true });
      }
      h.fx({ ev: "golemfire", id: owner, x: Math.round(g.x), y: Math.round(g.y), r: S.r * mind.boost });
    } else if (el === "poison" && d <= 40) {
      const S = GOLEM_SKILL.poison;
      mind.next.poison = now + S.everyMs;
      h.addField({ owner, skill: "su_golem", def: { ...S.field, r: S.field.r * mind.boost }, rank: 1, power: power * mind.boost, x: t.x, y: t.y, until: now + S.field.ms, nextTick: now });
    } else if (el === "shock" && d <= GOLEM_SKILL.shock.range) {
      const S = GOLEM_SKILL.shock;
      mind.next.shock = now + S.everyMs;
      const pts: [number, number][] = [[g.x, g.y - 20]], done = new Set<string>();
      let cur: string | undefined = target, dmg = blow * S.mult * mind.boost;
      for (let i = 0; i <= S.hops && cur; i++) {
        const u = h.unit(cur)!;
        done.add(cur);
        pts.push([u.x, u.y]);
        h.hit(owner, cur, dmg, push(g, u), { kb: 0.2, stunMs: S.stunMs, el: "shock", pet: true });
        dmg *= 0.8;
        const from = u;
        cur = h.enemies(from.x, from.y, 72, owner).filter((e) => !done.has(e)).sort((a, b) => dist(h.unit(a)!, from) - dist(h.unit(b)!, from))[0];
      }
      h.fx({ ev: "chain", id: owner, pts });
    }
  }
}

/** On each slam: the frost golem freezes its target with every third blow. Returns extra effects for that blow. */
export function golemStrike(mind: GolemMind): { stunMs?: number } {
  mind.strikes++;
  if (mind.els.includes("cold") && mind.strikes % GOLEM_SKILL.cold.every === 0) return { stunMs: GOLEM_SKILL.cold.stunMs * mind.boost };
  return {};
}

/** A golem of these elements fell at (x, y): each element bursts out (`power`: the golem's skill power). */
export function golemDeath(h: SkillHost, owner: string, els: AttuneElement[], x: number, y: number, power: number) {
  const now = h.now();
  for (const el of new Set(els)) {
    const d = GOLEM_DEATH[el];
    if (d.area) area(h, owner, { id: "su_golem" }, d.area, power, 1, [x, y]);
    if (d.field) h.addField({ owner, skill: "su_golem", def: d.field, rank: 1, power, x, y, until: now + d.field.ms, nextTick: now });
    h.fx({ ev: "golemdeath", id: owner, el, x: Math.round(x), y: Math.round(y) });
  }
}

function push(g: { x: number; y: number }, u: { x: number; y: number }): [number, number] {
  const l = dist(g, u) || 1;
  return [(u.x - g.x) / l, (u.y - g.y) / l];
}
