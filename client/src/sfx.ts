import { getStateCallbacks } from "colyseus.js";
/**
 * Sound effects, all made in code with WebAudio (no sound files).
 *
 * - One-shot sounds (hits, swings, spells, monster shouts and actions, pickups...) are placed in the world:
 *   they get quieter, duller and pan left/right with the distance from our hero.
 * - Environment beds (wind, water, fire crackle, birds by day / crickets by night, shrine and portal hums)
 *   follow where the hero stands. The village crowd/music lives in music.ts, not here.
 * - Footsteps for our hero (by ground: grass, stone, wood, sand) and heavy steps of big monsters.
 *
 * Volume + mute: a "Sound effects" slider added to the Music & sound panel (Esc game menu), remembered per player
 * (localStorage "sfx:<name>"). Starts at login (the Play click), or the next click / key press if the browser waits.
 */
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { GROUND, OBJECTS, T, areaAt } from "../../shared/map";
import { impactMs, skillById } from "../../shared/skills";
import { SHRINE } from "../../shared/shrine";
import { PORTALS } from "../../shared/portals";
import { dayPhase, dayTime } from "./details";

type Settings = { volume: number; muted: boolean };
let settings: Settings = { volume: 0.7, muted: false };
let storeKey = "sfx";

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // settings volume
let bus: GainNode | null = null; // one-shots
let bedBus: GainNode | null = null; // environment beds
let noiseBuf: AudioBuffer | null = null;
let started = false;

/** Our hero: the "ears" for distance and panning. */
let lx = 0, ly = 0, haveListener = false;
const RANGE = 14 * TILE; // beyond this a sound is not heard
let voices = 0;
const MAX_VOICES = 28;
const lastPlay = new Map<string, number>();
/** Sounds that ring for seconds (kept connected longer). */
const LONG = new Set(["lootRare", "lootLegendary", "horn", "ritual", "ritualCall", "demonRise", "demonRoar", "shrine", "portalTravel", "portalWake", "necroWind", "heroDie", "levelup", "owl", "chime", "warcry", "motherInflate", "demonFire", "skelDie"]);
const AMBIENT = new Set(["crackle", "bird", "cricket", "chime", "owl", "step", "skelIdle", "blobGurgle", "crawl"]);

const TOWNS = ["Oakvale", "Market Square", "Chapel of the Dawn", "The Rusty Tankard", "The Smithy", "Saltmere", "Hunter's Camp"];

// ---------------------------------------------------------------------------------------------------------
// Settings + menu

function load(name: string) {
  storeKey = `sfx:${name.toLowerCase()}`;
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.volume === "number") settings.volume = Math.min(1, Math.max(0, s.volume));
      if (typeof s.muted === "boolean") settings.muted = s.muted;
    }
  } catch { /* private mode */ }
}
function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(settings)); } catch { /* private mode */ }
}
function targetGain() {
  if (settings.muted || document.hidden) return 0;
  return 0.9 * settings.volume * settings.volume;
}
function applyGain(sec = 0.15) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(targetGain(), t + sec);
  if (targetGain() > 0) ctx.resume().catch(() => {});
}

/** Call once the player has logged in (after initMusic, so the ♪ menu exists). */
export function initSfx(playerName: string) {
  load(playerName);
  buildUi();
  if (started) { applyGain(0.5); return; } // logged in again (server restart): keep going
  // Usually called right after the Play click, so sound may start now; otherwise the next click / key does it
  begin();
  const unlock = () => {
    if (ctx && ctx.state !== "suspended") {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      return;
    }
    ctx?.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => applyGain(0.4));
}

function buildUi() {
  const panel = document.getElementById("musicpanel");
  if (!panel || document.getElementById("sfxvol")) return;
  const box = document.createElement("div");
  box.innerHTML = `<div class="mlabel">Sound effects</div>
    <input id="sfxvol" type="range" min="0" max="100" step="1" aria-label="Sound effects volume">
    <div class="mrow"><span id="sfxpct"></span><button id="sfxmute"></button></div>`;
  panel.appendChild(box);
  const vol = box.querySelector("#sfxvol") as HTMLInputElement;
  const pct = box.querySelector("#sfxpct") as HTMLElement;
  const mute = box.querySelector("#sfxmute") as HTMLButtonElement;
  const render = () => {
    vol.value = String(Math.round(settings.volume * 100));
    pct.textContent = `${Math.round(settings.volume * 100)}%`;
    mute.textContent = settings.muted ? "Unmute" : "Mute";
  };
  render();
  vol.oninput = () => {
    settings.volume = Number(vol.value) / 100;
    if (settings.volume > 0) settings.muted = false;
    save(); render(); applyGain();
  };
  // Let the player hear the new level
  vol.onchange = () => { vol.blur(); play("pickup", undefined, undefined, 0.8); };
  mute.onclick = () => { settings.muted = !settings.muted; save(); render(); applyGain(0.3); mute.blur(); };
}

function begin() {
  if (started) return;
  started = true;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  // A gentle limiter so a big fight does not clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
  master.connect(comp).connect(ctx.destination);
  bus = ctx.createGain(); bus.connect(master);
  bedBus = ctx.createGain(); bedBus.gain.value = 0.6; bedBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  applyGain(1.5);
  makeBeds();
  window.setInterval(envTick, 250);
}

// ---------------------------------------------------------------------------------------------------------
// Synth building blocks

type Out = AudioNode;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A tone with a pitch glide and a quick attack / exponential decay. */
function tone(out: Out, t: number, o: { type?: OscillatorType; f: number; f2?: number; dur: number; vol: number; att?: number; glide?: number; vib?: number; vibHz?: number; detune?: number }) {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide ?? o.dur));
  if (o.detune) osc.detune.value = o.detune;
  if (o.vib) {
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = o.vibHz ?? 6; lg.gain.value = o.vib;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t); lfo.stop(t + o.dur + 0.05);
  }
  const g = c.createGain();
  const att = o.att ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

/** Filtered noise: hiss, whoosh, thud, crackle, splash. */
function noise(out: Out, t: number, o: { type?: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; vol: number; att?: number; rate?: number }) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = o.rate ?? 1;
  const fl = c.createBiquadFilter();
  fl.type = o.type ?? "bandpass";
  fl.frequency.setValueAtTime(o.f, t);
  if (o.f2 !== undefined) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
  fl.Q.value = o.q ?? 1;
  const g = c.createGain();
  const att = o.att ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(fl).connect(g).connect(out);
  const off = Math.random() * 1.5;
  src.start(t, off, o.dur + 0.05);
}

