/**
 * Clan troops in the world (shared/war/patrols.ts): each land's holder marches a column (two abreast, pennant and
 * officer in front) from its Hold past its standards, keeps a few guards at the Hold, and in a siege both clans fight
 * a battle at every standard (loose lines, duels, some fall, reinforcements walk in). Sprites are created and destroyed per land when a squad changes. Pure decoration: every client derives the same picture
 * from the "war" snapshot and the wall clock, nothing goes to the server, and the soldiers are plain sprites (no HP
 * bar, no name, never in the way). Only lands with a stop near the hero have sprites. With WAR_TROOPS.live the server's real
 * troops (server/warTroops.ts, drawn by TownScene as "trooper" monsters) replace the column and the guards: only the siege
 * battles are still drawn here, and not on the land whose siege the server fields for real ("siege" message, server/warSieges.ts).
 */
import Phaser from "phaser";
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { viewTier, holdGuards } from "../../shared/war/intel";
import { garrisonSpots, mix, patrolCount, patrolOf, patrolPos, SIEGE_FIGHT, siegeCounts, siegeLife, TROOP, TROOP_LOOK, type Patrol } from "../../shared/war/patrols";
import { HOLDS, STANDARDS } from "../../shared/war/standards";
import type { WarView } from "../../shared/war/view";
import { underground } from "../../shared/dungeon";
import { isSolidAt } from "../../shared/map";
import { attackAxis } from "../../shared/war/siege";
import { WAR_TROOPS } from "../../shared/war/troops";
import { CHAR_ORIGIN, CHAR_SCALE, ensureCharSheet, playCharAnim } from "./artAssets";
import { ISO, screenDir, setBaseDepth } from "./iso";
import { MOB_LOOK, mobTexture, WAR_LEGACY, warSoldierTexture } from "./textures";
import { SMOOTH } from "./isoflag";
import { faceOf } from "./watch";
import { pennant } from "./warPlaque";

const FADE_MS = 900;
const CHECK_MS = 400; // how often the set of nearby lands is re-read
const SHEET = "watchman"; // the Wardens' soldiers are townsfolk-style characters, everyone else's are monster sheets
const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
const ATTACK_BASE: Record<string, number> = { down: 6, up: 8, right: 10, left: 10 };
const FLAG_H = 44;
/** The look without painted art (`?pixel=1`): each art key's older stand-in (watchman and monster sheets). */
const LEGACY = WAR_LEGACY;

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

interface Pt { x: number; y: number }
/** One siege fighter's fixed layout: its slot seed, line spot, the spot it duels at, where its reinforcements start. */
interface Fight { seed: number; slot: number; pos: Pt; mate: Pt; from: Pt; h: number; tilt: number }
/** A Hold guard's post and facing (away from the Hold, or toward it for the odd one chatting). */
interface Guard { pos: Pt; fx: number; fy: number; h: number }

interface Soldier {
  spr: Phaser.GameObjects.Sprite;
  char: boolean; kind: string; weapon: string;
  /** Painted war sheet art key (war_warden...), set while its texture is not applied yet or in use. */
  art?: string; artOn?: boolean; fallF?: number; flip?: boolean;
  face: string; key: string; frame: number; x: number; y: number; ang: number;
  flag?: Phaser.GameObjects.Image;
  mode: "march" | "guard" | "fight";
  rank: number; side: number; // march: rank from the front, -1 / +1 file
  guard?: Guard; fight?: Fight;
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
  /** The land whose siege the server fights with real troopers (-1 none): no painted battle there. */
  private liveSiege = -1;

  constructor(private scene: Phaser.Scene) {}

  /** The war snapshot: owners and sieges decide who walks where. Squads that no longer match fade out at the next check. */
  setWar(v: WarView) { this.view = v; this.dirty = true; }

  /** The server's live siege battle ("siege" message): its land gets no painted battle lines. */
  setSiege(t: number) { if (t !== this.liveSiege) { this.liveSiege = t; this.dirty = true; } }

  /** Sprites alive now (for the perf check). */
  get sprites(): number { let n = 0; for (const s of this.squads.values()) n += s.men.length; for (const s of this.dying) n += s.men.length; return n; }

