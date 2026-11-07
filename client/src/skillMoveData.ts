/**
 * Data of the melee skill micro sequences (played by skillMoves.ts; no Phaser here, so the art tools read it too).
 *
 * The poses are drawn by tools/art/characters.ts (skillMoveFrames) into a separate sheet per hero,
 * assets/hd/characters/{hero}-moves.webp, with matching gear overlays assets/hd/gear/{hero}-moves_{item}.webp:
 * MOVE_SHEET anims x MOVE_DIRS rows of 8 frames.
 *   lunge  0 coil, 1 deep coil, 2 launch, 3 full thrust, 4-5 hold, 6 step back, 7 guard
 *   whirl  0 blade cocked behind, 1-3 spin pose (blade out to the side, front, other side), 4-7 unwind
 *   slam   0 gather, 1 heave overhead, 2 on the toes, 3 smash, 4-5 impact, 6 rise, 7 settle
 *   leap   0 crouch, 1 spring, 2 tuck, 3 top, 4 swing down, 5 landing, 6 rise, 7 settle
 *   cleave 0 twist back, 1 deeper, 2 sweep starts, 3 across the front, 4 through, 5 follow-through, 6-7 recover
 *   raise  0-7 blade raised to the sky, breathing (charging)
 */
import { LEAP_MS } from "../../shared/skills"; // a leap's hop through the air (skillfx.showMove), the slam lands with it

export const MOVE_SHEET = ["lunge", "whirl", "slam", "leap", "cleave", "raise"] as const;
export type MoveAnim = (typeof MOVE_SHEET)[number];
export const MOVE_DIRS = ["down", "up", "right", "downright", "upright"] as const;
export const MOVE_COLS = 8;
/** Heroes with melee skills (drawn in their native, melee stance). */
export const MOVE_HEROES = ["knight", "ninja", "barbarian", "vampire"];

/** One pose run of a sequence: frames `f` of anim `a` play evenly over `ms`. */
export interface Step {
  a: MoveAnim;
  f: number[];
  ms: number;
  spin?: number;      // turns through the 8 facings this many times during the step
  ghost?: number;     // afterimage every N ms
  lift?: number[];    // extra height in px (keys spread over the step)
  hide?: boolean;     // vanished (shadow steps)
  dust?: number;      // dust ring of this radius when the step starts
  fill?: boolean;     // wind-up: this step stretches to fill the server's wind-up/charge time
  repeat?: boolean;   // action: loop this step for the skill's duration (whirlwind)
}
export interface Seq { wind?: Step[]; act: Step[]; rec?: Step[] }


const S = (a: MoveAnim, f: number[], ms: number, o: Partial<Step> = {}): Step => ({ a, f, ms, ...o });
const cuts = (n: number) => [...Array(n).keys()].map((i) => i % 2 ? S("lunge", [3, 4], 75, { ghost: 22 }) : S("cleave", [3, 4], 75, { ghost: 22 }));

