import "./tide.css";
import { msUntilDusk, TIDE, TIDE_GATE, TIDE_GOAL } from "../../shared/tide";
import { actOfTile, TILE } from "../../shared/constants";
import { dayTime } from "./details";
import { pixelText } from "./pixeltext";
import { hudSlot } from "./hudSlots";
import type { MapMarker } from "./minimap";

interface Share { name: string; share: number }
interface Result { cleared: boolean; top: Share[]; you?: { share: number; gold: number; rune?: unknown } }
interface Status { n: number; goal: number; marchAt?: number; wave?: number; waves?: number; alive?: number }

const pct = (s: number) => `${Math.round(s * 100)}%`;
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * Client side of The Gloam Tide (shared/tide.ts, server/tide.ts): the meter card in the top-right column, the banners, the end
 * summary and the gate marker. It only draws what the server's "tide" and "sfx" messages say.
 */
export class TideHud {
  private st?: Status;
  private arrived = 0; // local time of the last message
  private left = 0; // ms to dusk when the message arrived (see onTide)
  private box = document.createElement("div");
  private title = document.createElement("div");
  private bar = document.createElement("div");
  private fill = document.createElement("div");
  private sub = document.createElement("div");
  private panel = document.createElement("div");
  private banner = document.createElement("div");
  private bannerTimer?: ReturnType<typeof setTimeout>;
  private panelTimer?: ReturnType<typeof setTimeout>;
  private shown = "";

  constructor(hud: HTMLElement) {
    this.box.id = "tidebox"; this.box.hidden = true;
    this.title.className = "qt-title"; this.sub.className = "qt-obj";
    this.bar.className = "qt-bar"; this.bar.append(this.fill);
    this.box.append(this.title, this.sub, this.bar);
    this.panel.id = "tideresult"; this.panel.hidden = true;
    this.panel.onclick = (ev) => { ev.stopPropagation(); this.panel.hidden = true; };
    this.banner.id = "tidebanner";
    hudSlot("topright").append(this.box); // a card above the quest tracker (flex order, hudSlots.css)
    hud.append(this.panel, this.banner);
  }

  /** "tide" from the server. */
  onTide(m: any) {
    if (!m || typeof m !== "object" || !(+m.goal > 0)) return;
    const prev = this.st;
    this.st = { n: +m.n || 0, goal: +m.goal, marchAt: +m.marchAt > 0 ? +m.marchAt : undefined, wave: +m.wave > 0 ? +m.wave : undefined, waves: +m.waves || undefined, alive: m.alive !== undefined ? +m.alive : undefined };
    this.arrived = performance.now();
    // marchAt is a server clock and the message carries no "now": the dusk is the same on every clock (the day dial runs
    // on it), so count down to the next dusk from the day time, not from the difference between two clocks
    this.left = this.st.marchAt ? msUntilDusk(dayTime(Date.now())) : 0;
    if (this.st.wave && this.st.wave !== prev?.wave) this.say(`Wave ${this.st.wave} of ${this.st.waves}`, "The Gloam Tide marches on the west gate.", "#ff8a5a");
    if (m.result) this.result(m.result as Result);
  }

  private say(big: string, small: string, color: string) {
    this.banner.replaceChildren(pixelText(big, color, 13, 3), pixelText(small, "#ffffff", 11, 2));
    this.banner.classList.remove("show"); void this.banner.offsetWidth; this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.remove("show"), 3600);
  }

  /** Banners for the sfx events (the sounds are in sfx.ts). Returns the point to flash for a wave start. */
  onSfx(ev: any): { x: number; y: number } | undefined {
    if (ev.ev === "tidefull") { this.say("The Gloam stirs...", "The Tide will come at dusk.", "#b79cff"); this.flash(); }
    else if (ev.ev === "tidemarch") { this.flash(); return { x: +ev.x || TIDE_GOAL.x, y: +ev.y || TIDE_GOAL.y }; }
    return undefined;
  }

  private flash() { this.box.classList.remove("flash"); void this.box.offsetWidth; this.box.classList.add("flash"); }

  private result(r: Result) {
    this.say(r.cleared ? "The Tide is broken" : "The Tide ebbs", r.cleared ? "Oakvale's west gate holds." : "The Gloam drifts back into the dark.", r.cleared ? "#b9f27c" : "#c8b8a0");
    const p = this.panel;
    p.replaceChildren();
    const add = (cls: string, text: string) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; p.append(d); };
    add("tr-title", r.cleared ? "The Tide is broken" : "The Tide ebbs");
    (r.top ?? []).slice(0, 3).forEach((t, i) => add("tr-row", `${i + 1}. ${t.name}  ${pct(t.share)}`));
    const y = r.you;
    if (y && y.gold > 0) add("tr-you", `You: ${pct(y.share)} of the damage. +${y.gold} gold${y.rune ? " and a rune" : ""}`);
    else if (y) add("tr-you", `You: ${pct(y.share)}. Under ${pct(TIDE.shareFloor)} is not paid. Get closer to the gate next time (within ${TIDE.creditTiles} tiles).`);
    add("tr-hint", "Tap to close");
    p.hidden = false;
    clearTimeout(this.panelTimer);
    this.panelTimer = setTimeout(() => { p.hidden = true; }, 14000);
  }

  /** Every frame: meter text and fill. Act 1 only. */
  update(heroX: number | undefined, heroY: number | undefined) {
    const s = this.st;
    const act1 = heroX === undefined || heroY === undefined || actOfTile(Math.floor(heroX / TILE), Math.floor(heroY / TILE)) === 1;
    if (!s || !act1) { this.box.hidden = true; return; }
    this.box.hidden = false;
    const marching = !!s.wave, full = s.n >= s.goal;
    let title: string, sub: string, f = Math.min(1, s.n / s.goal);
    if (marching) { title = `Tide: wave ${s.wave}/${s.waves}`; sub = `${s.alive ?? 0} alive. Stand near the west gate.`; f = 1; }
    else if (full) {
      title = "The Tide comes at dusk";
      const ms = s.marchAt ? this.left - (performance.now() - this.arrived) : 0;
      sub = s.marchAt ? (ms > 0 ? `in ${mmss(ms)}` : "now") : "";
      f = 1;
    } else { title = `Tide ${s.n}/${s.goal}`; sub = "Blob kills fill it"; }
    const key = `${title}|${sub}|${f.toFixed(3)}${marching ? "m" : full ? "f" : ""}`;
    if (key === this.shown) return;
    this.shown = key;
    this.title.textContent = title; this.sub.textContent = sub;
    this.fill.style.width = `${f * 100}%`;
    this.box.className = marching ? "march" : full ? "full" : "";
  }

  /** Gate marker and the credit ring while marching: where to stand to be paid. */
  markers(): MapMarker[] {
    if (!this.st?.wave) return [];
    return [
      { x: TIDE_GATE.x, y: TIDE_GATE.y, r: TIDE.creditTiles * TILE, glyph: "", color: "#ff8a5a", label: "Tide: stand here" },
      { x: TIDE_GOAL.x, y: TIDE_GOAL.y, glyph: "!", color: "#ff8a5a", track: true, label: "The Tide" },
    ];
  }
}