  /** What a land's squad looks like now: holder, the attacker while a siege is called, and the strength by control. */
  private sigOf(t: number): string {
    const v = this.view!, c = v.control?.[t] ?? 100, tier = viewTier(v, t), n = STANDARDS.filter((s) => s.t === t).length;
    const sg = v.sieges.find((s) => s[0] === t);
    return `${v.owner[t]}|${sg ? sg[1] : ""}|${sg && this.liveSiege === t ? "live" : ""}|${patrolCount(c)}|${tier}|${holdGuards(t, c, tier)}|${siegeCounts(n, c).def}`;
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
      // kept out to twice the range: a long leg's middle is far from both stops
      if (!k || !this.near(t, me, r2 * 4)) { this.destroy(s); this.squads.delete(t); continue; }
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

  private soldier(clan: ClanKey, i: number, mode: Soldier["mode"], officer = false): Soldier {
    const art = officer ? TROOP_LOOK[clan].officer : TROOP_LOOK[clan].kinds[i % TROOP_LOOK[clan].kinds.length];
    const name = SMOOTH ? art : LEGACY[art] ?? art;
    const char = name === SHEET, [kind, weapon] = split(name);
    if (SMOOTH) {
      const spr = this.scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setAlpha(0);
      warSoldierTexture(this.scene, art);
      return { spr, char: false, kind: art, weapon: "", art, face: "down", key: "", frame: -1, x: 0, y: 0, ang: 0, mode, rank: 0, side: 0 };
    }
    const spr = char
      ? this.scene.add.sprite(0, 0, "__DEFAULT").setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE)
      : this.scene.add.sprite(0, 0, mobTexture(this.scene, kind, 1, weapon), 0).setOrigin(0.5, MOB_LOOK[kind]?.oy ?? 0.85).setScale(MOB_LOOK[kind]?.scale ?? 1);
    spr.setVisible(false).setAlpha(0);
    return { spr, char, kind, weapon, face: "down", key: "", frame: -1, x: 0, y: 0, ang: 0, mode, rank: 0, side: 0 };
  }

  /** Walkable version of a wanted point: pulled toward `home` until it is, else `home` itself. */
  private ground(p: Pt, home: Pt): Pt {
    for (const f of [1, 0.7, 0.4]) { const x = home.x + (p.x - home.x) * f, y = home.y + (p.y - home.y) * f; if (!isSolidAt(x, y)) return { x, y }; }
    return home;
  }

  /** The unit world vector from land `t` toward the nearest land `atk` holds (the battle's attacker side), else a screen-horizontal one. */
  private attackAxis(t: number, atk: number): Pt {
    return attackAxis(this.view!.owner, t, atk) ?? (ISO ? { x: -Math.SQRT1_2, y: Math.SQRT1_2 } : { x: -1, y: 0 }); // attackers on the left of the screen
  }

  private build(t: number): Squad | undefined {
    const v = this.view!, clan = CLAN_KEYS[v.owner[t]], p = patrolOf(t), c = v.control?.[t] ?? 100, tier = viewTier(v, t);
    if (!clan || !p) return undefined;
    const sg = v.sieges.find((s) => s[0] === t), atk = sg ? CLAN_KEYS[sg[1]] : undefined;
    const sq: Squad = { t, sig: this.sigOf(t), men: [], cycle: 0, phase: 0, alpha: 0, target: 1 };
    if (atk && this.liveSiege === t) return sq; // the server's real siege troopers fight here (server/warSieges.ts)
    if (atk) { this.buildSiege(sq, t, clan, atk, sg![1], c); return sq; }
    // the server fields real troops (server/warTroops.ts) on every land this close to a hero: no painted column or guards over them
    if (WAR_TROOPS.live) return sq;
    sq.patrol = p;
    sq.arcs = [];
    let acc = 0;
    const arcAt = p.pts.map((a, i) => { const at = acc, b = p.pts[(i + 1) % p.pts.length]; acc += Math.hypot(b.x - a.x, b.y - a.y); return at; });
    for (const i of p.stops) sq.arcs.push(arcAt[i]);
    sq.arcs.sort((a, b) => a - b);
    sq.cycle = p.len + sq.arcs.length * this.pauseD();
    sq.phase = (t * 977) % sq.cycle;
    const n = patrolCount(c);
    for (let i = 0; i < n; i++) {
      const m = this.soldier(clan, i, "march", i === 0); // the officer leads with the pennant
      m.rank = i >> 1; m.side = i & 1 ? 1 : -1;
      sq.men.push(m);
    }
    sq.men[0].flag = this.scene.add.image(0, 0, flagTexture(this.scene, clan)).setOrigin(0.5, 1).setVisible(false).setAlpha(0);
    garrisonSpots(t, holdGuards(t, c, tier), tier).forEach((g, i) => {
      const m = this.soldier(clan, i + 1, "guard", i === 0);
      const inward = i % 3 === 2;
      m.guard = { pos: { x: g.x, y: g.y }, fx: inward ? -g.fx : g.fx, fy: inward ? -g.fy : g.fy, h: mix(t, i, 7) };
      sq.men.push(m);
    });
    return sq;
  }

