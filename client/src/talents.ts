import { ClassKind, CLASSES } from "../../shared/classes";
import { SLOT_KEYS } from "../../shared/slots";
import { Stats } from "../../shared/powers";
import { iconImg } from "./skillIcons";
import {
  BRANCHES, childrenOf, EFFECT_TEXT, levelPower, lockReason, MAX_RANK, RANK_POWER, rankOf, SkillDef, SKILLS, spentPoints, STACK_NAME,
  talentPoints,
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
const TOP = 34, GROUND = H - 46, MAX_REQ = 24;
// square-root scale: the early levels, where most skills sit, get more room
const yOf = (req: number) => GROUND - 40 - Math.sqrt((req - 1) / (MAX_REQ - 1)) * (GROUND - 40 - TOP);
const GAP = 66; // a skill sits at least this far above the one it grows from

interface Node { s: SkillDef; x: number; y: number }

export class TalentMenu {
  private el = document.getElementById("tree")!;
  private sig = "";
  private hover = "";
  private shown = "";
  private cls?: ClassKind;
  private state: any;

  constructor(private send: (type: string, msg?: unknown) => void) {
    this.el.addEventListener("mouseover", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      this.hover = t?.dataset.talent ?? "";
      if (this.hover && this.hover !== this.shown) this.details(this.hover);
    });
    this.el.addEventListener("mouseleave", () => { this.hover = ""; });
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
  toggle(state: any) { if (this.open) this.el.hidden = true; else { this.el.hidden = false; this.sig = ""; this.refresh(state); } }

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
        const y = Math.min(yOf(s.req), py - GAP);
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

    const BARK = ["#2a1a10", "#5a3a22", "#7a5434", "#9c7350"]; // outline, body, light, highlight
    const DEAD = ["#1e1a1e", "#3b3540", "#4d4652", "#5e5664"];
    // Limb as a tapering curve: three passes (outline, body, light edge)
    const limb = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, live: boolean, bend = 0) => {
      const k = live ? BARK : DEAD;
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 2;
      const pt = (t: number) => {
        // cubic-ish: leave the parent going up, arrive at the child from below
        const cx = x0 + bend, cy = y0 - (y0 - y1) * 0.55;
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1, r0 + (r1 - r0) * t];
      };
      for (const [pass, col, dr, ox] of [[0, k[0], 1, 0], [1, k[1], 0, 0], [2, k[2], -1, -1]] as [number, string, number, number][]) {
        g.fillStyle = col;
        for (let i = 0; i <= steps; i++) {
          const [x, y, r] = pt(i / steps);
          const rr = Math.max(pass === 2 ? 0 : 1, r + dr);
          g.fillRect(Math.round(x - rr + ox), Math.round(y - rr), Math.round(rr * 2) || 1, Math.round(rr * 2) || 1);
        }
      }
      return pt;
    };
    const leafy = (x: number, y: number, n: number, rad: number, tint?: string) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
        const lx = Math.round(x + Math.cos(a) * d), ly = Math.round(y + Math.sin(a) * d * 0.8);
        g.fillStyle = "#16300f"; g.fillRect(lx - 1, ly - 1, 3, 3);
        g.fillStyle = rnd() < 0.5 ? "#3f7a2a" : "#2f6020"; g.fillRect(lx - 1, ly - 1, 2, 2);
        if (rnd() < 0.3) { g.fillStyle = tint && rnd() < 0.4 ? tint : "#7cc04a"; g.fillRect(lx - 1, ly - 1, 1, 1); }
      }
    };
    const P = new Map(nodes.map((n) => [n.s.id, { x: n.x / 2, y: n.y / 2 }]));
    const learned = (id: string) => rankOf(ranks, id) > 0;
    const tx = w / 2;
    // roots
    for (const [dx, len] of [[-1, 30], [1, 34], [-0.4, 18], [0.5, 20]]) limb(tx, gy, tx + dx * len, gy + 10 + Math.abs(dx) * 4, 5, 1, true, dx * 6);
    // trunk, then the three boughs to each branch root
    limb(tx, gy + 2, tx, gy - 18, 13, 11, true);
    const roots = [0, 1, 2].map((b) => nodes.find((n) => n.s.branch === b && !n.s.parent)!);
    roots.forEach((r) => limb(tx + (r.x / 2 - tx) * 0.15, gy - 18, r.x / 2, r.y / 2 + 6, 9, 6, true, (r.x / 2 - tx) * 0.7));
    // limbs: thick near the trunk, thin at the top; learned limbs are live wood
    const depthOf = (s: SkillDef) => { let d = 0, p = s.parent; while (p) { d++; p = nodes.find((x) => x.s.id === p)?.s.parent; } return d; };
    const sorted = [...nodes].sort((a, b) => depthOf(a.s) - depthOf(b.s));
    for (const n of sorted) {
      if (!n.s.parent) continue;
      const p = P.get(n.s.parent)!, c = P.get(n.s.id)!;
      const d = depthOf(n.s);
      const live = learned(n.s.parent);
      limb(p.x, p.y - 4, c.x, c.y + 6, Math.max(2, 6 - d), Math.max(1.5, 5 - d), live, (c.x - p.x) * 0.4);
      if (learned(n.s.id)) for (let i = 0; i < 3; i++) leafy(p.x + (c.x - p.x) * (0.3 + i * 0.25), p.y + (c.y - p.y) * (0.3 + i * 0.25), 5, 5);
    }
    // crowns: every dead end gets a canopy (lush when learned), roots get a few leaves when learned
    for (const n of nodes) {
      const c = P.get(n.s.id)!;
      const leaf = childrenOf(cls, n.s.id).length === 0;
      if (leaf) {
        if (learned(n.s.id)) leafy(c.x, c.y - 2, n.s.row === 4 ? 70 : 45, n.s.row === 4 ? 22 : 17, colors[n.s.branch]);
        else { leafy(c.x, c.y - 2, 14, 15); }
      } else if (learned(n.s.id)) leafy(c.x, c.y, 10, 12);
    }
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
      const now = skillDamage(cls, s, Math.max(1, r), st);
      if (now) {
        rows.push(`<div class="idmg"><span>Damage${r > 0 ? ` (rank ${r})` : ""}</span><b>${now.total}</b></div><p class="iparts">${damageText(now)}</p>`);
        if (now.stacks) rows.push(`<p class="iparts">${now.stacks}</p>`);
        if (r > 0 && r < MAX_RANK) {
          const nx = skillDamage(cls, s, r + 1, st);
          if (nx) rows.push(`<p class="inext">Next rank: ${nx.total} (+${Math.round(RANK_POWER * 100)}% power, longer effects)</p>`);
        }
      } else if (r > 0 && r < MAX_RANK) rows.push(`<p class="inext">Next rank: longer, stronger effects</p>`);
      rows.push(`<p class="icost">${(s.cd ?? 0) / 1000}s cooldown · ${s.cost ?? 0} ${cls === "wizard" ? "magic" : "stamina"}${s.chargeMs ? ` · charge ${s.chargeMs / 1000}s` : ""}</p>`);
    }
    const lp = Math.round((levelPower(s) - 1) * 100);
    const power = [lp > 0 ? `+${lp}% power from its level` : "", scaleText(s)].filter(Boolean).join(" · ");
    if (power && !s.passive) rows.push(`<p class="iscale">${power}</p>`);
    const kids = childrenOf(cls, s.id);
    const parent = s.parent && SKILLS[cls].find((x) => x.id === s.parent);
    rows.push(`<p class="ipath">${parent ? `Grows from ${parent.name}. ` : "Root of the branch. "}${kids.length ? `Leads to ${kids.map((k) => k.name).join(" and ")}.` : "Dead end: nothing grows higher."}</p>`);
    const slots: string[] = [...(state.slots ?? [])];
    const slot = slots.indexOf(s.id);
    const status = why === "max" ? "Fully learned" : why === "" ? "Click to learn" : why === "level" ? `🔒 Needs level ${s.req}` :
      why === "above" ? `🔒 Learn ${parent ? parent.name : "the skill below"} first` : r > 0 ? "Learned · no points left" : "No points left";
    const keyNote = !s.passive && r > 0 ? (slot >= 0 ? ` · on key ${SLOT_KEYS[slot]}` : " · hover it and press 1-0 to put it on a key") : "";
    const pips = Array.from({ length: MAX_RANK }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
    info.innerHTML = `<div class="ihead" style="--c:${color}">${iconImg(s.id, "iicon")}<div><b>${s.name}</b>` +
      `<span class="ttype${s.passive ? " pas" : ""}">${s.type} · Lv ${s.req}</span><span class="pips">${pips}</span></div></div>` +
      `<p class="idesc">${s.desc}</p>${rows.join("")}<p class="istat ${why === "" ? "can" : ""}">${status}${keyNote}</p>`;
  }
}
