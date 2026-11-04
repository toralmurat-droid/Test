import Phaser from "phaser";
import { initMusic, skipIntro, startMusic } from "./music";
import { initSfx } from "./sfx";
import { takeBackToStart, takeRejoin } from "./reconnect";
import { showLoading } from "./loading";
import { installCursors } from "./cursors";
import { installWeatheredFrames } from "./weathered";
import { installTooltips } from "./tooltip";
import "./weathered.css";
import "./menus.css";

installCursors();
installWeatheredFrames();
installTooltips();
import { TownScene } from "./TownScene";
import { CLASSES, CLASS_KINDS, ClassKind, isClassKind } from "../../shared/classes";
import { mountFireside } from "./fireside";
import { pixelText } from "./pixeltext";
import { SMOOTH } from "./isoflag";
import { installSmoothTextures } from "./smooth";
import "@fontsource/pixelify-sans/400.css";

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
let color = COLORS[Math.floor(Math.random() * COLORS.length)];

const colorsEl = document.getElementById("colors")!;
for (const c of COLORS) {
  const b = document.createElement("button");
  b.style.background = "#" + c.toString(16).padStart(6, "0");
  b.title = "Name colour";
  if (c === color) b.classList.add("sel");
  b.onclick = () => {
    color = c;
    colorsEl.querySelectorAll("button").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
  };
  colorsEl.appendChild(b);
}

// Start screens, all by the fire: log in -> resume a saved hero or start a new game -> pick a hero round the fire -> loading
let saved: string | null = null;
try { saved = localStorage.getItem("cls"); } catch { /* ignore */ }
let cls: ClassKind = isClassKind(saved) ? saved : "knight";

document.getElementById("fstitle")!.appendChild(pixelText("Pixel Town Brawl", "#ffcf52", 12, 2));
const fireside = mountFireside(document.getElementById("fireside") as HTMLCanvasElement, document.getElementById("fslabels")!, (k) => pickHero(k));

const nameEl = document.getElementById("name") as HTMLInputElement;
try { nameEl.value = localStorage.getItem("name") ?? ""; } catch { /* ignore */ }
// The opening song starts as the game opens (or on the first click / key if the browser waits), see music.ts
startMusic(nameEl.value.trim());

const pwEl = document.getElementById("password") as HTMLInputElement;
const status = document.getElementById("status")!;
const playBtn = document.getElementById("play")!;
const loginPanel = document.getElementById("login")!;
const pick = document.getElementById("savepick")!;
const heroPanel = document.getElementById("pickhero")!;

type Step = "login" | "resume" | "hero";
let step: Step = "login";
let account = { name: "", password: "", heroes: {} as Record<string, number> };

function show(s: Step) {
  step = s;
  for (const [el, on] of [[loginPanel, s === "login"], [pick, s === "resume"], [heroPanel, s === "hero"]] as const) {
    el.hidden = !on;
    el.style.display = on ? "" : "none";
  }
  if (s === "hero") {
    const labels: Partial<Record<ClassKind, string>> = {};
    for (const k of CLASS_KINDS) labels[k] = account.heroes[k] ? `${CLASSES[k].name} · lv ${account.heroes[k]}` : CLASSES[k].name;
    fireside.setMode("pick", labels);
    fireside.select(cls);
    pickHero(cls);
  } else if (s === "resume") {
    const labels: Partial<Record<ClassKind, string>> = {};
    for (const k of CLASS_KINDS) if (account.heroes[k]) labels[k] = `${CLASSES[k].name} · lv ${account.heroes[k]}`;
    fireside.setMode("rest", labels);
  } else fireside.setMode("rest");
}

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

const btnRow = (host: HTMLElement, cssClass: string, label: string, sub: string, onClick: () => void) => {
  const b = document.createElement("button");
  b.className = `fs-btn ${cssClass}`;
  b.innerHTML = `${label}<small>${sub}</small>`;
  b.onclick = onClick;
  host.appendChild(b);
  return b;
};

/** Resume one of the saved heroes, or go and pick a hero for a new game. */
function resumeMenu() {
  const { name } = account;
  document.getElementById("savetitle")!.textContent = `Welcome back, ${name}`;
  const kinds = CLASS_KINDS.filter((k) => account.heroes[k]).sort((a, b) => (a === cls ? -1 : b === cls ? 1 : account.heroes[b] - account.heroes[a]));
  document.getElementById("savetext")!.textContent = kinds.length > 1 ? "Your heroes wait by the fire." : "Your hero waits by the fire.";
  const btns = document.getElementById("savebtns")!;
  btns.replaceChildren();
  for (const k of kinds) btnRow(btns, "fs-main", `Resume: ${CLASSES[k].name}`, `Level ${account.heroes[k]}, with your gear, gold and quests`, () => { cls = k; remember(); launch(account.name, account.password, false); });
  btnRow(btns, "", "New game", "Choose a hero by the fire", () => show("hero"));
  show("resume");
}

