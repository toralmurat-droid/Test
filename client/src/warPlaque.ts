/**
 * The front plaque (roadmap M1): at the top of the screen while the hero stands in a war territory, it shows who
 * holds the land, the Control bar (the holder's grip, moved every war tick) and any siege announced there. Cosmetic:
 * it only shows the server's "war" snapshot (shared/war/view.ts).
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { territoryAt, type WarView } from "../../shared/war/view";
import "./warPlaque.css";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** A small swallow-tailed pennant in the clan's cloth, trim and sigil colours (16 x 22 pixels, drawn 2x). */
export function pennant(k: ClanKey): HTMLCanvasElement {
  const c = document.createElement("canvas"), W = 16, H = 22;
  c.width = W; c.height = H; c.className = "wp-flag";
  const g = c.getContext("2d")!, cl = CLANS[k];
  g.fillStyle = "#2a1d10"; g.fillRect(0, 0, W, 2); // the pole's crossbar
  for (let y = 2; y < H; y++) {
    const notch = y > H - 6 ? Math.min(5, y - (H - 6)) : 0; // the swallow tail
    for (let x = 1; x < W - 1; x++) {
      if (y >= H - 6 && Math.abs(x - W / 2 + 0.5) < notch) continue;
      const edge = x === 1 || x === W - 2 || y === 2 || (y >= H - 6 && Math.abs(x - W / 2 + 0.5) < notch + 1);
      g.fillStyle = edge ? hex(cl.trim) : hex(cl.cloth);
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = hex(cl.sigil); // the sigil: a small lozenge
  for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) g.fillRect(7 + dx, 9 + dy, 1, 1), g.fillRect(8 + dx, 9 + dy, 1, 1);
  return c;
}

const mins = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export class WarPlaque {
  private el: HTMLDivElement;
  private view?: WarView;
  private shown = "";

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "warplaque";
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  set(v: WarView) { this.view = v; this.shown = ""; }

  /** Call every frame with the hero's tile; it only redraws when something on it changes. */
  update(tx: number, ty: number, standing = "", now = Date.now()) {
    const v = this.view, t = v && territoryAt(Math.floor(tx), Math.floor(ty));
    if (!v || !t || v.owner[t.id] === undefined) { if (!this.el.hidden) this.el.hidden = true; this.shown = ""; return; }
    const own = CLAN_KEYS[v.owner[t.id]], ctl = v.control[t.id], sg = v.sieges.find((s) => s[0] === t.id);
    const line = sg ? `siege:${sg[1]}:${mins(sg[2] - now)}` : `tick:${mins(v.next - now)}`;
    const key = `${t.id}|${own}|${ctl}|${line}|${standing}`;
    if (key === this.shown) return;
    this.shown = key;
    const cl = CLANS[own];
    const name = document.createElement("div"); name.className = "wp-name"; name.textContent = t.capitalOf ? `${t.name} (capital)` : t.name;
    const held = document.createElement("div"); held.className = "wp-held"; held.textContent = cl.name;
    const bar = document.createElement("div"); bar.className = "wp-bar"; bar.title = `Control ${ctl}/100`;
    const fill = document.createElement("i"); fill.style.width = `${ctl}%`; fill.style.background = hex(cl.trim === 0x1a1414 ? cl.cloth : cl.trim);
    const num = document.createElement("b"); num.textContent = `${ctl}`;
    bar.append(fill, num);
    const foot = document.createElement("div"); foot.className = "wp-foot";
    if (sg) { foot.classList.add("siege"); foot.textContent = `${CLANS[CLAN_KEYS[sg[1]]].name} besiege it: ${mins(sg[2] - now)} min`; }
    else foot.textContent = t.capitalOf ? "A capital never falls" : `Fronts move in ${mins(v.next - now)} min`;
    const text = document.createElement("div"); text.className = "wp-text"; text.append(name, held, bar, foot);
    if (standing) { const me = document.createElement("div"); me.className = "wp-me" + (standing.startsWith("You hold") ? "" : " no"); me.textContent = standing; text.append(me); }
    this.el.replaceChildren(pennant(own), text);
    this.el.hidden = false;
  }
}
