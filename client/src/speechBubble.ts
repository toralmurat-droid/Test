import Phaser from "phaser";
import { ART_PX } from "./pixelgrid";
import { TEXT_FONT, TEXT_PX } from "./pixelfont";
import { FILL, OUTLINE, RAMPS, Ramp, paintPanel } from "./weathered";

// Speech bubbles (split from weathered.ts so the start screen does not pull Phaser in)

export type BubbleKind = "say" | "shout";
const TEXT_COL: Record<BubbleKind, string> = { say: "#eadfc8", shout: "#ffb49a" };
const RIM: Record<BubbleKind, Ramp> = { say: RAMPS.bronze, shout: RAMPS.blood };

const R = 3; // canvas px per art px: the frame is painted in R x R blocks, the text drawn at that finer grid
const FONT_PX = TEXT_PX * R; // the game's pixel font, one font pixel = one art pixel (2x2 screen px at the default zoom)
let bubbleN = 0;

/**
 * A speech bubble over a head: a weathered pixel frame with a little tail at the bottom centre, and the text in the
 * pixel font (hard edges, no anti-aliasing). Origin is the tail tip. The texture is freed when the image is destroyed.
 */
export function speechBubble(scene: Phaser.Scene, x: number, y: number, text: string, kind: BubbleKind = "say") {
  const font = `${FONT_PX}px ${TEXT_FONT}`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  // word wrap: at most 300 canvas px of text per line
  const maxW = 480, words = text.split(/\s+/), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (m.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  const tw = Math.max(...lines.map((l) => m.measureText(l).width), 1);
  const lineH = FONT_PX + R * 2;
  // panel size in art px: 5 px of rim/padding each side
  const aw = Math.max(14, Math.ceil(tw / R) + 10), ah = Math.ceil((lines.length * lineH) / R) + 9;
  const tail = 4;
  const c = document.createElement("canvas");
  c.width = aw * R; c.height = (ah + tail) * R;
  const art = document.createElement("canvas");
  art.width = aw; art.height = ah + tail;
  const ag = art.getContext("2d")!;
  paintPanel(ag, aw, ah, RIM[kind], false, text.length);
  // tail: a small stepped wedge under the middle, outlined
  const r = RIM[kind], mid = Math.floor(aw / 2);
  for (let i = 0; i < tail; i++) {
    const half = tail - 1 - i, yy = ah - 1 + i;
    for (let dx = -half - 1; dx <= half + 1; dx++) {
      const edge = Math.abs(dx) === half + 1 || i === tail - 1;
      ag.fillStyle = edge ? OUTLINE : Math.abs(dx) === half ? r.lo : i === 0 ? r.mid : FILL;
      ag.fillRect(mid + dx, yy, 1, 1);
    }
  }
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(art, 0, 0, c.width, c.height);
  // Text: drawn on its own layer, thresholded to hard pixels, with a dark drop shadow
  const t = document.createElement("canvas");
  t.width = c.width; t.height = c.height;
  const tg = t.getContext("2d")!;
  tg.font = font; tg.textBaseline = "top"; tg.textAlign = "left"; tg.fillStyle = "#fff";
  const top = R * Math.round((c.height - tail * R - lines.length * lineH) / 2 / R); // on the art-pixel grid
  lines.forEach((l, i) => tg.fillText(l, R * Math.round((c.width - m.measureText(l).width) / 2 / R), top + i * lineH));
  const src = tg.getImageData(0, 0, t.width, t.height).data;
  const out = g.getImageData(0, 0, c.width, c.height), d = out.data;
  const col = [1, 3, 5].map((i) => parseInt(TEXT_COL[kind].slice(i, i + 2), 16));
  const W = t.width;
  const on = (i: number) => src[i * 4 + 3] > 110;
  for (let i = W * t.height - 1; i >= 0; i--) {
    if (on(i)) { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; continue; }
    const s = i - W * R - R; // shadow one art pixel down-right
    if (s >= 0 && on(s)) { d[i * 4] = 8; d[i * 4 + 1] = 5; d[i * 4 + 2] = 3; }
  }
  g.putImageData(out, 0, 0);
  const key = `__bubble${++bubbleN}`;
  scene.textures.addCanvas(key, c)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const img = scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(ART_PX / R).setDepth(20000);
  (img as any).__worldText = true; // drawn by the text camera (pixelgrid.ts), so the pixel grid doesn't blur the letters
  img.once(Phaser.GameObjects.Events.DESTROY, () => { if (scene.textures.exists(key)) scene.textures.remove(key); });
  return img;
}