function pickHero(k: ClassKind) {
  cls = k;
  const c = CLASSES[k];
  document.getElementById("pkname")!.textContent = c.name;
  document.getElementById("classinfo")!.innerHTML = `${c.blurb}<br><span class="fs-skill">Special: ${c.special.name}</span>`;
  const go = document.getElementById("pkgo")!;
  const lvl = account.heroes[k];
  go.textContent = lvl ? `Start over as ${c.name}` : `Begin as ${c.name}`;
  go.onclick = () => begin();
}

/** Start the chosen hero; a class that already has a save asks before it is erased. */
function begin() {
  const lvl = account.heroes[cls];
  remember();
  if (!lvl) { launch(account.name, account.password, false); return; }
  const hero = CLASSES[cls].name;
  document.getElementById("savetitle")!.textContent = "Start over?";
  document.getElementById("savetext")!.textContent = `Your level ${lvl} ${hero} will be erased: level, gear, gold, skills and quests, and all chests fill up again. This cannot be undone.`;
  const btns = document.getElementById("savebtns")!;
  btns.replaceChildren();
  btnRow(btns, "fs-danger", "Yes, start a new game", `Erase the level ${lvl} ${hero}`, () => launch(account.name, account.password, true));
  btnRow(btns, "", "No, go back", "Keep my hero", () => show("hero"));
  fireside.setMode("rest", { [cls]: `${hero} · lv ${lvl}` });
  step = "resume";
  for (const [el, on] of [[loginPanel, false], [pick, true], [heroPanel, false]] as const) { el.hidden = !on; el.style.display = on ? "" : "none"; }
}

function remember() {
  try { localStorage.setItem("name", account.name); localStorage.setItem("cls", cls); } catch { /* ignore */ }
}

async function start() {
  const name = nameEl.value.trim();
  const password = pwEl.value;
  if (name.length < 3) { status.textContent = "Pick a name (3 to 16 letters)."; return; }
  if (password.length < 4) { status.textContent = "Pick a password (at least 4 characters)."; pwEl.focus(); return; }
  try { localStorage.setItem("name", name); } catch { /* ignore */ }
  playBtn.setAttribute("disabled", "");
  status.textContent = "Logging in…";
  let heroes: Record<string, number> | null;
  try { heroes = await savedHeroes(name, password); } catch (e: any) {
    status.textContent = e?.message || "Login failed";
    playBtn.removeAttribute("disabled");
    return;
  }
  playBtn.removeAttribute("disabled");
  status.textContent = "";
  account = { name, password, heroes: heroes ?? {} };
  if (Object.values(account.heroes).some((l) => l > 0)) resumeMenu();
  else show("hero");
}

document.getElementById("saveback")!.onclick = () => { account = { name: "", password: "", heroes: {} }; pwEl.value = ""; show("login"); pwEl.focus(); };
document.getElementById("pkback")!.onclick = () => {
  if (Object.values(account.heroes).some((l) => l > 0)) resumeMenu(); else show("login");
};
addEventListener("keydown", (e: KeyboardEvent) => {
  if (step !== "hero" || heroPanel.hidden) return;
  const i = CLASS_KINDS.indexOf(cls);
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const k = CLASS_KINDS[(i + (e.key === "ArrowLeft" ? CLASS_KINDS.length - 1 : 1)) % CLASS_KINDS.length];
    fireside.select(k); pickHero(k); e.preventDefault();
  } else if (e.key === "Enter") { begin(); e.preventDefault(); }
});

function launch(name: string, password: string, newGame: boolean) {
  // if the server turns the hero away, the login form is what shows under the loading screen
  show("login");
  playBtn.setAttribute("disabled", "");
  initMusic(name);
  initSfx(name);
  status.textContent = "Connecting…";
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
show("login");

// Back from a server restart: log straight back in with the same hero
const rejoin = takeRejoin();
if (rejoin) {
  skipIntro(); // back after a server restart: the opening song only plays when the game is opened
  if (isClassKind(rejoin.cls)) cls = rejoin.cls;
  color = rejoin.color;
  launch(rejoin.name, rejoin.password, false);
}
// Back from the game menu's "Save and return to start screen": log in again and show Resume / New game
const back = rejoin ? null : takeBackToStart();
if (back) { nameEl.value = back.name; pwEl.value = back.password; void start(); }
