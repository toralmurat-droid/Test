/**
 * Background music.
 *
 * Tracks (TRACKS below): Murat's MP3 songs in client/public/assets/music/, plus "Village sounds"
 * (wind, birds, murmur, the smith's hammer) made in code.
 *
 * "Auto" (the default):
 * - Opening: "Hearth of Oakvale" starts on the login / loading screen (first click or key) and plays once per
 *   browser session, never looping. It fades out when the hero leaves the village, or ends on its own.
 * - Calm: the Village tune with soft village sounds under it in Oakvale, Saltmere and the Hunter's Camp,
 *   the Countryside tune everywhere else (both loop).
 * - Battle: when the fighting around the hero heats up (hits near the hero, hits taken), the zone's battle
 *   song comes in: The Pale Marshal's March where skeletons live, Blob Slayer for blobs and bandits.
 *   It starts quiet and swells as the battle intensifies (unless the player turned the swell off),
 *   plays once in full, then the calm tune returns. That zone's battle song can come back after 5 minutes
 *   if the hero is still fighting there.
 * A manually picked track just loops at the set volume.
 *
 * Starts after the first click / key press (browsers block sound before that); fades on mute / hidden tab.
 * Settings are remembered per player name (localStorage "music:<name>").
 */

/** ambience: the village sounds alone; withSounds: an mp3 with the village sounds softly under it */
type Track = { id: string; name: string; url?: string; ambience?: boolean; withSounds?: boolean };

const TRACKS: Track[] = [
  { id: "hearth", name: "Hearth of Oakvale", url: "/assets/music/hearth-of-oakvale.mp3" },
  { id: "blob-slayer", name: "Blob Slayer", url: "/assets/music/blob-slayer.mp3" },
  { id: "pale-marshals", name: "The Pale Marshal's March", url: "/assets/music/pale-marshals-march.mp3" },
  { id: "village", name: "Village tune", url: "/assets/music/village-tune.mp3", withSounds: true },
  { id: "country", name: "Countryside tune", url: "/assets/music/countryside-tune.mp3" },
  { id: "village-sounds", name: "Village sounds", ambience: true },
];
const INTRO_KEY = "music:intro";
const UNDEAD = ["skeleton", "skeletonmage", "necromancer"];
const FIGHT = ["slime", "shooterblob", "warriorblob", "healerblob", "motherblob", "bandit"];
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
/** The opening song still to play / playing this browser session */
let intro = (() => { try { return sessionStorage.getItem(INTRO_KEY) !== "1"; } catch { return true; } })();
let ambience: Ambience | null = null;
let pendingCalm: string | null = null;
let calmTimer: number | null = null;
let zoneName: string | undefined;
let zoneBattle: string | null = null;
// Battle state
let heat = 0;
let battle: { track: string; zone: string } | null = null;
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
  if (settings.pick !== "auto") return settings.pick;
  if (intro) return "hearth";
  return battle?.track ?? calmTrack;
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
    // The opening and battle songs play once in full; calm tunes and a picked song loop
    audioEl.loop = settings.pick !== "auto" || (track.id !== "hearth" && battle?.track !== track.id);
    if (track.id === "hearth" && settings.pick === "auto") {
      try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* private mode */ }
    }
    audioEl.currentTime = 0;
    if (mp3Gain) { mp3Gain.gain.cancelScheduledValues(ctx.currentTime); mp3Gain.gain.value = swellLevel(); }
    audioEl.play().catch(() => {});
  }
  if (track.ambience || track.withSounds) {
    ambience ??= new Ambience(ctx, master);
    ambience.setLevel(track.ambience ? 0.65 : 0.28);
    ambience.start();
  }
}

/** Resume the current track (after mute / hidden tab) without restarting it. */
function resume() {
  const track = TRACKS.find((t) => t.id === playing);
  if (track?.url) audioEl?.play().catch(() => {});
  if (track?.ambience || track?.withSounds) ambience?.start();
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
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
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
  battleOver();
}

/** The battle song ended: back to the calm tune, and this zone rests for 5 minutes. */
function battleOver() {
  if (!battle) return;
  cooldownUntil.set(battle.zone, Date.now() + BATTLE_COOLDOWN_MS);
  battle = null;
  switchTrack(FADE_IN);
}

