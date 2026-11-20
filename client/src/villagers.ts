import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../../shared/map";
import { isDecorSolidAt, NPCS } from "../../shared/npcs";
import { CHAR_ORIGIN, CHAR_SCALE, CharacterName, ensureCharSheet, playCharAnim, SHEET_RANGE } from "./artAssets";
import { faceOf } from "./watch";
import { isoAnchor, ISO, screenDir, setBaseDepth } from "./iso";
import { SMOOTH } from "./isoflag";
import { MOB_LOOK, warSoldierTexture } from "./textures";
import { routeAt, routeLength, type CityPerson } from "./cityFolk";
import { speechBubble } from "./weathered";
import { WRATH } from "../../shared/wrath";
import { FolkSpot, pickKind } from "./saltmereFolk";


/**
 * Townsfolk of Oakvale (Murat 2026-11-03): they idle, stroll about the market square and stop to chat with each other.
 * No dialogue and nothing synced: each client runs its own, it's only life in the background.
 */
const OAKVALE_FOLK: CharacterName[] = ["peasant", "farmwife", "labourer", "elder", "goodwife", "villager", "peasant", "farmwife", "labourer"];
/** Where they wander: the square and a ring of street around it (tiles). */
const AREA = { x0: SAFE_ZONE.x - 1.5, y0: SAFE_ZONE.y - 1.5, x1: SAFE_ZONE.x + SAFE_ZONE.w + 1.5, y1: SAFE_ZONE.y + SAFE_ZONE.h + 1.5 };
const KEEP_CLEAR = 0.9 * TILE; // stay off the traders' and the druid's spot

type Mode = "idle" | "walk" | "chat" | "sit" | "mob" | "home" | "in" | "fade";
/** A painted soldier sheet's frames: facing base, and the two swing frames (warTroops.ts). */
const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
const ATTACK_BASE: Record<string, number> = { down: 6, up: 8, right: 10, left: 10 };
const PATROL_SPEED = 22;
interface Folk {
  name: CharacterName; sprite: Phaser.GameObjects.Sprite; ready: boolean; // hidden and still until the sheet has loaded
  x: number; y: number; tx: number; ty: number; speed: number;
  mode: Mode; until: number; face: string; anim: string; nextFlavour: number; backAt: number;
  asked?: boolean; spot?: FolkSpot; homing?: boolean;
  /** A city person (cityFolk.ts): their post or route, and where they are on it (px along it, going 1 / -1). */
  p?: CityPerson; art?: string; route?: { pts: [number, number][]; len: number }; rd?: number; dir?: 1 | -1; pauseUntil?: number; homeAt?: number; frame?: number; aAnim?: string; swingAt?: number; alpha?: number; nextBlow?: number; nextShout?: number; bubble?: Phaser.GameObjects.Image; stuck?: number;
}

