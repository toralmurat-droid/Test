/**
 * Background music.
 *
 * - Tracks are listed in TRACKS below. MP3 tracks live in client/public/assets/music/;
 *   the "Village tune" is a small chiptune made in code (no file).
 * - Starts after the first click / key press (browsers block sound before that), fades in,
 *   fades out when muted or when the tab is hidden, and crossfades when the track changes.
 * - Track, volume and mute are remembered per player name (localStorage "music:<name>").
 * - UI: the "Music" button in the bottom-right menu opens the music menu (track, volume, mute).
 */

type Track = { id: string; name: string; url?: string };
const TRACKS: Track[] = [
  { id: "blob-slayer", name: "Blob Slayer", url: "/assets/music/blob-slayer.mp3" },
  { id: "village", name: "Village tune" },
];
const FADE_IN = 2.5;
const FADE_OUT = 0.8;

type Settings = { volume: number; muted: boolean; track: string };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let settings: Settings = { volume: 0.5, muted: false, track: TRACKS[0].id };
let storeKey = "music";
let started = false;
let audioEl: HTMLAudioElement | null = null;
let chip: Chiptune | null = null;
let playing: string | null = null;
let switchTimer: number | null = null;

function load(name: string) {
  storeKey = `music:${name.toLowerCase()}`;
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.volume === "number") settings.volume = Math.min(1, Math.max(0, s.volume));
      if (typeof s.muted === "boolean") settings.muted = s.muted;
      if (TRACKS.some((t) => t.id === s.track)) settings.track = s.track;
    }
  } catch { /* private mode */ }
}

function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(settings)); } catch { /* private mode */ }
}

/** Curve so the slider feels even to the ear; music sits under the game, so max is 0.6. */
function targetGain(): number {
  if (settings.muted || document.hidden) return 0;
  return 0.6 * settings.volume * settings.volume;
}

function fadeTo(value: number, seconds: number) {
  if (!ctx || !master) return;
  const g = master.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(value, t + seconds);
}

/** Stop whatever plays and start the chosen track (the caller handles the fades). */
function playTrack() {
  if (!ctx || !master) return;
  audioEl?.pause();
  chip?.stop();
  const track = TRACKS.find((t) => t.id === settings.track) ?? TRACKS[0];
  playing = track.id;
  if (track.url) {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.loop = true;
      audioEl.preload = "auto";
      ctx.createMediaElementSource(audioEl).connect(master);
    }
    if (!audioEl.src.endsWith(track.url)) audioEl.src = track.url;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  } else {
    chip ??= new Chiptune(ctx, master);
    chip.start();
  }
}

/** Resume the current track (after mute / hidden tab) without restarting it. */
function resume() {
  const track = TRACKS.find((t) => t.id === playing);
  if (track?.url) audioEl?.play().catch(() => {});
  else chip?.start();
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
      chip?.stop();
    }, fadeSeconds * 1000 + 50);
  }
}

/** Fade the old track out, start the new one and fade it in. */
function switchTrack() {
  if (!started || targetGain() === 0) { playing = null; return; }
  if (switchTimer !== null) clearTimeout(switchTimer);
  fadeTo(0, FADE_OUT);
  switchTimer = window.setTimeout(() => {
    switchTimer = null;
    playTrack();
    fadeTo(targetGain(), 1.5);
  }, FADE_OUT * 1000);
}