/** A rough voice: a buzzing saw through two vowel formants (shouts, grunts, roars). */
function voice(out: Out, t: number, o: { f: number; f2?: number; dur: number; vol: number; vowel?: [number, number]; vowel2?: [number, number]; att?: number; rough?: number }) {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  // a bit of growl
  if (o.rough) {
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.type = "square"; lfo.frequency.value = 28 + Math.random() * 10; lg.gain.value = o.f * o.rough;
    lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + o.dur + 0.05);
  }
  const [a1, a2] = o.vowel ?? [700, 1150];
  const [b1, b2] = o.vowel2 ?? [a1, a2];
  const g = c.createGain();
  const att = o.att ?? 0.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + att);
  g.gain.setValueAtTime(o.vol, t + Math.max(att, o.dur * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  for (const [fa, fb, k] of [[a1, b1, 1], [a2, b2, 0.6]] as const) {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 6;
    bp.frequency.setValueAtTime(fa, t);
    bp.frequency.linearRampToValueAtTime(fb, t + o.dur);
    const kg = c.createGain(); kg.gain.value = k * 3;
    osc.connect(bp).connect(kg).connect(g);
  }
  g.connect(out);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

/** A bell: a few inharmonic partials ringing out. */
function bell(out: Out, t: number, f: number, dur: number, vol: number) {
  [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.9, 0.12]].forEach(([m, k]) => tone(out, t, { f: f * m, dur: dur / (1 + m * 0.3), vol: vol * k, att: 0.002 }));
}

/** Rattling bones: a quick run of dry clicks. */
function rattle(out: Out, t: number, n: number, spread: number, vol: number, hi = 2600) {
  for (let i = 0; i < n; i++) {
    const tt = t + (i / n) * spread + rnd(0, spread / n);
    noise(out, tt, { type: "bandpass", f: rnd(hi * 0.6, hi * 1.5), q: 8, dur: rnd(0.02, 0.045), vol: vol * rnd(0.5, 1) });
    tone(out, tt, { type: "triangle", f: rnd(900, 1800), dur: 0.03, vol: vol * 0.3 });
  }
}

/** Wet goo: a falling bubble plus a slurp of low noise. */
function squelch(out: Out, t: number, pitch: number, vol: number, len = 0.18) {
  tone(out, t, { f: 420 * pitch, f2: 90 * pitch, dur: len, vol: vol * 0.7, vib: 40 * pitch, vibHz: 30 });
  noise(out, t, { type: "lowpass", f: 900 * pitch, f2: 200, dur: len * 1.1, vol: vol * 0.9, q: 6 });
}

function whoosh(out: Out, t: number, f1: number, f2: number, dur: number, vol: number) {
  noise(out, t, { type: "bandpass", f: f1, f2, q: 1.6, dur, vol, att: dur * 0.4 });
}

function thud(out: Out, t: number, f: number, vol: number, dur = 0.18) {
  tone(out, t, { f, f2: f * 0.35, dur, vol });
  noise(out, t, { type: "lowpass", f: 500, f2: 120, dur: dur * 0.7, vol: vol * 0.7 });
}

function clank(out: Out, t: number, vol: number, f = 1300) {
  [1, 1.37, 2.13, 2.9].forEach((m, i) => tone(out, t, { type: i ? "sine" : "triangle", f: f * m * rnd(0.98, 1.02), dur: 0.28 / (1 + i * 0.4), vol: vol / (1 + i) }));
  noise(out, t, { type: "highpass", f: 3000, dur: 0.05, vol: vol * 0.6 });
}

function fireRoar(out: Out, t: number, dur: number, vol: number) {
  noise(out, t, { type: "lowpass", f: 300, f2: 1400, q: 2, dur, vol, att: dur * 0.3 });
  noise(out, t + 0.02, { type: "bandpass", f: 2000, f2: 700, q: 1, dur: dur * 0.8, vol: vol * 0.4 });
}

function zap(out: Out, t: number, vol: number, dur = 0.22) {
  tone(out, t, { type: "sawtooth", f: rnd(1600, 2400), f2: 180, dur, vol: vol * 0.5, vib: 300, vibHz: 55 });
  noise(out, t, { type: "highpass", f: 2500, dur: dur * 0.8, vol: vol * 0.8 });
}

/** Short chime in the colour of a skill style. */
function styleChime(out: Out, t: number, style: string, vol: number, big = 1) {
  switch (style) {
    case "fire": fireRoar(out, t, 0.35 * big, vol); break;
    case "frost": for (let i = 0; i < 4; i++) tone(out, t + i * 0.04, { type: "triangle", f: rnd(2400, 3800), dur: 0.25, vol: vol * 0.25 });
      noise(out, t, { type: "highpass", f: 5000, dur: 0.3, vol: vol * 0.3 }); break;
    case "lightning": zap(out, t, vol, 0.25 * big); break;
    case "arcane": [0, 4, 7, 12].forEach((s, i) => tone(out, t + i * 0.035, { f: 660 * 2 ** (s / 12), f2: 900 * 2 ** (s / 12), dur: 0.3, vol: vol * 0.22 })); break;
    case "holy": [0, 4, 7].forEach((s) => bell(out, t, 523 * 2 ** (s / 12), 0.9 * big, vol * 0.2)); break;
    case "shadow": tone(out, t, { type: "sawtooth", f: 110, f2: 70, dur: 0.5 * big, vol: vol * 0.25, att: 0.08, detune: 15 });
      tone(out, t, { type: "sawtooth", f: 113, f2: 66, dur: 0.5 * big, vol: vol * 0.2, att: 0.08 });
      whoosh(out, t, 400, 150, 0.45, vol * 0.4); break;
    case "poison": for (let i = 0; i < 5; i++) tone(out, t + i * 0.05, { f: rnd(300, 600), f2: rnd(700, 1100), dur: 0.06, vol: vol * 0.3 }); break;
    case "earth": thud(out, t, 70, vol * 0.9, 0.35); noise(out, t, { type: "lowpass", f: 300, dur: 0.5, vol: vol * 0.5 }); break;
    case "blood": squelch(out, t, 0.7, vol * 0.6); tone(out, t, { f: 90, f2: 60, dur: 0.3, vol: vol * 0.4 }); break;
    case "wind": whoosh(out, t, 500, 2200, 0.4 * big, vol * 0.8); break;
    case "spirit": [0, 7, 12].forEach((s) => tone(out, t, { type: "triangle", f: 440 * 2 ** (s / 12), dur: 0.7 * big, vol: vol * 0.13, att: 0.12, vib: 6 })); break;
    case "nature": for (let i = 0; i < 4; i++) tone(out, t + i * 0.06, { type: "triangle", f: rnd(500, 900), dur: 0.15, vol: vol * 0.25 }); break;
    default: clank(out, t, vol * 0.35, 1800); whoosh(out, t, 900, 2600, 0.18, vol * 0.5);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sound recipes. p = 0..1 random/variant value; v = volume scale

type Recipe = (o: Out, t: number, v: number, arg?: any) => void;

const R: Record<string, Recipe> = {
  // ---- heroes and plain combat
  swing: (o, t, v, heavy) => whoosh(o, t, heavy ? 350 : 700, heavy ? 1100 : 2600, heavy ? 0.26 : 0.16, 0.5 * v),
  hitFlesh: (o, t, v) => { thud(o, t, rnd(120, 170), 0.55 * v, 0.14); noise(o, t, { type: "bandpass", f: 1800, q: 2, dur: 0.05, vol: 0.3 * v }); },
  hitBlocked: (o, t, v) => clank(o, t, 0.4 * v, rnd(1100, 1500)),
  crit: (o, t, v) => { thud(o, t, 160, 0.6 * v, 0.2); clank(o, t + 0.01, 0.35 * v, 2100); },
  heroHurt: (o, t, v, pitch = 1) => voice(o, t, { f: 170 * pitch, f2: 120 * pitch, dur: 0.16, vol: 0.28 * v, vowel: [650, 1100], vowel2: [500, 900], att: 0.01 }),
  heroDie: (o, t, v) => { voice(o, t, { f: 180, f2: 70, dur: 0.7, vol: 0.3 * v, vowel: [700, 1150], vowel2: [400, 800] }); thud(o, t + 0.45, 90, 0.5 * v, 0.3); },
  // Overload gauge (overloadGauge.ts): a hiss of venting steam over an iron clank; a soft tick when it has cooled
  overload: (o, t, v) => { clank(o, t, 0.3 * v, 900); noise(o, t + 0.02, { type: "highpass", f: 3000, f2: 1400, dur: 0.9, vol: 0.22 * v, att: 0.03 }); tone(o, t, { type: "sawtooth", f: 160, f2: 90, dur: 0.35, vol: 0.08 * v }); },
  cooled: (o, t, v) => { clank(o, t, 0.12 * v, 2400); tone(o, t + 0.03, { type: "triangle", f: 1320, dur: 0.18, vol: 0.06 * v }); },
  dodge: (o, t, v) => { whoosh(o, t, 600, 2000, 0.2, 0.4 * v); noise(o, t + 0.15, { type: "lowpass", f: 600, dur: 0.08, vol: 0.2 * v }); },
  levelup: (o, t, v) => [0, 4, 7, 12, 16].forEach((s, i) => { tone(o, t + i * 0.08, { type: "square", f: 523 * 2 ** (s / 12), dur: 0.22, vol: 0.06 * v }); tone(o, t + i * 0.08, { type: "triangle", f: 523 * 2 ** (s / 12), dur: 0.4, vol: 0.14 * v }); }),
  heal: (o, t, v) => [0, 4, 7].forEach((s, i) => tone(o, t + i * 0.06, { type: "triangle", f: 880 * 2 ** (s / 12), dur: 0.35, vol: 0.12 * v })),
  pickup: (o, t, v) => { tone(o, t, { type: "square", f: 1320, dur: 0.07, vol: 0.06 * v }); tone(o, t + 0.06, { type: "square", f: 1980, dur: 0.14, vol: 0.06 * v }); tone(o, t + 0.06, { type: "triangle", f: 3960, dur: 0.2, vol: 0.05 * v }); },
  coins: (o, t, v) => { for (let i = 0; i < 4; i++) { const tt = t + i * 0.045 + rnd(0, 0.02); clank(o, tt, 0.12 * v, rnd(2600, 3600)); } },
  potion: (o, t, v) => { for (let i = 0; i < 3; i++) tone(o, t + i * 0.09, { f: 300 + i * 70, f2: 600 + i * 90, dur: 0.08, vol: 0.18 * v }); },
  gear: (o, t, v) => { clank(o, t, 0.2 * v, 1500); [0, 7, 12].forEach((s, i) => tone(o, t + 0.05 + i * 0.05, { type: "triangle", f: 1046 * 2 ** (s / 12), dur: 0.3, vol: 0.08 * v })); },
  lootRare: (o, t, v) => [0, 7, 12].forEach((s, i) => bell(o, t + i * 0.07, 784 * 2 ** (s / 12), 1.1, 0.09 * v)),
  lootLegendary: (o, t, v) => { thud(o, t, 70, 0.4 * v, 0.3); [0, 4, 7, 12, 16, 19].forEach((s, i) => bell(o, t + 0.05 + i * 0.07, 523 * 2 ** (s / 12), 1.8, 0.1 * v)); },
  // a Mawdeep portcullis winding up (chain clatter) or dropping (clatter, then a heavy thud)
  gate: (o, t, v, down) => { for (let i = 0; i < 7; i++) noise(o, t + i * 0.07, { type: "bandpass", f: 1800 + (i % 3) * 400, q: 6, dur: 0.05, vol: 0.09 * v, att: 0.003 }); tone(o, t, { type: "sawtooth", f: 70, f2: 55, dur: 0.5, vol: 0.05 * v, att: 0.05 }); if (down) thud(o, t + 0.55, 110, 0.4 * v, 0.16); },
  chest: (o, t, v) => { tone(o, t, { type: "sawtooth", f: 95, f2: 140, dur: 0.45, vol: 0.12 * v, vib: 12, vibHz: 18, att: 0.05 }); noise(o, t, { type: "bandpass", f: 700, q: 4, dur: 0.4, vol: 0.12 * v, att: 0.1 }); thud(o, t + 0.45, 140, 0.3 * v, 0.12); },
  shrine: (o, t, v) => { [0, 7, 12, 19].forEach((s, i) => bell(o, t + i * 0.12, 392 * 2 ** (s / 12), 2.2, 0.12 * v)); },
  portalTravel: (o, t, v) => { tone(o, t, { f: 120, f2: 900, dur: 0.9, vol: 0.2 * v, att: 0.3, vib: 20, vibHz: 9 }); whoosh(o, t, 200, 3000, 0.9, 0.4 * v); bell(o, t + 0.8, 784, 1.2, 0.12 * v); },
  portalWake: (o, t, v) => { [0, 5, 7, 12].forEach((s) => tone(o, t, { type: "triangle", f: 220 * 2 ** (s / 12), dur: 2, vol: 0.09 * v, att: 0.4, vib: 3 })); bell(o, t + 0.3, 880, 1.5, 0.1 * v); },
  step: (o, t, v, kind = "grass") => {
    if (kind === "wood") { tone(o, t, { type: "triangle", f: rnd(180, 230), f2: 120, dur: 0.07, vol: 0.12 * v }); noise(o, t, { type: "bandpass", f: 900, q: 3, dur: 0.04, vol: 0.1 * v }); }
    else if (kind === "stone") noise(o, t, { type: "bandpass", f: rnd(1800, 2600), q: 2, dur: 0.035, vol: 0.12 * v });
    else if (kind === "water") noise(o, t, { type: "bandpass", f: rnd(700, 1100), f2: 2400, q: 1.5, dur: 0.12, vol: 0.15 * v });
    else if (kind === "sand") noise(o, t, { type: "highpass", f: 2500, dur: 0.08, vol: 0.07 * v, att: 0.02 });
    else noise(o, t, { type: "lowpass", f: rnd(1200, 1800), dur: 0.07, vol: 0.1 * v, att: 0.01 });
  },
  stomp: (o, t, v) => thud(o, t, 55, 0.5 * v, 0.25),

  // ---- shots and impacts
  shotBow: (o, t, v) => { tone(o, t, { type: "triangle", f: rnd(200, 240), f2: 160, dur: 0.12, vol: 0.25 * v }); whoosh(o, t + 0.01, 2500, 4500, 0.12, 0.2 * v); },
  shotThrow: (o, t, v) => whoosh(o, t, 1500, 3500, 0.15, 0.3 * v),
  shotFire: (o, t, v) => fireRoar(o, t, 0.3, 0.35 * v),
  shotMagic: (o, t, v) => tone(o, t, { type: "triangle", f: 700, f2: 1500, dur: 0.22, vol: 0.18 * v, vib: 60, vibHz: 20 }),
  shotShadow: (o, t, v) => { tone(o, t, { type: "sawtooth", f: 220, f2: 110, dur: 0.3, vol: 0.12 * v, detune: 20 }); whoosh(o, t, 500, 200, 0.3, 0.3 * v); },
  shotSlime: (o, t, v) => tone(o, t, { f: 220, f2: 600, dur: 0.12, vol: 0.3 * v, vib: 50, vibHz: 25 }),
  shotStone: (o, t, v) => whoosh(o, t, 800, 1600, 0.18, 0.3 * v),
  shotBone: (o, t, v) => { whoosh(o, t, 400, 1200, 0.3, 0.5 * v); rattle(o, t, 4, 0.2, 0.5 * v); },
  boomFire: (o, t, v) => { thud(o, t, 90, 0.6 * v, 0.35); fireRoar(o, t, 0.4, 0.4 * v); },
  boomThunk: (o, t, v) => { noise(o, t, { type: "bandpass", f: 1200, q: 3, dur: 0.05, vol: 0.3 * v }); tone(o, t, { type: "triangle", f: 300, f2: 180, dur: 0.06, vol: 0.2 * v }); },
  boomMagic: (o, t, v) => { tone(o, t, { f: 1500, f2: 400, dur: 0.18, vol: 0.2 * v }); noise(o, t, { type: "highpass", f: 3000, dur: 0.12, vol: 0.2 * v }); },
  boomShadow: (o, t, v) => { tone(o, t, { type: "sawtooth", f: 140, f2: 50, dur: 0.35, vol: 0.18 * v }); noise(o, t, { type: "lowpass", f: 700, dur: 0.3, vol: 0.3 * v }); },
  boomSlime: (o, t, v) => squelch(o, t, 1.3, 0.4 * v, 0.14),

  // ---- elemental reactions (client/src/elemFx.ts): one short, quiet chord per reaction, its colour in the timbre
  react: (o, t, v, id) => {
    if (id === "fracture") { clank(o, t, 0.22 * v, 2600); zap(o, t + 0.02, 0.18 * v, 0.12); }
    else if (id === "toxic") { squelch(o, t, 0.9, 0.3 * v, 0.16); noise(o, t + 0.03, { type: "lowpass", f: 900, dur: 0.25, vol: 0.18 * v }); }
    else if (id === "steam") noise(o, t, { type: "highpass", f: 2500, f2: 1200, dur: 0.45, vol: 0.14 * v, att: 0.02 });
    else if (id === "corrode") { noise(o, t, { type: "bandpass", f: 1800, q: 5, dur: 0.3, vol: 0.12 * v }); tone(o, t, { type: "triangle", f: 420, f2: 260, dur: 0.25, vol: 0.06 * v }); }
    else [0, 7].forEach((s, i) => bell(o, t + i * 0.07, 660 * 2 ** (s / 12), 0.9, 0.08 * v)); // purify
  },

  // ---- skills (server "sfx" events)
  cast: (o, t, v, style) => styleChime(o, t, style, 0.45 * v, 0.8),
  fizzle: (o, t, v) => tone(o, t, { type: "square", f: 300, f2: 90, dur: 0.25, vol: 0.06 * v }),
  area: (o, t, v, a) => {
    const look = a?.look, style = a?.style ?? "steel", big = 1 + (a?.tier ?? 0) * 0.25;
    if (look === "slam" || look === "meteor" || look === "pillar" || look === "spikes" || look === "sword") { thud(o, t, look === "meteor" ? 60 : 85, 0.65 * v * big, 0.35 * big); noise(o, t, { type: "lowpass", f: 400, dur: 0.5 * big, vol: 0.35 * v }); }
    else if (look === "slash") whoosh(o, t, 700, 2800, 0.18, 0.45 * v);
    else if (look === "rain") for (let i = 0; i < 8; i++) noise(o, t + i * 0.05 + rnd(0, 0.03), { type: "bandpass", f: rnd(1500, 3000), q: 3, dur: 0.04, vol: 0.18 * v });
    else if (look === "bolt") { zap(o, t, 0.5 * v, 0.2); thud(o, t + 0.03, 70, 0.5 * v, 0.6); }
    else whoosh(o, t, 300, 1600, 0.3, 0.4 * v);
    styleChime(o, t + 0.02, style, 0.3 * v, big);
  },
  // Exsanguinate's ritual: a low pulse that climbs and beats faster as the blood rises (the area sound lands at its end)
  bloodRite: (o, t, v) => {
    tone(o, t, { type: "sawtooth", f: 55, f2: 150, dur: 0.72, vol: 0.12 * v, att: 0.3, vib: 8, vibHz: 6 });
    noise(o, t, { type: "lowpass", f: 250, f2: 1200, dur: 0.72, vol: 0.22 * v, att: 0.4 });
    for (let i = 0; i < 4; i++) thud(o, t + [0, 0.28, 0.48, 0.62][i], 70 + i * 10, (0.25 + i * 0.08) * v, 0.12);
  },
  cry: (o, t, v, pitch = 1) => voice(o, t, { f: 140 * pitch, f2: 120 * pitch, dur: 0.6, vol: 0.4 * v, vowel: [600, 1000], vowel2: [750, 1200], att: 0.04, rough: 0.05 }),
  buff: (o, t, v, style) => { tone(o, t, { type: "triangle", f: 400, f2: 1200, dur: 0.4, vol: 0.12 * v }); styleChime(o, t + 0.1, style, 0.2 * v, 0.7); },
  counter: (o, t, v) => clank(o, t, 0.35 * v, 1700),
  countered: (o, t, v) => { clank(o, t, 0.35 * v, 1200); thud(o, t, 120, 0.35 * v); },
  chain: (o, t, v) => { zap(o, t, 0.4 * v, 0.3); zap(o, t + 0.07, 0.3 * v, 0.2); },
  zap: (o, t, v) => zap(o, t, 0.35 * v, 0.2),
  turret: (o, t, v) => { tone(o, t, { type: "square", f: 200, dur: 0.05, vol: 0.08 * v }); noise(o, t + 0.05, { type: "bandpass", f: 1500, q: 4, dur: 0.05, vol: 0.2 * v }); },
  enchanthit: (o, t, v) => fireRoar(o, t, 0.18, 0.25 * v),
  thorns: (o, t, v) => rattle(o, t, 3, 0.06, 0.2 * v, 3500),

  // ---- the Summoner's Void (Void Lord rework): kept low and short, they come often
  voidPortal: (o, t, v) => { tone(o, t, { f: 170, f2: 340, dur: 0.12, vol: 0.12 * v }); noise(o, t, { type: "bandpass", f: 900, f2: 1600, q: 2, dur: 0.1, vol: 0.12 * v }); },
  voidOpen: (o, t, v, big = 1) => {
    tone(o, t, { type: "sawtooth", f: 55, f2: 38, dur: 0.9 * big, vol: 0.1 * v, att: 0.25, detune: 12 });
    tone(o, t, { f: 110, f2: 70, dur: 0.8 * big, vol: 0.14 * v, att: 0.2, vib: 4, vibHz: 3 });
    noise(o, t, { type: "lowpass", f: 900, f2: 200, dur: 0.8 * big, vol: 0.25 * v, att: 0.15 });
  },
  voidClose: (o, t, v) => { tone(o, t, { type: "sawtooth", f: 220, f2: 45, dur: 0.3, vol: 0.12 * v }); thud(o, t + 0.24, 55, 0.45 * v, 0.25); },
  voidGulp: (o, t, v) => { tone(o, t, { f: 320, f2: 80, dur: 0.16, vol: 0.2 * v }); noise(o, t, { type: "lowpass", f: 500, dur: 0.12, vol: 0.18 * v }); },
  voidEat: (o, t, v) => tone(o, t, { f: 1300, f2: 280, dur: 0.07, vol: 0.08 * v }),
  voidSpit: (o, t, v) => { tone(o, t, { f: 120, f2: 260, dur: 0.09, vol: 0.18 * v }); noise(o, t, { type: "bandpass", f: 700, q: 1.5, dur: 0.08, vol: 0.15 * v }); },
  voidSlip: (o, t, v) => { whoosh(o, t, 1400, 200, 0.4, 0.35 * v); [0, 3, 7].forEach((s, i) => tone(o, t + i * 0.04, { type: "triangle", f: 880 * 2 ** (s / 12), f2: 440 * 2 ** (s / 12), dur: 0.3, vol: 0.06 * v })); },
  voidArsenal: (o, t, v) => { clank(o, t, 0.25 * v, 2200); clank(o, t + 0.09, 0.2 * v, 1700); styleChime(o, t + 0.05, "arcane", 0.3 * v, 1.2); },
  voidLance: (o, t, v) => { whoosh(o, t, 2400, 900, 0.16, 0.3 * v); tone(o, t, { type: "triangle", f: 1600, f2: 1100, dur: 0.12, vol: 0.05 * v }); },
  wispCall: (o, t, v) => [0, 4, 7].forEach((s, i) => bell(o, t + i * 0.06, 1046 * 2 ** (s / 12), 0.35, 0.06 * v)),
  wispEnd: (o, t, v, style = "arcane") => { tone(o, t, { f: 900, f2: 300, dur: 0.12, vol: 0.08 * v }); styleChime(o, t + 0.02, style, 0.22 * v, 0.6); },
  golemNova: (o, t, v) => { fireRoar(o, t, 0.3, 0.3 * v); thud(o, t, 80, 0.25 * v, 0.2); },
  golemCrumble: (o, t, v) => { thud(o, t, 65, 0.5 * v, 0.3); rattle(o, t + 0.05, 9, 0.35, 0.35 * v, 900); },
  voidReturn: (o, t, v) => tone(o, t, { f: 520, f2: 940, dur: 0.16, vol: 0.06 * v }),
  pageTurn: (o, t, v, style = "arcane") => { noise(o, t, { type: "bandpass", f: 2600, q: 1.2, dur: 0.06, vol: 0.15 * v }); noise(o, t + 0.07, { type: "bandpass", f: 2000, q: 1.2, dur: 0.05, vol: 0.1 * v }); styleChime(o, t + 0.1, style, 0.15 * v, 0.5); },

  // ---- blobs
  blobHurt: (o, t, v, pitch = 1) => squelch(o, t, pitch * rnd(0.85, 1.15), 0.45 * v),
  blobDie: (o, t, v, pitch = 1) => { squelch(o, t, pitch * 0.8, 0.6 * v, 0.3); for (let i = 0; i < 3; i++) tone(o, t + 0.1 + i * 0.06, { f: rnd(300, 700) * pitch, f2: 120, dur: 0.07, vol: 0.15 * v }); },
  blobLunge: (o, t, v, pitch = 1) => { tone(o, t, { f: 180 * pitch, f2: 420 * pitch, dur: 0.15, vol: 0.3 * v, vib: 30, vibHz: 22 }); noise(o, t, { type: "lowpass", f: 600, dur: 0.15, vol: 0.2 * v }); },
  blobCall: (o, t, v, pitch = 1) => {
    // A wobbly rising "bloo-oo-oop!" twice
    for (let i = 0; i < 2; i++) tone(o, t + i * 0.28, { f: 160 * pitch, f2: 520 * pitch, dur: 0.26, vol: 0.35 * v, vib: 45 * pitch, vibHz: 14, att: 0.03 });
    noise(o, t, { type: "lowpass", f: 500, dur: 0.5, vol: 0.12 * v });
  },
  blobMerge: (o, t, v) => { tone(o, t, { f: 500, f2: 70, dur: 0.6, vol: 0.4 * v, vib: 35, vibHz: 18, att: 0.02 }); noise(o, t, { type: "lowpass", f: 1400, f2: 150, q: 8, dur: 0.6, vol: 0.5 * v }); squelch(o, t + 0.45, 0.6, 0.4 * v, 0.25); },
  blobGurgle: (o, t, v, pitch = 1) => { for (let i = 0; i < 3; i++) tone(o, t + i * rnd(0.06, 0.1), { f: rnd(150, 300) * pitch, f2: rnd(80, 140) * pitch, dur: 0.08, vol: 0.12 * v }); },
  blobHeal: (o, t, v) => { tone(o, t, { f: 300, f2: 900, dur: 0.3, vol: 0.15 * v, vib: 30, vibHz: 12 }); },
  brood: (o, t, v) => { squelch(o, t, 1.6, 0.35 * v, 0.12); tone(o, t + 0.08, { f: 800, f2: 1400, dur: 0.06, vol: 0.15 * v }); },
  motherInflate: (o, t, v, ms = 600) => { tone(o, t, { f: 80, f2: 260, dur: ms / 1000, vol: 0.35 * v, att: ms / 2000, vib: 20, vibHz: 10 }); noise(o, t, { type: "lowpass", f: 300, f2: 900, dur: ms / 1000, vol: 0.3 * v, att: ms / 2000 }); },
  motherSlam: (o, t, v, slam) => { thud(o, t, slam ? 50 : 80, (slam ? 0.9 : 0.6) * v, 0.45); squelch(o, t, 0.5, 0.6 * v, 0.4); },

  // ---- skeletons and undead
  skelHurt: (o, t, v) => rattle(o, t, 5, 0.12, 0.8 * v),
  skelSwing: (o, t, v) => { whoosh(o, t, 600, 1800, 0.18, 0.4 * v); rattle(o, t, 3, 0.1, 0.45 * v); },
  skelDie: (o, t, v) => { rattle(o, t, 14, 0.45, 0.8 * v, 2200); thud(o, t + 0.3, 140, 0.25 * v, 0.1); },
  skelIdle: (o, t, v) => rattle(o, t, 3, 0.25, 0.3 * v, 2000),
  boneBreak: (o, t, v) => { noise(o, t, { type: "highpass", f: 1800, dur: 0.06, vol: 0.6 * v }); tone(o, t, { type: "square", f: 900, f2: 300, dur: 0.05, vol: 0.12 * v }); rattle(o, t + 0.04, 8, 0.3, 0.3 * v); },
  crawl: (o, t, v) => noise(o, t, { type: "bandpass", f: 600, f2: 400, q: 2, dur: 0.35, vol: 0.15 * v, att: 0.1 }),
  necroWind: (o, t, v, ms = 1000) => {
    const d = ms / 1000;
    [0, 1, 6].forEach((s, i) => tone(o, t, { type: "sawtooth", f: 73 * 2 ** (s / 12), f2: 110 * 2 ** (s / 12), dur: d + 0.2, vol: 0.07 * v, att: d * 0.6, detune: i * 9 }));
    voice(o, t, { f: 90, dur: d, vol: 0.18 * v, vowel: [400, 800], vowel2: [300, 700], att: d * 0.3 });
  },
  necroHit: (o, t, v) => { thud(o, t, 60, 0.6 * v, 0.4); whoosh(o, t, 300, 80, 0.5, 0.4 * v); },
  raise: (o, t, v) => { noise(o, t, { type: "lowpass", f: 250, dur: 0.6, vol: 0.4 * v, att: 0.1 }); rattle(o, t + 0.2, 8, 0.4, 0.25 * v); },
  ritualCall: (o, t, v, ms = 3000) => {
    const d = ms / 1000 + 0.6;
    // A low chant a fifth apart, swelling, with a slow beat
    voice(o, t, { f: 65, dur: d, vol: 0.25 * v, vowel: [500, 850], vowel2: [350, 700], att: d * 0.4 });
    voice(o, t + 0.05, { f: 98, dur: d, vol: 0.18 * v, vowel: [450, 800], vowel2: [380, 650], att: d * 0.4 });
    for (let i = 0; i < Math.floor(d / 0.7); i++) thud(o, t + i * 0.7, 55, 0.25 * v, 0.3);
  },
  ritual: (o, t, v) => { rattle(o, t, 24, 1.2, 0.35 * v, 2400); bell(o, t + 1.0, 110, 3, 0.25 * v); tone(o, t + 1.0, { type: "sawtooth", f: 55, dur: 2.5, vol: 0.12 * v, att: 0.3 }); },
  demonRise: (o, t, v) => {
    thud(o, t, 40, 0.9 * v, 1.0);
    noise(o, t, { type: "lowpass", f: 200, f2: 600, dur: 1.4, vol: 0.6 * v, att: 0.2 });
    voice(o, t + 0.25, { f: 75, f2: 45, dur: 1.6, vol: 0.55 * v, vowel: [500, 900], vowel2: [350, 700], att: 0.15, rough: 0.2 });
  },
  demonRoar: (o, t, v) => voice(o, t, { f: 85, f2: 55, dur: 1.0, vol: 0.5 * v, vowel: [550, 950], vowel2: [400, 750], att: 0.08, rough: 0.25 }),
  demonGrowl: (o, t, v) => voice(o, t, { f: 60, f2: 50, dur: 0.6, vol: 0.25 * v, vowel: [350, 700], att: 0.1, rough: 0.3 }),
  demonFire: (o, t, v) => { thud(o, t, 50, 0.8 * v, 0.6); fireRoar(o, t, 0.8, 0.6 * v); },
  boneSnap: (o, t, v) => { noise(o, t, { type: "highpass", f: 1500, dur: 0.05, vol: 0.8 * v }); noise(o, t + 0.07, { type: "highpass", f: 2200, dur: 0.04, vol: 0.6 * v }); rattle(o, t + 0.1, 6, 0.25, 0.3 * v); },
  demonHurt: (o, t, v) => { voice(o, t, { f: 70, f2: 55, dur: 0.3, vol: 0.3 * v, vowel: [450, 800], rough: 0.3, att: 0.01 }); rattle(o, t, 3, 0.08, 0.2 * v); },
  banish: (o, t, v) => { tone(o, t, { f: 60, f2: 400, dur: 0.8, vol: 0.2 * v, att: 0.6 }); whoosh(o, t, 150, 2500, 0.8, 0.4 * v); },

  // ---- bandits
  shout: (o, t, v, pitch = 1) => {
    // "HEY!" / "OI!": a sharp vowel glide
    voice(o, t, { f: 190 * pitch, f2: 160 * pitch, dur: 0.32, vol: 0.4 * v, vowel: [800, 1200], vowel2: [450, 900], att: 0.015, rough: 0.04 });
  },
  shout2: (o, t, v, pitch = 1) => {
    // two-part "TO ME!"
    voice(o, t, { f: 170 * pitch, dur: 0.16, vol: 0.38 * v, vowel: [500, 900], att: 0.01 });
    voice(o, t + 0.2, { f: 200 * pitch, f2: 150 * pitch, dur: 0.3, vol: 0.4 * v, vowel: [350, 2000], vowel2: [400, 1900], att: 0.01 });
  },
  alert: (o, t, v, pitch = 1) => voice(o, t, { f: 160 * pitch, f2: 230 * pitch, dur: 0.18, vol: 0.28 * v, vowel: [500, 1000], vowel2: [700, 1200], att: 0.01 }),
  grunt: (o, t, v, pitch = 1) => voice(o, t, { f: 120 * pitch, f2: 90 * pitch, dur: 0.2, vol: 0.3 * v, vowel: [500, 900], att: 0.01, rough: 0.06 }),
  horn: (o, t, v) => {
    // A long war horn, two blasts
    [[0, 1.0], [1.15, 1.6]].forEach(([s, d]) => {
      [1, 2, 3].forEach((m, i) => tone(o, t + s, { type: "sawtooth", f: 98 * m, f2: 92 * m, dur: d, vol: (0.26 / (1 + i)) * v, att: 0.12, vib: 1.5 * m, vibHz: 5 }));
      noise(o, t + s, { type: "bandpass", f: 500, q: 2, dur: d, vol: 0.08 * v, att: 0.1 });
    });
  },
  warcry: (o, t, v) => { voice(o, t, { f: 130, f2: 100, dur: 0.9, vol: 0.5 * v, vowel: [700, 1150], vowel2: [600, 1000], att: 0.05, rough: 0.12 }); voice(o, t + 0.05, { f: 165, f2: 125, dur: 0.85, vol: 0.3 * v, vowel: [750, 1200], att: 0.05, rough: 0.1 }); },
  volley: (o, t, v) => { for (let i = 0; i < 4; i++) R.shotBow(o, t + i * 0.07 + rnd(0, 0.03), v * 0.7); },
  bashGround: (o, t, v, big) => { thud(o, t, big ? 55 : 80, (big ? 0.8 : 0.55) * v, 0.35); noise(o, t, { type: "lowpass", f: 500, dur: 0.4, vol: 0.3 * v }); },
  windup: (o, t, v, ms = 600) => voice(o, t, { f: 110, f2: 160, dur: ms / 1000, vol: 0.25 * v, vowel: [450, 850], vowel2: [700, 1100], att: ms / 1500, rough: 0.08 }),
  leap: (o, t, v) => { R.grunt(o, t, v); whoosh(o, t, 300, 1200, 0.5, 0.35 * v); },
  dash: (o, t, v) => { noise(o, t, { type: "lowpass", f: 900, dur: 0.12, vol: 0.25 * v }); whoosh(o, t, 800, 2000, 0.15, 0.25 * v); },
  toolDrop: (o, t, v) => { clank(o, t, 0.2 * v, 900); thud(o, t + 0.05, 160, 0.2 * v, 0.1); },
  // branches shaking, a shout, the thump of the landing
  treeDrop: (o, t, v, pitch = 1) => { noise(o, t, { type: "bandpass", f: 2600, q: 0.8, dur: 0.35, vol: 0.3 * v }); R.shout(o, t + 0.05, v * 0.9, pitch); thud(o, t + 0.38, 90, 0.45 * v, 0.2); },
  ambush: (o, t, v) => { noise(o, t, { type: "lowpass", f: 700, dur: 0.25, vol: 0.4 * v }); whoosh(o, t, 400, 2000, 0.2, 0.3 * v); },
};

// ---------------------------------------------------------------------------------------------------------
// Playing

/**
 * Play a recipe at a place in the world (x, y in px; omit for "on our hero").
 * reach: hearing range multiplier (the horn carries far). minGap: ms before the same key may play again.
 */
export function play(name: string, x?: number, y?: number, vol = 1, arg?: any, o: { reach?: number; key?: string; minGap?: number; delay?: number } = {}) {
  if (!ctx || !bus || targetGain() === 0) return;
  const recipe = R[name];
  if (!recipe) return;
  const now = performance.now();
  const key = o.key ?? name;
  if (now - (lastPlay.get(key) ?? 0) < (o.minGap ?? 45)) return;
  let gain = 1, pan = 0, cutoff = 18000;
  if (x !== undefined && y !== undefined && haveListener) {
    const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy);
    const range = RANGE * (o.reach ?? 1);
    if (d > range) return;
    const k = d / range;
    gain = (1 - k) * (1 - k) * 0.9 + 0.1 * (1 - k);
    pan = Math.max(-0.75, Math.min(0.75, dx / (8 * TILE)));
    cutoff = 18000 * Math.pow(1 - k, 2) + 900;
  }
  gain *= vol;
  if (gain < 0.02) return;
  // Background bits (fire crackle, birds, steps) give way first when many sounds play at once
  if (voices >= (AMBIENT.has(name) ? MAX_VOICES / 2 : MAX_VOICES)) return;
  lastPlay.set(key, now);
  const t = ctx.currentTime + 0.005 + (o.delay ?? 0);
  const g = ctx.createGain();
  g.gain.value = gain;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = cutoff;
  const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  g.connect(lp);
  if (pn) { pn.pan.value = pan; lp.connect(pn).connect(bus); } else lp.connect(bus);
  voices++;
  try { recipe(g, t, 1, arg); } catch { /* a bad param must never break the game */ }
  window.setTimeout(() => { voices--; g.disconnect(); }, (LONG.has(name) ? 4500 : 1300) + (o.delay ?? 0) * 1000);
}

// ---------------------------------------------------------------------------------------------------------
// Environment: beds that follow the hero

interface Bed { g: GainNode; f?: BiquadFilterNode }
let wind: Bed | null = null, water: Bed | null = null, fire: Bed | null = null, hum: Bed | null = null, portalHum: Bed | null = null;
let bedTime = 0;
const FIRES: [number, number][] = [];
const BIG_FIRES = new Set<string>();

function loopNoise(type: BiquadFilterType, f: number, q: number): Bed {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); g.gain.value = 0;
  src.connect(fl).connect(g).connect(bedBus!);
  src.start();
  return { g, f: fl };
}
function loopTones(freqs: number[], type: OscillatorType, tremHz: number): Bed {
  const c = ctx!;
  const g = c.createGain(); g.gain.value = 0;
  const trem = c.createGain(); trem.gain.value = 0.7;
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = tremHz; lg.gain.value = 0.3;
  lfo.connect(lg).connect(trem.gain); lfo.start();
  freqs.forEach((f, i) => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = i * 4;
    const og = c.createGain(); og.gain.value = 1 / freqs.length;
    o.connect(og).connect(trem); o.start();
  });
  trem.connect(g).connect(bedBus!);
  return { g };
}

