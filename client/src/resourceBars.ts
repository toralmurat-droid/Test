// Top-left resource HUD (Murat's design handoff "3b: grow, then cap"): a gold-rimmed level shield next to
// pixel-capsule HP / Mana / Stamina bars and a thin XP bar. Bars get longer as the hero's max values grow,
// up to a cap; past the cap faint tick marks show the extra. Hits leave a pale "damage ghost" that lingers
// 420 ms and then drains, so a big hit reads at a glance. All sizes are 1x logical px, no smoothing.

type Kind = "hp" | "mp" | "st";

const NUMS_KEY = "rbars.numbers";

/** Bar length from its max value (tuned to the game's stats: ~190 px at Lv 1, cap around mid-game). */
const WIDTH: Record<Kind, (max: number) => number> = {
  hp: (m) => Math.min(320, 140 + 0.5 * m),
  mp: (m) => Math.min(260, 110 + 1.0 * m),
  st: (m) => Math.min(260, 2 * m),
};
const UNCAPPED: Record<Kind, (max: number) => number> = {
  hp: (m) => 140 + 0.5 * m, mp: (m) => 110 + 1.0 * m, st: (m) => 2 * m,
};
/** Value per tick mark once a bar is capped. */
const TICK: Record<Kind, number> = { hp: 50, mp: 20, st: 20 };

class Bar {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private ghost: HTMLElement;
  private ticks: HTMLElement;
  private txt: HTMLElement;
  private cur = -1;
  private max = -1;
  private width = -1;
  private ghostVal = -1;
  private timer = 0;
  private text = "";

  constructor(parent: HTMLElement, private kind: Kind) {
    this.el = document.createElement("div");
    this.el.className = `rb-bar rb-${kind}`;
    this.el.innerHTML = `<div class="rb-ghost"></div><div class="rb-fill"></div><div class="rb-ticks"></div><span class="rb-txt"></span>`;
    [this.ghost, this.fill, this.ticks, this.txt] = Array.from(this.el.children) as HTMLElement[];
    parent.appendChild(this.el);
  }

  private pct(v: number) { return `${this.max > 0 ? Math.max(0, Math.min(1, v / this.max)) * 100 : 0}%`; }

  update(cur: number, max: number) {
    cur = Math.max(0, Math.min(cur, max));
    if (max !== this.max) {
      this.max = max;
      const w = Math.round(WIDTH[this.kind](max));
      if (w !== this.width) {
        // First draw snaps; later growth (level up, gear) steps out in 8 chunky pixel steps
        this.el.style.transition = this.width < 0 ? "none" : "";
        this.el.style.width = `${w}px`;
        this.width = w;
      }
      const capped = UNCAPPED[this.kind](max) > w;
      this.ticks.style.opacity = capped ? "1" : "0";
      if (capped) this.ticks.style.backgroundSize = `${(w * TICK[this.kind]) / max}px 100%`;
      this.fill.style.width = this.pct(cur);
      this.ghost.style.width = this.pct(Math.max(cur, this.ghostVal));
    }
    if (cur !== this.cur) {
      const first = this.cur < 0;
      const drop = !first && cur < this.cur;
      this.fill.style.width = this.pct(cur);
      if (drop) {
        // Ghost holds the old value; every new hit restarts the hold
        if (this.ghostVal < this.cur) { this.ghostVal = this.cur; this.ghost.style.transition = "none"; this.ghost.style.width = this.pct(this.ghostVal); }
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
          this.ghost.style.transition = "";
          this.ghostVal = this.cur;
          this.ghost.style.width = this.pct(this.cur);
        }, 420);
      } else if (cur >= this.ghostVal) {
        clearTimeout(this.timer);
        this.ghostVal = cur;
        this.ghost.style.transition = first ? "none" : "width .12s ease";
        this.ghost.style.width = this.pct(cur);
      }
      this.cur = cur;
    }
    const t = `${Math.round(cur)} / ${Math.round(max)}`;
    if (t !== this.text) { this.txt.textContent = t; this.text = t; }
  }
}

/** Pentagon shield drawn row by row so the slanted sides are clean pixel stairs. Painted at half size and shown 2x,
 * so every pixel is 2x2 screen px like the world art: dark outline, gold rim lit from the top-left, worn red field. */
