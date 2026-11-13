import Phaser from "phaser";
import { CHAR_ORIGIN } from "./artAssets";
import { CONCEPT_ART, HIDE_FRAME, HideDir, hideboundPixels } from "./questConceptData";

/**
 * Textures and helpers for the quest-concept art (docs/quest-concepts-progress.md): grave, seal, ward-lamp, postern,
 * the carried lantern and the hide-bound hero overlay. Pixel data is in questConceptData.ts. Cosmetic only.
 */
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  paint(tex.getContext());
  tex.refresh();
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Makes every `qobj_*` concept texture (idempotent). Called by QuestObjects. */
export function conceptTextures(scene: Phaser.Scene) {
  for (const [key, { rows, pal }] of Object.entries(CONCEPT_ART)) {
    canvasTex(scene, key, Math.max(...rows.map((r) => r.length)), rows.length, (ctx) =>
      rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = pal[ch]; if (c !== undefined) { ctx.fillStyle = hex(c); ctx.fillRect(x, y, 1, 1); } })));
  }
}

// ---- lantern: ground look at a light level, and the small one carried over a hero's head
/** Warm flame colour of the Last Lantern's light. */
export const LAMP_COLOR = 0xffc060;
/** Dims a lantern sitting on the ground: `light` 0..1 (1 = bright, 0 = out). `glow` is an additive circle behind it, if any. */
export function setGroundLantern(img: Phaser.GameObjects.Image, light: number, glow?: Phaser.GameObjects.Arc) {
  const l = Math.max(0, Math.min(1, light));
  img.setTexture(l <= 0.03 ? "qobj_lamp_out" : "qobj_lamp");
  glow?.setVisible(l > 0.03).setAlpha(0.06 + 0.26 * l).setScale(0.55 + 0.45 * l);
}

/**
 * The lantern a hero carries: a small flame hovering by the hero's head with a soft glow that shrinks as `light` falls
 * (0 = out). Call `update` every frame with the hero's sprite (or any {x, y} feet position); `hide` when not carried.
 */
export class CarriedLantern {
  private img: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Arc;
  constructor(private scene: Phaser.Scene) {
    conceptTextures(scene);
    this.img = scene.add.image(0, 0, "qobj_lamp_small").setOrigin(0.5, 0.5).setScale(1.5).setVisible(false);
    this.glow = scene.add.circle(0, 0, 13, LAMP_COLOR, 0.25).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }
  update(hero: { x: number; y: number; depth?: number } | undefined, light: number) {
    if (!hero) return this.hide();
    const l = Math.max(0, Math.min(1, light)), t = this.scene.time.now;
    const x = hero.x + 11 + Math.sin(t / 420) * 0.6, y = hero.y - 30 + Math.sin(t / 310) * 1.2;
    const depth = (hero.depth ?? hero.y) + 2;
    const flicker = l > 0 ? 0.9 + 0.1 * Math.sin(t / 90 + hero.x) : 1;
    this.img.setTexture("qobj_lamp_small").setPosition(x, y).setDepth(depth).setVisible(true).setScale(1.5);
    if (l <= 0.03) this.img.setTint(0x3c3c44); else this.img.clearTint(); // burnt out: the same lamp, dark
    this.glow.setPosition(x, y).setDepth(depth - 1).setVisible(l > 0.03).setAlpha((0.05 + 0.25 * l) * flicker).setScale(0.45 + 0.55 * l);
  }
  hide() { this.img.setVisible(false); this.glow.setVisible(false); }
  destroy() { this.img.destroy(); this.glow.destroy(); }
}

// ---- hide-bound beast trait overlay
/** Texture key of the overlay for a class and facing; created on first use. */
export function hideboundKey(scene: Phaser.Scene, cls: string, dir: HideDir): string {
  const c = ["wizard", "vampire", "summoner"].includes(cls) ? cls : "wizard", key = `hidebound_${c}_${dir}`;
  canvasTex(scene, key, HIDE_FRAME, HIDE_FRAME, (ctx) => { for (const [x, y, col] of hideboundPixels(c, dir)) { ctx.fillStyle = hex(col); ctx.fillRect(x, y, 1, 1); } });
  return key;
}

/** Facing names of the sheets (down, up, right, downright, upright; left ones are flipX) to the overlay's three views. */
export function hideDirOf(dir: string): HideDir { return dir.includes("up") ? "up" : dir === "down" ? "down" : dir.startsWith("down") ? "side" : "side"; }

/**
 * Draws the hide-bound mantle over a hero sprite (same frame size, origin and scale as the sheets, so it sits on the
 * shoulders). Call each frame; pass `dir` as the facing of the current animation and `on` false to hide it. The overlay
 * is a child image kept on the sprite (`getData("hidebound")`) and follows its position, flip and depth.
 */
export function updateHidebound(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, cls: string, dir: string, on: boolean) {
  let img = sprite.getData("hidebound") as Phaser.GameObjects.Image | undefined;
  if (!on) { img?.setVisible(false); return; }
  if (!img) {
    img = scene.add.image(sprite.x, sprite.y, hideboundKey(scene, cls, "down")).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y);
    sprite.setData("hidebound", img);
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => img?.destroy());
  }
  const view = hideDirOf(dir);
  img.setTexture(hideboundKey(scene, cls, view)).setVisible(sprite.visible)
    .setPosition(sprite.x, sprite.y).setScale(Math.abs(sprite.scaleX), Math.abs(sprite.scaleY))
    .setFlipX(sprite.flipX).setAlpha(sprite.alpha).setDepth(sprite.depth + 0.5);
}
