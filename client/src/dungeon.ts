import Phaser from "phaser";
import { MAP_W, TILE, WORLD_H } from "../../shared/constants";
import { DOOR_RANGE, DOORS, doorDist, doorWorkable, isSolidTile, setDoorOpen, type Door } from "../../shared/map";
import { refreshWalk } from "./pathfind";
import { play } from "./sfx";
import type { MapMarker } from "./minimap";
import { BRAZIERS, COCOONS, CRYPT_DOOR, DEN, Floor, FLOORS, floorById, floorNo, LINKS, SINKHOLE, TOTEMS, UNDER_SHAFT } from "../../shared/dungeon";
import { deepTextures, WALL_TINT } from "./deepArt";
import { CHESTS } from "../../shared/chests";
import { GORE, goreTextures } from "./goreArt";
import { ISO, isoAnchor, isoScreen, isoX, isoY } from "./iso";
import { BLOCK_TOP, BRAZIER, PIT, STAIR_UP, TORCH, dungeonTextures, GATE_FRAMES, GATE_FRAME_H, gateShape, gateSheet, ROPE_ART, TX, WALL_LOW, WALL_TALL, wallTexture, OPEN_N, OPEN_W, OPEN_S, OPEN_E } from "./dungeonArt";
import { TEXT_FONT, TEXT_PX, WT } from "./pixelfont";

/**
 * The Mawdeep Warrens on the client (shared/dungeon.ts): the sinkhole in the Whispering Woods, and down below, cave
 * walls standing round each floor's chambers and tunnels, braziers, ropes and stairs, the beast-folk's hide racks,
 * skull poles, bones and webs. Below ground it is dark: only the braziers and the light each hero carries show
 * anything (a darkness overlay with holes, in place of the day/night tint).
 *
 * Each floor is built the first time the local hero sets foot on it.
 */
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const DARK_DEPTH = 27000, GLOW_DEPTH = 27500, DECAL = -0.5;
const DW = 220; // darkness canvas width (texels): soft, scaled up

export interface DungeonHost {
  /** The local hero's feet (world px). */
  me(): { x: number; y: number } | undefined;
  /** Calls `fn` with every hero's feet in view (they carry a light); no per-frame arrays. */
  eachHero(fn: (x: number, y: number) => void): void;
}

const DOOR_TILES = new Set(DOORS.flatMap((d) => d.tiles));

/**
 * What each chamber was used for (Murat 2026-11-05: gore only where it fits how the place is used). Villagers come
 * down the sinkhole, are kept in cages and silk pens, dragged to the butchery and the skinning floor, sewn into hides
 * on the third floor; what is left goes to the midden or the elites' lairs. Drag smears run along those tunnels.
 */
type Role = "landing" | "cages" | "butchery" | "midden" | "torture" | "pens" | "stitch" | "lair" | "byre" | "den";
const STORY: Record<number, { rooms: Record<number, Role>; drags: [number, number][] }> = {
  1: { rooms: { 0: "landing", 2: "cages", 3: "butchery", 1: "midden", 7: "lair" }, drags: [[0, 2], [2, 3], [3, 1], [3, 7]] },
  2: { rooms: { 2: "pens", 4: "pens", 7: "pens", 3: "torture", 5: "lair" }, drags: [[2, 3], [7, 3], [4, 5], [3, 5]] },
  3: { rooms: { 2: "cages", 1: "stitch", 3: "byre", 4: "den" }, drags: [[2, 1], [1, 3], [2, 4]] },
};
/** Props per role: texture, frames to pick from, how many, standing (by the walls) or flat on the floor. */
type Recipe = [key: string, frames: number[], n: number, standing: boolean];
const RECIPES: Record<Role, Recipe[]> = {
  landing: [["dg_blood", [0, 1], 1, false], ["dg_remains", [3], 1, false]],
  cages: [["dg_cage", [0, 1], 4, true], ["dg_blood", [0, 1, 2, 3], 2, false], ["dg_remains", [3], 1, false]],
  pens: [["dg_cage", [0, 1], 2, true], ["dg_blood", [0, 2], 1, false]],
  butchery: [["dg_block", [0, 1], 2, false], ["dg_hook", [0, 1, 2], 4, true], ["dg_blood", [0, 1, 2, 3], 4, false], ["dg_remains", [1, 3], 2, false]],
  midden: [["dg_remains", [0, 1, 2, 3], 6, false], ["dg_blood", [1, 3], 2, false], ["dg_hook", [2], 1, true]],
  torture: [["dg_frame", [0], 4, true], ["dg_block", [1], 2, false], ["dg_hook", [0, 1, 2], 3, true], ["dg_blood", [0, 1, 2, 3], 7, false], ["dg_remains", [0, 2], 3, false]],
  stitch: [["dg_slab", [0], 2, false], ["dg_frame", [1], 2, true], ["dg_block", [1], 1, false], ["dg_cage", [1], 1, true], ["dg_blood", [0, 1, 2], 4, false], ["dg_remains", [1], 1, false]],
  lair: [["dg_remains", [0, 1, 2, 3], 4, false], ["dg_blood", [0, 1, 3], 3, false], ["dg_hook", [2], 1, true]],
  byre: [["dg_pike", [0, 1], 3, true], ["dg_remains", [0, 3], 2, false], ["dg_blood", [1], 2, false]],
  den: [["dg_pike", [0, 1], 6, true], ["dg_blood", [0, 1, 2, 3], 4, false], ["dg_remains", [0, 1, 2], 3, false]],
};
const ORIGIN: Record<string, number> = { // feet row of each standing sheet (fraction of its height)
  dg_hook: 1 - 2 / GORE.hook.h, dg_cage: GORE.cage.foot / GORE.cage.h, dg_block: GORE.block.foot / GORE.block.h, dg_slab: GORE.slab.foot / GORE.slab.h, dg_frame: 1 - 3 / GORE.frame.h, dg_pike: 1 - 2 / GORE.pike.h,
};

