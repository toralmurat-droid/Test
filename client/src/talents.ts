import { respecCost } from "../../shared/upkeep";
import { ClassKind, CLASSES } from "../../shared/classes";
import { DEGREE_GLOSS } from "./songTables";
import { icon as pxIcon } from "./pixelicons";
import { slotKey } from "./keymode";
import { Stats } from "../../shared/powers";
import { iconImg } from "./skillIcons";
import { Node, slabWidth, treeLayout } from "./treeLayout";
import { SheetPreview, talentsOf } from "./sidepanel";
import {
  BRANCHES, childrenOf, EFFECT_TEXT, levelPower, lockReason, maxRank, nextRankLevel, RANK_POWER, rankOf, SkillDef, SKILLS, spentPoints, STACK_NAME,
  synergyPower, talentPoints, withMods, type SkillMod,
  NEED_TEXT,
} from "../../shared/skills";
import { damageText, scaleText, skillDamage } from "../../shared/skillInfo";
import { uiScale } from "./worldscale";

/**
 * Skill tree screen (T), drawn as a real pixel-art tree (shared/skills.ts TREE): a trunk splits into the class's
 * three boughs; every skill sits where its limb grows, higher up the more level it needs. Some limbs fork, some
 * strong skills are dead ends crowned with leaves. Learned limbs are green and leafy, the rest bare wood.
 * Hover a skill to read it (damage for your current stats, attribute scaling, cost), click it to spend a point.
 * Learned actives go on keys 1-0: hover the skill and press a number key, or click a key slot at the bottom.
 */
const H = 520; // the stone slab with the three schools side by side, CSS px (620 wide, or as wide as the class needs: slabWidth)

