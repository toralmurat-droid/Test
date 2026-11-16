/**
 * Art for big battles (W5): the battle banner pole and the battle marker of the world map. Small code-drawn sprites in
 * the dark weathered pixel style of columnArt.ts (1 art px = 1 canvas unit; scale the context for the map, nearest
 * neighbour). Cosmetic only; the drawing functions take a plain 2D context so they also run in
 * tools/art/preview/battle-art-sheet.ts.
 *
 * Phaser texture "battle_banner" (ensureBattleBannerTextures): a strip of 6 frames, each 32x32 (one tile), pole foot at
 * the bottom middle (origin 0.5, 1 puts the foot on the point, the pole top reaches about 28 px up):
 *   frames 0 attacker, 1 defender, 2 neutral (cloth hanging one way), frames 3, 4, 5 the same states with the cloth
 *   blown the other way (flip between the two sets a few times a second to make the banner flutter).
 * `BANNER_FRAME[state]` and `BANNER_FLUTTER` give the numbers. Colours: attacker blood red, defender steel blue,
 * neutral ash grey (`BANNER_COL`); the map glyph uses the same.
 */
import { TILE } from "../../shared/constants";

const INK = "#0d0a07";
export type BannerState = "attacker" | "defender" | "neutral";
/** Cloth, dark fold shade and trim per state. */
export const BANNER_COL: Record<BannerState, { cloth: string; shade: string; trim: string }> = {
  attacker: { cloth: "#b2321f", shade: "#74201a", trim: "#e0a94a" },
  defender: { cloth: "#3f6a9c", shade: "#27436a", trim: "#cfd6dc" },
  neutral: { cloth: "#8a8272", shade: "#5c5648", trim: "#b8ad92" },
};
export const BANNER_FRAME: Record<BannerState, number> = { attacker: 0, defender: 1, neutral: 2 };
/** Add this to a frame number for the other flutter pose. */
export const BANNER_FLUTTER = 3;
/** Size of the map glyph in art px (with its outline). */
export const BANNER_GLYPH = { w: 9, h: 12 } as const;
/** Size of the battle marker in art px. */
export const BATTLE_MARKER = { w: 13, h: 13 } as const;

type Pix = Map<string, string>;
function blit(ctx: CanvasRenderingContext2D, x: number, y: number, pix: Pix) {
  const has = (px: number, py: number) => pix.has(px + "," + py);
  ctx.fillStyle = INK;
  for (const k of pix.keys()) {
    const [px, py] = k.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(px + dx, py + dy)) ctx.fillRect(x + px + dx, y + py + dy, 1, 1);
  }
  for (const [k, c] of pix) { const [px, py] = k.split(",").map(Number); ctx.fillStyle = c; ctx.fillRect(x + px, y + py, 1, 1); }
}

/**
 * The banner pole at (x, y) = top-left of a 32x32 cell: a cairn-footed pole with an iron cap, a tattered cloth
 * (12 x 9) and a hanging cross-bar. `flip` 0 or 1 sets which way the tattered edge blows.
 */
