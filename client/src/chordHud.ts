import "./chordHud.css";
import { DEGREE_GLOSS, DEGREE_TEXT, PROGRESSIONS_TEXT } from "./songTables";

/**
 * The Songweaver's chord legend (DI-1: the chord tracker panel is gone, the rings under her feet show progress).
 * What stays is the legend: the numerals in plain words and the five chords. Opened from the "?" on the skills page.
 */
function legendHtml(): string {
  const deg = Object.entries(DEGREE_GLOSS).map(([d, g]) => `<div><b>${DEGREE_TEXT[d] ?? d}</b> ${g}</div>`).join("");
  const prog = PROGRESSIONS_TEXT.map((p) => `<div><b>${p.notes}</b> ${p.name}: ${p.does}</div>`).join("");
  return `<p>Each song or note you play opens a ring under your feet, up to three. Three in the right order ring a chord by themselves, then the strings need a short rest (a grey ring closes in).</p>${deg}<p>Chords</p>${prog}<p class="ch-x">Tap to close</p>`;
}

/** Shows or hides the legend card (a fixed, centred card; tap it to close). */
export function toggleChordLegend() {
  let el = document.getElementById("chordlegend");
  if (!el) {
    el = document.createElement("div");
    el.id = "chordlegend";
    el.innerHTML = legendHtml();
    el.addEventListener("pointerdown", (e) => { e.stopPropagation(); el!.hidden = true; });
    document.body.appendChild(el);
    return;
  }
  el.hidden = !el.hidden;
}
