import { C2, P, css, ellipseP, fillShape, glow, grain, limb, line, curve, poly, rng, sh, vol, blobPath } from "./brush";

/**
 * Clan-war supply carts (art keys war_cart_<clan>, sheets mob_war_cart_<clan> from paint/mobs.ts): a cart and the draught
 * beast pulling it, painted with the same brush as the soldiers and pixelized by the same code. Art-only keys: no MobKind,
 * no gameplay table. Frames (72 x 44, facing like the soldier sheets: 0-1 down, 2-3 up, 4-5 right, left is the right flipped):
 *   0-5 walk (even = one stride, odd = the other), 6-8 idle down / up / right, 9-11 mid-stride down / up / right,
 *   12 staggering (cart cracked, tilted, beast flinching), 13 wrecked (cart broken down, goods spilled, beast gone; right).
 */
export const CART_W = 72, CART_H = 44, CART_FRAMES = 14;
export const WAR_CARTS = ["war_cart_wardens", "war_cart_redfang", "war_cart_host", "war_cart_hidekin", "war_cart_veiled"] as const;
export type WarCart = (typeof WAR_CARTS)[number];
type Clan = "wardens" | "redfang" | "host" | "hidekin" | "veiled";
type Dir = "down" | "up" | "right";
const G = 40; // the ground line in the frame

const SKIN = { wood: 0x6b4a2a, woodD: 0x3e2a18, iron: 0x6a6a68, rope: 0xb49a6a, bone: 0xd8cfb2, gold: 0xe9b84a };

const rect = (c: C2, x: number, y: number, w: number, h: number, col: number, o: { ao?: number; spec?: number; n?: number } = {}) => {
  const s = poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  vol(c, s, col, [x, y, w, h], { ao: o.ao ?? 0.35, spec: o.spec });
  grain(c, s, [x, y, w, h], col, ((x * 31 + y * 17) | 0) + 7, o.n ?? Math.min(60, (w * h) | 0), 0.2, 0.9, 0);
};
const planks = (c: C2, x: number, y: number, w: number, h: number, n: number, col: number) => {
  for (let i = 1; i < n; i++) line(c, [[x, y + (h * i) / n], [x + w, y + (h * i) / n]], sh(col, 0.42), 0.35, 0.8);
};
const disc = (c: C2, x: number, y: number, r: number, col: number, spec = 0.3) => vol(c, ellipseP(x, y, r, r), col, [x - r, y - r, r * 2, r * 2], { ao: 0.3, spec });
const skull = (c: C2, x: number, y: number, r: number, eye = 0x1a1410) => {
  disc(c, x, y, r, SKIN.bone, 0.4);
  fillShape(c, ellipseP(x, y + r * 0.9, r * 0.6, r * 0.45), css(sh(SKIN.bone, 0.9)));
  fillShape(c, ellipseP(x - r * 0.35, y - r * 0.05, r * 0.28, r * 0.3), css(eye)); fillShape(c, ellipseP(x + r * 0.35, y - r * 0.05, r * 0.28, r * 0.3), css(eye));
};
/** A soft ground shadow (own layer so the pixel pass keeps it). */
const shadow = (s: C2 | null, x: number, y: number, rx: number, ry: number) => {
  if (!s) return;
  s.save(); s.translate(x, y); s.scale(1, ry / rx); s.fillStyle = "rgba(0,0,0,0.42)"; s.beginPath(); s.arc(0, 0, rx, 0, Math.PI * 2); s.fill(); s.restore();
};

/** A spoked wheel seen from the side; `ang` turns it between frames. */
function wheel(c: C2, x: number, y: number, r: number, ang: number, rim: number, hub: number, spokes = 8, far = false) {
  const k = far ? 0.62 : 1;
  fillShape(c, ellipseP(x, y, r + 0.5, r + 0.5), css(sh(rim, 0.3 * k + 0.1)));
  c.save(); c.beginPath(); ellipseP(x, y, r - 1, r - 1)(c); c.fillStyle = css(sh(rim, 0.28), 0.9); c.fill(); c.restore();
  for (let i = 0; i < spokes; i++) {
    const a = ang + (i / spokes) * Math.PI * 2;
    line(c, [[x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4], [x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1)]], sh(rim, 0.95 * k), 0.8);
  }
  c.beginPath(); ellipseP(x, y, r, r)(c); c.strokeStyle = css(sh(rim, 1.05 * k)); c.lineWidth = 1.5; c.stroke();
  c.beginPath(); ellipseP(x - 0.3, y - 0.3, r - 0.8, r - 0.8)(c); c.strokeStyle = css(sh(rim, 1.5), 0.45); c.lineWidth = 0.4; c.stroke();
  disc(c, x, y, 1.5, hub, 0.5);
}

// ---------------------------------------------------------------- the draught beasts
interface BeastSpec {
  col: number; rx: number; ry: number; leg: number; legW: number; /** hoof y offset: claws are low and wide */ bone?: boolean; neck: P;
  head: (c: C2, x: number, y: number, p: number, far: boolean) => void; extra?: (c: C2, bx: number, by: number) => void; tail?: (c: C2, x: number, y: number) => void;
  front: (c: C2, x: number, y: number, back: boolean) => void;
}

const ear = (c: C2, x: number, y: number, col: number) => fillShape(c, poly([[x, y], [x + 1.6, y - 2.4], [x + 2.3, y + 0.4]]), css(sh(col, 0.8)));
const eye = (c: C2, x: number, y: number, col = 0x1a1008) => { fillShape(c, ellipseP(x, y, 0.5, 0.5), css(col)); };

