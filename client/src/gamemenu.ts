// Game menu (Esc or the ☰ Menu button): one place for settings-type panels
// (music & sound, ideas board, patch notes). Their own hotkeys (I, N) still work.

import { icon } from "./pixelicons";

export interface GameMenuChoice { value: string; label: string; on: boolean; dim?: boolean; wide?: boolean }
/** An entry; with `choices` it is a dropdown: clicking opens the list under it and the menu stays open. */
export interface GameMenuItem {
  id: string; label: string; key?: string; onClick: () => void;
  choices?: () => GameMenuChoice[]; note?: string; onChoose?: (value: string) => void;
}

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
      if (b.dataset.choice !== undefined) {
        const it = items.find((i) => i.id === b.closest<HTMLElement>(".gmdrop")?.dataset.for);
        it?.onChoose?.(b.dataset.choice);
        this.closeDrop();
        return;
      }
      const it = items.find((i) => i.id === b.dataset.item);
      if (it?.choices) { this.toggleDrop(it, b); return; }
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

  /** Show or hide an entry (the Age crossing item exists only where several Ages are open). */
  setHidden(id: string, hidden: boolean) {
    const b = this.el.querySelector<HTMLElement>(`[data-item="${id}"]`);
    if (b) b.style.display = hidden ? "none" : "";
  }

  private drop?: HTMLElement;
  private toggleDrop(it: GameMenuItem, b: HTMLElement) {
    const was = this.drop?.dataset.for;
    this.closeDrop();
    if (was === it.id) return;
    const d = document.createElement("div");
    d.className = "gmdrop";
    d.dataset.for = it.id;
    d.innerHTML = it.choices!().map((c) =>
      `<button data-choice="${c.value}" class="${[c.on ? "on" : "", c.dim ? "dim" : "", c.wide ? "wide" : ""].join(" ").trim()}">${c.label}</button>`).join("") +
      (it.note ? `<small class="gmnote">${it.note}</small>` : "");
    b.classList.add("open");
    b.after(d);
    this.drop = d;
  }
  private closeDrop() {
    this.drop?.previousElementSibling?.classList.remove("open");
    this.drop?.remove();
    this.drop = undefined;
  }

  get open() { return !this.el.hidden; }
  show() { this.el.hidden = false; }
  close() { this.el.hidden = true; this.closeDrop(); }
  toggle() { if (this.open) this.close(); else this.show(); }
}
