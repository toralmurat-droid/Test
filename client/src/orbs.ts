import "./orbs.css";

/**
 * Bottom HUD in the Diablo style (Murat 2026-11-07, from his reference picture): a red health orb on the left and a
 * blue mana orb on the right, framed in bronze, each guarded by a crouching stone gargoyle, with a dark plate between
 * them holding the XP bar, the skill bar and the potions (#hotbar and #xpbar are laid over the plate).
 *
 * The orbs are pixel art drawn per pixel (ImageData) at 1 canvas px per CSS px: glass sphere, liquid filled to the
 * current value with a gently sloshing surface, a glossy highlight, a bronze rim. Redrawn only when the level moves
 * or, while it is not full or empty, a few times a second for the slosh.
 */

const SIZE = 92; // orb canvas, CSS px
const C = SIZE / 2, R_IN = 36, R_OUT = 44;

type Pal = { deep: number[]; mid: number[]; hi: number[]; empty: number[] };
const RED: Pal = { deep: [70, 6, 12], mid: [168, 26, 36], hi: [236, 92, 84], empty: [22, 8, 10] };
const BLUE: Pal = { deep: [8, 16, 64], mid: [32, 72, 176], hi: [110, 160, 240], empty: [8, 10, 24] };

const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const buffers = new WeakMap<CanvasRenderingContext2D, ImageData>(); // one pixel buffer per orb, reused (no garbage per redraw)

