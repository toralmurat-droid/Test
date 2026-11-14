// The start screen. It must not import Phaser, TownScene or sfx (directly or through a helper), or the login form
// waits for the whole game: those live in game.ts, which loadGame() fetches while the player types.
import { initMusic, skipIntro, startMusic } from "./music";
import { takeBackToStart, takeRejoin, takeStartNote } from "./reconnect";
import { hideLoading, showLoading } from "./loading";
import { installCursors } from "./cursors";
import { installWeatheredFrames } from "./weathered";
import { installTooltips } from "./tooltip";
import "./weathered.css";
import "./menus.css";

installCursors();
installWeatheredFrames();
installTooltips();
import { ACTIVE_CLASSES, ARCHIVED_CLASSES, CLASSES, ClassKind, isActiveClass } from "../../shared/classes";
import { mountFireside } from "./fireside";
import { pixelText } from "./pixeltext";
import "@fontsource/pixelify-sans/400.css";
import "./pixelfont.css";

/**
 * The game chunk (Phaser + TownScene), requested once, right when the start screen opens, so it downloads while the
 * player types. Every way into the game (Play, Resume, rejoin after a restart, update reload) awaits this same promise.
 * A failed fetch (offline, deploy in progress) clears it so the next launch tries again.
 */
let gameChunk: Promise<typeof import("./game")> | null = null;
function loadGame() {
  if (!gameChunk) gameChunk = import("./game").catch((e) => { gameChunk = null; throw e; });
  return gameChunk;
}
void loadGame().catch(() => {}); // a failure here shows up (with a retry) when the player launches

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
let cls: ClassKind = isActiveClass(saved) ? saved as ClassKind : ACTIVE_CLASSES[0];

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
const forgotPanel = document.getElementById("forgot")!;
const emailPanel = document.getElementById("emailpanel")!;

type Step = "login" | "resume" | "hero" | "forgot" | "email";
let step: Step = "login";
let account = { name: "", password: "", heroes: {} as Record<string, number>, email: "", exists: false };

function panels(s: Step) {
  for (const [el, on] of [[loginPanel, s === "login"], [pick, s === "resume"], [heroPanel, s === "hero"], [forgotPanel, s === "forgot"], [emailPanel, s === "email"]] as const) {
    el.hidden = !on;
    el.style.display = on ? "" : "none";
  }
}

function show(s: Step) {
  step = s;
  panels(s);
  emailHints();
  if (s === "hero") {
    const labels: Partial<Record<ClassKind, string>> = {};
    for (const k of ACTIVE_CLASSES) labels[k] = account.heroes[k] ? `${CLASSES[k].name} · lv ${account.heroes[k]}` : CLASSES[k].name;
    fireside.setMode("pick", labels);
    fireside.select(cls);
    pickHero(cls);
  } else if (s === "resume") {
    const labels: Partial<Record<ClassKind, string>> = {};
    for (const k of ACTIVE_CLASSES) if (account.heroes[k]) labels[k] = `${CLASSES[k].name} · lv ${account.heroes[k]}`;
    fireside.setMode("rest", labels);
  } else fireside.setMode("rest");
}