interface Light { x: number; y: number; r: number; flicker: number; seed: number }

export class DungeonView {
  private built = new Set<number>();
  private lights: Light[] = [];
  private dark?: Phaser.GameObjects.Image;
  private darkTex?: Phaser.Textures.CanvasTexture;
  private label?: Phaser.GameObjects.Text;
  private amount = 0; // 0 above ground .. 1 below
  /** True while the local hero is below ground (Details turns the day/night tint off then). */
  underground = false;
  /** Night above ground (0..1, set by the scene). With the torch lit the same dark-with-holes is laid over the night. */
  night = 0;
  /** The local hero carries a lit torch (L): a much wider, flickering, warm pool of light. */
  torch = false;
  floor = 0;
  /** Gates seen open (server TownState.doors), and each built gate's barricade blocks. */
  private doorsOpen = new Set<string>();
  private doorsRaw = "";
  private gates = new Map<string, Phaser.GameObjects.Sprite>();
  /** The gate within reach of the local hero (E works it), if any. */
  nearDoor?: Door;

  constructor(private scene: Phaser.Scene, private host: DungeonHost, private font: string) {
    dungeonTextures(scene);
    goreTextures(scene);
    deepTextures(scene);
    this.surface();
    this.label = scene.add.text(0, 0, "", { fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: "#e8d7a8", stroke: "#000", strokeThickness: 2 })
      .setOrigin(0.5, 1).setScale(WT).setResolution(1).setDepth(30000).setVisible(false);
  }

  /** The sinkhole's mouth in the woods, with the rope staked at its lip. */
  private surface() {
    const s = this.scene, x = (SINKHOLE.x + 0.5) * TILE, y = (SINKHOLE.y + 0.5) * TILE;
    s.add.image(x, y, "dg_sinkhole").setScale(1 / TX).setDepth(DECAL);
    const stake = { x: x - 1.3 * TILE, y: y - 0.6 * TILE };
    s.add.image(stake.x, stake.y, "dg_stake").setOrigin(0.3, 1).setScale(1 / TX).setDepth(stake.y);
    // the Lantern Crypt's stair going down in the mausoleum on Barrow Downs, between two votive candles
    const cx = (CRYPT_DOOR.x + 0.5) * TILE, cy = (CRYPT_DOOR.y + 0.5) * TILE;
    s.add.image(cx, cy, "dg_pit").setOrigin(0.5, 30 / PIT.h).setScale(0.75 / TX).setDepth(DECAL);
    for (const ox of [-1.1, 1.1]) s.add.sprite(cx + ox * TILE, cy - 0.6 * TILE, "dp_candles", 0).setOrigin(0.5, 0.9).setScale(1 / TX).setDepth(cy - 0.6 * TILE).play({ key: "dp_candles_burn", startFrame: ox > 0 ? 2 : 0 });
    // the old well in Kharsun: a black shaft in the paving, a rope staked at its lip
    const wx = (UNDER_SHAFT.x + 0.5) * TILE, wy = (UNDER_SHAFT.y + 0.5) * TILE;
    s.add.image(wx, wy, "dg_sinkhole").setScale(0.6 / TX).setDepth(DECAL);
    s.add.image(wx - 0.9 * TILE, wy - 0.4 * TILE, "dg_stake").setOrigin(0.3, 1).setScale(1 / TX).setDepth(wy - 0.4 * TILE);
  }

