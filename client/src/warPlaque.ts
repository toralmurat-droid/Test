/**
 * The front plaque (roadmap M1): at the top of the screen while the hero stands in a war territory, it shows who
 * holds the land, the Control bar (the holder's grip, moved every war tick) and any siege announced there. Cosmetic:
 * it only shows the server's "war" snapshot (shared/war/view.ts).
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { TERRITORIES } from "../../shared/war/territories";
import { regionName } from "../../shared/war/regions";
import { territoryAt, type WarView } from "../../shared/war/view";
import type { SiegeView } from "../../shared/war/siege";
import { holdIntel, viewTier } from "../../shared/war/intel";
import { FORT } from "./holdNames";
import { HOLD_TIER_KEYS } from "../../shared/war/holdTiers";
import { fmtCountdown, CLAN_LABEL } from "./warMap";
import type { WarColumns } from "./warColumns";
import { hudSlot } from "./hudSlots";
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
    hudSlot("topleft").append(this.el); // top-left column (hudSlots.css)
  }

  set(v: WarView) { this.view = v; this.shown = ""; }

  private siege?: SiegeView;
  /** The server's live siege battle ("siege" message): a "Fronts n/m <clan>" line while the hero is in that land. */
  setSiege(m: SiegeView) { this.siege = m; this.shown = ""; }

  private ritual?: { line(t: number): string };
  /** The Veiled ritual circle (client/src/warRituals.ts): a "Ritual n%" line while the hero is in its land. */
  setRitual(r: { line(t: number): string }) { this.ritual = r; }

  private sack?: { line(t: number): string };
  /** Sacked Holds (client/src/warSack.ts): "Hold sacked by <clan>" or a banner going up, while the hero is in that land. */
  setSack(r: { line(t: number): string }) { this.sack = r; }

  private cols?: WarColumns;
  /** Marching columns (client/src/warColumns.ts): a "Column of the Redfang marching on X · 4:10" line (time to the war tick) while the hero is in a land one marches on or leaves. */
  setColumns(c: WarColumns) { this.cols = c; }

  /** "Fronts n/m <clan>" for land t: the clan holding the most fronts (the holder on a tie), plus the ram's state if one rolls, or "". */
  private frontsLine(t: number, own: ClanKey): string {
    const m = this.siege;
    if (!m || m.t !== t || !m.fronts?.length) return "";
    const n = new Map<string, number>();
    for (const f of m.fronts) n.set(f.holder, (n.get(f.holder) ?? 0) + 1);
    let best = own as string, bn = n.get(own) ?? 0;
    for (const [k, c] of n) if (c > bn) { best = k; bn = c; }
    const cl = CLANS[best as ClanKey], r = m.ram;
    // the Host's bone ram (shared/war/works.ts): where it is and how whole
    const ram = r ? ` · Ram ${r.state === "gate" ? "at the gate" : r.state === "held" ? "held" : "rolling"} ${Math.round((100 * r.hp) / Math.max(1, r.maxHp))}%` : "";
    return cl ? `Fronts ${bn}/${m.fronts.length} ${cl.name}${ram}` : "";
  }

  /** Call every frame with the hero's tile; it only redraws when something on it changes. */
  update(tx: number, ty: number, standing = "", now = Date.now()) {
    const v = this.view, t = v && territoryAt(Math.floor(tx), Math.floor(ty));
    if (!v || !t || v.owner[t.id] === undefined) { if (!this.el.hidden) this.el.hidden = true; this.shown = ""; return; }
    const own = CLAN_KEYS[v.owner[t.id]], ctl = v.control[t.id], sg = v.sieges.find((s) => s[0] === t.id);
    const line = sg ? `siege:${sg[1]}:${mins(sg[2] - now)}` : `tick:${mins(v.next - now)}`;
    const fronts = sg ? this.frontsLine(t.id, own) : "";
    const rite = this.ritual?.line(t.id) ?? "";
    const sacked = this.sack?.line(t.id) ?? "";
    // the brakes (shared/war/rules.ts): the Night Raiders hunt the leading clan, the war rallies for the weakest
    const brake = v.raided?.includes(t.id) ? "Night Raiders struck here" : v.hunt === v.owner[t.id] ? "The Night Raiders hunt its holder" : v.rally === v.owner[t.id] ? `Rally for ${CLANS[own].name}` : "";
    const col = this.cols?.touching(t.id, now);
    const march = col ? `Column of the ${CLAN_LABEL[col.clan]} marching on ${TERRITORIES[col.to]?.name ?? "?"} · ${fmtCountdown(v.next - now)}` : "";
    const tier = viewTier(v, t.id); // (the guard count follows tier and Control, so it needs no key of its own)
    const key = `${t.id}|${own}|${tier}|${ctl}|${line}|${standing}|${fronts}|${rite}|${brake}|${sacked}|${march}`;
    if (key === this.shown) return;
    this.shown = key;
    const cl = CLANS[own], guards = holdIntel(v, t.id).guards;
    const name = document.createElement("div"); name.className = "wp-name"; name.textContent = t.capitalOf ? `${t.name} (${t.forward ? "forward capital" : "capital"})` : t.name;
    const held = document.createElement("div"); held.className = "wp-held"; held.textContent = cl.name; // the land rides on the holder line, keeping the title short
    const land = document.createElement("span"); land.className = "wp-land"; land.textContent = ` · ${regionName(t.region)}`; held.append(land);
    const tl = document.createElement("div"); tl.className = "wp-foot"; tl.textContent = `${FORT[own][tier]} (${HOLD_TIER_KEYS[tier]})${guards ? ` · ${guards} guards` : ""}`;
    const bar = document.createElement("div"); bar.className = "wp-bar"; bar.title = `Control ${ctl}/100`;
    const fill = document.createElement("i"); fill.style.width = `${ctl}%`; fill.style.background = hex(cl.trim === 0x1a1414 ? cl.cloth : cl.trim);
    const num = document.createElement("b"); num.textContent = `${ctl}`;
    bar.append(fill, num);
    const foot = document.createElement("div"); foot.className = "wp-foot";
    if (sg) { foot.classList.add("siege"); foot.textContent = `${CLANS[CLAN_KEYS[sg[1]]].name} besiege it: ${mins(sg[2] - now)} min`; }
    else foot.textContent = t.capitalOf ? "A capital never falls" : `Fronts move in ${mins(v.next - now)} min`;
    const text = document.createElement("div"); text.className = "wp-text"; text.append(name, held, tl, bar, foot);
    if (fronts) { const fl = document.createElement("div"); fl.className = "wp-foot siege"; fl.textContent = fronts; text.append(fl); }
    if (rite) { const rl = document.createElement("div"); rl.className = "wp-foot"; rl.textContent = rite; text.append(rl); }
    if (sacked) { const sl = document.createElement("div"); sl.className = "wp-foot siege"; sl.textContent = sacked; text.append(sl); }
    if (march) { const ml = document.createElement("div"); ml.className = "wp-foot siege"; ml.textContent = march; text.append(ml); }
    if (brake) { const bl = document.createElement("div"); bl.className = "wp-foot" + (v.rally === v.owner[t.id] && !v.raided?.includes(t.id) ? " rally" : " siege"); bl.textContent = brake; text.append(bl); }
    if (standing) { const me = document.createElement("div"); me.className = "wp-me" + (/cannot|^Swear/.test(standing) ? " no" : ""); me.textContent = standing; text.append(me); }
    this.el.replaceChildren(pennant(own), text);
    this.el.hidden = false;
  }
}
