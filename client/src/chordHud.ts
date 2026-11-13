import "./chordHud.css";
import { NOTES, PROGRESSIONS } from "../../shared/songs";
import { CHORD_HINT, CHORD_LOCK_LINE, CHORD_NAMES, DEGREE_GLOSS, DEGREE_TEXT, MODE_COLOR, MODE_NAME, PROGRESSIONS_TEXT } from "./songTables";

/**
 * Songweaver chord tracker (owner only). Fed by the server's "chord" message { notes, mode, lockMs }: the degrees
 * played so far (up to 3), the mode, and the lockout after a finisher. It only shows what the server says; the
 * finisher itself fires on the server on the third note. Compact so it fits above the skill bar on a phone.
 */
/** The legend: the numerals in plain words (content doc glosses), then the five progressions. */
function legendHtml(): string {
  const deg = Object.entries(DEGREE_GLOSS).map(([d, g]) => `<div><b>${DEGREE_TEXT[d] ?? d}</b> ${g}</div>`).join("");
  const prog = PROGRESSIONS_TEXT.map((p) => `<div><b>${p.notes}</b> ${p.name}: ${p.does}</div>`).join("");
  return `<p>Each song or note you play is a step on the scale. Three in the right order ring a chord by themselves, then the strings need a short rest.</p>${deg}<p>Chords</p>${prog}<p class="ch-x">Tap to close</p>`;
}

export class ChordHud {
  private root: HTMLElement;
  private mode: HTMLElement;
  private name: HTMLElement;
  private slots: HTMLElement[] = [];
  private bar: HTMLElement;
  private lockEnd = 0;
  private readonly lockTotal = NOTES.lockMs;
  private nameUntil = 0;
  private flashUntil = 0;
  private shown = false;
  private lastW = -1;
  private hint: HTMLElement;
  private legend: HTMLElement;

  constructor(parent: HTMLElement) {
    const r = (this.root = document.createElement("div"));
    r.id = "chordhud";
    r.hidden = true;
    r.innerHTML = `<div class="ch-top"><span class="ch-mode"></span><span class="ch-name"></span><button type="button" class="ch-help" title="What do the numerals mean?" aria-label="Chord legend">?</button></div><div class="ch-notes"></div><div class="ch-lock"><i></i></div><div class="ch-hint"></div><div class="ch-legend" hidden></div>`;
    this.hint = r.querySelector(".ch-hint")!;
    this.legend = r.querySelector(".ch-legend")!;
    this.legend.innerHTML = legendHtml();
    const help = r.querySelector(".ch-help") as HTMLElement;
    const toggle = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.legend.hidden = !this.legend.hidden; };
    help.addEventListener("click", toggle);
    help.addEventListener("pointerdown", (e) => e.stopPropagation()); // never walks the hero
    this.legend.addEventListener("pointerdown", (e) => { e.stopPropagation(); this.legend.hidden = true; });
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
    this.lockEnd = now + lock; this.lastW = -1;
    this.root.classList.toggle("locked", lock > 0);
    // what the notes so far lead to ("Chord: IV, V... one more note."), or why nothing fires
    const have = notes.slice(0, 2), part = have.length === 2 && PROGRESSIONS.some((p) => p.notes[0] === have[0] && p.notes[1] === have[1]);
    this.hint.textContent = lock > 0 ? CHORD_LOCK_LINE : part ? `Chord: ${have.join(", ")}... ${CHORD_HINT}` : "";
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