const OX: BeastSpec = {
  col: 0x7a5a3a, rx: 8.5, ry: 5, leg: 6.5, legW: 2.1, neck: [3, -0.5],
  head: (c, x, y, _p, far) => {
    const col = far ? 0x5a422a : 0x84623e;
    curve(c, [x + 1, y - 1], [x + 1.6, y - 4], [x + 4.2, y - 4.4], SKIN.bone, 1.1); // horn
    ear(c, x + 0.6, y - 0.6, col);
    vol(c, ellipseP(x + 3, y + 1.2, 3.6, 2.5, 0.35), col, [x - 1, y - 1, 8, 5], { ao: 0.3, spec: 0.2 });
    fillShape(c, ellipseP(x + 5.8, y + 2.6, 1.9, 1.4, 0.3), css(0xc79a86)); // muzzle
    fillShape(c, ellipseP(x + 6.5, y + 2.6, 0.35, 0.35), css(0x2a1a14));
    eye(c, x + 3.4, y + 0.4); curve(c, [x + 5.6, y + 3.8], [x + 6.6, y + 4.8], [x + 7, y + 3.6], SKIN.gold, 0.5); // nose ring
  },
  extra: (c, bx, by) => {
    // the yoke and a wide amber-and-green harness blanket
    const s = poly([[bx - 5, by - 4.6], [bx + 3, by - 5.2], [bx + 4, by + 0.5], [bx - 4, by + 1]]);
    vol(c, s, 0xc8741f, [bx - 5, by - 5, 9, 6], { ao: 0.3 }); line(c, [[bx - 5, by + 1], [bx + 4, by + 0.5]], 0x3b4a2c, 0.9);
    disc(c, bx - 1, by - 2, 1.3, 0xf0b44a, 0.5);
    rect(c, bx + 5, by - 6.4, 4, 1.8, SKIN.wood); // yoke bar over the shoulders
  },
  tail: (c, x, y) => { line(c, [[x, y], [x - 2, y + 3], [x - 1.6, y + 6]], 0x5a422a, 0.9); fillShape(c, ellipseP(x - 1.6, y + 6.6, 0.9, 1.4), css(0x2a1c10)); },
  front: (c, x, y, back) => {
    vol(c, ellipseP(x, y, 6, 6.4), 0x7a5a3a, [x - 6, y - 6.4, 12, 12.8], { ao: 0.35 });
    if (!back) { vol(c, ellipseP(x, y - 1.5, 3.3, 3.2), 0x84623e, [x - 3.3, y - 4.7, 6.6, 6.4], { ao: 0.3 }); fillShape(c, ellipseP(x, y + 0.6, 2, 1.4), css(0xc79a86)); eye(c, x - 1.5, y - 2); eye(c, x + 1.5, y - 2); curve(c, [x - 2.8, y - 3.8], [x - 6, y - 4.5], [x - 5.2, y - 8], SKIN.bone, 1); curve(c, [x + 2.8, y - 3.8], [x + 6, y - 4.5], [x + 5.2, y - 8], SKIN.bone, 1); }
    else { line(c, [[x, y + 1], [x, y + 5]], 0x4a3220, 0.9); rect(c, x - 3, y - 2, 6, 2, 0xc8741f); }
  },
};

const boarHead = (c: C2, x: number, y: number, far: boolean) => {
  const col = far ? 0x35261c : 0x4a3426;
  ear(c, x + 0.4, y - 0.4, col);
  vol(c, ellipseP(x + 3.2, y + 1.6, 3.8, 2.7, 0.3), col, [x - 1, y - 1, 8, 5.4], { ao: 0.3 });
  fillShape(c, ellipseP(x + 6.6, y + 2.6, 1.5, 1.4), css(0xb58c78)); fillShape(c, ellipseP(x + 7.2, y + 2.5, 0.35, 0.35), css(0x1a100a));
  fillShape(c, poly([[x + 5, y + 3.6], [x + 6.2, y + 3.8], [x + 6.4, y + 0.6]]), css(0xe3d6b8)); // tusk
  eye(c, x + 4, y + 0.9, 0xff6a30);
};
const BOAR: BeastSpec = {
  col: 0x4a3426, rx: 8, ry: 5.2, leg: 5, legW: 2.2, neck: [3.5, 1.2],
  head: (c, x, y, _p, far) => boarHead(c, x, y, far),
  extra: (c, bx, by) => {
    for (let i = 0; i < 8; i++) line(c, [[bx - 7 + i * 1.8, by - 4.6 + Math.abs(i - 3.5) * 0.25], [bx - 7.4 + i * 1.8, by - 6.4 + Math.abs(i - 3.5) * 0.2]], 0x1e140e, 0.7); // bristle ridge
    rect(c, bx - 3, by - 3, 7, 2, 0x8e1f1a, { n: 12 }); line(c, [[bx - 3, by - 1], [bx + 4, by - 1]], 0x1a1010, 0.6); // red harness strap
    fillShape(c, poly([[bx + 1, by - 1.6], [bx + 3, by - 1.6], [bx + 2, by + 0.4]]), css(0x8a8a8a));
  },
  tail: (c, x, y) => curve(c, [x, y], [x - 3, y - 1], [x - 2, y + 2], 0x2a1c14, 0.8),
  front: (c, x, y, back) => {
    vol(c, ellipseP(x, y, 6, 6), 0x4a3426, [x - 6, y - 6, 12, 12], { ao: 0.35 });
    if (!back) { vol(c, ellipseP(x, y - 1, 3.4, 3.2), 0x5a4030, [x - 3.4, y - 4.2, 6.8, 6.4], { ao: 0.3 }); fillShape(c, ellipseP(x, y + 1, 2, 1.5), css(0xb58c78)); eye(c, x - 1.6, y - 2, 0xff6a30); eye(c, x + 1.6, y - 2, 0xff6a30); fillShape(c, poly([[x - 2, y + 1.8], [x - 3.2, y - 0.8], [x - 1.2, y + 0.4]]), css(0xe3d6b8)); fillShape(c, poly([[x + 2, y + 1.8], [x + 3.2, y - 0.8], [x + 1.2, y + 0.4]]), css(0xe3d6b8)); }
    else { for (let i = -3; i <= 3; i++) line(c, [[x + i * 1.4, y - 4.8], [x + i * 1.5, y - 6.8]], 0x1e140e, 0.7); curve(c, [x, y + 1], [x + 3, y + 3], [x + 2, y + 5], 0x2a1c14, 0.8); }
  },
};

