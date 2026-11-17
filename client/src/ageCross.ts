import { AGE_SLOT_RE, CROSS, type AgeRow, type AgesMsg } from "../../shared/ageCross";
import { icon as pxIcon } from "./pixelicons";

/**
 * "Cross to another Age" panel (shared/ageCross.ts, Esc menu item). Asks the server for the list ("ages"), draws the
 * rows (a Cross button, or a greyed row with the server's reason) and sends the intent "cross" {slot}. The server
 * checks everything; the crossing itself (leave, gateway cookie, rejoin) is `crossNow` in reconnect.ts.
 */
export class AgeCrossPanel {
  private el = document.createElement("div");
  private rows: AgeRow[] | null = null; // null = waiting for the answer
  private err = "";
  private busy = false;

  constructor(private send: (type: string, msg?: unknown) => void) {
    this.el.id = "agemenu";
    this.el.hidden = true;
    this.el.addEventListener("mousedown", (ev) => ev.preventDefault()); // never take focus from the game
    this.el.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.slot !== undefined) {
        if (this.busy || !AGE_SLOT_RE.test(b.dataset.slot)) return;
        this.busy = true;
        this.send("cross", { slot: b.dataset.slot });
        this.render();
      } else this.close();
    });
    document.getElementById("hud")!.append(this.el);
  }

  get open() { return !this.el.hidden; }

  show() {
    this.rows = null; this.err = ""; this.busy = false;
    this.el.hidden = false;
    this.render();
    this.send("ages");
  }

  close() { this.el.hidden = true; }

  /** The server's "ages" answer (the join notice has no list and is ignored here). */
  onAges(m: AgesMsg) {
    if (!this.open || (!m.list && !m.err)) return;
    this.rows = m.list ?? [];
    this.err = m.err ?? "";
    this.render();
  }

  private render() {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    let body: string;
    if (this.rows === null) body = `<p class="pt-note">Looking for other Ages...</p>`;
    else if (this.err) body = `<p class="pt-note warn">${esc(this.err)}</p>`;
    else body = this.rows.map((r) => r.why
      ? `<button class="pt-row${r.here ? " here" : ""}" disabled>${esc(r.name)}<span>${esc(r.why)}</span></button>`
      : `<button class="pt-row" data-slot="${esc(r.slot)}"${this.busy ? " disabled" : ""}>${esc(r.name)}<span>Cross</span></button>`).join("");
    this.el.innerHTML = `<div class="pt-head"><h2>Cross to another Age</h2><button class="pt-close" aria-label="Close">${pxIcon("close")}</button></div>${body}` +
      `<p class="pt-note">Your hero is saved and comes with you. Next crossing in ${Math.round(CROSS.cooldownMs / 60_000)} min.</p>`;
  }
}