function makeBeds() {
  wind = loopNoise("lowpass", 380, 0.5);
  water = loopNoise("lowpass", 650, 0.5);
  fire = loopNoise("lowpass", 350, 0.7);
  hum = loopTones([196, 293.7, 392.5], "sine", 0.25);
  portalHum = loopTones([65.4, 130.8, 98.2], "triangle", 1.3);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const o = OBJECTS[y][x];
    if (o === T.CAMPFIRE || o === T.BONFIRE) {
      const k = `${x >> 1},${y >> 1}`; // a 2x2 bonfire counts once
      if (o === T.BONFIRE) { if (BIG_FIRES.has(k)) continue; BIG_FIRES.add(k); }
      FIRES.push([(x + 0.5) * TILE, (y + 0.5) * TILE]);
    }
  }
}

/** Level of the background one-shots (fire crackle, birds, crickets, owl, chime). */
const ENV = 0.75;

const set = (b: Bed | null, v: number, tc = 0.6) => { if (b && ctx) b.g.gain.setTargetAtTime(v, ctx.currentTime, tc); };

/** Look around the hero: water, trees, open ground, fires, shrine, portals. */
function envTick() {
  if (!ctx || !haveListener || targetGain() === 0) return;
  bedTime += 0.25;
  const tx = Math.floor(lx / TILE), ty = Math.floor(ly / TILE);
  let waterN = 0, treeN = 0, solidN = 0, n = 0;
  for (let y = ty - 7; y <= ty + 7; y++) for (let x = tx - 7; x <= tx + 7; x++) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
    n++;
    const w = 1 / (1 + Math.hypot(x - tx, y - ty) * 0.4);
    if (GROUND[y][x] === T.WATER) waterN += w;
    const o = OBJECTS[y][x];
    if (o === T.TREE || o === T.PINE || o === T.BUSH) treeN++;
    else if (o >= T.PALISADE && o <= T.DOOR) solidN++;
  }
  const area = areaAt(lx, ly);
  const town = TOWNS.includes(area);
  const { dark } = dayPhase(dayTime(Date.now()));

  // Water: a small stream, a soft low murmur (no hiss)
  const wv = Math.min(0.07, waterN * 0.008) * (0.85 + 0.15 * Math.sin(bedTime * 0.5));
  set(water, wv, 1.2);
  if (water?.f) water.f.frequency.setTargetAtTime(560 + 120 * Math.sin(bedTime * 0.37), ctx.currentTime, 1);
  // Wind: stronger in open land, gusting; softer between houses, a bit louder at night
  const open = 1 - Math.min(1, (treeN + solidN * 1.5) / (n * 0.35));
  // (soft and dark: a low breath that drifts, never a rushing hiss that sounds like rain)
  const gust = 0.85 + 0.15 * Math.sin(bedTime * 0.23) * Math.sin(bedTime * 0.071 + 1);
  set(wind, (0.012 + 0.028 * open) * gust * (town ? 0.5 : 1) * (1 + dark * 0.2), 2.5);
  if (wind?.f) wind.f.frequency.setTargetAtTime(300 + 120 * gust, ctx.currentTime, 1.5);
  // Fire: closest campfire / bonfire crackles
  let fd = Infinity, fx = 0, fy = 0;
  for (const [x, y] of FIRES) { const d = Math.hypot(x - lx, y - ly); if (d < fd) { fd = d; fx = x; fy = y; } }
  const fk = Math.max(0, 1 - fd / (7 * TILE));
  set(fire, 0.2 * fk * fk, 0.3);
  if (fk > 0.05 && Math.random() < 0.9) for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
    play("crackle", fx + rnd(-8, 8), fy, ENV, undefined, { key: "crackle" + i, minGap: 0, delay: Math.random() * 0.25 });
  }
  // Shrine: a soft choir hum close by
  const sd = Math.hypot(SHRINE.x - lx, SHRINE.y - ly);
  set(hum, 0.05 * Math.max(0, 1 - sd / (6 * TILE)) ** 2, 1);
  if (sd < 6 * TILE && Math.random() < 0.03) play("chime", SHRINE.x, SHRINE.y, 0.7 * ENV);
  // Portal stones: a deep hum
  let pd = Infinity;
  for (const p of PORTALS) pd = Math.min(pd, Math.hypot(p.x - lx, p.y - ly));
  set(portalHum, 0.07 * Math.max(0, 1 - pd / (5 * TILE)) ** 2, 1);
  // Birds by day near trees, crickets and an owl at night
  const leafy = Math.min(1, treeN / 25) * (town ? 0.5 : 1);
  if (dark < 0.5) {
    if (Math.random() < 0.06 + 0.2 * leafy) play("bird", lx + rnd(-260, 260), ly + rnd(-200, 200), (0.4 + 0.5 * leafy) * ENV, Math.floor(Math.random() * 4), { key: "bird", minGap: 400 });
  } else {
    if (!town && Math.random() < 0.35) play("cricket", lx + rnd(-220, 220), ly + rnd(-180, 180), 0.5 * ENV, undefined, { key: "cricket", minGap: 200 });
    if (leafy > 0.3 && Math.random() < 0.01) play("owl", lx + rnd(-300, 300), ly + rnd(-250, 250), 0.7 * ENV);
  }
}