const HORSE: BeastSpec = {
  col: 0xd0c7ac, rx: 8, ry: 4.2, leg: 8, legW: 1.2, bone: true, neck: [3.6, -4.6],
  head: (c, x, y, _p, far) => {
    const col = far ? 0x9a927c : SKIN.bone;
    vol(c, ellipseP(x + 3.4, y + 1.5, 4.4, 1.7, 0.55), col, [x - 1, y - 1, 9, 5], { ao: 0.35, spec: 0.3 });
    fillShape(c, poly([[x + 4, y + 3.6], [x + 7.6, y + 4.6], [x + 6, y + 2.4]]), css(sh(col, 0.7))); // jaw
    glow(c, x + 2.2, y + 0.9, 2.4, 0x4fe8c0, 0.7); fillShape(c, ellipseP(x + 2.2, y + 0.9, 0.8, 0.8), css(0x9ffff0));
    fillShape(c, poly([[x + 0.4, y - 0.4], [x + 1.4, y - 2.8], [x + 2.2, y - 0.2]]), css(sh(col, 0.85)));
    for (let i = 0; i < 4; i++) curve(c, [x - 0.4, y + 0.2 + i * 0.9], [x - 3, y + 1 + i * 1.6], [x - 4.8, y + 2.6 + i * 2.2], 0x2f8f78, 0.6, 0.65); // ghostly teal mane
  },
  extra: (c, bx, by) => {
    // bare ribs through a hollow barrel, a spine, a tattered teal caparison
    fillShape(c, ellipseP(bx, by, 7.4, 3.8), css(0x141a18));
    for (let i = -3; i <= 3; i++) curve(c, [bx + i * 2, by - 3.4], [bx + i * 2 + 1.4, by], [bx + i * 2, by + 3.4], SKIN.bone, 0.9);
    line(c, [[bx - 7.4, by - 3], [bx + 7.4, by - 3.4]], SKIN.bone, 1.2);
    fillShape(c, poly([[bx - 3, by - 4], [bx + 4, by - 4.4], [bx + 5, by + 1], [bx + 3, by + 3.4], [bx + 1.5, by + 1], [bx - 1, by + 3.6], [bx - 3.4, by + 0.6]]), css(0x1f3a34, 0.92));
    line(c, [[bx - 3, by - 4], [bx + 4, by - 4.4]], 0x4f7d6a, 0.7);
    glow(c, bx, by, 3.6, 0x4fe8c0, 0.22);
  },
  tail: (c, x, y) => { for (let i = 0; i < 3; i++) curve(c, [x, y + i * 0.5], [x - 3, y + 2 + i], [x - 3.4 + i, y + 6 + i], 0x2f8f78, 0.7, 0.7); },
  front: (c, x, y, back) => {
    fillShape(c, ellipseP(x, y, 5.2, 6), css(0x141a18));
    for (let i = -2; i <= 2; i++) curve(c, [x + i * 1.9, y - 5], [x + i * 2.2, y], [x + i * 1.9, y + 5], SKIN.bone, 0.9);
    line(c, [[x, y - 6], [x, y + 5]], SKIN.bone, 1);
    if (!back) { vol(c, ellipseP(x, y - 4.5, 2.2, 3), SKIN.bone, [x - 2.2, y - 7.5, 4.4, 6], { ao: 0.35, spec: 0.3 }); glow(c, x - 0.9, y - 5, 1.6, 0x4fe8c0, 0.8); glow(c, x + 0.9, y - 5, 1.6, 0x4fe8c0, 0.8); }
    else for (let i = 0; i < 3; i++) curve(c, [x, y + 2], [x - 1 + i, y + 5], [x - 1.4 + i * 1.4, y + 8], 0x2f8f78, 0.7, 0.7);
  },
};

const MOLE: BeastSpec = {
  col: 0x56524c, rx: 10, ry: 5.6, leg: 3.4, legW: 3, neck: [4, 1.6],
  head: (c, x, y, _p, far) => {
    const col = far ? 0x3a3732 : 0x5e5a54;
    ear(c, x + 0.2, y - 0.6, 0x2a2622);
    vol(c, ellipseP(x + 3.2, y + 1.8, 4.6, 2.8, 0.25), col, [x - 1.4, y - 1, 9.4, 5.6], { ao: 0.3 });
    fillShape(c, poly([[x + 0.2, y - 0.4], [x + 3, y - 0.6], [x + 7.4, y + 1.6], [x + 4.6, y + 1.6], [x + 1.2, y + 1]]), css(0xe0dcd0, 0.95)); // the white badger stripe
    fillShape(c, ellipseP(x + 7.6, y + 2.2, 0.9, 0.8), css(0x1a1410));
    eye(c, x + 4.2, y + 1.7, 0xd8d0c0); fillShape(c, poly([[x + 5, y + 3.6], [x + 5.8, y + 4.8], [x + 6.4, y + 3.4]]), css(0xe3d6b8));
  },
  extra: (c, bx, by) => {
    for (let i = 0; i < 12; i++) line(c, [[bx - 9 + i * 1.5, by - 4.8], [bx - 9.6 + i * 1.5, by - 6.4]], 0x2a2622, 0.5, 0.8); // coarse back hair
    line(c, [[bx - 8, by - 2], [bx + 7, by - 3]], 0x8a5e30, 1.2); // hide strap
    line(c, [[bx - 1, by - 5], [bx - 1, by + 3]], 0x8a5e30, 1.2);
    fillShape(c, poly([[bx + 2, by - 5], [bx + 5, by - 5.6], [bx + 6, by - 1], [bx + 3, by - 1.4]]), css(0x8a6a40)); // a tied-on hide pad
  },
  tail: (c, x, y) => fillShape(c, ellipseP(x - 0.8, y + 0.4, 1.8, 1.1), css(0x3a3732)),
  front: (c, x, y, back) => {
    vol(c, ellipseP(x, y, 7.4, 5.6), 0x56524c, [x - 7.4, y - 5.6, 14.8, 11.2], { ao: 0.35 });
    if (!back) { vol(c, ellipseP(x, y - 1, 3.6, 3.2), 0x5e5a54, [x - 3.6, y - 4.2, 7.2, 6.4], { ao: 0.3 }); fillShape(c, poly([[x - 1, y - 4.2], [x + 1, y - 4.2], [x + 0.8, y + 0.4], [x - 0.8, y + 0.4]]), css(0xe0dcd0)); fillShape(c, ellipseP(x, y + 1.2, 1, 0.8), css(0x1a1410)); eye(c, x - 2, y - 1.6, 0xd8d0c0); eye(c, x + 2, y - 1.6, 0xd8d0c0); }
    else for (let i = -4; i <= 4; i++) line(c, [[x + i * 1.5, y - 5], [x + i * 1.6, y - 6.6]], 0x2a2622, 0.5);
  },
};