function drawCrest(c: HTMLCanvasElement) {
  c.width = 30; c.height = 37;
  const g = c.getContext("2d")!;
  const rows = (x0: number, y0: number, w: number, h: number) => {
    const knee = Math.round(h * 0.62), out: [number, number][] = [];
    for (let y = 0; y < h; y++) {
      const rw = y < knee ? w : Math.max(2, Math.round((w * (h - y)) / (h - knee) / 2) * 2);
      out.push([x0 + (w - rw) / 2, rw]);
    }
    return out;
  };
  const fill = (x0: number, y0: number, w: number, h: number, col: string, lit?: string, dark?: string) => {
    rows(x0, y0, w, h).forEach(([x, rw], y) => {
      g.fillStyle = col; g.fillRect(x, y0 + y, rw, 1);
      if (lit && y < 1) { g.fillStyle = lit; g.fillRect(x, y0 + y, rw, 1); }
      if (lit) { g.fillStyle = lit; g.fillRect(x, y0 + y, 1, 1); }
      if (dark) { g.fillStyle = dark; g.fillRect(x + rw - 1, y0 + y, 1, 1); }
    });
  };
  fill(0, 0, 30, 37, "#120D07");
  fill(1, 1, 28, 35, "#C9A050", "#E8C25A", "#7A5A26");
  fill(3, 3, 24, 31, "#120D07");
  fill(4, 4, 22, 29, "#7E1A22", "#A0303A", "#55101A");
  // a few worn, darker specks on the field (fixed pattern, so it never flickers)
  g.fillStyle = "#64141B";
  for (const [x, y] of [[7, 22], [20, 9], [18, 25], [9, 12], [14, 29]]) g.fillRect(x, y, 1, 1);
}

export class ResourceBars {
  private root: HTMLElement;
  private hp: Bar;
  private mp: Bar;
  private st: Bar;
  private xpFill: HTMLElement;
  private xpBar: HTMLElement;
  private lvEl: HTMLElement;
  private level = -1;
  private xpPct = "";
  private xpTip = "";
  private xpTxt: HTMLElement;
  private xpW = -1;

  constructor(hud: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "rbars";
    this.root.innerHTML = `<div class="rb-crest"><canvas></canvas><span class="rb-lv">LV</span><span class="rb-num"></span></div><div class="rb-stack"></div>`;
    drawCrest(this.root.querySelector("canvas")!);
    this.lvEl = this.root.querySelector(".rb-num")!;
    const stack = this.root.querySelector(".rb-stack") as HTMLElement;
    this.hp = new Bar(stack, "hp");
    this.mp = new Bar(stack, "mp");
    this.st = new Bar(stack, "st");
    // XP bar sits above the slot bar (Murat): bronze menu frame, gold fill, progress text inside on hover
    this.xpBar = document.createElement("div");
    this.xpBar.id = "xpbar";
    this.xpBar.innerHTML = `<div class="xp-fill"></div><span class="xp-txt"></span>`;
    this.xpFill = this.xpBar.firstElementChild as HTMLElement;
    this.xpTxt = this.xpBar.lastElementChild as HTMLElement;
    hud.appendChild(this.xpBar);
    hud.prepend(this.root);
    this.setNumbers(ResourceBars.numbersOn());
  }

  static numbersOn() { try { return localStorage.getItem(NUMS_KEY) !== "0"; } catch { return true; } }
  setNumbers(on: boolean) {
    this.root.classList.toggle("rb-nonums", !on);
    try { localStorage.setItem(NUMS_KEY, on ? "1" : "0"); } catch { /* private window */ }
  }
  toggleNumbers() { this.setNumbers(this.root.classList.contains("rb-nonums")); }

  update(s: { level: number; hp: number; maxHp: number; mp: number; maxMp: number; st: number; maxSt: number; xpFrac: number; xp?: number; xpNeed?: number }) {
    this.hp.update(Math.ceil(s.hp), Math.round(s.maxHp));
    this.mp.update(Math.floor(s.mp), s.maxMp);
    this.st.update(Math.floor(s.st), s.maxSt);
    if (s.level !== this.level) {
      if (this.level >= 0) { this.xpFill.style.transition = "none"; this.xpFill.style.width = "0%"; void this.xpFill.offsetWidth; this.xpFill.style.transition = ""; }
      this.level = s.level;
      this.lvEl.textContent = String(s.level);
    }
    // Same width as the slot bar under it
    const hb = document.getElementById("hotbar");
    const w = hb ? hb.offsetWidth : 0;
    if (w > 0 && w !== this.xpW) { this.xpBar.style.width = `${w}px`; this.xpW = w; }
    const p = `${Math.max(0, Math.min(1, s.xpFrac)) * 100}%`;
    if (p !== this.xpPct) { this.xpFill.style.width = p; this.xpPct = p; }
    // Shown inside the bar on hover: XP into this level / XP needed for the next one
    const tipTxt = s.xpNeed === undefined ? "Max level" : `${Math.max(0, Math.floor(s.xp ?? 0))} / ${s.xpNeed} XP to level ${s.level + 1}`;
    if (tipTxt !== this.xpTip) { this.xpTxt.textContent = tipTxt; this.xpTip = tipTxt; }
  }
}