R.crackle = (o, t, v) => {
  noise(o, t, { type: "highpass", f: rnd(1500, 4000), dur: rnd(0.01, 0.03), vol: rnd(0.08, 0.22) * v });
  if (Math.random() < 0.3) noise(o, t, { type: "lowpass", f: 400, dur: 0.08, vol: 0.15 * v });
};
R.chime = (o, t, v) => bell(o, t, [784, 988, 1175, 1568][Math.floor(Math.random() * 4)], 2.5, 0.05 * v);
R.bird = (o, t, v, kind = 0) => {
  const base = [2600, 3400, 2000, 4200][kind] * rnd(0.9, 1.1);
  const n = [3, 2, 5, 4][kind];
  for (let i = 0; i < n; i++) {
    const tt = t + i * [0.11, 0.18, 0.07, 0.09][kind];
    if (kind === 1) tone(o, tt, { f: base, f2: base * 0.7, dur: 0.15, vol: 0.05 * v });
    else tone(o, tt, { f: base * rnd(0.9, 1.1), f2: base * rnd(1.2, 1.5), dur: 0.05, vol: 0.045 * v });
  }
};
R.cricket = (o, t, v) => {
  const f = rnd(4200, 4800);
  for (let i = 0; i < 4; i++) tone(o, t + i * 0.035, { type: "square", f, dur: 0.02, vol: 0.03 * v });
};
R.owl = (o, t, v) => {
  tone(o, t, { f: 400, f2: 360, dur: 0.35, vol: 0.06 * v, att: 0.08 });
  tone(o, t + 0.5, { f: 420, f2: 340, dur: 0.6, vol: 0.06 * v, att: 0.1, vib: 6, vibHz: 7 });
};

