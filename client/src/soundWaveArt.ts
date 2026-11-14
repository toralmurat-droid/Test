/**
 * The Songweaver's plucked sound wave (basic attack projectile), drawn by code, pixel by pixel: a warm gold core with
 * three curved arcs ringing out ahead of it, small notes trailing behind. Pure Canvas2D (no Phaser, no DOM at load),
 * so the art tool can render it and the client can bake it into a texture later:
 *
 *   const sheet = document.createElement("canvas"); sheet.width = SOUND_WAVE_W * SOUND_WAVE_FRAMES; sheet.height = SOUND_WAVE_H;
 *   drawSoundWaveSheet(sheet.getContext("2d")!);  // then scene.textures.addSpriteSheet / addCanvas
 *
 * Frames face +x; rotate the sprite to the shot's angle. Cosmetic only: not wired into gameplay yet.
 * Cell size is 24 px, shown at 1.5 texels per world px like the other effects (16 world px).
 */
export const SOUND_WAVE_W = 24, SOUND_WAVE_H = 24;
/** Flight loop frames, then impact frames (a ring bursting open). */
export const SOUND_WAVE_FLIGHT = 6, SOUND_WAVE_IMPACT = 5, SOUND_WAVE_FRAMES = SOUND_WAVE_FLIGHT + SOUND_WAVE_IMPACT;

/** Dark outline, deep amber, gold, pale gold, white-hot. */
const PAL = [0x6a3a14, 0xc9852a, 0xffc54d, 0xffe9a8, 0xffffff];
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

type Ctx = { fillStyle: any; fillRect(x: number, y: number, w: number, h: number): void; clearRect(x: number, y: number, w: number, h: number): void; globalAlpha: number };

function px(c: Ctx, x: number, y: number, col: number, a = 1) {
  c.globalAlpha = a; c.fillStyle = hex(col); c.fillRect(Math.round(x), Math.round(y), 1, 1); c.globalAlpha = 1;
}

/** One arc of a ring around (cx, cy): pixels whose distance is within `w` of r and whose angle is within `half` of +x. */
function arc(c: Ctx, cx: number, cy: number, r: number, half: number, w: number, hi: number, a: number) {
  const R = Math.ceil(r + w + 1);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y), off = Math.abs(d - r);
    if (off > w) continue;
    const ang = Math.abs(Math.atan2(y, x));
    if (ang > half) continue;
    const edge = Math.min(1, (half - ang) / 0.25); // taper at the tips
    if (off > w * edge + 0.01) continue;
    const k = off < w * 0.4 ? hi : off < w * 0.8 ? hi - 1 : 0;
    px(c, cx + x, cy + y, PAL[Math.max(0, Math.min(4, k))], a);
  }
}

function note(c: Ctx, x: number, y: number, a: number) {
  // an eighth note: head, stem, flag, in two golds over a dark rim
  px(c, x - 1, y + 1, PAL[0], a); px(c, x, y + 1, PAL[0], a); px(c, x - 1, y, PAL[2], a); px(c, x, y, PAL[3], a);
  for (let i = 1; i <= 3; i++) px(c, x + 1, y + 1 - i, PAL[1], a);
  px(c, x + 2, y - 2, PAL[2], a);
}

/** Draws one frame into a 24x24 cell whose origin is (ox, oy). kind "flight": t in 0..1 loops; "impact": t in 0..1 plays once. */
export function drawSoundWave(c: Ctx, ox: number, oy: number, t: number, kind: "flight" | "impact") {
  const cx = ox + 12, cy = oy + 12;
  if (kind === "flight") {
    const ph = t % 1;
    // arcs march outward and fade, a new one rises at the core every loop
    for (let i = 0; i < 3; i++) {
      const p = (i + ph) / 3, r = 2.5 + p * 8.5;
      arc(c, cx - 3, cy, r, 0.95 - p * 0.25, 0.95 - p * 0.25, p < 0.34 ? 4 : p < 0.67 ? 3 : 2, 1 - p * 0.55);
    }
    // core: a glowing plucked point
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const d = Math.hypot(x, y); if (d < 2.4) px(c, cx - 3 + x, cy + y, PAL[d < 0.9 ? 4 : d < 1.6 ? 3 : 2]); }
    // trailing notes wobble behind
    note(c, cx - 8, cy - 2 + Math.round(Math.sin(ph * Math.PI * 2) * 1.2), 0.9);
    px(c, cx - 11, cy + 2 + Math.round(Math.cos(ph * Math.PI * 2)), PAL[2], 0.7);
    px(c, cx - 10, cy - 4 - Math.round(Math.sin(ph * Math.PI * 2 + 1)), PAL[3], 0.5);
  } else {
    // full rings bursting open, fading, with sparks
    const r = 1.5 + t * 9, a = 1 - t * 0.85;
    arc(c, cx, cy, r, Math.PI, 0.8, t < 0.5 ? 4 : 3, a);
    if (t > 0.2) arc(c, cx, cy, r * 0.62, Math.PI, 0.6, 3, a * 0.8);
    if (t < 0.6) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (Math.abs(x) + Math.abs(y) < 2) px(c, cx + x, cy + y, PAL[4], 1 - t);
    for (let k = 0; k < 6; k++) { const ang = k * Math.PI / 3 + 0.4, d = 3 + t * 9; px(c, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, PAL[k % 2 ? 3 : 2], a); }
  }
}

/** Draws the whole sheet (flight frames, then impact frames) left to right; the ctx must be SOUND_WAVE_W * SOUND_WAVE_FRAMES wide. */
export function drawSoundWaveSheet(c: Ctx) {
  for (let i = 0; i < SOUND_WAVE_FLIGHT; i++) drawSoundWave(c, i * SOUND_WAVE_W, 0, i / SOUND_WAVE_FLIGHT, "flight");
  for (let i = 0; i < SOUND_WAVE_IMPACT; i++) drawSoundWave(c, (SOUND_WAVE_FLIGHT + i) * SOUND_WAVE_W, 0, (i + 0.5) / SOUND_WAVE_IMPACT, "impact");
}
