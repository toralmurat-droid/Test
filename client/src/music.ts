import { icon as pxIcon } from "./pixelicons";
/**
 * Background music.
 *
 * Tracks (TRACKS below): Murat's MP3 songs in client/public/assets/music/, plus "Village sounds"
 * (wind, birds, murmur, the smith's hammer) made in code.
 *
 * "Auto" (the default):
 * - Opening: "Hearth of Oakvale" starts as soon as the game opens (or on the first click / key if the browser
 *   waits for one) and loops through the start menus and the loading screen. In the world it plays on ONCE
 *   to its end, then the normal rules take over; leaving the village fades it out. Never again this page.
 * - Calm: the Village tune with soft village sounds under it in Oakvale, Saltmere and the Hunter's Camp,
 *   the Countryside tune everywhere else (both loop).
 * - Battle: when the fighting around the hero heats up (hits near the hero, hits taken), the zone's battle
 *   song comes in: The Pale Marshal's March where skeletons live, Blob Slayer for blobs and bandits.
 *   It starts quiet and swells as the battle intensifies (unless the player turned the swell off),
 *   plays once in full, then the calm tune returns. The same battle song only comes back 5 minutes after
 *   it last played (anywhere on the map).
 * - Act 2 (the Sunscar desert): the first time the hero comes through the waygate (each time the game opens),
 *   the Act 2 theme "Song of the Second Sun" plays once. Calm: the Kel Ashar tune with desert sounds under it in
 *   the town, the Oasis tune at the oases, the Buried City tune in Kharsun and the Veiled Sanctum, the Dune tune
 *   everywhere else. Battle: "Sand and Steel"; at the Sun Furnace, "Ishael, the Sunwright" (loops while the fight
 *   lasts). The desert songs are Murat's mp3s, added once made (the prompts are in docs/music/act2-prompts.md):
 *   until a file is there, its slot falls back to the desert sounds (calm) or the Act 1 battle songs.
 * A manually picked track just loops at the set volume.
 *
 * Starts after the first click / key press (browsers block sound before that); fades on mute / hidden tab.
 * Settings are remembered per player name (localStorage "music:<name>").
 */

/**
 * ambience: the village sounds alone; withSounds: an mp3 with the village sounds softly under it;
 * desert: the desert sounds instead of the village ones; optional: an mp3 that may not be in the game yet
 * (a missing file is left out of the menu and Auto uses its fallback).
 */
type Track = { id: string; name: string; url?: string; ambience?: boolean; withSounds?: boolean; desert?: boolean; optional?: boolean };