// ---------------------------------------------------------------------------------------------------------
// Hooks for the game scene

interface Ent { sprite: { x: number; y: number }; state: any; mob?: boolean; hero?: string; top?: number }

const UNDEAD = new Set(["skeleton", "skeletonmage", "necromancer", "crawler", "sanddead"]);
const isBlob = (k: string) => k === "slime" || k === "blobling" || k.endsWith("blob");
const blobPitch = (st: any) => (st.kind === "motherblob" ? 0.55 : st.kind === "blobling" ? 1.5 : 1) / Math.sqrt(st.merged || 1);
const HERO_PITCH: Record<string, number> = { ninja: 1.1, wizard: 0.95, knight: 0.85, archer: 1.15, barbarian: 0.75, vampire: 0.9, summoner: 1.0 };
const hpitch = (st: any) => (HERO_PITCH[st?.cls] ?? 1) * (0.97 + (st?.name?.length ?? 0) % 5 * 0.015);

/** Bandit voices differ a little per bandit (seeded by id). */
function idPitch(id: string, base = 1) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return base * (0.85 + (h % 100) / 330);
}

/**
 * Listen to the room's messages (extra handlers next to TownScene's own) and to new shots.
 * `me()` gives our session id, `ents` is TownScene's entity map (positions and synced state).
 */
