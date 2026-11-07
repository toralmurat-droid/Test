import { ClassKind } from "../../shared/classes";
import { Equipped, GEAR_SLOTS } from "../../shared/gear";
import { heroSheet, Sheet, SheetHero, SHEET_ROWS } from "../../shared/heroSheet";
import { fillIcons } from "./pixelicons";
import { ELEMENTS, ELEMENT_NAMES, type Element } from "../../shared/elements";
import { Feast, feastLines } from "../../shared/devour";

/** What my hero has eaten with Devour (the server sends it as "feast"). */
let myFeast: Feast = {};
export const setMyFeast = (f: Feast) => { myFeast = f ?? {}; };

/**
 * Side panel (right side of the screen) holding the Character (C), Inventory (G) and Skills (T) screens as tabs.
 * The character sheet block on top (health, mana, defense, attack, damage, magic, spell damage, crit) stays visible on
 * every tab and updates live. Hovering a bag item, a worn item or a skill shows what would change (green / red).
 * The tab screens are the old #hero, #gear and #tree panels, moved inside #spbody.
 */
export type SideTab = "hero" | "gear" | "tree";
export const SIDE_TABS: SideTab[] = ["hero", "gear", "tree"];

export interface SheetPreview { label: string; eq?: Equipped; talents?: Record<string, number>; pts?: SheetHero["pts"] }

/** Hero state -> the input of shared/heroSheet.ts. */
export function sheetHero(state: any): SheetHero {
  return {
    cls: state.cls as ClassKind, level: state.level ?? 1,
    pts: { sta: state.ptSta ?? 0, str: state.ptStr ?? 0, mag: state.ptMag ?? 0, dex: state.ptDex ?? 0 },
    talents: talentsOf(state), feast: myFeast,
  };
}
export function talentsOf(state: any): Record<string, number> {
  const out: Record<string, number> = {};
  state.talents?.forEach?.((v: number, k: string) => { out[k] = v; });
  return out;
}
export const wornOf = (state: any): Equipped => Object.fromEntries(GEAR_SLOTS.filter((s) => state[s]).map((s) => [s, state[s]]));

export class SidePanel {
  private el = document.getElementById("sidepanel")!;
  private sheetEl = document.getElementById("spsheet")!;
  tab: SideTab = "gear";
  private preview?: SheetPreview;
  private sig = "";

  constructor(onTab: (tab: SideTab) => void, onClose: () => void) {
    fillIcons(this.el);
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
    this.sig = "";
  }

  close() {
    this.el.hidden = true;
    for (const t of SIDE_TABS) document.getElementById(t)!.hidden = true;
    this.preview = undefined;
  }

  /** What-if shown in the sheet block (undefined: back to the current numbers). */
  setPreview(p?: SheetPreview) { this.preview = p; }

  /** Redraws the sheet block when a number changed (called every frame while open). */
  refresh(state: any) {
    if (!this.open || !state) return;
    // the tab buttons follow the menus' own state (a screen can close itself, e.g. the hero menu with C)
    if (SIDE_TABS.every((t) => document.getElementById(t)!.hidden)) { this.close(); return; }
    const h = sheetHero(state), worn = wornOf(state);
    const now = heroSheet(h, worn);
    const p = this.preview;
    const next = p ? heroSheet(p.pts ? { ...h, pts: p.pts } : h, p.eq ?? worn, p.talents ?? h.talents) : undefined;
    const sig = JSON.stringify([now, next, p?.label]);
    if (sig === this.sig) return;
    this.sig = sig;
    // A fixed column on the left of every tab (Murat 2026-11-07): offense, defense, attributes, resistances, each with
    // what a hovered item / point / skill would change
    const row = (label: string, v: number, n: number, pct = false) => {
      const d = n - v;
      const delta = d ? `<em class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}${pct ? "%" : ""}</em>` : "";
      return `<div class="sprow${d ? (d > 0 ? " up" : " down") : ""}"><span>${label}</span><b>${n}${pct ? "%" : ""}</b>${delta}</div>`;
    };
    const get = (k: keyof Sheet) => [now[k] as number, next ? (next[k] as number) : (now[k] as number)] as const;
    const sheetRow = (k: keyof Sheet, label: string, pct = false) => { const [v, n] = get(k); return row(label, v, n, pct); };
    const st = (k: keyof Sheet["stats"], label: string) => row(label, now.stats[k] ?? 0, (next ?? now).stats[k] ?? 0);
    const rs = (e: Element) => row(ELEMENT_NAMES[e], now.res[e] ?? 0, (next ?? now).res[e] ?? 0, true);
    const sec = (title: string, body: string) => `<div class="spsec"><h4>${title}</h4>${body}</div>`;
    void SHEET_ROWS;
    const fed = feastLines(myFeast); // Devour: what the hero has eaten
    this.sheetEl.innerHTML =
      sec("Offense", sheetRow("atk", "Attack") + sheetRow("dps", "Damage / s") + sheetRow("spell", "Spell damage", true) + sheetRow("crit", "Critical chance", true)) +
      sec("Defense", sheetRow("hp", "Health") + sheetRow("mana", "Mana") + sheetRow("def", "Damage blocked", true) + sheetRow("speed", "Move speed")) +
      sec("Attributes", st("str", "Strength") + st("sta", "Stamina") + st("mag", "Magic") + st("dex", "Dexterity")) +
      sec("Resistances", ELEMENTS.map(rs).join("")) +
      (fed.length ? sec("Devoured", fed.map((l) => `<div class="sprow"><span>${l}</span></div>`).join("")) : "") +
      `<div class="spnote">${p ? `If you ${p.label}` : "Hover an item or a skill to see what it changes"}</div>`;
  }
}