const CAMEL: BeastSpec = {
  col: 0xb8905a, rx: 8.4, ry: 4.4, leg: 8.4, legW: 1.8, neck: [4.2, -8],
  head: (c, x, y, _p, far) => {
    const col = far ? 0x8a6a40 : 0xc09a62;
    vol(c, ellipseP(x + 2.4, y + 1, 3.2, 1.8, 0.2), col, [x - 1, y - 1, 7, 4], { ao: 0.3 });
    fillShape(c, ellipseP(x + 5, y + 1.6, 1.6, 1.2), css(sh(col, 0.85))); eye(c, x + 2.6, y + 0.4); ear(c, x, y - 0.4, col);
  },
  extra: (c, bx, by) => {
    // a hump, an indigo caparison with gold fringe, a rune lantern on a short pole
    vol(c, ellipseP(bx - 0.5, by - 5, 3.8, 3.4), 0xc09a62, [bx - 4, by - 8.4, 7.6, 6.8], { ao: 0.3 });
    const s = poly([[bx - 4.5, by - 6], [bx + 4, by - 6.4], [bx + 5, by + 1.2], [bx - 5.5, by + 1.6]]);
    vol(c, s, 0x3a3a82, [bx - 5, by - 6, 10, 8], { ao: 0.3 });
    line(c, [[bx - 5.5, by + 1.6], [bx + 5, by + 1.2]], 0xe0a030, 0.9);
    for (let i = 0; i < 6; i++) line(c, [[bx - 5 + i * 1.8, by + 1.6], [bx - 5.2 + i * 1.8, by + 3]], 0xe0a030, 0.4);
    disc(c, bx, by - 1.4, 1.1, 0xe0a030, 0.5);
  },
  tail: (c, x, y) => { line(c, [[x, y], [x - 1, y + 4]], 0x8a6a40, 0.8); fillShape(c, ellipseP(x - 1, y + 4.4, 0.8, 1.1), css(0x5a4430)); },
  front: (c, x, y, back) => {
    vol(c, ellipseP(x, y + 1, 5, 6), 0xb8905a, [x - 5, y - 5, 10, 12], { ao: 0.35 });
    vol(c, ellipseP(x, y - 4, 3, 3), 0xc09a62, [x - 3, y - 7, 6, 6], { ao: 0.3 });
    rect(c, x - 5, y - 2, 10, 5, 0x3a3a82, { n: 14 }); line(c, [[x - 5, y + 3], [x + 5, y + 3]], 0xe0a030, 0.8);
    if (!back) { vol(c, ellipseP(x, y - 7.6, 1.8, 2.6), 0xc09a62, [x - 1.8, y - 10, 3.6, 5], { ao: 0.3 }); eye(c, x - 0.8, y - 8.2); eye(c, x + 0.8, y - 8.2); }
    else line(c, [[x, y + 3], [x, y + 7]], 0x5a4430, 0.8);
  },
};

const BEASTS: Record<Clan, BeastSpec> = { wardens: OX, redfang: BOAR, host: HORSE, hidekin: MOLE, veiled: CAMEL };

/** A draught animal seen from the side (facing right), `p`: 0 mid-stride, 1 / 2 the two strides; `bow` lowers the head (staggering). */
function beastSide(c: C2, s: BeastSpec, bx: number, p: number, far = false, bow = 0) {
  const swing = [0, 1.8, -1.8][p], gy = G - (far ? 1.4 : 0);
  const by = gy - s.leg - s.ry * 0.75, k = far ? 0.68 : 1;
  const col = far ? sh(s.col, 0.6) : s.col, legCol = s.bone ? (far ? 0x9a927c : SKIN.bone) : sh(col, 0.82);
  const leg = (hx: number, sw: number, hind: boolean, fk: number) => {
    const lift = sw > 0.5 ? 1 : 0, fx = hx + sw, fy = gy - lift, bend = hind ? -0.9 : 0.7;
    const kx = (hx + fx) / 2 + bend, ky = (by + fy) / 2;
    limb(c, [hx, by + s.ry * 0.3], [kx, ky], s.legW, s.legW * 0.8, sh(legCol, fk), { lo: 0.5 });
    limb(c, [kx, ky], [fx, fy - 0.3], s.legW * 0.8, s.legW * 0.9, sh(legCol, fk), { lo: 0.5 });
    if (s.bone) fillShape(c, ellipseP(kx, ky, 0.9, 0.9), css(sh(SKIN.bone, fk)));
    fillShape(c, ellipseP(fx + 0.3, fy, s.legW * 0.62, s.legW * 0.4), css(s.bone ? 0x2a2420 : 0x241812)); // hoof / claw pad
    if (s.col === MOLE.col) for (let i = -1; i <= 1; i++) line(c, [[fx + 1 + i * 0.1, fy - 0.2 + i * 0.7], [fx + 2.4, fy + i * 0.7]], 0xe3d6b8, 0.5);
  };
  const fx0 = bx + s.rx * 0.58, hx0 = bx - s.rx * 0.58;
  // far legs first, then body, then near legs
  leg(fx0 - 1.2, -swing, false, 0.62); leg(hx0 - 1.2, swing, true, 0.62);
  s.tail?.(c, bx - s.rx + 0.5, by - s.ry * 0.3);
  const body = ellipseP(bx, by, s.rx, s.ry);
  vol(c, body, col, [bx - s.rx, by - s.ry, s.rx * 2, s.ry * 2], { ao: 0.4, spec: s.bone ? 0.1 : 0.25 });
  if (!s.bone) grain(c, body, [bx - s.rx, by - s.ry, s.rx * 2, s.ry * 2], col, 91, 70, 0.22, 1, 0.1);
  if (!far) s.extra?.(c, bx, by);
  // neck + head
  const nx = bx + s.rx * 0.75, ny = by - s.ry * 0.3, hx = nx + s.neck[0], hy = ny + s.neck[1] + bow;
  if (s.bone) for (let i = 0; i < 5; i++) { const t = i / 4; disc(c, nx + (hx - nx) * t - 0.3, ny + (hy - ny) * t, 1.2, far ? 0x9a927c : SKIN.bone, 0.2); }
  else limb(c, [nx - 1.2, ny + 0.6], [hx + 0.6, hy + 1.4], s.ry * 1.1, s.ry * 0.75, col);
  s.head(c, hx - 0.6, hy - 0.4, p, far);
  leg(fx0 + 1.4, swing, false, 1); leg(hx0 + 1.4, -swing, true, 1);
  return { by, k };
}