/** The sequences, by skill id. Wind-up steps are stretched or squeezed to the server's hold (windMs + chargeMs). */
export const MOVES: Record<string, Seq> = {
  // Knight · Valor
  k_lunge: { // coil on the back foot, drive through in a long low thrust, hold it, step back to guard
    wind: [S("lunge", [0], 50), S("lunge", [1], 70, { fill: true })],
    act: [S("lunge", [2], 40, { ghost: 14 }), S("lunge", [3], 50, { ghost: 14, dust: 8 }), S("lunge", [4, 5], 130)],
    rec: [S("lunge", [6, 7], 150)],
  },
  k_whirl: { // blade cocked behind, two full turns with the sword out (one per hit wave), unwind
    wind: [S("whirl", [0], 110, { fill: true })],
    act: [S("whirl", [2], 360, { spin: 2, ghost: 24, dust: 10 })],
    rec: [S("whirl", [4, 5, 6, 7], 200)],
  },
  k_rush: { // low coil, a long charge in the thrust, a cut across the line at the end
    wind: [S("lunge", [0], 50), S("lunge", [1], 90, { fill: true })],
    act: [S("lunge", [2, 3], 120, { ghost: 12 }), S("cleave", [3, 4, 5], 150, { dust: 10 })],
    rec: [S("cleave", [6, 7], 150)],
  },
  k_judgement: { // sword raised to the sky for the whole charge, cut down as the blade of light falls
    wind: [S("raise", [0], 100), S("raise", [1, 2, 3, 4, 5, 6, 7], 500, { fill: true })],
    act: [S("slam", [3], 60, { ghost: 20 }), S("slam", [4, 5], 280, { dust: 12 })],
    rec: [S("slam", [6, 7], 180)],
  },
  k_quake: { // heave the sword up on the toes, crash it into the ground
    wind: [S("slam", [0], 50), S("slam", [1], 60, { fill: true }), S("slam", [2], 40, { lift: [0, 3] })],
    act: [S("slam", [3], 50, { lift: [3, 0] }), S("slam", [4, 5], 220, { dust: 18 })],
    rec: [S("slam", [6, 7], 180)],
  },
  // Ninja
  n_step: { // drop low, vanish, reappear stepping out of it
    act: [S("lunge", [1], 50), S("lunge", [2], 90, { hide: true }), S("lunge", [6, 7], 140)],
  },
  n_assassinate: { // crouch, vanish, appear behind the target already thrusting
    wind: [S("lunge", [1], 80, { fill: true })],
    act: [S("lunge", [2], 60, { hide: true }), S("lunge", [3, 4, 5], 170, { ghost: 40 })],
    rec: [S("lunge", [6, 7], 130)],
  },
  n_cuts: { // six blinks, a cut at each (sweeps and thrusts in turn, facing each jump)
    act: cuts(12),
    rec: [S("lunge", [6, 7], 150)],
  },
  n_storm: { // five turns, one per hit wave, blades out
    wind: [S("whirl", [0], 90, { fill: true })],
    act: [S("whirl", [2], 750, { spin: 5, ghost: 22, dust: 12 })],
    rec: [S("whirl", [4, 5, 6, 7], 180)],
  },
  // Barbarian
  b_cleave: { // the axe hauled far back, one huge sweep, the weight carries through
    wind: [S("cleave", [0], 60), S("cleave", [1], 100, { fill: true })],
    act: [S("cleave", [2], 35), S("cleave", [3], 40, { ghost: 14 }), S("cleave", [4, 5], 150, { dust: 10 })],
    rec: [S("cleave", [6, 7], 170)],
  },
  b_slam: { // heave the axe up on the toes, smash the ground
    wind: [S("slam", [0], 50), S("slam", [1], 60, { fill: true }), S("slam", [2], 40, { lift: [0, 3] })],
    act: [S("slam", [3], 45, { lift: [3, 0] }), S("slam", [4, 5], 190, { dust: 16 })],
    rec: [S("slam", [6, 7], 160)],
  },
  b_seismic: { // a chop into the ground that sends the spikes out
    wind: [S("slam", [0], 40), S("slam", [1], 70, { fill: true })],
    act: [S("slam", [3], 45), S("slam", [4, 5], 220, { dust: 14 })],
    rec: [S("slam", [6, 7], 150)],
  },
  b_leap: { // crouch, spring and tuck in the air (the hop itself is skillfx's), crash down axe first
    wind: [S("leap", [0], 80, { fill: true })],
    act: [S("leap", [1, 2, 3, 4], LEAP_MS, { ghost: 45 }), S("leap", [5], 190, { dust: 18 })],
    rec: [S("leap", [6, 7], 160)],
  },
  b_avalanche: {
    wind: [S("leap", [0], 110, { fill: true })],
    act: [S("leap", [1, 2, 3, 4], LEAP_MS, { ghost: 40 }), S("leap", [5], 240, { dust: 24 })],
    rec: [S("leap", [6, 7], 180)],
  },
  b_whirlwind: { // spins as long as the whirlwind lasts (the hero can walk meanwhile)
    act: [S("whirl", [2], 200, { spin: 1, ghost: 40, repeat: true })],
    rec: [S("whirl", [4, 5, 6, 7], 180)],
  },
  // Vampire
  v_rend: { // a quick twist and a cruel cut across the front
    wind: [S("cleave", [1], 60, { fill: true })],
    act: [S("cleave", [2], 30), S("cleave", [3], 40, { ghost: 14 }), S("cleave", [4, 5], 130)],
    rec: [S("cleave", [6, 7], 140)],
  },
  v_mist: { // sink into the mist, gone, and step out of it ahead
    act: [S("lunge", [1], 50), S("lunge", [2], 110, { hide: true }), S("lunge", [6, 7], 140)],
  },
  v_pounce: { // crouch low, spring at the prey, the blade driven in, hold it there to drink
    wind: [S("leap", [0], 70, { fill: true })],
    act: [S("lunge", [2], 50, { ghost: 12, lift: [0, 4] }), S("lunge", [3], 50, { ghost: 12, lift: [4, 0], dust: 8 }), S("lunge", [4, 5], 180)],
    rec: [S("lunge", [6, 7], 150)],
  },
  v_devour: { // lunge at the prey and tear into it, then hunch over the meal
    act: [S("lunge", [2], 50, { ghost: 12 }), S("lunge", [3, 4], 170, { dust: 6 })],
    rec: [S("lunge", [6, 7], 150)],
  },
  v_bite: { // a quick lunge, fangs in, and hold to drink
    act: [S("lunge", [2], 50, { ghost: 10 }), S("lunge", [4, 5], 200)],
    rec: [S("lunge", [6, 7], 140)],
  },
};

/** Frame index of a pose in a {hero}-moves sheet. */
export function moveFrame(anim: MoveAnim, dir: (typeof MOVE_DIRS)[number], i: number) {
  return (MOVE_SHEET.indexOf(anim) * MOVE_DIRS.length + MOVE_DIRS.indexOf(dir)) * MOVE_COLS + i;
}