  /** Walls, links and props of one floor. */
  private build(f: Floor) {
    if (this.built.has(f.id)) return;
    this.built.add(f.id);
    const s = this.scene;
    const open = (x: number, y: number) => x > f.x && y > f.y && x < f.x + f.w - 1 && y < f.y + f.h - 1 && (!isSolidTile(x, y) || DOOR_TILES.has(y * MAP_W + x));
    // Cave walls (Murat 2026-11-07: a natural cave, but only the inside looks like a wall): every rock tile next to the
    // floor; a rock face only where it looks onto the floor (its south or east side), tall unless floor lies behind it on
    // screen; elsewhere just the dark rock mass at ground level, with a lit lip along the room's edge.
    if (ISO) for (let ty = f.y; ty < f.y + f.h; ty++) for (let tx = f.x; tx < f.x + f.w; tx++) {
      if (open(tx, ty)) continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if (open(tx + i, ty + j)) { near = true; break; }
      if (!near) continue;
      const o = (open(tx, ty - 1) ? OPEN_N : 0) | (open(tx - 1, ty) ? OPEN_W : 0) | (open(tx, ty + 1) ? OPEN_S : 0) | (open(tx + 1, ty) ? OPEN_E : 0);
      const behind = open(tx - 1, ty) || open(tx, ty - 1) || open(tx - 1, ty - 1); // tall here would hide the floor behind it
      const h = o & (OPEN_S | OPEN_E) ? (behind ? WALL_LOW : WALL_TALL) : 0;
      const key = wallTexture(s, h, o, ((tx % 4) + 4) % 4, ((ty % 4) + 4) % 4);
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      const img = s.add.image(cx, cy, key).setScale(1 / TX).setDepth(h ? cy : DECAL + 0.1).setTint(WALL_TINT[f.dungeon]);
      img.setOrigin(0.5, (BLOCK_TOP / 2 + h * TX) / (BLOCK_TOP + h * TX));
    }
    // Gates into the lairs: a portcullis between two posts across the tunnel, drawn along whichever of the iso lines
    // (east-west, north-south, or straight across the screen) is closest to the gate's own line
    for (const d of DOORS.filter((g) => g.floor === f.id)) {
      let ends: [number, number] = [d.tiles[0], d.tiles[0]], far = -1;
      for (const a of d.tiles) for (const b of d.tiles) {
        const dd = Math.hypot((a % MAP_W) - (b % MAP_W), ((a / MAP_W) | 0) - ((b / MAP_W) | 0));
        if (dd > far) { far = dd; ends = [a, b]; }
      }
      const ex = (ends[1] % MAP_W) - (ends[0] % MAP_W), ey = ((ends[1] / MAP_W) | 0) - ((ends[0] / MAP_W) | 0), el = Math.hypot(ex, ey) || 1;
      const AXES = [{ w: [1, 0], s: [1, 0.5] }, { w: [0, 1], s: [-1, 0.5] }, { w: [Math.SQRT1_2, -Math.SQRT1_2], s: [Math.SQRT2, 0] }];
      const ax = AXES.reduce((best, A) => (Math.abs(A.w[0] * ex + A.w[1] * ey) / el > Math.abs(best.w[0] * ex + best.w[1] * ey) / el + 1e-6 ? A : best));
      const pr = (k: number) => ((k % MAP_W) + 0.5) * ax.w[0] + (((k / MAP_W) | 0) + 0.5) * ax.w[1];
      const proj = d.tiles.map(pr), lo = Math.min(...proj) - 0.65, hi = Math.max(...proj) + 0.65, c0 = d.x * ax.w[0] + d.y * ax.w[1];
      // centred on the door's point: the wall reaches as far each way as its farthest tile
      const half = Math.max(c0 - lo, hi - c0), len = half * 2 * TILE;
      const gp = d.gate.map(pr), g0 = (Math.min(...gp) - 0.5 - (c0 - half)) / (half * 2), g1 = (Math.max(...gp) + 0.5 - (c0 - half)) / (half * 2);
      const shape = gateShape(ax.s[0], ax.s[1], len), key = `dg_gate_${d.id}`;
      gateSheet(s, key, shape, d.kind, Math.max(0.05, g0), Math.min(0.95, g1));
      const x = d.x * TILE, y = d.y * TILE, opened = this.doorsOpen.has(d.id);
      const spr = s.add.sprite(x, y, key, opened ? GATE_FRAMES - 1 : 0).setOrigin(shape.ox / shape.w, shape.oy / shape.h).setScale(1 / TX).setDepth(y);
      if (!s.anims.exists(`${key}_open`)) s.anims.create({ key: `${key}_open`, frames: s.anims.generateFrameNumbers(key, { start: 0, end: GATE_FRAMES - 1 }), frameRate: 11 });
      this.gates.set(d.id, spr);
    }
    // Ropes and stairs
    for (const l of LINKS.filter((k) => k.floor === f.id)) {
      if (l.rope) {
        s.add.sprite(l.x, l.y, "dg_rope", 0).setOrigin(0.5, 1 - 6 / ROPE_ART.h).setScale(1 / TX).setDepth(l.y).play("dg_rope_sway");
        // daylight falling from the sinkhole far above
        const beam = s.add.image(l.x, l.y + 4, "dg_beam").setOrigin(0.5, 1).setScale(2.2, 1.6).setTint(0xcfd8c8).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
        isoAnchor(beam, { x: l.x, y: l.y });
        this.lights.push({ x: l.x, y: l.y, r: 3.2 * TILE, flicker: 0, seed: 1 });
      } else if (l.down) {
        s.add.image(l.x, l.y, "dg_pit").setOrigin(0.5, 30 / PIT.h).setScale(1 / TX).setDepth(DECAL);
      } else {
        s.add.image(l.x - 0.4 * TILE, l.y - 0.4 * TILE, "dg_stair_up").setOrigin((STAIR_UP.OX + 13 - 18) / STAIR_UP.w, (STAIR_UP.OY + 15.5) / STAIR_UP.h).setScale(1 / TX).setDepth(l.y - 0.4 * TILE);
      }
      // Torches at the head of each stair (Murat 2026-11-07), two flanking the way down, one by the way up
      if (!l.rope) {
        const spots = l.down ? [[-1.6, -1.3], [1.3, -1.6], [-1.6, 1.3], [1.3, 1.6], [1.8, 0.2], [0.2, 1.8]] : [[0.9, -1.5], [-1.5, 0.9], [1.4, 0.6], [0.6, 1.4]];
        let n = 0;
        for (const [ox, oy] of spots) {
          if (n >= (l.down ? 2 : 1)) break;
          const x = l.x + ox * TILE, y = l.y + oy * TILE;
          if (!open(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
          n++;
          s.add.sprite(x, y, "dg_torch", 0).setOrigin(0.5, 1 - 2 / TORCH.h).setScale(1 / TX).setDepth(y).play({ key: "dg_torch_burn", startFrame: n * 2 });
          const glow = s.add.image(x, y - 26, "light").setTint(0xff8a3a).setScale(2.2).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
          isoAnchor(glow, { x, y });
          this.lights.push({ x, y, r: 3.4 * TILE, flicker: 0.14, seed: Math.round(x + y) });
        }
      }
    }
    // Braziers
    for (const [bx, by] of BRAZIERS) {
      if (bx < f.x || by < f.y || bx >= f.x + f.w || by >= f.y + f.h || isSolidTile(bx, by)) continue;
      const x = (bx + 0.5) * TILE, y = (by + 0.5) * TILE;
      if (LINKS.some((l) => Math.hypot(l.x - x, l.y - y) < 2.5 * TILE)) continue; // the rope's daylight or a stair stands there
      s.add.sprite(x, y, "dg_brazier", 0).setOrigin(0.5, 1).setScale(1 / TX).setDepth(y).play({ key: "dg_brazier_burn", startFrame: Math.floor(hash(bx, by, 3) * BRAZIER.frames) });
      const glow = s.add.image(x, y - 18, "light").setTint(0xff8a3a).setScale(3.2).setAlpha(0.42).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
      isoAnchor(glow, { x, y });
      this.lights.push({ x, y, r: 4.2 * TILE, flicker: 0.12, seed: bx * 7 + by });
    }
    // The Hide-Mother's bed of hides
    if (f.id === 3) s.add.image((DEN.x + 0.5) * TILE, (DEN.y + 0.5) * TILE, "dg_bed").setScale(1 / TX).setDepth(DECAL);
    this.story(f, open);
    if (f.dungeon !== "maw") { this.deepProps(f, open); return; }
    // Beast-folk clutter: racks, skull poles and bones; webs in the Silk Pens; stalagmites everywhere
    const avoid = [...LINKS.filter((k) => k.floor === f.id).map((k) => [k.x, k.y]), ...BRAZIERS.map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]), [(DEN.x + 0.5) * TILE, (DEN.y + 0.5) * TILE]];
    const placed: number[][] = [];
    f.chambers.forEach((c, ci) => {
      const n = Math.round(3 + c.rx * c.ry / 9);
      for (let k = 0; k < n; k++) {
        const a = hash(f.id * 31 + ci, k, 11) * Math.PI * 2, r = 0.35 + 0.55 * Math.sqrt(hash(f.id * 31 + ci, k, 12));
        const tx = Math.floor(f.x + c.x + Math.cos(a) * c.rx * r), ty = Math.floor(f.y + c.y + Math.sin(a) * c.ry * r);
        if (!open(tx, ty)) continue;
        const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
        if (placed.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 1.8 * TILE)) continue;
        placed.push([x, y]);
        if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < (f.id === 3 && Math.hypot((DEN.x + 0.5) * TILE - x, (DEN.y + 0.5) * TILE - y) < 7 * TILE ? 3.2 : 1.6) * TILE)) continue;
        // props that stand up go by the walls; flat clutter anywhere
        let byWall = false;
        for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!open(tx + i, ty + j)) byWall = true;
        const roll = hash(f.id * 31 + ci, k, 13), v = Math.floor(hash(tx, ty, 14) * 3);
        if (f.id === 2 && roll < 0.35) s.add.image(x, y, "dg_web", v).setScale(1 / TX).setDepth(DECAL);
        else if (roll < 0.55) s.add.image(x, y, "dg_bones", v).setScale(1 / TX).setDepth(DECAL);
        else if (byWall && roll < 0.75) s.add.image(x, y, "dg_rack", v).setOrigin(0.5, 1).setScale(1 / TX).setDepth(y).setFlipX(hash(tx, ty, 15) < 0.5);
        else if (roll < 0.88) s.add.image(x, y, "dg_pole", v).setOrigin(0.5, 1).setScale(1 / TX).setDepth(y);
        else s.add.image(x, y, "dg_spike", v).setOrigin(0.5, 1).setScale(1 / TX).setDepth(y);
      }
    });
    // Stalagmites along the tunnels
    for (let k = 0; k < f.w * f.h / 60; k++) {
      const tx = f.x + Math.floor(hash(f.id, k, 21) * f.w), ty = f.y + Math.floor(hash(f.id, k, 22) * f.h);
      if (!open(tx, ty) || open(tx + 1, ty) && open(tx - 1, ty) && open(tx, ty + 1) && open(tx, ty - 1)) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 2 * TILE)) continue;
      s.add.image(x, y, "dg_spike", k % 3).setOrigin(0.5, 1).setScale(1 / TX).setDepth(y);
    }
  }

  /**
   * The deep dungeons' furnishing: in the Lantern Crypt sarcophagi along the walls, skull stacks, candles left burning
   * by the monks (each a small light) and bones; in the Undercity broken pillars, water jars and drifts of sand blown
   * down the shafts. Then stalagmites in the tunnels like the Mawdeep.
   */
  private deepProps(f: Floor, open: (x: number, y: number) => boolean) {
    const s = this.scene, crypt = f.dungeon === "crypt";
    const avoid = [...LINKS.filter((k) => k.floor === f.id).map((k) => [k.x, k.y, 2.6]), ...BRAZIERS.map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE, 1.6]),
      ...CHESTS.map((c) => [c.x, c.y, 2]), ...DOORS.filter((d) => d.floor === f.id).map((d) => [d.x * TILE, d.y * TILE, 3.2])];
    const placed: number[][] = [];
    f.chambers.forEach((c, ci) => {
      const boss = c.rx >= 9; // the boss halls: clutter round the rim only
      const n = Math.round(4 + c.rx * c.ry / 7);
      for (let k = 0; k < n * 3 && placed.length < 999; k++) {
        const a = hash(f.id * 31 + ci, k, 41) * Math.PI * 2, r = (boss ? 0.7 : 0.3) + (boss ? 0.25 : 0.6) * Math.sqrt(hash(f.id * 31 + ci, k, 42));
        const tx = Math.floor(f.x + c.x + Math.cos(a) * c.rx * r), ty = Math.floor(f.y + c.y + Math.sin(a) * c.ry * r);
        if (!open(tx, ty)) continue;
        const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
        if (placed.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 1.9 * TILE)) continue;
        if (avoid.some(([ax, ay, ar]) => Math.hypot(ax - x, ay - y) < ar * TILE)) continue;
        let byWall = false;
        for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!open(tx + i, ty + j)) byWall = true;
        const standOk = open(tx + 1, ty + 1) && open(tx + 1, ty) && open(tx, ty + 1);
        const roll = hash(f.id * 31 + ci, k, 43), v = Math.floor(hash(tx, ty, 44) * 2), flip = hash(tx, ty, 45) < 0.5;
        placed.push([x, y]);
        if (crypt) {
          if (byWall && standOk && roll < 0.3) s.add.image(x, y, "dp_sarc", v).setOrigin(0.5, 0.72).setScale(1 / TX).setDepth(y).setFlipX(flip);
          else if (byWall && roll < 0.45) s.add.image(x, y, "dp_skulls").setOrigin(0.5, 0.92).setScale(1 / TX).setDepth(y);
          else if (roll < 0.62) {
            s.add.sprite(x, y, "dp_candles", 0).setOrigin(0.5, 0.85).setScale(1 / TX).setDepth(y).play({ key: "dp_candles_burn", startFrame: k % 4 });
            const glow = s.add.image(x, y - 12, "light").setTint(0xffb860).setScale(1.4).setAlpha(0.32).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
            isoAnchor(glow, { x, y });
            this.lights.push({ x, y, r: 2.2 * TILE, flicker: 0.1, seed: tx * 13 + ty });
          } else if (roll < 0.85) s.add.image(x, y, "dg_bones", Math.floor(hash(tx, ty, 46) * 3)).setScale(1 / TX).setDepth(DECAL);
          else placed.pop();
        } else {
          if (byWall && standOk && roll < 0.3) s.add.image(x, y, "dp_pillar", v).setOrigin(0.5, 0.88).setScale(1 / TX).setDepth(y).setFlipX(flip);
          else if (roll < 0.5) s.add.image(x, y, "dp_jar", v).setOrigin(0.5, 0.9).setScale(1 / TX).setDepth(y).setFlipX(flip);
          else if (roll < 0.72) s.add.image(x, y, "dp_drift").setScale(1 / TX).setDepth(DECAL).setFlipX(flip);
          else if (roll < 0.86) s.add.image(x, y, "dg_bones", Math.floor(hash(tx, ty, 46) * 3)).setScale(1 / TX).setDepth(DECAL);
          else placed.pop();
        }
      }
    });
    for (let k = 0; k < f.w * f.h / 70; k++) { // stalagmites along the tunnels
      const tx = f.x + Math.floor(hash(f.id, k, 21) * f.w), ty = f.y + Math.floor(hash(f.id, k, 22) * f.h);
      if (!open(tx, ty) || open(tx + 1, ty) && open(tx - 1, ty) && open(tx, ty + 1) && open(tx, ty - 1)) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 2 * TILE)) continue;
      s.add.image(x, y, "dg_spike", k % 3).setOrigin(0.5, 1).setScale(1 / TX).setDepth(y).setTint(WALL_TINT[f.dungeon]);
    }
  }

  /** The grim story of each chamber (STORY): cages, hooks, frames, slabs, blood and remains, and the drag smears between them. */
  private story(f: Floor, open: (x: number, y: number) => boolean) {
    const st = STORY[f.id];
    if (!st) return;
    const s = this.scene, T = TILE;
    const keep = [...LINKS.filter((k) => k.floor === f.id).map((k) => [k.x, k.y, 2.4]), ...BRAZIERS.map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T, 1.6]),
      ...CHESTS.map((c) => [c.x, c.y, 2]), ...[...COCOONS, ...TOTEMS].map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T, 2]),
      ...DOORS.filter((d) => d.floor === f.id).map((d) => [d.x * T, d.y * T, 3.2]), [(DEN.x + 0.5) * T, (DEN.y + 0.5) * T, 4.5]];
    const placed: [number, number, number][] = [];
    for (const [ci, role] of Object.entries(st.rooms)) {
      const c = f.chambers[Number(ci)], cx = f.x + c.x, cy = f.y + c.y;
      RECIPES[role].forEach(([key, frames, n, standing], ri) => {
        for (let k = 0, got = 0; k < n * 12 && got < n; k++) {
          const sd = f.id * 977 + Number(ci) * 131 + ri * 17;
          const a = hash(sd, k, 61) * Math.PI * 2;
          const r = standing ? 0.45 + 0.35 * hash(sd, k, 62) : role === "den" && key === "dg_pike" ? 0.42 : 0.15 + 0.6 * Math.sqrt(hash(sd, k, 62));
          const tx = Math.floor(cx + Math.cos(a) * c.rx * r), ty = Math.floor(cy + Math.sin(a) * c.ry * r);
          if (!open(tx, ty) || (standing && !open(tx + 1, ty + 1))) continue;
          const x = (tx + 0.5) * T, y = (ty + 0.5) * T, gap = standing ? 1.9 : 1.3;
          if (keep.some(([kx, ky, kr]) => Math.hypot(kx - x, ky - y) < kr * T && !(role === "den" && key === "dg_pike" && kr === 4.5))) continue;
          if (placed.some(([px, py, pg]) => Math.hypot(px - x, py - y) < Math.max(gap, pg) * T)) continue;
          placed.push([x, y, gap]);
          got++;
          const fr = frames[Math.floor(hash(tx, ty, 63) * frames.length)], flip = hash(tx, ty, 64) < 0.5;
          if (!standing && key !== "dg_block" && key !== "dg_slab") s.add.image(x, y, key, fr).setScale(1 / TX).setDepth(DECAL).setFlipX(flip);
          else s.add.image(x, y, key, fr).setOrigin(0.5, ORIGIN[key] ?? 0.92).setScale(1 / TX).setDepth(y).setFlipX(flip);
        }
      });
    }
    // Drag smears along the tunnels the victims were hauled through (same curve as map.ts carveFloor)
    for (const [a, b] of st.drags) {
      const tun = f.tunnels.find(([p, q]) => (p === a && q === b) || (p === b && q === a));
      if (!tun) continue;
      const [p, q, bend] = tun, A = f.chambers[p], B = f.chambers[q];
      const ax = f.x + A.x, ay = f.y + A.y, bx = f.x + B.x, by = f.y + B.y;
      const mx = (ax + bx) / 2 - (by - ay) * bend * 0.12, my = (ay + by) / 2 + (bx - ax) * bend * 0.12;
      const at = (t: number) => { const u = 1 - t; return [u * u * ax + 2 * u * t * mx + t * t * bx, u * u * ay + 2 * u * t * my + t * t * by]; };
      const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len / 1.3);
      for (let k = 1; k < steps; k++) {
        let t = k / steps;
        if (p !== a) t = 1 - t; // from a towards b
        if (hash(f.id * 7 + a, k, 71) < 0.22) continue; // gaps where it dried or was trodden out
        const [px, py] = at(t), [qx, qy] = at(Math.min(1, Math.max(0, t + (p === a ? 0.01 : -0.01))));
        const jx = (hash(a, k, 72) - 0.5) * 0.6, jy = (hash(b, k, 73) - 0.5) * 0.6;
        const tx = Math.floor(px + jx), ty = Math.floor(py + jy);
        if (!open(tx, ty)) continue;
        const dx = qx - px, dy = qy - py;
        let ang = ISO ? Math.atan2((dx + dy) / 2, dx - dy) : Math.atan2(dy, dx);
        const back = ang < 0 || ang >= Math.PI; // the art points one way: turn it half round for the other
        if (ang < 0) ang += Math.PI; if (ang >= Math.PI) ang -= Math.PI;
        const fr = Math.round(ang / (Math.PI / 4)) % 4;
        const img = s.add.image((px + jx) * T, (py + jy) * T, "dg_drag", fr).setScale(1 / TX).setDepth(DECAL);
        if (back) img.setFlipX(true).setFlipY(true); // half a turn
        if (hash(a, k, 74) < 0.18) s.add.image((px - jx) * T, (py - jy) * T, "dg_blood", 3).setScale(0.5 / TX).setDepth(DECAL);
      }
    }
  }

  /** Minimap markers for the ways down and up (Murat 2026-11-07: show the stairs on the map). */
  markers(): MapMarker[] {
    return LINKS.map((l) => ({ x: l.x, y: l.y, glyph: "", color: l.down ? "#ffb347" : "#c8d8e8", label: l.label, stair: l.down ? "down" as const : "up" as const, fogged: l.floor === 0 }));
  }

  /** The server's open gates changed: open/shut them here too (collisions, click-to-walk paths, the barricades). */
  setDoors(raw: string) {
    if (raw === this.doorsRaw) return;
    this.doorsRaw = raw;
    const now = new Set(raw ? raw.split(",") : []);
    for (const d of DOORS) {
      const open = now.has(d.id);
      if (open === this.doorsOpen.has(d.id)) continue;
      setDoorOpen(d.id, open);
      refreshWalk(d.gate);
      const spr = this.gates.get(d.id);
      if (spr) { // the portcullis winds up into the lintel, or drops back down
        if (open) spr.play(`dg_gate_${d.id}_open`); else spr.playReverse(`dg_gate_${d.id}_open`);
      }
      if (this.floor === d.floor) play("gate", d.x * TILE, d.y * TILE, 1, !open);
    }
    this.doorsOpen = now;
  }

  /** Builds the floor the hero is on, moves the darkness and its lights with the camera, labels nearby links. */
  update(now: number) {
    const me = this.host.me();
    const fl = me ? floorNo(me.x, me.y) : 0;
    this.floor = fl;
    this.underground = fl > 0;
    if (fl) this.build(floorById(fl)!);
    // fade the dark in / out over a few frames (a cut through the fade-in after a descent)
    const want = fl ? 1 : this.torch ? this.night * 0.6 : 0;
    this.amount += (want - this.amount) * (fl ? 0.25 : 0.08);
    if (this.amount < 0.01 && !want) { this.amount = 0; this.dark?.setVisible(false); }
    else this.drawDark(now);
    // the label over a rope or stair within reach
    const l = me && LINKS.find((k) => Math.hypot(k.x - me.x, k.y - me.y) < 3 * TILE);
    // a gate in reach (a broken wall stays broken; a shortcut's gate only answers from its own side)
    const near = fl && me ? DOORS.find((d) => d.floor === fl && doorDist(d, me.x, me.y) <= DOOR_RANGE && !(d.kind === "crack" && this.doorsOpen.has(d.id)) && (doorWorkable(d, me.x, me.y) || !this.doorsOpen.has(d.id))) : undefined;
    this.nearDoor = near && me && doorWorkable(near, me.x, me.y) ? near : undefined;
    if (near && this.label && me) {
      const d = near, text = d.kind === "crack" ? "E: Break through the cracked wall" : !doorWorkable(d, me.x, me.y) ? "Barred from the other side" : this.doorsOpen.has(d.id) ? "E: Shut the gate" : "E: Open the gate";
      if (this.label.text !== text) this.label.setText(text);
      const x = d.x * TILE, y = d.y * TILE;
      this.label.setPosition(x, y - GATE_FRAME_H - 12).setVisible(true);
      isoAnchor(this.label, { x, y });
    } else if (l && this.label) {
      if (this.label.text !== l.label) this.label.setText(l.label);
      this.label.setPosition(l.x, l.y - (l.rope ? 40 : l.down ? 10 : 60)).setVisible(true);
      isoAnchor(this.label, { x: l.x, y: l.y });
    } else this.label?.setVisible(false);
  }

  private drawDark(now: number) {
    const cam = this.scene.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const cw = vw * 1.5, ch = vh * 1.5, DH = Math.round(DW * ch / cw);
    if (!this.darkTex || this.darkTex.height !== DH) {
      if (this.dark) { this.dark.destroy(); this.scene.textures.remove("dg_dark"); }
      this.darkTex = this.scene.textures.createCanvas("dg_dark", DW, DH)!;
      this.darkTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.dark = this.scene.add.image(0, 0, "dg_dark").setDepth(DARK_DEPTH).setOrigin(0.5, 0.5);
      if (ISO) isoScreen(this.dark);
    }
    // centre on the hero (screen space) so the camera's lag never shows an edge
    const me = this.host.me();
    const mx = cam.midPoint.x, my = cam.midPoint.y;
    const P = (x: number, y: number) => (ISO ? { x: isoX(x, y), y: isoY(x, y) } : { x, y });
    const c = me ? P(me.x, me.y) : { x: mx, y: my };
    this.dark!.setPosition(c.x, c.y).setDisplaySize(cw, ch).setVisible(true).setAlpha(this.amount);
    const ctx = this.darkTex.getContext(), k = DW / cw;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, DW, DH);
    ctx.fillStyle = this.floor ? "rgba(4,3,6,0.95)" : "rgba(3,5,14,0.9)"; // the night is a cold blue-black
    ctx.fillRect(0, 0, DW, DH);
    ctx.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number, a: number) => {
      const p = P(x, y), sx = (p.x - c.x) * k + DW / 2, sy = (p.y - c.y) * k + DH / 2, sr = r * k * (ISO ? 1.25 : 1);
      if (sx < -sr || sy < -sr || sx > DW + sr || sy > DH + sr) return;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.45, `rgba(0,0,0,${a * 0.8})`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, ISO ? 0.62 : 1); ctx.translate(-sx, -sy);
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    if (this.floor) for (const l of this.lights) {
      const f = l.flicker ? 1 + (Math.sin(now / 90 + l.seed) * 0.5 + Math.sin(now / 37 + l.seed * 3) * 0.5) * l.flicker : 1;
      hole(l.x, l.y, l.r * f, 0.92);
    }
    const tf = 1 + (Math.sin(now / 70) * 0.5 + Math.sin(now / 23 + 1.3) * 0.3) * 0.05; // a flame's flicker
    this.host.eachHero((hx, hy) => {
      const mine = !!me && hx === me.x && hy === me.y;
      hole(hx, hy - 8, (mine ? (this.torch ? 8.5 * tf : 5.2) : 3.6) * TILE, mine && this.torch ? 0.97 : 0.88);
    });
    this.darkTex.refresh();
  }
}

/** True if a point (px) is in the underground band (no overworld weather, sounds…). */
export const belowGround = (y: number) => y >= WORLD_H * TILE;