// ---------------------------------------------------------------- the carts (local: x 0..35 left to right, ground y 0)
function cartSide(c: C2, clan: Clan, ang: number, wreck: 0 | 1 | 2) {
  const W = wreck === 2;
  // far wheel (a sliver behind the bed) then the axle
  const wy = -6.8, wx = 14;
  const rim = clan === "host" ? 0x4a4038 : clan === "veiled" ? 0x5a4a30 : clan === "redfang" ? 0x2e2218 : SKIN.wood;
  if (clan !== "hidekin") wheel(c, wx + 2.6, wy - 1.2, 6.2, ang + 0.4, rim, 0x3a3a38, 8, true);
  // shafts to the beast
  if (!W) { limb(c, [26, -14], [46, -15.4], 1.3, 1.1, SKIN.wood); limb(c, [26, -12], [46, -12.8], 1.1, 1, sh(SKIN.wood, 0.75)); }
  else { limb(c, [26, -12], [37, -2.4], 1.3, 1.1, SKIN.wood); }
  switch (clan) {
    case "wardens": {
      rect(c, 1, -17, 33, 8.4, 0x6b4a2a, { spec: 0.15 }); planks(c, 1, -17, 33, 8.4, 3, 0x6b4a2a);
      line(c, [[1, -17], [34, -17]], 0x3b4a2c, 1.1); line(c, [[1, -9.6], [34, -9.6]], 0x2a1c10, 1.1);
      const apex = W ? -26 : wreck === 1 ? -33 : -34.5;
      const can = blobPath([[2, -17.4], [2.6, -27], [9, apex], [18, apex - 1.4], [27, apex + 1], [32.6, -26], [33, -17.4]]);
      vol(c, can, 0xd8962c, [2, apex - 1.4, 31, 18], { ao: 0.4, spec: 0.25 });
      grain(c, can, [2, apex - 1.4, 31, 18], 0xd8962c, 17, 90, 0.2, 1.4, 1.2);
      for (let i = 0; i < 5; i++) { const x = 6 + i * 6; curve(c, [x - 1, -17.4], [x + (i - 2) * 0.3, apex + 4], [x - 0.6, apex + 1.6 - Math.abs(i - 2) * 0.9], 0x7a4a14, 0.6, 0.7); } // canvas ribs
      curve(c, [2.4, -18], [1.8, -26], [5, apex + 3], 0x2a1c10, 1.8, 0.9); // dark open back
      if (W) fillShape(c, poly([[14, -27], [19, -24], [16, -21], [12, -23]]), css(0x2a1a0c)); // torn hole
      disc(c, 20, -25.6, 2.2, 0xf0b44a, 0.5); line(c, [[20, -27.6], [20, -23.6]], 0x3b4a2c, 0.5); line(c, [[18, -25.6], [22, -25.6]], 0x3b4a2c, 0.5); // the sigil
      rect(c, 31, -23, 3.8, 1.4, SKIN.wood); line(c, [[34, -22], [34, -17]], SKIN.wood, 0.8); // driver's bench
      glow(c, 35, -20, 3.2, 0xffb040, 0.5); rect(c, 34.2, -21.4, 1.6, 2.4, 0xf0b44a);
      rect(c, 8, -13.6, 3, 4, 0x4a3018); line(c, [[8, -12], [11, -12]], 0x8a8a8a, 0.4); // a small water cask
      break;
    }
    case "redfang": {
      rect(c, 0, -14, 34, 6, 0x3e2c22); planks(c, 0, -14, 34, 6, 2, 0x3e2c22);
      line(c, [[0, -14], [34, -14]], 0x6a6a68, 1); line(c, [[0, -8.2], [34, -8.2]], 0x2a1c14, 1);
      for (let i = 0; i < 6; i++) { const x = 2.6 + i * 5.8; fillShape(c, poly([[x - 1, -14], [x + 1, -14], [x + 0.2, -20.4]]), css(0x8a8a88)); fillShape(c, poly([[x - 0.4, -14], [x + 0.2, -14], [x + 0.1, -19]]), css(0xcfcfcb)); }
      fillShape(c, poly([[0, -11], [-5, -12.6], [0, -13]]), css(0x8a8a88)); fillShape(c, poly([[0, -9], [-5.4, -9], [0, -10]]), css(0x8a8a88)); // rear spikes
      // loot: sacks, a chest with a gold glint, a pile of coins, a trophy skull
      vol(c, blobPath([[3, -14], [2, -19], [6, -22], [10, -19], [9, -14]]), 0xa08a5a, [2, -22, 8, 8], { ao: 0.35 }); line(c, [[5, -21.6], [7.5, -21.8]], 0x4a3418, 0.7);
      vol(c, blobPath([[10, -14], [10, -18], [14, -19.4], [17, -17], [16, -14]]), 0x7a6a48, [10, -19.4, 7, 5.4], { ao: 0.35 });
      rect(c, 18, -20.6, 9, 6.6, 0x5a3820); line(c, [[18, -18], [27, -18]], 0x8a8a8a, 0.8); disc(c, 22.5, -17.8, 0.8, SKIN.gold, 0.6);
      fillShape(c, poly([[18, -20.6], [27, -20.6], [26, -23], [19, -23]]), css(0x6a4528)); line(c, [[19, -22.4], [26, -22.4]], SKIN.gold, 0.5, 0.8);
      for (let i = 0; i < 7; i++) fillShape(c, ellipseP(28 + (i % 3) * 1.3, -15.6 - (i >> 1) * 0.9, 0.8, 0.5), css(i % 2 ? SKIN.gold : 0xffd860));
      skull(c, 32.6, -17.6, 1.5); // front post trophy
      line(c, [[4, -22], [4, -37]], 0x2a1c14, 0.9); fillShape(c, poly([[4, -37], [13, -35], [11, -33], [13, -31], [4, -31]]), css(0x9a1a14)); line(c, [[4.6, -34], [10, -33.6]], 0x5a1410, 0.5); // red banner
      break;
    }
    case "host": {
      rect(c, 0, -15, 35, 6.4, 0x23282a); planks(c, 0, -15, 35, 6.4, 2, 0x23282a);
      line(c, [[0, -15], [35, -15]], SKIN.bone, 0.9); for (let i = 0; i < 8; i++) fillShape(c, poly([[1 + i * 4.4, -15], [2.2 + i * 4.4, -15], [1.6 + i * 4.4, -12.4]]), css(SKIN.bone)); // bone fringe
      // coffin on the bed under three rib arches
      const cf = poly([[4, -15], [6, -22.6], [29, -22.6], [31, -15]]); vol(c, cf, 0x2f3836, [4, -22.6, 27, 8], { ao: 0.4, spec: 0.12 }); line(c, [[6, -22.6], [29, -22.6]], 0x4f7d6a, 0.7);
      for (const x of [11, 17, 23]) curve(c, [x, -15], [x + (x - 17) * 0.25, -37], [x + 0.5, W ? -26 : -33], SKIN.bone, 1.3);
      line(c, [[11, -29], [23, -29]], sh(SKIN.bone, 0.7), 0.5, 0.6);
      for (const x of [2.5, 32.5]) { line(c, [[x, -15], [x, -26]], 0x4a4038, 1); skull(c, x, -27.4, 1.7, 0x4fe8c0); }
      fillShape(c, poly([[3, -22], [9, -23], [8, -17.6], [6, -19], [4, -16]]), css(0x1f3a34, 0.9)); // a ragged teal shroud
      line(c, [[34, -26], [34, -33]], 0x4a4038, 0.8); glow(c, 34, -31, 4.2, 0x4fe8c0, 0.75); rect(c, 33.1, -33.6, 1.8, 3, 0x9ffff0); // lantern on a post
      break;
    }
    case "hidekin": {
      // a low sledge: two curling runners, a lashed bed, a mound of hides and roots
      for (const [y, k] of [[-0.6, 1], [-3, 0.7]] as const) { curve(c, [-3, y - 4 * k], [1, y + 1], [12, y], sh(0xe2c79a, k), 1.8); line(c, [[12, y], [36, y]], sh(0xe2c79a, k), 1.8); curve(c, [36, y], [40, y], [40, y - 3], sh(0xe2c79a, k), 1.8); }
      rect(c, 2, -11, 33, 5.4, 0x4a3018, { n: 40 }); planks(c, 2, -11, 33, 5.4, 2, 0x4a3018);
      for (const x of [8, 20, 31]) { line(c, [[x, -11.6], [x, -5]], 0xb49a6a, 1); line(c, [[x - 1.2, -9.8], [x + 1.2, -8.4]], 0xb49a6a, 0.5); }
      vol(c, blobPath([[3, -10.5], [2, -15], [8, -19.6], [16, -21.4], [25, -19.4], [32, -14.6], [34, -10.5]]), 0x8a5e30, [2, -21.4, 32, 11], { ao: 0.45 });
      vol(c, blobPath([[9, -14], [14, -22.6], [22, -22.8], [27, -16]]), 0x5a4430, [9, -22.8, 18, 8], { ao: 0.4 });
      curve(c, [4, -12], [14, -18], [30, -12.4], 0xb49a6a, 0.7); curve(c, [5, -15], [16, -22], [29, -15], 0x2a1c10, 0.5, 0.8); // lashings and a stitched seam
      for (let i = 0; i < 6; i++) { const x = 6 + i * 4.6, r = rng(i + 4); line(c, [[x, -17], [x + (r() - 0.5) * 6, -24 - r() * 3], [x + (r() - 0.5) * 9, -27 - r() * 3]], 0x4a3018, 0.9); } // roots
      for (const [x, y] of [[10, -21], [26, -19.6]]) fillShape(c, poly([[x - 1, y], [x + 1, y], [x + 0.2, y - 4.6]]), css(0xe3d6b8)); // bone spikes
      line(c, [[34, -11], [34, -16]], 0xb49a6a, 0.8); skull(c, 34, -17, 1.4); // a skull tag on the nose
      break;
    }
    case "veiled": {
      rect(c, 1, -14, 33, 5.8, 0x2a2a66); planks(c, 1, -14, 33, 5.8, 2, 0x2a2a66);
      line(c, [[1, -14], [34, -14]], 0xe0a030, 1); line(c, [[1, -8.4], [34, -8.4]], 0xe0a030, 0.6);
      const top = W ? -30 : -33;
      vol(c, poly([[4, -14], [4, top + 4], [31, top + 4], [31, -14]]), 0x3a3a82, [4, top + 4, 27, 19 - (W ? 0 : 0)], { ao: 0.4 });
      // the doorway and two drapes pulled aside, gold tassels
      fillShape(c, poly([[12, -14], [12, top + 8], [24, top + 8], [24, -14]]), css(0x1a1030));
      fillShape(c, poly([[11, -14], [11.6, top + 6], [15, top + 8], [14, -14]]), css(0x8a3a9a)); fillShape(c, poly([[25, -14], [24.4, top + 6], [21, top + 8], [22, -14]]), css(0x8a3a9a));
      for (const x of [5, 30]) { for (let i = 0; i < 3; i++) line(c, [[x + i * 0.8 - 0.8, top + 4.4], [x + i * 0.8 - 1, -15]], 0x161638, 0.5, 0.7); }
      // pagoda roof with gold eaves that curl up
      const roof = blobPath([[0, top + 5.4], [8, top + 3], [17.5, top - 4.6], [27, top + 3], [35, top + 5.4], [27, top + 4.4], [8, top + 4.4]]);
      vol(c, roof, 0x1e1e46, [0, top - 4.6, 35, 10], { ao: 0.4 }); line(c, [[0, top + 5.4], [8, top + 3.6], [27, top + 3.6], [35, top + 5.4]], 0xe0a030, 0.9);
      disc(c, 17.5, top - 5.2, 1.2, 0xe0a030, 0.6);
      // rune lanterns on cords from the eaves
      for (const x of [3, 32]) { line(c, [[x, top + 5], [x, top + 8]], 0xe0a030, 0.5); glow(c, x, top + 10.4, 3.6, wreck === 2 ? 0x6a3a9a : 0xffc040, 0.7); rect(c, x - 1.2, top + 8.4, 2.4, 3.6, 0xffd060); line(c, [[x - 0.6, top + 9.6], [x + 0.6, top + 11], [x - 0.4, top + 11]], 0x8a3a9a, 0.4); }
      break;
    }
  }
  // the near wheel (sledges ride on runners): torn off in the wreck
  if (clan !== "hidekin" && !W) wheel(c, wx, wy, 6.8, ang, rim, 0x4a4a48);
}

