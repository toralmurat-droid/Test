import type Phaser from "phaser";
import type { ClanKey } from "../../shared/war/clans";
import { fortOf } from "../../shared/war/holdWalls";
import { TILE } from "../../shared/constants";
import { composeGround, fortLayout, paintPiece, type Painted } from "./holdArt";
import { isoAnchor } from "./iso";

/**
 * Clan Holds at run time, built from the fort cells (shared/war/holdWalls.ts fortOf): the pieces of holdArt.ts are
 * painted once per look, turned into textures and shared by every Hold; each cell gets one image, sorted by the depth of
 * its foot with heroes, and the compound's ground is one image per Hold under everything. Painting is cut into slices
 * (a few ms per frame) so walking up to a Hold never stalls. Texels are 1.5 per world px, as all world art.
 */
export const HOLD_SCALE = 1 / 1.5;
/** How near (px) the hero must be before a Hold is drawn; one farther than HOLD_KEEP is dropped again. */
export const HOLD_RANGE = 1100, HOLD_KEEP = 1500;

const toTexture = (scene: Phaser.Scene, key: string, p: Painted) => {
  if (scene.textures.exists(key)) return;
  const c = document.createElement("canvas");
  c.width = p.w; c.height = p.h;
  const g = c.getContext("2d")!;
  g.putImageData(new ImageData(p.data, p.w, p.h), 0, 0);
  scene.textures.addCanvas(key, c)?.setFilter(1); // NEAREST: hard pixels like other painted props
};

const queue: (() => void)[] = [];
let pumping = false;
/** Runs queued paint jobs for about 8 ms per slice. */
function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 8) queue.shift()!();
  if (queue.length) window.setTimeout(pump, 0); else pumping = false;
}
const later = (job: () => void) => { queue.push(job); if (!pumping) { pumping = true; window.setTimeout(pump, 0); } };

/** Origin of each piece texture, as a fraction: x is always the middle, y the ground line (the cell's middle). */
const originY = new Map<string, number>();
const pieceTex = (scene: Phaser.Scene, key: string, spec: Parameters<typeof paintPiece>[0]) => {
  if (scene.textures.exists(key)) return;
  const p = paintPiece(spec);
  originY.set(key, p.oy / p.h);
  toTexture(scene, key, p);
};

/** One Hold on screen: ground and standing pieces of the clan's fort at that land. */
export class HoldDraw {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private gkey = "";
  private dead = false;
  constructor(private scene: Phaser.Scene, readonly t: number, readonly clan: ClanKey, onReady?: () => void) {
    const f = fortOf(t, clan);
    if (!f) return;
    const insts = fortLayout(f), specs = new Map(insts.map((i) => [i.key, i.spec]));
    const need = [...specs].filter(([k]) => !scene.textures.exists(k));
    for (const [k, spec] of need) later(() => { if (!this.dead) pieceTex(scene, k, spec); });
    later(() => {
      if (this.dead) return;
      const ground = composeGround(f);
      this.gkey = `holdg_${t}_${clan}`;
      toTexture(scene, this.gkey, ground);
      const cx = (f.cx + 0.5) * TILE, cy = (f.cy + 0.5) * TILE;
      const place = (img: Phaser.GameObjects.Image, x: number, y: number, depth: number) => {
        img.setScale(HOLD_SCALE).setDepth(depth);
        this.objs.push(isoAnchor(img, { x, y }));
      };
      // the trampled ground lies under everything (heroes walk the compound); the pieces sort by their feet
      place(scene.add.image(cx, cy, this.gkey).setOrigin(ground.ox / ground.w, ground.oy / ground.h), cx, cy, -0.5);
      for (const i of insts) {
        const x = cx + i.dx * TILE, y = cy + i.dy * TILE;
        place(scene.add.image(x, y, i.key).setOrigin(0.5, originY.get(i.key) ?? 0.5), x, y, y + i.foot);
      }
      onReady?.();
    });
  }
  destroy() {
    this.dead = true;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.gkey && this.scene.textures.exists(this.gkey)) this.scene.textures.remove(this.gkey);
  }
}