export function drawBannerSprite(ctx: CanvasRenderingContext2D, x: number, y: number, state: BannerState, flip = 0) {
  const c = BANNER_COL[state], pix: Pix = new Map(), set = (px: number, py: number, col: string) => pix.set(px + "," + py, col);
  const px0 = 12; // pole column
  for (let py = 6; py <= 28; py++) set(px0, py, py % 5 === 3 ? "#4a3a2a" : "#6e5a40"); // weathered pole
  for (let py = 7; py <= 27; py += 2) set(px0 + 1, py, "#3a2c1e"); // shaded side
  set(px0 - 1, 4, "#9aa0a6"); set(px0, 4, "#cfd6dc"); set(px0 + 1, 4, "#9aa0a6"); set(px0, 3, "#e8eef2"); set(px0, 5, "#6a7078"); // iron spearhead
  for (let px = px0 - 3; px <= px0 + 4; px++) set(px, 29, px % 3 ? "#5a5248" : "#7a7062"); // cairn stones
  for (let px = px0 - 2; px <= px0 + 3; px++) set(px, 28, px % 2 ? "#6a6256" : "#8a8070");
  set(px0 - 1, 27, "#6a6256"); set(px0 + 2, 27, "#5a5248");
  // cross-bar the cloth hangs from
  for (let px = px0 + 1; px <= px0 + 12; px++) set(px, 7, "#6e5a40");
  // cloth, 12 wide x 9 tall, the lower edge torn into points; flip blows the tail up or down
  for (let i = 0; i < 12; i++) {
    const px = px0 + 1 + i, wave = Math.round(Math.sin(i * 0.7 + flip * Math.PI) * 1.2), top = 8 + wave;
    const tear = (i * 5 + (state === "neutral" ? 2 : 0)) % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0, bot = top + 8 - tear - (i > 8 ? 1 : 0);
    for (let py = top; py <= bot; py++) set(px, py, py === top ? c.trim : (i + py) % 4 === 0 ? c.shade : c.cloth);
  }
  // sigil: crossed pennon dots, a grime stain
  for (const [dx, dy] of [[4, 12], [5, 13], [6, 12], [5, 11], [6, 14]] as const) set(px0 + dx, dy + (flip ? 0 : 0), state === "neutral" ? c.shade : c.trim);
  set(px0 + 2, 15, c.shade); set(px0 + 3, 16, c.shade);
  blit(ctx, x, y, pix);
}

/** The map glyph: a small pole with a short flag (9 x 12 art px with the outline). `x, y` is the top-left. */
export function drawBannerGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, state: BannerState) {
  const c = BANNER_COL[state], pix: Pix = new Map(), set = (px: number, py: number, col: string) => pix.set(px + "," + py, col);
  for (let py = 1; py <= 10; py++) set(1, py, py === 1 ? "#e8eef2" : "#8a7a64");
  for (let py = 2; py <= 5; py++) for (let px = 2; px <= 6; px++) set(px, py, py === 2 ? c.trim : px === 6 && py === 5 ? c.shade : c.cloth);
  set(6, 5, c.shade); set(5, 5, c.shade); set(4, 4, c.shade);
  set(0, 10, "#5a4a38"); set(2, 10, "#5a4a38");
  blit(ctx, x, y, pix);
}

/** The battle marker for the world map: crossed swords inside a red ring (13 x 13 art px). `x, y` is the top-left. */
export function drawBattleMarker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const pix: Pix = new Map(), set = (px: number, py: number, col: string) => pix.set(px + "," + py, col);
  const R = 6, cx = 6, cy = 6;
  for (let py = 0; py < 13; py++) for (let px = 0; px < 13; px++) {
    const d = Math.hypot(px - cx, py - cy);
    if (d <= R + 0.3 && d >= R - 1.2) set(px, py, d >= R - 0.5 ? "#d03a2a" : "#8a2418");
    else if (d < R - 1.2) set(px, py, "#2a1410"); // dark disc
  }
  for (let i = 0; i < 7; i++) { // swords, blades silver, hilts gold on the low ends
    const hilt = i >= 5, col = hilt ? "#c9962f" : i <= 1 ? "#ffffff" : "#cfd6dc";
    set(3 + i, 3 + i, col); set(9 - i, 3 + i, col);
  }
  set(6, 6, "#f0b44a");
  set(2, 9, "#7a4a22"); set(10, 9, "#7a4a22");
  blit(ctx, x, y, pix);
}

/** Registers the "battle_banner" texture (6 frames of 32x32, see the header). Draws once; use origin (0.5, 1) for the pole's foot. */
export function ensureBattleBannerTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("battle_banner")) return;
  const tex = scene.textures.createCanvas("battle_banner", TILE * 6, TILE)!, ctx = tex.getContext();
  (["attacker", "defender", "neutral"] as const).forEach((s, i) => {
    drawBannerSprite(ctx, i * TILE, 0, s, 0); drawBannerSprite(ctx, (i + 3) * TILE, 0, s, 1);
  });
  for (let f = 0; f < 6; f++) tex.add(f, 0, f * TILE, 0, TILE, TILE);
  tex.refresh();
}