/** The cart seen head-on (`back` false: its front, the beast ahead of it) or from behind, centred on x = 0. */
function cartFB(c: C2, clan: Clan, back: boolean, wreck: 0 | 1 | 2) {
  const hw = clan === "hidekin" ? 10 : 9.5;
  for (const sx of [-1, 1]) { // wheels edge-on
    if (clan === "hidekin") continue;
    const x = sx * (hw + 0.2); vol(c, ellipseP(x, -6.6, 1.6, 6.6), clan === "host" ? 0x4a4038 : 0x4a3420, [x - 1.6, -13.2, 3.2, 13.2], { ao: 0.4 });
    line(c, [[x, -12], [x, -1.4]], 0x2a1c10, 0.5, 0.7);
  }
  if (clan === "hidekin") for (const sx of [-1, 1]) limb(c, [sx * 8, 0], [sx * 8, -3.4], 1.6, 1.6, 0xe2c79a);
  const body = (col: number, top: number, h: number) => { rect(c, -hw, top, hw * 2, h, col); planks(c, -hw, top, hw * 2, h, 2, col); };
  switch (clan) {
    case "wardens": {
      body(0x6b4a2a, -17, 8);
      const can = blobPath([[-hw, -16.8], [-hw, -26], [-5, -33.6], [5, -33.6], [hw, -26], [hw, -16.8]]);
      vol(c, can, 0xd8962c, [-hw, -33.6, hw * 2, 17], { ao: 0.4, spec: 0.25 }); grain(c, can, [-hw, -33.6, hw * 2, 17], 0xd8962c, 8, 60, 0.2, 1.4, 1.2);
      for (const x of [-5, 0, 5]) line(c, [[x, -16.8], [x * 0.9, -33]], 0x7a4a14, 0.5, 0.7);
      if (back) { fillShape(c, ellipseP(0, -22, 5.2, 5.2), css(0x2a1a0c)); disc(c, -2, -20, 1.8, 0xa08a5a); disc(c, 2, -19.4, 1.6, 0x7a6a48); } else { disc(c, 0, -26, 2.2, 0xf0b44a, 0.5); glow(c, 6, -15, 3, 0xffb040, 0.5); }
      break;
    }
    case "redfang": {
      body(0x3e2c22, -13, 6);
      line(c, [[-hw, -13], [hw, -13]], 0x6a6a68, 0.9);
      for (const x of [-9, -4.5, 0, 4.5, 9]) fillShape(c, poly([[x - 1, -13], [x + 1, -13], [x, -19]]), css(0x8a8a88));
      vol(c, blobPath([[-8, -13], [-9, -18], [-4, -21], [1, -18.6], [0, -13]]), 0xa08a5a, [-9, -21, 10, 8], { ao: 0.35 }); rect(c, 2, -19.6, 6.4, 6.6, 0x5a3820); disc(c, 5.2, -16.6, 0.8, SKIN.gold, 0.6);
      line(c, [[0, -20], [0, -31]], 0x2a1c14, 0.8); fillShape(c, poly([[0, -31], [7, -29.8], [0, -26.5]]), css(0x9a1a14));
      if (!back) skull(c, 0, -15.6, 1.6);
      break;
    }
    case "host": {
      body(0x23282a, -15, 6.4); line(c, [[-hw, -15], [hw, -15]], SKIN.bone, 0.8);
      vol(c, poly([[-8, -15], [-7, -22], [7, -22], [8, -15]]), 0x2f3836, [-8, -22, 16, 7], { ao: 0.4 });
      for (const x of [-hw + 1, hw - 1]) { line(c, [[x, -15], [x, -27]], 0x4a4038, 0.9); skull(c, x, -28.4, 1.6, 0x4fe8c0); }
      curve(c, [-hw + 1, -22], [0, -40], [hw - 1, -22], SKIN.bone, 1.3);
      glow(c, 0, -26, 4, 0x4fe8c0, back ? 0.5 : 0.8); rect(c, -0.9, -27.4, 1.8, 3, 0x9ffff0);
      break;
    }
    case "hidekin": {
      rect(c, -hw, -10.4, hw * 2, 4.6, 0x4a3018, { n: 24 });
      vol(c, blobPath([[-hw, -10], [-hw + 1, -17], [-4, -22], [4, -22], [hw - 1, -17], [hw, -10]]), 0x8a5e30, [-hw, -22, hw * 2, 12], { ao: 0.45 });
      vol(c, blobPath([[-5, -14], [-2, -22.6], [4, -22], [6, -15]]), 0x5a4430, [-5, -22.6, 11, 8], { ao: 0.4 });
      for (let i = 0; i < 5; i++) { const r = rng(i + 30); line(c, [[-7 + i * 3.4, -17], [-7 + i * 3.4 + (r() - 0.5) * 6, -25 - r() * 3]], 0x4a3018, 0.8); }
      line(c, [[-hw, -13], [hw, -13]], 0xb49a6a, 0.6);
      if (!back) skull(c, 0, -11, 1.4);
      break;
    }
    case "veiled": {
      body(0x2a2a66, -14, 5.8); line(c, [[-hw, -14], [hw, -14]], 0xe0a030, 0.9);
      vol(c, poly([[-8, -14], [-8, -29], [8, -29], [8, -14]]), 0x3a3a82, [-8, -29, 16, 15], { ao: 0.4 });
      if (back) { fillShape(c, poly([[-4, -14], [-4, -27], [4, -27], [4, -14]]), css(0x1a1030)); fillShape(c, poly([[-5, -14], [-4.6, -27], [-2, -27], [-3, -14]]), css(0x8a3a9a)); fillShape(c, poly([[5, -14], [4.6, -27], [2, -27], [3, -14]]), css(0x8a3a9a)); }
      else { disc(c, 0, -22, 2.6, 0xe0a030, 0.5); line(c, [[0, -24], [0, -20]], 0x1e1e46, 0.6); line(c, [[-2, -22], [2, -22]], 0x1e1e46, 0.6); }
      vol(c, blobPath([[-12, -29], [-6, -34], [0, -39], [6, -34], [12, -29], [0, -30.6]]), 0x1e1e46, [-12, -39, 24, 10], { ao: 0.4 }); line(c, [[-12, -29], [0, -30.4], [12, -29]], 0xe0a030, 0.8);
      for (const x of [-9, 9]) { glow(c, x, -26, 3.4, wreck ? 0x6a3a9a : 0xffc040, 0.7); rect(c, x - 1, -27.6, 2, 3.2, 0xffd060); }
      break;
    }
  }
}

