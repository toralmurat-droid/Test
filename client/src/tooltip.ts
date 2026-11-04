/**
 * Weathered pixel tooltips for every HUD element, replacing the browser's plain `title` box.
 *
 * - Any `title="..."` in the page is moved to `data-tip` as soon as it appears (so the browser box never shows).
 * - `data-tip` is the text; an optional `data-tiphead` is a gold heading above it and `data-tiphint` a dim line below.
 * - The card uses the aged bronze frame from weathered.ts (--wf-bronze) and the pixel font (weathered.css #tip).
 * - HUD parts that redraw while hovered (the skill bar during cooldowns) keep their tip: it follows whatever is
 *   under the mouse again.
 */

let tip: HTMLDivElement | null = null;
let target: HTMLElement | null = null;
let mx = -1, my = -1;
let timer = 0;
let shownKey = "";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function convert(el: Element) {
  const t = el.getAttribute("title");
  if (t === null) return;
  el.removeAttribute("title");
  if (t && !el.hasAttribute("data-tip")) el.setAttribute("data-tip", t);
}
function convertTree(root: Element) {
  convert(root);
  root.querySelectorAll("[title]").forEach(convert);
}

function tipAt(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y);
  return (el?.closest("[data-tip],[data-tiphead]") as HTMLElement | null) ?? null;
}

function hide() {
  target = null;
  shownKey = "";
  if (tip) tip.style.display = "none";
  if (timer) { clearInterval(timer); timer = 0; }
}

function render() {
  if (!tip || !target) return;
  const head = target.getAttribute("data-tiphead") ?? "";
  const body = target.getAttribute("data-tip") ?? "";
  const hint = target.getAttribute("data-tiphint") ?? "";
  const key = `${head}\u0001${body}\u0001${hint}`;
  if (!head && !body) { hide(); return; }
  if (key !== shownKey) {
    tip.innerHTML = (head ? `<b>${esc(head)}</b>` : "") + (body ? `<p>${esc(body)}</p>` : "") + (hint ? `<small>${esc(hint)}</small>` : "");
    shownKey = key;
  }
  tip.style.display = "block";
  // Above the element, centred, kept on screen; below it when there is no room above
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.round(Math.min(Math.max(4, r.left + r.width / 2 - w / 2), innerWidth - w - 4));
  let y = Math.round(r.top - h - 6);
  if (y < 4) y = Math.round(Math.min(r.bottom + 6, innerHeight - h - 4));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function show(el: HTMLElement) {
  target = el;
  render();
  // Follow redraws (cooldowns rebuild the skill bar) and drop the tip when its element is gone
  if (!timer) timer = window.setInterval(() => {
    if (!target) return;
    if (!target.isConnected) {
      const again = mx >= 0 ? tipAt(mx, my) : null;
      if (!again) { hide(); return; }
      target = again;
    }
    render();
  }, 100);
}

export function installTooltips() {
  if (tip) return;
  tip = document.createElement("div");
  tip.id = "tip";
  tip.style.display = "none";
  document.body.appendChild(tip);

  convertTree(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "attributes") convert(m.target as Element);
      else m.addedNodes.forEach((n) => { if (n.nodeType === 1) convertTree(n as Element); });
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

  document.addEventListener("mouseover", (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-tip],[data-tiphead]") as HTMLElement | null;
    if (el) { if (el !== target) show(el); } else if (target) hide();
  }, true);
  document.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true, capture: true });
  document.addEventListener("mousedown", () => { if (target) hide(); }, true);
  document.addEventListener("mouseleave", hide);
  window.addEventListener("blur", hide);
}
