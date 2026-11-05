import Phaser from "phaser";
import { FxStyle, rankTime, skillById } from "../../shared/skills";
import { PALETTE, SkillFx } from "./skillfx";
import { screenDir8 } from "./iso";
import { CHAR_BASE, CHAR_FRAME, HD_CHARS } from "./artAssets";
import { MOVE_DIRS, MOVE_HEROES, MOVES, moveFrame, Step } from "./skillMoveData";

/**
 * Hero skill moves (Murat 2026-11-05): big melee skills play a short micro sequence instead of the generic cast
 * animation: a wind-up (the server holds the blow for the skill's windMs, shared/skills.ts), the action (thrust, spin,
 * slam, leap...) and a recovery. The poses are whole-body pixel art in each hero's {hero}-moves sheet (drawn by
 * tools/art/characters.ts on the same 1.5 texel grid), with gear overlays from the matching {hero}-moves sheets
 * (GearLayer follows the body's sheet). Spins turn the hero through the 8 facings in step with the server's hit
 * waves; dashes leave afterimages in the skill's colour; slams and landings kick up dust.
 * Walking cuts the recovery short, a new attack or a roll cuts the whole sequence: control always wins.
 * Until a hero's sheets have loaded (or with ?pixel=1) the generic cast animation plays instead.
 */

/** 8 facings in screen order, turning clockwise. */
const RING = ["down", "downleft", "left", "upleft", "up", "upright", "right", "downright"];

interface Run {
  hero: string; sheet: string; style: FxStyle;
  dir: string;                 // facing the sequence started on (re-aimed by move events)
  steps: { s: Step; at: number; end: number; phase: "wind" | "act" | "rec" }[];
  end: number; stepIdx: number; nextGhost: number; gx: number; gy: number;
}

export interface MoveHost {
  sprite: Phaser.GameObjects.Sprite;
  hero?: string;
  state: any;
  gear?: { each(fn: (s: Phaser.GameObjects.Sprite, slot: string) => void): void; ready(sheet: string, state: any): boolean };
}

export const movesSheet = (hero: string) => `${hero}-moves`;

export class SkillMoves {
  private runs = new Map<string, Run>();
  private origin = new Map<string, number>();
  private pending = new Set<string>();

  constructor(private scene: Phaser.Scene, private fx: SkillFx) {}