/** Beast seen head-on / from behind (smaller, the cart hides most of it from behind). */
function beastFB(c: C2, clan: Clan, cx: number, gy: number, back: boolean, p: number) {
  const s = BEASTS[clan], sw = [0, 1, -1][p];
  const legCol = s.bone ? SKIN.bone : sh(s.col, 0.8), lw = Math.max(1.2, s.legW * 0.75), w = clan === "hidekin" ? 5 : 3;
  for (const sx of [-1, 1]) {
    const lift = (sx * sw > 0 ? 1.3 : 0), x = cx + sx * w;
    limb(c, [x, gy - s.leg - 1], [x, gy - lift], lw, lw * 0.9, legCol, { lo: 0.5 });
    fillShape(c, ellipseP(x, gy - lift, lw * 0.7, lw * 0.4), css(0x241812));
  }
  s.front(c, cx, gy - s.leg - s.ry * 0.9, back);
}

/** Ground clutter around a wrecked cart: planks, a loose wheel and the clan's spilled goods. */
function wreckDebris(c: C2, clan: Clan) {
  const r = rng(77);
  const rim = clan === "host" ? 0x4a4038 : clan === "veiled" ? 0x5a4a30 : clan === "redfang" ? 0x2e2218 : SKIN.wood;
  if (clan !== "hidekin") { // the wheel that came off, lying on its rim
    c.save(); c.translate(42, G - 2); c.scale(1, 0.38); wheel(c, 0, 0, 6.4, 0.4, rim, 0x4a4a48, 8); c.restore();
  } else { limb(c, [44, G - 1.4], [56, G - 2.6], 1.8, 1.8, 0xe2c79a); } // a runner snapped off
  for (let i = 0; i < 4; i++) { const x = 8 + i * 12 + r() * 4, y = G - 1 - r() * 1.6; limb(c, [x, y], [x + 4 + r() * 3, y + (r() - 0.5) * 1.4], 1.1, 1, i % 2 ? SKIN.wood : 0x4a3420); }
  const gold = (n: number, x0: number) => { for (let i = 0; i < n; i++) fillShape(c, ellipseP(x0 + r() * 12, G - 0.8 - r() * 2.4, 0.8, 0.5), css(i % 2 ? SKIN.gold : 0xffd860)); };
  switch (clan) {
    case "wardens": vol(c, blobPath([[48, G], [47, G - 4], [52, G - 5.6], [56, G - 3.6], [55, G]]), 0xc9b27a, [47, G - 5.6, 9, 5.6], { ao: 0.35 }); line(c, [[50, G - 5.2], [53, G - 5.4]], 0x4a3418, 0.6); gold(8, 52); break;
    case "redfang": vol(c, blobPath([[46, G], [46, G - 4], [50, G - 5], [53, G - 2.6], [52, G]]), 0xa08a5a, [46, G - 5, 7, 5], { ao: 0.35 }); rect(c, 56, G - 4.4, 7, 4.4, 0x5a3820); disc(c, 59, G - 5.2, 0.8, SKIN.gold); gold(16, 50); break;
    case "host": skull(c, 50, G - 1.8, 1.7, 0x4fe8c0); for (let i = 0; i < 6; i++) limb(c, [52 + i * 2, G - 1], [54 + i * 2 + r() * 2, G - 1.6 - r()], 0.8, 0.8, SKIN.bone); glow(c, 62, G - 2, 4, 0x4fe8c0, 0.45); rect(c, 60.6, G - 3.2, 2.8, 3.2, 0x1f3a34); break;
    case "hidekin": vol(c, blobPath([[46, G], [46, G - 3], [52, G - 5], [58, G - 2.6], [57, G]]), 0x8a5e30, [46, G - 5, 12, 5], { ao: 0.4 }); for (let i = 0; i < 3; i++) line(c, [[50 + i * 3, G - 3], [52 + i * 3, G - 7 + i]], 0x4a3018, 0.8); break;
    case "veiled": rect(c, 48, G - 3, 4, 3, 0xffd060); glow(c, 50, G - 1.6, 4, 0x8a3a9a, 0.5); vol(c, blobPath([[54, G], [54, G - 3], [60, G - 4], [64, G]]), 0x3a3a82, [54, G - 4, 10, 4], { ao: 0.35 }); line(c, [[54, G - 1], [64, G - 1]], 0xe0a030, 0.6); gold(8, 52); break;
  }
}