  /** A battle at each standard: attackers (side +1 of the axis) against defenders, as two loose lines. */
  private buildSiege(sq: Squad, t: number, clan: ClanKey, atk: ClanKey, atkIdx: number, control: number) {
    const F = SIEGE_FIGHT, std = STANDARDS.filter((s) => s.t === t), hold = HOLDS.find((h) => h.t === t);
    const ax = this.attackAxis(t, atkIdx), px = -ax.y, py = ax.x, cnt = siegeCounts(std.length, control);
    std.forEach((s, si) => {
      const seed = t * 31 + si;
      const lines = [cnt.atk, cnt.def].map((n, sideIdx) => {
        const sd = sideIdx === 0 ? 1 : -1;
        return Array.from({ length: n }, (_, i) => {
          const h = mix(seed, i, sideIdx), lat = (i - (n - 1) / 2) * F.spacing + ((h % 9) - 4);
          const dep = sd * (F.lineGap / 2 + (i & 1 ? 5 : 0)) + (((h >> 8) % 7) - 3);
          return this.ground({ x: s.x + ax.x * dep + px * lat, y: s.y + ax.y * dep + py * lat }, s);
        });
      });
      [atk, clan].forEach((k, sideIdx) => {
        const sd = sideIdx === 0 ? 1 : -1, mine = lines[sideIdx], other = lines[1 - sideIdx];
        mine.forEach((pos, i) => {
          const j = Math.max(0, Math.min(other.length - 1, Math.round(i / Math.max(1, mine.length - 1) * (other.length - 1))));
          let dx = sd * ax.x, dy = sd * ax.y; // reinforcements: attackers from their side, defenders from the Hold when it is near enough
          if (sideIdx === 1 && hold) { const hx = hold.x - pos.x, hy = hold.y - pos.y, hl = Math.hypot(hx, hy); if (hl > 60) { dx = hx / hl; dy = hy / hl; } }
          const from = this.ground({ x: pos.x + dx * F.walkFrom, y: pos.y + dy * F.walkFrom }, { x: pos.x + dx * 30, y: pos.y + dy * 30 });
          const h = mix(seed, i, 40 + sideIdx), m = this.soldier(k, i, "fight", i === 0);
          m.fight = { seed: seed * 2 + sideIdx, slot: i, pos, mate: other[j], from, h, tilt: h & 1 ? 1 : -1 };
          sq.men.push(m);
        });
      });
    });
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
    const lead = s.patrol ? this.lead(s, wall) : undefined;
    for (let i = 0; i < s.men.length; i++) {
      const m = s.men[i];
      if (m.char && !sheetReady) { // the watchman sheet is on its way: hide the Wardens' soldiers until it is here
        if (!this.sheetAsked) { this.sheetAsked = true; if (ensureCharSheet(this.scene, SHEET, undefined, 300)) this.sheetAsked = false; }
        m.spr.setVisible(false); m.flag?.setVisible(false);
        continue;
      }
      if (m.art && !m.artOn) { // painted sheet: fetched on first sight, hidden until it is here
        const tex = warSoldierTexture(this.scene, m.art);
        if (!tex) { m.spr.setVisible(false); m.flag?.setVisible(false); continue; }
        const look = MOB_LOOK[m.art];
        m.spr.setTexture(tex, 0).setOrigin(0.5, look?.oy ?? 0.9375); m.artOn = true; m.frame = 0;
      }
      if (m.char && m.frame < 0) { m.spr.setTexture(SHEET, 0); m.frame = 0; }
      let x = m.x, y = m.y, face = m.face, alpha = s.alpha, ang = 0, lift = 0;
      let anim: "walk" | "idle" | "attack" = "idle", strike = false, fallF = -1;
      if (m.mode === "march" && lead) {
        const q = patrolPos(s.patrol!, lead.d - m.rank * TROOP.rankGap); // ranks wait behind the stop, then follow the leader
        x = q.x; y = q.y;
        if (m.side) { // two abreast: sideways by the path normal, unless that lands in a wall
          const ox = q.x - q.dy * m.side * TROOP.lateral, oy = q.y + q.dx * m.side * TROOP.lateral;
          if (!isSolidAt(ox, oy)) { x = ox; y = oy; }
        }
        face = this.facing(m, q.dx, q.dy);
        anim = lead.paused ? "idle" : "walk";
      } else if (m.mode === "guard") {
        const g = m.guard!, cyc = (wall + g.h % 9000) % 9000;
        x = g.pos.x; y = g.pos.y;
        strike = cyc < 700; // now and then a guard drills a swing
        anim = strike ? "attack" : "idle";
        face = this.facing(m, g.fx, g.fy);
      } else if (m.mode === "fight") {
        const f = m.fight!, life = siegeLife(f.seed, f.slot, wall);
        if (life.s === "gone") { m.spr.setVisible(false); continue; }
        const dx = f.mate.x - f.pos.x, dy = f.mate.y - f.pos.y, dl = Math.hypot(dx, dy) || 1;
        if (life.s === "walk") {
          x = f.from.x + (f.pos.x - f.from.x) * life.u; y = f.from.y + (f.pos.y - f.from.y) * life.u;
          face = this.facing(m, f.pos.x - f.from.x, f.pos.y - f.from.y); anim = "walk";
          alpha *= Math.min(1, life.u * 5);
        } else if (life.s === "fight") {
          const per = 700 + (f.h % 500), cyc = (wall + f.h % 1000) % per;
          strike = cyc > per * 0.5;
          const reach = strike ? 2 + (f.h >> 4) % 4 : -(f.h >> 6) % 2; // lunge in, sometimes shuffle back
          x = f.pos.x + dx / dl * reach; y = f.pos.y + dy / dl * reach;
          face = this.facing(m, dx, dy); anim = "attack";
        } else {
          const F = SIEGE_FIGHT, k = Math.min(1, life.t / F.fallMs);
          x = f.pos.x; y = f.pos.y + (life.t > F.fallMs ? 2 : 0);
          if (m.art) { fallF = life.t < F.fallMs * 0.55 ? 12 : 13; m.flip = f.tilt < 0; } else ang = 90 * k * f.tilt; // painted soldiers have their own fall frames
          face = this.facing(m, dx, dy);
          lift = 0;
          alpha *= life.t > F.fallMs + F.lieMs ? Math.max(0, 1 - (life.t - F.fallMs - F.lieMs) / F.fadeMs) : 1;
        }
      }
      m.spr.setVisible(true).setAlpha(alpha);
      if (x !== m.x || y !== m.y) { m.x = x; m.y = y; m.spr.setPosition(x, y + lift); setBaseDepth(m.spr, y); }
      if (ang !== m.ang) { m.ang = ang; m.spr.setAngle(ang); }
      if (m.char) {
        const key = `${anim}|${face}`;
        if (key !== m.key || !m.spr.anims.isPlaying) { m.key = key; playCharAnim(m.spr, SHEET as any, anim === "attack" ? (strike ? "attack3" : "attack") : anim, face); }
      } else {
        const win = m.spr.texture.frameTotal > 12;
        const f = fallF >= 0 ? fallF : anim === "attack" && win ? ATTACK_BASE[face] + (strike ? 1 : 0)
          : FRAME_BASE[face] + (anim === "walk" ? Math.floor(wall / 220 + i) % 2 : 0);
        if (f !== m.frame) { m.frame = f; m.spr.setFrame(f); }
        m.spr.setFlipX(fallF >= 0 ? !!m.flip : face === "left");
      }
      if (m.flag) {
        const f = m.flag;
        f.setVisible(true).setAlpha(alpha).setPosition(x + (ISO ? 7 : 9), y + (ISO ? -7 : 0));
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
