import Phaser from "phaser";
import { initMusic, startMusic } from "./music";
import { initSfx } from "./sfx";
import { takeRejoin } from "./reconnect";
import { showLoading } from "./loading";
import { installCursors } from "./cursors";
import { installWeatheredFrames } from "./weathered";
import "./weathered.css";

installCursors();
installWeatheredFrames();
import { TownScene } from "./TownScene";
import { CLASSES, CLASS_KINDS, ClassKind, isClassKind } from "../../shared/classes";
import { mountHeroCards } from "./heroCards";
import { SMOOTH } from "./isoflag";
import { installSmoothTextures } from "./smooth";
import "@fontsource/pixelify-sans/400.css";

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
// Music starts on the login screen with the first click or key (the opening song, see music.ts)
startMusic(nameEl.value.trim());

const pwEl = document.getElementById("password") as HTMLInputElement;

const status = document.getElementById("status")!;
const playBtn = document.getElementById("play")!;
const loginPanel = document.querySelector("#join > .panel:not(#savepick)") as HTMLElement;
const pick = document.getElementById("savepick")!;

/** Asks the server which heroes this account has saved. null = server unreachable (then just play). */
async function savedHeroes(name: string, password: string): Promise<Record<string, number> | null> {
  const base = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : "";
  try {
    const r = await fetch(`${base}/account`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Login failed");
    return j.heroes ?? {};
  } catch (e: any) {
    if (e instanceof TypeError) return null; // network error
    throw e;
  }
}

function showPick(on: boolean) {
  loginPanel.hidden = on;
  loginPanel.style.display = on ? "none" : "";
  pick.hidden = !on;
}

/** Continue the saved hero of this class, or start it over (asks twice before wiping). */
function choose(name: string, password: string, level: number) {
  const hero = CLASSES[cls].name;
  const title = document.getElementById("savetitle")!;
  const text = document.getElementById("savetext")!;
  const btns = document.getElementById("savebtns")!;
  const button = (cssClass: string, label: string, sub: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.className = cssClass;
    b.innerHTML = `${label}<small>${sub}</small>`;
    b.onclick = onClick;
    btns.appendChild(b);
  };
  const menu = () => {
    title.textContent = `Welcome back, ${name}`;
    text.textContent = `You have a saved ${hero} at level ${level}.`;
    btns.replaceChildren();
    button("cont", "Continue", `${hero} · level ${level}, with your gear, gold and quests`, () => launch(name, password, false));
    button("fresh", "New game", `Start a new ${hero} from level 1`, confirm);
  };
  const confirm = () => {
    title.textContent = "Start over?";
    text.textContent = `Your level ${level} ${hero} will be erased: level, gear, gold, skills and quests, and all chests fill up again. This cannot be undone.`;
    btns.replaceChildren();
    button("danger", "Yes, start a new game", `Erase the level ${level} ${hero}`, () => launch(name, password, true));
    button("plain", "No, go back", "Keep my hero", menu);
  };
  document.getElementById("saveback")!.onclick = () => { showPick(false); playBtn.removeAttribute("disabled"); status.textContent = ""; };
  menu();
  showPick(true);
}

async function start() {
  const name = nameEl.value.trim();
  const password = pwEl.value;
  if (name.length < 3) { status.textContent = "Pick a name (3 to 16 letters)."; return; }
  if (password.length < 4) { status.textContent = "Pick a password (at least 4 characters)."; pwEl.focus(); return; }
  try { localStorage.setItem("name", name); localStorage.setItem("cls", cls); } catch { /* ignore */ }
  playBtn.setAttribute("disabled", "");
  status.textContent = "Logging in…";
  let heroes: Record<string, number> | null;
  try { heroes = await savedHeroes(name, password); } catch (e: any) {
    status.textContent = e?.message || "Login failed";
    playBtn.removeAttribute("disabled");
    return;
  }
  const level = heroes?.[cls];
  if (level) { status.textContent = ""; choose(name, password, level); return; }
  launch(name, password, false);
}

function launch(name: string, password: string, newGame: boolean) {
  showPick(false);
  initMusic(name);
  initSfx(name);
  status.textContent = "Connecting…";
  heroCards.stop();
  showLoading(); // covers everything until the world is fully drawn (TownScene hides it)
  if (SMOOTH) installSmoothTextures();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    pixelArt: !SMOOTH,
    antialias: SMOOTH,
    backgroundColor: "#1b1b24",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [new TownScene({ name, password, color, cls, newGame })],
  });
}

document.getElementById("play")!.onclick = start;
nameEl.onkeydown = (e) => { if (e.key === "Enter") pwEl.focus(); };
pwEl.onkeydown = (e) => { if (e.key === "Enter") start(); };
(nameEl.value ? pwEl : nameEl).focus();

// Back from a server restart: log straight back in with the same hero
const rejoin = takeRejoin();
if (rejoin) {
  if (isClassKind(rejoin.cls)) cls = rejoin.cls;
  color = rejoin.color;
  launch(rejoin.name, rejoin.password, false);
}
