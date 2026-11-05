import type { FxStyle } from "../../shared/skills";
import { baseId, GearSlot, itemElement, itemLevel } from "../../shared/gear";
import type { Element } from "../../shared/elements";
import { ISO } from "./isoflag";
import { activeOf } from "./gear";
import { FxEntity, PALETTE, SkillFx } from "./skillfx";

/**
 * Item level effects: the higher an item's level (shared/gear.ts itemLevel), the more it shows on the hero.
 *   Lv 8+   glint:  sparkles of the item's element (weapon edge, crown, shield rim...)
 *   Lv 15+  trail:  weapon swings leave a coloured slash, boots kick up sparks, armour sheds motes
 *   Lv 22+  flame:  the weapon burns / freezes / crackles all the time, an aura rises off armour, embers off the hat
 *   Lv 28+  mythic: combo finishers burst into a shockwave and pillar of light, boots leave afterimages,
 *                   a glow under the feet
 * Only worn items whose requirements are met count (activeOf). Particles are SkillFx's, so they work in iso too.
 *
 * Damage types (shared/elements.ts) pick the look: a fire weapon sheds embers, a cold one frost mist and flakes, a
 * poison one drips venom, a faith one floats golden motes. Even a Lv 1 elemental weapon shows a faint sign of its
 * element; the rank makes it richer. This is Tier I (the first zone); later tiers are planned in project memory.
 */
export const FX_LEVELS = [8, 15, 22, 28];
export const FX_RANK_NAMES = ["", "Glint", "Trail", "Flame", "Mythic"];

/** 0 (plain) .. 4 (mythic) for an item id. */
export function fxRank(id: string | undefined): number {
  if (!id) return 0;
  const l = itemLevel(id);
  let r = 0;
  for (const t of FX_LEVELS) if (l >= t) r++;
  return r;
}

