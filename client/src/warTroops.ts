/**
 * Clan troops in the world (shared/war/patrols.ts): soldiers of each land's holder walk a loop from its Hold past its
 * standards, and in a siege both clans clash at the standards. Pure decoration: every client derives the same picture
 * from the "war" snapshot and the wall clock, nothing goes to the server, and the soldiers are plain sprites (no HP
 * bar, no name, never in the way). Only lands with a stop near the hero have sprites.
 */
import Phaser from "phaser";
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { patrolOf, patrolPos, TROOP, TROOP_LOOK, type Patrol } from "../../shared/war/patrols";
import { HOLDS, STANDARDS } from "../../shared/war/standards";
import type { WarView } from "../../shared/war/view";
import { underground } from "../../shared/dungeon";
import { CHAR_ORIGIN, CHAR_SCALE, ensureCharSheet, playCharAnim } from "./artAssets";
import { ISO, screenDir, setBaseDepth } from "./iso";
import { MOB_LOOK, mobTexture } from "./textures";
import { faceOf } from "./watch";
import { pennant } from "./warPlaque";

const FADE_MS = 900;
const CHECK_MS = 400; // how often the set of nearby lands is re-read
const SHEET = "watchman"; // the Wardens' soldiers are townsfolk-style characters, everyone else's are monster sheets
const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
const ATTACK_BASE: Record<string, number> = { down: 6, up: 8, right: 10, left: 10 };
const FLAG_H = 44;

/** Where each land's stops are (Hold and standards): used to find nearby lands without building any patrol. */
const STOPS = new Map<number, { x: number; y: number }[]>();
function stopsOf(t: number) {
  if (!STOPS.size) {
    for (const h of HOLDS) (STOPS.get(h.t) ?? STOPS.set(h.t, []).get(h.t)!).push(h);
    for (const s of STANDARDS) (STOPS.get(s.t) ?? STOPS.set(s.t, []).get(s.t)!).push(s);
  }
  return STOPS.get(t);
}