const TRACKS: Track[] = [
  { id: "hearth", name: "Hearth of Oakvale", url: "/assets/music/hearth-of-oakvale.mp3" },
  { id: "blob-slayer", name: "Blob Slayer", url: "/assets/music/blob-slayer.mp3" },
  { id: "pale-marshals", name: "The Pale Marshal's March", url: "/assets/music/pale-marshals-march.mp3" },
  { id: "village", name: "Village tune", url: "/assets/music/village-tune.mp3", withSounds: true },
  { id: "country", name: "Countryside tune", url: "/assets/music/countryside-tune.mp3" },
  { id: "village-sounds", name: "Village sounds", ambience: true },
  // Act 2, the Sunscar (optional until Murat's mp3s are added; file names in docs/music/act2-prompts.md)
  { id: "second-sun", name: "Song of the Second Sun", url: "/assets/music/song-of-the-second-sun.mp3", optional: true },
  { id: "kel-ashar", name: "Kel Ashar tune", url: "/assets/music/kel-ashar-tune.mp3", withSounds: true, desert: true, optional: true },
  { id: "dunes", name: "Dune tune", url: "/assets/music/dune-tune.mp3", optional: true },
  { id: "oasis", name: "Oasis tune", url: "/assets/music/oasis-tune.mp3", optional: true },
  { id: "kharsun", name: "The Buried City", url: "/assets/music/the-buried-city.mp3", optional: true },
  { id: "sand-steel", name: "Sand and Steel", url: "/assets/music/sand-and-steel.mp3", optional: true },
  { id: "sunwright", name: "Ishael, the Sunwright", url: "/assets/music/ishael-the-sunwright.mp3", optional: true },
  { id: "desert-sounds", name: "Desert sounds", ambience: true, desert: true },
];
/** The mp3 files in the game (vite.config.mts lists client/public/assets/music at build time). */
declare const __MUSIC_FILES__: string[];
const present = new Set<string>(typeof __MUSIC_FILES__ === "undefined" ? [] : __MUSIC_FILES__);
const hasTrack = (id: string) => { const t = TRACKS.find((x) => x.id === id); return !!t && (!t.optional || present.has(t.url!.split("/").pop()!)); };
/** The first of these tracks that is in the game. */
const firstOf = (...ids: (string | null)[]) => ids.find((id): id is string => !!id && hasTrack(id)) ?? null;
/** Act 2 calm areas with their own tune (else the Dune tune). */
const DESERT_TOWNS = ["Kel Ashar", "Kel Ashar Market"];
/** Act 3 calm areas that play the village tune (Cairnwatch, the moors' outpost). */
const MOORS_TOWNS = ["Cairnwatch"];
const OASES = ["Palmshade Oasis", "Mirage Wells", "Jackal Springs"];
const BURIED = ["Kharsun, the Buried City", "The Veiled Sanctum"];
const FURNACE = "The Sun Furnace";
const UNDEAD = ["skeleton", "skeletonmage", "necromancer", "sanddead", "wight", "bonehound", "mistwraith", "legionary", "cairnlord", "barrowking"];
const FIGHT = ["slime", "shooterblob", "warriorblob", "healerblob", "motherblob", "bandit", "venomblob", "frostblob", "fireblob", "stormblob", "nomad", "scorpion", "veiled", "camelfolk", "sphinx", "sunwright", "nightraider", "boghag"];
const TOWNS = ["Oakvale", "Market Square", "Chapel of the Dawn", "The Rusty Tankard", "The Smithy", "Saltmere", "Hunter's Camp"];

const FADE_IN = 2.5;
const FADE_OUT = 0.8;
/** Seconds the hero must stay in a place before the calm tune changes (no ping-pong on borders). */
const ZONE_SETTLE = 2;
/** Battle heat: points per hit near the hero / taken by the hero, halves every HEAT_HALF_LIFE seconds. */
const HEAT_START = 5;
const HEAT_FULL = 16;
const HEAT_HALF_LIFE = 8;
/** The swell: a battle song starts at this share of the set volume and rises to full. */
const SWELL_FLOOR = 0.35;
const BATTLE_COOLDOWN_MS = 5 * 60 * 1000;

/** pick: "auto" or a track id. swell: battle songs rise with the fighting (off = fixed volume). */
type Settings = { volume: number; muted: boolean; pick: string; swell: boolean };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let mp3Gain: GainNode | null = null;
let settings: Settings = { volume: 0.5, muted: false, pick: "auto", swell: true };
let storeKey = "music";
let started = false;
let audioEl: HTMLAudioElement | null = null;
let playing: string | null = null;
let switchTimer: number | null = null;

// Where the hero is (for Auto)
let calmTrack = "village";
/** The opening song is still to play / playing (every time the game opens) */
let intro = true;
/** The hero is in the world (false on the start menus and the loading screen) */
let inWorld = false;
let ambience: Ambience | null = null;
let pendingCalm: string | null = null;
let calmTimer: number | null = null;
let zoneName: string | undefined;
let zoneBattle: string | null = null;
// Battle state
let heat = 0;
let battle: { track: string; zone: string; boss?: boolean } | null = null;
/** Act 2's theme: still to play (the first time in the desert each time the game opens) / playing now */
let arrival: "todo" | "playing" | "done" = "todo";
let act = 1;
/** Battle song id -> time it may play again (5 min after it last played). */
const cooldownUntil = new Map<string, number>();

