import Phaser from "phaser";
import { InputState, TILE } from "../../shared/constants";
import { findPath, type Pt } from "./pathfind";
import { fromIso, isoX, isoY, ISO } from "./iso";
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

export interface ClickEnemy { id: string; x: number; y: number; h: number; dead: boolean }
export interface ClickSpot { x: number; y: number; h: number; w: number; range: number; act: () => void }

export interface PointerHost {
  /** Our hero: predicted feet position and its server state, or nothing (not in the world yet / dead). */
  me(): { x: number; y: number; state: any } | undefined;
  enemies(): ClickEnemy[];
  enemy(id: string): ClickEnemy | undefined;
  spots(): ClickSpot[];
  speed(): number;
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
  | { kind: "enemy"; id: string; secondary: boolean; fired: boolean }
  | { kind: "cast"; x: number; y: number; self?: boolean }
  | { kind: "castAt"; x: number; y: number };

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

  constructor(private scene: Phaser.Scene, private host: PointerHost) {
    scene.input.mouse?.disableContextMenu();
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => { if (p.button === this.held) this.held = -1; });
    scene.input.on("gameout", () => { this.held = -1; });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.hover(p));
  }

  /** Stop whatever the mouse asked for (a movement key was pressed, the hero died...). */
  cancel() { this.goal = undefined; this.path = []; this.held = -1; }
  get active() { return !!this.goal; }

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
    let spot: ClickSpot | undefined, sd = Infinity;
    for (const o of this.host.spots()) {
      const d = this.inBox(s, o.x, o.y, o.w, o.h);
      if (d !== undefined && d < sd) { sd = d; spot = o; }
    }
    return { spot };
  }

  private hover(p: Phaser.Input.Pointer) {
    const canvas = this.scene.game.canvas;
    if (this.host.blocked()) { setWorldCursor(canvas, false); return; }
    setWorldCursor(canvas, !!this.pick(p).enemy);
  }

  private down(p: Phaser.Input.Pointer) {
    if (this.host.blocked() || !this.host.me()) return;
    const button = p.button;
    if (button !== 0 && button !== 2) return;
    this.held = button;
    this.stuck = 0;
    const { enemy, spot } = this.pick(p);
    const target = button === 2 ? this.host.target() : "dir";
    if (button === 2 && target === "self") {
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
      this.route({ x: enemy.x, y: enemy.y });
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
    const e = this.host.enemy(goal.id);
    if (!e || e.dead) { this.goal = undefined; this.path = []; return STOP; }
    const holding = this.held === (goal.secondary ? 2 : 0);
    if (Math.hypot(e.x - me.x, e.y - me.y) <= this.host.reach(goal.secondary)) {
      this.path = [];
      if (now - this.lastAct >= (goal.secondary ? 220 : 110)) {
        this.lastAct = now;
        this.host.stop();
        this.host.send("face", { x: e.x, y: e.y });
        this.host.fire(goal.secondary);
        goal.fired = true;
        if (!holding) this.goal = undefined;
      }
      return STOP;
    }
    if (goal.fired && !holding) { this.goal = undefined; return STOP; }
    if (!this.pathTo || Math.hypot(e.x - this.pathTo.x, e.y - this.pathTo.y) > TILE * 0.75 || (now - this.lastRepath > 600 && !this.path.length)) {
      this.route({ x: e.x, y: e.y });
    }
    return this.steer(me, stepMs) ?? STOP;
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