/** A clan's small banner on a pole (the pennant from the war plaque), 1 art px = 1 world px. */
function flagTexture(scene: Phaser.Scene, k: ClanKey): string {
  const key = `troopflag_${k}`;
  if (scene.textures.exists(key)) return key;
  const c = document.createElement("canvas");
  c.width = 16; c.height = FLAG_H;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#1a1008"; g.fillRect(7, 0, 2, FLAG_H);
  g.fillStyle = "#6a4a28"; g.fillRect(7, 2, 1, FLAG_H - 2);
  g.drawImage(pennant(k), 0, 0);
  scene.textures.addCanvas(key, c)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

interface Soldier {
  spr: Phaser.GameObjects.Sprite;
  char: boolean; kind: string; weapon: string;
  face: string; key: string; frame: number; x: number; y: number;
  flag?: Phaser.GameObjects.Image;
}

interface Squad {
  t: number;
  sig: string;
  men: Soldier[];
  patrol?: Patrol;
  /** Per-stop arc positions along the loop (px), ascending, for the pause mapping. */
  arcs?: number[];
  cycle: number; // virtual loop length: the route plus one pause (as distance) per stop
  phase: number;
  /** Siege pairs: soldier i fights i ^ 1 (even = attacker, left on screen). */
  duel?: { x: number; y: number }[];
  alpha: number; target: number;
}

/** Troop kind -> the monster kind and weapon variant the mob sheet is picked by ("skeleton_spear", "gnawkin_folk"). */
const split = (name: string): [string, string] => { const [k, w] = name.split("_"); return [k, w ?? ""]; };

export class WarTroops {
  private view?: WarView;
  private squads = new Map<number, Squad>();
  private dying: Squad[] = [];
  private noPatrol = new Set<number>();
  private checkAt = 0;
  private dirty = false;
  private lastNow = 0;
  private sheetAsked = false;

  constructor(private scene: Phaser.Scene) {}

  /** The war snapshot: owners and sieges decide who walks where. Squads that no longer match fade out at the next check. */
  setWar(v: WarView) { this.view = v; this.dirty = true; }

  /** What a land's squad looks like now: holder, and the attacker while a siege is called. */
  private sigOf(t: number): string {
    const v = this.view!;
    const sg = v.sieges.find((s) => s[0] === t);
    return `${v.owner[t]}|${sg ? sg[1] : ""}`;
  }

  update(me: { x: number; y: number } | undefined, _now: number) {
    const wall = Date.now(), dt = this.lastNow ? Math.max(0, Math.min(100, wall - this.lastNow)) : 16;
    this.lastNow = wall;
    if (me && underground(me.y)) { this.clear(); return; } // dungeon floors: no clan troops
    if (this.view && me && (this.dirty || wall >= this.checkAt)) { this.dirty = false; this.checkAt = wall + CHECK_MS; this.sync(me); }
    if (!this.squads.size && !this.dying.length) return;
    const ready = this.scene.anims.exists(`${SHEET}_idle_down`);
    for (const s of this.squads.values()) this.draw(s, wall, dt, ready);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const s = this.dying[i];
      this.draw(s, wall, dt, ready);
      if (s.alpha <= 0) { this.destroy(s); this.dying.splice(i, 1); }
    }
  }

  private clear() {
    for (const s of this.squads.values()) this.destroy(s);
    for (const s of this.dying) this.destroy(s);
    this.squads.clear(); this.dying.length = 0;
  }

  /** Squads for the lands with a stop near the hero; mismatching ones fade out and get replaced, far ones go. */
  private sync(me: { x: number; y: number }) {
    const v = this.view!, r2 = TROOP.viewRange * TROOP.viewRange;
    for (const [t, s] of this.squads) {
      const k = CLAN_KEYS[v.owner[t]];
      if (!k || !this.near(t, me, r2 * 4)) { // kept out to twice the range: a long leg's middle is far from both stops this.destroy(s); this.squads.delete(t); continue; }
      if (s.sig !== this.sigOf(t)) { s.target = 0; this.dying.push(s); this.squads.delete(t); }
    }
    for (let t = 0; t < v.owner.length; t++) {
      if (this.squads.has(t) || this.noPatrol.has(t) || !CLAN_KEYS[v.owner[t]] || !this.near(t, me, r2)) continue;
      const s = this.build(t);
      if (s) this.squads.set(t, s); else this.noPatrol.add(t);
    }
  }

  private near(t: number, me: { x: number; y: number }, r2: number): boolean {
    const st = stopsOf(t);
    if (!st) return false;
    for (const p of st) { const dx = p.x - me.x, dy = p.y - me.y; if (dx * dx + dy * dy <= r2) return true; }
    return false;
  }

  private soldier(clan: ClanKey, i: number): Soldier {
    const name = TROOP_LOOK[clan].kinds[i % TROOP_LOOK[clan].kinds.length];
    const char = name === SHEET, [kind, weapon] = split(name);
    const spr = char
      ? this.scene.add.sprite(0, 0, "__DEFAULT").setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE)
      : this.scene.add.sprite(0, 0, mobTexture(this.scene, kind, 1, weapon), 0).setOrigin(0.5, MOB_LOOK[kind]?.oy ?? 0.85).setScale(MOB_LOOK[kind]?.scale ?? 1);
    spr.setVisible(false).setAlpha(0);
    return { spr, char, kind, weapon, face: "down", key: "", frame: -1, x: 0, y: 0 };
  }

  private build(t: number): Squad | undefined {
    const v = this.view!, clan = CLAN_KEYS[v.owner[t]], p = patrolOf(t);
    if (!clan || !p) return undefined;
    const sg = v.sieges.find((s) => s[0] === t), atk = sg ? CLAN_KEYS[sg[1]] : undefined;
    const sq: Squad = { t, sig: this.sigOf(t), men: [], cycle: 0, phase: 0, alpha: 0, target: 1 };
    if (atk) {
      // siege: pairs at each standard, the attackers on the left of the screen, the holders on the right
      sq.duel = [];
      const n = TROOP.skirmishPerStandard, std = STANDARDS.filter((s) => s.t === t);
      const ax = ISO ? Math.SQRT1_2 : 1, ay = ISO ? -Math.SQRT1_2 : 0; // the screen's horizontal, in world terms
      for (const s of std) for (let j = 0; j < n; j++) {
        const off = (j - (n - 1) / 2) * 34, cx = s.x - ay * off, cy = s.y + ax * off; // pairs side by side across the line of fire
        sq.men.push(this.soldier(atk, j), this.soldier(clan, j));
        sq.duel.push({ x: cx - ax * 13, y: cy - ay * 13 }, { x: cx + ax * 13, y: cy + ay * 13 });
      }
      return sq;
    }
    sq.patrol = p;
    sq.arcs = [];
    let acc = 0;
    const arcAt = p.pts.map((a, i) => { const at = acc, b = p.pts[(i + 1) % p.pts.length]; acc += Math.hypot(b.x - a.x, b.y - a.y); return at; });
    for (const i of p.stops) sq.arcs.push(arcAt[i]);
    sq.arcs.sort((a, b) => a - b);
    sq.cycle = p.len + sq.arcs.length * this.pauseD();
    sq.phase = (t * 977) % sq.cycle;
    for (let i = 0; i < TROOP.perPatrol; i++) sq.men.push(this.soldier(clan, i));
    sq.men[0].flag = this.scene.add.image(0, 0, flagTexture(this.scene, clan)).setOrigin(0.5, 1).setVisible(false).setAlpha(0);
    return sq;
  }

  /** A pause as a distance at walking speed: the time -> distance map is one speed with pauses spliced in. */
  private pauseD() { return TROOP.speed * TROOP.pauseMs / 1000; }

  /**
   * Distance along the loop of the lead soldier at wall time `wall` and whether the squad is paused. A virtual
   * position u = (time * speed + phase) mod cycle runs at constant speed; each stop owns a stretch of pauseD in it
   * where the squad stands still. Same inputs on every client, so the same picture.
   */
  private lead(s: Squad, wall: number): { d: number; paused: boolean } {
    const arcs = s.arcs!, pd = this.pauseD(), u = (((wall / 1000) * TROOP.speed + s.phase) % s.cycle + s.cycle) % s.cycle;
    for (let k = 0; k < arcs.length; k++) {
      const arrive = arcs[k] + k * pd;
      if (u < arrive) return { d: u - k * pd, paused: false };
      if (u < arrive + pd) return { d: arcs[k], paused: true };
    }
    return { d: u - arcs.length * pd, paused: false };
  }

  private draw(s: Squad, wall: number, dt: number, sheetReady: boolean) {
    s.alpha += Math.sign(s.target - s.alpha) * Math.min(Math.abs(s.target - s.alpha), dt / FADE_MS);
    const patrol = s.patrol;
    let lead: { d: number; paused: boolean } | undefined;
    if (patrol) lead = this.lead(s, wall);
    for (let i = 0; i < s.men.length; i++) {
      const m = s.men[i];
      if (m.char && !sheetReady) { // the watchman sheet is on its way: hide the Wardens' soldiers until it is here
        if (!this.sheetAsked) { this.sheetAsked = true; if (ensureCharSheet(this.scene, SHEET, undefined, 300)) this.sheetAsked = false; }
        m.spr.setVisible(false); m.flag?.setVisible(false);
        continue;
      }
      if (m.char && m.frame < 0) { m.spr.setTexture(SHEET, 0); m.frame = 0; }
      let x: number, y: number, face: string, anim: "walk" | "idle" | "attack";
      let strike = false;
      if (patrol && lead) {
        const q = patrolPos(patrol, lead.d - i * TROOP.gap); // soldiers wait in file behind the stop, then follow the leader
        x = q.x; y = q.y;
        face = this.facing(m, q.dx, q.dy);
        anim = lead.paused ? "idle" : "walk";
      } else {
        const at = s.duel![i], mate = s.duel![i ^ 1], left = !(i & 1);
        const cyc = (wall + i * 370 + (i >> 1) * 250) % 1100;
        strike = cyc > 600;
        const lunge = strike ? 3 : 0;
        x = at.x + (mate.x - at.x) / 26 * lunge; y = at.y + (mate.y - at.y) / 26 * lunge;
        face = left ? "right" : "left";
        anim = "attack";
      }
      m.spr.setVisible(true).setAlpha(s.alpha);
      if (x !== m.x || y !== m.y) { m.x = x; m.y = y; m.spr.setPosition(x, y); setBaseDepth(m.spr, y); }
      if (m.char) {
        const key = `${anim}|${face}`;
        if (key !== m.key || !m.spr.anims.isPlaying) { m.key = key; playCharAnim(m.spr, SHEET as any, anim === "attack" ? (strike ? "attack3" : "attack") : anim, face); }
      } else {
        const win = m.spr.texture.frameTotal > 12;
        const f = anim === "attack" && win ? ATTACK_BASE[face] + (strike ? 1 : 0)
          : FRAME_BASE[face] + (anim === "walk" ? Math.floor(wall / 220 + i) % 2 : 0);
        if (f !== m.frame) { m.frame = f; m.spr.setFrame(f); }
        m.spr.setFlipX(face === "left");
      }
      if (m.flag) {
        const f = m.flag;
        f.setVisible(true).setAlpha(s.alpha).setPosition(x + (ISO ? 7 : 9), y + (ISO ? -7 : 0));
        setBaseDepth(f, y + 0.5);
      }
    }
  }

  /** The facing to draw for a world direction: 8 ways for characters, 4 for monster sheets (screen directions in iso). */
  private facing(m: Soldier, dx: number, dy: number): string {
    if (m.char) return m.face = faceOf(dx, dy, m.face);
    const d = ISO ? screenDir(dx, dy, m.face) : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    return m.face = d;
  }

  private destroy(s: Squad) { for (const m of s.men) { m.flag?.destroy(); m.spr.destroy(); } s.men.length = 0; }
}