function load(name: string) {
  storeKey = `music:${name.toLowerCase()}`;
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.volume === "number") settings.volume = Math.min(1, Math.max(0, s.volume));
      if (typeof s.muted === "boolean") settings.muted = s.muted;
      if (typeof s.swell === "boolean") settings.swell = s.swell;
      if (s.pick === "auto" || TRACKS.some((t) => t.id === s.pick)) settings.pick = s.pick;
    }
  } catch { /* private mode */ }
}

function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(settings)); } catch { /* private mode */ }
}

/** Curve so the slider feels even to the ear; music sits under the game, so max is 0.8. */
function targetGain(): number {
  if (settings.muted || document.hidden) return 0;
  return 0.8 * settings.volume * settings.volume;
}

function ramp(g: AudioParam, value: number, seconds: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(value, t + seconds);
}
function fadeTo(value: number, seconds: number) {
  if (master) ramp(master.gain, value, seconds);
}

function wantedTrack(): string {
  if (settings.pick !== "auto") return hasTrack(settings.pick) ? settings.pick : "country";
  // In the world the opening song never starts over (e.g. after a mute): it only carries on
  if (intro && inWorld && playing !== "hearth") intro = false;
  if (intro) return "hearth";
  if (battle) return battle.track;
  if (arrival === "playing") return "second-sun";
  return calmTrack;
}

/** Share of the set volume for the mp3 now playing: swells with the battle heat in Auto. */
function swellLevel(): number {
  if (!battle || settings.pick !== "auto" || !settings.swell) return 1;
  return SWELL_FLOOR + (1 - SWELL_FLOOR) * Math.min(1, Math.max(0, (heat - HEAT_START) / (HEAT_FULL - HEAT_START)));
}

/** Stop whatever plays and start the wanted track (the caller handles the fades). */
function playTrack() {
  if (!ctx || !master) return;
  audioEl?.pause();
  ambience?.stop();
  const track = TRACKS.find((t) => t.id === wantedTrack()) ?? TRACKS[0];
  playing = track.id;
  if (track.url) {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = "auto";
      mp3Gain = ctx.createGain();
      ctx.createMediaElementSource(audioEl).connect(mp3Gain).connect(master);
      audioEl.addEventListener("ended", songEnded);
    }
    if (!audioEl.src.endsWith(track.url)) audioEl.src = track.url;
    // Battle songs play once in full, the opening song loops until the hero is in the world;
    // calm tunes and a picked song loop
    audioEl.loop = settings.pick !== "auto" || (track.id === "hearth" ? !inWorld
      : track.id === "second-sun" ? false
      : battle?.track === track.id ? !!battle.boss : true);
    audioEl.currentTime = 0;
    if (mp3Gain) { mp3Gain.gain.cancelScheduledValues(ctx.currentTime); mp3Gain.gain.value = swellLevel(); }
    audioEl.play().catch(() => {});
  }
  if (track.ambience || track.withSounds) {
    ambience ??= new Ambience(ctx, master);
    ambience.setLevel(track.ambience ? 0.65 : 0.28);
    ambience.start(!!track.desert);
  }
}

/** Resume the current track (after mute / hidden tab) without restarting it. */
function resume() {
  const track = TRACKS.find((t) => t.id === playing);
  if (track?.url) audioEl?.play().catch(() => {});
  if (track?.ambience || track?.withSounds) ambience?.start(!!track.desert);
}

async function begin() {
  if (started) return;
  started = true;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // Try at once; if the browser still waits for a click / key, the unlock in startMusic starts it
  if (ctx.state === "suspended") await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
  if (targetGain() > 0) playTrack();
  fadeTo(targetGain(), FADE_IN);
  window.setInterval(tick, 250);
}

