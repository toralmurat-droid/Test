import { ClassKind } from "../../shared/classes";
import { Equipped, GEAR_SLOTS } from "../../shared/gear";
import { heroSheet, Sheet, SheetHero } from "../../shared/heroSheet";
import { fillIcons } from "./pixelicons";
import { plateArt } from "./plateArt";
import { ELEMENT_NAMES, REACTIONS, REACTION_IDS, REACTION_MARK_MS, REACTION_SELF_FACTOR } from "../../shared/elements";
import type { Feast } from "../../shared/devour";
import { own } from "./own";

/** What my hero has eaten with Devour (the server sends it as "feast"). */
let myFeast: Feast = {};
export const setMyFeast = (f: Feast) => { myFeast = f ?? {}; };
export const feastOf = () => myFeast;

/**
 * Side panel (right side of the screen) holding the Character (C), Inventory (G) and Skills (T) screens as tabs.
 * The numbers live once, on the Character tab (TownScene.showHeroMenu); hovering a bag item, a worn item, a skill or a
 * + shows what would change there (green / red).
 * The tab screens are the old #hero, #gear and #tree panels, moved inside #spbody.
 */
export type SideTab = "hero" | "gear" | "tree";
export const SIDE_TABS: SideTab[] = ["hero", "gear", "tree"];

export interface SheetPreview { label: string; eq?: Equipped; talents?: Record<string, number>; pts?: SheetHero["pts"]; /** show the gear's stats even if the hero can't wear it yet */ ignoreReq?: boolean }

/** Our own hero's state -> the input of shared/heroSheet.ts (points and talents are owner-only, in Player.me). */
export function sheetHero(state: any): SheetHero {
  const o = own(state);
  return {
    cls: state.cls as ClassKind, level: state.level ?? 1,
    pts: { sta: o.ptSta, str: o.ptStr, mag: o.ptMag, dex: o.ptDex },
    talents: talentsOf(state), feast: myFeast,
  };
}
/** Our own hero's talent ranks as a plain record (empty until `me` arrives). */
export function talentsOf(state: any): Record<string, number> {
  const out: Record<string, number> = {};
  own(state).talents.forEach((v: number, k: string) => { out[k] = v; });
  return out;
}
export const wornOf = (state: any): Equipped => Object.fromEntries(GEAR_SLOTS.filter((s) => state[s]).map((s) => [s, state[s]]));

/** Elemental reactions (shared/elements.ts REACTIONS): the one place in game that says how elements combine. */
export const reactionHelp = () => `An elemental hit marks a monster for ${REACTION_MARK_MS / 1000}s; another element on the mark reacts (${REACTION_IDS.map((r) => `${REACTIONS[r].els.map((e) => ELEMENT_NAMES[e]).join(" + ")} = ${REACTIONS[r].name}`).join(", ")}). Full effect on another hero's mark, ${Math.round(REACTION_SELF_FACTOR * 100)}% on your own.`;

export class SidePanel {
  private el = document.getElementById("sidepanel")!;
  tab: SideTab = "gear";
  private preview?: SheetPreview;

  constructor(onTab: (tab: SideTab) => void, onClose: () => void) {
    fillIcons(this.el);
    this.el.style.cssText += plateArt("elite").style; // the bronze frame of the elite monster plate (plateArt.ts)
    this.el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("#sptabs button")) ev.preventDefault(); });
    for (const b of this.el.querySelectorAll<HTMLButtonElement>("#sptabs [data-tab]")) {
      b.tabIndex = -1;
      b.onclick = () => onTab(b.dataset.tab as SideTab);
    }
    const x = document.getElementById("spclose")!;
    x.tabIndex = -1;
    x.onclick = () => onClose();
  }

  get open() { return !this.el.hidden; }

  /** Shows the panel on a tab (the tab's own screen fills itself in). */
  show(tab: SideTab) {
    this.tab = tab;
    this.el.hidden = false;
    for (const t of SIDE_TABS) document.getElementById(t)!.hidden = t !== tab;
    for (const b of this.el.querySelectorAll<HTMLElement>("#sptabs [data-tab]")) b.classList.toggle("on", b.dataset.tab === tab);
    this.preview = undefined;
  }

  close() {
    this.el.hidden = true;
    for (const t of SIDE_TABS) document.getElementById(t)!.hidden = true;
    this.preview = undefined;
  }

  /** What-if shown on the Character tab's numbers (undefined: back to the current numbers). */
  setPreview(p?: SheetPreview) { this.preview = p; }
  /** Changes whenever the preview does (the Character tab redraws its numbers on it). */
  get previewSig() { const p = this.preview; return p ? JSON.stringify([p.label, p.eq, p.talents, p.pts, p.ignoreReq]) : ""; }

  /** The sheet now and with the preview applied (`next` is undefined without a preview). */
  sheets(state: any): { now: Sheet; next?: Sheet; label?: string } {
    const h = sheetHero(state), worn = wornOf(state), p = this.preview;
    const now = heroSheet(h, worn);
    const next = p ? heroSheet(p.pts ? { ...h, pts: p.pts } : h, p.eq ?? worn, p.talents ?? h.talents, p.ignoreReq) : undefined;
    return { now, next, label: p?.label };
  }

  /** Keeps the tab buttons in step with the menus (a screen can close itself, e.g. the hero menu with C); called every frame. */
  refresh(state: any) {
    if (!this.open || !state) return;
    if (SIDE_TABS.every((t) => document.getElementById(t)!.hidden)) this.close();
  }

  /** Small red badges on the Character and Skills tabs: points left to spend. */
  setBadges(stat: number, skill: number) {
    for (const [id, n] of [["sphbadge", stat], ["sptbadge", skill]] as const) {
      const b = document.getElementById(id)!;
      b.hidden = n <= 0;
      b.textContent = String(n);
    }
  }
}
