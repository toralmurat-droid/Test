import "./gearCompare.css";
import { plateArt } from "./plateArt";
import { cardPlace, cardWidth, Compare } from "./gearCompare";
import { gearName } from "../../shared/gear";
import { uiScale } from "./worldscale";

/**
 * The item compare card: item details beside the side panel (to its left, level with the hovered item, clamped on
 * screen). Display only; pointer-events none so it never gets in the way of the bag. Zoomed with the HUD (Screen size,
 * worldscale.ts), so it matches the panel at every size.
 */
const CARD_W = 320;
let el: HTMLElement | undefined, anchored: HTMLElement | undefined;

function onMove() { if (anchored && !anchored.offsetParent) hideCard(); }

function card(): HTMLElement {
  if (el) return el;
  el = document.createElement("div");
  el.id = "itemcard";
  el.hidden = true;
  el.setAttribute("style", plateArt("normal").style);
  document.body.appendChild(el);
  return el;
}

/** Shows the card with `html`, level with `anchor`, left of the side panel (or of the anchor when there is no panel). */
export function showCard(html: string, anchor: HTMLElement) {
  const c = card(), z = uiScale();
  if (!anchored) document.addEventListener("mousemove", onMove, { passive: true }); // the hovered cell can vanish without a mouseleave (tab switch, panel closed)
  anchored = anchor;
  c.innerHTML = html;
  // measure in screen px, place in the card's own (zoomed) px, like #tip
  const panel = document.getElementById("sidepanel")?.getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const edge = (panel && panel.width ? panel.left : a.left) / z;
  c.style.width = `${cardWidth(edge, CARD_W)}px`;
  c.hidden = false;
  c.style.visibility = "hidden";
  const w = c.offsetWidth, h = c.offsetHeight;
  const dlg = anchor.closest("#npcdialog")?.getBoundingClientRect(); // a shop row: never cover the dialog (its Buy buttons)
  const p = cardPlace({ top: a.top / z }, edge, w, h, window.innerWidth / z, window.innerHeight / z, 8, dlg ? dlg.right / z + 8 : 4);
  c.style.left = `${p.left}px`;
  c.style.top = `${p.top}px`;
  c.style.visibility = "";
}

export function hideCard() {
  if (el) el.hidden = true;
  if (anchored) { anchored = undefined; document.removeEventListener("mousemove", onMove); }
}

/** The "Compared with ..." block of the card (`head` overrides the heading, e.g. for taking a piece off). */
export function compareHtml(cmp: Compare, cls: string, head?: string): string {
  const h = head ?? (cmp.current ? `Compared with your ${gearName(cmp.current, cls)}:` : "Slot empty");
  const rows = cmp.lines.map((l) => `<div class="ic-row"><span>${l.label}</span><b class="${l.good ? "ic-good" : "ic-bad"}">${l.text}</b></div>`).join("");
  return `<div class="ic-sep"></div><div class="ic-head">${h}</div>${rows || `<div class="ic-dim">No change</div>`}`;
}