/** One frame of a clan's cart sheet; `sc` is the shadow layer. */
export function paintCart(c: C2, sc: C2 | null, key: string, f: number) {
  const clan = key.replace(/^mob_war_cart_/, "").replace(/^war_cart_/, "") as Clan;
  const dir: Dir = f === 12 || f === 13 ? "right" : f < 6 ? (["down", "up", "right"] as Dir[])[f >> 1] : (["down", "up", "right"] as Dir[])[(f - 6) % 3];
  const p = f < 6 ? (f % 2 ? 1 : 2) : f < 9 ? 0 : f < 12 ? 0 : 0, idle = f >= 6 && f < 9, bob = !idle && f < 12 && f % 2 ? 0.5 : 0;
  const ang = f < 6 ? (f % 2) * 0.45 : f * 0.2;
  if (dir === "right") {
    const stage = f === 12 ? 1 : f === 13 ? 2 : 0;
    shadow(sc, 36, G + 0.6, stage === 2 ? 30 : 33, 3.3);
    if (stage === 2) { // wrecked: the rear sags on a dead axle, the beast is gone, goods strewn about
      c.save(); c.translate(3, G); c.translate(30, -3); c.rotate(-0.2); c.translate(-30, 3); cartSide(c, clan, ang, 2); c.restore();
      wreckDebris(c, clan);
      return;
    }
    const bx = clan === "hidekin" ? 52 : 51.5;
    if (clan === "redfang") beastSide(c, BEASTS.redfang, bx - 3.4, p === 1 ? 2 : 1, true, stage ? 2 : 0); // the second boar of the team
    c.save(); c.translate(0, -bob);
    if (stage === 1) { c.translate(2, G); c.translate(30, -3); c.rotate(-0.08); c.translate(-30, 3); cartSide(c, clan, 0.3, 1); }
    else { c.translate(1, G); cartSide(c, clan, ang, 0); }
    c.restore(); c.save(); c.translate(0, -bob);
    beastSide(c, BEASTS[clan], bx, stage ? 0 : p, false, stage ? 3.4 : 0);
    c.restore();
    if (stage === 1) { limb(c, [10, G - 1.2], [15, G - 0.8], 1.1, 1, 0x4a3420); line(c, [[3, G - 11], [6, G - 14]], 0x1a1410, 0.5); } // a plank has dropped
    return;
  }
  const cx = 36;
  shadow(sc, cx, G - 2, 13, 3);
  c.save(); c.translate(0, -bob);
  if (dir === "down") {
    c.save(); c.translate(cx, G - 14); c.scale(0.76, 0.76); cartFB(c, clan, false, 0); c.restore(); // the cart behind the beast, smaller: it is further off
    beastFB(c, clan, cx, G - 0.5, false, p);
  } else {
    beastFB(c, clan, cx, G - 15, true, p); // the beast ahead, seen from behind, mostly hidden by the cart
    c.save(); c.translate(cx, G - 1); cartFB(c, clan, true, 0); c.restore();
  }
  c.restore();
}
