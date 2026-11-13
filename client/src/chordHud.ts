import "./chordHud.css";
import { CHORD_NAMES, DEGREE_TEXT, MODE_COLOR, MODE_NAME } from "./songTables";

/**
 * Songweaver chord tracker (owner only). Fed by the server's "chord" message { notes, mode, lockMs }: the degrees
 * played so far (up to 3), the mode, and the lockout after a finisher. It only shows what the server says; the
 * finisher itself fires on the server on the third note. Compact so it fits above the skill bar on a phone.
 */
export class ChordHud {
  private root: HTMLElement;
  private mode: HTMLElement;
  private name: HTMLElement;
  private slots: HTMLElement[] = [];
  private bar: HTMLElement;
  private lockEnd = 0;
  private lockTotal = 1;
  private nameUntil = 0;
  private flashUntil = 0;
  private shown = false;
  private lastW = -1;

  constructor(parent: HTMLElement) {
    const r = (this.root = document.createElement("div"));
    r.id = "chordhud";
    r.hidden = true;
    r.innerHTML = `<div class="ch-top"><span class="ch-mode"></span><span class="ch-name"></span></div><div class="ch-notes"></div><div class="ch-lock"><i></i></div>`;
    parent.appendChild(r);
    this.mode = r.querySelector(".ch-mode")!;
    this.name = r.querySelector(".ch-name")!;
    this.bar = r.querySelector(".ch-lock i")!;
    const notes = r.querySelector(".ch-notes")!;
    for (let i = 0; i < 3; i++) { const b = document.createElement("b"); notes.appendChild(b); this.slots.push(b); }
  }

  /** The "chord" message: the notes so far, the mode and the lockout left (ms). */
  set(m: { notes?: string[]; mode?: string; lockMs?: number }, now = performance.now()) {
    this.shown = true; this.root.hidden = false;
    const mode = m.mode ?? "major", col = `#${(MODE_COLOR[mode] ?? MODE_COLOR.major).toString(16).padStart(6, "0")}`;
    this.root.style.setProperty("--mc", col);
    this.mode.textContent = MODE_NAME[mode] ?? mode;
    const notes = m.notes ?? [];
    for (let i = 0; i < 3; i++) {
      const t = notes[i] ? DEGREE_TEXT[notes[i]] ?? notes[i] : "";
      this.slots[i].textContent = t || "-";
      this.slots[i].classList.toggle("on", !!t);
    }
    const lock = Math.max(0, m.lockMs ?? 0);
    this.lockEnd = now + lock; this.lockTotal = Math.max(lock, 1); this.lastW = -1;
    this.root.classList.toggle("locked", lock > 0);
  }

  /** A finisher of mine fired (sfx "chord"): flash the tracker and show its name for a moment. */
  fired(prog: string, now = performance.now()) {
    if (!this.shown) { this.shown = true; this.root.hidden = false; }
    this.name.textContent = CHORD_NAMES[prog] ?? prog;
    this.nameUntil = now + 2200; this.flashUntil = now + 700;
    this.root.classList.add("flash", "named");
  }

  /** Call every frame (cheap: touches the DOM only when something changes). */
  tick(now = performance.now()) {
    if (!this.shown) return;
    if (this.flashUntil && now > this.flashUntil) { this.flashUntil = 0; this.root.classList.remove("flash"); }
    if (this.nameUntil && now > this.nameUntil) { this.nameUntil = 0; this.root.classList.remove("named"); }
    const left = Math.max(0, this.lockEnd - now), w = left > 0 ? Math.round(left / this.lockTotal * 100) : 0;
    if (w !== this.lastW) {
      this.lastW = w; this.bar.style.width = `${w}%`;
      if (left <= 0) this.root.classList.remove("locked");
    }
  }
}
