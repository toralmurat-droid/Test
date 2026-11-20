import type Phaser from "phaser";

/**
 * Trees, bushes and grass tufts baked from 3D models (tools/art/paint/trees3d.ts, `npx tsx tools/art/bake-trees.ts`)
 * into client/public/assets/hd/trees/<key>.png. Each sheet has WIND_FRAMES poses, from a slight lean upwind (frame 0)
 * to a full lean downwind (last frame): the sway in ambient.ts only picks a frame per tree from a travelling gust,
 * so wind costs no painting at all. Missing sheets fall back to the painted trees.
 */
export const WIND_FRAMES = 6;

/** key -> [frame w, frame h, feet x, feet y] (world px). Keep in step with TREES3D in tools/art/paint/trees3d.ts. */
export const TREE3D: Record<string, [number, number, number, number]> = {
  tr3_oak_a: [72, 90, 36, 82], tr3_oak_b: [72, 90, 36, 82], tr3_oak_c: [80, 90, 40, 82], tr3_oak_d: [72, 90, 36, 82],
  tr3_oak_e: [56, 90, 28, 82], tr3_oak_g: [76, 92, 38, 84], tr3_oak_h: [64, 84, 32, 76], tr3_oak_f: [72, 84, 36, 76],
  tr3_pine: [48, 96, 24, 88], tr3_pine_b: [44, 100, 22, 92],
  tr3_bush: [40, 34, 20, 28], tr3_bush_b: [44, 34, 22, 28],
  tr3_grass_a: [28, 26, 14, 22], tr3_grass_b: [28, 28, 14, 24], tr3_grass_c: [28, 24, 14, 20],
  tr3_palm_a: [76, 100, 38, 92], tr3_palm_b: [76, 104, 38, 96], tr3_palm_c: [76, 92, 38, 84],
  tr3_willow_a: [84, 76, 42, 68], tr3_willow_b: [84, 76, 42, 68], tr3_fern_a: [40, 30, 20, 24], tr3_fern_b: [44, 30, 22, 24],
  tr3_gorse_a: [40, 30, 20, 25], tr3_gorse_b: [44, 30, 22, 25], tr3_scrub_a: [40, 30, 20, 25], tr3_scrub_b: [40, 30, 20, 25],
  tr3_deadbirch: [60, 84, 30, 76], tr3_snag: [64, 72, 32, 64], tr3_deadtree: [64, 72, 32, 64],
};

export function preloadTrees3d(scene: Phaser.Scene) {
  for (const [k, [w, h]] of Object.entries(TREE3D)) if (!scene.textures.exists(k)) scene.load.spritesheet(k, `assets/hd/trees/${k}.png`, { frameWidth: w, frameHeight: h });
}
/** The baked sheet is there (loaded and not a fallback). */
export const hasTree3d = (scene: Phaser.Scene, key: string) => scene.textures.exists(key) && scene.textures.get(key).frameTotal > WIND_FRAMES;
/** Origin (0..1) that puts a baked tree's trunk base on its position. */
export const tree3dOrigin = (key: string) => { const [w, h, ox, oy] = TREE3D[key]; return { x: ox / w, y: oy / h }; };
/** Baked trees placed outside ambient.ts (iso.ts: the far lands' dead trees) while they are near the view: ambient.ts sways them too. */
export const WIND_LIVE = new Set<Phaser.GameObjects.Image>();