/** Call once the player has logged in. Music starts on the first click or key press. */
export function initMusic(playerName: string) {
  load(playerName);
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    void begin();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => apply(document.hidden ? FADE_OUT : FADE_IN));
  buildUi();
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
    <div class="mrow"><span id="musicpct"></span><button id="musicmute"></button></div>`;
  hud.appendChild(panel);

  const list = panel.querySelector("#musictracks") as HTMLElement;
  const trackBtns = TRACKS.map((t) => {
    const b = document.createElement("button");
    b.className = "mtrack";
    b.textContent = t.name;
    b.onclick = () => {
      if (settings.track === t.id) return;
      settings.track = t.id;
      save(); render(); switchTrack(); b.blur();
    };
    list.appendChild(b);
    return b;
  });
  const vol = panel.querySelector("#musicvol") as HTMLInputElement;
  const pct = panel.querySelector("#musicpct") as HTMLElement;
  const mute = panel.querySelector("#musicmute") as HTMLButtonElement;
  function render() {
    vol.value = String(Math.round(settings.volume * 100));
    pct.textContent = `${Math.round(settings.volume * 100)}%`;
    mute.textContent = settings.muted ? "Unmute" : "Mute";
    btn.textContent = settings.muted || settings.volume === 0 ? "♪ Off" : "♪ Music";
    TRACKS.forEach((t, i) => trackBtns[i].classList.toggle("sel", t.id === settings.track));
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
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && e.target !== btn) panel.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Built-in placeholder: a quiet medieval-sounding chiptune in D dorian, ~45 s loop.
// "." holds the previous note, "_" is a rest. One token = one eighth note.

const MELODY = [
  // A
  "D4 . A4 . G4 F4 E4 D4", "E4 F4 G4 . A4 . . .", "C5 . B4 A4 G4 . A4 F4", "E4 . D4 . . . _ _",
  "D4 . A4 . G4 F4 E4 D4", "E4 F4 G4 . A4 . C5 .", "D5 . C5 A4 G4 . E4 F4", "D4 . . . . . _ _",
  // B
  "A4 . D5 . C5 . A4 .", "G4 A4 B4 . A4 . . .", "F4 . G4 A4 E4 . F4 G4", "A4 . . . . . _ _",
  "D5 . C5 . A4 . G4 .", "F4 G4 A4 . E4 . D4 .", "C4 . D4 E4 F4 . E4 C4", "D4 . . . . . _ _",
].join(" ").split(" ");

/** Bass: two roots per bar (each played as root, fifth on quarter notes). */
const BASS = [
  "D D", "C C", "F G", "A A", "D D", "C A", "F C", "D D",
  "D D", "G G", "F C", "A A", "D D", "F A", "C C", "D D",
].join(" ").split(" ");

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n: string): number { return 12 * (Number(n.slice(1)) + 1) + NOTE[n[0]]; }
function freq(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

class Chiptune {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private readonly eighth = 60 / 92 / 2; // 92 bpm
  private noise: AudioBuffer;
  private out: GainNode;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    // Soft low-pass so the square wave sounds like a reed pipe, not a buzzer
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    this.out.connect(lp).connect(dest);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start() {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.eighth;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  private playStep(i: number, t: number) {
    const tok = MELODY[i];
    if (tok !== "." && tok !== "_") {
      let len = 1;
      while (MELODY[(i + len) % MELODY.length] === "." && len < 8) len++;
      const f = freq(midi(tok));
      this.tone("square", f, t, len * this.eighth * 0.95, 0.07);
      this.tone("triangle", f, t, len * this.eighth * 0.95, 0.12);
    }
    const inBar = i % 8;
    if (inBar % 2 === 0) {
      const root = BASS[Math.floor(i / 8) * 2 + (inBar >= 4 ? 1 : 0)];
      const m = midi(root + "2") + (inBar % 4 === 2 ? 7 : 0);
      this.tone("triangle", freq(m), t, this.eighth * 1.8, 0.22);
    }
    // Hand drum: low thump on beats 1 and 3, a light shaker tick on the off-beats
    if (inBar === 0 || inBar === 4) this.drum(t, 900, 0.12);
    else if (inBar % 2 === 1) this.drum(t, 6000, 0.025);
  }

  private tone(type: OscillatorType, f: number, t: number, dur: number, vol: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.03, dur - 0.06));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private drum(t: number, cutoff: number, vol: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = cutoff > 2000 ? "highpass" : "lowpass";
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (cutoff > 2000 ? 0.04 : 0.15));
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + 0.2);
  }
}
