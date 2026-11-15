import { DORIAN_RADIUS, isMode, LYDIAN_SHIELD, modeColour, MODES, PHRYGIAN, type ModeId } from "../../shared/songs";
import { MODE_COLOR } from "./songTables";

/**
 * The Songweaver's current mode as a small chip beside the Song orb (owner only, cosmetic): a swatch and frame in the
 * mode's colour, its name, and one line of what it does. Every number comes from shared/songs.ts (MODES, LYDIAN_SHIELD,
 * DORIAN_RADIUS, PHRYGIAN) scaled by modeColour() with her skill ranks. The mode comes from her own `mode:` status word.
 */
const pct = (v: number) => `${Math.round(v * 100)}%`;
const x2 = (v: number) => `×${Math.round(v * 100) / 100}`;

/** The chip's short effect line and the fuller tooltip for one mode at her ranks. */
export function modeText(mode: ModeId, rank: (id: string) => number): { line: string; tip: string } {
  const d = MODES[mode], c = modeColour(mode, rank);
  let line = `Heals ${x2(d.ally)} · Damage ${x2(d.foe)}`, tip = `${d.name}: heals, shields and buffs ${x2(d.ally)}, damage ${x2(d.foe)}.`;
  if (mode === "lydian") {
    const s = pct(LYDIAN_SHIELD.share * c);
    line += ` · Overheal → shield ${s}`; tip += ` Healing past full becomes a shield: ${s} of the overflow, up to ${LYDIAN_SHIELD.maxPct}% of max HP for ${LYDIAN_SHIELD.ms / 1000} s.`;
  } else if (mode === "dorian") {
    const r = pct(DORIAN_RADIUS * c);
    line += ` · Reach +${r}`; tip += ` Your songs reach ${r} further.`;
  } else if (mode === "phrygian") {
    const p = pct(PHRYGIAN.poise * c), r = pct(PHRYGIAN.res * c);
    line += ` · Poise +${p} · Res +${r}`; tip += ` Notes drain ${p} more poise and build ${r} more resonance.`;
  }
  return { line, tip: tip + " Modulate switches to the next mode you know." };
}

export class ModeChip {
  readonly el: HTMLDivElement;
  private name: HTMLElement;
  private eff: HTMLElement;
  private key = "";

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "modechip"; this.el.hidden = true;
    this.el.innerHTML = `<i class="mcsw"></i><div class="mctx"><b class="mcname"></b><em class="mceff"></em></div>`;
    this.name = this.el.querySelector(".mcname")!; this.eff = this.el.querySelector(".mceff")!;
    parent.prepend(this.el);
  }

  /** `mode`: from her status word (undefined = none yet); `rank`: her skill ranks. */
  update(mode: string | undefined, rank: (id: string) => number) {
    if (!mode || !isMode(mode)) { if (!this.el.hidden) this.el.hidden = true; this.key = ""; return; }
    const { line, tip } = modeText(mode, rank), key = mode + line;
    this.el.hidden = false;
    if (key === this.key) return;
    this.key = key;
    const col = "#" + MODE_COLOR[mode].toString(16).padStart(6, "0");
    this.el.style.setProperty("--mc", col);
    this.name.textContent = MODES[mode].name; this.eff.textContent = line; this.el.title = tip;
  }
}
