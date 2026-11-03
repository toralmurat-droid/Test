import { pixelText } from "./pixeltext";

/**
 * "No magic in Oakvale" banner (shared/wrath.ts): shown to the hero who cast a skill inside the stockade, and again
 * when they get out and the village calms down. Own element and styles so it stays out of style.css.
 */
export class WrathBanner {
  private el: HTMLDivElement;
  private timer = 0;

  constructor() {
    const style = document.createElement("style");
    style.textContent = `
#wrath { position: absolute; top: 14%; left: 16px; right: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  pointer-events: none; opacity: 0; transition: opacity .4s; z-index: 30; }
#wrath canvas { display: block; max-width: calc(100vw - 32px); object-fit: contain; image-rendering: pixelated; }
#wrath.show { opacity: 1; animation: wrath-pop .45s ease-out; }
@keyframes wrath-pop { 0% { transform: scale(1.4); } 60% { transform: scale(.95); } 100% { transform: scale(1); } }`;
    document.head.appendChild(style);
    this.el = document.createElement("div");
    this.el.id = "wrath";
    document.body.appendChild(this.el);
  }

  show(on: boolean, shout: string) {
    this.el.replaceChildren(...(on
      ? [pixelText(shout, "#ff4a3a", 16, 3), pixelText("The whole village turns on you. Get out of Oakvale!", "#ffd0c0", 11, 2)]
      : [pixelText("You left Oakvale", "#fff0b8", 14, 3), pixelText("The villagers calm down.", "#d8f0c0", 11, 2)]));
    this.el.classList.remove("show");
    void this.el.offsetWidth; // restart the pop
    this.el.classList.add("show");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove("show"), on ? 4000 : 2500);
  }
}
