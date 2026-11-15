import "./gearCompare.css";
import { plateArt } from "./plateArt";
import { cardPlace, cardWidth, Compare } from "./gearCompare";
import { gearName } from "../../shared/gear";

/**
 * The item compare card: item details beside the side panel (to its left, level with the hovered item, clamped on
 * screen). Display only; pointer-events none so it never gets in the way of the bag.
 */
const CARD_W = 320;
let el: HTMLElement | undefined, anchored: HTMLElement | undefined;

function card(): HTMLElement {
  if (el) return el;
  el = document.createElement("div");
  el.id = "itemcard";
  el.hidden = true;
  el.setAttribute("style", plateArt("normal").style);
  document.body.appendChild(el);
  // the hovered cell can vanish without a mouseleave (tab switch, panel closed): drop the card then
  document.addEventListener("mousemove", () => { if (anchored && !anchored.offsetParent) hideCard(); });
  return el;
}

/** Shows the card with `html`, level with `anchor`, left of the side panel (or of the anchor when there is no panel). */
export function showCard(html: string, anchor: HTMLElement) {
  const c = card();
  anchored = anchor;
  c.innerHTML = html;
  const panel = document.getElementById("sidepanel")?.getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const edge = panel && panel.width ? panel.left : a.left;
  c.style.width = `${cardWidth(edge, CARD_W)}px`;
  c.hidden = false;
  c.style.visibility = "hidden";
  const w = c.offsetWidth, h = c.offsetHeight;
  const p = cardPlace(a, edge, w, h, window.innerWidth, window.innerHeight);
  c.style.left = `${p.left}px`;
  c.style.top = `${p.top}px`;
  c.style.visibility = "";
}

export function hideCard() { if (el) el.hidden = true; }

/** The "Compared with ..." block of the card. */
export function compareHtml(cmp: Compare, cls: string): string {
  const head = cmp.current ? `Compared with your ${gearName(cmp.current, cls)}:` : "Slot empty";
  const rows = cmp.lines.map((l) => `<div class="ic-row"><span>${l.label}</span><b class="${l.good ? "ic-good" : "ic-bad"}">${l.text}</b></div>`).join("");
  return `<div class="ic-sep"></div><div class="ic-head">${head}</div>${rows || `<div class="ic-dim">No change</div>`}`;
}