function tick() {
  heat *= Math.pow(0.5, 0.25 / HEAT_HALF_LIFE);
  if (heat < 0.05) heat = 0;
  if (settings.pick !== "auto" || targetGain() === 0) return;
  if (!battle && !intro && zoneBattle && zoneName && heat >= HEAT_START && Date.now() >= (cooldownUntil.get(zoneName) ?? 0)) {
    battle = { track: zoneBattle, zone: zoneName };
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
export function setMusicZone(zone: string | undefined, mobs: Partial<Record<string, number>> | undefined, area: string) {
  const has = (kinds: string[]) => !!mobs && kinds.some((k) => (mobs[k] ?? 0) > 0);
  zoneName = zone;
  zoneBattle = has(UNDEAD) ? "pale-marshals" : has(FIGHT) ? "blob-slayer" : null;
  const calm = !zone && TOWNS.includes(area) ? "village" : "country";
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
    if (settings.pick === "auto" && !battle && !intro) switchTrack();
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
    // Started without a click (e.g. back from a server restart): the browser wants one to play
    if (ctx?.state === "suspended" || (audioEl?.paused && TRACKS.find((t) => t.id === playing)?.url)) apply(0.5);
    else { window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true); }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => apply(document.hidden ? FADE_OUT : FADE_IN));
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

function buildUi() {
  const bar = document.getElementById("menubtns");
  const hud = document.getElementById("hud");
  if (!bar || !hud || document.getElementById("musicbtn")) return;

  const btn = document.createElement("button");
  btn.id = "musicbtn";
  btn.title = "Music menu: track, volume, mute";
  bar.prepend(btn);

  const panel = document.createElement("div");
  panel.id = "musicpanel";
  panel.hidden = true;
  panel.innerHTML = `<div class="mtitle">Music</div>
    <div class="mlabel">Track</div>
    <div id="musictracks"></div>
    <div class="mlabel">Volume</div>
    <input id="musicvol" type="range" min="0" max="100" step="1" aria-label="Music volume">
    <div class="mrow"><span id="musicpct"></span><button id="musicmute"></button></div>
    <button id="musicswell" title="Auto: battle songs start quiet and grow louder as the fight heats up"></button>`;
  hud.appendChild(panel);

  const list = panel.querySelector("#musictracks") as HTMLElement;
  const choices = [{ id: "auto", name: "Auto (calm + battle)" }, ...TRACKS];
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
    btn.textContent = settings.muted || settings.volume === 0 ? "♪ Off" : "♪ Music";
    choices.forEach((t, i) => trackBtns[i].classList.toggle("sel", t.id === settings.pick));
  }
  render();

  // Keep game keys (WASD, numbers...) from firing while the menu has focus
  panel.addEventListener("keydown", (e) => e.stopPropagation());
  btn.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; btn.blur(); };
  vol.oninput = () => {
    settings.volume = Number(vol.value) / 100;
    if (settings.volume > 0) settings.muted = false;
    save(); render(); apply(0.15);
  };
  vol.onchange = () => vol.blur();
  mute.onclick = () => { settings.muted = !settings.muted; save(); render(); apply(settings.muted ? FADE_OUT : 1.2); mute.blur(); };
  swell.onclick = () => { settings.swell = !settings.swell; save(); render(); swell.blur(); };
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && e.target !== btn) panel.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Village sounds, made in code: wind, a murmur of voices, birds, now and then the smith's hammer.

class Ambience {
  private timer: number | null = null;
  private loops: AudioScheduledSourceNode[] = [];
  private out: GainNode;
  private noise: AudioBuffer;
  private nextBird = 0;
  private nextHammer = 0;

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

  start() {
    if (this.timer !== null) return;
    this.bed(320, 0.6, 0.22, 0.06);  // wind
    this.bed(520, 1.4, 0.08, 0.17);  // distant voices
    const now = this.ctx.currentTime;
    this.nextBird = now + 1 + Math.random() * 2;
    this.nextHammer = now + 4 + Math.random() * 6;
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
    depth.gain.value = vol * 0.6;
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
