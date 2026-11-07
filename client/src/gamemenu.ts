// Game menu (Esc or the ☰ Menu button): one place for settings-type panels
// (music & sound, ideas board, patch notes). Their own hotkeys (I, N) still work.

import { icon } from "./pixelicons";

export interface GameMenuItem { id: string; label: string; key?: string; onClick: () => void }

export class GameMenu {
  private el: HTMLElement;
  private btn: HTMLButtonElement;

  constructor(items: GameMenuItem[]) {
    const hud = document.getElementById("hud")!;
    this.el = document.createElement("div");
    this.el.id = "gamemenu";
    this.el.hidden = true;
    this.el.innerHTML = `<h2>Menu</h2>` +
      items.map((i) => `<button data-item="${i.id}">${i.label}${i.key ? ` <small>[${i.key}]</small>` : ""}` +
        (i.id === "news" ? `<span id="newsbadge" hidden></span>` : "") + `</button>`).join("") +
      `<button data-item="close" class="gmclose">${icon("close")}Back to game <small>[Esc]</small></button>`;
    hud.appendChild(this.el);
    this.el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
    this.el.addEventListener("keydown", (ev) => ev.stopPropagation());
    this.el.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!b) return;
      b.blur();
      const it = items.find((i) => i.id === b.dataset.item);
      this.close();
      it?.onClick();
    });

    // The one HUD button, with a badge when there are unread patch notes
    this.btn = document.createElement("button");
    this.btn.id = "gamemenubtn";
    this.btn.innerHTML = `${icon("menu")}Menu <small>[Esc]</small><span id="menubadge" hidden></span>`;
    this.btn.tabIndex = -1;
    this.btn.addEventListener("mousedown", (ev) => ev.preventDefault());
    this.btn.addEventListener("click", (ev) => { if (ev.detail === 0) return; this.btn.blur(); this.toggle(); });
    document.getElementById("menubtns")!.appendChild(this.btn);

    // Mirror the News badge onto the Menu button
    const news = this.el.querySelector("#newsbadge") as HTMLElement;
    const menuBadge = this.btn.querySelector("#menubadge") as HTMLElement;
    const sync = () => { menuBadge.hidden = news.hidden; menuBadge.textContent = news.textContent; };
    new MutationObserver(sync).observe(news, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  /** Change an entry's text (a setting that shows its current value). */
  setLabel(id: string, html: string) {
    const b = this.el.querySelector(`[data-item="${id}"]`);
    if (b) b.innerHTML = html;
  }

  get open() { return !this.el.hidden; }
  show() { this.el.hidden = false; }
  close() { this.el.hidden = true; }
  toggle() { if (this.open) this.close(); else this.show(); }
}
