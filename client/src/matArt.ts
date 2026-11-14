import type Phaser from "phaser";
import { MATS } from "./songbookData";

/**
 * Songweaver material sprites (tonewood, brass, bone, silk, horn, sunglass), 16x16 pixel art.
 * HOOK(di): PLACEHOLDER painted in code, keyed by the contract ids. Swap for the art agent's sprites when they land (same ids).
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

/** A material sprite on a canvas `size` px wide, drawn crisp. `grey` = a monster drop only a Songweaver can use. */
export function drawMat(ctx: CanvasRenderingContext2D, id: string, size: number, grey = false) {
  const m = MATS[id], art = SHAPE[id];
  if (!m || !art) return;
  const pal: Record<string, string> = { o: "#1b120a", a: hex(m.color), b: hex(m.accent) };
  const k = size / 16;
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = pal[ch];
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect(Math.floor(x * k), Math.floor(y * k), Math.ceil(k), Math.ceil(k));
  }));
  if (grey) { // desaturate in place
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
