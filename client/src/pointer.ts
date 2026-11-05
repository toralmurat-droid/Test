import Phaser from "phaser";
import { InputState, TILE } from "../../shared/constants";
import { blocked } from "../../shared/movement";
import { findPath, type Pt } from "./pathfind";
import { fromIso, isoX, isoY, ISO, isoAnchor } from "./iso";
import { ART_PX } from "./pixelgrid";
import { setWorldCursor } from "./cursors";

/**
 * Point-and-click controls.
 * Left click: ground = walk there (around walls and water), a villager / chest / shrine / portal = walk up and use it,
 * an enemy = walk into reach and use the basic attack. Right click: the active skill (picked with keys 1..0), aimed by
 * its target type: self skills go off on the hero, point skills land on the clicked spot (walking closer when it is too
 * far), direction skills go toward the click. On an enemy
 * after walking into its reach, else toward the clicked spot. Holding a button keeps walking toward the pointer or
 * keeps attacking. Any movement key takes over from the mouse.
 */

/** x/y: drawn feet (for picking); sx/sy: newest server feet (for reach and aim); body: extra melee reach on it. */
export interface ClickEnemy { id: string; x: number; y: number; sx: number; sy: number; vx?: number; vy?: number; h: number; body: number; dead: boolean; sprite?: Phaser.GameObjects.Sprite }
export interface ClickSpot { x: number; y: number; h: number; w: number; range: number; act: () => void }

export interface PointerHost {
  /** Our hero: predicted feet position and its server state, or nothing (not in the world yet / dead). */
  me(): { x: number; y: number; sx: number; sy: number; state: any } | undefined;
  enemies(): ClickEnemy[];
  enemy(id: string): ClickEnemy | undefined;
  spots(): ClickSpot[];
  speed(): number;
  /** Flight speed (px/s) of the shot the basic attack / right click fires, 0 for melee and skills. */
  shotSpeed(secondary: boolean): number;
  /** Reach (px, feet to feet) of the basic attack and of the secondary skill. */
  reach(secondary: boolean): number;
  /** Attack / use the secondary skill (the hero already faces the target). */
  fire(secondary: boolean): void;
  /** How the active (right-click) skill is aimed, and how far a "point" one can be placed. */
  target(): "self" | "point" | "dir";
  pointRange(): number;
  send(type: string, msg?: unknown): void;
  /** Tell the server the hero stands still right now (before turning and attacking). */
  stop(): void;
  /** Mouse is over the HUD or a menu, or the game is not ready: ignore. */
  blocked(): boolean;
}

type Goal =
  | { kind: "walk"; x: number; y: number }
  | { kind: "spot"; spot: ClickSpot }
  | { kind: "enemy"; id: string; secondary: boolean; fired: boolean; tries?: number; since?: number; waitAt?: number }
  | { kind: "cast"; x: number; y: number; self?: boolean }
  | { kind: "castAt"; x: number; y: number }
  | { kind: "stand"; since?: number };

const STOP: InputState = { up: false, down: false, left: false, right: false };

export class PointerControls {
  private goal?: Goal;
  private held = -1; // mouse button held down (0 left, 2 right)
  private path: Pt[] = [];
  private pathTo?: Pt;
  private lastRepath = 0;
  private lastAct = 0;
  private lastFollow = 0;
  private stuckAt = 0;
  private stuckPos?: Pt;
  private stuck = 0;
  private hovered?: string; // enemy under the mouse
  private rtt = 150; // ms, click to server swing and back (measured in swung)
  private firedAt = 0;

  /**
   * Where to aim at enemy `e`. Melee: its newest server position. Shots: where it will be when the shot gets
   * there, if it keeps walking (the server sees our click half a round trip later, its position we know is half a
   * round trip old, then the shot flies). Without this, arrows and fireballs flew behind walking monsters.
   */
  private aimAt(e: ClickEnemy, me: Pt, secondary: boolean): Pt {
    const speed = this.host.shotSpeed(secondary), vx = e.vx ?? 0, vy = e.vy ?? 0;
    if (!speed || (!vx && !vy)) return { x: e.sx, y: e.sy };
    let x = e.sx, y = e.sy;
    for (let i = 0; i < 3; i++) {
      const t = Math.min(0.9, this.rtt / 1000 + Math.hypot(x - me.x, y - me.y) / speed);
      x = e.sx + vx * t; y = e.sy + vy * t;
    }
    return { x, y };
  }
  /** One-texel silhouettes (left, right, up, down) behind the enemy that a click attacks (or would attack). */
  private outline: Phaser.GameObjects.Sprite[] = [];
  private outlined?: { sprite: Phaser.GameObjects.Sprite; chase: boolean };