function apply(fadeSeconds: number) {
  if (!started) return;
  const target = targetGain();
  if (target > 0) {
    ctx?.resume().catch(() => {});
    if (playing === null) playTrack(); else resume();
  }
  fadeTo(target, fadeSeconds);
  // Fully silent: stop the work (and the mp3) once the fade is done
  if (target === 0) {
    setTimeout(() => {
      if (targetGain() > 0) return;
      audioEl?.pause();
      ambience?.stop();
    }, fadeSeconds * 1000 + 50);
  }
}

/** Fade the old track out, start the wanted one and fade it in. */
function switchTrack(fadeIn = 1.5, fadeOut = FADE_OUT) {
  if (!started || targetGain() === 0) { playing = null; return; }
  if (wantedTrack() === playing && switchTimer === null) return;
  if (switchTimer !== null) clearTimeout(switchTimer);
  fadeTo(0, fadeOut);
  switchTimer = window.setTimeout(() => {
    switchTimer = null;
    playTrack();
    fadeTo(targetGain(), fadeIn);
  }, fadeOut * 1000);
}

/** An mp3 ended (only the opening and battle songs don't loop). */
function songEnded() {
  if (playing === "hearth" && intro) { intro = false; switchTrack(FADE_IN); return; }
  if (playing === "second-sun" && arrival === "playing") { arrival = "done"; if (!battle) switchTrack(FADE_IN); return; }
  battleOver();
}

/** The battle song ended: back to the calm tune, and this song rests for 5 minutes. */
function battleOver() {
  if (!battle) return;
  cooldownUntil.set(battle.track, Date.now() + BATTLE_COOLDOWN_MS);
  battle = null;
  switchTrack(FADE_IN);
}

function tick() {
  heat *= Math.pow(0.5, 0.25 / HEAT_HALF_LIFE);
  if (heat < 0.05) heat = 0;
  if (settings.pick !== "auto" || targetGain() === 0) return;
  // The opening song in the world never loops (it plays once, then the normal rules)
  if (inWorld && playing === "hearth" && audioEl?.loop) audioEl.loop = false;
  // The boss song loops while the fight lasts, and fades once it has gone quiet
  if (battle?.boss && heat < 1) { battle = null; switchTrack(FADE_IN, 3); return; }
  if (!battle && !intro && zoneBattle && zoneName && heat >= HEAT_START && Date.now() >= (cooldownUntil.get(zoneBattle) ?? 0)) {
    const boss = zoneBattle === "sunwright";
    battle = { track: zoneBattle, zone: zoneName, boss };
    if (arrival === "playing") arrival = "done";
    // rests from its start too, so a song cut short does not come straight back (the boss song never rests)
    if (!boss) cooldownUntil.set(zoneBattle, Date.now() + BATTLE_COOLDOWN_MS);
    switchTrack(1);
    return;
  }
  // The swell follows the fighting, smoothly (both ways, never below the floor)
  if (battle && playing === battle.track && mp3Gain && ctx && switchTimer === null) {
    mp3Gain.gain.setTargetAtTime(swellLevel(), ctx.currentTime, 0.8);
  }
}

/**
 * Where the hero stands: the monster zone (name + its `mobs`, or undefined outside any) and the area
 * name. Cheap to call every frame.
 */
