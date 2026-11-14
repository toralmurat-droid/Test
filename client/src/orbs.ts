import { hotbarWidth } from "./hudcache";
import "./orbs.css";
import { orbNeedsRedraw, orbTexts } from "./hudLogic";
import { uiScale } from "./worldscale";

/**
 * Bottom HUD in the Diablo style (Murat 2026-11-07, from his reference picture): a red health orb on the left and a
 * blue mana orb on the right, framed in bronze, guarded by a demon statue (left) and an angel statue (right), with a dark plate between
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
const GOLD: Pal = { deep: [70, 40, 4], mid: [196, 140, 24], hi: [255, 226, 120], empty: [24, 16, 6] }; // the Songweaver's song gauge

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

/**
 * The two statues guarding the orbs (Murat 2026-11-07): a demon of dark red stone on the left, an angel of pale marble
 * on the right. Painted small (44 x 60) with shapes and shown scaled up, pixelated.
 */
const ST_W = 44, ST_H = 60;
function statueCanvas(cv: HTMLCanvasElement) {
  cv.width = ST_W; cv.height = ST_H;
  const g = cv.getContext("2d")!;
  const poly = (pts: number[][], c: string) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
  const ell = (x: number, y: number, rx: number, ry: number, c: string, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
  const line = (pts: number[][], c: string, w: number) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke(); };
  const plinth = (dark: string, mid: string, light: string) => {
    poly([[5, 51], [39, 51], [41, 60], [3, 60]], dark); poly([[6, 51], [38, 51], [38, 53], [6, 53]], light); poly([[5, 54], [39, 54], [40, 59], [4, 59]], mid);
    line([[8, 56], [36, 56]], dark, 0.6);
  };
  return { g, poly, ell, line, plinth };
}

function drawDemon(cv: HTMLCanvasElement) {
  const { g, poly, ell, line, plinth } = statueCanvas(cv);
  const D = "#1c1010", M = "#3c2220", L = "#5e3a33", H = "#80564a";
  // bat wings spread behind: ribs and a ragged membrane
  for (const s of [-1, 1]) {
    const cx = 22, x = (v: number) => cx + s * v;
    poly([[x(3), 26], [x(18), 6], [x(21), 3], [x(20), 12], [x(22), 16], [x(17), 22], [x(19), 27], [x(12), 30], [x(9), 36]], D);
    poly([[x(4), 26], [x(17), 9], [x(18), 14], [x(15), 21], [x(10), 28]], M);
    line([[x(4), 26], [x(18), 7]], L, 0.9); line([[x(6), 27], [x(19), 17]], L, 0.7); line([[x(8), 29], [x(16), 24]], L, 0.7);
  }
  // crouched body, hunched shoulders, clawed arms down to the plinth
  ell(22, 41, 9, 10, D); ell(22, 40, 8, 9, M); ell(20, 37, 4, 5, L);
  poly([[13, 33], [31, 33], [28, 42], [16, 42]], M);
  line([[14, 36], [12, 44], [13, 50]], D, 3); line([[30, 36], [32, 44], [31, 50]], D, 3);
  line([[14, 36], [12, 44], [13, 50]], L, 1.2); line([[30, 36], [32, 44], [31, 50]], M, 1.4);
  for (const x of [11, 13, 15, 29, 31, 33]) line([[x, 50], [x - 0.5, 51.5]], H, 0.7); // claws
  // tail curling round the plinth
  line([[28, 47], [36, 49], [39, 46], [37, 43]], D, 1.6); poly([[36, 42], [39, 40], [38, 44]], M);
  // head: snout, brow, curved horns, glowing eyes
  ell(22, 28, 5.5, 5, D); ell(22, 27.5, 4.6, 4.2, M); ell(21, 26.5, 2.2, 1.6, L);
  poly([[19, 30], [25, 30], [23, 33], [21, 33]], M);
  for (const s of [-1, 1]) { line([[22 + s * 3, 24], [22 + s * 7, 20], [22 + s * 7.5, 15], [22 + s * 5.5, 13]], D, 2.2); line([[22 + s * 3, 24], [22 + s * 7, 20], [22 + s * 7.5, 15]], H, 0.7); }
  g.fillStyle = "#ff4a2e"; g.fillRect(19, 27, 1.6, 1); g.fillRect(23.4, 27, 1.6, 1);
  g.fillStyle = "rgba(255,80,40,0.35)"; g.fillRect(18, 26, 8, 3);
  plinth("#140c0b", "#2e1c1a", "#4a302b");
}