export class TalentMenu {
  private el = document.getElementById("tree")!;
  private sig = "";
  private hover = "";
  private shown = "";
  private cls?: ClassKind;
  private state: any;
  /** Hover card beside the tile under the mouse (Murat 2026-11-08): the skill's full details. */
  private tip?: HTMLDivElement;
  private tipTimer = 0;

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
      if (this.hover) { if (this.hover !== was || this.tip?.style.display !== "block") this.showTip(); } else this.hideTip();
    });
    this.el.addEventListener("mouseleave", () => { this.hover = ""; this.preview(); this.hideTip(); });
    this.el.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      if (t && t.classList.contains("can")) this.send("learn", t.dataset.talent);
      if (t) { this.details(t.dataset.talent!); this.showTip(); }
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
      (cls === "summoner" ? `Your creatures going back to the Void build Essence (up to 5) for the ultimates.</span>` : cls === "songweaver" ? `Every skill is a note on the scale. Three in the right order ring a chord by themselves. Hover a skill to see its step.</span>` : `Basic hits build ${STACK_NAME[cls]} (up to 5) for some skills.</span>`);

    const W = slabWidth(cls);
    const { nodes: layout, cols } = treeLayout(cls, W, H);
    const colors = BRANCHES[cls].map((b) => b.color);
    let html = `<canvas class="treeart" width="${W}" height="${H}"></canvas><div class="treebox">`;
    for (const n of layout) {
      const s = n.s, r = rankOf(ranks, s.id);
      const why = lockReason(cls, state.level, ranks, s.id);
      const stt = why === "max" ? "max" : why === "" ? "can" : why === "points" || (why === "level" && r > 0) ? (r > 0 ? "has" : "off") : "locked";
      const slot = !s.passive ? slots.indexOf(s.id) : -1;
      const key = slot >= 0 ? `<kbd>${slotKey(slot)}</kbd>` : "";
      const pips = Array.from({ length: maxRank(s) }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
      const leaf = childrenOf(cls, s.id).length === 0;
      const act = !s.passive && r > 0 ? ` data-active="${s.id}"` : "";
      const lvl = why === "level" && r === 0 ? `<span class="nlv">Lv ${s.req}</span>` : "";
      html += `<button class="tnode ${stt}${s.passive ? " passive" : ""}${s.row === 4 ? " ult" : ""}${leaf ? " leaf" : ""}" data-talent="${s.id}"${act} ` +
        `style="left:${n.x}px;top:${n.y}px;--c:${colors[s.branch]}">${iconImg(s.id, "nicon")}${key}${lvl}<span class="pips">${pips}</span><span class="trank">${r || ""}</span></button>`;
    }
    BRANCHES[cls].forEach((b, i) => { html += `<div class="tschool" style="left:${cols[i].mid}px;--c:${b.color}">${b.name}</div>`; });
    html += `<div class="tfoot">${free > 0 ? `${free} skill choice${free > 1 ? "s" : ""} remaining` : "No skill choices remaining"}</div>`;
    html += `</div>`;
    const box = document.getElementById("treebranches")!;
    box.innerHTML = `<div class="treecol"><div class="treewrap theme-${cls}" style="width:${W}px;height:${H}px">${html}</div></div><div id="treeinfo"></div>`;
    this.paint(box.querySelector("canvas.treeart") as HTMLCanvasElement, cls, layout, ranks, colors, cols.slice(1).map((c) => c.x0));
    this.shown = "";
    const pick = this.hover || nodes.find((n) => lockReason(cls, state.level, ranks, n.id) === "")?.id || nodes[0].id;
    this.details(pick);
    if (this.hover) this.showTip(); // the tiles were rebuilt: follow the new one and show fresh numbers
  }

  /** Bronze card with everything about the hovered skill, beside its tile (right of it, or left when no room). */
  private showTip() {
    const id = this.hover;
    const tile = id ? this.el.querySelector(`[data-talent="${id}"]`) as HTMLElement | null : null;
    const html = id ? this.detailHtml(id) : "";
    if (!tile || !html || !this.open) { this.hideTip(); return; }
    if (!this.tip) {
      this.tip = document.createElement("div");
      this.tip.id = "skilltip";
      document.body.appendChild(this.tip);
    }
    const tip = this.tip;
    tip.innerHTML = html;
    tip.style.display = "block";
    const z = uiScale(), r = tile.getBoundingClientRect();
    const w = tip.offsetWidth * z, h = tip.offsetHeight * z;
    let x = r.right + 10;
    if (x + w > innerWidth - 4) x = r.left - 10 - w;
    x = Math.min(Math.max(4, x), innerWidth - w - 4);
    const y = Math.min(Math.max(4, r.top + r.height / 2 - h / 2), innerHeight - h - 4);
    tip.style.left = `${Math.round(x / z)}px`;
    tip.style.top = `${Math.round(y / z)}px`;
    // drop the card when the tree closes or the tile goes away under a still mouse
    if (!this.tipTimer) this.tipTimer = window.setInterval(() => {
      const t = this.hover && this.el.querySelector(`[data-talent="${this.hover}"]`) as HTMLElement | null;
      if (!this.open || !t || !t.offsetParent) this.hideTip();
    }, 200);
  }

  private hideTip() {
    if (this.tip) this.tip.style.display = "none";
    if (this.tipTimer) { clearInterval(this.tipTimer); this.tipTimer = 0; }
  }

  /**
   * The tree on a grey stone slab, Diablo 2 style (Murat 2026-11-07, from his reference picture): mottled, cracked stone
   * in an iron frame, and a chiselled arrow from each skill down to the ones it opens (diagonal when they sit apart).
   * Learned arrows are lit in the school's colour. Painted at 1 canvas px per CSS px.
   */
  private paint(cv: HTMLCanvasElement, cls: ClassKind, nodes: Node[], ranks: any, colors: string[], dividers: number[]) {
    const g = cv.getContext("2d")!;
    const w = cv.width, h = cv.height;
    let seed = 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // the slab's stone follows the class (Murat 2026-11-07): base, big soft blotches, grain, then cracks and a motif
    const th = SLAB_THEMES[cls] ?? SLAB_THEMES.default;
    g.fillStyle = th.base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 70, dark = rnd() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? "rgba(10,10,10,0.2)" : th.blotch); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? th.grain : "10,10,10"},${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1); }
    th.motif?.(g, w, h, rnd);
    // faint carved lines between the schools
    for (const x of dividers) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x - 1, 30, 2, h - 80); g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(x + 1, 30, 1, h - 80); }
    for (let i = 0; i < 14; i++) {
      let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.3) * 40; g.lineTo(x, y); }
      g.strokeStyle = th.crack; g.lineWidth = 1.2; g.stroke();
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

  /** Bar under the tree: the skill last hovered or clicked. */
  private details(id: string) {
    const info = document.getElementById("treeinfo");
    const html = this.detailHtml(id);
    if (!info || !html) return;
    this.shown = id;
    info.innerHTML = html;
  }

  /** Everything about one skill: what it does, damage now and next rank, cost, cooldown, level, path, status. */
  private detailHtml(id: string): string {
    const cls = this.cls, state = this.state;
    if (!cls || !state) return "";
    const s = SKILLS[cls].find((x) => x.id === id);
    if (!s) return "";
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
        if (r > 0 && r < maxRank(s)) {
          const nx = skillDamage(cls, sm, r + 1, st, ranks);
          if (nx) rows.push(`<p class="inext">Next rank: ${nx.total} (+${Math.round(RANK_POWER * 100)}% power, ${s.rankStep ? s.rankStep + ", " : ""}longer effects)</p>`);
        }
      } else if (r > 0 && r < maxRank(s)) rows.push(`<p class="inext">Next rank: ${s.rankStep ? s.rankStep + ", " : ""}longer, stronger effects</p>`);
      const price = [s.cd ? `${s.cd / 1000}s cooldown` : "no cooldown", s.cost ? `<span class="ista">${s.cost} heat</span>` : "", s.mana ? `<span class="imana">${s.mana} mana</span>` : "", s.blood ? `<span class="iblood">${s.blood}% HP</span>` : ""];
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
    if (s.degree) { // Songweaver: which step of the scale it plays, and at which note height (content doc: "note", never "pitch")
      const ht = s.pitch === "L" ? "a low note" : s.pitch === "H" ? "a high note" : s.pitch === "any" ? "every note at once" : "a middle note";
      rows.push(`<p class="iscale">Plays ${ht}, step ${s.degree}: ${DEGREE_GLOSS[s.degree] ?? ""}.</p>`);
    }
    const kids = childrenOf(cls, s.id);
    const parent = s.parent && SKILLS[cls].find((x) => x.id === s.parent);
    const missing = (s.requires ?? []).filter((q) => rankOf(ranks, q) < 1).map((q) => SKILLS[cls].find((x) => x.id === q)?.name ?? q);
    const also = (s.requires ?? []).map((q) => SKILLS[cls].find((x) => x.id === q)?.name ?? q);
    rows.push(`<p class="ipath">${parent ? `Grows from ${parent.name}${also.length ? `, and needs ${also.join(" and ")}` : ""}. ` : "Root of the branch. "}${kids.length ? `Leads to ${kids.map((k) => k.name).join(" and ")}.` : "Dead end: nothing grows higher."}</p>`);
    const slots: string[] = [...(state.slots ?? [])];
    const slot = slots.indexOf(s.id);
    const status = why === "max" ? "Fully learned" : why === "" ? "Click to learn" : why === "level" ? `${pxIcon("lock")}${r > 0 ? `Rank ${r + 1} needs level ${nextRankLevel(s, r)}` : `Needs level ${s.req}`}` :
      why === "above" ? `${pxIcon("lock")}Learn ${parent ? parent.name : "the skill below"} first` :
      why === "requires" ? `${pxIcon("lock")}Learn ${missing.join(" and ")} first` : r > 0 ? "Learned · no points left" : "No points left";
    const keyNote = !s.passive && r > 0 ? (slot >= 0 ? ` · on key ${slotKey(slot)}` : ` · hover it and press ${slotKey(0)}-${slotKey(8)} to put it on a key`) : "";
    const pips = Array.from({ length: maxRank(s) }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
    return `<div class="ihead" style="--c:${color}">${iconImg(s.id, "iicon")}<div><b>${s.name}</b>` +
      `<span class="ttype${s.passive ? " pas" : ""}">${s.type} · Lv ${s.req}</span><span class="pips">${pips}</span></div></div>` +
      `<p class="idesc"><b class="iname" style="color:${color}">${s.name}</b> <span class="ttype">· ${s.type}${maxRank(s) > 1 ? ` · rank ${r} of ${maxRank(s)}` : ""}</span> ${s.desc}</p>${s.needs ? `<p class="idesc ineed">Needs ${NEED_TEXT[s.needs]} in hand.</p>` : ""}${rows.join("")}<p class="istat ${why === "" ? "can" : ""}">${status}${keyNote}</p>`;
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

/** Stone of the skill slab per class: base colour, light blotches, grain, cracks, and a motif painted over it. */
type Paint = (g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;
const SLAB_THEMES: Record<string, { base: string; blotch: string; grain: string; crack: string; motif?: Paint }> = {
  default: { base: "#4b4a47", blotch: "rgba(140,138,130,0.14)", grain: "190,186,176", crack: "rgba(25,24,22,0.55)" },
  // Wizard: indigo slate, faint stars and glowing arcane runes
  wizard: { base: "#2c2d44", blotch: "rgba(120,130,200,0.12)", grain: "170,175,230", crack: "rgba(10,10,30,0.6)", motif: (g, w, h, rnd) => {
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(200,210,255,${0.15 + rnd() * 0.35})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
    g.save(); g.strokeStyle = "rgba(150,170,255,0.16)"; g.shadowColor = "#8fa2ff"; g.shadowBlur = 6; g.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) { // runes: a stem with two or three short strokes
      const x = 24 + rnd() * (w - 48), y = 24 + rnd() * (h - 70), s = 6 + rnd() * 5;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x, y + s);
      for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) { const yy = y - s + rnd() * 2 * s, d = (rnd() < 0.5 ? -1 : 1) * s * 0.7; g.moveTo(x, yy); g.lineTo(x + d, yy + (rnd() - 0.5) * s); }
      g.stroke();
    }
    g.restore();
  } },
  // Vampire: blood-black marble with red veins
  vampire: { base: "#2a1416", blotch: "rgba(160,40,50,0.14)", grain: "200,120,120", crack: "rgba(120,10,20,0.55)", motif: (g, w, h, rnd) => {
    g.save(); g.shadowColor = "#a01020"; g.shadowBlur = 4;
    for (let i = 0; i < 9; i++) {
      let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.4) * 30; g.lineTo(x, y); }
      g.strokeStyle = `rgba(170,20,35,${0.25 + rnd() * 0.25})`; g.lineWidth = 0.8 + rnd(); g.stroke();
    }
    g.restore();
  } },
  // Songweaver: warm walnut with faint staff lines and notes
  songweaver: { base: "#33261a", blotch: "rgba(210,160,80,0.10)", grain: "225,190,130", crack: "rgba(20,10,4,0.55)", motif: (g, w, h, rnd) => {
    g.save(); g.strokeStyle = "rgba(255,210,120,0.10)"; g.lineWidth = 1;
    for (let b = 0; b < 3; b++) { const y0 = h * (0.2 + b * 0.28); for (let l = 0; l < 5; l++) { g.beginPath(); g.moveTo(0, y0 + l * 5); g.lineTo(w, y0 + l * 5); g.stroke(); } }
    g.fillStyle = "rgba(255,210,120,0.14)";
    for (let i = 0; i < 14; i++) { const x = 20 + rnd() * (w - 40), y = h * (0.2 + Math.floor(rnd() * 3) * 0.28) + Math.floor(rnd() * 5) * 2.5; g.beginPath(); g.ellipse(x, y, 3.2, 2.4, -0.3, 0, Math.PI * 2); g.fill(); g.fillRect(x + 2.4, y - 12, 1, 12); }
    g.restore();
  } },
  // Summoner: dark teal stone with faded ritual circles
  summoner: { base: "#1f2e2c", blotch: "rgba(90,170,150,0.12)", grain: "150,210,195", crack: "rgba(5,20,18,0.6)", motif: (g, w, h, rnd) => {
    g.save(); g.strokeStyle = "rgba(120,220,190,0.13)"; g.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const x = (w / 3) * (i + 0.5), y = h * (0.35 + rnd() * 0.3), r = 60 + rnd() * 30;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.75, 0, Math.PI * 2); g.stroke();
      g.beginPath(); for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5; g[k ? "lineTo" : "moveTo"](x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); } g.stroke();
    }
    g.restore();
  } },
};
