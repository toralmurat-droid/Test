import type Phaser from "phaser";
import { drawSongItem } from "./songItemArt";

/**
 * Songweaver material sprites (tonewood, brass, bone, silk, horn, sunglass), 16x16 pixel art.
 * The generated sprites (songItemArt.ts) are used; the shapes below are the fallback if one is missing.
 */
const SHAPE: Record<string, string[]> = {
  // a log slice / plank
  tonewood: ["................", "................", "..oooooooooooo..", ".oaaaaaaaaaaaao.", ".oabbbbbbbbbbao.", ".oabaaaaaaaabao.", ".oabaooooooabao.", ".oabaoaaaaoabao.", ".oabaooooooabao.", ".oabaaaaaaaabao.", ".oabbbbbbbbbbao.", ".oaaaaaaaaaaaao.", "..oooooooooooo..", "................", "................", "................"],
  // a tuning peg / fitting
  brass: ["................", ".....oooo.......", "....oaaaao......", "...oabbbbao.....", "...oabbbbao.....", "....oaaaao......", ".....oaao.......", ".....oaao.......", ".....oabo.......", ".....oaao.......", ".....oabo.......", ".....oaao.......", "......oo........", "................", "................", "................"],
  // a bone
  bone: ["................", "...oo......oo...", "..oaao....oaao..", "..oaaaooooaaao..", "...oaabbbbaao...", "....ooaaaaoo....", ".....oabbao.....", "....ooaaaaoo....", "...oaabbbbaao...", "..oaaaooooaaao..", "..oaao....oaao..", "...oo......oo...", "................", "................", "................", "................"],
  // a hank of thread
  silk: ["................", "................", "....oooooooo....", "...oaabbaabbao..", "..oabbaabbaabao.", "..oaabbaabbaaao.", "..obaabbaabbaao.", "..oabbaabbaabao.", "..oaabbaabbaaao.", "...obaabbaabbo..", "....oooooooo....", "................", "................", "................", "................", "................"],
  // a curl of horn
  horn: ["................", "........oooo....", "......ooaaaao...", ".....oaabbbbao..", "....oabbooobao..", "...oabbo..oaao..", "...oabo...oao...", "..oabbo...ooo...", "..oabo..........", "..oabo..........", "..oabbo.........", "...oabbo........", "....oaabo.......", ".....oooo.......", "................", "................"],
  // a shard of glass
  sunglass: ["................", "......oo........", ".....oaao.......", "....oabbao......", "...oabbbbao.....", "...oabaabbo.....", "..oabbaabbao....", "..oabbbbbbao....", "...oabbbbbao....", "...oaabbbaao....", "....oaabbao.....", ".....oaaao......", "......ooo.......", "................", "................", "................"],
};
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** Main and accent colour per material: the fallback sprite, the ground glow and the pickup sparks (cosmetic only). */
export const MAT_COLOR: Record<string, { color: number; accent: number }> = {
  tonewood: { color: 0xb88048, accent: 0x5a3a1a }, brass: { color: 0xe8c040, accent: 0x8a6a10 }, bone: { color: 0xe8e2d0, accent: 0x9a9280 },
  silk: { color: 0xf0f0ff, accent: 0x9fb0d8 }, horn: { color: 0xd8c8a0, accent: 0x7a6a40 }, sunglass: { color: 0xffb84a, accent: 0xffe9a0 },
};

/** A material sprite on a canvas `size` px wide, drawn crisp. `grey` = a monster drop only a Songweaver can use. */
export function drawMat(ctx: CanvasRenderingContext2D, id: string, size: number, grey = false) {
  const m = MAT_COLOR[id], art = SHAPE[id];
  if (!m) return;
  if (!drawSongItem(ctx, `mat_${id}`, size) && art) drawPlaceholder(ctx, m, art, size);
  if (grey) greyOut(ctx, size);
}
function drawPlaceholder(ctx: CanvasRenderingContext2D, m: { color: number; accent: number }, art: string[], size: number) {
  const pal: Record<string, string> = { o: "#1b120a", a: hex(m.color), b: hex(m.accent) };
  const k = size / 16;
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = pal[ch];
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect(Math.floor(x * k), Math.floor(y * k), Math.ceil(k), Math.ceil(k));
  }));
}
function greyOut(ctx: CanvasRenderingContext2D, size: number) {
  { // desaturate in place
    const d = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < d.data.length; i += 4) { const g = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3; d.data[i] = d.data[i + 1] = d.data[i + 2] = g * 0.8; }
    ctx.putImageData(d, 0, 0);
  }
}

/** DOM canvas icon of a material (for the lute-maker panel and the reader). */
export function matCanvas(scene: Phaser.Scene | undefined, id: string, size = 24): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  drawMat(ctx, id, size);
  return c;
}

/** Phaser texture key of a material for ground items (made on first use). */
export function matTexture(scene: Phaser.Scene, id: string, grey = false): string {
  const key = `mat_${id}${grey ? "_grey" : ""}`;
  if (scene.textures.exists(key)) return key;
  const c = scene.textures.createCanvas(key, 16, 16);
  const ctx = c!.getContext();
  ctx.imageSmoothingEnabled = false;
  drawMat(ctx, id, 16, grey);
  c!.refresh();
  return key;
}

let tip: HTMLDivElement | undefined;
/** Hover tooltip of a ground material (HTML; call with no text to hide). */
export function matTip(html?: string) {
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "mattip";
    tip.style.cssText = "position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:60;pointer-events:none;max-width:90vw;padding:4px 8px;background:rgba(15,10,6,.95);border:2px solid #6a5232;font:normal 13px var(--pixel-font);line-height:15px;color:#d9c79a;text-shadow:1px 1px 0 #000";
    document.body.appendChild(tip);
  }
  tip.hidden = !html;
  if (html) tip.innerHTML = html;
}