function drawOrb(ctx: CanvasRenderingContext2D, frac: number, pal: Pal, t: number) {
  let img = buffers.get(ctx);
  if (!img) { img = ctx.createImageData(SIZE, SIZE); buffers.set(ctx, img); }
  const d = img.data;
  const level = C + R_IN - 2 * R_IN * Math.max(0, Math.min(1, frac)); // y of the liquid surface
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = x + 0.5 - C, dy = y + 0.5 - C, r = Math.hypot(dx, dy);
    if (r > R_OUT) continue;
    let c: number[];
    if (r <= R_IN) {
      // the liquid surface sloshes a little; a lighter band right under it
      const surf = level + Math.sin(x * 0.28 + t * 2.2) * 1.2 + Math.sin(x * 0.11 - t * 1.3) * 0.8;
      const sphere = 1 - r / R_IN; // 1 at the middle: lit like a ball from the top left
      const lit = Math.max(0, Math.min(1, 0.35 + sphere * 0.5 - (dx + dy) / (R_IN * 4)));
      if (frac > 0 && y + 0.5 >= surf) {
        c = lit > 0.5 ? mix(pal.mid, pal.hi, (lit - 0.5) * 2) : mix(pal.deep, pal.mid, lit * 2);
        if (y + 0.5 - surf < 1.6) c = mix(c, pal.hi, 0.55); // the surface line
        // swirl of darker streaks inside the liquid
        if (Math.sin(dx * 0.35 + dy * 0.2 + t) * Math.sin(dy * 0.3 - t * 0.7) > 0.72) c = mix(c, pal.deep, 0.35);
      } else {
        c = mix([4, 4, 6], pal.empty, lit); // dark empty glass
      }
      // edge of the glass darkens; glossy highlight top left; a thin reflection bottom right
      c = mix(c, [0, 0, 0], Math.max(0, (r - R_IN * 0.78) / (R_IN * 0.22)) * 0.55);
      const hx = dx + R_IN * 0.38, hy = dy + R_IN * 0.42;
      if ((hx * hx) / 110 + (hy * hy) / 50 < 1) c = mix(c, [255, 255, 255], 0.5 - ((hx * hx) / 110 + (hy * hy) / 50) * 0.35);
      if (r > R_IN * 0.8 && r < R_IN * 0.9 && dx > 0 && dy > 0 && dx * 0.6 < dy * 1.6 && dy * 0.6 < dx * 1.6) c = mix(c, [255, 255, 255], 0.18);
    } else {
      // bronze rim: dark edges, light on the top left, rivets
      const k = (r - R_IN) / (R_OUT - R_IN); // 0 inner .. 1 outer
      const edge = k < 0.18 || k > 0.82;
      const light = Math.max(0, Math.min(1, 0.5 - (dx + dy) / (R_OUT * 2.4)));
      c = edge ? [26, 18, 10] : mix([92, 62, 26], [224, 178, 90], light);
      const a = Math.atan2(dy, dx), rivet = Math.abs(((a / (Math.PI * 2)) * 12 + 12) % 1 - 0.5) < 0.06 && k > 0.35 && k < 0.65;
      if (rivet) c = [250, 222, 150];
    }
    const o = (y * SIZE + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** A crouching stone gargoyle (pixel art, drawn small and shown scaled up), facing `side`. */
function drawGargoyle(cv: HTMLCanvasElement, mirror: boolean) {
  const W = 30, H = 40;
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
  const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const D = "#1a1714", M = "#3a342c", L = "#5e554a", H2 = "#857a6a", EYE = "#c0392b";
  // plinth
  px(2, 34, 26, 6, D); px(3, 34, 24, 2, L); px(3, 36, 24, 3, M);
  // folded wing behind (a jagged fan)
  for (let i = 0; i < 6; i++) px(3 + i * 2, 8 + i * 2, 3, 22 - i * 2, i % 2 ? D : M);
  px(2, 6, 3, 4, D); px(4, 5, 2, 2, M);
  // haunches and body
  px(12, 22, 14, 12, D); px(13, 22, 12, 11, M); px(14, 23, 6, 4, L);
  px(15, 14, 10, 10, D); px(16, 14, 8, 9, M); px(17, 15, 4, 3, L);
  // arms down to the plinth, claws
  px(23, 22, 4, 12, D); px(24, 22, 2, 11, M); px(22, 33, 6, 1, H2);
  // head: brow, snout, horns, glowing eye
  px(19, 6, 10, 9, D); px(20, 7, 8, 7, M); px(21, 7, 4, 2, L);
  px(26, 11, 4, 3, D); px(27, 11, 2, 2, M); // snout
  px(19, 2, 2, 5, D); px(18, 1, 2, 2, M); px(25, 3, 2, 4, D); px(26, 2, 2, 2, M); // horns
  px(24, 9, 2, 1, EYE);
  px(27, 14, 1, 2, H2); px(29, 14, 1, 1, H2); // fangs
  px(16, 23, 1, 1, H2); px(14, 30, 1, 1, H2); // worn highlights
}

export class OrbHud {
  private hp: HTMLCanvasElement;
  private mp: HTMLCanvasElement;
  private hpTxt: HTMLElement;
  private mpTxt: HTMLElement;
  private plate: HTMLElement;
  private root: HTMLElement;
  private last = { hp: -1, mp: -1, at: 0, w: -1 };

  constructor(hud: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "orbhud";
    this.root.innerHTML =
      `<div id="orbplate"></div>` +
      `<div class="orb hp" title="Health"><canvas width="${SIZE}" height="${SIZE}"></canvas><span></span></div>` +
      `<div class="orb mp" title="Mana"><canvas width="${SIZE}" height="${SIZE}"></canvas><span></span></div>` +
      `<canvas class="garg left"></canvas><canvas class="garg right"></canvas>`;
    hud.prepend(this.root);
    this.plate = this.root.querySelector("#orbplate")!;
    [this.hp, this.mp] = Array.from(this.root.querySelectorAll(".orb canvas")) as HTMLCanvasElement[];
    [this.hpTxt, this.mpTxt] = Array.from(this.root.querySelectorAll(".orb span")) as HTMLElement[];
    const [gl, gr] = Array.from(this.root.querySelectorAll(".garg")) as HTMLCanvasElement[];
    drawGargoyle(gl, false);
    drawGargoyle(gr, true);
    document.body.classList.add("orbhud-on");
  }

  /** Values written inside the orbs all the time (the "bar numbers" setting), else only on hover. */
  setNumbers(on: boolean) { this.root.classList.toggle("nums", on); }

  update(hp: number, maxHp: number, mp: number, maxMp: number) {
    const now = performance.now();
    const fh = maxHp > 0 ? hp / maxHp : 0, fm = maxMp > 0 ? mp / maxMp : 0;
    // the plate is as wide as the skill bar laid over it; the orbs sit at its ends
    const bar = document.getElementById("hotbar");
    const w = bar ? bar.offsetWidth : 0;
    if (w > 0 && w !== this.last.w) { this.root.style.setProperty("--barw", `${w}px`); this.last.w = w; }
    const moving = (fh > 0 && fh < 1) || (fm > 0 && fm < 1);
    if (Math.abs(fh - this.last.hp) < 0.004 && Math.abs(fm - this.last.mp) < 0.004 && (!moving || now - this.last.at < 120)) return;
    const t = now / 1000;
    drawOrb(this.hp.getContext("2d")!, fh, RED, t);
    drawOrb(this.mp.getContext("2d")!, fm, BLUE, t + 1.7);
    this.hpTxt.textContent = `${Math.ceil(hp)} / ${Math.round(maxHp)}`;
    this.mpTxt.textContent = `${Math.floor(mp)} / ${Math.round(maxMp)}`;
    this.last.hp = fh; this.last.mp = fm; this.last.at = now;
  }
}