/** One village's townsfolk: where they roam, who they are and what they do (Oakvale's is the default). */
export interface VillagerConfig {
  /** Stroll bounds in tiles. */
  area: { x0: number; y0: number; x1: number; y1: number };
  folk: CharacterName[];
  /** Oakvale's "no magic" mob reaction (shared/wrath.ts) applies. */
  wrath: boolean;
  /** Activity spots (Saltmere); without them folk only stroll, sit and chat like Oakvale's. */
  spots?: FolkSpot[];
  /** Places folk keep off while idle or strolling (stash, building footprints, door steps). */
  keepOff?: (px: number, py: number) => boolean;
  /** 0..1 darkness now: with spots, folk go in at dusk and come out at dawn. */
  dark?: () => number;
  /** Idle unless the hero is within r px of (x, y). */
  active?: { x: number; y: number; r: number };
  /** A capital's people (cityFolk.ts): they follow their own post or route instead of strolling; `folk` is ignored. */
  people?: CityPerson[];
  /** The clan's painted soldier sprite (shared/war/patrols.ts TROOP_LOOK): soldiers wear it, else the guard sheet. */
  soldierArt?: string;
  /** What the town crier calls out (shared/war/cityText.ts crier); none: he stays silent. */
  crier?: readonly string[];
}
export const OAKVALE: VillagerConfig = { area: AREA, folk: OAKVALE_FOLK, wrath: true };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Villagers {
  private folk: Folk[] = [];
  private AREA: VillagerConfig["area"];

  private free = (x: number, y: number, ignoreKeep = false) => {
    for (const [ox, oy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) if (isSolidAt(x + ox, y + oy) || isDecorSolidAt(x + ox, y + oy)) return false;
    if (!ignoreKeep && this.cfg.keepOff?.(x, y)) return false;
    return !NPCS.some((n) => Math.hypot(n.x - x, n.y - y) < KEEP_CLEAR);
  };
  /** Straight walk from a to b without touching anything solid. */
  private clearLine = (ax: number, ay: number, bx: number, by: number, ignoreKeep = false) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5);
    for (let i = 1; i <= n; i++) if (!this.free(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, ignoreKeep)) return false;
    return true;
  };

  constructor(private scene: Phaser.Scene, private cfg: VillagerConfig = OAKVALE) {
    this.AREA = cfg.area;
    for (const p of cfg.people ?? []) {
      const art = p.soldier && SMOOTH && cfg.soldierArt ? cfg.soldierArt : undefined;
      const sprite = scene.add.sprite(p.x, p.y, "__DEFAULT").setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(p.y).setVisible(false);
      const f: Folk = { name: p.sheet, sprite, ready: false, x: p.x, y: p.y, tx: p.x, ty: p.y, speed: p.job === "patrol" ? PATROL_SPEED : rand(17, 25) * (p.sheet === "elder" ? 0.7 : 1), mode: "idle", until: scene.time.now + rand(0, 4000), face: p.face, anim: "", nextFlavour: scene.time.now + rand(1000, 5000), backAt: 0, p, art };
      if (p.route) { const len = routeLength(p.route, p.loop); f.route = { pts: p.route, len }; f.dir = 1; f.rd = p.loop ? ((len - (p.lag ?? 0)) % len + len) % len : 0; f.pauseUntil = p.loop ? 0 : scene.time.now + rand(0, 6000); }
      if (p.job === "crier") f.nextShout = scene.time.now + rand(3000, 12000);
      this.folk.push(f);
    }
    for (const name of cfg.people ? [] : cfg.folk) {
      const p = this.randomSpot();
      if (!p) continue;
      const sprite = scene.add.sprite(p.x, p.y, "__DEFAULT").setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(p.y).setVisible(false);
      const f: Folk = { name, sprite, ready: false, x: p.x, y: p.y, tx: p.x, ty: p.y, speed: rand(17, 25) * (name === "elder" ? 0.7 : 1), mode: "idle", until: scene.time.now + rand(0, 4000), face: faceOf(rand(-1, 1), rand(-1, 1)), anim: "", nextFlavour: 0, backAt: 0 };
      this.folk.push(f);
    }
  }

  private loadAt = 0;
  /** Townsfolk sheets load once the hero is near the square (nearest NPCs go first), one at a time; each person appears as theirs arrives. */
  private loadSheets(me?: { x: number; y: number }) {
    const t = performance.now();
    if (!me || t - this.loadAt < 300) return;
    this.loadAt = t;
    const cx = (this.AREA.x0 + this.AREA.x1) / 2 * TILE, cy = (this.AREA.y0 + this.AREA.y1) / 2 * TILE;
    const reach = this.cfg.people && this.cfg.active ? this.cfg.active.r + 100 : SHEET_RANGE + 350;
    if (Math.hypot((this.cfg.people && this.cfg.active ? this.cfg.active.x : cx) - me.x, (this.cfg.people && this.cfg.active ? this.cfg.active.y : cy) - me.y) > reach) return; // measured from the square's centre: its people stand up to about 340 px from there
    for (const f of this.folk) {
      if (f.ready) continue;
      if (f.art) { // a clan soldier's painted sheet, fetched on first sight (hidden until it is here)
        const tex = warSoldierTexture(this.scene, f.art);
        if (tex) { f.sprite.setTexture(tex, 0).setScale(1).setOrigin(0.5, MOB_LOOK[f.art]?.oy ?? 0.9375).setVisible(true); f.ready = true; f.frame = -1; }
        continue;
      }
      if (f.asked) continue;
      f.asked = true;
      const show = () => { for (const o of this.folk) if (o.name === f.name && !o.ready && !o.art) { o.ready = true; o.sprite.setTexture(o.name, 0).setVisible(true); this.play(o, "idle", true); if (!o.p && this.cfg.spots && this.night()) { o.mode = "in"; o.until = 0; o.sprite.setVisible(false); } } };
      if (ensureCharSheet(this.scene, f.name, show, 400)) show();
    }
  }

  private randomSpot(): { x: number; y: number } | undefined {
    for (let i = 0; i < 60; i++) {
      const x = rand(this.AREA.x0, this.AREA.x1) * TILE, y = rand(this.AREA.y0, this.AREA.y1) * TILE;
      if (this.free(x, y)) return { x, y };
    }
    return undefined;
  }

  private play(f: Folk, anim: string, force = false) {
    if (f.art) { f.aAnim = anim; return; } // painted soldiers step frames (artFrame)
    const key = `${anim}|${f.face}`;
    if (!force && f.anim === key) return;
    f.anim = key;
    playCharAnim(f.sprite, f.name, anim, f.face);
  }

  /** Pick what to do next: usually a short stroll, sometimes a sit-down or a chat with someone close by. */
  private next(f: Folk, now: number) {
    if (this.cfg.spots && this.nextSpot(f, now)) return;
    const mate = this.folk.find((o) => o !== f && o.ready && o.mode !== "walk" && o.mode !== "sit" && Math.hypot(o.x - f.x, o.y - f.y) < 1.8 * TILE);
    const r = Math.random();
    if (mate && r < 0.5) {
      // turn to each other and talk a while
      for (const [a, b] of [[f, mate], [mate, f]]) {
        a.mode = "chat"; a.until = now + rand(5000, 9000); a.face = faceOf(b.x - a.x, b.y - a.y, a.face); a.nextFlavour = now + rand(600, 2000);
        this.play(a, "idle");
      }
      return;
    }
    if (r < 0.62 && f.name !== "labourer") { f.mode = "sit"; f.until = now + rand(6000, 12000); this.play(f, "sit"); return; }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(1.5, 5) * TILE;
      const tx = f.x + Math.cos(a) * d, ty = f.y + Math.sin(a) * d;
      if (tx < this.AREA.x0 * TILE || tx > this.AREA.x1 * TILE || ty < this.AREA.y0 * TILE || ty > this.AREA.y1 * TILE) continue;
      if (!this.clearLine(f.x, f.y, tx, ty)) continue;
      f.mode = "walk"; f.tx = tx; f.ty = ty; f.until = now + 20000;
      return;
    }
    f.mode = "idle"; f.until = now + rand(1500, 4000);
  }

  private night() { return !!this.cfg.dark && this.cfg.dark() >= 0.5; }

  /** The door spot nearest to a folk. */
  private nearestDoor(f: Folk): FolkSpot | undefined {
    let best: FolkSpot | undefined, bd = Infinity;
    for (const s of this.cfg.spots!) { if (s.kind !== "door") continue; const d = Math.hypot(s.x - f.x, s.y - f.y); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  /** Walk towards (tx, ty): in a straight line when it is clear, else a short leg that gets closer. False when boxed in. */
  private headTo(f: Folk, tx: number, ty: number, now: number, ignoreKeep: boolean): "direct" | "leg" | false {
    if (this.clearLine(f.x, f.y, tx, ty, ignoreKeep)) { f.mode = "walk"; f.tx = tx; f.ty = ty; f.until = now + 25000; return "direct"; }
    const base = Math.atan2(ty - f.y, tx - f.x);
    let best: { x: number; y: number } | undefined, bd = Math.hypot(tx - f.x, ty - f.y) - 8;
    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) for (const len of [4, 2.5]) {
      const x = f.x + Math.cos(base + turn) * len * TILE, y = f.y + Math.sin(base + turn) * len * TILE;
      const d = Math.hypot(tx - x, ty - y);
      if (d < bd && this.clearLine(f.x, f.y, x, y)) { best = { x, y }; bd = d; }
    }
    for (let i = 0; i < 14 && !best; i++) { // no leg gets closer (a pocket between buildings): any open way out will do
      const a = Math.random() * Math.PI * 2, len = rand(1.5, 4) * TILE;
      const x = f.x + Math.cos(a) * len, y = f.y + Math.sin(a) * len;
      if (this.clearLine(f.x, f.y, x, y)) best = { x, y };
    }
    if (!best) return false;
    f.mode = "walk"; f.tx = best.x; f.ty = best.y; f.until = now + 12000;
    return "leg";
  }

  /** Go in through a door: gone from view until its time is up (the whole night, or a short visit by day). */
  private enter(f: Folk, now: number) {
    f.mode = "in"; f.spot = undefined; f.until = this.night() ? 0 : now + rand(8000, 20000);
    f.sprite.setVisible(false); f.bubble?.destroy(); f.bubble = undefined;
  }

  /** Come out of the door onto the step and walk off it. */
  private leave(f: Folk, now: number) {
    const d = this.nearestDoor(f);
    if (d) { f.x = d.x; f.y = d.y; }
    f.sprite.setPosition(f.x, f.y).setDepth(f.y).setVisible(true);
    f.mode = "idle"; f.until = now + 200; f.face = "down";
    for (const [dx, dy] of [[0, 1.6], [1.6, 1], [-1.6, 1], [0, 2.4]]) {
      const x = f.x + dx * TILE, y = f.y + dy * TILE;
      if (this.free(x, y) && this.clearLine(f.x, f.y, x, y, true)) { f.mode = "walk"; f.tx = x; f.ty = y; f.until = now + 6000; break; }
    }
    this.play(f, "idle", true);
  }

  /** Saltmere's day: net-mending, the pier heads, the fire, the square, the doors, and home at dusk. True when it chose. */
  private nextSpot(f: Folk, now: number): boolean {
    const spots = this.cfg.spots!;
    if (this.night()) {
      const d = this.nearestDoor(f);
      if (!d) return false;
      if (Math.hypot(d.x - f.x, d.y - f.y) < 0.6 * TILE) { this.enter(f, now); return true; }
      const r = this.headTo(f, d.x, d.y, now, true);
      if (r === "direct") f.spot = d;
      else if (!r) { f.mode = "idle"; f.until = now + 800; } // boxed in: wait, then try again
      return true;
    }
    const kind = pickKind(Math.random());
    if (kind === "stroll" || Math.random() < 0.2) return false; // the usual stroll, sit and chat
    const list = spots.filter((s) => s.kind === kind);
    for (let i = 0; i < 3 && list.length; i++) {
      const s = list[Math.floor(Math.random() * list.length)];
      if (this.folk.some((g) => g !== f && g.spot === s)) continue; // taken
      if (this.headTo(f, s.x, s.y, now, kind === "door") === "direct") { f.spot = s; return true; }
    }
    return false;
  }

  /** Arrived at a spot: do what it is for. */
  private arrive(f: Folk, now: number) {
    const s = f.spot!;
    if (s.kind === "door") { this.enter(f, now); return; }
    if (this.night()) { f.spot = undefined; f.mode = "idle"; f.until = now; return; } // dusk fell on the way: head home instead
    if (s.look) f.face = faceOf(s.look[0], s.look[1], f.face);
    if (s.kind === "net" || s.kind === "fire") { f.mode = "sit"; f.until = now + rand(9000, 18000); this.play(f, "sit", true); }
    else { f.mode = "idle"; f.until = now + rand(7000, 14000); f.nextFlavour = now + rand(2500, 6000); this.play(f, "idle", true); }
  }

  /** Step towards (tx, ty), sliding along walls. Returns false when nothing moved. */
  private stepTo(f: Folk, tx: number, ty: number, speed: number, dt: number, stop: number): boolean {
    const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
    if (d <= stop) return false;
    const s = Math.min(d - stop, speed * dt), nx = f.x + dx / d * s, ny = f.y + dy / d * s;
    const ox = f.x, oy = f.y;
    if (this.free(nx, f.y)) f.x = nx;
    if (this.free(f.x, ny)) f.y = ny;
    f.face = faceOf(dx, dy, f.face);
    f.sprite.setPosition(f.x, f.y).setDepth(f.y);
    return Math.hypot(f.x - ox, f.y - oy) > s * 0.2;
  }

  /** A shout over a villager's head (pixel font), gone after a couple of seconds. */
  private shout(f: Folk, text: string, ms = 2200) {
    f.bubble?.destroy();
    const b = speechBubble(this.scene, f.x, f.y - 30, text, "shout");
    isoAnchor(b, f);
    f.bubble = b;
    this.scene.time.delayedCall(ms, () => { if (f.bubble === b) { b.destroy(); f.bubble = undefined; } });
  }

  /** The villager closest to (x, y) shouts this (a hero just cast a spell in the village). */
  shoutNear(x: number, y: number, text: string) {
    let best: Folk | undefined, bd = Infinity;
    for (const f of this.folk) { if (!f.ready) continue; const d = Math.hypot(f.x - x, f.y - y); if (d < bd) { bd = d; best = f; } }
    if (best) { this.shout(best, text); best.nextShout = this.scene.time.now + 2500; }
  }

  /**
   * An outlaw hero is in the village (shared/wrath.ts): every villager runs at the nearest one and lays into them
   * (the server deals the damage). With no outlaw left they walk back to the square.
   */
  private mob(f: Folk, foes: { x: number; y: number }[], now: number, dt: number) {
    let foe = foes[0], bd = Infinity;
    for (const o of foes) { const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; foe = o; } }
    if (f.mode !== "mob") { f.mode = "mob"; f.nextBlow = now + rand(200, 900); f.nextShout = now + rand(0, 2500); f.backAt = 0; }
    if (f.bubble) f.bubble.setPosition(f.x, f.y - 30);
    if (now >= (f.nextShout ?? 0)) {
      f.nextShout = now + rand(3500, 8000);
      if (Math.random() < 0.55) this.shout(f, WRATH.shouts[Math.floor(Math.random() * WRATH.shouts.length)]);
    }
    if (this.stepTo(f, foe.x, foe.y, f.speed * 2.6, dt, 14)) { if (now >= (f.backAt ?? 0)) this.play(f, "run"); return; }
    f.face = faceOf(foe.x - f.x, foe.y - f.y, f.face);
    if (bd <= 22 && now >= (f.nextBlow ?? 0)) {
      f.nextBlow = now + rand(700, 1200);
      this.play(f, Math.random() < 0.5 ? "attack" : "attack2", true);
      f.backAt = now + 450;
    } else if (now >= (f.backAt ?? 0)) this.play(f, bd <= 22 ? "idle" : "cheer");
  }

  /** A painted soldier's frame for what it is doing now (idle, walk steps, the two swing frames), set only when it changes. */
  private artFrame(f: Folk, now: number) {
    const win = f.sprite.texture.frameTotal > 12, a = f.aAnim ?? "idle";
    const fr = a === "attack" && win ? ATTACK_BASE[f.face] + (Math.floor(now / 350) % 2) : FRAME_BASE[f.face] + (a === "walk" ? Math.floor(now / 220) % 2 : 0);
    if (fr !== f.frame) { f.frame = fr; f.sprite.setFrame(fr); }
    f.sprite.setFlipX(f.face === "left");
  }

  /** Faces a vector: four ways for painted soldiers (their sheets have no diagonals), else the sheets' own (8 in the iso view). */
  private faceFor(f: Folk, dx: number, dy: number) {
    if (f.art) return ISO ? screenDir(dx, dy, f.face) : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    return faceOf(dx, dy, f.face);
  }

  private put(f: Folk) { f.sprite.setPosition(f.x, f.y); setBaseDepth(f.sprite, f.y); }

  /** Town people go in at dusk (soldiers stay); in a city a person follows a post or a route (cityFolk.ts) instead of strolling. */
  private cityTick(f: Folk, now: number, dt: number) {
    const p = f.p!, night = this.night(), folk = !p.soldier;
    if (folk) { if (!night) f.homing = false; else if (!f.homing) { f.homing = true; f.homeAt = now + rand(0, 9000); } }
    const home = !!f.homing && now >= (f.homeAt ?? 0);
    if (f.mode === "in") { // indoors: out again at dawn, one by one (or after a short visit by day)
      if (night) f.until = 0;
      else if (f.until === 0) f.until = now + rand(0, 25000);
      else if (now >= f.until) {
        f.mode = "idle"; f.until = now; f.alpha = 1; f.sprite.setAlpha(1).setVisible(true);
        if (f.route) { f.rd = 0; f.dir = 1; f.pauseUntil = now + 800; const q = routeAt(f.route.pts, 0, p.loop); f.x = q.x; f.y = q.y; } else { f.x = p.x; f.y = p.y; }
        this.put(f); this.play(f, "idle", true);
      }
      return;
    }
    if (f.mode === "fade") { // the stall closes, the well-goer heads off: gone with a short fade
      f.alpha = (f.alpha ?? 1) - dt * 1.6; f.sprite.setAlpha(Math.max(0, f.alpha));
      if (f.alpha <= 0) { f.mode = "in"; f.until = 0; f.sprite.setVisible(false); f.bubble?.destroy(); f.bubble = undefined; }
      return;
    }
    if (f.bubble) f.bubble.setPosition(f.x, f.y - 30);
    let anim = "idle";
    const r = f.route;
    if (r) {
      const loop = !!p.loop;
      if (!loop && now < (f.pauseUntil ?? 0) && !home) anim = "idle";
      else {
        let d = f.dir ?? 1;
        if (home) d = -1;
        f.rd = (f.rd ?? 0) + d * f.speed * dt;
        if (loop) f.rd = ((f.rd % r.len) + r.len) % r.len;
        else if (home && f.rd <= 0) { // back at the start of the route: a house-goer through the door, everyone else fading out
          f.rd = 0;
          if (p.spot?.kind === "door") { f.mode = "in"; f.until = 0; f.sprite.setVisible(false); } else { f.mode = "fade"; f.alpha = 1; }
          return;
        } else if (f.rd >= r.len) { f.rd = r.len; f.dir = -1; f.pauseUntil = now + (p.job === "shopper" ? rand(5000, 11000) : rand(3000, 7000)); anim = "idle"; }
        else if (f.rd <= 0) {
          f.rd = 0; f.dir = 1;
          if (p.spot?.kind === "door" && Math.random() < 0.5) { f.mode = "in"; f.until = now + rand(8000, 20000); f.sprite.setVisible(false); return; } // a short visit indoors
          f.pauseUntil = now + (p.job === "shopper" ? rand(5000, 11000) : rand(3000, 7000)); anim = "idle";
        }
        if (anim !== "idle" || (now >= (f.pauseUntil ?? 0))) {
          const q = routeAt(r.pts, f.rd, loop);
          if (q.x !== f.x || q.y !== f.y) { f.face = this.faceFor(f, q.dx * d, q.dy * d); f.x = q.x; f.y = q.y; this.put(f); anim = "walk"; }
        }
      }
    } else {
      if (home && folk && !f.homeAt) f.homeAt = now;
      if (home && folk) { f.mode = "fade"; f.alpha = 1; return; }
      f.face = p.face;
      const h = (p.x * 7 + p.y * 13) % 9000;
      if (p.job === "recruit") anim = (now + h) % 3000 < 1400 ? "attack" : "idle";
      else if (p.soldier) anim = (now + h) % 9000 < 700 ? "attack" : "idle"; // now and then a guard drills a swing
      else if (p.job === "crier" && now >= (f.nextShout ?? 0)) {
        f.nextShout = now + rand(20000, 40000);
        const lines = this.cfg.crier;
        if (lines?.length) { this.shout(f, lines[Math.floor(Math.random() * lines.length)], 5200); f.backAt = now + 1800; this.play(f, "wave", true); f.nextFlavour = now + 6000; }
      }
    }
    if (f.art) { this.play(f, anim); this.artFrame(f, now); return; }
    // standing about: little gestures now and then
    if (anim === "idle" && !p.soldier) {
      if (now >= f.nextFlavour) {
        f.nextFlavour = now + rand(2500, 6000);
        const pick = Math.random() < 0.5 ? "idle2" : Math.random() < 0.5 ? "idle3" : p.job === "keeper" || p.job === "crier" ? "wave" : "idle2";
        this.play(f, pick, true); f.backAt = now + 1600;
        return;
      }
      if (f.backAt && now < f.backAt) return;
    }
    f.backAt = 0;
    this.play(f, anim);
  }

  update(dtMs: number, foes: { x: number; y: number }[] = [], me?: { x: number; y: number }) {
    const now = this.scene.time.now, dt = dtMs / 1000;
    this.loadSheets(me);
    const a = this.cfg.active;
    if (a && (!me || Math.hypot(me.x - a.x, me.y - a.y) > a.r)) return; // far from this village: idle
    for (const f of this.folk) {
      if (!f.ready) continue;
      if (f.p) { this.cityTick(f, now, dt); continue; }
      if (this.cfg.dark && f.mode !== "in") { // dusk: those sitting or standing about get up soon and go in
        if (!this.night()) f.homing = false;
        else if (!f.homing) { f.homing = true; if (f.mode !== "walk") f.until = Math.min(f.until, now + rand(500, 9000)); }
      }
      if (f.mode === "in") {
        if (this.night()) f.until = 0;
        else if (f.until === 0) f.until = now + rand(0, 25000); // dawn: they come out one by one
        else if (now >= f.until) this.leave(f, now);
        continue;
      }
      if (foes.length && this.cfg.wrath) { this.mob(f, foes, now, dt); continue; }
      if (f.bubble) f.bubble.setPosition(f.x, f.y - 30);
      if (f.mode === "mob") {
        // calm again: back to the square
        const p = this.randomSpot() ?? { x: f.x, y: f.y };
        f.mode = "home"; f.tx = p.x; f.ty = p.y; f.until = now + 15000; f.stuck = 0;
      }
      if (f.mode === "home") {
        if (this.stepTo(f, f.tx, f.ty, f.speed * 1.3, dt, 2)) { f.stuck = 0; this.play(f, "walk"); continue; }
        f.stuck = (f.stuck ?? 0) + dtMs;
        const there = Math.hypot(f.tx - f.x, f.ty - f.y) <= 3;
        if (there || f.stuck > 2500 || now > f.until) {
          if (!there) { // wedged behind a house: pick another spot to head for
            const p = this.randomSpot();
            if (p && now <= f.until) { f.tx = p.x; f.ty = p.y; f.stuck = 0; continue; }
            if (p) { f.x = p.x; f.y = p.y; f.sprite.setPosition(f.x, f.y).setDepth(f.y); }
          }
          f.mode = "idle"; f.until = now + rand(1000, 3000); this.play(f, "idle");
        }
        continue;
      }
      if (f.mode === "walk") {
        const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy);
        if (d < 1.5 && f.spot) { f.x = f.tx; f.y = f.ty; f.sprite.setPosition(f.x, f.y).setDepth(f.y); this.arrive(f, now); continue; }
        if (d < 1.5 || now > f.until) { f.spot = undefined; f.mode = "idle"; f.until = now + (this.cfg.spots && this.night() ? 200 : rand(2000, 6000)); f.nextFlavour = now + rand(800, 3000); this.play(f, "idle"); }
        else {
          const s = Math.min(d, f.speed * dt);
          f.x += dx / d * s; f.y += dy / d * s;
          f.face = faceOf(dx, dy, f.face);
          this.play(f, "walk");
        }
        f.sprite.setPosition(f.x, f.y).setDepth(f.y);
        continue;
      }
      if (now >= f.until) {
        if (f.mode === "sit" || f.mode === "chat") { f.spot = undefined; f.mode = "idle"; f.until = now + rand(800, 2500); this.play(f, "idle"); }
        else this.next(f, now);
        continue;
      }
      // Little gestures while standing: chatters laugh and wave, idlers shift their weight and look about
      if (f.mode !== "sit" && now >= f.nextFlavour) {
        f.nextFlavour = now + rand(2500, 6000);
        const pick = f.mode === "chat" ? (Math.random() < 0.5 ? "laugh" : Math.random() < 0.5 ? "wave" : "idle2") : Math.random() < 0.5 ? "idle2" : "idle3";
        this.play(f, pick, true);
        f.backAt = now + (pick === "laugh" || pick === "wave" ? rand(1200, 2000) : 1500);
      } else if (f.backAt && now >= f.backAt && f.mode !== "sit") { f.backAt = 0; this.play(f, "idle"); }
    }
  }
}
