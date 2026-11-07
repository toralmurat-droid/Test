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
const W = 420, H = 540; // the stone slab of one school (one tab), CSS px
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
  private tab = 0; // the school shown (Diablo 2 style: one tree per tab)
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
      const tab = (ev.target as HTMLElement).closest("[data-ttab]") as HTMLElement | null;
      if (tab) { this.tab = Number(tab.dataset.ttab) || 0; this.sig = ""; if (this.state) this.refresh(this.state); return; }
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
    const sig = [cls, this.tab, state.level, slots.join(","), st.sta, st.str, st.mag, st.dex, ...nodes.map((n) => rankOf(ranks, n.id))].join("|");
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
        `style="left:${n.x}px;top:${n.y}px;--c:${colors[s.branch]}">${iconImg(s.id, "nicon")}${key}${lvl}<span class="pips">${pips}</span><span class="trank">${r || ""}</span></button>`;
    }
    html += `<div class="tfoot">${free > 0 ? `${free} skill choice${free > 1 ? "s" : ""} remaining` : "No skill choices remaining"}</div>`;
    html += `</div>`;
    const box = document.getElementById("treebranches")!;
    const tabs = BRANCHES[cls].map((b, i) => `<button class="ttab${i === this.tab ? " on" : ""}" data-ttab="${i}" style="--c:${b.color}">${b.name}</button>`).join("");
    box.innerHTML = `<div class="treecol"><div class="ttabs">${tabs}</div><div class="treewrap" style="width:${W}px;height:${H}px">${html}</div></div><div id="treeinfo"></div>`;
    this.paint(box.querySelector("canvas.treeart") as HTMLCanvasElement, cls, layout, ranks, colors);
    this.shown = "";
    const pick = this.hover || nodes.find((n) => lockReason(cls, state.level, ranks, n.id) === "")?.id || nodes[0].id;
    this.details(pick);
  }

  /**
   * Where each skill of the open school (tab) sits, Diablo 2 style: the root at the top, every step of a path one row
   * lower; the ends of the paths are spread across the slab and a parent sits above the middle of its children.
   */
  private layout(cls: ClassKind): Node[] {
    const list = SKILLS[cls].filter((s) => s.branch === this.tab);
    const root = list.find((s) => !s.parent);
    if (!root) return [];
    const depth = (s: SkillDef) => { let d = 0, q = s.parent; while (q) { d++; q = list.find((x) => x.id === q)?.parent; } return d; };
    const maxD = Math.max(1, ...list.map(depth));
    const leaves: string[] = [];
    const walk = (s: SkillDef) => { const kids = childrenOf(cls, s.id).sort((x, y) => x.req - y.req); if (!kids.length) leaves.push(s.id); kids.forEach(walk); };
    walk(root);
    const step = leaves.length > 1 ? Math.min(170, (W - 150) / (leaves.length - 1)) : 0;
    const xs = new Map<string, number>();
    leaves.forEach((id, i) => xs.set(id, W / 2 + (i - (leaves.length - 1) / 2) * step));
    const xOf = (s: SkillDef): number => {
      if (xs.has(s.id)) return xs.get(s.id)!;
      const kids = childrenOf(cls, s.id), x = kids.reduce((a, k) => a + xOf(k), 0) / kids.length;
      xs.set(s.id, x); return x;
    };
    const rowH = Math.min(110, (H - 140) / maxD);
    return list.map((s) => ({ s, x: Math.round(xOf(s)), y: Math.round(62 + depth(s) * rowH) }));
  }

  /** The tree itself, as pixel art (2 CSS px per pixel): trunk, boughs, limbs, roots, leaves. */
  /**
   * The tree on a grey stone slab, Diablo 2 style (Murat 2026-11-07, from his reference picture): mottled, cracked stone
   * in an iron frame, and a chiselled arrow from each skill down to the ones it opens (diagonal when they sit apart).
   * Learned arrows are lit in the school's colour. Painted at 1 canvas px per CSS px.
   */
  private paint(cv: HTMLCanvasElement, cls: ClassKind, nodes: Node[], ranks: any, colors: string[]) {
    const g = cv.getContext("2d")!;
    const w = cv.width, h = cv.height;
    let seed = 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // grey stone: base, big soft blotches, grain, cracks
    g.fillStyle = "#4b4a47"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 70, dark = rnd() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? "rgba(20,20,20,0.18)" : "rgba(140,138,130,0.14)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "190,186,176" : "18,18,18"},${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1); }
    for (let i = 0; i < 14; i++) {
      let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.3) * 40; g.lineTo(x, y); }
      g.strokeStyle = "rgba(25,24,22,0.55)"; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = "rgba(150,146,138,0.18)"; g.lineWidth = 1; g.translate(1, 1); g.stroke(); g.translate(-1, -1);
    }
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    // iron frame with an inner bevel
    g.strokeStyle = "#141414"; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.strokeStyle = "#5c5b57"; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = "#232322"; g.lineWidth = 2; g.strokeRect(12, 12, w - 24, h - 24);
    // chiselled arrows: parent's bottom edge to the child's top edge
    const T = 30; // half a tile
    const byId = new Map(nodes.map((n) => [n.s.id, n]));
    for (const n of nodes) {
      const p = n.s.parent ? byId.get(n.s.parent) : undefined;
      if (!p) continue;
      const lit = rankOf(ranks, n.s.id) > 0, col = colors[n.s.branch];
      let x0 = p.x, y0 = p.y + T + 4, x1 = n.x, y1 = n.y - T - 6;
      if (Math.abs(n.x - p.x) > 20) { x0 += Math.sign(n.x - p.x) * 18; x1 -= Math.sign(n.x - p.x) * 10; } // diagonal from the corner
      const a = Math.atan2(y1 - y0, x1 - x0), ca = Math.cos(a), sa = Math.sin(a);
      const shaft = (dx: number, dy: number, c: string, lw: number) => {
        g.strokeStyle = c; g.lineWidth = lw; g.lineCap = "butt";
        g.beginPath(); g.moveTo(x0 + dx, y0 + dy); g.lineTo(x1 - ca * 9 + dx, y1 - sa * 9 + dy); g.stroke();
      };
      const head = (dx: number, dy: number, c: string, k = 1) => {
        g.fillStyle = c; g.beginPath();
        g.moveTo(x1 + dx, y1 + dy);
        g.lineTo(x1 - ca * 13 * k - sa * 9 * k + dx, y1 - sa * 13 * k + ca * 9 * k + dy);
        g.lineTo(x1 - ca * 13 * k + sa * 9 * k + dx, y1 - sa * 13 * k - ca * 9 * k + dy);
        g.closePath(); g.fill();
      };
      // carved groove: light lower-right lip, dark cut, mid floor (lit: glowing inlay)
      shaft(1, 1, "rgba(160,156,148,0.55)", 9); head(1, 1, "rgba(160,156,148,0.55)");
      shaft(0, 0, "#1d1d1c", 9); head(0, 0, "#1d1d1c");
      shaft(0.6, 0.6, lit ? col : "#33332f", 5); head(0.6, 0.6, lit ? col : "#33332f", 0.62);
      if (lit) { g.save(); g.shadowColor = col; g.shadowBlur = 8; shaft(0.6, 0.6, col, 2); g.restore(); }
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
