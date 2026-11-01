import Phaser from "phaser";
import { TownScene } from "./TownScene";
import { CLASSES, CLASS_KINDS, ClassKind, isClassKind } from "../../shared/classes";
import { mountHeroCards } from "./heroCards";

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
let color = COLORS[Math.floor(Math.random() * COLORS.length)];

const colorsEl = document.getElementById("colors")!;
for (const c of COLORS) {
  const b = document.createElement("button");
  b.style.background = "#" + c.toString(16).padStart(6, "0");
  if (c === color) b.classList.add("sel");
  b.onclick = () => {
    color = c;
    colorsEl.querySelectorAll("button").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
  };
  colorsEl.appendChild(b);
}

let saved: string | null = null;
try { saved = localStorage.getItem("cls"); } catch { /* ignore */ }
let cls: ClassKind = isClassKind(saved) ? saved : "knight";
const classesEl = document.getElementById("classes")!;
const infoEl = document.getElementById("classinfo")!;
const heroCards = mountHeroCards(classesEl, CLASS_KINDS, cls, (k) => {
  cls = k;
  infoEl.textContent = CLASSES[k].blurb;
});
infoEl.textContent = CLASSES[cls].blurb;

const nameEl = document.getElementById("name") as HTMLInputElement;
try { nameEl.value = localStorage.getItem("name") ?? ""; } catch { /* ignore */ }

function start() {
  const name = nameEl.value.trim();
  try { localStorage.setItem("name", name); localStorage.setItem("cls", cls); } catch { /* ignore */ }
  document.getElementById("play")!.setAttribute("disabled", "");
  document.getElementById("status")!.textContent = "Connecting…";
  heroCards.stop();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    pixelArt: true,
    backgroundColor: "#1b1b24",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [new TownScene({ name, color, cls })],
  });
}

document.getElementById("play")!.onclick = start;
nameEl.onkeydown = (e) => { if (e.key === "Enter") start(); };
nameEl.focus();