export function setMusicZone(zone: string | undefined, mobs: Partial<Record<string, number>> | undefined, area: string, actNowRaw: 1 | 2 | 3 | 4 = 1) {
  const actNow: 1 | 2 = actNowRaw === 2 ? 2 : 1; // Acts 3 and 4 borrow the valley's calm country track until the moors and the badlands have their own music (slot: a badlands calm track here)
  if (!inWorld) {
    // In the world now: the opening song plays on to its end instead of looping
    inWorld = true;
    if (playing === "hearth" && audioEl) audioEl.loop = settings.pick !== "auto";
    // Not playing it now (muted, another track picked, ...): no opening song later in the game
    else if (intro) intro = false;
  }
  const has = (kinds: string[]) => !!mobs && kinds.some((k) => (mobs[k] ?? 0) > 0);
  const actOneBattle = has(UNDEAD) ? "pale-marshals" : has(FIGHT) ? "blob-slayer" : null;
  let calm: string;
  if (actNow === 2) {
    // The Sun Furnace has no monster zone of its own: the boss fight is named by the area
    zoneName = zone ?? (area === FURNACE ? FURNACE : undefined);
    zoneBattle = area === FURNACE ? firstOf("sunwright", "sand-steel", "blob-slayer")
      : actOneBattle && firstOf("sand-steel", actOneBattle);
    calm = (DESERT_TOWNS.includes(area) ? firstOf("kel-ashar")
      : OASES.includes(area) ? firstOf("oasis", "dunes")
      : BURIED.includes(area) ? firstOf("kharsun", "dunes")
      : firstOf("dunes")) ?? "desert-sounds";
    // First steps in the desert: the Act 2 theme, once
    if (act !== 2 && arrival === "todo" && !intro && hasTrack("second-sun") && settings.pick === "auto") {
      arrival = "playing";
      act = 2;
      calmTrack = calm; pendingCalm = calm;
      if (calmTimer !== null) { clearTimeout(calmTimer); calmTimer = null; }
      if (!battle) switchTrack(FADE_IN);
      return;
    }
  } else {
    zoneName = zone;
    zoneBattle = actOneBattle;
    calm = !zone && (TOWNS.includes(area) || (actNowRaw === 3 && MOORS_TOWNS.includes(area))) ? "village" : "country";
  }
  // Back to the valley while the theme plays: it fades with the calm change below
  if (actNow !== act) { act = actNow; if (arrival === "playing") arrival = "done"; }
  if (calm === pendingCalm) return;
  pendingCalm = calm;
  if (calmTimer !== null) clearTimeout(calmTimer);
  calmTimer = null;
  if (calm === calmTrack) return;
  // First reading after login: no wait, so the right tune starts at once
  calmTimer = window.setTimeout(() => {
    calmTimer = null;
    calmTrack = calm;
    // Leaving the village ends the opening song with a long fade
    if (intro && started && calm !== "village") { intro = false; if (settings.pick === "auto") switchTrack(FADE_IN, 4); return; }
    if (settings.pick === "auto" && !battle && !intro && arrival !== "playing") switchTrack();
  }, started ? ZONE_SETTLE * 1000 : 0);
}

/** Fighting near the hero: a hit on a monster nearby (1) or on the hero (3). */
export function musicCombat(points: number) {
  heat = Math.min(HEAT_FULL * 1.5, heat + points);
}

/**
 * Call when the page opens (login screen). Music starts on the first click or key press, using the
 * settings of the last player name typed on this device.
 */
export function startMusic(lastName: string) {
  load(lastName);
  const unlock = () => {
    if (!started) { void begin(); return; }
    // Started before any click: the browser wants one to play. The opening song then starts from the top.
    if (ctx?.state === "suspended" || (audioEl?.paused && TRACKS.find((t) => t.id === playing)?.url)) {
      if (playing === "hearth" && audioEl && !inWorld) audioEl.currentTime = 0;
      apply(0.5);
    }
    else { window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true); }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => apply(document.hidden ? FADE_OUT : FADE_IN));
  // The opening song as soon as the game opens, where the browser allows sound without a click
  void begin();
}

/** Back in after a server restart (auto rejoin): no opening song, straight to the zone's tune. */
export function skipIntro() {
  if (!intro) return;
  intro = false;
  if (playing === "hearth") switchTrack(FADE_IN);
}

/** Call once the player has logged in: their own settings, and the music menu. */
export function initMusic(playerName: string) {
  const before = { ...settings };
  load(playerName);
  buildUi();
  if (!started) { void begin(); return; }
  if (before.pick !== settings.pick) switchTrack();
  else if (before.volume !== settings.volume || before.muted !== settings.muted) apply(1);
}

