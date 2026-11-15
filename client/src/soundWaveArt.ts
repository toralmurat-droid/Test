/**
 * The Songweaver's sound wave is a little music note (an eighth note), drawn by code, pixel by pixel. It is painted in
 * greys and white over a dark outline so the client can TINT it: each skill's note takes its scale-step colour
 * (client/src/songTables.ts DEGREE_COLOR), so a progression reads as a colour sequence. One glyph pixel is 2 texels
 * (the cell is shown at 1.5 texels per world px), so the note keeps the chunky look of the heroes.
 * Pure Canvas2D (no Phaser, no DOM at load), so the art tool can render it and the client can bake it into a texture:
 *
 *   const sheet = document.createElement("canvas"); sheet.width = SOUND_WAVE_W * SOUND_WAVE_FRAMES; sheet.height = SOUND_WAVE_H;
 *   drawSoundWaveSheet(sheet.getContext("2d")!);  // then scene.textures.addSpriteSheet / addCanvas
 *
 * Frames are upright (a note never turns with its flight); the client moves them. Cosmetic only.
 * Cell size is 24 px, shown at 1.5 texels per world px like the other effects (16 world px).
 */
export const SOUND_WAVE_W = 24, SOUND_WAVE_H = 24;
/** Flight loop frames, then impact frames (the note bursts into sparks). */
export const SOUND_WAVE_FLIGHT = 6, SOUND_WAVE_IMPACT = 5, SOUND_WAVE_FRAMES = SOUND_WAVE_FLIGHT + SOUND_WAVE_IMPACT;

/** Outline, shade, body, white-hot: a tint multiplies them, so the body takes the skill's colour exactly. */
const PAL = [0x1c1030, 0xb4b4c4, 0xffffff, 0xffffff];
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

type Ctx = { fillStyle: any; fillRect(x: number, y: number, w: number, h: number): void; clearRect(x: number, y: number, w: number, h: number): void; globalAlpha: number };

/** One glyph pixel (u texels square). */
function px(c: Ctx, x: number, y: number, col: number, a = 1, u = 2) {
  // clipped to the cell being drawn, so no frame paints into its neighbour on the sheet
  const x0 = Math.max(Math.round(x), cell.x), y0 = Math.max(Math.round(y), cell.y), x1 = Math.min(Math.round(x) + u, cell.x + SOUND_WAVE_W), y1 = Math.min(Math.round(y) + u, cell.y + SOUND_WAVE_H);
  if (x1 <= x0 || y1 <= y0) return;
  c.globalAlpha = a; c.fillStyle = hex(col); c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1;
}
/** The cell origin of the frame being drawn (px clips to it). */
const cell = { x: 0, y: 0 };

/** An eighth note, 9 x 10 glyph pixels: 2 = body, 1 = shade; the outline is added round it. */
const NOTE = [
  "....22...",
  "....222..",
  "....2.22.",
  "....2..2.",
  "....2....",
  "....2....",
  ".2222....",
  "22222....",
  "22221....",
  ".111.....",
];

/** The note with its outline: 11 x 12 glyph pixels = 22 x 24 texels at scale 1. */
function note(c: Ctx, ox: number, oy: number, a: number, scale = 1) {
  const W = NOTE[0].length, H = NOTE.length, at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? "." : NOTE[y][x]);
  const u = 2 * scale;
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    const v = at(x, y);
    if (v === ".") {
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== ".") edge = true;
      if (edge) px(c, ox + (x + 1) * u, oy + (y + 1) * u, PAL[0], a, u);
    } else px(c, ox + (x + 1) * u, oy + (y + 1) * u, v === "2" ? PAL[2] : PAL[1], a, u);
  }
}

/** Draws one frame into a 24x24 cell whose origin is (ox, oy). kind "flight": t in 0..1 loops; "impact": t in 0..1 plays once. */
export function drawSoundWave(c: Ctx, ox: number, oy: number, t: number, kind: "flight" | "impact") {
  cell.x = ox; cell.y = oy;
  if (kind === "flight") {
    const ph = t % 1, bob = Math.round(Math.sin(ph * Math.PI * 2)) * 2;
    note(c, ox + 1, oy + bob, 1);
    // two little sparkles wink beside the note
    px(c, ox + 1 + Math.round((ph * 2) % 1) * 2, oy + 17 + bob - Math.round(ph * 4), PAL[3], 0.9, 2);
    px(c, ox + 19 + Math.round(ph * 2) * 2, oy + 3 + bob + Math.round(ph * 4), PAL[3], 0.7, 2);
  } else {
    // the note lifts, shrinks and fades while white sparks fly out of it
    if (t < 0.75) note(c, ox + 4 + Math.round(t * 2) * 2, oy + 4 - Math.round(t * 6), 1 - t * 1.2, 0.75);
    for (let k = 0; k < 6; k++) {
      const ang = k * Math.PI / 3 + 0.4, d = 4 + t * 16;
      px(c, ox + 11 + Math.cos(ang) * d, oy + 11 + Math.sin(ang) * d * 0.8, PAL[k % 2 ? 2 : 3], 1 - t * 0.85, t > 0.6 ? 2 : 4);
    }
  }
}

/** Draws the whole sheet (flight frames, then impact frames) left to right; the ctx must be SOUND_WAVE_W * SOUND_WAVE_FRAMES wide. */
export function drawSoundWaveSheet(c: Ctx) {
  for (let i = 0; i < SOUND_WAVE_FLIGHT; i++) drawSoundWave(c, i * SOUND_WAVE_W, 0, i / SOUND_WAVE_FLIGHT, "flight");
  for (let i = 0; i < SOUND_WAVE_IMPACT; i++) drawSoundWave(c, (SOUND_WAVE_FLIGHT + i) * SOUND_WAVE_W, 0, (i + 0.5) / SOUND_WAVE_IMPACT, "impact");
}