export function bindSfx(room: any, me: () => string, ents: Map<string, Ent>) {
  const at = (id: string) => ents.get(id);
  const P = (name: string, id: string | undefined, vol = 1, arg?: any, o?: Parameters<typeof play>[5]) => {
    const e = id ? at(id) : undefined;
    if (id && !e) return;
    if (id === me()) play(name, undefined, undefined, vol, arg, o);
    else play(name, e?.sprite.x, e?.sprite.y, vol, arg, o);
  };
  const on = (type: string, cb: (m: any) => void) => room.onMessage(type, (m: any) => { try { cb(m ?? {}); } catch { /* never break the game */ } });

  // ---- combat
  on("swing", ({ id, step, variant }) => {
    const e = at(id);
    if (!e) return;
    const k = e.state.kind;
    if (e.mob) {
      if (isBlob(k)) P("blobLunge", id, 0.8, blobPitch(e.state), { key: "ml" + id });
      else if (UNDEAD.has(k)) P(k === "skeletonmage" || k === "necromancer" ? "shotMagic" : "skelSwing", id, 0.8);
      else if (k === "bandit") { P("swing", id, 0.8, e.state.weapon === "brute"); if (Math.random() < 0.3) P("grunt", id, 0.7, idPitch(id)); }
      else if (k === "demon") P("demonGrowl", id, 0.7);
      else if (k === "veiled") P("shotMagic", id, 0.7);
      else P("swing", id, 0.7);
      return;
    }
    P("swing", id, id === me() ? 0.8 : 0.6, step === 2 || e.state.cls === "barbarian" || e.state.cls === "knight", { key: "sw" + id });
    if (step === 2 && Math.random() < 0.5) P("heroHurt", id, 0.5, hpitch(e.state) * 1.15, { key: "kiai" + id });
    void variant;
  });
  on("rangedshot", ({ id }) => {
    const e = at(id);
    if (!e) return;
    P(e.state.cls === "wizard" ? "shotFire" : e.state.cls === "ninja" ? "shotThrow" : "shotBow", id, 0.8);
  });
  on("hit", ({ id, blocked, crit }) => {
    const e = at(id);
    if (!e) return;
    const k = e.state.kind;
    const key = { key: "hit" + id, minGap: 70 };
    P(blocked ? "hitBlocked" : crit ? "crit" : "hitFlesh", id, e.mob ? 0.6 : 0.8, undefined, key);
    if (e.mob) {
      if (isBlob(k)) P("blobHurt", id, 0.9, blobPitch(e.state), { key: "bh" + id, minGap: 120 });
      else if (k === "demon") P("demonHurt", id, 1, undefined, { key: "dh" + id, minGap: 300 });
      else if (UNDEAD.has(k)) P("skelHurt", id, 1, undefined, { key: "sh" + id, minGap: 100 });
      else if (k === "bandit" && Math.random() < 0.6) P("grunt", id, 0.8, idPitch(id, 1.1), { key: "bg" + id, minGap: 250 });
    } else if (!blocked) P("heroHurt", id, id === me() ? 1 : 0.7, hpitch(e.state), { key: "hh" + id, minGap: 250 });
  });
  on("dodge", ({ id }) => P("dodge", id));
  on("levelup", ({ id }) => P("levelup", id, id === me() ? 1 : 0.5));
  on("heal", ({ id }) => P("potion", id, 0.8));
  on("died", () => play("heroDie"));
  on("pickup", ({ kind }) => play(kind === "gold" ? "coins" : kind === "gear" ? "gear" : "pickup"));
  on("chestopen", () => play("chest"));
  on("shrine", ({ boon, by }) => { if (boon) P("shrine", by); });
  on("travel", ({ id }) => P("portalTravel", id));
  on("portals", ({ woke }) => { if (woke) play("portalWake"); });
  on("boom", ({ x, y, kind }) => {
    const name = kind === "fireball" || kind === "sunbolt" ? "boomFire" : kind === "arrow" || kind === "knife" || kind === "bolt" || kind === "stone" ? "boomThunk"
      : kind === "magicbolt" ? "boomMagic" : kind === "shadowbolt" ? "boomShadow" : kind === "slimeball" ? "boomSlime" : kind === "skelthrow" ? "boneBreak" : "boomThunk";
    play(name, x, y, 0.8, undefined, { key: "boom" + name, minGap: 40 });
  });
  on("sfx", (ev) => {
    const s = skillById(ev.s);
    const style = s?.style ?? "steel";
    const x = ev.x ?? ev.x1, y = ev.y ?? ev.y1;
    const pos = (name: string, vol = 1, arg?: any, o?: Parameters<typeof play>[5]) =>
      ev.id === me() ? play(name, undefined, undefined, vol, arg, o) : x !== undefined ? play(name, x, y, vol, arg, o) : P(name, ev.id, vol, arg, o);
    switch (ev.ev) {
      case "cast": pos("cast", 1, style); if (ev.s === "su_blackhole" || ev.s === "su_horizon") pos("voidOpen", 1, ev.s === "su_horizon" ? 1.5 : 1); break;
      case "fizzle": pos("fizzle"); break;
      case "move": pos(ev.kind === "blink" ? "zap" : "dodge", 0.7, undefined, { key: "mv" + ev.id, minGap: 80 }); break;
      case "area": {
        // A falling blade / meteor / arrow rain sounds when it lands, with its damage
        const boom = () => play("area", ev.x, ev.y, ev.i ? 0.6 : 1, { look: ev.look, style, tier: s?.row ?? 0 }, { key: "area" + ev.id, minGap: 60 });
        const land = impactMs(ev.look, ev.r ?? 0);
        if (ev.look === "bloodrite") pos("bloodRite");
        if (land > 0) setTimeout(boom, land); else boom();
        break;
      }
      case "cry": pos("cry", 1, hpitch(at(ev.id)?.state)); break;
      case "buff": pos("buff", 0.8, style); break;
      case "counter": pos("counter"); break;
      case "countered": pos("countered"); break;
      case "chain": { const p = ev.pts?.[0]; play("chain", p?.[0] ?? p?.x, p?.[1] ?? p?.y); break; }
      case "zap": play("zap", ev.x2, ev.y2, 0.7, undefined, { key: "zap", minGap: 90 }); break;
      case "turret": pos("turret"); break;
      case "enchanthit": pos("enchanthit", 0.8, undefined, { key: "eh", minGap: 80 }); break;
      case "thorns": pos("thorns", 0.8, undefined, { key: "th", minGap: 80 }); break;
      // the Summoner's Void (client/src/skillfx.ts draws them)
      case "portal": pos("voidPortal", 0.8, undefined, { key: "vp" + ev.id, minGap: 120 }); break;
      case "holeclose": pos("voidClose"); break;
      case "swallow": pos("voidGulp", 0.8, undefined, { key: "vg", minGap: 90 }); break;
      case "eatshot": pos("voidEat", 0.7, undefined, { key: "ve", minGap: 70 }); break;
      case "voidhop": play("voidSpit", ev.x, ev.y, 0.7, undefined, { key: "vh", minGap: 90 }); break;
      case "voidslip": pos("voidSlip"); break;
      case "arsenal": pos("voidArsenal"); break;
      case "wisps": pos("wispCall", 0.8); break;
      case "wispend": pos("wispEnd", 0.7, ({ fire: "fire", cold: "frost", poison: "poison", shock: "lightning" } as Record<string, string>)[ev.el] ?? "arcane", { key: "we", minGap: 80 }); break;
      case "golemfire": pos("golemNova", 0.8, undefined, { key: "gn" + ev.id, minGap: 200 }); break;
      case "golemdeath": case "colossussplit": pos("golemCrumble"); break;
      case "voidreturn": if (ev.id === me()) pos("voidReturn", 0.8, undefined, { key: "vr", minGap: 400 }); break;
      case "grimoire": if (ev.id === me()) pos("pageTurn", 1, ({ fire: "fire", cold: "frost", poison: "poison", shock: "lightning" } as Record<string, string>)[ev.el] ?? "arcane"); break;
    }
  });

  // ---- blobs
  on("blobcall", ({ id }) => { const e = at(id); P("blobCall", id, 1, e ? blobPitch(e.state) : 1); });
  on("blobmerge", ({ x, y }) => play("blobMerge", x, y));
  on("blobcharge", ({ id }) => P("blobLunge", id, 1, 0.8));
  on("blobheal", ({ to }) => P("blobHeal", to, 0.7, undefined, { key: "bheal", minGap: 300 }));
  on("brood", ({ id }) => P("brood", id));
  on("mbwind", ({ id, ms }) => P("motherInflate", id, 1, ms));
  on("mbhit", ({ kind, x, y }) => play("motherSlam", x, y, 1, kind === "slam"));

  // ---- undead
  on("bonebreak", ({ x, y }) => play("boneBreak", x, y));
  on("necrowind", ({ id, ms }) => P("necroWind", id, 1, ms));
  on("necrohit", ({ x, y }) => play("necroHit", x, y));
  on("necroraise", ({ pts }) => { const p = pts?.[0]; if (p) play("raise", p[0], p[1]); });
  on("ritualcall", ({ x, y, ms }) => play("ritualCall", x, y, 1, ms, { reach: 1.5 }));
  on("ritual", (m) => { const x = m.x ?? m.cx, y = m.y ?? m.cy; play("ritual", x, y, 1, undefined, { reach: 1.5 }); });
  on("demonrise", ({ x, y }) => play("demonRise", x, y, 1, undefined, { reach: 2 }));
  on("demonwind", ({ id }) => P("demonRoar", id, 1, undefined, { reach: 1.5 }));
  on("demonfire", ({ x, y }) => play("demonFire", x, y));
  on("demonrip", (m) => { P("demonGrowl", m.id, 0.8); P("boneSnap", m.id, 1, undefined, { delay: Math.min(2, ((m.ms ?? 700) / 1000) * 0.55) }); });
  on("demonharvest", ({ id }) => P("boneSnap", id, 0.8));
  on("demongrab", ({ id }) => { P("demonGrowl", id); P("shotBone", id, 1, undefined, { delay: 0.15 }); });
  on("banish", ({ x, y }) => play("banish", x, y));

  // ---- bandits (Redfang Hollow)
  on("horn", ({ id, x, y }) => { const e = at(id); play("horn", e?.sprite.x ?? x, e?.sprite.y ?? y, 1, undefined, { reach: 2.2 }); });
  on("alert", ({ ids }) => (ids as string[] ?? []).slice(0, 3).forEach((id, i) => P("alert", id, 0.8, idPitch(id), { key: "al" + id, delay: i * 0.12 })));
  on("bshout", ({ id }) => P(Math.random() < 0.5 ? "shout" : "shout2", id, 1, idPitch(id), { reach: 1.3 }));
  on("bdash", ({ id }) => P("dash", id));
  on("volley", ({ id }) => P("volley", id));
  on("bwind", ({ id, ms, kind }) => P(kind === "leap" ? "leap" : "windup", id, 1, ms));
  on("bhit", ({ kind, x, y }) => play("bashGround", x, y, 1, kind === "leap"));
  on("warcry", ({ id }) => P("warcry", id, 1, undefined, { reach: 1.5 }));
  on("reinforce", ({ id }) => P("shout2", id, 1, idPitch(id, 0.85), { reach: 1.3 }));
  on("workdrop", ({ id }) => { P("toolDrop", id, 0.8, undefined, { key: "wd" + id }); P("alert", id, 0.7, idPitch(id, 0.9), { delay: 0.1 }); });
  on("ambush", ({ x, y }) => play("ambush", x, y));
  on("bambush", ({ id, x0, y0 }) => play("treeDrop", x0, y0, 1, idPitch(id)));

  // ---- shots flying (monster and hero projectiles): the launch sound for monsters' shots
  const shots = room.state?.projectiles && (getStateCallbacks(room) as (v: any) => any)(room.state).projectiles;
  shots?.onAdd?.((s: any) => {
    const k = s.kind as string;
    const mob = !!s.mobName;
    if (k === "voidlance") { play("voidLance", s.x, s.y, 0.7, undefined, { key: "vl", minGap: 80 }); return; } // the Arsenal's lance flies off on its own
    if (!mob && k !== "skelthrow") return; // our heroes' shots already sound on "rangedshot" / skill casts
    const name = k === "slimeball" ? "shotSlime" : k === "magicbolt" ? "shotMagic" : k === "shadowbolt" ? "shotShadow" : k === "arrow" || k === "bolt" ? "shotBow"
      : k === "knife" ? "shotThrow" : k === "stone" ? "shotStone" : k === "skelthrow" ? "shotBone" : k === "fireball" || k === "sunbolt" ? "shotFire" : "shotThrow";
    play(name, s.x, s.y, 0.7, undefined, { key: "shot" + name, minGap: 60 });
  });
}