/** Shows or hides the music & sound panel (opened from the game menu). */
export function showMusicPanel(show?: boolean) {
  const panel = document.getElementById("musicpanel");
  if (panel) panel.hidden = show === undefined ? !panel.hidden : !show;
}
export function musicPanelOpen() { return !document.getElementById("musicpanel")?.hidden; }

function buildUi() {
  const hud = document.getElementById("hud");
  if (!hud || document.getElementById("musicpanel")) return;

  const panel = document.createElement("div");
  panel.id = "musicpanel";
  panel.hidden = true;
  panel.innerHTML = `<div class="mtitle">Music &amp; sound <button id="musicclose">${pxIcon("close")}</button></div>
    <div class="mlabel">Track</div>
    <div id="musictracks"></div>
    <div class="mlabel">Volume</div>
    <input id="musicvol" type="range" min="0" max="100" step="1" aria-label="Music volume">
    <div class="mrow"><span id="musicpct"></span><button id="musicmute"></button></div>
    <button id="musicswell" title="Auto: battle songs start quiet and grow louder as the fight heats up"></button>`;
  hud.appendChild(panel);

  const list = panel.querySelector("#musictracks") as HTMLElement;
  const choices = [{ id: "auto", name: "Auto (calm + battle)" }, ...TRACKS.filter((t) => hasTrack(t.id))];
  const trackBtns = choices.map((t) => {
    const b = document.createElement("button");
    b.className = "mtrack";
    b.textContent = t.name;
    b.onclick = () => {
      if (settings.pick === t.id) return;
      settings.pick = t.id;
      battle = null;
      intro = false;
      save(); render(); switchTrack(); b.blur();
    };
    list.appendChild(b);
    return b;
  });
  const vol = panel.querySelector("#musicvol") as HTMLInputElement;
  const pct = panel.querySelector("#musicpct") as HTMLElement;
  const mute = panel.querySelector("#musicmute") as HTMLButtonElement;
  const swell = panel.querySelector("#musicswell") as HTMLButtonElement;
  function render() {
    vol.value = String(Math.round(settings.volume * 100));
    pct.textContent = `${Math.round(settings.volume * 100)}%`;
    mute.textContent = settings.muted ? "Unmute" : "Mute";
    swell.textContent = `Battle swell: ${settings.swell ? "On" : "Off (fixed volume)"}`;
    swell.hidden = settings.pick !== "auto";
    choices.forEach((t, i) => trackBtns[i].classList.toggle("sel", t.id === settings.pick));
  }
  render();

  // Keep game keys (WASD, numbers...) from firing while the menu has focus
  panel.addEventListener("keydown", (e) => e.stopPropagation());
  (panel.querySelector("#musicclose") as HTMLButtonElement).onclick = () => { panel.hidden = true; };
  vol.oninput = () => {
    settings.volume = Number(vol.value) / 100;
    if (settings.volume > 0) settings.muted = false;
    save(); render(); apply(0.15);
  };
  vol.onchange = () => vol.blur();
  mute.onclick = () => { settings.muted = !settings.muted; save(); render(); apply(settings.muted ? FADE_OUT : 1.2); mute.blur(); };
  swell.onclick = () => { settings.swell = !settings.swell; save(); render(); swell.blur(); };
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("#gamemenu")) panel.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Village sounds, made in code: wind, a murmur of voices, birds, now and then the smith's hammer.
// Desert sounds (Act 2): a dry wind that gusts and hisses with sand, now and then far-off chimes on the wind,
// a camel bell and a hawk's cry high up.

