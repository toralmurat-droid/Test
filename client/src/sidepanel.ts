import { ClassKind } from "../../shared/classes";
import { Equipped, GEAR_SLOTS } from "../../shared/gear";
import { heroSheet, Sheet, SheetHero, SHEET_ROWS } from "../../shared/heroSheet";
import { fillIcons } from "./pixelicons";
import { ELEMENTS, ELEMENT_NAMES, REACTIONS, REACTION_IDS, REACTION_MARK_MS, REACTION_SELF_FACTOR, type Element } from "../../shared/elements";
import { Feast, feastLines } from "../../shared/devour";
import { own } from "./own";

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
const reactionHelp = () => `An elemental hit marks a monster for ${REACTION_MARK_MS / 1000}s; another element on the mark reacts (${REACTION_IDS.map((r) => `${REACTIONS[r].els.map((e) => ELEMENT_NAMES[e]).join(" + ")} = ${REACTIONS[r].name}`).join(", ")}). Full effect on another hero's mark, ${Math.round(REACTION_SELF_FACTOR * 100)}% on your own.`;

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
    const next = p ? heroSheet(p.pts ? { ...h, pts: p.pts } : h, p.eq ?? worn, p.talents ?? h.talents, p.ignoreReq) : undefined;
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
    // resistances as five coloured chips (Murat 2026-11-08 redesign), the change under the number when hovering
    const rs = (e: Element) => {
      const v = now.res[e] ?? 0, n = (next ?? now).res[e] ?? 0, d = n - v;
      return `<div title="${ELEMENT_NAMES[e]} resist" class="spres res-${e}${v || n ? "" : " zero"}"><b>${n}</b><small>${({ fire: "Fire", cold: "Cold", poison: "Pois", faith: "Faith", shock: "Shock" } as Record<string, string>)[e] ?? ELEMENT_NAMES[e]}</small>${d ? `<em class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</em>` : ""}</div>`;
    };
    // offense as four tiles: label, big number, the change beside it
    const tile = (k: keyof Sheet, label: string, pct = false) => {
      const [v, n] = get(k), d = n - v;
      return `<div class="sptile${d ? (d > 0 ? " up" : " down") : ""}"><small>${label}</small><b>${n}${pct ? "%" : ""}</b>${d ? `<em class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}${pct ? "%" : ""}</em>` : ""}</div>`;
    };
    const sec = (title: string, body: string) => `<div class="spsec"><h4>${title}</h4>${body}</div>`;
    void SHEET_ROWS;
    const fed = feastLines(myFeast); // Devour: what the hero has eaten
    this.sheetEl.innerHTML =
      sec("Offense", `<div class="sptiles">${tile("spell", "Spell dmg", true)}${tile("dps", "Damage / s")}${tile("atk", "Attack")}${tile("crit", "Critical", true)}</div>`) +
      sec("Defense", sheetRow("hp", "Health") + sheetRow("mana", "Mana") + sheetRow("def", "Damage blocked", true) + sheetRow("speed", "Move speed")) +
      sec("Attributes", st("str", "Strength") + st("sta", "Stamina") + st("mag", "Magic") + st("dex", "Dexterity")) +
      sec("Resistances", `<div class="spreses">${ELEMENTS.map(rs).join("")}</div>`) +
      sec("Reactions", `<div class="sprow"><span>${reactionHelp()}</span></div>`) +
      (fed.length ? sec("Devoured", fed.map((l) => `<div class="sprow"><span>${l}</span></div>`).join("")) : "") +
      `<div class="spnote">${p ? `If you ${p.label}` : "Hover an item or a skill to see what it changes"}</div>`;
  }
}