// Per-entity memory for deaths, footsteps and idle noises
const wasDead = new Map<string, boolean>();
const stepAcc = new Map<string, { x: number; y: number; d: number }>();
const nextIdle = new Map<string, number>();

function groundKind(x: number, y: number): string {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return "grass";
  const g = GROUND[ty][tx];
  if (g === T.BRIDGE || OBJECTS[ty][tx] === T.FLOOR) return "wood";
  if (g === T.COBBLE) return "stone";
  if (g === T.WATER) return "water";
  if (g === T.SAND) return "sand";
  return "grass";
}

/** Once per frame from TownScene.update: our hero's place (the ears), deaths, footsteps, idle monster noises. */
export function sfxFrame(meId: string, ents: Map<string, Ent>) {
  const meE = ents.get(meId);
  if (meE) { lx = meE.sprite.x; ly = meE.sprite.y; haveListener = true; }
  if (!ctx || targetGain() === 0 || !haveListener) return;
  const now = performance.now();
  for (const [id, e] of ents) {
    const st = e.state;
    if (!st) continue;
    const dx = e.sprite.x - lx, dy = e.sprite.y - ly;
    if (Math.abs(dx) > RANGE || Math.abs(dy) > RANGE) { wasDead.set(id, !!st.dead); stepAcc.delete(id); continue; }
    // Deaths
    const dead = !!st.dead;
    if (dead && wasDead.get(id) === false) {
      if (e.mob) {
        const k = st.kind as string;
        if (isBlob(k)) play("blobDie", e.sprite.x, e.sprite.y, 1, blobPitch(st));
        else if (k === "demon") { play("demonRoar", e.sprite.x, e.sprite.y, 1, undefined, { reach: 2 }); play("skelDie", e.sprite.x, e.sprite.y, 1, undefined, { delay: 0.6 }); }
        else if (UNDEAD.has(k)) play("skelDie", e.sprite.x, e.sprite.y);
        else if (k === "bandit") play("heroDie", e.sprite.x, e.sprite.y, 0.7);
      } else if (id !== meId) play("heroDie", e.sprite.x, e.sprite.y, 0.6);
    }
    wasDead.set(id, dead);
    if (dead) continue;
    // Heavy steps: the Bone Demon and Mother Blobs stomp / splosh, crawlers drag (heroes walk silently)
    const big = e.mob && (st.kind === "demon" || st.kind === "motherblob" || (st.merged ?? 1) >= 4);
    const crawler = e.mob && st.kind === "crawler";
    if (big || crawler) {
      const a = stepAcc.get(id) ?? { x: e.sprite.x, y: e.sprite.y, d: 0 };
      const moved = Math.hypot(e.sprite.x - a.x, e.sprite.y - a.y);
      a.x = e.sprite.x; a.y = e.sprite.y;
      if (moved > 0.3 && moved < 30) {
        a.d += moved;
        const stride = big ? 26 : crawler ? 30 : 17;
        if (a.d >= stride && !st.rolling) {
          a.d = 0;
          if (big) play(st.kind === "demon" ? "stomp" : "blobLunge", e.sprite.x, e.sprite.y, st.kind === "demon" ? 1 : 0.4, 0.5, { key: "st" + id, minGap: 150 });
          else play("crawl", e.sprite.x, e.sprite.y, 0.8, undefined, { key: "cr" + id, minGap: 300 });
        }
      } else if (moved >= 30) a.d = 0;
      stepAcc.set(id, a);
    }
    // Idle noises of monsters near the hero: blobs gurgle, skeletons rattle, the demon breathes
    if (e.mob && Math.hypot(dx, dy) < 8 * TILE && !st.hidden) {
      const due = nextIdle.get(id);
      if (due === undefined) { nextIdle.set(id, now + rnd(1500, 9000)); continue; }
      if (now < due) continue;
      nextIdle.set(id, now + rnd(5000, 14000));
      const k = st.kind as string;
      if (isBlob(k)) play("blobGurgle", e.sprite.x, e.sprite.y, 0.8, blobPitch(st));
      else if (k === "demon") play("demonGrowl", e.sprite.x, e.sprite.y, 0.8);
      else if (UNDEAD.has(k)) play("skelIdle", e.sprite.x, e.sprite.y);
    }
  }
  if (wasDead.size > 4000) { wasDead.clear(); stepAcc.clear(); nextIdle.clear(); }
}

/** Testing aid: render one recipe offline and return its peak level (used by the browser check, not by the game). */
export async function renderSfxPeak(name: string, arg?: any): Promise<number> {
  const saved = ctx, savedNoise = noiseBuf;
  const off = new OfflineAudioContext(1, 44100 * 3, 44100);
  ctx = off as unknown as AudioContext;
  noiseBuf = off.createBuffer(1, 44100 * 2, 44100);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  try { R[name]?.(off.destination, 0.01, 1, arg); } finally { ctx = saved; }
  const buf = await off.startRendering();
  noiseBuf = savedNoise;
  let m = 0;
  for (const v of buf.getChannelData(0)) m = Math.max(m, Math.abs(v));
  return m;
}
