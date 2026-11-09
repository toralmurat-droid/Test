import { C2, P, blobPath, css, ellipseP, fillShape, glow, line, mix, poly, rng, sh, vol } from "./brush";

/**
 * The Summoner's elemental wisps (shared/summons.ts WISP): a little orb of the element with a dark Void eye in its
 * heart, ringed in Void violet, floating above its shadow. Fire burns as a tongue of flame, frost wears ice shards,
 * venom drips, storm crackles. Frames like the other monster sheets (tools/art/paint/mobs.ts frameOf): stand / step
 * bob and flicker, wind / strike gather and flare toward the target.
 */
export type WispElement = "fire" | "cold" | "poison" | "shock";
export const WISP_W = 16, WISP_H = 22, WISP_FOOT = 20;
const VOID = 0xb68cff, CORE = 0x140c1e;
const PAL: Record<WispElement, { hot: number; mid: number; dark: number }> = {
  fire: { hot: 0xffe08a, mid: 0xff7a2a, dark: 0x8a1e08 },
  cold: { hot: 0xf2fcff, mid: 0x7fd0ff, dark: 0x1f4f8f },
  poison: { hot: 0xe8ffa8, mid: 0x8ad83a, dark: 0x2e5a14 },
  shock: { hot: 0xfff6a8, mid: 0x8aa8ff, dark: 0x2a3a8a },
};

export function paintWisp(c: C2, shadow: C2 | null, el: WispElement, dir: "down" | "up" | "right", pose: "stand" | "step" | "wind" | "strike", f: number) {
  const p = PAL[el], rr = rng(f * 31 + el.length * 7);
  const bob = pose === "step" ? -0.8 : pose === "wind" ? 0.4 : 0, gather = pose === "wind" ? 0.85 : pose === "strike" ? 1.25 : 1;
  const x = 8, y = 9.5 + bob, R = 3.3 * gather;
  const face: P = dir === "down" ? [0, 0.6] : dir === "up" ? [0, -0.6] : [1, 0];
  if (shadow) { shadow.save(); shadow.translate(x, WISP_FOOT); shadow.scale(1, 0.32); shadow.fillStyle = "rgba(0,0,0,0.32)"; shadow.beginPath(); shadow.arc(0, 0, 3.6, 0, Math.PI * 2); shadow.fill(); shadow.restore(); }
  glow(c, x, y, R * 2.1, p.mid, 0.35);
  // the element's own shape around the orb
  if (el === "fire") {
    const sw = Math.sin(f * 1.9) * 0.7, tall = 6.2 + Math.sin(f * 2.3) * 0.8 + (pose === "strike" ? 1.2 : 0);
    const flame = blobPath([[x - R * 0.95, y + 0.4], [x - R * 0.7, y - R * 0.9], [x - 0.6 + sw * 0.4, y - tall * 0.75], [x + sw, y - tall], [x + 0.9 + sw * 0.5, y - tall * 0.6], [x + R * 0.8, y - R * 0.8], [x + R * 0.95, y + 0.6], [x, y + R * 0.9]]);
    vol(c, flame, p.mid, [x - R, y - tall, 2 * R, tall + R], { ao: 0.15, hi: 1.4, lo: 0.6 });
    const inner = blobPath([[x - 1.2, y - 1], [x - 0.3 + sw * 0.3, y - tall * 0.6], [x + 1.0, y - 1.4]]);
    fillShape(c, inner, css(p.hot, 0.85));
  } else if (el === "cold") {
    const n = 5, rot = f * 0.35;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2, d = R + 0.9, l = 1.8 + (i % 2) * 0.6;
      const b: P = [x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9], t: P = [x + Math.cos(a) * (d + l), y + Math.sin(a) * (d + l) * 0.9];
      const nx = -Math.sin(a) * 0.55, ny = Math.cos(a) * 0.55;
      const s = poly([[b[0] - nx, b[1] - ny], t, [b[0] + nx, b[1] + ny], [x + Math.cos(a) * (d - 0.6), y + Math.sin(a) * (d - 0.6) * 0.9]]);
      vol(c, s, p.mid, [t[0] - 1.5, t[1] - 1.5, 3, 3], { ao: 0.1, hi: 1.5 });
      line(c, [b, t], p.hot, 0.18, 0.8);
    }
  } else if (el === "poison") {
    // a drop hanging under the orb and two bubbles rising
    const drip = 1.6 + ((f % 3) * 0.5);
    const d = blobPath([[x - R * 0.9, y + 0.2], [x - 0.5, y + R + drip * 0.6], [x, y + R + drip], [x + 0.5, y + R + drip * 0.6], [x + R * 0.9, y + 0.2]]);
    vol(c, d, p.mid, [x - R, y, 2 * R, R + drip], { ao: 0.15, hi: 1.4 });
    for (const [bx, by, br] of [[x - R - 0.6, y - R + (f % 4) * -0.3, 0.7], [x + R + 0.4, y - 1 - (f % 3) * 0.4, 0.55]]) {
      vol(c, ellipseP(bx, by, br, br), p.mid, [bx - br, by - br, 2 * br, 2 * br], { ao: 0.2, hi: 1.6 });
    }
  } else {
    // crackling spikes and a small arc jumping off the orb
    const n = 7;
    const pts: P[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + f * 0.4, d = i % 2 ? R + 0.4 : R + 1.4 + rr() * 1.1;
      pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]);
    }
    vol(c, poly(pts), p.mid, [x - R - 2, y - R - 2, 2 * R + 4, 2 * R + 4], { ao: 0.1, hi: 1.5 });
    const a0 = rr() * Math.PI * 2;
    let q: P = [x + Math.cos(a0) * R, y + Math.sin(a0) * R];
    const arc: P[] = [q];
    for (let k = 0; k < 3; k++) { q = [q[0] + Math.cos(a0) * 1.4 + (rr() - 0.5) * 1.4, q[1] + Math.sin(a0) * 1.4 + (rr() - 0.5) * 1.4]; arc.push(q); }
    line(c, arc, p.hot, 0.3, 0.95);
  }
  // the orb, a Void-violet rim and the dark eye in its heart, looking where the wisp faces
  const orb = ellipseP(x, y, R, R);
  vol(c, orb, p.mid, [x - R, y - R, 2 * R, 2 * R], { ao: 0.2, hi: 1.55, lo: 0.7, spec: 0.5 });
  c.beginPath(); orb(c); c.strokeStyle = css(mix(VOID, p.mid, 0.25), 0.9); c.lineWidth = 0.42; c.stroke();
  if (dir !== "up") {
    const ex = x + face[0] * R * 0.38, ey = y + face[1] * R * 0.3, er = R * (pose === "strike" ? 0.42 : 0.36);
    fillShape(c, ellipseP(ex, ey, er * (dir === "right" ? 0.75 : 1), er), css(CORE));
    fillShape(c, ellipseP(ex, ey, er * 0.45 * (dir === "right" ? 0.75 : 1), er * 0.45), css(sh(VOID, 1.1), 0.9));
  } else glow(c, x, y - 0.3, R * 0.7, p.hot, 0.5);
  fillShape(c, ellipseP(x - R * 0.4, y - R * 0.45, R * 0.28, R * 0.2), css(p.hot, 0.85));
  // gathering (wind) draws motes in, the shot (strike) flares toward the target
  if (pose === "wind") for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + f, d = R + 2.4;
    fillShape(c, ellipseP(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.35, 0.35), css(VOID, 0.9));
  }
  if (pose === "strike") glow(c, x + face[0] * R * 1.4, y + face[1] * R * 1.4, R * 1.2, p.hot, 0.7);
}