class Ambience {
  private timer: number | null = null;
  private loops: AudioScheduledSourceNode[] = [];
  private out: GainNode;
  private noise: AudioBuffer;
  private nextBird = 0;
  private nextHammer = 0;
  private nextChime = 0;
  private nextHawk = 0;
  private desert = false;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(dest);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    // Brown-ish noise: softer than white, like air
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }

  setLevel(v: number) {
    this.out.gain.value = v;
  }

  start(desert = false) {
    if (this.timer !== null && desert === this.desert) return;
    if (this.timer !== null) this.stop();
    this.desert = desert;
    const now = this.ctx.currentTime;
    if (desert) {
      this.bed(180, 0.6, 0.09, 0.045); // the low dry wind
      this.bed(2300, 0.8, 0.022, 0.11); // sand hissing over the dunes, in gusts
      this.bed(640, 1.6, 0.03, 0.08);   // a far-off murmur (the town under the wind)
      this.nextChime = now + 3 + Math.random() * 4;
      this.nextHawk = now + 12 + Math.random() * 15;
      this.nextBird = Infinity; this.nextHammer = Infinity;
    } else {
      this.bed(260, 0.7, 0.08, 0.06);  // wind, a soft breath under the tune
      this.bed(520, 1.4, 0.05, 0.17);  // distant voices
      this.nextBird = now + 1 + Math.random() * 2;
      this.nextHammer = now + 4 + Math.random() * 6;
      this.nextChime = Infinity; this.nextHawk = Infinity;
    }
    this.timer = window.setInterval(() => this.schedule(), 200);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.loops.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    this.loops = [];
  }

  /** A looping noise bed through a band-pass, its loudness drifting slowly. */
  private bed(freq: number, q: number, vol: number, lfoHz: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const lfo = this.ctx.createOscillator();
    const depth = this.ctx.createGain();
    lfo.frequency.value = lfoHz;
    depth.gain.value = vol * 0.3; // gentle drift, no big swells
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g).connect(this.out);
    src.start(); lfo.start();
    this.loops.push(src, lfo);
  }

  private schedule() {
    const now = this.ctx.currentTime;
    if (now >= this.nextBird) {
      this.bird(now + 0.05);
      this.nextBird = now + 1.5 + Math.random() * 5;
    }
    if (now >= this.nextHammer) {
      const strikes = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < strikes; i++) this.clink(now + 0.05 + i * (0.42 + Math.random() * 0.06));
      this.nextHammer = now + 9 + Math.random() * 14;
    }
    if (now >= this.nextChime) {
      // a few notes of a chime on the wind (a pentatonic handful), or a camel bell's dull clonk
      if (Math.random() < 0.7) {
        const scale = [880, 990, 1110, 1320, 1480, 1760];
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.chime(now + 0.05 + i * (0.18 + Math.random() * 0.35), scale[Math.floor(Math.random() * scale.length)]);
      } else {
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) this.camelBell(now + 0.05 + i * (0.55 + Math.random() * 0.2));
      }
      this.nextChime = now + 6 + Math.random() * 10;
    }
    if (now >= this.nextHawk) {
      this.hawk(now + 0.05);
      this.nextHawk = now + 25 + Math.random() * 30;
    }
  }

  /** A small metal chime far off: soft attack, long ring. */
  private chime(t: number, f: number) {
    for (const [m, v] of [[1, 0.012], [2.76, 0.004]] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + 2.3);
    }
  }

  /** A camel's wooden-and-copper bell, dull and low. */
  private camelBell(t: number) {
    for (const [f, v] of [[410, 0.022], [655, 0.01], [1030, 0.004]] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + 0.75);
    }
  }

  /** A hawk high over the sand: one long falling scream. */
  private hawk(t: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 3;
    o.frequency.setValueAtTime(2900, t);
    o.frequency.linearRampToValueAtTime(3300, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(1900, t + 1.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); o.stop(t + 1.2);
  }

  private bird(t: number) {
    const base = 2600 + Math.random() * 1400;
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.11 + Math.random() * 0.05);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), at + 0.06);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.035, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(g).connect(this.out);
      o.start(at); o.stop(at + 0.1);
    }
  }

  /** Hammer on the anvil, far off across the square. */
  private clink(t: number) {
    for (const [f, v] of [[1750, 0.03], [2630, 0.018], [4100, 0.008]] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + 0.4);
    }
  }
}
