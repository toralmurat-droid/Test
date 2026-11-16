import type Phaser from "phaser";
import type { ClanKey } from "../../shared/war/clans";
import { fortOf } from "../../shared/war/holdWalls";
import type { HoldTier } from "../../shared/war/holdTiers";
import { CLANS } from "../../shared/war/clans";
import { TILE } from "../../shared/constants";
import { atlasFile, type AtlasMeta, fortLayout, groundPlan } from "./holdArt";
import { isoAnchor } from "./iso";

/**
 * Clan Holds at run time. The pieces and ground tiles are baked at art time (tools/art/holds.ts, `npm run art`) into one
 * atlas per clan (PNG + JSON), loaded lazily when a Hold of that clan is near. Nothing is painted in the browser: a Hold
 * is built from the fort's cells (shared/war/holdWalls.ts fortOf) in one go, one image per cell sorted by the depth of its
 * foot with heroes, and the ground tiles blitted into one canvas under them. Texels are 1.5 per world px, as all world art.
 */
export const HOLD_SCALE = 1 / 1.5;
/** How near (px) the hero must be before a Hold is drawn; one farther than HOLD_KEEP is dropped again. */
export const HOLD_RANGE = 1100, HOLD_KEEP = 1500;
export const atlasKey = (k: ClanKey) => `holdatlas_${k}`;

const meta = new Map<ClanKey, AtlasMeta>(), asked = new Set<ClanKey>();
/** True when the clan's atlas is loaded; otherwise starts loading it (once; retried after a failure) and returns false. `done` runs when it arrives. */
export function ensureHold(scene: Phaser.Scene, k: ClanKey, done?: () => void): boolean {
  if (meta.has(k) && scene.textures.exists(atlasKey(k))) return true;
  if (asked.has(k)) return false;
  asked.add(k);
  const key = atlasKey(k), jkey = `${key}_json`;
  let left = 2, bad = false;
  const fin = () => {
    if (--left) return;
    if (bad) { window.setTimeout(() => asked.delete(k), 15000); return; } // try again later, never throw
    const m = scene.cache.json.get(jkey) as AtlasMeta, tex = scene.textures.get(key);
    for (const [name, f] of Object.entries(m.frames)) tex.add(name, 0, f.x, f.y, f.w, f.h);
    tex.setFilter(1); // NEAREST: hard pixels like other painted props
    meta.set(k, m);
    done?.();
  };
  for (const kk of [key, jkey]) {
    const err = (f: { key?: string }) => { if (f?.key === kk) { scene.load.off("loaderror", err); bad = true; fin(); } };
    scene.load.on("loaderror", err);
    scene.load.once(`filecomplete-${kk === key ? "image" : "json"}-${kk}`, () => { scene.load.off("loaderror", err); fin(); });
  }
  scene.load.image(key, `assets/holds/${atlasFile(k, "png")}`);
  scene.load.json(jkey, `assets/holds/${atlasFile(k, "json")}`);
  if (!scene.load.isLoading()) scene.load.start();
  return false;
}

/** One Hold on screen: ground and standing pieces of the clan's fort at that land. Needs ensureHold(clan) to be true. */
export class HoldDraw {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private gkey = "";
  constructor(private scene: Phaser.Scene, readonly t: number, readonly clan: ClanKey, readonly tier: HoldTier = 1) {
    const f = fortOf(t, clan, tier), m = meta.get(clan);
    if (!f || !m) return;
    const akey = atlasKey(clan), src = scene.textures.get(akey).getSourceImage() as CanvasImageSource;
    const plan = groundPlan(f), cv = document.createElement("canvas");
    cv.width = plan.w; cv.height = plan.h;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    for (const tl of plan.tiles) { const fr = m.frames[tl.key]; if (fr) g.drawImage(src, fr.x, fr.y, fr.w, fr.h, tl.x, tl.y, fr.w, fr.h); }
    this.gkey = `holdg_${t}_${clan}_${tier}`;
    if (scene.textures.exists(this.gkey)) scene.textures.remove(this.gkey);
    scene.textures.addCanvas(this.gkey, cv)?.setFilter(1);
    const cx = (f.cx + 0.5) * TILE, cy = (f.cy + 0.5) * TILE;
    const place = (img: Phaser.GameObjects.Image, x: number, y: number, depth: number) => {
      img.setScale(HOLD_SCALE).setDepth(depth);
      this.objs.push(isoAnchor(img, { x, y }));
    };
    // the trampled ground lies under everything (heroes walk the compound); the pieces sort by their feet
    place(scene.add.image(cx, cy, this.gkey).setOrigin(plan.ox / plan.w, plan.oy / plan.h), cx, cy, -0.5);
    for (const i of fortLayout(f)) {
      const fr = m.frames[i.key];
      const x = cx + i.dx * TILE, y = cy + i.dy * TILE;
      if (!fr) { // not in the atlas (a tier's art not baked yet): a flat block on that cell, so a solid cell is never bare
        const g = scene.add.graphics().setDepth(-0.4);
        g.fillStyle(CLANS[clan].trim, 0.9).fillRect(x - TILE / 2 + 1, y - TILE / 2 + 1, TILE - 2, TILE - 2);
        this.objs.push(g);
        continue;
      }
      place(scene.add.image(x, y, akey, i.key).setOrigin(fr.ox / fr.w, fr.oy / fr.h), x, y, y + i.foot);
    }
  }
  destroy() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.gkey && this.scene.textures.exists(this.gkey)) this.scene.textures.remove(this.gkey);
  }
}
