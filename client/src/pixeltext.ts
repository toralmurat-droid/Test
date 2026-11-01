/**
 * Pixel-font text for the HUD, in the same style as the names over heroes (monospace with a black outline),
 * but bolder and more pixelated: the text is drawn small with hard edges, given a thick outline and drop shadow,
 * then shown scaled up with nearest-neighbour pixels.
 */
export function pixelText(text: string, color = "#ffe8a3", size = 11, scale = 3): HTMLCanvasElement {
  const pad = 3;
  const m = document.createElement("canvas").getContext("2d")!;
  const font = `bold ${size}px monospace`;
  m.font = font;
  const w = Math.ceil(m.measureText(text).width) + pad * 2, h = size + pad * 2 + 2;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.font = font; g.textBaseline = "top"; g.fillStyle = "#fff";
  g.fillText(text, pad, pad);
  // Hard pixels: no anti-aliasing
  const src = g.getImageData(0, 0, w, h), on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = src.data[i * 4 + 3] > 110 ? 1 : 0;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, gg, b] = rgb(color), [dr, dg, db] = [r, gg, b].map((v) => Math.round(v * 0.72));
  const out = g.createImageData(w, h), d = out.data;
  const set = (i: number, cr: number, cg: number, cb: number) => { d[i * 4] = cr; d[i * 4 + 1] = cg; d[i * 4 + 2] = cb; d[i * 4 + 3] = 255; };
  const lit = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x] === 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (on[i]) { const shade = !lit(x, y + 1) || y > pad + size * 0.6; set(i, shade ? dr : r, shade ? dg : gg, shade ? db : b); continue; }
    // 1px black outline all round, plus a drop shadow below-right
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy)) { edge = true; break; }
    if (edge || lit(x - 1, y - 2) || lit(x - 2, y - 2)) set(i, 0, 0, 0);
  }
  g.putImageData(out, 0, 0);
  c.style.width = `${w * scale}px`; c.style.height = `${h * scale}px`;
  c.style.imageRendering = "pixelated";
  return c;
}
