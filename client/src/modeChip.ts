import { DORIAN_RADIUS, isMode, LYDIAN_SHIELD, modeColour, MODES, PHRYGIAN, type ModeId } from "../../shared/songs";
import { MODE_COLOR } from "./songTables";

/**
 * The Songweaver's current mode as a small square beside the Song orb (owner only, cosmetic): a colour bar and a two-letter label in the
 * mode's colour; the name and what it does show in the HUD hover card. Every number comes from shared/songs.ts (MODES, LYDIAN_SHIELD,
 * DORIAN_RADIUS, PHRYGIAN) scaled by modeColour() with her skill ranks. The mode comes from her own `mode:` status word.
 */
const pct = (v: number) => `${Math.round(v * 100)}%`;
const x2 = (v: number) => `×${Math.round(v * 100) / 100}`;

/** Pop-out text for one mode at her ranks: heading, effect line, a fuller description. */
export function modeText(mode: ModeId, rank: (id: string) => number): { head: string; line: string; desc: string } {
  const d = MODES[mode], c = modeColour(mode, rank);
  let line = `Heals ${x2(d.ally)} \u00b7 Damage ${x2(d.foe)}`, desc = `Heals, shields and buffs ${x2(d.ally)}, damage ${x2(d.foe)}.`;
  if (mode === "lydian") {
    const s = pct(LYDIAN_SHIELD.share * c);
    line += ` \u00b7 Overheal \u2192 shield ${s}`; desc += ` Healing past full becomes a shield: ${s} of the overflow, up to ${LYDIAN_SHIELD.maxPct}% of max HP for ${LYDIAN_SHIELD.ms / 1000} s.`;
  } else if (mode === "dorian") {
    const r = pct(DORIAN_RADIUS * c);
    line += ` \u00b7 Reach +${r}`; desc += ` Your songs reach ${r} further.`;
  } else if (mode === "phrygian") {
    const p = pct(PHRYGIAN.poise * c), r = pct(PHRYGIAN.res * c);
    line += ` \u00b7 Poise +${p} \u00b7 Res +${r}`; desc += ` Notes drain ${p} more poise and build ${r} more resonance.`;
  }
  return { head: `${d.name} mode`, line, desc: desc + " Modulate switches to the next mode you know." };
}

/** Two-letter label from the mode's name, so a new mode never renders blank. */
export const modeAbbr = (m: ModeId) => MODES[m].name.slice(0, 2);

export class ModeChip {
  readonly el: HTMLDivElement;
  private ab: HTMLElement;
  private key = "";

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "modechip"; this.el.hidden = true;
    this.el.innerHTML = `<i class="mcsw"></i><b class="mcab"></b>`;
    this.ab = this.el.querySelector(".mcab")!;
    parent.prepend(this.el);
  }

  /** `mode`: from her status word (undefined = none yet); `rank`: her skill ranks. The hover card is the HUD tooltip (tooltip.ts). */
  update(mode: string | undefined, rank: (id: string) => number) {
    if (!mode || !isMode(mode)) { if (!this.el.hidden) this.el.hidden = true; this.key = ""; return; }
    const { head, line, desc } = modeText(mode, rank), key = mode + line;
    this.el.hidden = false;
    if (key === this.key) return;
    this.key = key;
    this.el.style.setProperty("--mc", "#" + MODE_COLOR[mode].toString(16).padStart(6, "0"));
    this.ab.textContent = modeAbbr(mode);
    this.el.dataset.tiphead = head; this.el.dataset.tip = line; this.el.dataset.tiphint = desc;
  }
}
