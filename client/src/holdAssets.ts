import type Phaser from "phaser";
import type { ClanKey } from "../../shared/war/clans";

/**
 * The clan Holds as baked PNG layers (tools/art/holds.ts, `npm run art`; painted by holdArt.ts at art time only).
 * Each clan has a ground layer (drawn under heroes) and a standing layer (sorted by the Hold's foot). They load
 * lazily, one clan at a time, when a Hold of that clan is near the hero, so login never waits on them.
 */
export const HOLD_W = 680, HOLD_H = 500, HOLD_OX = 340, HOLD_OY = 330;
/** Origin of both images (the compound's middle, on the ground): place at the Hold's tile. */
export const HOLD_ORIGIN = { x: HOLD_OX / HOLD_W, y: HOLD_OY / HOLD_H };
/** Scale to draw a texture at (texels back to world px: 1.5 texels per px). */
export const HOLD_SCALE = 1 / 1.5;
/** How near (px) the hero must be before a Hold's layers are asked for (the Hold is ~230 px wide, the view up to ~700). */
export const HOLD_RANGE = 1100;

export const holdFile = (k: ClanKey, layer: "ground" | "stand") => `${layer === "ground" ? "holdg" : "holds"}_${k}.png`;
/** Texture keys of a Hold: `holdg_<k>` (ground, under heroes) and `holds_<k>` (standing parts, sorted by the foot). */
export const holdKeys = (k: ClanKey) => ({ ground: `holdg_${k}`, stand: `holds_${k}` });

const asked = new Set<ClanKey>();
/** True when both layers of the clan's Hold are loaded; otherwise starts loading them (once; retried after a failure) and returns false. */
export function ensureHold(scene: Phaser.Scene, k: ClanKey, done?: () => void): boolean {
  const keys = holdKeys(k);
  if (scene.textures.exists(keys.stand) && scene.textures.exists(keys.ground)) return true;
  if (asked.has(k)) return false;
  asked.add(k);
  let left = 2, bad = false;
  const fin = () => {
    if (--left) return;
    if (bad) { window.setTimeout(() => asked.delete(k), 15000); return; } // try again later, never throw
    for (const key of [keys.ground, keys.stand]) scene.textures.get(key).setFilter(1); // NEAREST: hard pixels like other painted props
    done?.();
  };
  for (const [key, layer] of [[keys.ground, "ground"], [keys.stand, "stand"]] as const) {
    const err = (f: { key?: string }) => { if (f?.key === key) { scene.load.off("loaderror", err); bad = true; fin(); } };
    scene.load.on("loaderror", err);
    scene.load.once(`filecomplete-image-${key}`, () => { scene.load.off("loaderror", err); fin(); });
    scene.load.image(key, `assets/holds/${holdFile(k, layer)}`);
  }
  if (!scene.load.isLoading()) scene.load.start();
  return false;
}
