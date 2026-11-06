import { respecCost } from "../../shared/upkeep";
import { ClassKind, CLASSES } from "../../shared/classes";
import { icon as pxIcon } from "./pixelicons";
import { SLOT_KEYS } from "../../shared/slots";
import { Stats } from "../../shared/powers";
import { iconImg } from "./skillIcons";
import { SheetPreview, talentsOf } from "./sidepanel";
import {
  BRANCHES, childrenOf, EFFECT_TEXT, levelPower, lockReason, MAX_RANK, RANK_POWER, rankOf, SkillDef, SKILLS, spentPoints, STACK_NAME,
  synergyPower, talentPoints,
  NEED_TEXT,
} from "../../shared/skills";
import { damageText, scaleText, skillDamage } from "../../shared/skillInfo";

/**
 * Skill tree screen (T), drawn as a real pixel-art tree (shared/skills.ts TREE): a trunk splits into the class's
 * three boughs; every skill sits where its limb grows, higher up the more level it needs. Some limbs fork, some
 * strong skills are dead ends crowned with leaves. Learned limbs are green and leafy, the rest bare wood.
 * Hover a skill to read it (damage for your current stats, attribute scaling, cost), click it to spend a point.
 * Learned actives go on keys 1-0: hover the skill and press a number key, or click a key slot at the bottom.
 */
const W = 600, H = 470; // tree area, CSS px (the canvas is drawn at half that: 2 px per art pixel)
const TOP = 34, GROUND = H - 46;
// square-root scale: the early levels, where most skills sit, get more room. `top`: the class's highest skill level
// (24 for most, 30 for the wizard's Diablo 2 style tiers) sits at the top.
const yOf = (req: number, top: number) => GROUND - 40 - Math.sqrt(Math.min(1, (req - 1) / Math.max(1, top - 1))) * (GROUND - 40 - TOP);
const GAP = 66; // a skill sits at least this far above the one it grows from

interface Node { s: SkillDef; x: number; y: number }

export class TalentMenu {
  private el = document.getElementById("tree")!;
  private sig = "";
  private hover = "";
  private shown = "";
  private cls?: ClassKind;
  private state: any;

