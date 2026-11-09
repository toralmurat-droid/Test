// What the Summoner conjures out of the Void besides the golems (Void Lord rework, Murat 2026-11-08): the elemental
// wisps' AI (shoot the nearest foe in reach, burst when they go back to the Void) and the Void Arsenal's weapons (a
// circling blade, a piercing lance, a sweeping axe; no monster, no AI). The server (server/TownRoom.ts) and the duel
// simulator (tools/balance/duel.ts) both run them through a SkillHost, so they follow the same rules.
import { addBuff, area, toVoid, type SkillHost } from "./skillEngine";
import { ARSENAL, WISP, type AttuneElement } from "./summons";

/** What one wisp remembers: its element, the power it was called with, when it may shoot again. */
export interface WispMind { el: AttuneElement; power: number; next: number }
export const newWisp = (el: AttuneElement, power: number, now: number, i = 0): WispMind => ({ el, power, next: now + 300 + i * 150 });

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const resonant = (h: SkillHost, owner: string, el: AttuneElement) => (h.golemEls?.(owner).includes(el) ? WISP.resonance : 1);

/** A wisp's turn: when its shot is ready and `target` is within WISP.range, it shoots it in its element. */
export function wispTick(h: SkillHost, owner: string, w: { x: number; y: number }, mind: WispMind, target: string | undefined) {
  const now = h.now(), t = target ? h.unit(target) : undefined;
  if (!t || t.dead || now < mind.next || dist(w, t) > WISP.range) return;
  mind.next = now + WISP.everyMs;
  const S = WISP.shot[mind.el], l = dist(w, t) || 1, vx = (t.x - w.x) / l, vy = (t.y - w.y) / l;
  const dmg = S.dmg * h.magic(owner) * mind.power * resonant(h, owner, mind.el);
  h.shoot({
    owner, skill: "su_wisps", x: w.x + vx * 4, y: w.y - 8 + vy * 4, vx, vy, kind: S.kind, speed: S.speed, range: WISP.range + 20,
    radius: 4, size: 0.7, dmg, pierce: 0, explode: 0, chain: "chain" in S ? S.chain : 0, rank: 1, power: mind.power, kb: 0.3,
    burn: "burn" in S ? S.burn : undefined, slowMs: "slowMs" in S ? S.slowMs : undefined, weakMs: "weakMs" in S ? S.weakMs : undefined, pet: true,
  });
}

/**
 * A wisp went back to the Void at (x, y), its time up or destroyed: a charge of Essence (and Return to the Void), and
 * its element's last burst (fire explodes, frost sends out a slowing wave, venom heals the Summoner, storm speeds them up).
 */
export function wispEnd(h: SkillHost, owner: string, mind: WispMind, x: number, y: number) {
  const o = h.unit(owner);
  if (!o || o.dead) return;
  toVoid(h, owner);
  const E = WISP.end[mind.el];
  if ("area" in E) area(h, owner, { id: "su_wisps" }, E.area, mind.power * resonant(h, owner, mind.el), 1, [x, y]);
  if ("heal" in E && o.maxHp) h.heal(owner, o.maxHp * E.heal / 100);
  if ("buff" in E) addBuff(h, owner, "wisp_shock", E.buff, 1);
  h.fx({ ev: "wispend", id: owner, el: mind.el, x: Math.round(x), y: Math.round(y) });
}

/**
 * Void Arsenal: the hero's weapons for `ms` (the host calls the four wisps itself). The blade is a ground effect that
 * follows the hero; the lance and the axe are timed attacks, each only when a foe is in its reach.
 */
export function openArsenal(h: SkillHost, owner: string, power: number, ms: number) {
  const now = h.now(), o = h.unit(owner);
  if (!o || o.dead) return;
  h.addField({ owner, skill: "su_arsenal", def: { ...ARSENAL.blade, ms }, rank: 1, power, x: o.x, y: o.y, until: now + ms, nextTick: now });
  h.fx({ ev: "arsenal", id: owner, ms });
  const L = ARSENAL.lance, A = ARSENAL.axe;
  for (let t = 300; t < ms; t += L.everyMs) h.later(t, () => throwLance(h, owner, power));
  for (let t = 600; t < ms; t += A.everyMs) h.later(t, () => swingAxe(h, owner, power));
}

/** The nearest foe of `owner` within r of them. */
function nearestFoe(h: SkillHost, owner: string, r: number) {
  const o = h.unit(owner);
  if (!o) return undefined;
  let best: { id: string; x: number; y: number } | undefined, bd = Infinity;
  for (const e of h.enemies(o.x, o.y, r, owner)) {
    const u = h.unit(e);
    if (!u) continue;
    const d = dist(o, u);
    if (d < bd) { bd = d; best = { id: e, x: u.x, y: u.y }; }
  }
  return best;
}

function throwLance(h: SkillHost, owner: string, power: number) {
  const o = h.unit(owner);
  if (!o || o.dead) return;
  const t = nearestFoe(h, owner, ARSENAL.lance.range);
  if (!t) return;
  const L = ARSENAL.lance, l = dist(o, t) || 1, vx = (t.x - o.x) / l, vy = (t.y - o.y) / l;
  h.face(owner, vx, vy);
  h.shoot({ owner, skill: "su_arsenal", x: o.x + vx * 8, y: o.y - 6 + vy * 8, vx, vy, kind: L.kind, speed: L.speed, range: L.range, radius: L.radius, size: 1,
    dmg: L.dmg * h.magic(owner) * power, pierce: L.pierce, explode: 0, chain: 0, rank: 1, power, kb: 0.8 });
}

function swingAxe(h: SkillHost, owner: string, power: number) {
  const o = h.unit(owner);
  if (!o || o.dead) return;
  const A = ARSENAL.axe, t = nearestFoe(h, owner, A.reach);
  if (!t) return;
  const l = dist(o, t) || 1, ax = (t.x - o.x) / l, ay = (t.y - o.y) / l;
  area(h, owner, { id: "su_arsenal" }, A.area, power, 1, [o.x + ax * A.ahead, o.y + ay * A.ahead]);
}