/** Element of each base item's effects. */
const STYLE: Record<string, FxStyle> = {
  w_bronze: "holy", w_frost: "frost", w_dragon: "fire", w_ash: "nature", w_long: "lightning", w_sky: "holy",
  sh_wood: "earth", sh_iron: "steel", sh_dragon: "fire",
  r_sling: "earth", r_knives: "steel", r_crossbow: "lightning",
  a_leather: "earth", a_chain: "steel", a_royal: "blood",
  s_leather: "earth", s_swift: "wind", s_winged: "spirit",
  h_cap: "nature", h_helm: "steel", h_crown: "holy",
};
/** Effect style of each damage type. */
export const ELEMENT_STYLE: Record<Element, FxStyle> = { fire: "fire", cold: "frost", poison: "poison", faith: "holy", shock: "lightning" };
/** An item's style: its element when it has one, plain steel for other weapons, else the item's own look. */
const styleOf = (id: string): FxStyle => {
  const el = itemElement(id);
  if (el) return ELEMENT_STYLE[el];
  return baseId(id).startsWith("w") ? "steel" : STYLE[baseId(id)] ?? "arcane";
};
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class GearFx {
  private lastGhost = new WeakMap<FxEntity, number>();

  constructor(private fx: SkillFx) {}

  /** Weapon hand, a little in front of the hero along the aim. */
  private hand(e: FxEntity): [number, number] {
    const ax = e.state.ax ?? 0, ay = e.state.ay ?? 1;
    return [e.sprite.x + ax * 6, e.sprite.y + ay * 6];
  }

  /** Every frame for each visible hero. */
  tick(e: FxEntity, dtMs: number, moving: boolean) {
    const now = e.sprite.scene.time.now;
    if (e.state.dead || !e.sprite.visible || e.state.hidden) return;
    const dt = Math.min(0.05, dtMs / 1000);
    const chance = (perSec: number) => Math.random() < perSec * dt;
    const worn = activeOf(e.state);
    const x = e.sprite.x, y = e.sprite.y, top = e.top;
    const fx = this.fx;
    const rank = (s: GearSlot) => fxRank(worn[s]);

    // Weapon: glints, then a constant elemental flame along the blade, then a glow under the feet
    const w = worn.weapon, wr = rank("weapon");
    const wel = w ? itemElement(w) : undefined;
    if (w && (wr || wel)) {
      const pal = PALETTE[styleOf(w)];
      const [hx, hy] = this.hand(e);
      if (wr && chance(2.5 * wr)) fx.p(hx + rnd(-3, 3), hy + rnd(-2, 2), top * 0.45 + rnd(-4, 5), 0xffffff, { life: 120, size: 2, size1: 0 });
      // the element's sign: faint at Lv 1, a steady stream from Flame rank
      if (wel) this.elementIdle(wel, hx, hy, top, wr, chance);
      else if (wr >= 3 && chance(16 + 10 * (wr - 3))) {
        fx.p(hx + rnd(-3, 3), hy + rnd(-2, 2), top * 0.4 + rnd(-4, 6), pick(pal), { vz: rnd(14, 32), vx: rnd(-4, 4), vy: rnd(-3, 3), life: rnd(260, 480), size: pick([1, 1, 2]), size1: 0 });
      }
      if (wr >= 4 && chance(3)) fx.glow(x, y, 0, 14, pal[2], 600, 0.45, true);
    }

    // Armour: motes, then an aura rising round the body, then sparks circling it
    const a = worn.armour, ar = rank("armour");
    if (a && ar >= 2) {
      const pal = PALETTE[styleOf(a)];
      const per = ar === 2 ? 3 : ar === 3 ? 10 : 16;
      if (chance(per)) {
        const ang = Math.random() * Math.PI * 2;
        fx.p(x + Math.cos(ang) * 7, y + Math.sin(ang) * 3, rnd(0, top * 0.7), pick(pal), { vz: rnd(10, 26), life: rnd(400, 700), size: 1, size1: 0 });
      }
      if (ar >= 4 && chance(12)) {
        const ang = now / 360 + Math.random() * 0.4;
        fx.p(x + Math.cos(ang) * 10, y + Math.sin(ang) * (ISO ? 5 : 4), top * 0.5 + Math.sin(ang * 2) * 4, pick(pal), { life: 260, size: 1, size1: 0 });
      }
    } else if (a && ar === 1 && chance(1.5)) fx.p(x + rnd(-5, 5), y, rnd(4, top * 0.7), 0xffffff, { life: 110, size: 1, size1: 0 });

    // Hat: a glint, then embers / a halo of motes over the head
    const h = worn.hat, hr = rank("hat");
    if (h && hr) {
      const pal = PALETTE[styleOf(h)];
      if (chance(1.5 * hr)) fx.p(x + rnd(-4, 4), y, top + rnd(-3, 1), 0xffffff, { life: 120, size: 2, size1: 0 });
      if (hr >= 3 && chance(6 + 4 * (hr - 3))) {
        const ang = now / 280 + Math.random() * 6;
        fx.p(x + Math.cos(ang) * 5, y + Math.sin(ang) * 2, top + 3, pick(pal), { vz: rnd(6, 16), life: rnd(300, 500), size: 1, size1: 0 });
      }
    }

    // Shield: the rim shimmers
    const sh = worn.shield, sr = rank("shield");
    if (sh && sr && chance(2 * sr)) {
      const side = e.sprite.flipX ? 5 : -5;
      fx.p(x + side + rnd(-2, 2), y + rnd(-1, 1), top * 0.45 + rnd(-5, 5), pick(PALETTE[styleOf(sh)]), { vz: sr >= 3 ? rnd(4, 14) : 0, life: 200, size: 1, size1: 0 });
    }

    // Ranged weapon on the back: a quiet glint
    const rg = worn.ranged, rr = rank("ranged");
    if (rg && rr && chance(1.2 * rr)) fx.p(x + rnd(-4, 4), y, top * 0.6 + rnd(-3, 3), pick(PALETTE[styleOf(rg)]), { life: 160, size: 1, size1: 0 });

    // Boots: sparks at the feet while moving, afterimages at mythic
    const b = worn.shoes, br = rank("shoes");
    if (b && br && moving) {
      const pal = PALETTE[styleOf(b)];
      if (br >= 2 && chance(br === 2 ? 8 : 16)) {
        fx.p(x + rnd(-3, 3), y + rnd(-1, 1), rnd(0, 2), pick(pal), { vz: rnd(8, 22), vx: rnd(-10, 10), vy: rnd(-6, 6), g: 60, life: rnd(260, 420), size: 1, size1: 0 });
      } else if (br === 1 && chance(2)) fx.p(x + rnd(-3, 3), y, 1, 0xffffff, { life: 100, size: 1, size1: 0 });
      if (br >= 4) {
        const last = this.lastGhost.get(e) ?? 0;
        if (now - last > 110) { this.lastGhost.set(e, now); fx.ghost(e, x, y, pal[2], 0.3, 240); }
      }
    }
  }

  /**
   * Idle sign of a weapon's element at the hand. Rank 0-1: a particle now and then; 2: more often;
   * 3+ (Flame): a steady stream in the element's own motion; 4 (Mythic): plus a soft light.
   */
  private elementIdle(el: Element, hx: number, hy: number, top: number, wr: number, chance: (perSec: number) => boolean) {
    const fx = this.fx, pal = PALETTE[ELEMENT_STYLE[el]];
    const rate = wr <= 1 ? 1.2 : wr === 2 ? 3 : wr === 3 ? 14 : 22;
    if (!chance(rate)) return;
    const z = top * 0.42 + rnd(-4, 6), px = hx + rnd(-3, 3), py = hy + rnd(-2, 2);
    const big = wr >= 3 ? pick([1, 1, 2]) : 1;
    switch (el) {
      case "fire": // embers flicker up
        fx.p(px, py, z, pick(pal), { vz: rnd(16, 34), vx: rnd(-5, 5), vy: rnd(-3, 3), life: rnd(260, 480), size: big, size1: 0, add: true });
        break;
      case "cold": // frost mist sinks, flakes drift
        fx.p(px, py, z, pick(pal), { vz: rnd(-14, -4), vx: rnd(-6, 6), vy: rnd(-2, 2), drag: 2, life: rnd(420, 700), size: big, size1: 0, alpha: 0.85 });
        break;
      case "poison": // venom drips off the blade to the ground
        fx.p(px, py, z * 0.8, pick(pal.slice(1)), { vz: rnd(-4, 0), g: 140, life: rnd(380, 560), size: 1, size1: 1 });
        break;
      case "faith": // golden motes rise slowly and circle
        fx.p(px + rnd(-2, 2), py, z, pick(pal), { vz: rnd(5, 12), vx: rnd(-3, 3), life: rnd(500, 800), size: big, size1: 0, add: true, spin: rnd(-3, 3) });
        break;
      case "shock": // quick crackles that jump about the blade
        fx.p(px, py, z, pick(pal), { vx: rnd(-30, 30), vy: rnd(-12, 12), vz: rnd(-20, 20), drag: 6, life: rnd(90, 160), size: big, size1: 0, add: true });
        break;
    }
    if (wr >= 4 && chance(4)) fx.glow(hx, hy, top * 0.42, 6, pal[2], 420, 0.5);
  }

  /** A hero's hit landed with an element (server "hit" with el): a small impact in its colour on the target. */
  impact(x: number, y: number, top: number, el: Element, dot: boolean) {
    const pal = PALETTE[ELEMENT_STYLE[el]], z = top * 0.5, n = dot ? 2 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(20, 45);
      switch (el) {
        case "fire": this.fx.p(x + rnd(-3, 3), y, z + rnd(-4, 4), pick(pal), { vz: rnd(20, 40), vx: Math.cos(a) * v * 0.4, vy: Math.sin(a) * v * 0.2, life: rnd(240, 400), size: 1, size1: 0, add: true }); break;
        case "cold": this.fx.p(x, y, z, pick(pal), { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: rnd(10, 30), g: 120, life: rnd(260, 380), size: pick([1, 2]), size1: 0 }); break;
        case "poison": this.fx.p(x, y, z, pick(pal.slice(1)), { vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v * 0.35, vz: rnd(15, 35), g: 160, life: rnd(300, 420), size: 1, size1: 1 }); break;
        case "faith": this.fx.p(x + Math.cos(a) * 3, y + Math.sin(a) * 2, z, pick(pal), { vz: rnd(14, 26), life: rnd(320, 480), size: 1, size1: 0, add: true }); break;
        case "shock": this.fx.p(x, y, z, pick(pal), { vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v * 0.7, vz: rnd(-10, 30), drag: 5, life: rnd(120, 220), size: 1, size1: 0, add: true }); break;
      }
    }
    if (!dot && el === "faith") this.fx.glow(x, y, z, 7, pal[1], 260, 0.6);
  }

  /** A hero attacked (combo step 0..2): weapon trails, sparks, and a finisher flourish on mythic weapons. */
  swing(e: FxEntity, step: number, ax: number, ay: number, ranged: boolean, mine: boolean) {
    const w = activeOf(e.state).weapon, wr = fxRank(w);
    if (!w) return;
    const style = styleOf(w), pal = PALETTE[style];
    const x = e.sprite.x, y = e.sprite.y, top = e.top;
    const hx = x + ax * 8, hy = y + ay * 8;
    // Elemental weapons of any level: a few sparks of the element off the swing / at the bow
    const el = itemElement(w);
    if (el && wr < 2) { this.fx.burst(hx, hy, top * 0.45, style, 2 + wr * 2, 40, 300); return; }
    if (wr < 2) return;
    if (!ranged) this.fx.slash(x + ax * 4, y + ay * 4, 12 + 2 * wr, style, Math.atan2(ISO ? (ax + ay) / 2 : ay, ISO ? ax - ay : ax), 2 + 0.3 * wr);
    if (wr >= 3) this.fx.burst(hx, hy, top * 0.45, style, 4 + 3 * (wr - 2), 50 + 15 * wr, 380);
    if (wr >= 4 && step === 2) {
      // Finisher: shockwave ring and a pillar of light (no screen flash: it washed out the fight)
      this.fx.ring(x, y, 34, style, 26, { up: 26, life: 460, size: 2 });
      this.fx.pillar(x, y, style, 70, 6, 420);
      this.fx.glow(x, y, top * 0.5, 40, pal[1], 380, 0.9);
    }
  }
}