  constructor(private send: (type: string, msg?: unknown) => void, private preview: (p?: SheetPreview) => void = () => {}) {
    this.el.addEventListener("mouseover", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      const was = this.hover;
      this.hover = t?.dataset.talent ?? "";
      // the side panel's stats block shows what one more rank would change (passives: health, damage, defense...)
      if (this.hover !== was) {
        const def = this.cls && this.hover ? SKILLS[this.cls].find((n) => n.id === this.hover) : undefined;
        if (def && t!.classList.contains("can")) {
          const ranks = talentsOf(this.state);
          ranks[def.id] = (ranks[def.id] ?? 0) + 1;
          this.preview({ label: `learn ${def.name}${ranks[def.id] > 1 ? ` rank ${ranks[def.id]}` : ""}`, talents: ranks });
        } else this.preview();
      }
      if (this.hover && this.hover !== this.shown) this.details(this.hover);
    });
    this.el.addEventListener("mouseleave", () => { this.hover = ""; this.preview(); });
    this.el.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      if (t && t.classList.contains("can")) this.send("learn", t.dataset.talent);
      if (t) this.details(t.dataset.talent!);
      if ((ev.target as HTMLElement).id === "treereset") this.send("respec");
    });
    // Buttons never keep keyboard focus, so Space in a fight can't click a node by accident
    this.el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
  }

  get open() { return !this.el.hidden; }

  /** Learned active skill under the mouse, so a number key can slot it. */
  hoveredActive(): string | undefined {
    if (!this.open || !this.cls || !this.hover) return undefined;
    const btn = this.el.querySelector(`[data-talent="${this.hover}"][data-active]`) as HTMLElement | null;
    return btn?.dataset.active;
  }
  /** The side panel just showed the Skills tab: draw it now. */
  reset(state: any) { this.sig = ""; this.refresh(state); }

  private stats(): Stats {
    const m = this.state;
    return { sta: m.sta, str: m.str, mag: m.mag, dex: m.dex ?? 0 };
  }

  /** Rebuild only when something shown changed. */
  refresh(state: any) {
    if (!this.open || !state) return;
    this.state = state;
    const ranks = state.talents;
    const cls = state.cls as ClassKind;
    this.cls = cls;
    const nodes = SKILLS[cls];
    const slots: string[] = [...(state.slots ?? [])];
    const st = this.stats();
    const sig = [cls, state.level, slots.join(","), st.sta, st.str, st.mag, st.dex, ...nodes.map((n) => rankOf(ranks, n.id))].join("|");
    if (sig === this.sig) return;
    this.sig = sig;
    const free = talentPoints(state.level) - spentPoints(cls, ranks);
    const rc = respecCost(state.level), rcEl = document.getElementById("treeresetcost");
    if (rcEl) rcEl.textContent = rc ? `${rc} gold` : "free (up to level 5)";
    document.getElementById("treetitle")!.textContent = `${CLASSES[cls].name} skills`;
    document.getElementById("treepoints")!.innerHTML = (free > 0
      ? `<b class="free">${free} skill point${free > 1 ? "s" : ""} to spend</b>`
      : state.level < 2 ? "You start with a basic attack only. Reach level 2 for your first skill point." : "No points left. You get 1 point per level.") +
      `<span class="treehint">Climb the tree: a skill needs the one it grows from. Higher skills hit harder; leafy ends lead nowhere higher. ` +
      `Basic hits build ${STACK_NAME[cls]} (up to 5) for some skills.</span>`;

    const layout = this.layout(cls);
    const colors = BRANCHES[cls].map((b) => b.color);
    let html = `<canvas class="treeart" width="${W / 2}" height="${H / 2}"></canvas><div class="treebox">`;
    for (const n of layout) {
      const s = n.s, r = rankOf(ranks, s.id);
      const why = lockReason(cls, state.level, ranks, s.id);
      const stt = why === "max" ? "max" : why === "" ? "can" : why === "points" ? (r > 0 ? "has" : "off") : "locked";
      const slot = !s.passive ? slots.indexOf(s.id) : -1;
      const key = slot >= 0 ? `<kbd>${SLOT_KEYS[slot]}</kbd>` : "";
      const pips = Array.from({ length: MAX_RANK }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
      const leaf = childrenOf(cls, s.id).length === 0;
      const act = !s.passive && r > 0 ? ` data-active="${s.id}"` : "";
      const lvl = why === "level" ? `<span class="nlv">Lv ${s.req}</span>` : "";
      html += `<button class="tnode ${stt}${s.passive ? " passive" : ""}${s.row === 4 ? " ult" : ""}${leaf ? " leaf" : ""}" data-talent="${s.id}"${act} ` +
        `style="left:${n.x}px;top:${n.y}px;--c:${colors[s.branch]}">${iconImg(s.id, "nicon")}${key}${lvl}<span class="pips">${pips}</span></button>`;
    }
    BRANCHES[cls].forEach((b, i) => { html += `<div class="tbough" style="left:${W * (i * 2 + 1) / 6}px;top:${GROUND + 8}px;color:${b.color}">${b.name}</div>`; });
    html += `</div>`;
    const box = document.getElementById("treebranches")!;
    box.innerHTML = `<div class="treewrap" style="width:${W}px;height:${H}px">${html}</div><div id="treeinfo"></div>`;
    this.paint(box.querySelector("canvas.treeart") as HTMLCanvasElement, cls, layout, ranks, colors);
    this.shown = "";
    const pick = this.hover || nodes.find((n) => lockReason(cls, state.level, ranks, n.id) === "")?.id || nodes[0].id;
    this.details(pick);
  }

  /** Where each skill sits: three boughs side by side; inside a bough the leaves are spread evenly, a parent sits above the middle of its children's base. */
  private layout(cls: ClassKind): Node[] {
    const out: Node[] = [];
    const topReq = Math.max(24, ...SKILLS[cls].map((s) => s.req));
    for (let b = 0; b < 3; b++) {
      const list = SKILLS[cls].filter((s) => s.branch === b);
      const root = list.find((s) => !s.parent)!;
      const leaves: string[] = [];
      const walk = (s: SkillDef) => {
        const kids = childrenOf(cls, s.id).sort((x, y) => x.req - y.req);
        if (!kids.length) leaves.push(s.id);
        // the earlier (lower) child goes to the outside so limbs do not cross
        (b === 0 ? kids : b === 2 ? [...kids].reverse() : kids).forEach(walk);
      };
      walk(root);
      const cx = W * (b * 2 + 1) / 6, span = W / 3 - 40;
      const step = leaves.length > 1 ? Math.min(78, span / (leaves.length - 1)) : 0;
      const xs = new Map<string, number>();
      leaves.forEach((id, i) => xs.set(id, cx + (i - (leaves.length - 1) / 2) * step));
      const xOf = (s: SkillDef): number => {
        if (xs.has(s.id)) return xs.get(s.id)!;
        const kids = childrenOf(cls, s.id);
        const x = kids.reduce((a, k) => a + xOf(k), 0) / kids.length;
        xs.set(s.id, x);
        return x;
      };
      const ys = new Map<string, number>();
      for (const s of list) { // list is in tree order: parents first
        const py = s.parent ? ys.get(s.parent)! : Infinity;
        const y = Math.min(yOf(s.req, topReq), py - GAP);
        ys.set(s.id, y);
        out.push({ s, x: Math.round(Math.max(36, Math.min(W - 36, s.parent ? xOf(s) : cx))), y: Math.round(Math.max(TOP, y)) });
      }
    }
    return out;
  }

  /** The tree itself, as pixel art (2 CSS px per pixel): trunk, boughs, limbs, roots, leaves. */
  private paint(cv: HTMLCanvasElement, cls: ClassKind, nodes: Node[], ranks: any, colors: string[]) {
    const g = cv.getContext("2d")!;
    const w = cv.width, h = cv.height;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.clearRect(0, 0, w, h);
    // night sky with stars, then ground
    for (let y = 0; y < h; y++) { g.fillStyle = y % 4 < 2 ? "#151726" : "#171a2b"; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 60; i++) { g.fillStyle = rnd() < 0.3 ? "#6a6f9a" : "#3a3e60"; g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.8), 1, 1); }
    const gy = GROUND / 2;
    g.fillStyle = "#2a2018"; g.fillRect(0, gy, w, h - gy);
    g.fillStyle = "#3a2c1e"; g.fillRect(0, gy, w, 2);
    for (let i = 0; i < 70; i++) { g.fillStyle = rnd() < 0.5 ? "#33281c" : "#241b14"; g.fillRect(Math.floor(rnd() * w), gy + 3 + Math.floor(rnd() * (h - gy - 3)), 2, 1); }
    for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? "#3f6b2a" : "#2d5220"; g.fillRect(Math.floor(rnd() * w), gy - 1, 1, 1 + Math.floor(rnd() * 2)); }

    const img = g.getImageData(0, 0, w, h), px = img.data;
    const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const put = (x: number, y: number, c: number[]) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    };
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
    const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
    // bark ramps: outline, deep groove, shadow, body, light, highlight (live wood warm, dead wood ashen)
    const BARK = ["#1a0f08", "#3a2414", "#4e321d", "#664429", "#85603a", "#a8835a"].map(rgb);
    const DEAD = ["#141218", "#27222c", "#36303d", "#463f4e", "#5a5263", "#736a7c"].map(rgb);

    /** A limb: cubic curve from (x0,y0) to (x1,y1), radius r0 tapering to r1, flared at the base, bark-shaded, light from the upper left. */
    interface Limb { pts: [number, number, number, number, number][]; live: boolean; seed: number }
    const limbs: Limb[] = [];
    const limb = (x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number,
      r0: number, r1: number, live: boolean, flare = 0.35, wob = 0.8) => {
      const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(c1x - x0, c1y - y0) * 0.5;
      const n = Math.max(8, Math.ceil(len * 2));
      const sd = rnd() * 100;
      const pts: Limb["pts"] = [];
      let along = 0, lx = x0, ly = y0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        let x = u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1;
        let y = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1;
        // a little organic wobble, none at the ends so joints stay put
        const k = Math.sin(t * Math.PI) * wob * Math.sin(t * 9 + sd);
        const dx = x - lx, dy = y - ly, dl = Math.hypot(dx, dy) || 1;
        x += (-dy / dl) * k; y += (dx / dl) * k;
        along += Math.hypot(x - lx, y - ly); lx = x; ly = y;
        const r = r1 + (r0 - r1) * Math.pow(u, 1.3) + r0 * flare * Math.pow(u, 6);
        pts.push([x, y, r, along, t]);
      }
      limbs.push({ pts, live, seed: sd });
      return (t: number) => pts[Math.round(Math.max(0, Math.min(1, t)) * n)];
    };
    /** Rasterize every limb: first all outlines, then all wood, so joints merge into one piece of wood. */
    const drawLimbs = () => {
      const L = [-0.62, -0.78];
      for (const pass of [0, 1]) for (const lb of limbs) {
        const k = lb.live ? BARK : DEAD;
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const [x, y, r] of lb.pts) { minX = Math.min(minX, x - r - 2); minY = Math.min(minY, y - r - 2); maxX = Math.max(maxX, x + r + 2); maxY = Math.max(maxY, y + r + 2); }
        for (let py = Math.floor(minY); py <= maxY; py++) for (let qx = Math.floor(minX); qx <= maxX; qx++) {
          const cx = qx + 0.5, cy = py + 0.5;
          let best = 1e9, bi = 0;
          for (let i = 0; i < lb.pts.length; i++) {
            const p = lb.pts[i], d = Math.hypot(cx - p[0], cy - p[1]) - p[2];
            if (d < best) { best = d; bi = i; }
          }
          if (pass === 0) { if (best <= 1) put(qx, py, k[0]); continue; }
          if (best > 0) continue;
          const p = lb.pts[bi], r = Math.max(0.6, p[2]);
          const ox = (cx - p[0]) / r, oy = (cy - p[1]) / r;
          // shading: lit side faces the upper left, rim of shadow on the far side
          let v = -(ox * L[0] + oy * L[1]) * 0.9 + dith(qx, py) * 0.55;
          // bark grooves running along the limb, wavy, only on wood thick enough to show them
          const nb = lb.pts[Math.min(bi + 1, lb.pts.length - 1)], pb = lb.pts[Math.max(bi - 1, 0)];
          const tx = nb[0] - pb[0], ty = nb[1] - pb[1], tl = Math.hypot(tx, ty) || 1;
          const side = ((cx - p[0]) * -ty + (cy - p[1]) * tx) / tl; // signed px across the limb
          let groove = false;
          if (r >= 3) {
            const g2 = side * 0.33 + Math.sin(p[3] * 0.33 + lb.seed + side) * 0.35;
            groove = Math.abs(g2 - Math.round(g2)) < 0.13 && Math.sin(p[3] * 0.7 + lb.seed * 3 + Math.round(g2) * 2) > -0.5;
          }
          let c: number;
          if (v > 0.62) c = 1; else if (v > 0.2) c = 2; else if (v > -0.3) c = 3; else if (v > -0.7) c = 4; else c = 5;
          if (groove) c = Math.max(1, c - 2);
          put(qx, py, k[c]);
        }
      }
    };
    // leaves: little pixel clumps (outline, two greens dithered, sunlit tips), tinted toward the branch colour on crowns
    const LEAF = ["#0f2209", "#24461a", "#2f6020", "#3f7a2a", "#5f9e38", "#8cc85a"].map(rgb);
    const clumps: [number, number, number, number[] | undefined][] = [];
    const clump = (x: number, y: number, r: number, tint?: string) => clumps.push([x, y, r, tint ? rgb(tint) : undefined]);
    const drawLeaves = () => {
      for (const pass of [0, 1]) for (const [x, y, r, tint] of clumps) {
        for (let py = Math.floor(y - r - 2); py <= y + r + 2; py++) for (let qx = Math.floor(x - r - 2); qx <= x + r + 2; qx++) {
          const dx = qx + 0.5 - x, dy = (py + 0.5 - y) * 1.15;
          // lumpy edge
          const d = Math.hypot(dx, dy) - r - Math.sin(Math.atan2(dy, dx) * 5 + x) * 0.7;
          if (pass === 0) { if (d <= 1) put(qx, py, LEAF[0]); continue; }
          if (d > 0) continue;
          const v = (-dx - dy) / (r + 0.5) * 0.8 + dith(qx, py) * 0.7;
          const c = v > 0.75 ? 5 : v > 0.25 ? 4 : v > -0.25 ? 3 : v > -0.7 ? 2 : 1;
          put(qx, py, tint && c >= 4 && ((qx * 7 + py * 3) % 5 === 0) ? tint : LEAF[c]);
        }
      }
    };

    const P = new Map(nodes.map((n) => [n.s.id, { x: n.x / 2, y: n.y / 2 }]));
    const learned = (id: string) => rankOf(ranks, id) > 0;
    const tx = w / 2;
    // roots spread out over the ground, thick at the trunk, thin at the tips
    for (const [dx, len, dy] of [[-1, 40, 9], [1, 44, 8], [-0.55, 24, 13], [0.6, 26, 14], [-0.15, 12, 15]]) {
      const ex = tx + dx * len, ey = gy + dy;
      limb(tx + dx * 6, gy - 6, tx + dx * 14, gy, ex - dx * len * 0.35, ey - 2, ex, ey, 6, 0.6, true, 0.2, 0.6);
    }
    // trunk: flared base, slight lean, splits around the middle of the canvas
    const fork = { x: tx + 1, y: gy - 22 };
    limb(tx, gy + 4, tx - 2, gy - 6, tx + 3, gy - 14, fork.x, fork.y, 13, 10, true, 0.45, 0.4);
    // three boughs leave the trunk going up, then arc out to each branch root
    const roots = [0, 1, 2].map((b) => nodes.find((n) => n.s.branch === b && !n.s.parent)!);
    roots.forEach((r) => {
      const rx = r.x / 2, ry = r.y / 2 + 6, dx = rx - fork.x;
      // side boughs leave lower down the trunk so they can rise gently instead of humping over
      const side = Math.abs(dx) > 20, sy = side ? Math.min(fork.y + 12, ry + 10) : fork.y;
      const sx = fork.x + Math.sign(dx) * (side ? 6 : 0), rise = Math.max(6, sy - ry);
      limb(sx, sy, sx + dx * 0.35, sy - rise * 0.25 - 4, rx - dx * 0.25, ry + rise * 0.5 + 6, rx, ry, side ? 5.5 : 8, side ? 2.8 : 3.6, true, 0.6, 1.2);
    });
    // limbs: S-curves from the parent up to the child, thick near the trunk, thin at the top; learned limbs are live wood
    const depthOf = (s: SkillDef) => { let d = 0, p = s.parent; while (p) { d++; p = nodes.find((x) => x.s.id === p)?.s.parent; } return d; };
    const sorted = [...nodes].sort((a, b) => depthOf(a.s) - depthOf(b.s));
    for (const n of sorted) {
      const c = P.get(n.s.id)!;
      const d = depthOf(n.s);
      const live = n.s.parent ? learned(n.s.parent) : true;
      if (n.s.parent) {
        const p = P.get(n.s.parent)!;
        const dx = c.x - p.x, L = Math.abs(p.y - c.y);
        const pt = limb(p.x + Math.sign(dx) * Math.min(3, Math.abs(dx) * 0.1), p.y - 6, p.x + dx * 0.15, p.y - L * 0.45,
          c.x - dx * 0.2, c.y + L * 0.4, c.x, c.y + 4, Math.max(2.2, 5 - d * 0.9), Math.max(1.2, 3.4 - d * 0.7), live, 0.3, 1.1);
        // side twigs: bare spikes on dead wood, a leaf clump at the tip on live wood
        for (const [t, side] of [[0.35, dx >= 0 ? -1 : 1], [0.7, dx >= 0 ? 1 : -1]] as [number, number][]) {
          if (L < 30) continue;
          const [x, y] = pt(t);
          const ex = x + side * (6 + rnd() * 4), ey = y - 5 - rnd() * 4;
          limb(x, y, x + side * 2, y - 2, ex - side * 1, ey + 2, ex, ey, 1.4, 0.5, learned(n.s.id) || live, 0, 0.2);
          if (learned(n.s.id)) clump(ex, ey - 1, 2.5 + rnd());
        }
      }
      // every skill sits on a stub that pokes out above it, so the limb never just stops at the frame
      const leaf = childrenOf(cls, n.s.id).length === 0;
      const lv = learned(n.s.id);
      if (leaf) {
        const sx = (rnd() - 0.5) * 6;
        limb(c.x, c.y, c.x + sx * 0.3, c.y - 10, c.x + sx, c.y - 15, c.x + sx * 1.4, c.y - 19, 2.2, 0.5, lv || live, 0, 0.3);
      }
    }
    // crowns: every dead end gets a canopy (lush when learned, a few dry leaves when not); learned forks sprout a tuft
    for (const n of nodes) {
      const c = P.get(n.s.id)!;
      const leaf = childrenOf(cls, n.s.id).length === 0;
      const tint = colors[n.s.branch];
      if (leaf && learned(n.s.id)) {
        const big = n.s.row === 4 ? 1.35 : 1;
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i / 8 - 0.5) * Math.PI * 1.5, d = (8 + rnd() * 6) * big;
          clump(c.x + Math.cos(a) * d * 1.25, c.y - 6 + Math.sin(a) * d * 0.9, (4 + rnd() * 2.5) * big, tint);
        }
      } else if (leaf) {
        for (let i = 0; i < 3; i++) clump(c.x + (rnd() - 0.5) * 22, c.y - 14 - rnd() * 6, 2 + rnd() * 1.2);
      } else if (learned(n.s.id)) {
        clump(c.x - 13, c.y - 3, 3.2); clump(c.x + 13, c.y - 5, 3);
      }
    }
    drawLimbs();
    drawLeaves();
    g.putImageData(img, 0, 0);
  }

  /** Side panel: everything about one skill. */
  private details(id: string) {
    const info = document.getElementById("treeinfo");
    const cls = this.cls, state = this.state;
    if (!info || !cls || !state) return;
    const s = SKILLS[cls].find((x) => x.id === id);
    if (!s) return;
    this.shown = id;
    const ranks = state.talents, r = rankOf(ranks, s.id);
    const why = lockReason(cls, state.level, ranks, s.id);
    const st = this.stats();
    const color = BRANCHES[cls][s.branch].color;
    const rows: string[] = [];
    if (s.passive) {
      rows.push(`<p class="ifx">${r > 0 ? EFFECT_TEXT[s.passive.effect](+(s.passive.perRank * r).toFixed(1)) + " now" : ""}</p>`);
      rows.push(`<p class="inext">${EFFECT_TEXT[s.passive.effect](s.passive.perRank)} per rank</p>`);
    } else {
      const now = skillDamage(cls, s, Math.max(1, r), st, ranks);
      if (now) {
        rows.push(`<div class="idmg"><span>Damage${r > 0 ? ` (rank ${r})` : ""}</span><b>${now.total}</b></div><p class="iparts">${damageText(now)}</p>`);
        if (now.stacks) rows.push(`<p class="iparts">${now.stacks}</p>`);
        if (r > 0 && r < MAX_RANK) {
          const nx = skillDamage(cls, s, r + 1, st, ranks);
          if (nx) rows.push(`<p class="inext">Next rank: ${nx.total} (+${Math.round(RANK_POWER * 100)}% power, longer effects)</p>`);
        }
      } else if (r > 0 && r < MAX_RANK) rows.push(`<p class="inext">Next rank: longer, stronger effects</p>`);
      const price = [s.cd ? `${s.cd / 1000}s cooldown` : "no cooldown", s.cost ? `<span class="ista">${s.cost} stamina</span>` : "", s.mana ? `<span class="imana">${s.mana} mana</span>` : "", s.blood ? `<span class="iblood">${s.blood}% HP</span>` : ""];
      rows.push(`<p class="icost">${price.filter(Boolean).join(" · ")}${s.chargeMs ? ` · charge ${s.chargeMs / 1000}s` : ""}</p>`);
    }
    const lp = Math.round((levelPower(s) - 1) * 100);
    const power = [lp > 0 ? `+${lp}% power from its level` : "", scaleText(s)].filter(Boolean).join(" · ");
    if (power && !s.passive) rows.push(`<p class="iscale">${power}</p>`);
    // Diablo 2 style synergies: which skills feed this one, and how much they add right now
    if (s.synergy?.length) {
      const nameOf = (id: string) => SKILLS[cls].find((x) => x.id === id)?.name ?? id;
      const now = Math.round((synergyPower(s, ranks) - 1) * 100);
      rows.push(`<p class="iscale">Synergies: ${s.synergy.map((y) => `+${y.pct}% per rank of ${nameOf(y.from)}`).join(", ")}${now > 0 ? ` (now +${now}%)` : ""}</p>`);
    }
    const kids = childrenOf(cls, s.id);
    const parent = s.parent && SKILLS[cls].find((x) => x.id === s.parent);
    const missing = (s.requires ?? []).filter((q) => rankOf(ranks, q) < 1).map((q) => SKILLS[cls].find((x) => x.id === q)?.name ?? q);
    const also = (s.requires ?? []).map((q) => SKILLS[cls].find((x) => x.id === q)?.name ?? q);
    rows.push(`<p class="ipath">${parent ? `Grows from ${parent.name}${also.length ? `, and needs ${also.join(" and ")}` : ""}. ` : "Root of the branch. "}${kids.length ? `Leads to ${kids.map((k) => k.name).join(" and ")}.` : "Dead end: nothing grows higher."}</p>`);
    const slots: string[] = [...(state.slots ?? [])];
    const slot = slots.indexOf(s.id);
    const status = why === "max" ? "Fully learned" : why === "" ? "Click to learn" : why === "level" ? `${pxIcon("lock")}Needs level ${s.req}` :
      why === "above" ? `${pxIcon("lock")}Learn ${parent ? parent.name : "the skill below"} first` :
      why === "requires" ? `${pxIcon("lock")}Learn ${missing.join(" and ")} first` : r > 0 ? "Learned · no points left" : "No points left";
    const keyNote = !s.passive && r > 0 ? (slot >= 0 ? ` · on key ${SLOT_KEYS[slot]}` : " · hover it and press 1-0 to put it on a key") : "";
    const pips = Array.from({ length: MAX_RANK }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
    info.innerHTML = `<div class="ihead" style="--c:${color}">${iconImg(s.id, "iicon")}<div><b>${s.name}</b>` +
      `<span class="ttype${s.passive ? " pas" : ""}">${s.type} · Lv ${s.req}</span><span class="pips">${pips}</span></div></div>` +
      `<p class="idesc">${s.desc}</p>${s.needs ? `<p class="idesc ineed">Needs ${NEED_TEXT[s.needs]} in hand.</p>` : ""}${rows.join("")}<p class="istat ${why === "" ? "can" : ""}">${status}${keyNote}</p>`;
  }
}
