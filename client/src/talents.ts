import { respecCost } from "../../shared/upkeep";
import { ClassKind, CLASSES } from "../../shared/classes";
import { icon as pxIcon } from "./pixelicons";
import { slotKey } from "./keymode";
import { Stats } from "../../shared/powers";
import { iconImg } from "./skillIcons";
import { SheetPreview, talentsOf } from "./sidepanel";
import {
  BRANCHES, childrenOf, EFFECT_TEXT, levelPower, lockReason, MAX_RANK, RANK_POWER, rankOf, SkillDef, SKILLS, spentPoints, STACK_NAME,
  synergyPower, talentPoints, withMods, type SkillMod,
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
      `<span class="treehint">Follow the stone paths: a node needs the one before it. Upgrades change the spell at the start of their path. ` +
      `Basic hits build ${STACK_NAME[cls]} (up to 5) for some skills.</span>`;

    const layout = this.layout(cls);
    const colors = BRANCHES[cls].map((b) => b.color);
    let html = `<canvas class="treeart" width="${W}" height="${H}"></canvas><div class="treebox">`;
    for (const n of layout) {
      const s = n.s, r = rankOf(ranks, s.id);
      const why = lockReason(cls, state.level, ranks, s.id);
      const stt = why === "max" ? "max" : why === "" ? "can" : why === "points" ? (r > 0 ? "has" : "off") : "locked";
      const slot = !s.passive ? slots.indexOf(s.id) : -1;
      const key = slot >= 0 ? `<kbd>${slotKey(slot)}</kbd>` : "";
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
  /**
   * The tree as stone paths (Murat 2026-11-07: "a curved path in stone, not an ugly tree"; Path of Exile / Diablo
   * inspired): a dark carved slate panel, a curving cobbled path from each node to the one it needs, lit with an inlay
   * of the school's colour once learned, and a stone socket under every node. Painted at 1 canvas px per CSS px.
   */
  private paint(cv: HTMLCanvasElement, cls: ClassKind, nodes: Node[], ranks: any, colors: string[]) {
    const g = cv.getContext("2d")!;
    const w = cv.width, h = cv.height;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // slate: dark, mottled, a carved frame
    const bg = g.createRadialGradient(w / 2, h * 0.45, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, "#24211e"); bg.addColorStop(1, "#0d0c0b");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "255,240,220" : "0,0,0"},${0.02 + rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2); }
    for (let i = 0; i < 26; i++) { // hairline cracks
      let x = rnd() * w, y = rnd() * h; g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke();
    }
    g.strokeStyle = "#060505"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = "#4a3f33"; g.lineWidth = 2; g.strokeRect(7, 7, w - 14, h - 14);
    // one faint carved circle per school around its root
    const byId = new Map(nodes.map((n) => [n.s.id, n]));
    for (const n of nodes) if (!n.s.parent) {
      g.strokeStyle = "rgba(160,140,110,0.12)"; g.lineWidth = 2; g.beginPath(); g.arc(n.x, n.y, 34, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1; g.beginPath(); g.arc(n.x, n.y + 1, 34, 0, Math.PI * 2); g.stroke();
    }
    // paths: from the ground (roots) or from the parent node, curving, cobbled
    type Seg = { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; lit: boolean; col: string };
    const segs: Seg[] = [];
    for (const n of nodes) {
      const lit = rankOf(ranks, n.s.id) > 0, col = colors[n.s.branch];
      const p = n.s.parent ? byId.get(n.s.parent) : undefined;
      const x0 = p ? p.x : n.x, y0 = p ? p.y : GROUND + 10;
      // every path winds: it swings out to one side (alternating along the path) before reaching the node
      let hsh = 0; for (const ch of n.s.id) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
      const side = hsh & 1 ? 1 : -1, swing = 16 + (Math.abs(hsh) % 9);
      segs.push({ x0, y0, cx: (x0 + n.x) / 2 + side * swing + (n.x - x0) * 0.2, cy: (y0 + n.y) / 2, x1: n.x, y1: n.y, lit, col });
    }
    const curve = (s: Seg) => { g.beginPath(); g.moveTo(s.x0, s.y0); g.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1); };
    g.lineCap = "round"; g.lineJoin = "round";
    for (const s of segs) { curve(s); g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = 17; g.stroke(); } // drop shadow / carved bed
    for (const s of segs) { curve(s); g.strokeStyle = "#3a352f"; g.lineWidth = 13; g.stroke(); }
    for (const s of segs) { curve(s); g.strokeStyle = "#57504a"; g.lineWidth = 9; g.stroke(); }
    // cobbles: joints across the path and worn lighter stones
    for (const s of segs) {
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) + 10, k = Math.max(3, Math.floor(len / 9));
      for (let i = 1; i < k; i++) {
        const t = i / k, u = 1 - t;
        const x = u * u * s.x0 + 2 * u * t * s.cx + t * t * s.x1, y = u * u * s.y0 + 2 * u * t * s.cy + t * t * s.y1;
        const dx = 2 * u * (s.cx - s.x0) + 2 * t * (s.x1 - s.cx), dy = 2 * u * (s.cy - s.y0) + 2 * t * (s.y1 - s.cy), d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d, ny = dx / d;
        g.strokeStyle = "rgba(20,17,14,0.8)"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x - nx * 4.5, y - ny * 4.5); g.lineTo(x + nx * 4.5, y + ny * 4.5); g.stroke();
        g.fillStyle = `rgba(150,140,125,${0.1 + rnd() * 0.15})`; g.fillRect(x - nx * 2 - 1.5, y - ny * 2 - 1.5, 3, 2);
      }
    }
    // learned paths: a glowing inlay in the school's colour
    for (const s of segs) if (s.lit) {
      g.save(); g.shadowColor = s.col; g.shadowBlur = 8;
      curve(s); g.strokeStyle = s.col; g.lineWidth = 2.5; g.stroke();
      g.restore();
    }
    // stone sockets under the nodes
    for (const n of nodes) {
      const r = n.s.passive ? 30 : 35;
      const sg = g.createRadialGradient(n.x - 6, n.y - 6, 4, n.x, n.y, r);
      sg.addColorStop(0, "#6a625a"); sg.addColorStop(0.7, "#3b3631"); sg.addColorStop(1, "#151210");
      g.fillStyle = "rgba(0,0,0,0.6)"; g.beginPath(); g.arc(n.x + 2, n.y + 3, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = sg; g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2); g.fill();
      if (rankOf(ranks, n.s.id) > 0) { g.save(); g.shadowColor = colors[n.s.branch]; g.shadowBlur = 12; g.strokeStyle = colors[n.s.branch]; g.lineWidth = 2; g.beginPath(); g.arc(n.x, n.y, r - 2, 0, Math.PI * 2); g.stroke(); g.restore(); }
    }
    void cls;
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
    if (s.mod) {
      // an upgrade node: what it does per rank, and in total now
      const spell = SKILLS[cls].find((x) => x.id === s.mod!.of);
      rows.push(`<p class="inext">Upgrades ${spell?.name ?? "a spell"}: ${modText(s.mod, 1)} per rank</p>`);
      if (r > 0) rows.push(`<p class="ifx">Now: ${modText(s.mod, r)}</p>`);
    } else if (s.passive) {
      rows.push(`<p class="ifx">${r > 0 ? EFFECT_TEXT[s.passive.effect](+(s.passive.perRank * r).toFixed(1)) + " now" : ""}</p>`);
      rows.push(`<p class="inext">${EFFECT_TEXT[s.passive.effect](s.passive.perRank)} per rank</p>`);
    } else {
      const sm = withMods(cls, ranks, s); // with the upgrades learned on its paths
      const now = skillDamage(cls, sm, Math.max(1, r), st, ranks);
      if (now) {
        rows.push(`<div class="idmg"><span>Damage${r > 0 ? ` (rank ${r})` : ""}</span><b>${now.total}</b></div><p class="iparts">${damageText(now)}</p>`);
        if (now.stacks) rows.push(`<p class="iparts">${now.stacks}</p>`);
        if (r > 0 && r < MAX_RANK) {
          const nx = skillDamage(cls, sm, r + 1, st, ranks);
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
    const keyNote = !s.passive && r > 0 ? (slot >= 0 ? ` · on key ${slotKey(slot)}` : ` · hover it and press ${slotKey(0)}-${slotKey(8)} to put it on a key`) : "";
    const pips = Array.from({ length: MAX_RANK }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
    info.innerHTML = `<div class="ihead" style="--c:${color}">${iconImg(s.id, "iicon")}<div><b>${s.name}</b>` +
      `<span class="ttype${s.passive ? " pas" : ""}">${s.type} · Lv ${s.req}</span><span class="pips">${pips}</span></div></div>` +
      `<p class="idesc">${s.desc}</p>${s.needs ? `<p class="idesc ineed">Needs ${NEED_TEXT[s.needs]} in hand.</p>` : ""}${rows.join("")}<p class="istat ${why === "" ? "can" : ""}">${status}${keyNote}</p>`;
  }
}

/** "+2 bolts, +30% damage" for `k` ranks of an upgrade node. */
function modText(m: SkillMod, k: number): string {
  const p = (v: number | undefined, what: string) => (v ? `${v * k > 0 ? "+" : ""}${v * k}% ${what}` : "");
  const a = (v: number | undefined, one: string, many: string, unit = "") => (v ? `+${v * k}${unit} ${v * k === 1 ? one : many}` : "");
  return [a(m.n, "bolt", "bolts"), a(m.zap, "strike", "strikes"), a(m.pierce, "enemy pierced", "enemies pierced"), a(m.explode, "blast radius", "blast radius", " px"),
    p(m.dmg, "damage"), p(m.radius, "radius"), p(m.ms, "duration"), p(m.tick, "faster ticks"), p(m.slow, "slow"), p(m.stun, "stun"), p(m.speed, "range"),
    p(m.burn, "burn"), p(m.cd, "cooldown"), p(m.mana, "mana")].filter(Boolean).join(", ");
}