  /** Loads a melee hero's skill-move sheet the first time it is seen. True when it can be used. */
  prefetch(hero: string | undefined): boolean {
    if (!hero || !HD_CHARS || !MOVE_HEROES.includes(hero)) return false;
    const key = movesSheet(hero);
    if (this.scene.textures.exists(key)) return true;
    if (this.pending.has(key)) return false;
    this.pending.add(key);
    this.scene.load.spritesheet(key, `${CHAR_BASE}/${key}.webp`, { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME });
    this.scene.load.once(`filecomplete-spritesheet-${key}`, () => this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST));
    if (!this.scene.load.isLoading()) this.scene.load.start();
    return false;
  }

  /** A "cast" event: starts the hero's sequence. False when there is none (play the generic cast animation). */
  start(id: string, e: MoveHost, ev: any, dir: string): boolean {
    const seq = MOVES[ev.s];
    if (!seq || !e.hero || !this.prefetch(e.hero)) return false;
    const sheet = movesSheet(e.hero);
    if (e.gear && !e.gear.ready(sheet, e.state)) return false; // its armour isn't loaded yet: don't show the hero bare
    const now = this.scene.time.now;
    const steps: Run["steps"] = [];
    let t = now;
    // The wind-up fills the server's hold (charge + wind), so the action starts as the blow lands
    const hold = (ev.charge ?? 0) + (ev.wind ?? 0);
    const wind = seq.wind ?? [];
    const natural = wind.reduce((a, s) => a + s.ms, 0);
    const extra = hold - natural, fillers = wind.filter((s) => s.fill).length || 1;
    for (const s of wind) {
      const ms = hold <= 0 ? s.ms * 0.5 // no hold (an old server): only a quick anticipation
        : extra >= 0 ? s.ms + (s.fill ? extra / fillers : 0) : s.ms * hold / natural;
      steps.push({ s, at: t, end: t + ms, phase: "wind" }); t += ms;
    }
    const def = skillById(ev.s);
    const lasts = def?.field ? def.field.ms * rankTime(ev.rank ?? 1) : 0;
    for (const st of seq.act) {
      const n = st.repeat && lasts > 0 ? Math.max(1, Math.round(lasts / st.ms)) : 1;
      for (let k = 0; k < n; k++) { steps.push({ s: st, at: t, end: t + st.ms, phase: "act" }); t += st.ms; }
    }
    for (const st of seq.rec ?? []) { steps.push({ s: st, at: t, end: t + st.ms, phase: "rec" }); t += st.ms; }
    this.stop(id, e);
    this.origin.set(id, e.sprite.originY);
    this.runs.set(id, { hero: e.hero, sheet, style: def?.style ?? "steel", dir, steps, end: t, stepIdx: -1, nextGhost: 0, gx: e.sprite.x, gy: e.sprite.y });
    e.sprite.anims.stop();
    return true;
  }

  active(id: string) { return this.runs.has(id); }

  /** A dash/blink/leap from the server: face along it. */
  onMove(id: string, ev: any) {
    const r = this.runs.get(id);
    if (!r || ev.fx === undefined || (ev.x === ev.fx && ev.y === ev.fy)) return;
    r.dir = screenDir8(ev.x - ev.fx, ev.y - ev.fy, r.dir);
  }

  /** Cut the sequence (a new attack, a roll, death). The next normal animation puts the hero's own sheet back. */
  stop(id: string, e?: MoveHost) {
    if (!this.runs.delete(id)) return;
    const oy = this.origin.get(id);
    if (e && oy !== undefined) e.sprite.setOrigin(e.sprite.originX, oy);
    if (e) e.sprite.setAlpha(1);
  }

  /**
   * Draws this frame of the hero's sequence. False when none is running (the normal animations play).
   * Call after the sprite's position is set and before the gear overlays sync.
   */
  tick(id: string, e: MoveHost, moving: boolean): boolean {
    const r = this.runs.get(id);
    if (!r) return false;
    const now = this.scene.time.now;
    const i = r.steps.findIndex((s) => now < s.end);
    if (now >= r.end || i < 0 || r.hero !== e.hero || e.state.dead) { this.stop(id, e); return false; }
    const cur = r.steps[i];
    if (cur.phase === "rec" && moving) { this.stop(id, e); return false; } // walking away ends the recovery
    const st = cur.s, k = Math.max(0, Math.min(0.999, (now - cur.at) / (cur.end - cur.at)));
    if (i !== r.stepIdx) { r.stepIdx = i; if (st.dust) this.dust(e, st.dust); }
    // Facing: the start direction, turned through the ring on spins
    let dir = r.dir;
    if (st.spin) dir = RING[(Math.max(0, RING.indexOf(dir)) + Math.floor(k * st.spin * 8)) % 8];
    const left = dir.endsWith("left");
    const d = (left ? dir.replace("left", "right") : dir) as (typeof MOVE_DIRS)[number];
    const f = st.f[Math.min(st.f.length - 1, Math.floor(k * st.f.length))];
    if (e.sprite.anims.isPlaying) e.sprite.anims.stop();
    e.sprite.setTexture(r.sheet, moveFrame(st.a, MOVE_DIRS.includes(d) ? d : "right", f)).setFlipX(left);
    // Height: an origin shift, so the server position (and depth sorting) stays on the ground
    const lift = st.lift ? keyAt(st.lift, k) : 0;
    e.sprite.setOrigin(e.sprite.originX, (this.origin.get(id) ?? e.sprite.originY) + lift / (e.sprite.height * e.sprite.scaleY));
    e.sprite.setAlpha(st.hide ? 0 : 1);
    if (st.ghost && !st.hide && now >= r.nextGhost) {
      // Spinning on the spot: only the blade leaves a trail (a blur of steel round the hero). Moving: the whole
      // hero, once it has gone a few px from the last afterimage (stacked ones on the spot only wash it out)
      r.nextGhost = now + st.ghost;
      const { x, y } = e.sprite;
      if (st.spin) this.ghost(e, PALETTE[r.style][1], true);
      else if (!(Math.hypot(x - r.gx, y - r.gy) < 3)) { r.gx = x; r.gy = y; this.ghost(e, PALETTE[r.style][2], false); }
    }
    return true;
  }

  /** Afterimage of the hero and its gear, flat in the skill colour. */
  private ghost(e: MoveHost, tint: number, bladeOnly: boolean) {
    const parts: Phaser.GameObjects.Sprite[] = bladeOnly ? [] : [e.sprite];
    e.gear?.each((s, slot) => { if (!bladeOnly || slot === "weapon") parts.push(s); });
    for (const s of parts) {
      if (!s.visible) continue;
      const g = this.scene.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY).setFlipX(s.flipX)
        .setScale(s.scaleX, s.scaleY).setTintFill(tint).setAlpha(bladeOnly ? 0.45 : 0.28).setDepth(e.sprite.depth - 0.2).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: bladeOnly ? 160 : 220, onComplete: () => g.destroy() });
    }
  }

  /** Dust kicked up at the feet: a ring of pixel grit and a few chips flying up. */
  private dust(e: MoveHost, r: number) {
    const { x, y } = e.sprite;
    this.fx.ring(x, y, r, "earth", Math.round(r * 1.4), { life: 360, up: 8, add: false });
    this.fx.burst(x, y, 2, "earth", Math.round(r / 3), 40, 320);
  }
}

/** Value of a key list at fraction k (0..1). */
function keyAt(keys: number[], k: number) {
  if (keys.length === 1) return keys[0];
  const p = k * (keys.length - 1), i = Math.min(keys.length - 2, Math.floor(p));
  return keys[i] + (keys[i + 1] - keys[i]) * (p - i);
}
