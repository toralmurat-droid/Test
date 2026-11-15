import { TILE } from "../../shared/constants";
import { FERRY_FEE, FERRY_RANGE, FERRY_STOPS, ferryOpen, ferryStopById, ferryStopNear, type FerryStop } from "../../shared/ferry";
import type { Quester } from "../../shared/quests";
import { icon as pxIcon } from "./pixelicons";
import { hudSlot } from "./hudSlots";

/**
 * Pell's ferry (shared/ferry.ts). Once the Redfang chain is done, a jetty head shows an E prompt that opens a short list
 * of the other two stops with the fare; Pell's own dialog opens the same list. The client only sends the intent
 * {to}; the server checks range, fight, gold and moves the hero ("travel" with why "ferry").
 */

/** Words for the server's refusals (`ferryno`). */
export const FERRY_NO: Record<string, string> = {
  closed: "The boats stay on the sand",
  far: "Walk up to the boat",
  fight: "Not while fighting",
  gold: "Not enough gold for the fare",
};

/** The jetty (head or arrival plank) the hero stands at, for the prompt: Pell is covered by his dialog instead. */
export function jettyAt(x: number, y: number): FerryStop | undefined {
  let best: FerryStop | undefined, bd = FERRY_RANGE;
  for (const s of FERRY_STOPS) {
    const d = Math.min(Math.hypot((s.tile.x + 0.5) * TILE - x, (s.tile.y + 0.5) * TILE - y), Math.hypot(s.x - x, s.y - y));
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}

/** Rows of the ferry list for a hero at `here`: the other stops with the fare. Pure, for tests. */
export const ferryRows = (here: FerryStop | undefined) => FERRY_STOPS.filter((s) => s.id !== here?.id).map((s) => ({ id: s.id, name: s.name, fee: FERRY_FEE }));

export class FerryLayer {
  private prompt = document.createElement("div");
  private menu = document.createElement("div");
  private at?: FerryStop; // the stop we board from
  near = false;

  constructor(private send: (type: string, msg?: unknown) => void) {
    this.prompt.id = "ferryprompt";
    this.prompt.onclick = () => this.interact();
    this.menu.id = "ferrymenu";
    this.menu.hidden = true;
    this.menu.addEventListener("mousedown", (ev) => ev.preventDefault()); // never take focus from the game
    this.menu.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      const b = t.closest("button");
      if (!b) return;
      if (b.dataset.to && ferryStopById(b.dataset.to)) this.send("ferry", { to: b.dataset.to });
      this.close();
    });
    hudSlot("promptstack").append(this.prompt);
    document.getElementById("hud")!.append(this.menu);
  }

  get isOpen() { return !this.menu.hidden; }

  /** E at a jetty, a click on the prompt, or Pell's dialog button. */
  interact(): boolean {
    if (this.isOpen) { this.close(); return true; }
    if (!this.near) return false;
    this.open();
    return true;
  }

  /** Opens the list for wherever the hero stands (Pell's dialog calls this; the server still checks range). */
  open() {
    this.menu.hidden = false;
    this.render();
  }

  close() { this.menu.hidden = true; }

  private render() {
    const rows = ferryRows(this.at).map((s) => `<button class="pt-row" data-to="${s.id}">${s.name}<span>${s.fee} gold</span></button>`).join("");
    this.menu.innerHTML = `<div class="pt-head"><h2>Pell's boat</h2><button class="pt-close" aria-label="Close">${pxIcon("close")}</button></div>${rows}<p class="pt-note">A fare is ${FERRY_FEE} gold a leg.</p>`;
  }

  /** Call every frame with the local hero (state and feet). `blocked`: another prompt or dialog has the E key. */
  update(me: Quester | undefined, pos: { x: number; y: number } | undefined, blocked: boolean) {
    const open = !!me && ferryOpen(me);
    const jetty = open && pos ? jettyAt(pos.x, pos.y) : undefined;
    const stop = open && pos ? ferryStopNear(pos.x, pos.y) : undefined;
    if (stop?.id !== this.at?.id) { this.at = stop; if (!stop) this.close(); else if (this.isOpen) this.render(); }
    this.near = !blocked && !!jetty;
    this.prompt.classList.toggle("open", this.near && !this.isOpen);
    if (this.near && jetty) {
      const html = `<kbd>E</kbd> Take Pell's boat <span class="why">${jetty.name}</span>`;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
  }
}
