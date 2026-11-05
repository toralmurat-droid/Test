import Phaser from "phaser";
import { TILE, WORLD_H } from "../../shared/constants";
import { isSolidTile } from "../../shared/map";
import { BRAZIERS, DEN, Floor, FLOORS, floorNo, LINKS, SINKHOLE } from "../../shared/dungeon";
import { ISO, isoAnchor, isoScreen, isoX, isoY } from "./iso";
import { BLOCK_TOP, BRAZIER, dungeonTextures, ROPE_ART, TX, WALL_LOW, WALL_TALL, wallTexture } from "./dungeonArt";

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
  /** Every hero's feet in view (they carry a light). */
  heroes(): { x: number; y: number }[];
}

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
  floor = 0;

  constructor(private scene: Phaser.Scene, private host: DungeonHost, private font: string) {
    dungeonTextures(scene);
    this.surface();
    this.label = scene.add.text(0, 0, "", { fontFamily: font, fontSize: "16px", color: "#e8d7a8", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(30000).setVisible(false);
  }

  /** The sinkhole's mouth in the woods, with the rope staked at its lip. */
  private surface() {
    const s = this.scene, x = (SINKHOLE.x + 0.5) * TILE, y = (SINKHOLE.y + 0.5) * TILE;
    s.add.image(x, y, "dg_sinkhole").setScale(1 / TX).setDepth(DECAL);
    const stake = { x: x - 1.3 * TILE, y: y - 0.6 * TILE };
    s.add.image(stake.x, stake.y, "dg_stake").setOrigin(0.3, 1).setScale(1 / TX).setDepth(stake.y);
  }

  /** Walls, links and props of one floor. */
  private build(f: Floor) {
    if (this.built.has(f.id)) return;
    this.built.add(f.id);
    const s = this.scene;
    const open = (x: number, y: number) => x > f.x && y > f.y && x < f.x + f.w - 1 && y < f.y + f.h - 1 && !isSolidTile(x, y);
    // Cave walls: every rock tile next to the floor is a block, tall unless the floor lies behind it on screen
    // (then low, so nothing on the floor is ever hidden).
    if (ISO) for (let ty = f.y; ty < f.y + f.h; ty++) for (let tx = f.x; tx < f.x + f.w; tx++) {
      if (open(tx, ty)) continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if (open(tx + i, ty + j)) { near = true; break; }
      if (!near) continue;
      const tall = !(open(tx - 1, ty) || open(tx, ty - 1) || open(tx - 1, ty - 1)); // low only where it would hide the floor behind it
      const h = tall ? WALL_TALL : WALL_LOW, key = wallTexture(s, h, Math.floor(hash(tx, ty, 5) * 6));
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      const img = s.add.image(cx, cy, key).setScale(1 / TX).setDepth(cy);
      img.setOrigin(0.5, (BLOCK_TOP / 2 + h * TX) / (BLOCK_TOP + h * TX));
    }
    // Ropes and stairs
    for (const l of LINKS.filter((k) => k.floor === f.id)) {
      if (l.id === "f1up") {
        s.add.sprite(l.x, l.y, "dg_rope", 0).setOrigin(0.5, 1 - 6 / ROPE_ART.h).setScale(1 / TX).setDepth(l.y).play("dg_rope_sway");
        // daylight falling from the sinkhole far above
        const beam = s.add.image(l.x, l.y + 4, "dg_beam").setOrigin(0.5, 1).setScale(2.2, 1.6).setTint(0xcfd8c8).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
        isoAnchor(beam, { x: l.x, y: l.y });
        this.lights.push({ x: l.x, y: l.y, r: 3.2 * TILE, flicker: 0, seed: 1 });
      } else if (l.down) {
        s.add.image(l.x, l.y, "dg_pit").setScale(1 / TX).setDepth(DECAL);
      } else {
        s.add.image(l.x - 0.4 * TILE, l.y - 0.4 * TILE, "dg_stair_up").setOrigin(0.5, 0.94).setScale(1 / TX).setDepth(l.y - 0.4 * TILE);
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

  /** Builds the floor the hero is on, moves the darkness and its lights with the camera, labels nearby links. */
  update(now: number) {
    const me = this.host.me();
    const fl = me ? floorNo(me.x, me.y) : 0;
    this.floor = fl;
    this.underground = fl > 0;
    if (fl) this.build(FLOORS[fl - 1]);
    // fade the dark in / out over a few frames (a cut through the fade-in after a descent)
    this.amount += ((fl ? 1 : 0) - this.amount) * 0.25;
    if (this.amount < 0.01 && !fl) { this.amount = 0; this.dark?.setVisible(false); }
    else this.drawDark(now);
    // the label over a rope or stair within reach
    const l = me && LINKS.find((k) => Math.hypot(k.x - me.x, k.y - me.y) < 3 * TILE);
    if (l && this.label) {
      if (this.label.text !== l.label) this.label.setText(l.label);
      this.label.setPosition(l.x, l.y - (l.id === "f1up" ? 40 : l.down ? 10 : 60)).setVisible(true);
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
    ctx.fillStyle = "rgba(4,3,6,0.95)";
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
    for (const l of this.lights) {
      const f = l.flicker ? 1 + (Math.sin(now / 90 + l.seed) * 0.5 + Math.sin(now / 37 + l.seed * 3) * 0.5) * l.flicker : 1;
      hole(l.x, l.y, l.r * f, 0.92);
    }
    for (const h of this.host.heroes()) hole(h.x, h.y - 8, (me && h.x === me.x && h.y === me.y ? 5.2 : 3.6) * TILE, 0.88);
    this.darkTex.refresh();
  }
}

/** True if a point (px) is in the underground band (no overworld weather, sounds…). */
export const belowGround = (y: number) => y >= WORLD_H * TILE;