  constructor(private scene: Phaser.Scene, private host: PointerHost) {
    scene.input.mouse?.disableContextMenu();
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => { if (p.button === this.held) this.held = -1; });
    scene.input.on("gameout", () => { this.held = -1; });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.hover(p));
    // After the scene's update: the monster's frame, flip and squash for this frame are set by then
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => this.syncOutline());
  }

  /** Stop whatever the mouse asked for (a movement key was pressed, the hero died...). */
  cancel() { this.goal = undefined; this.path = []; this.held = -1; }
  get active() { return !!this.goal; }

  /** The server swung our basic attack: a single click on an enemy is done. */
  swung() {
    // Round trip click -> server swing, smoothed: how far ahead to aim at a walking monster
    if (this.firedAt) { this.rtt = this.rtt * 0.7 + Math.min(600, this.scene.time.now - this.firedAt) * 0.3; this.firedAt = 0; }
    const g = this.goal;
    if (g?.kind === "stand" && this.held !== 0) this.goal = undefined;
    if (g?.kind === "enemy" && !g.secondary) { g.fired = true; if (this.held !== 0) { this.goal = undefined; this.path = []; } }
  }

  // ---- picking -------------------------------------------------------------------------------------------

  /** Pointer in camera space (iso screen when the iso view is on). */
  private screen(p: Phaser.Input.Pointer): Pt {
    const w = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }
  private world(p: Phaser.Input.Pointer): Pt {
    const s = this.screen(p);
    return ISO ? fromIso(s.x, s.y) : s;
  }
  private proj(x: number, y: number): Pt { return ISO ? { x: isoX(x, y), y: isoY(x, y) } : { x, y }; }

  /** Is the screen point inside an upright box standing on the feet at (x, y)? Returns how far from its middle. */
  private inBox(s: Pt, x: number, y: number, w: number, h: number): number | undefined {
    const f = this.proj(x, y);
    const dx = Math.abs(s.x - f.x), top = f.y - h;
    if (dx > w / 2 || s.y < top || s.y > f.y + 7) return undefined;
    return Math.hypot(dx, s.y - (f.y - h / 2));
  }

  private pick(p: Phaser.Input.Pointer): { enemy?: ClickEnemy; spot?: ClickSpot } {
    const s = this.screen(p);
    let enemy: ClickEnemy | undefined, ed = Infinity;
    for (const e of this.host.enemies()) {
      if (e.dead) continue;
      // A forgiving box: monsters move and small ones are hard to hit exactly
      const h = Math.max(18, e.h + 4);
      const d = this.inBox(s, e.x, e.y, Math.max(22, h * 0.9), h);
      if (d !== undefined && d < ed) { ed = d; enemy = e; }
    }
    if (enemy) return { enemy };
    // Just beside a (small, moving) monster still counts as clicking it
    const near = this.nearest(this.world(p), 12);
    if (near) return { enemy: near };
    let spot: ClickSpot | undefined, sd = Infinity;
    for (const o of this.host.spots()) {
      const d = this.inBox(s, o.x, o.y, o.w, o.h);
      if (d !== undefined && d < sd) { sd = d; spot = o; }
    }
    return { spot };
  }

  private hover(p: Phaser.Input.Pointer) {
    const canvas = this.scene.game.canvas;
    if (this.host.blocked()) { setWorldCursor(canvas, false); this.hovered = undefined; return; }
    const enemy = this.pick(p).enemy;
    this.hovered = enemy?.id;
    setWorldCursor(canvas, !!enemy);
  }

  /** A pixel outline around the enemy being attacked (red) or under the mouse (faint gold), so it's clear who gets hit. */
  drawRing() {
    const goal = this.goal;
    const chase = goal?.kind === "enemy" ? goal.id : undefined;
    const e = (chase && this.host.enemy(chase)) || (this.hovered ? this.host.enemy(this.hovered) : undefined);
    this.outlined = e && !e.dead && e.sprite ? { sprite: e.sprite, chase: !!chase } : undefined;
  }

  private static readonly OFFS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  /** Copies the outlined monster's look (frame, flip, scale, crop) into the tinted silhouettes, one art pixel out. */
  private syncOutline() {
    const t = this.outlined, s = t?.sprite;
    if (!t || !s || !s.active || !s.visible || s.alpha < 0.05) { for (const o of this.outline) o.setVisible(false); return; }
    if (!this.outline.length) {
      for (let i = 0; i < 4; i++) this.outline.push(this.scene.add.sprite(0, 0, s.texture.key).setVisible(false));
    }
    const color = t.chase ? 0xd2452e : 0xe8c46a, alpha = (t.chase ? 0.85 : 0.5) * s.alpha;
    const crop = (s as any)._crop;
    // One texel of the monster's own art (big monsters are scaled up), snapped to the screen's pixel grid
    const step = ART_PX * Math.max(1, Math.round(Math.abs(s.scaleX) / ART_PX));
    PointerControls.OFFS.forEach(([dx, dy], i) => {
      const o = this.outline[i];
      if (o.texture !== s.texture || o.frame !== s.frame) o.setTexture(s.texture.key, s.frame.name);
      o.setOrigin(s.originX, s.originY).setScale(s.scaleX, s.scaleY).setFlip(s.flipX, s.flipY).setRotation(s.rotation);
      if (s.isCropped && crop) o.setCrop(crop.x, crop.y, crop.width, crop.height); else if (o.isCropped) o.setCrop();
      o.setTintFill(color).setAlpha(alpha).setVisible(true);
      // Just under the monster; in the iso view it rides along with it, offset straight across the screen
      o.setPosition(s.x + dx * step, s.y + dy * step).setDepth(s.depth - 0.05);
      isoAnchor(o, s);
    });
  }

  /** The nearest live enemy within `r` px of a world point. */
  private nearest(w: Pt, r: number): ClickEnemy | undefined {
    let best: ClickEnemy | undefined, bd = r;
    for (const e of this.host.enemies()) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Space bar (Murat): exactly a right click at the mouse cursor; holding Space is holding the right button. */
  spaceDown() { this.down(this.scene.input.activePointer, 2); }
  spaceUp() { if (this.held === 2) this.held = -1; }

  private down(p: Phaser.Input.Pointer, forced?: number) {
    if (this.host.blocked() || !this.host.me()) return;
    const button = forced ?? p.button;
    if (button !== 0 && button !== 2) return;
    this.held = button;
    this.stuck = 0;
    this.firedAt = 0;
    const { enemy, spot } = this.pick(p);
    const target = button === 2 ? this.host.target() : "dir";
    if (button === 0 && forced === undefined && (p.event as MouseEvent | undefined)?.shiftKey) {
      // Shift + left click (Murat): the left-click attack right where you stand, toward the mouse, no walking.
      // Hold the button to keep attacking.
      this.goal = { kind: "stand" };
      this.path = [];
      this.lastAct = 0;
    } else if (button === 2 && target === "self") {
      // Buffs, auras, war cries: on the hero, wherever the click was
      this.goal = { kind: "cast", x: 0, y: 0, self: true };
      this.path = [];
      this.lastAct = 0;
    } else if (button === 2 && target === "point" && !enemy) {
      // Lands on the clicked spot: walk closer first when it is out of reach
      const w = this.world(p), me = this.host.me()!;
      if (Math.hypot(w.x - me.x, w.y - me.y) <= this.host.pointRange()) { this.goal = { kind: "cast", x: w.x, y: w.y }; this.path = []; this.lastAct = 0; }
      else { this.goal = { kind: "castAt", x: w.x, y: w.y }; this.route(w); }
      this.marker(w);
    } else if (enemy) {
      this.goal = { kind: "enemy", id: enemy.id, secondary: button === 2, fired: false };
      this.route({ x: enemy.sx, y: enemy.sy });
    } else if (button === 2) {
      // Secondary skill toward the clicked spot, without walking
      const w = this.world(p);
      this.goal = { kind: "cast", x: w.x, y: w.y };
      this.path = [];
      this.lastAct = 0;
    } else if (spot) {
      this.goal = { kind: "spot", spot };
      this.route({ x: spot.x, y: spot.y });
    } else {
      const w = this.world(p);
      this.goal = { kind: "walk", x: w.x, y: w.y };
      this.route(w);
      this.marker(w);
    }
  }

  private route(to: Pt) {
    const me = this.host.me();
    if (!me) return;
    this.path = findPath(me, to);
    this.pathTo = { x: to.x, y: to.y };
    this.lastRepath = this.scene.time.now;
  }

  /** A small fading ring where the hero is told to walk. */
  private marker(w: Pt) {
    const g = this.scene.add.graphics({ x: w.x, y: w.y });
    g.lineStyle(1, 0xf2c14e, 0.9).strokeEllipse(0, 0, 12, 6);
    g.lineStyle(1, 0x3a2410, 0.6).strokeEllipse(0, 1, 12, 6);
    g.setDepth(1);
    this.scene.tweens.add({ targets: g, scaleX: 0.3, scaleY: 0.3, alpha: 0, duration: 420, onComplete: () => g.destroy() });
  }

  // ---- every frame ---------------------------------------------------------------------------------------

  /** The movement the mouse wants this frame, or undefined when the mouse is not steering. */
  update(stepMs: number): InputState | undefined {
    this.drawRing();
    const goal = this.goal;
    if (!goal) return undefined;
    const me = this.host.me();
    if (!me) { this.cancel(); return STOP; }
    const now = this.scene.time.now;
    const pointer = this.scene.input.activePointer;

    if (goal.kind === "walk") {
      // Holding the left button: keep walking toward the pointer
      if (this.held === 0 && now - this.lastFollow > 150) {
        this.lastFollow = now;
        const w = this.world(pointer);
        goal.x = w.x; goal.y = w.y;
        if (!this.pathTo || Math.hypot(w.x - this.pathTo.x, w.y - this.pathTo.y) > TILE * 0.5) this.route(w);
      }
      const r = this.steer(me, stepMs);
      if (r) return r;
      if (this.held !== 0) this.goal = undefined;
      return STOP;
    }

    if (goal.kind === "cast") {
      if (now - this.lastAct >= 250) {
        if (this.held === 2) { const w = this.world(pointer); goal.x = w.x; goal.y = w.y; }
        this.lastAct = now;
        this.host.stop();
        if (!goal.self) this.host.send("face", { x: goal.x, y: goal.y });
        this.host.fire(true);
        if (this.held !== 2) this.goal = undefined;
      }
      return STOP;
    }

    if (goal.kind === "stand") {
      if (now - this.lastAct >= (this.held === 0 ? 110 : 300)) {
        this.lastAct = now;
        // Toward the enemy under the mouse if there is one (aimed like a click on it), else the mouse spot
        const over = this.hovered ? this.host.enemy(this.hovered) : undefined;
        const aim = over && !over.dead ? this.aimAt(over, me, false) : this.world(pointer);
        goal.since ??= now;
        this.host.stop();
        this.host.send("face", aim);
        if (!this.firedAt) this.firedAt = now;
        this.host.fire(false);
      }
      // One click: keep asking until the server swings (it drops attacks while the last one cools down), max 1.5 s
      if (this.held !== 0 && now - (goal.since ?? now) > 1500) this.goal = undefined;
      return STOP;
    }

    if (goal.kind === "castAt") {
      const near = Math.hypot(goal.x - me.x, goal.y - me.y) <= this.host.pointRange() * 0.95;
      const r = near ? undefined : this.steer(me, stepMs);
      if (r) return r;
      // In reach (or as close as the way allows): cast on the spot
      this.goal = undefined; this.path = [];
      this.host.stop();
      this.host.send("face", { x: goal.x, y: goal.y });
      this.host.fire(true);
      return STOP;
    }

    if (goal.kind === "spot") {
      const s = goal.spot;
      if (Math.hypot(s.x - me.x, s.y - me.y) <= s.range * 0.8) {
        this.goal = undefined; this.path = [];
        this.scene.time.delayedCall(120, () => s.act()); // let the prompt notice we're there first
        return STOP;
      }
      const r = this.steer(me, stepMs);
      if (r) return r;
      // End of the route (the spot itself may stand in a blocked tile): use it if it's within reach
      this.goal = undefined;
      if (Math.hypot(s.x - me.x, s.y - me.y) <= s.range) this.scene.time.delayedCall(120, () => s.act());
      return STOP;
    }

    // An enemy: chase it into reach, then attack (again and again while the button is held)
    let e = this.host.enemy(goal.id);
    if ((!e || e.dead) && !goal.secondary && this.held === 0) {
      // Still holding after the kill: go on with the next enemy under (or right next to) the mouse
      const next = this.nearest(this.world(pointer), 40);
      if (next) { goal.id = next.id; goal.fired = false; goal.tries = 0; e = next; this.route({ x: next.sx, y: next.sy }); }
    }
    if (!e || e.dead) { this.goal = undefined; this.path = []; return STOP; }
    const holding = this.held === (goal.secondary ? 2 : 0);
    const reach = this.host.reach(goal.secondary) + (goal.secondary ? 0 : e.body);
    // A walking monster: the server swings about half a round trip after we ask, so judge reach where it will be
    // by then, and notice when it is getting away from us.
    const vx = e.vx ?? 0, vy = e.vy ?? 0, lead = Math.min(0.3, this.rtt / 2000);
    const tx = e.sx + vx * lead, ty = e.sy + vy * lead;
    const dist = Math.hypot(tx - me.x, ty - me.y);
    const fleeing = !goal.secondary && Math.hypot(vx, vy) > 8 && vx * (tx - me.x) + vy * (ty - me.y) > 0;
    const near = dist <= reach;
    // Chasing one that runs (Murat): keep walking after it while swinging instead of stopping for every hit. The
    // server lets a hero swing on the move, so this is just steering toward it (straight, when nothing is between).
    const pursue = fleeing && dist > reach * 0.55 && this.clearLine(me, { x: tx, y: ty }) ? this.toward(me, tx, ty) : undefined;
    // The swing happens where the SERVER has our hero. While walking that is a little behind what we see, and a
    // knockback on the way can leave it further back: attack only once the server's hero is in reach too.
    if (near && !goal.secondary && Math.hypot(tx - me.sx, ty - me.sy) > reach + 2) {
      goal.waitAt ??= now;
      if (now - goal.waitAt < 450) { this.path = []; return pursue ?? STOP; } // (never wait forever)
    } else goal.waitAt = undefined;
    if (near) {
      this.path = [];
      if (goal.secondary) {
        if (now - this.lastAct >= 220) {
          this.lastAct = now;
          this.host.stop();
          this.host.send("face", this.aimAt(e, me, true));
          this.host.fire(true);
          goal.fired = true;
          if (!holding) this.goal = undefined;
        }
        return STOP;
      }
      // Basic attack. Held: swing again and again. One click: keep asking until the server swings (it drops the
      // attack while the last one is still cooling down), so a click never just walks up and does nothing.
      if (!holding && (goal.tries ?? 0) > 0 && now - (goal.since ?? now) > 1500) { this.goal = undefined; return STOP; }
      if (now - this.lastAct >= (holding ? 110 : 300)) {
        this.lastAct = now;
        if (!goal.tries) goal.since = now;
        goal.tries = (goal.tries ?? 0) + 1;
        if (!pursue) this.host.stop();
        this.host.send("face", pursue ? { x: tx, y: ty } : this.aimAt(e, me, false));
        if (!this.firedAt) this.firedAt = now;
        this.host.fire(false);
      }
      return pursue ?? STOP;
    }
    if (goal.fired && !holding) { this.goal = undefined; return STOP; }
    // Close and nothing in the way: run straight at it (tile routes zig-zag and lag behind a monster on the move)
    if (dist < TILE * 3 && this.clearLine(me, { x: tx, y: ty })) { this.path = []; return this.toward(me, tx, ty); }
    if (!this.pathTo || Math.hypot(e.sx - this.pathTo.x, e.sy - this.pathTo.y) > TILE * 0.75 || (now - this.lastRepath > 600 && !this.path.length)) {
      this.route({ x: tx, y: ty });
    }
    return this.steer(me, stepMs) ?? STOP;
  }

  /** Keys that walk straight toward (x, y): 8 directions, a diagonal only when it is really diagonal. */
  private toward(me: Pt, x: number, y: number): InputState {
    const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, k = 0.38; // ~ sin 22.5 degrees
    return { up: uy < -k, down: uy > k, left: ux < -k, right: ux > k };
  }

  /** Nothing that blocks walking on the straight line between two points? */
  private clearLine(a: Pt, b: Pt): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 4);
    for (let i = 1; i < n; i++) if (blocked(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
    return true;
  }

  /** Keys to press to follow the route (diagonal first, then straight, like the tile path). Undefined at the end. */
  private steer(me: { x: number; y: number; state: any }, stepMs: number): InputState | undefined {
    const tol = Math.max(1.5, this.host.speed() * stepMs / 1000 * 1.1);
    while (this.path.length) {
      const w = this.path[0];
      if (Math.abs(w.x - me.x) <= tol && Math.abs(w.y - me.y) <= tol) this.path.shift();
      else break;
    }
    if (!this.path.length) return undefined;
    // Stuck on something (a monster, a corner the server sees differently): find a new way, then give up
    const now = this.scene.time.now;
    const st = me.state;
    if (!this.stuckPos || Math.hypot(me.x - this.stuckPos.x, me.y - this.stuckPos.y) > 1) { this.stuckPos = { x: me.x, y: me.y }; this.stuckAt = now; }
    else if (now - this.stuckAt > 400 && !st?.stunned && !st?.rolling) {
      this.stuckAt = now;
      if (++this.stuck > 2 || !this.pathTo) { this.path = []; return undefined; }
      this.route(this.pathTo);
      if (!this.path.length) return undefined;
    }
    const w = this.path[0];
    const dx = w.x - me.x, dy = w.y - me.y;
    return { up: dy < -tol, down: dy > tol, left: dx < -tol, right: dx > tol };
  }
}