const apiBase = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : "";
/** POST to the account API; throws the server's message on an error. */
async function accountApi(path: string, body: unknown): Promise<any> {
  const r = await fetch(`${apiBase}/account${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Something went wrong");
  return j;
}

/** Asks the server which heroes this account has saved. null = server unreachable (then just play). */
async function savedHeroes(name: string, password: string): Promise<{ heroes: Record<string, number>; email: string; exists: boolean } | null> {
  try {
    const j = await accountApi("", { name, password });
    return { heroes: j.heroes ?? {}, email: j.email ?? "", exists: !!j.exists };
  } catch (e: any) {
    if (e instanceof TypeError) return null; // network error
    throw e;
  }
}

// ---- Optional email (for password resets) ----
const emailIn = document.getElementById("emailin") as HTMLInputElement;
const emailStatus = document.getElementById("emailstatus")!;
let emailReturn: Step = "resume";

/** The "Email: ..." line under Resume / the hero pick, with a link to add or change it. */
function emailHints() {
  for (const id of ["saveemail", "pkemail"]) {
    const el = document.getElementById(id)!;
    el.replaceChildren();
    if (!account.exists) continue; // a brand new account is only made when the hero first joins
    if (account.email) el.append(`Email: ${account.email} `);
    const b = document.createElement("button");
    b.className = "fs-link";
    b.textContent = account.email ? "Change" : "Add an email in case you forget your password";
    b.onclick = () => openEmail(step);
    el.append(b);
  }
}

function openEmail(from: Step) {
  emailReturn = from === "email" ? "resume" : from;
  emailIn.value = account.email;
  emailStatus.textContent = "";
  emailStatus.classList.remove("ok");
  step = "email";
  panels("email");
  emailIn.focus();
}

async function saveEmail() {
  const btn = document.getElementById("emailsave")!;
  btn.setAttribute("disabled", "");
  emailStatus.classList.remove("ok");
  emailStatus.textContent = "Saving…";
  try {
    const j = await accountApi("/email", { name: account.name, password: account.password, email: emailIn.value.trim() });
    account.email = j.email ?? "";
    emailStatus.textContent = "";
    show(emailReturn);
  } catch (e: any) {
    emailStatus.textContent = e instanceof TypeError ? "Cannot reach the server." : e?.message || "Could not save";
  } finally { btn.removeAttribute("disabled"); }
}
document.getElementById("emailsave")!.onclick = () => void saveEmail();
emailIn.onkeydown = (e) => { if (e.key === "Enter") void saveEmail(); };
document.getElementById("emailback")!.onclick = () => show(emailReturn);

// ---- Forgot password: ask for a code by email, then set a new password with it ----
const fgWho = document.getElementById("fgwho") as HTMLInputElement;
const fgName = document.getElementById("fgname") as HTMLInputElement;
const fgCode = document.getElementById("fgcode") as HTMLInputElement;
const fgPw = document.getElementById("fgpw") as HTMLInputElement;
const fgStatus = document.getElementById("fgstatus")!;
const fgAsk = document.getElementById("fgask")!;
const fgSet = document.getElementById("fgset")!;
const fgMsg = (t: string, ok = false) => { fgStatus.textContent = t; fgStatus.classList.toggle("ok", ok); };

function openForgot() {
  fgWho.value = nameEl.value.trim();
  fgAsk.hidden = false; fgSet.hidden = true;
  fgMsg("");
  show("forgot");
  fgWho.focus();
}

async function sendCode() {
  const who = fgWho.value.trim();
  if (!who) { fgMsg("Type your name or your email."); fgWho.focus(); return; }
  const btn = document.getElementById("fgsend")!;
  btn.setAttribute("disabled", "");
  fgMsg("Sending…");
  try {
    const j = await accountApi("/forgot", { who });
    const byName = !who.includes("@");
    if (byName && !j.sent) { fgMsg("This name has no email we can send to. Ask for help in game chat."); return; }
    fgMsg("");
    document.getElementById("fgsent")!.textContent = j.to
      ? `We sent a code to ${j.to}. It works for 30 minutes.`
      : "If an account uses this email, we sent it a code. It works for 30 minutes.";
    fgName.value = byName ? who : nameEl.value.trim();
    fgCode.value = ""; fgPw.value = "";
    fgAsk.hidden = true; fgSet.hidden = false;
    (fgName.value ? fgCode : fgName).focus();
  } catch (e: any) {
    fgMsg(e instanceof TypeError ? "Cannot reach the server." : e?.message || "Could not send the code");
  } finally { btn.removeAttribute("disabled"); }
}

async function setNewPassword() {
  const name = fgName.value.trim(), code = fgCode.value.trim(), password = fgPw.value;
  if (!name) { fgMsg("Type your name."); fgName.focus(); return; }
  if (!code) { fgMsg("Type the code from the email."); fgCode.focus(); return; }
  if (password.length < 8) { fgMsg("The new password needs at least 8 characters."); fgPw.focus(); return; }
  const btn = document.getElementById("fgdone")!;
  btn.setAttribute("disabled", "");
  fgMsg("Saving…");
  try {
    const j = await accountApi("/reset", { name, code, password });
    fgMsg("");
    nameEl.value = j.name ?? name;
    pwEl.value = password;
    show("login");
    status.textContent = "";
    void start();
  } catch (e: any) {
    fgMsg(e instanceof TypeError ? "Cannot reach the server." : e?.message || "Could not set the password");
  } finally { btn.removeAttribute("disabled"); }
}

document.getElementById("forgotlink")!.onclick = openForgot;
document.getElementById("fgsend")!.onclick = () => void sendCode();
fgWho.onkeydown = (e) => { if (e.key === "Enter") void sendCode(); };
document.getElementById("fgdone")!.onclick = () => void setNewPassword();
fgPw.onkeydown = (e) => { if (e.key === "Enter") void setNewPassword(); };
document.getElementById("fgagain")!.onclick = () => { fgAsk.hidden = false; fgSet.hidden = true; fgMsg(""); fgWho.focus(); };
document.getElementById("fgback")!.onclick = () => { show("login"); (nameEl.value ? pwEl : nameEl).focus(); };

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
  const kinds = ACTIVE_CLASSES.filter((k) => account.heroes[k]).sort((a, b) => (a === cls ? -1 : b === cls ? 1 : account.heroes[b] - account.heroes[a]));
  const archived = ARCHIVED_CLASSES.filter((k) => account.heroes[k]);
  document.getElementById("savetext")!.textContent = kinds.length > 1 ? "Your heroes wait by the fire." : kinds.length ? "Your hero waits by the fire." : "Choose a new hero by the fire.";
  const btns = document.getElementById("savebtns")!;
  btns.replaceChildren();
  for (const k of kinds) btnRow(btns, "fs-main", `Resume: ${CLASSES[k].name}`, `Level ${account.heroes[k]}, with your gear, gold and quests`, () => { cls = k; remember(); launch(account.name, account.password, false); });
  btnRow(btns, "", "New game", "Choose a hero by the fire", () => show("hero"));
  // archived classes: the save is kept, but the hero cannot be played for now
  for (const k of archived) btnRow(btns, "fs-locked", `${CLASSES[k].name} (archived)`, `Level ${account.heroes[k]} kept safe, not playable for now`, () => {}).setAttribute("disabled", "");
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
  panels("resume");
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
  let found: Awaited<ReturnType<typeof savedHeroes>>;
  try { found = await savedHeroes(name, password); } catch (e: any) {
    status.textContent = e?.message || "Login failed";
    playBtn.removeAttribute("disabled");
    return;
  }
  playBtn.removeAttribute("disabled");
  status.textContent = "";
  account = { name, password, heroes: found?.heroes ?? {}, email: found?.email ?? "", exists: !!found?.exists };
  if (Object.values(account.heroes).some((l) => l > 0)) resumeMenu();
  else show("hero");
}

document.getElementById("saveback")!.onclick = () => { account = { name: "", password: "", heroes: {}, email: "", exists: false }; pwEl.value = ""; show("login"); pwEl.focus(); };
document.getElementById("pkback")!.onclick = () => {
  if (Object.values(account.heroes).some((l) => l > 0)) resumeMenu(); else show("login");
};
addEventListener("keydown", (e: KeyboardEvent) => {
  if (step !== "hero" || heroPanel.hidden) return;
  const i = ACTIVE_CLASSES.indexOf(cls);
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const k = ACTIVE_CLASSES[(i + (e.key === "ArrowLeft" ? ACTIVE_CLASSES.length - 1 : 1)) % ACTIVE_CLASSES.length];
    fireside.select(k); pickHero(k); e.preventDefault();
  } else if (e.key === "Enter") { begin(); e.preventDefault(); }
});

let launching = false;
/** The one way into the game: waits for the game chunk, then starts Phaser. Ignored while a launch is under way or once the game is built. */
function launch(name: string, password: string, newGame: boolean, back = false) {
  if (launching) return;
  launching = true;
  // if the server turns the hero away, the login form is what shows under the loading screen
  show("login");
  playBtn.setAttribute("disabled", "");
  initMusic(name);
  status.textContent = "Connecting…";
  showLoading(back ? "Back to where you stood…" : undefined); // covers everything until the world is fully drawn (TownScene hides it)
  // `launching` stays set once the game is built: a page holds one game. If the server then turns the hero away, the
  // scene reloads the page and the reason shows on the start screen (reconnect.ts failToStart / takeStartNote below).
  loadGame().then((g) => g.startGame({ name, password, color, cls, newGame })).catch((e) => {
    console.error("game start failed", e);
    // The game files did not arrive (offline, or a deploy is under way). The browser remembers a failed import() until
    // the page is reloaded, so the retry is a reload (which also picks up a new build). Same if building the game threw.
    launching = false;
    hideLoading(true);
    nameEl.value = name; pwEl.value = password;
    status.textContent = "Could not load the game. Check your connection, then reload to try again.";
    playBtn.textContent = "Reload";
    playBtn.onclick = () => location.reload();
    pwEl.onkeydown = (e) => { if (e.key === "Enter") location.reload(); };
    playBtn.removeAttribute("disabled");
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
  if (isActiveClass(rejoin.cls)) cls = rejoin.cls;
  color = rejoin.color;
  launch(rejoin.name, rejoin.password, false, true);
}
// Back from the game menu's "Save and return to start screen": log in again and show Resume / New game
const back = rejoin ? null : takeBackToStart();
if (back) { nameEl.value = back.name; pwEl.value = back.password; void start(); }
// Back from a join the server refused or that never connected: say why, with the form ready for another try
const note = takeStartNote();
if (note && !rejoin && !back) { nameEl.value = note.name; pwEl.value = note.password; status.textContent = note.text; pwEl.focus(); }