function drawAngel(cv: HTMLCanvasElement) {
  const { g, poly, ell, line, plinth } = statueCanvas(cv);
  const D = "#4a4640", M = "#8a847a", L = "#b8b1a4", H = "#e2dccd";
  // halo
  g.strokeStyle = "#e8c56a"; g.lineWidth = 1.4; g.beginPath(); g.ellipse(22, 9, 6, 2, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(255,226,140,0.35)"; g.lineWidth = 3; g.stroke();
  // feathered wings raised behind
  for (const s of [-1, 1]) {
    const x = (v: number) => 22 + s * v;
    poly([[x(3), 22], [x(9), 8], [x(16), 2], [x(20), 5], [x(19), 14], [x(20), 22], [x(16), 30], [x(18), 38], [x(10), 40], [x(5), 34]], D);
    poly([[x(4), 22], [x(10), 10], [x(16), 4], [x(18), 8], [x(17), 16], [x(14), 28], [x(8), 34]], M);
    for (let k = 0; k < 5; k++) line([[x(6 + k * 2), 14 + k * 3], [x(10 + k * 2.2), 26 + k * 2.5]], L, 0.8); // feathers
    line([[x(10), 9], [x(16), 4]], H, 0.8);
  }
  // robed body, folds falling to the plinth
  poly([[16, 22], [28, 22], [32, 51], [12, 51]], D); poly([[17, 22], [27, 22], [30, 50], [14, 50]], M);
  for (const x of [17, 20, 23, 26]) line([[x + 1, 30], [x, 50]], D, 0.6);
  line([[18, 24], [16, 49]], L, 1); line([[19, 24], [18, 40]], H, 0.6);
  // hands together in prayer, head bowed
  poly([[20, 27], [24, 27], [22.5, 22], [21.5, 22]], L); line([[17, 27], [20, 28]], M, 1.4); line([[27, 27], [24, 28]], M, 1.4);
  ell(22, 16.5, 3.6, 4.2, D); ell(22, 16.5, 3, 3.6, L); ell(21, 15.5, 1.4, 1.6, H);
  poly([[18.5, 14], [25.5, 14], [26, 21], [18, 21]], "rgba(74,70,64,0.6)"); // veil of hair
  plinth("#3a3732", "#6a655c", "#9e978a");
}

export class OrbHud {
  private hp: HTMLCanvasElement;
  private mp: HTMLCanvasElement;
  private hpTxt: HTMLElement;
  private mpTxt: HTMLElement;
  private plate: HTMLElement;
  private root: HTMLElement;
  private level: HTMLElement;
  private last = { hp: -1, mp: -1, at: 0, w: -1, hpTxt: "", mpTxt: "" };

  constructor(hud: HTMLElement) {
    addEventListener("resize", () => requestAnimationFrame(() => this.layout()));
    this.root = document.createElement("div");
    this.root.id = "orbhud";
    this.root.innerHTML =
      `<div id="orbplate"></div>` +
      `<div class="orb hp" title="Health"><canvas width="${SIZE}" height="${SIZE}"></canvas><span></span></div>` +
      `<div class="orb mp" title="Mana"><canvas width="${SIZE}" height="${SIZE}"></canvas><span></span><em class="olabel"></em></div>` +
      `<canvas class="garg left"></canvas><canvas class="garg right"></canvas>`;
    hud.prepend(this.root);
    // One row on the plate: the skill bar, a separator, then the menu buttons (Murat 2026-11-07)
    const row = document.createElement("div");
    row.id = "hudbar";
    const hotbar = document.getElementById("hotbar"), menu = document.getElementById("menubtns");
    if (hotbar && menu) {
      hotbar.parentElement!.insertBefore(row, hotbar);
      const sep = document.createElement("i"); sep.className = "hsep";
      row.append(hotbar, sep, menu);
    }
    // on the HUD itself (not in #orbhud's layer), so it sits over the XP bar
    this.level = document.createElement("div");
    this.level.id = "orblevel"; this.level.title = "Level";
    this.level.innerHTML = "<small>LV</small><b></b>";
    hud.appendChild(this.level);
    this.plate = this.root.querySelector("#orbplate")!;
    [this.hp, this.mp] = Array.from(this.root.querySelectorAll(".orb canvas")) as HTMLCanvasElement[];
    [this.hpTxt, this.mpTxt] = Array.from(this.root.querySelectorAll(".orb span")) as HTMLElement[];
    const [gl, gr] = Array.from(this.root.querySelectorAll(".garg")) as HTMLCanvasElement[];
    drawDemon(gl);
    drawAngel(gr);
    document.body.classList.add("orbhud-on");
  }

  /** The hero's level, in the bronze medallion over the XP bar. */
  setLevel(n: number) { const b = this.level.lastElementChild!; if (b.textContent !== String(n)) b.textContent = String(n); }

  /** Values written inside the orbs all the time (the "bar numbers" setting), else only on hover. */
  setNumbers(on: boolean) { this.root.classList.toggle("nums", on); }

  /** The plate is as wide as the skill bar laid over it; the orbs sit at its ends. Also run on window resize. */
  layout() {
    const w = hotbarWidth();
    if (w > 0 && w !== this.last.w) { document.body.style.setProperty("--barw", `${w}px`); this.last.w = w; } // the menu buttons use it too
    // Room left of the health orb: too little for chat beside the demon statue -> the statue goes, chat moves up
    // (w is in the bar's own px: the bar is zoomed by --barzoom, inside the HUD zoom, see hudSlots.ts)
    const bz = Number(document.documentElement.style.getPropertyValue("--barzoom")) || 1;
    const tight = w > 0 && (innerWidth / uiScale() - w * bz) / 2 - 112 * bz < 330;
    if (tight !== document.body.classList.contains("hud-tight")) document.body.classList.toggle("hud-tight", tight);
  }

  private song = false;

  /** The Songweaver's right orb is the song gauge: gold, labelled "Song", pulsing when nearly full. */
  private setSong(on: boolean) {
    if (on === this.song) return;
    this.song = on; this.last.mp = -1;
    const orb = this.mp.parentElement!;
    orb.classList.toggle("song", on);
    orb.title = on ? "Song gauge" : "Mana";
    (orb.querySelector(".olabel") as HTMLElement).textContent = on ? "Song" : "";
    if (!on) orb.classList.remove("full");
  }

  update(hp: number, maxHp: number, mp: number, maxMp: number, song = false) {
    this.setSong(song);
    if (song) this.mp.parentElement!.classList.toggle("full", maxMp > 0 && mp / maxMp >= 0.9);
    const now = performance.now();
    const fh = maxHp > 0 ? hp / maxHp : 0, fm = maxMp > 0 ? mp / maxMp : 0;
    this.layout();
    const { hpTxt, mpTxt } = orbTexts(hp, maxHp, mp, maxMp);
    if (!orbNeedsRedraw(this.last, fh, fm, hpTxt, mpTxt, now)) return;
    const t = now / 1000;
    drawOrb(this.hp.getContext("2d")!, fh, RED, t);
    drawOrb(this.mp.getContext("2d")!, fm, song ? GOLD : BLUE, t + 1.7);
    this.hpTxt.textContent = hpTxt;
    this.mpTxt.textContent = mpTxt;
    this.last.hp = fh; this.last.mp = fm; this.last.at = now; this.last.hpTxt = hpTxt; this.last.mpTxt = mpTxt;
  }
}
