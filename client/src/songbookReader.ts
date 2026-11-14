import "./chordHud.css";
import { DEGREE_GLOSS, DEGREE_TEXT, PROGRESSIONS_TEXT } from "./songTables";
import { getSongbook, MAT_IDS, MATS, onSongbook, SONGS } from "./songbookData";
import { matCanvas } from "./matArt";

/**
 * The Songbook reader (DI-2 C2): the songs found (progression and finisher), the unknown ones as their source hints,
 * the materials, and the chord legend. Opens from the "?" and the Songbook button on the skills page and from the
 * equipped Songbook in the bag screen. Fed by the owner-only "songbook" message (songbookData.ts). Cosmetic only.
 */
let el: HTMLDivElement | undefined;
let fresh = ""; // the song just found: highlighted
const GAUGE_HELP = "The song gauge fills with every note you play. Basic hits add a little, chords add a lot. Stop playing and it drains away. When it is full, your book's gift rings out and the gauge starts over.";
const VERSES_HELP = "Verse: any skill that strikes once, your basic attack included. Play as many as you like.<br>Chorus: a song that sings on around you. You can keep only one Chorus going. Playing another ends the first.";

/** The chord legend: the numerals in plain words and the five chords. */
function legendHtml(): string {
  const deg = Object.entries(DEGREE_GLOSS).map(([d, g]) => `<div><b>${DEGREE_TEXT[d] ?? d}</b> ${g}</div>`).join("");
  const prog = PROGRESSIONS_TEXT.map((p) => `<div><b>${p.notes}</b> ${p.name}: ${p.does}</div>`).join("");
  return `<p>Each Chorus or note you play opens a ring under your feet, up to three. Three in the right order ring a chord by themselves, then the strings need a short rest (a grey ring closes in).</p>${deg}<p>Chords</p>${prog}`;
}

function html(): string {
  const sb = getSongbook();
  const songs = SONGS.map((s) => sb.songs.includes(s.id)
    ? `<div class="sb-song${fresh === s.id ? " sb-new" : ""}"><b class="sb-name">${s.name}</b><small><span class="sb-prog">${s.prog}</span> · ${s.line}</small><small>Finisher, ${s.finisher}: ${s.fdesc}</small></div>`
    : `<div class="sb-song sb-unknown"><b class="sb-name" style="color:#8a7a5a">???</b><small>${s.hint}</small></div>`).join("");
  const mats = MAT_IDS.map((id) => `<span class="sb-mat" data-mat="${id}" title="${MATS[id].desc} ${MATS[id].source}"><span class="sb-ic"></span>${MATS[id].name} ${sb.mats[id] ?? 0}</span>`).join("");
  return `<div class="sb-top"><h3>Songbook</h3><button class="sb-x" type="button" aria-label="Close">x</button></div>` +
    `<h3>Songs</h3>${songs}` +
    `<h3>Materials</h3><div class="sb-mats">${mats}</div>` +
    `<h3>Verses and Choruses</h3><p>${VERSES_HELP}</p><p>${GAUGE_HELP}</p>` +
    `<h3>Chord legend</h3>${legendHtml()}`;
}

function draw() {
  if (!el || el.hidden) return;
  const top = el.scrollTop;
  el.innerHTML = html();
  el.scrollTop = top;
  for (const s of el.querySelectorAll<HTMLElement>(".sb-mat")) s.querySelector(".sb-ic")!.appendChild(matCanvas(undefined, s.dataset.mat!, 20));
  el.querySelector<HTMLButtonElement>(".sb-x")!.onclick = () => { el!.hidden = true; };
}

function make(): HTMLDivElement {
  if (el) return el;
  el = document.createElement("div");
  el.id = "songbook";
  el.hidden = true;
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  document.body.appendChild(el);
  onSongbook(() => draw());
  return el;
}

/** Marks a song as just found (highlighted in the reader) and refreshes it. */
export function markNewSong(id: string) { fresh = id; draw(); }
export const songbookOpen = () => !!el && !el.hidden;
export function openSongbook() { make().hidden = false; draw(); }
export function closeSongbook() { if (el) el.hidden = true; }
export function toggleSongbook() { if (songbookOpen()) closeSongbook(); else openSongbook(); }
