/**
 * Turns a painted hi-res canvas into crisp pixel art in the bonfire's style: one colour per art pixel (`cell`
 * texels square, snapped to the shared 2/3 world-px grid), hard alpha, ordered dithering between tone steps and a
 * dark outline around the silhouette. Run it on a texture after painting it with normal canvas calls.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

export function pixelize(ctx: CanvasRenderingContext2D, w: number, h: number, cell: number, opts: { step?: number; outline?: number } = {}) {
  const step = opts.step ?? 14, outline = opts.outline ?? 0.45;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const CW = Math.ceil(w / cell), CH = Math.ceil(h / cell);
  const cr = new Float32Array(CW * CH * 4);
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const sx = Math.min(w - 1, Math.floor(cx * cell + cell / 2)), sy = Math.min(h - 1, Math.floor(cy * cell + cell / 2));
    const i = (sy * w + sx) * 4, o = (cy * CW + cx) * 4, t = BAYER[(cy & 3) * 4 + (cx & 3)];
    let a = d[i + 3] / 255;
    // hard edges for solid paint, dithered steps for soft shadows and glazes
    a = a > 0.8 ? 1 : a < 0.06 ? 0 : Math.max(0, Math.min(1, Math.round(a * 4 + t) / 4));
    // posterize each channel in steps with ordered dithering (keeps hue, gives the hand-dithered look)
    for (let k = 0; k < 3; k++) cr[o + k] = Math.max(0, Math.min(255, Math.round(d[i + k] / step + t) * step));
    cr[o + 3] = a;
  }
  const solid = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < CW && cy < CH && cr[(cy * CW + cx) * 4 + 3] >= 1;
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const o = (cy * CW + cx) * 4;
    let r = cr[o], g = cr[o + 1], b = cr[o + 2];
    const a = cr[o + 3];
    if (a >= 1 && outline > 0 && (!solid(cx - 1, cy) || !solid(cx + 1, cy) || !solid(cx, cy - 1) || !solid(cx, cy + 1))) {
      r *= outline; g *= outline; b *= outline; // dark rim on the silhouette
    }
    for (let y = cy * cell; y < Math.min(h, (cy + 1) * cell); y++) for (let x = cx * cell; x < Math.min(w, (cx + 1) * cell); x++) {
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
