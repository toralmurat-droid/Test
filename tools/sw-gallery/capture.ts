// Songweaver effects gallery: films every Songweaver effect as it looks RIGHT NOW (chord rings, chords, every skill, the song
// gauge swells, sound waves, lute, Wren) and takes HUD screenshots at 1920x1080. It only captures; it changes no game code.
// Modelled on tools/skill-clips/capture.ts (same slowed clocks, same frame grabber), but it talks to the built server with the dev commands on (NODE_ENV
// not production: /tp and /god exist, see devenv.cjs) with SKILL_CAPTURE=1; run `npm run build` first. Needs playwright (or playwright-core, with PLAYWRIGHT_CHROME=/path/to/chrome) and ffmpeg.
//   OUT=/some/dir npx tsx tools/sw-gallery/capture.ts [groups, comma separated]
// groups: main (rings, chords, skills, swells, modes), sound (waves, resonance), wren (lute, Wren, materials), other (a second
// player's view), stills (screenshots), plus the re-shoot groups graded, modes, swells, bar, hud (shield on the orb and nameplate, draining gauge, at 1920x1080 and 1366x768). Default: main,sound,wren,other,stills.
// Env: FPS (clip frames per game second, 20), SLOW (fixed slow-down instead of measured), PORT (2690), ONLY=id,id (re-film just these),
// WAVE_NTH (another wall candidate), KEEP_GRADE / default strips the colour grade, MAT_MS (time limit for the bone drop). Results land in $OUT with manifest.json (entries are merged by id).
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TILE, MAP_W } from "../../shared/constants";
import { GROUND, T, isSolidAt } from "../../shared/map";
import { materialAt, type Material } from "../../shared/acoustics";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pw: any = (() => { try { return require("playwright"); } catch { return require("playwright-core"); } })();
const { chromium } = pw;
const ROOT = path.resolve(__dirname, "../..");
const OUT = process.env.OUT || path.join(ROOT, "sw-gallery-out");
const SERVER_PORT = Number(process.env.PORT || 2690); // the built client is served by the built server (run `npm run build` first)
const FPS = Number(process.env.FPS || 25);
const W = 576, H = 432; // the browser viewport; the canvas inside is drawn at 2x (1152x864) and clips keep that size
const STAGE: [number, number] = [101, 72]; // CAPTURE_SPOT in server/TownRoom.ts
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.env.ONLY?.split(",").filter(Boolean); // re-film only these item ids
const want = (id: string) => !ONLY || ONLY.includes(id);
const groups = (process.argv[2] || "main,sound,wren,other,stills").split(",");

interface Item { id: string; file: string; kind: "clip" | "still" | "missing"; group: string; title: string; what: string; source: string; note?: string }
mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, "_check"), { recursive: true });
const MANIFEST = path.join(OUT, "manifest.json");
function addItem(it: Item) {
  const all: Item[] = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : [];
  const i = all.findIndex((x) => x.id === it.id);
  if (i >= 0) all[i] = it; else all.push(it);
  writeFileSync(MANIFEST, JSON.stringify(all, null, 1) + "\n");
}
const missing = (id: string, group: string, title: string, what: string, source: string, why: string) => { addItem({ id, file: "", kind: "missing", group, title, what, source, note: why }); console.log(`MISSING ${id}: ${why}`); };

// ---- processes -------------------------------------------------------------------------------------------------

interface Hero { page: any; send: (t: string, m?: unknown) => Promise<unknown>; real: (ms: number) => number; gameNow: () => Promise<number>; close: () => Promise<void> }
interface Run { SLOW: number; server: ChildProcess; browser: any; dir: string; heroes: (name: string, cls: string, o?: { w?: number; h?: number; hide?: boolean; zoom?: number; keepGrade?: boolean }) => Promise<Hero> }

/**
 * One server (slowed by SLOW, fresh saves) and one browser. Both clocks run SLOW times as fast (the server through
 * slowtime.cjs, the page through the init script), so a slow software-WebGL browser still draws every frame of a clip.
 */
async function run(SLOW: number, work: (r: Run) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "swg-"));
  const server = spawn("node", ["-r", path.join(ROOT, "tools/skill-clips/slowtime.cjs"), "-r", path.join(__dirname, "devenv.cjs"), "server-dist/index.cjs"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", PORT: String(SERVER_PORT), SLOW: String(SLOW), SKILL_CAPTURE: "1", SAVE_FILE: path.join(dir, "saves.json"), IDEAS_FILE: path.join(dir, "ideas.json") },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {}), args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://localhost:${SERVER_PORT}/health`)).ok) break; } catch { /* not up yet */ }
      if (i > 200) throw new Error("server did not start");
      await wait(300);
    }
    const heroes = async (name: string, cls: string, o: { w?: number; h?: number; hide?: boolean; zoom?: number; keepGrade?: boolean } = {}): Promise<Hero> => {
      const w = o.w ?? W, h = o.h ?? H;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await ctx.addInitScript(({ S, cls }: { S: number; cls: string }) => {
        const d0 = Date.now(), dn = Date.now.bind(Date), p0 = performance.now(), pn = performance.now.bind(performance);
        (window as any).__realNow = pn;
        Date.now = () => Math.floor(d0 + (dn() - d0) * S);
        performance.now = () => p0 + (pn() - p0) * S;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (fn: FrameRequestCallback) => raf(() => fn(performance.now()));
        const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
        (window as any).setTimeout = (fn: any, ms?: number, ...a: any[]) => st(fn, (Number(ms) || 0) / S, ...a);
        (window as any).setInterval = (fn: any, ms?: number, ...a: any[]) => si(fn, (Number(ms) || 0) / S, ...a);
        try { localStorage.setItem("cls", cls); localStorage.setItem("introSeen", "1"); } catch { /* private mode */ }
      }, { S: SLOW, cls });
      // frame grabber (plain text: tsx would wrap named functions in a helper the page doesn't have)
      await ctx.addInitScript({ content: `(() => {
        const st = setTimeout;
        const hook = () => {
          const g = window.__game;
          if (!g || !g.events) return st(hook, 200 * ${SLOW});
          window.__draws = 0;
          
          g.events.on("postrender", () => {
            window.__draws++;
            const rec = window.__rec;
            if (!rec) return;
            const t = performance.now();
            let url = "";
            while (t >= rec.next) {
              if (url) rec.dup++; else url = g.canvas.toDataURL("image/png");
              rec.frames.push(url); rec.next += ${1000 / FPS};
            }
          });
        };
        hook();
      })();` });
      const page = await ctx.newPage();
      page.on("pageerror", (e: Error) => console.log(`  [page error ${name}] ${e.message.slice(0, 160)}`));
      await page.goto(`http://localhost:${SERVER_PORT}/?time=day&zoom=${o.zoom ?? 6}`);
      await page.fill("#name", name);
      await page.fill("#password", "swgallery123");
      await page.click("#play");
      await page.waitForSelector("#pkgo", { state: "visible", timeout: 180000 });
      await page.click("#pkgo");
      await page.waitForSelector("#hud:not([hidden])", { timeout: 300000 });
      if (o.hide !== false) await page.addStyleTag({ content: "body > *:not(#game):not(canvas) { visibility: hidden !important } #game > *:not(canvas) { visibility: hidden !important }" });
      await page.evaluate((strip: boolean) => {
        const S = (window as any).S = (window as any).__game.scene.scenes.find((x: any) => x.entities);
        if (strip) { S.grade?.reset(); S.cameras.main.postFX?.clear(); S.grade = undefined; } // optional: no colour grade, no vignette
        (window as any).evs = [];
        const o = S.fx.onEvent.bind(S.fx); S.fx.onEvent = (ev: any) => { (window as any).evs.push({ ...ev, at: Date.now() }); return o(ev); };
      }, !(process.env.KEEP_GRADE || o.keepGrade));
      const send = (t: string, m?: unknown) => page.evaluate(([t, m]: [string, unknown]) => (window as any).S.room.send(t, m), [t, m]);
      return { page, send, real: (ms: number) => ms / SLOW, gameNow: () => page.evaluate(() => Date.now()), close: () => ctx.close() };
    };
    await work({ SLOW, server, browser, dir, heroes });
  } finally {
    await browser.close();
    server.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Real frames per second the browser draws at this viewport (the first hero of a throw-away server). */
async function measureFps(w: number, h: number): Promise<number> {
  let fps = 10;
  await run(1, async (r) => {
    const hero = await r.heroes("Fps" + Date.now().toString(36).slice(-5), "songweaver", { w, h });
    await hero.send("chat", "/stage");
    await wait(4000);
    const a = await hero.page.evaluate(() => [(window as any).__draws, (window as any).__realNow()]);
    await wait(5000);
    const b = await hero.page.evaluate(() => [(window as any).__draws, (window as any).__realNow()]);
    fps = ((b[0] - a[0]) * 1000) / (b[1] - a[1]);
  });
  return fps;
}
const slowFor = (fps: number, headroom = 1.6) => Math.min(1, Math.max(0.03, fps / (FPS * headroom)));

// ---- helpers on a hero -------------------------------------------------------------------------------------------

const slug = (s: string) => s.replace(/[^a-z0-9_]+/gi, "_");
const evCount = (h: Hero, ev: string) => h.page.evaluate((ev: string) => (window as any).evs.filter((e: any) => e.ev === ev).length, ev);
const lastEv = (h: Hero, ev: string) => h.page.evaluate((ev: string) => (window as any).evs.filter((e: any) => e.ev === ev).pop(), ev);
const me = (h: Hero) => h.page.evaluate(() => { const S = (window as any).S, p = S.room.state.players.get(S.me); return { x: p.x / 32, y: p.y / 32, level: p.level, fx: p.fx, mana: (p.me?.mp ?? 0) % 1000, weapon: p.weapon, shield: p.shield, bag: [...(p.me?.bag ?? [])] }; });
const wasted = (h: Hero) => h.page.evaluate(() => (window as any).evs.length);
// (no runtime camera zoom: calling cameras.main.setZoom here made the page balloon to GBs; a hero gets its zoom from the URL)
/** Park the camera on a tile (the stage view of tools/skill-clips) or follow the hero again. */
const camStage = (h: Hero) => h.page.evaluate(([tx, ty]: number[]) => { const S = (window as any).S; if (S.cameras.main._swStage) return; const z = S.add.zone((tx + 0.5) * 32, (ty + 0.8) * 32, 1, 1); S.cameras.main._swStage = true; S.cameras.main.startFollow(z, true, 1, 1); S.cameras.main.centerOn(z.x, z.y); }, STAGE);
const camHero = (h: Hero) => h.page.evaluate(() => { const S = (window as any).S; S.cameras.main._swStage = false; S.cameras.main.startFollow(S.entities.get(S.me).sprite, true, 0.2, 0.2); S.snapCamera?.(); });
const face = (h: Hero, tx: number, ty: number) => h.send("face", { x: tx * TILE, y: ty * TILE });
const tp = async (h: Hero, x: number, y: number) => { await h.send("chat", `/tp ${x} ${y}`); await wait(h.real(900)); };

/** A Songweaver in the capture rig: it remembers when the last note and the last chord were played (game ms), so a clip can wait for a clean slate. */
class Singer {
  noteAt = -1e9; lockUntil = 0;
  constructor(public h: Hero) {}
  async cast(id: string) { await this.h.send("cast", id); this.noteAt = await this.h.gameNow(); }
  /** Wait (game ms) until the notes are forgotten (idle 10 s) and, if asked, the chord lockout (12 s) is over. */
  async clean(lock: boolean) {
    const now = await this.h.gameNow();
    const until = Math.max(this.noteAt + 10_800, lock ? this.lockUntil + 400 : 0);
    if (until > now) await wait(this.h.real(until - now));
  }
  async stage(weak = false) {
    await this.h.send("chat", weak ? "/stage weak" : "/stage");
    await wait(this.h.real(1000));
    await face(this.h, STAGE[0] + 1.6, STAGE[1] + 0.5);
    await wait(this.h.real(150));
  }
  async play(ids: string[], gapMs = 900) {
    for (const id of ids) { await this.cast(id); await wait(this.h.real(gapMs)); }
  }
}

interface ClipOpts {
  id: string; group: string; title: string; what: string; source: string;
  tail: number; pre?: number; zoom?: number; viewer?: Hero; act: () => Promise<void>; prep?: () => Promise<void>; follow?: "stage" | "hero";
  expect?: string; // an sfx event that must have happened during the clip, else the clip is reported as suspicious
}
const clipLog: string[] = [];
/** Films a clip on `viewer ?? hero`'s canvas: prep (unrecorded), start recording, `act`, `tail` more game ms, stop, encode. */
async function clip(h: Hero, o: ClipOpts) {
  const v = o.viewer ?? h;
  if (!want(o.id)) return [] as string[];
  try {
    if (o.prep) await o.prep();
    if (o.follow === "stage") await camStage(v); else if (o.follow === "hero") await camHero(v);
    await wait(v.real(500));
    const evs0 = await wasted(h);
    const tmp = mkdtempSync(path.join(tmpdir(), "swframes-"));
    let n = 0, seen = 0, recording = true;
    const flush = async () => {
      const fr: string[] = await v.page.evaluate(() => (window as any).__rec.frames.splice(0));
      for (const u of fr) { if (seen++ < 2) continue; writeFileSync(path.join(tmp, `${String(n++).padStart(4, "0")}.png`), Buffer.from(u.split(",")[1], "base64")); }
    };
    await v.page.evaluate(() => { (window as any).__rec = { next: performance.now(), frames: [], dup: 0 }; });
    const drain = (async () => { while (recording) { await wait(2500); if (recording) await flush(); } })(); // frames go to disk as they come: a long clip would not fit in the page
    await wait(v.real(o.pre ?? 250));
    await o.act();
    await wait(v.real(o.tail));
    recording = false;
    await drain;
    await flush();
    const rec = await v.page.evaluate(() => { const r = (window as any).__rec; (window as any).__rec = null; return { dup: r.dup }; });
    const evNames: string[] = await h.page.evaluate((n: number) => (window as any).evs.slice(n).map((e: any) => e.ev), evs0);
    const file = `${o.id}.webp`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "%04d.png"),
      "-c:v", "libwebp_anim", "-loop", "0", "-lossless", "0", "-quality", "92", "-compression_level", "6", path.join(OUT, file)]);
    // a contact sheet to look at (8 frames spread over the clip), kept in _check
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "%04d.png"),
      "-vf", `select='not(mod(n\\,${Math.max(1, Math.floor(n / 8))}))',scale=384:288:flags=neighbor,tile=4x2`, "-frames:v", "1", path.join(OUT, "_check", `${o.id}.png`)]);
    rmSync(tmp, { recursive: true, force: true });
    addItem({ id: o.id, file, kind: "clip", group: o.group, title: o.title, what: o.what, source: o.source });
    const uniq = [...new Set(evNames)].join(",");
    const bad = o.expect && !evNames.includes(o.expect) ? `  !! expected event ${o.expect} did not happen` : "";
    console.log(`${o.id}: ${n} frames (${rec.dup} repeated) events: ${uniq}${bad}`);
    if (bad) clipLog.push(`${o.id}${bad}`);
    if (process.env.STOP_AFTER === o.id) { console.log("STOP_AFTER reached"); process.exit(0); }
    return evNames;
  } catch (e) {
    console.log(`CLIP FAILED ${o.id}: ${(e as Error).message}`);
    clipLog.push(`${o.id} FAILED ${(e as Error).message}`);
    return [] as string[];
  } finally {
    await v.page.evaluate(() => { (window as any).__rec = null; }).catch(() => {});
  }
}

async function still(h: Hero, o: { id: string; group: string; title: string; what: string; source: string; clipTo?: string }) {
  const file = `${o.id}.png`;
  await h.page.screenshot({ path: path.join(OUT, file) });
  addItem({ id: o.id, file, kind: "still", group: o.group, title: o.title, what: o.what, source: o.source });
  console.log(`still ${o.id}`);
}

// ---- the skills and chords ---------------------------------------------------------------------------------------------

const SK: { id: string; name: string; kind: string; ms: number; src: string; what: string }[] = [
  { id: "sg_ballad", name: "Hearth Ballad", kind: "Chorus", ms: 5500, src: "client/src/skillfx.ts:onEvent field/tickField (kind ballad) + songEvent note + tickRings base ring", what: "a 30 s healing Chorus: a base ring under her feet, party heal ticks" },
  { id: "sg_mend", name: "Mending Note", kind: "Verse", ms: 3500, src: "client/src/skillfx.ts:songEvent note + the heal hop", what: "a heal that leaps to the nearest friend" },
  { id: "sg_pedal", name: "Pedal Point", kind: "Verse", ms: 3500, src: "client/src/skillfx.ts:songEvent note, songStatus shield bubble", what: "a low held note that shields her and the party" },
  { id: "sg_chorale", name: "Chorale", kind: "Ultimate", ms: 5000, src: "client/src/skillfx.ts:onEvent buff/area + songEvent note", what: "the heal ultimate with a regen buff" },
  { id: "sg_march", name: "Marching Tune", kind: "Chorus", ms: 5500, src: "client/src/skillfx.ts:onEvent field/tickField (kind march) + songEvent note", what: "a 30 s speed Chorus" },
  { id: "sg_jig", name: "Jig", kind: "Verse", ms: 3500, src: "client/src/skillfx.ts:onEvent buff + songEvent note", what: "an attack-speed war cry" },
  { id: "sg_call", name: "Call", kind: "Verse", ms: 3500, src: "client/src/skillfx.ts:onEvent cry/buff + songEvent note", what: "a ringing shout that jolts foes and buffs damage" },
  { id: "sg_anthem", name: "Anthem", kind: "Ultimate", ms: 6000, src: "client/src/skillfx.ts:tickField (kind anthem) + songEvent note", what: "a growing crescendo field" },
  { id: "sg_dirge", name: "Dirge", kind: "Chorus", ms: 5500, src: "client/src/skillfx.ts:onEvent field/tickField (kind dirge) + songEvent note", what: "a 30 s slowing lament Chorus" },
  { id: "sg_shrill", name: "Shrill Note", kind: "Verse", ms: 3500, src: "client/src/skillfx.ts:shot kind wave (soundWaveArt.ts) + songEvent note", what: "a piercing sound wave that bounces off walls" },
  { id: "sg_crack", name: "Cracked String", kind: "Verse", ms: 3500, src: "client/src/skillfx.ts:showArea (burst) + songEvent note", what: "a harsh twang that stuns foes ahead" },
  { id: "sg_twelve", name: "Twelve-Tone Storm", kind: "Ultimate", ms: 4500, src: "client/src/skillfx.ts:showArea (nova, 4 waves) + songEvent note", what: "four waves of sound that spend the song gauge" },
];
const PROGS = [
  { id: "amen", name: "Amen", notes: ["sg_pedal", "sg_mend", "sg_ballad"], fin: "client/src/skillfx.ts:onEvent buff (sg_f_amen)", what: "heal and shield" },
  { id: "turnaround", name: "Turnaround", notes: ["sg_jig", "sg_call", "sg_march"], fin: "client/src/skillfx.ts:onEvent buff (sg_f_encore)", what: "party damage and attack speed" },
  { id: "neapolitan", name: "Neapolitan", notes: ["sg_crack", "sg_call", "sg_dirge"], fin: "client/src/skillfx.ts:showArea nova (sg_f_shatter)", what: "damage, stun and heavy ringing" },
  { id: "perfect", name: "Perfect Cadence", notes: ["sg_mend", "sg_call", "sg_ballad"], fin: "client/src/skillfx.ts:showArea nova + buff (sg_f_resolve)", what: "heal and damage with ringing" },
  { id: "deceptive", name: "Deceptive Cadence", notes: ["sg_mend", "sg_call", "sg_pedal"], fin: "client/src/skillfx.ts:cry fear + untouchable (sg_f_sleight)", what: "untouchable for a moment, foes flee" },
];

async function modulateTo(h: Hero, s: Singer, mode: string) {
  const order = ["major", "minor", "lydian", "dorian", "phrygian"];
  for (let i = 0; i < 6; i++) {
    const fx: string = (await me(h)).fx || "";
    if (fx.split(",").includes(`mode:${mode}`) || (mode === "major" && !fx.includes("mode:"))) return;
    await h.send("cast", "sg_modulate"); await wait(h.real(900));
  }
  void order; void s;
}

/** The song gauge swell, one per book (Songbook first, then the fizzle, then buy the three books at Wren and swap). */
async function swellSection(h: Hero, s: Singer) {
  // ---- the song gauge swell, one per book (Songbook first, then buy the three at Wren and swap)
  const fill = async (id: string, title: string, what: string, src: string) => {
    await s.clean(true);
    // eight notes that spell no chord (a chord would add its own show) are played before the camera rolls: the gauge is then ~64;
    // the clip is the basic waves that fill the rest and the swell itself
    const order = ["sg_jig", "sg_shrill", "sg_crack", "sg_mend", "sg_pedal", "sg_chorale", "sg_anthem", "sg_call", "sg_ballad"];
    await clip(h, { id, group: "Song gauge swell", title, what, source: src, tail: 3000, expect: "swell", follow: "stage",
      prep: async () => {
        await s.stage();
        for (const sk of order) { await h.send("cast", sk); s.noteAt = await h.gameNow(); await wait(h.real(300)); }
      },
      act: async () => {
        const n0 = await evCount(h, "swell");
        // the Choruses take turns (a change of song waits 2 s, the one already playing is no note); basic waves fill a little between
        const turns = ["sg_march", "sg_dirge", "sg_ballad", "sg_march", "sg_dirge", "sg_ballad"];
        for (let i = 0; i < turns.length && (await evCount(h, "swell")) <= n0; i++) {
          await h.send("cast", turns[i]); s.noteAt = await h.gameNow();
          for (let k = 0; k < 8 && (await evCount(h, "swell")) <= n0; k++) { await h.send("attack"); await wait(h.real(300)); }
        }
        s.lockUntil = (await h.gameNow()) + 12_000;
      } });
  };
  await fill("swell_songbook", "Swell: the Songbook (Refrain)", "The song gauge hits 100 with the starting Songbook: gold ring, glow and rising notes, and her Chorus beats again (Refrain).", "client/src/skillfx.ts:songEvent swell (default branch)");
  // unequip the book: the fizzle swell
  await s.clean(true);
  await h.send("unequip", "shield"); await wait(h.real(800));
  const noBook = !((await me(h)).shield);
  if (noBook) await fill("swell_fizzle", "Swell fizzle (no book)", "With no book in her off hand the full gauge only puffs grey smoke and a small grey ring.", "client/src/skillfx.ts:songEvent swell (fizzle branch)");
  else missing("swell_fizzle", "Song gauge swell", "Swell fizzle", "full gauge without a book", "client/src/skillfx.ts:songEvent swell", "the server would not unequip the Songbook");
  // buy the books at Wren
  await tp(h, 85, 65);
  for (const i of [0, 1, 2]) { await h.send("buy", { i }); await wait(h.real(500)); }
  const bag: string[] = (await me(h)).bag;
  console.log("bag:", bag.join(" "));
  await tp(h, STAGE[0] - 1, STAGE[1]);
  for (const [bk, id, title, what, src] of [
    ["bk_hymnal", "swell_hymnal", "Swell: Hymnal (Benediction)", "The Hymnal's full gauge: a gold-white column and rising notes, then a party heal and shield.", "client/src/skillfx.ts:songEvent swell (bk_hymnal)"],
    ["bk_march", "swell_march", "Swell: War March (Rally)", "The War March's full gauge: two quick green rings and wind streaks, then a party haste buff.", "client/src/skillfx.ts:songEvent swell (bk_march)"],
    ["bk_dissonance", "swell_dissonance", "Swell: Dissonance (Cacophony)", "Dissonance's full gauge: a red ring and jagged red-violet shards, a stun blast that hurts foes around her.", "client/src/skillfx.ts:songEvent swell (bk_dissonance)"],
  ]) {
    const idx = ((await me(h)).bag as string[]).findIndex((b) => b.startsWith(bk));
    if (idx < 0) { missing(id, "Song gauge swell", title, what, src, `${bk} not in the bag (bought at Wren)`); continue; }
    await h.send("equip", idx); await wait(h.real(1000));
    if (!((await me(h)).shield || "").startsWith(bk)) { missing(id, "Song gauge swell", title, what, src, "equip did not take"); continue; }
    await fill(id, title, what, src);
  }
}

async function groupMain(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwMain" + Date.now().toString(36).slice(-5), "songweaver");
    const s = new Singer(h);
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(2500));
    await s.stage();
    await wait(h.real(9000)); // the ground round the stage gets painted
    const chorusKinds = ["sg_ballad", "sg_march", "sg_dirge"];

    // ---- chord progress: notes 1 and 2, and a progression that does not finish
    await s.clean(true);
    await clip(h, { id: "ring_ch1", group: "Chord rings", title: "Note ring 1 (ch1)", what: "The first note of a progression opens one ring under her feet (Pedal Point = the vi that starts Amen); it stays while the chord could still follow.", source: "client/src/skillfx.ts:noteRing + tickRings (status word ch1)", tail: 4000, expect: "note", follow: "stage", prep: () => s.stage(), act: () => s.cast("sg_pedal") });
    await s.clean(true);
    await clip(h, { id: "ring_ch2", group: "Chord rings", title: "Note rings 1 and 2 (ch2)", what: "Two notes of Amen in a row (Pedal Point, Mending Note) leave two rings, the second a bit wider; the third note would burst them.", source: "client/src/skillfx.ts:noteRing + tickRings (status word ch2)", tail: 3500, expect: "note", follow: "stage", prep: () => s.stage(), act: () => s.play(["sg_pedal", "sg_mend"], 1100) });
    await s.clean(true);
    await clip(h, { id: "ring_fizzle", group: "Chord rings", title: "A progression that breaks", what: "Pedal Point and Mending Note, then the wrong third note (Dirge): no chord fires and the rings just fade out.", source: "client/src/skillfx.ts:tickRings (rings fade when ch1/ch2 drop)", tail: 5000, follow: "stage", prep: () => s.stage(), act: () => s.play(["sg_pedal", "sg_mend", "sg_dirge"], 1000) });
    await s.clean(true);

    // ---- every progression, and the lockout
    for (const p of PROGS) {
      for (const wide of [false]) {
        await s.clean(true);
        await clip(h, { id: `chord_${p.id}${wide ? "_wide" : ""}`, group: "Chords", title: `${p.name} chord${wide ? " (wide view)" : ""}`, what: `Playing ${p.notes.map((n) => SK.find((k) => k.id === n)!.name).join(", ")} fires the ${p.name} chord (${p.what}): the three rings burst outwards and a white-gold ring, glow and notes flare.`,
          source: `client/src/skillfx.ts:songEvent chord + chordRings; finisher ${p.fin}`, tail: 3000, expect: "chord", follow: "stage", prep: () => s.stage(),
          act: async () => { await s.play(p.notes, 950); s.lockUntil = (await h.gameNow()) + 12_000; } });
      }
    }
    // lockout ring: a chord, then film the shrinking grey ring
    await s.clean(true);
    await s.stage(); await camStage(h);
    await s.play(PROGS[0].notes, 950); s.lockUntil = (await h.gameNow()) + 12_000;
    await clip(h, { id: "ring_lockout", group: "Chord rings", title: "Chord lockout: no world ring (chlock)", what: "For 12 s after a chord the world shows NO ring any more (the lockout is a clock on the owner's Song orb, group lock); filmed right after Amen.", source: "client/src/skillfx.ts:tickRings (status word chlock)", tail: 11000, pre: 0, follow: "stage", act: async () => { /* just watch */ } });
    // locked: a full progression during the lockout does nothing
    await s.clean(false);
    await s.stage();
    await s.play(PROGS[0].notes, 950); s.lockUntil = (await h.gameNow()) + 12_000;
    await s.clean(false);
    await clip(h, { id: "ring_locked_attempt", group: "Chord rings", title: "A progression played during the lockout", what: "Perfect Cadence notes played while chords are locked: the rings open and fade but no chord fires.", source: "client/src/skillfx.ts:tickRings; shared/songs.ts noteCast lock", tail: 5000, follow: "stage", prep: async () => { await s.stage(); }, act: () => s.play(PROGS[3].notes, 900) });
    await s.clean(true);

    // collected songs: Round from Odo, Undertow from the pond (see what is reachable with /max)
    await tp(h, 105, 49);
    let songs: string[] = [];
    for (let i = 0; i < 3; i++) { await h.send("cast", "sg_ballad"); await wait(h.real(1200)); await h.send("cast", "sg_march"); await wait(h.real(2600)); }
    songs = await h.page.evaluate(() => { const S = (window as any).S; return (window as any).evs.filter((e: any) => e.ev === "newsong").map((e: any) => e.song); });
    console.log("songs found near Odo:", songs);
    await tp(h, 35, 94);
    for (const id of ["sg_dirge", "sg_ballad", "sg_march"]) { if ((await evCount(h, "newsong")) > songs.length) break; await h.send("cast", id); await wait(h.real(2600)); }
    songs = await h.page.evaluate(() => (window as any).evs.filter((e: any) => e.ev === "newsong").map((e: any) => e.song));
    console.log("songs found:", songs);
    await s.clean(true);
    if (songs.includes("song_round")) {
      await clip(h, { id: "chord_round", group: "Chords", title: "Miller's Round chord (collected song)", what: "The collected song Miller's Round (I V vi) played with March, Call, Pedal Point: a chord only exists once Odo has taught the song and the Songbook is worn.", source: "client/src/skillfx.ts:songEvent chord; finisher sg_f_round (shared/songbook.ts)", tail: 3000, expect: "chord", follow: "stage", prep: () => s.stage(), act: async () => { await s.play(["sg_march", "sg_call", "sg_pedal"], 950); s.lockUntil = (await h.gameNow()) + 12_000; } });
    } else missing("chord_round", "Chords", "Miller's Round chord", "Collected song Miller's Round (I V vi)", "client/src/skillfx.ts:songEvent chord", "Odo did not teach the song to the scripted hero (no newsong event near the mill)");
    await s.clean(true);
    if (songs.includes("song_pond")) {
      // i bII i: Dirge, Cracked String, Dirge again. The second Dirge is a refresh unless the first has under 10 s left, so this tries the only timing that could work.
      await s.stage(); await camStage(h);
      const before = await evCount(h, "chord");
      await s.cast("sg_dirge"); await wait(h.real(9500)); await s.cast("sg_crack"); await wait(h.real(9500)); await s.cast("sg_dirge"); await wait(h.real(1500));
      const got = (await evCount(h, "chord")) > before;
      if (!got) missing("chord_undertow", "Chords", "Undertow chord (Mirror Pond Air)", "Collected song Mirror Pond Air (i bII i = Dirge, Cracked String, Dirge)", "client/src/skillfx.ts:songEvent chord; finisher sg_f_undertow", "Tried Dirge, Cracked String, Dirge with 9.5 s gaps: the second Dirge is a Chorus refresh (more than 10 s left) so it logs no note, and a longer gap forgets the notes. The progression cannot be played: possible design bug.");
      else {
        await s.clean(true); await s.stage();
        await clip(h, { id: "chord_undertow", group: "Chords", title: "Undertow chord", what: "Dirge, Cracked String, Dirge.", source: "client/src/skillfx.ts:songEvent chord", tail: 3000, expect: "chord", follow: "stage", act: async () => { await s.cast("sg_dirge"); await wait(h.real(9500)); await s.cast("sg_crack"); await wait(h.real(9500)); await s.cast("sg_dirge"); } });
      }
    } else missing("chord_undertow", "Chords", "Undertow chord", "Mirror Pond Air (i bII i)", "client/src/skillfx.ts:songEvent chord", "no newsong at the pond shore");
    missing("chord_hum", "Chords", "Gloam's Hum chord", "Collected song The Gloam's Hum (I V I)", "client/src/skillfx.ts:songEvent chord; finisher sg_f_hum", "the song is only given by finishing Morwen's jelly quest (no dev command grants a song)");
    missing("chord_picardy", "Chords", "Picardy chord", "Collected song The Hollow King's Lament (i V I)", "client/src/skillfx.ts:songEvent chord; finisher sg_f_picardy", "the song is only given by killing the Hollow King (late quest, not reachable with /max)");
    await s.clean(true);

    // ---- every skill, major
    await s.stage(); await wait(h.real(500));
    const castAll = async (tag: string, mode: string) => {
      for (const k of SK) {
        await s.clean(true);
        const long = chorusKinds.includes(k.id);
        await clip(h, { id: `skill_${k.id}_${tag}`, group: "Skills", title: `${k.name} (${k.kind}), ${mode}`, what: `${k.name}: ${k.what}. Cast with its key on the stage; key is ${mode}.`, source: k.src, tail: k.ms, expect: k.id === "sg_twelve" ? undefined : "note", follow: "stage", prep: () => s.stage(), act: () => s.cast(k.id) });
      }
    };
    await castAll("major", "Major");
    // the Chorus that stays under her feet: a long look
    await s.clean(true);
    await clip(h, { id: "chorus_stays_ballad", group: "Skills", title: "The Chorus that stays under her feet (Hearth Ballad)", what: "After the cast, a Chorus keeps a faint ring under her feet for its 30 s and ticks (heal pulses); filmed 14 s after the cast.", source: "client/src/skillfx.ts:tickRings (base ring) + tickField", tail: 14000, follow: "stage", prep: () => s.stage(), act: () => s.cast("sg_ballad") });

    // ---- Key change and the modes
    await s.clean(true);
    await clip(h, { id: "skill_sg_modulate", group: "Skills", title: "Modulate (Key change)", what: "The basic spell: switch to the next key she knows; the colour of every note and ring changes.", source: "client/src/skillfx.ts:songEvent note (mode colour, songTables.ts modeColor)", tail: 2500, follow: "stage", prep: () => s.stage(), act: async () => { await h.send("cast", "sg_modulate"); } });
    // each mode: one note + Amen chord
    for (const mode of ["minor", "lydian", "dorian", "phrygian"]) {
      await modulateTo(h, s, mode);
      await s.clean(true);
      await clip(h, { id: `chord_amen_${mode}`, group: "Modes", title: `Amen chord in ${mode}`, what: `The same Amen chord (Pedal Point, Mending Note, Hearth Ballad) in the ${mode} key: the ring and glow colour follows the mode.`, source: "client/src/songTables.ts:modeColor + client/src/skillfx.ts:chordRings", tail: 3000, expect: "chord", follow: "stage", prep: () => s.stage(), act: async () => { await s.play(PROGS[0].notes, 950); s.lockUntil = (await h.gameNow()) + 12_000; } });
    }
    // phrygian (last mode in the cycle) for all skills
    await castAll("phrygian", "Phrygian");
    await s.clean(true);
    await clip(h, { id: "chorus_stays_dirge_phrygian", group: "Skills", title: "The Chorus under her feet, Dirge in Phrygian", what: "A dark Chorus in a dark key: its ring and ticks 14 s after the cast.", source: "client/src/skillfx.ts:tickRings (base ring) + tickField", tail: 14000, follow: "stage", prep: () => s.stage(), act: () => s.cast("sg_dirge") });
    await modulateTo(h, s, "major");

    await swellSection(h, s);
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

// ---- sound waves ----------------------------------------------------------------------------------------------

/** A wall of this material with open ground in front of it (hero stands 3 tiles from it, facing it); `nth` picks another candidate. */
function findWall(mat: Material, nth = 0): { x: number; y: number; dx: number; dy: number } | undefined {
  const found: { x: number; y: number; dx: number; dy: number; score: number }[] = [];
  const free = (x: number, y: number) => materialAt(x, y) === "none" && !isSolidAt((x + 0.5) * TILE, (y + 0.5) * TILE) && GROUND[y][x] !== T.WATER;
  for (let ty = 8; ty < 150; ty++) for (let tx = 8; tx < MAP_W - 8; tx++) {
    if (materialAt(tx, ty) !== mat) continue;
    if (mat !== "water" && !isSolidAt((tx + 0.5) * TILE, (ty + 0.5) * TILE)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { // the wave flies in direction (dx, dy)
      let ok = true;
      for (let k = 1; k <= 4; k++) if (!free(tx - k * dx, ty - k * dy)) ok = false;
      for (const s of [-1, 1]) if (!free(tx - 3 * dx + s * dy, ty - 3 * dy + s * dx)) ok = false; // room beside the hero
      if (!ok) continue;
      const tall = (materialAt(tx + dy, ty + dx) === mat ? 1 : 0) + (materialAt(tx - dy, ty - dx) === mat ? 1 : 0);
      found.push({ x: tx, y: ty, dx, dy, score: tall * 10 + (dx === 1 ? 2 : 0) - Math.abs(tx - 100) * 0.01 - Math.abs(ty - 70) * 0.01 });
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found[nth];
}

async function groupSound(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwSound" + Date.now().toString(36).slice(-5), "songweaver", { zoom: 4 });
    const s = new Singer(h);
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(2500));
    // bounces and swallows
    const MATS: [Material, string, string][] = [
      ["stone", "stone", "Stone gives the wave back (x0.9 damage): white-grey sparks at the wall."],
      ["wood", "wood", "Wood gives back less (x0.6): brown sparks."],
      ["metal", "metal", "Metal (a well or an anvil) gives it back at full strength and adds resonance: blue-white sparks."],
      ["foliage", "foliage", "Leaves swallow the wave: no bounce event, the wave just ends in a small burst."],
      ["water", "water", "Water swallows the wave."],
    ];
    for (const [mat, id, what] of MATS) {
      if (!want(`wave_${id}`)) continue; // ONLY=wave_metal WAVE_NTH=2: re-film one wall at another place
      const w = findWall(mat, Number(process.env.WAVE_NTH || 0));
      if (!w) { missing(`wave_${id}`, "Sound waves", `Shrill Note against ${mat}`, what, "client/src/skillfx.ts:songEvent bounce / waveBurst", `no ${mat} wall with open ground west of it found on the map`); continue; }
      await tp(h, w.x - 3 * w.dx, w.y - 3 * w.dy);
      await camHero(h);
      await wait(h.real(6000));
      await s.clean(false);
      await clip(h, { id: `wave_${id}`, group: "Sound waves", title: `Shrill Note against ${mat}`, what: `A Shrill Note fired 3 tiles from ${mat} at (${w.x},${w.y}): ${what}`, source: "client/src/skillfx.ts:songEvent bounce (and waveBurst); wave art client/src/soundWaveArt.ts", tail: 2500, zoom: 2, expect: mat === "foliage" || mat === "water" ? undefined : "bounce", follow: "hero",
        prep: async () => { await face(h, w.x, w.y); await wait(h.real(200)); }, act: () => s.cast("sg_shrill") });
    }
    // the stage: slimes are muffled (dull), resonance builds on them
    if (want("res_muffled_numbers") || want("res_buildup_burst")) { await s.stage(); await wait(h.real(9000)); }
    await s.clean(true);
    const hammer = async (n: number) => { for (let i = 0; i < n; i++) { await h.send("attack"); await wait(h.real(280)); } };
    await clip(h, { id: "res_muffled_numbers", group: "Sound waves", title: "Muffled damage numbers (dull foe)", what: "Basic lute waves against a slime (a dull listener): its damage numbers turn grey and the word 'muffled' floats up.", source: "client/src/soundCues.ts:onSoundHit (MUFFLED tint)", tail: 1500, expect: "soundhit", follow: "stage", prep: () => s.stage(), act: () => hammer(6) });
    await clip(h, { id: "res_buildup_burst", group: "Sound waves", title: "Resonance build-up and burst", what: "Hammering one slime with sound hits (Shrill Note, Cracked String, Call, basic waves): a pale ring hums on its body and brightens (res1-3, gold at the top), then bursts in two rings and a flash.", source: "client/src/skillfx.ts:songStatus (res1..res3) + songEvent resonate", tail: 2500, expect: "resonate", follow: "stage", prep: () => s.stage(),
      act: async () => { for (let i = 0; i < 9; i++) { for (const sk of ["sg_shrill", "sg_crack", "sg_call", "sg_jig"]) { await h.send("cast", sk); await wait(h.real(250)); } await hammer(4); } } });
    // fragile / keen foes: find a skeleton (fragile, gold numbers, shatter)
    let done = !want("res_fragile_shatter");
    for (let tries = 0; tries < 6 && !done; tries++) {
      await tp(h, 100, 103);
      const m = await h.page.evaluate(() => { const S = (window as any).S, me = S.entities.get(S.me); let best: any; S.entities.forEach((e: any, id: string) => { if (id === S.me || !["skeleton", "skeletonmage"].includes(e.state.kind) || e.state.dead || e.state.hp <= 0) return; const d = Math.hypot(e.sprite.x - me.sprite.x, e.sprite.y - me.sprite.y); if (!best || d < best.d) best = { id, d, x: e.sprite.x, y: e.sprite.y }; }); return best; });
      if (!m) { await wait(h.real(4000)); continue; }
      await tp(h, Math.floor(m.x / 32) - 2, Math.floor(m.y / 32));
      await camHero(h);
      const evs = await clip(h, { id: "res_fragile_shatter", group: "Sound waves", title: "A fragile foe shatters (skeleton)", what: "Sound hits on a skeleton (a fragile listener): its numbers ring gold, resonance builds fast, and the burst shatters it (white ring, shards, stun, double damage).", source: "client/src/skillfx.ts:songEvent resonate (shatter) + soundhit; client/src/soundCues.ts (RINGING)", tail: 2500, zoom: 3, follow: "hero",
        act: async () => { await face(h, m.x / 32, m.y / 32); for (let i = 0; i < 3; i++) { for (const sk of ["sg_shrill", "sg_crack", "sg_call"]) { await h.send("cast", sk); await wait(h.real(260)); } for (let j = 0; j < 3; j++) { await h.send("attack"); await wait(h.real(260)); } } } });
      done = evs.includes("resonate");
      if (!done) await s.clean(false);
    }
    if (!done) console.log("no shatter filmed");
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

// ---- Wren, the lute, materials ----------------------------------------------------------------------------------------

async function groupWren(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwWren" + Date.now().toString(36).slice(-5), "songweaver");
    const s = new Singer(h);
    if (!ONLY || ONLY.some((i) => i.startsWith("lute") || i.startsWith("wren"))) {
    // the lute at level 1: she stands in the town and plays basic waves
    await clip(h, { id: "lute_level1", group: "Lute", title: "Her starting lute (level 1, Minstrel's)", what: "A new Songweaver with her first lute: idle, then three basic attacks (the strum combo). The lute has the same look at every stage (shared/lute.ts: no new look per stage).", source: "client/src/gear.ts GearLayer + client/src/songGearIcons.ts; wave art client/src/soundWaveArt.ts", tail: 2500, zoom: 4, follow: "hero",
      act: async () => { for (let i = 0; i < 3; i++) { await h.send("attack"); await wait(h.real(500)); } } });
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(2500));
    await s.stage(); await wait(h.real(3000));
    await clip(h, { id: "lute_max", group: "Lute", title: "Her lute at max level (Virtuoso's)", what: "The same hero at level max: the lute and the strum combo look the same as at level 1 (only stats differ per stage).", source: "client/src/gear.ts GearLayer", tail: 2500, follow: "stage", prep: () => s.stage(), act: async () => { for (let i = 0; i < 3; i++) { await h.send("attack"); await wait(h.real(500)); } } });
    for (const [n, lv] of [[2, 5], [3, 10], [4, 20], [5, 35]] as const) missing(`lute_stage${n}`, "Lute", `Lute stage ${n} (from level ${lv})`, "the lute at this stage", "shared/lute.ts LUTE_STAGES", "no look per stage (stats only, per the comment in shared/lute.ts) and no dev command sets a hero to level " + lv + "; the level 1 and max clips show the one look");
    // Wren's stall: buy two weapons and a shield at Brann, break them, fit Steel Strings
    await tp(h, 72, 58);
    for (const i of [4, 5, 15]) { await h.send("buy", { i }); await wait(h.real(400)); }
    await tp(h, 85, 65);
    await camHero(h);
    await clip(h, { id: "wren_break", group: "Lute", title: "Breaking gear into materials (break)", what: "At Wren's stall, breaking a bought weapon or shield into Tonewood or Brass: a float 'Broken: +N Tonewood' and little brown/brass chips over her.", source: "client/src/songbookFx.ts:diEvent break", tail: 2500, expect: "break", follow: "hero",
      act: async () => { for (let k = 0; k < 3; k++) { const idx = ((await me(h)).bag as string[]).findIndex((b) => /^w_dragon|^w_sky|^sh_dragon/.test(b)); if (idx < 0) break; await h.send("break", { bag: idx }); await wait(h.real(700)); } } });
    await clip(h, { id: "wren_lutefit", group: "Lute", title: "Fitting Steel Strings (lutefit)", what: "Wren fits a trait to her lute: 'Steel Strings fitted' floats up with gold and cream sparks round her; the lute itself looks the same.", source: "client/src/songbookFx.ts:diEvent lutefit", tail: 2500, expect: "lutefit", follow: "hero", act: async () => { await h.send("lutefit", { trait: "steel" }); } });
    }
    if (!want("mat_pickup")) return;
    await h.send("chat", "/max"); await h.send("chat", "/god");
    // a material from the ground: skeletons drop bone; stand 3 tiles off, film the pickup
    await tp(h, 100, 103);
    let got = false;
    const t0 = Date.now();
    const killSk = async () => {
      const m = await h.page.evaluate(() => { const S = (window as any).S, me = S.entities.get(S.me); let best: any; S.entities.forEach((e: any, id: string) => { if (id === S.me || !["skeleton", "skeletonmage"].includes(e.state.kind) || e.state.dead || e.state.hp <= 0) return; const d = Math.hypot(e.sprite.x - me.sprite.x, e.sprite.y - me.sprite.y); if (!best || d < best.d) best = { id, d, x: e.sprite.x, y: e.sprite.y }; }); return best; });
      if (!m) return false;
      await tp(h, Math.floor(m.x / 32) + 2, Math.floor(m.y / 32));
      for (let i = 0; i < 14; i++) {
        const cur = await h.page.evaluate((id: string) => { const e = (window as any).S.entities.get(id); return e && !e.state.dead && e.state.hp > 0 ? { x: e.sprite.x, y: e.sprite.y } : null; }, m.id);
        if (!cur) return true;
        await h.send("face", { x: cur.x, y: cur.y }); await h.send("attack"); await h.send("cast", "sg_shrill"); await wait(h.real(320));
      }
      return false;
    };
    while (!got && Date.now() - t0 < Number(process.env.MAT_MS || 420000)) {
      await killSk();
      const it = await h.page.evaluate(() => { let o: any; (window as any).S.items.forEach((img: any, id: string) => { if (img.getData("mat")) o = { id, x: img.x, y: img.y, mat: img.getData("mat") }; }); return o; });
      if (!it) continue;
      const evs = await clip(h, { id: "mat_pickup", group: "Lute", title: `Material on the ground and its pickup (${it.mat})`, what: "A dropped lute material lies on the ground (a small coloured gem), she steps on it: '+N Bone' floats up with a puff in the material's colour.", source: "client/src/songbookFx.ts:diEvent matpick; ground item client/src/TownScene.ts (mat) + client/src/matArt.ts", tail: 1800, expect: "matpick", follow: "hero",
        act: async () => {
          await tp(h, Math.floor(it.x / 32), Math.floor(it.y / 32));
          // walk onto it (the pickup radius is small): step along the longer axis towards it until it is gone
          for (let i = 0; i < 40 && (await evCount(h, "matpick")) === 0; i++) {
            const d = await h.page.evaluate((id: string) => { const S = (window as any).S, p = S.room.state.players.get(S.me), m = S.room.state.items.get(id); return m ? { dx: m.x - p.x, dy: m.y - p.y } : null; }, it.id);
            if (!d) break;
            if (i % 8 === 0) console.log(`  pickup: ${Math.round(d.dx)},${Math.round(d.dy)} px away`);
            const key = Math.abs(d.dx) > Math.abs(d.dy) ? (d.dx > 0 ? "d" : "a") : d.dy > 0 ? "s" : "w";
            await h.page.keyboard.down(key); await wait(h.real(60)); await h.page.keyboard.up(key); await wait(h.real(150));
          }
        } });
      got = evs.includes("matpick");
    }
    if (!got) missing("mat_pickup", "Lute", "Material pickup (matpick)", "walking onto a dropped lute material", "client/src/songbookFx.ts:diEvent matpick", "no material dropped from skeletons within the time limit");
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

// ---- another player's view ----------------------------------------------------------------------------------------------

async function groupOther(SLOW: number) {
  await run(SLOW, async (r) => {
    const a = await r.heroes("SwCaster" + Date.now().toString(36).slice(-4), "songweaver");
    const v = await r.heroes("SwViewer" + Date.now().toString(36).slice(-4), "vampire", { zoom: 6 });
    const w2 = await r.heroes("SwWide" + Date.now().toString(36).slice(-4), "vampire", { zoom: 4 });
    const s = new Singer(a);
    for (const hero of [a, v, w2]) { await hero.send("chat", "/max"); await hero.send("chat", "/god"); }
    await wait(a.real(3000));
    await s.stage(); await wait(a.real(2500));
    await v.send("chat", `/tp ${STAGE[0] - 1} ${STAGE[1] + 1}`);
    await wait(a.real(3000));
    await w2.send("chat", `/tp ${STAGE[0] - 1} ${STAGE[1] + 2}`);
    await wait(a.real(3000));
    await camHero(v); await camHero(w2);
    const see = async (id: string, title: string, what: string, tail: number, act: () => Promise<void>, expect?: string, wide = false) => {
      await s.clean(true);
      await clip(a, { id, group: "Another player's view", title, what, source: "client/src/skillfx.ts:tickRings / songEvent (status words ch1, ch2, chlock; field of a Chorus owner) seen on a remote hero", tail, viewer: wide ? w2 : v, expect, prep: () => s.stage(), act });
    };
    await see("other_ch2", "Two note rings on someone else", "A second player's view of a Songweaver playing Pedal Point, Mending Note: the same two rings under her feet.", 3500, () => s.play(["sg_pedal", "sg_mend"], 1100), "note");
    await see("other_chord", "A chord on someone else", "A second player's view of Amen: the rings burst, the chord ring flares, the lockout ring starts.", 4000, async () => { await s.play(PROGS[0].notes, 950); s.lockUntil = (await a.gameNow()) + 12_000; }, "chord");
    await see("other_chord_wide", "A chord on someone else (wide view)", "The same Amen chord from a second player 2x zoom out: how far the rings and the chord ring reach compared with the tile grid.", 4000, async () => { await s.play(["sg_pedal", "sg_mend", "sg_march"], 950); s.lockUntil = (await a.gameNow()) + 12_000; }, "chord", true);
    await see("other_chorus", "A Chorus on someone else", "A second player's view of a Hearth Ballad Chorus: the faint ring under the Songweaver and the party-heal aura on the watcher.", 8000, () => s.cast("sg_ballad"), "note");
    await see("other_skill_shrill", "A Shrill Note seen by another player", "A second player sees the sound wave fly.", 3000, () => s.cast("sg_shrill"), "note");
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

/** Mouse over a monster (the monster bar follows the hovered monster). */
async function hoverMob(h: Hero, id: string) {
  const pos = await h.page.evaluate((id: string) => {
    const S = (window as any).S, e = S.entities.get(id), cam = S.cameras.main, cv = S.game.canvas, r = cv.getBoundingClientRect();
    if (!e) return null;
    const kx = cv.width / cam.worldView.width, ky = cv.height / cam.worldView.height; // the world scale makes this differ from cam.zoom
    const x = (e.sprite.x - cam.worldView.x) * kx, y = (e.sprite.y - e.sprite.displayHeight * 0.4 - cam.worldView.y) * ky;
    return { x: r.left + x * r.width / cv.width, y: r.top + y * r.height / cv.height };
  }, id);
  if (pos) { await h.page.mouse.move(pos.x, pos.y); await h.page.mouse.move(pos.x + 1, pos.y + 1); await wait(h.real(700)); }
}

// ---- stills (1920x1080, HUD included) -----------------------------------------------------------------------------------

async function groupStills(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwStill" + Date.now().toString(36).slice(-5), "songweaver", { w: 1920, h: 1080, hide: false });
    const s = new Singer(h);
    const sh = (id: string, title: string, what: string, source: string) => still(h, { id, group: "HUD and panels", title, what, source });
    const key = async (k: string) => { await h.page.keyboard.press(k); await wait(h.real(700)); };
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(3000));
    await s.stage(); await wait(h.real(3000));
    await sh("hud_gauge_empty", "Song gauge orb: empty", "The gold Song orb at 0 right after joining the stage: an empty dark glass, the label 'Song'.", "client/src/orbs.ts:update (song) / drawOrb GOLD");
    // fill to about half, screenshot at once (the gauge drains after 4 s without a note)
    const mana = async () => (await me(h)).mana as number;
    for (const sk of ["sg_jig", "sg_call", "sg_shrill", "sg_crack", "sg_mend", "sg_pedal"]) { if ((await mana()) >= 40) break; await h.send("cast", sk); await wait(h.real(250)); }
    await sh("hud_gauge_half", "Song gauge orb: about half", `The Song orb about half full (gauge ${await mana()}/100).`, "client/src/orbs.ts:update / drawOrb GOLD");
    // no chord, no twelve-tone storm (that spends the gauge): notes of 8 until 90 or more, then stop before 100 swells it
    for (const sk of ["sg_chorale", "sg_anthem", "sg_ballad", "sg_march", "sg_dirge"]) {
      if ((await mana()) >= 90) break;
      await h.send("cast", sk); await wait(h.real(2300));
      for (let k = 0; k < 4 && (await mana()) < 90; k++) { await h.send("attack"); await wait(h.real(250)); }
    }
    await sh("hud_gauge_nearfull", "Song gauge orb: nearly full (pulsing)", `The Song orb at ${await mana()}/100: the 'full' class (90% and up) makes it pulse gold.`, "client/src/orbs.ts:setSong / update (full class) + client/src/orbs.css");
    missing("hud_gauge_full", "HUD and panels", "Song gauge orb at 100", "the orb at exactly full", "client/src/orbs.ts", "a full gauge swells and empties in the same server tick, so 100 is never on screen; 'nearly full' is the highest state");
    // the Songbook reader
    await s.clean(false);
    await key("t");
    await sh("skills_page_legend_button", "Skills page with the '?' legend button", "The Songweaver's skills page (T) with the little '?' that opens the chord legend (the Songbook reader).", "client/src/chordHud.ts toggleChordLegend; skills page client/src/TownScene.ts / sidepanel");
    const help = await h.page.$(".chhelp");
    if (help) { await help.click(); await wait(h.real(700)); }
    await sh("songbook_reader_top", "Songbook reader (top)", "The Songbook reader: found songs and the unknown ones as '???'.", "client/src/songbookReader.ts:draw");
    await h.page.evaluate(() => { const s = document.getElementById("songbook"); if (s) s.scrollTop = s.scrollHeight; });
    await wait(h.real(500));
    await sh("songbook_reader_legend", "Songbook reader (chord legend)", "The scrolled-down reader: the legend of chords (Amen, Turnaround, Neapolitan, Perfect, Deceptive and the chords from songs).", "client/src/songbookReader.ts:draw (legend)");
    const x = await h.page.$("#songbook .sb-x"); if (x) await x.click();
    await key("t");
    // Wren's panel
    await tp(h, 72, 58);
    for (const i of [4, 5, 15]) { await h.send("buy", { i }); await wait(h.real(400)); }
    await tp(h, 85, 65);
    for (const i of [0, 1, 2]) { await h.send("buy", { i }); await wait(h.real(400)); }
    for (let i = 0; i < 4 && !(await h.page.$(".lm-tab")); i++) { await key("e"); await wait(h.real(1200)); }
    if (await h.page.$(".lm-tab")) {
      await h.page.click(".lm-tab[data-tab=shop]"); await wait(h.real(600));
      await sh("wren_shop", "Wren's panel: Shop", "Wren's Shop tab: the three books for sale (Hymnal, War March, Dissonance).", "client/src/lutemaker.ts:lutemakerBody (shop) + client/src/npcs.ts");
      await h.page.click(".lm-tab[data-tab=break]"); await wait(h.real(600));
      await sh("wren_break_tab", "Wren's panel: Break", "Wren's Break tab: bag weapons and shields that can be broken into materials.", "client/src/lutemaker.ts:lutemakerBody (break)");
      for (let n = 0; n < 3; n++) { const b = await h.page.$(".lm-break"); if (!b) break; await b.click(); await wait(h.real(300)); const b2 = await h.page.$(".lm-break"); if (b2) { await b2.click(); await wait(h.real(800)); } }
      await h.page.click(".lm-tab[data-tab=traits]"); await wait(h.real(600));
      await sh("wren_traits", "Wren's panel: Traits", "Wren's Traits tab: the nine lute traits in three groups with their material and gold costs and what locks them.", "client/src/lutemaker.ts:lutemakerBody (traits)");
      const fit = await h.page.$(".lm-fit[data-trait=steel]:not([disabled])");
      if (fit) { await fit.click(); await wait(h.real(1500)); await sh("wren_fitted", "Wren's panel: after fitting Steel Strings", "The Traits tab right after a fit: 'Fitted' on the trait.", "client/src/lutemaker.ts:lutemakerBody"); }
      await key("Escape");
    } else missing("wren_traits", "HUD and panels", "Wren's panel", "Traits, Break and Shop", "client/src/lutemaker.ts", "Wren's dialog did not open from the scripted position");
    // bag, books, lute tooltips
    await key("g");
    const hover = async (pred: string, id: string, title: string, what: string) => {
      const idx = await h.page.evaluate((src: string) => { const S = (window as any).S, bag = [...(S.room.state.players.get(S.me).me?.bag ?? [])]; return bag.findIndex(new Function("b", "return " + src) as any); }, pred);
      const cells = await h.page.$$("#gearbag .gcell");
      if (idx < 0 || !cells[idx]) { missing(id, "HUD and panels", title, what, "client/src/gear.ts (item icon) + client/src/songGearIcons.ts", "item not in the bag"); return; }
      await cells[idx].hover(); await wait(h.real(500));
      await sh(id, title, what, "client/src/gear.ts hover + client/src/songGearIcons.ts drawSongGearIcon");
    };
    await hover("/^bk_march/.test(b)", "tip_book_march", "Book icon and tooltip: War March", "The bag with the War March book hovered: icon and tooltip with its Rally gift.");
    await hover("/^bk_hymnal/.test(b)", "tip_book_hymnal", "Book icon and tooltip: Hymnal", "The Hymnal hovered in the bag.");
    await hover("/^bk_dissonance/.test(b)", "tip_book_dissonance", "Book icon and tooltip: Dissonance", "Dissonance hovered in the bag.");
    const luteSlot = await h.page.$("#gearslots .slot-weapon");
    if (luteSlot) { await luteSlot.hover(); await wait(h.real(500)); await sh("tip_lute", "Lute icon and tooltip", "The equipped lute (weapon slot) hovered: stage name, stats, trait.", "client/src/gear.ts hover + client/src/songGearIcons.ts"); }
    const bookSlot = await h.page.$("#gearslots .slot-shield");
    if (bookSlot) { await bookSlot.hover(); await wait(h.real(500)); await sh("tip_songbook", "Songbook icon and tooltip", "The worn Songbook (shield slot) hovered: 'Read' hint and Refrain gift.", "client/src/gear.ts hover + client/src/songGearIcons.ts"); }
    await key("g");
    // the new-song banner
    await tp(h, 35, 94);
    const n0 = await evCount(h, "newsong");
    for (const id of ["sg_dirge", "sg_ballad", "sg_march"]) { if ((await evCount(h, "newsong")) > n0) break; await h.send("cast", id); await wait(h.real(2600)); }
    await wait(h.real(500));
    if ((await evCount(h, "newsong")) > n0) await sh("newsong_banner", "New-song banner", "The 'New song!' banner (gold, centred) after playing a Chorus on Mirror Pond's shore.", "client/src/songbookFx.ts:showNewSong");
    else missing("newsong_banner", "HUD and panels", "New-song banner", "the 'New song!' banner", "client/src/songbookFx.ts:showNewSong", "no newsong event at the pond shore");
    // monster bar with the ear icon: hit a skeleton
    await tp(h, 100, 103); await wait(h.real(1500));
    const m = await h.page.evaluate(() => { const S = (window as any).S, me = S.entities.get(S.me); let best: any; S.entities.forEach((e: any, id: string) => { if (id === S.me || !["skeleton", "skeletonmage", "slime"].includes(e.state.kind) || e.state.dead || e.state.hp <= 0) return; const d = Math.hypot(e.sprite.x - me.sprite.x, e.sprite.y - me.sprite.y); if (!best || d < best.d) best = { id, d, x: e.sprite.x, y: e.sprite.y }; }); return best; });
    if (m) {
      await tp(h, Math.floor(m.x / 32) - 2, Math.floor(m.y / 32));
      await face(h, m.x / 32, m.y / 32);
      for (let i = 0; i < 4; i++) { await h.send("attack"); await wait(h.real(300)); }
      await h.send("cast", "sg_shrill");
      await wait(h.real(500));
      await hoverMob(h, m.id);
      await sh("monster_bar_ear", "Monster bar with the ear icon (skeleton)", "A skeleton just hit by sound, with the mouse over it: the top monster bar shows its ear and note icons (how well it hears, which pitch it likes), with gold/grey damage numbers in the world.", "client/src/monsterBar.ts + client/src/soundCues.ts");
      await s.stage(); await wait(h.real(6000));
      for (let i = 0; i < 4; i++) { await h.send("attack"); await wait(h.real(300)); }
      const sl = await h.page.evaluate(() => { const S = (window as any).S; let id = ""; S.entities.forEach((e: any, k: string) => { if (!id && e.state.kind === "slime" && !e.state.dead) id = k; }); return id; });
      if (sl) { await hoverMob(h, sl); await sh("monster_bar_ear_slime", "Monster bar with the ear icon (slime)", "A slime (a dull listener) with the mouse over it: its ear icon and the muffled-sound line in the top monster bar.", "client/src/monsterBar.ts + client/src/soundCues.ts"); }
    } else missing("monster_bar_ear", "HUD and panels", "Monster bar with the ear icon", "the ear icon", "client/src/monsterBar.ts", "no skeleton found near the graveyard");
  });
}

// ---- the same effects under the game's real colour grade and vignette (the other groups strip it, like the /skills clips) ----

async function groupGraded(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwGrade" + Date.now().toString(36).slice(-5), "songweaver", { keepGrade: true });
    const s = new Singer(h);
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(2500));
    await s.stage(); await wait(h.real(9000));
    const meta = (id: string, title: string, what: string, source: string, tail: number, act: () => Promise<void>, expect?: string) =>
      s.clean(true).then(() => clip(h, { id, group: "Real look (colour grade on)", title, what, source, tail, expect, follow: "stage", prep: () => s.stage(), act }));
    await meta("graded_ring_ch2", "Two note rings, real colour grade", "The same two note rings as ring_ch2, but with the game's own colour grade and dark vignette left on, as a player sees it.", "client/src/skillfx.ts:tickRings; grade client/src/TownScene.ts setGrade", 3500, () => s.play(["sg_pedal", "sg_mend"], 1100), "note");
    await meta("graded_chord_amen", "Amen chord, real colour grade", "Amen with the real grade and vignette on.", "client/src/skillfx.ts:songEvent chord", 3000, async () => { await s.play(PROGS[0].notes, 950); s.lockUntil = (await h.gameNow()) + 12_000; }, "chord");
    await meta("graded_shrill", "Shrill Note, real colour grade", "A Shrill Note with the real grade and vignette on.", "client/src/skillfx.ts shot wave", 3000, () => s.cast("sg_shrill"), "note");
    await meta("graded_chorus_ballad", "Hearth Ballad Chorus, real colour grade", "The Chorus ring and party aura with the real grade on.", "client/src/skillfx.ts:tickRings + tickField", 6000, () => s.cast("sg_ballad"), "note");
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

// ---- re-shoots: Amen in the other keys with a fresh Chorus (a Chorus that is already playing is only a refresh: no note, no chord) ----

async function groupModes(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwModes" + Date.now().toString(36).slice(-5), "songweaver");
    const s = new Singer(h);
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(2500));
    await s.stage(); await wait(h.real(9000));
    const amen = (mode: string, third: string) => async () => {
      await modulateTo(h, s, mode);
      await s.clean(true);
      await clip(h, { id: `chord_amen_${mode}`, group: "Modes", title: `Amen chord in ${mode}`, what: `The same Amen chord (Pedal Point, Mending Note, ${third === "sg_march" ? "Marching Tune" : "Hearth Ballad"}) in the ${mode} key: the ring and glow colour follows the mode.`, source: "client/src/songTables.ts:modeColor + client/src/skillfx.ts:chordRings", tail: 3000, expect: "chord", follow: "stage", prep: () => s.stage(), act: async () => { await s.play(["sg_pedal", "sg_mend", third], 950); s.lockUntil = (await h.gameNow()) + 12_000; } });
    };
    await modulateTo(h, s, "phrygian");
    await s.clean(true);
    await clip(h, { id: "skill_sg_ballad_phrygian", group: "Skills", title: "Hearth Ballad (Chorus), Phrygian", what: "Hearth Ballad: a 30 s healing Chorus: a base ring under her feet, party heal ticks. Cast with its key on the stage; key is Phrygian.", source: "client/src/skillfx.ts:onEvent field/tickField (kind ballad) + songEvent note + tickRings base ring", tail: 5500, expect: "note", follow: "stage", prep: () => s.stage(), act: () => s.cast("sg_ballad") });
    await amen("phrygian", "sg_march")();
    await amen("lydian", "sg_ballad")();
    await amen("dorian", "sg_march")();
    await modulateTo(h, s, "minor"); // leave her as found
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

async function groupSwells(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwSwell" + Date.now().toString(36).slice(-5), "songweaver");
    const s = new Singer(h);
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(2500));
    await s.stage(); await wait(h.real(9000));
    await swellSection(h, s);
    if (clipLog.length) console.log("SUSPICIOUS:\n" + clipLog.join("\n"));
  });
}

// ---- the monster bar (ear and note icons): needs the mouse over a monster ----

async function groupBar(SLOW: number) {
  await run(SLOW, async (r) => {
    const h = await r.heroes("SwBar" + Date.now().toString(36).slice(-5), "songweaver", { w: 1920, h: 1080, hide: false });
    const s = new Singer(h);
    await h.send("chat", "/max"); await h.send("chat", "/god");
    await wait(h.real(3000));
    await s.stage(); await wait(h.real(6000));
    const one = async (id: string, title: string, what: string, kinds: string[], hit: boolean) => {
      const m = await h.page.evaluate((kinds: string[]) => { const S = (window as any).S, me = S.entities.get(S.me); let best: any; S.entities.forEach((e: any, id: string) => { if (id === S.me || !kinds.includes(e.state.kind) || e.state.dead || e.state.hp <= 0) return; const d = Math.hypot(e.sprite.x - me.sprite.x, e.sprite.y - me.sprite.y); if (!best || d < best.d) best = { id, d }; }); return best; }, kinds);
      if (!m) { missing(id, "HUD and panels", title, what, "client/src/monsterBar.ts", "no such monster near"); return; }
      if (hit) { await h.send("cast", "sg_shrill"); await wait(h.real(600)); }
      for (let i = 0; i < 4; i++) {
        await hoverMob(h, m.id);
        const st = await h.page.evaluate(() => { const S = (window as any).S; return { inspect: S.pointer?.inspectId, target: S.pointer?.targetId, bar: document.querySelector("#monsterbar, .monsterbar, .mbar")?.className }; });
        console.log(id, "try", i, JSON.stringify(st));
        if (st.inspect || st.target) break;
      }
      if (!(await h.page.evaluate(() => (window as any).S.pointer?.inspectId))) { await h.page.mouse.down(); await h.page.mouse.up(); await wait(h.real(800)); await hoverMob(h, m.id); } // a click targets it
      await wait(h.real(500));
      await still(h, { id, group: "HUD and panels", title, what, source: "client/src/monsterBar.ts + client/src/soundCues.ts" });
    };
    await one("monster_bar_ear_slime", "Monster bar with the ear icon (slime)", "A slime (a dull listener) with the mouse over it: its ear icon and the muffled-sound line in the top monster bar.", ["slime"], false);
    await tp(h, 100, 103); await wait(h.real(6000));
    const sk = await h.page.evaluate(() => { const S = (window as any).S; let o: any; S.entities.forEach((e: any) => { if (!o && ["skeleton", "skeletonmage"].includes(e.state.kind) && !e.state.dead) o = { x: e.sprite.x, y: e.sprite.y }; }); return o; });
    if (sk) { await tp(h, Math.floor(sk.x / 32) - 2, Math.floor(sk.y / 32)); await face(h, sk.x / 32, sk.y / 32); await wait(h.real(2000)); }
    await one("monster_bar_ear", "Monster bar with the ear icon (skeleton)", "A skeleton (a fragile listener) with the mouse over it: the top monster bar shows its ear and pitch icons and what it likes.", ["skeleton", "skeletonmage"], true);
  });
}

// ---- HUD effects of the rework: shield on the health orb, shield mark on another hero's nameplate bar, the draining gauge ----

async function groupHud(SLOW: number) {
  for (const [W2, H2] of [[1920, 1080], [1366, 768]]) {
    await run(SLOW, async (r) => {
      const tag = `${W2}`;
      const h = await r.heroes("SwHud" + Date.now().toString(36).slice(-5), "songweaver", { w: W2, h: H2, hide: false });
      const v = await r.heroes("SwHudV" + Date.now().toString(36).slice(-4), "vampire", { w: W2, h: H2, hide: false, zoom: 6 });
      const s = new Singer(h);
      for (const x of [h, v]) { await x.send("chat", "/max"); await x.send("chat", "/god"); }
      await wait(h.real(3000));
      await s.stage(); await wait(h.real(3000));
      await v.send("chat", `/tp ${STAGE[0] - 1} ${STAGE[1] + 1}`);
      await wait(h.real(3000));
      await camHero(v);
      const rect = (x: Hero, sel: string) => x.page.evaluate((sel: string) => { const b = document.querySelector(sel)!.getBoundingClientRect(); return { x: Math.max(0, b.left - 10), y: Math.max(0, b.top - 10), width: b.width + 20, height: b.height + 20 }; }, sel);
      const shot = async (x: Hero, file: string, clipTo?: { x: number; y: number; width: number; height: number }) => { await x.page.screenshot({ path: path.join(OUT, file), ...(clipTo ? { clip: clipTo } : {}) }); };
      // shield: Pedal Point (a Verse that shields her)
      await shot(h, `hud_orb_noshield_${tag}_crop.png`, await rect(h, ".orb.hp"));
      await s.cast("sg_pedal"); await wait(h.real(1200));
      await still(h, { id: `hud_orb_shield_${tag}`, group: "HUD effects", title: `Health orb with a Pedal Point shield (${W2}x${H2})`, what: "Pedal Point's shield shows as a pale glassy pane and a bright rim on the health orb, and no bubble round her in the world.", source: "client/src/orbs.ts drawOrb (shield) + client/src/skillfx.ts songStatus" });
      await shot(h, `hud_orb_shield_${tag}_crop.png`, await rect(h, ".orb.hp"));
      await wait(h.real(300));
      await shot(h, `hud_orb_shield_${tag}_crop2.png`, await rect(h, ".orb.hp"));
      // the viewer sees her nameplate mark
      await still(v, { id: `hud_nameplate_shield_${tag}`, group: "HUD effects", title: `Another hero's shield mark (${W2}x${H2})`, what: "A second player sees the Songweaver with a Pedal Point shield: no bubble, a pale rim round the health bar under her feet.", source: "client/src/skillfx.ts songStatus (shield)" });
      const cx = { x: W2 / 2 + 95, y: H2 / 2 - 90 }; // the caster stands up and to the right of the viewer, whose camera is centred on it
      await shot(v, `hud_nameplate_shield_${tag}_crop.png`, { x: cx.x - 110, y: cx.y - 110, width: 220, height: 170 });

      // the draining gauge: fill it, take quick stills of the orb across the swell
      await s.clean(true);
      const box = await rect(h, ".orb.mp");
      const order = ["sg_jig", "sg_shrill", "sg_crack", "sg_mend", "sg_chorale", "sg_anthem", "sg_call", "sg_ballad"];
      const n0 = await evCount(h, "swell");
      const tmp = mkdtempSync(path.join(tmpdir(), "swdrain-"));
      // the page keeps the last 30 frames of the gold orb's canvas with their game time, and stops 900 game ms after the swell
      await h.page.evaluate(`(() => {
        const cv = document.querySelector(".orb.mp canvas"), w = window;
        w.__orbFrames = []; w.__orbStop = 0; w.evs.length = 0;
        const loop = () => {
          if (w.evs.some((e) => e.ev === "swell") && !w.__orbStop) w.__orbStop = Date.now() + 900;
          if (!w.__orbStop || Date.now() < w.__orbStop) { w.__orbFrames.push({ t: Date.now(), u: cv.toDataURL("image/png") }); if (w.__orbFrames.length > 30) w.__orbFrames.shift(); }
          requestAnimationFrame(loop);
        };
        loop();
      })()`);
      const turns = ["sg_march", "sg_dirge", "sg_ballad", "sg_march", "sg_dirge"];
      for (const sk of order) { await h.send("cast", sk); await wait(h.real(300)); }
      for (let i = 0; i < 40 && (await evCount(h, "swell")) <= 0; i++) { if (i % 6 === 0) await h.send("cast", turns[(i / 6) | 0] ?? "sg_ballad"); else await h.send("attack"); await wait(h.real(300)); }
      await wait(h.real(1500));
      const frames: { t: number; u: string }[] = await h.page.evaluate(() => (window as any).__orbFrames);
      void n0;
      console.log(`drain frames ${frames.length}`, frames.map((f) => f.t - frames[0].t).join(" "));
      frames.forEach((f, i) => writeFileSync(path.join(tmp, `k${String(i).padStart(2, "0")}.png`), Buffer.from(f.u.split(",")[1], "base64")));
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(tmp, "k%02d.png"), "-vf", "tile=10x3", "-frames:v", "1", path.join(OUT, `hud_gauge_drain_${tag}.png`)]);
      addItem({ id: `hud_gauge_drain_${tag}`, file: `hud_gauge_drain_${tag}.png`, kind: "still", group: "HUD effects", title: `Song gauge draining after the swell (${W2}x${H2})`, what: "Consecutive stills of the gold orb across a swell: it runs down instead of vanishing.", source: "client/src/orbs.ts drainLevel" });
      rmSync(tmp, { recursive: true, force: true });
    });
  }
}

// ---- the chord lockout clock on the Song orb: stills across the whole lockout, at both sizes ----

async function groupLock(SLOW: number) {
  for (const [W2, H2] of [[1920, 1080], [1366, 768]]) {
    await run(SLOW, async (r) => {
      const h = await r.heroes("SwLock" + Date.now().toString(36).slice(-5), "songweaver", { w: W2, h: H2, hide: false });
      const s = new Singer(h);
      await h.send("chat", "/max"); await h.send("chat", "/god");
      await wait(h.real(3000));
      await s.stage(); await wait(h.real(3000));
      const tmp = mkdtempSync(path.join(tmpdir(), "swlock-"));
      const box = await h.page.evaluate(() => { const b = document.querySelector(".orb.mp")!.getBoundingClientRect(); return { x: Math.max(0, b.left - 14), y: Math.max(0, b.top - 14), width: b.width + 46, height: b.height + 28 }; });
      const frame = async (i: number) => { const info = await h.page.evaluate(() => { const S = (window as any).S, e = S.entities.get(S.me); return `${Math.round(Date.now())} fx=${String(e.state.fx).includes("chlock")} clock=${!document.querySelector(".lockclock")?.hasAttribute("hidden")}`; }); console.log(`lock still ${i}: game ${info}`); await h.page.screenshot({ path: path.join(tmp, `k${String(i).padStart(2, "0")}.png`), clip: box }); };
      await frame(0); // before: no clock
      await s.play(PROGS[0].notes, 950);
      const t0 = await h.gameNow();
      let n = 1;
      for (let k = 0; k < 11; k++) { await frame(n++); if (k === 0) await h.page.screenshot({ path: path.join(OUT, `hud_lockclock_${W2}_full.png`) }); await wait(h.real(1200)); }
      await wait(h.real(1500)); await frame(n++); // gone
      console.log(`lock stills ${n}, first at game +${t0}`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(tmp, "k%02d.png"), "-vf", "tile=7x2", "-frames:v", "1", path.join(OUT, `hud_lockclock_${W2}.png`)]);
      execFileSync("cp", [path.join(tmp, "k06.png"), path.join(OUT, `hud_lockclock_${W2}_crop.png`)]);
      addItem({ id: `hud_lockclock_${W2}`, file: `hud_lockclock_${W2}.png`, kind: "still", group: "HUD effects", title: `Chord lockout clock (${W2}x${H2})`, what: "Contact strip of the Song orb: before, then across the 12 s lockout (a dark wedge sweeps clockwise over the little tile), then gone.", source: "client/src/lockClock.ts" });
      rmSync(tmp, { recursive: true, force: true });
    });
  }
}

// ---- the mode chip beside the Song orb: stills of two or more modes, cast Modulate between them ----

async function groupMode(SLOW: number) {
  for (const [W2, H2] of [[1920, 1080], [1366, 768]]) {
    await run(SLOW, async (r) => {
      const h = await r.heroes("SwMode" + Date.now().toString(36).slice(-5), "songweaver", { w: W2, h: H2, hide: false });
      const s = new Singer(h);
      await h.send("chat", "/max"); await h.send("chat", "/god");
      await wait(h.real(3000));
      await s.stage(); await wait(h.real(3000));
      const box = await h.page.evaluate(() => { const b = document.querySelector(".orb.mp")!.getBoundingClientRect(); return { x: Math.max(0, b.left - 14), y: Math.max(0, b.top - 80), width: Math.min(560, innerWidth - b.left + 14), height: b.height + 94 }; });
      const tmp = mkdtempSync(path.join(tmpdir(), "swmode-"));
      const seen: string[] = [];
      for (let i = 0; i < 5; i++) {
        const m = await h.page.evaluate(() => (document.querySelector(".modechip .mcname") as HTMLElement | null)?.textContent ?? "(none)");
        console.log(`mode still ${i}: ${m}`);
        seen.push(m);
        await h.page.screenshot({ path: path.join(tmp, `k${i}.png`), clip: box });
        if (i === 1) await h.page.screenshot({ path: path.join(OUT, `hud_mode_${W2}_full.png`) });
        await h.send("cast", "sg_modulate"); await wait(h.real(1500));
      }
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(tmp, "k%d.png"), "-vf", "tile=1x5", "-frames:v", "1", path.join(OUT, `hud_mode_${W2}.png`)]);
      execFileSync("cp", [path.join(tmp, "k1.png"), path.join(OUT, `hud_mode_${W2}_crop.png`)]);
      addItem({ id: `hud_mode_${W2}`, file: `hud_mode_${W2}.png`, kind: "still", group: "HUD effects", title: `Mode chip (${W2}x${H2})`, what: `Modes seen across Modulate casts: ${seen.join(", ")}.`, source: "client/src/modeChip.ts" });
      rmSync(tmp, { recursive: true, force: true });
    });
  }
}

(async () => {
  console.log("output:", OUT);
  // SLOW (env) fixes the slow-down; otherwise it is measured: the browser should draw ~1.3 frames for every clip frame
  const fpsSmall = !process.env.SLOW && groups.some((g) => ["main", "sound", "wren", "other"].includes(g)) ? await measureFps(W, H) : 10;
  const SLOW = process.env.SLOW ? Number(process.env.SLOW) : Math.min(1, Math.max(0.03, fpsSmall / (FPS * 1.3)));
  console.log(`game slowed to x${SLOW.toFixed(3)} (browser drew ${fpsSmall.toFixed(1)} fps at ${W}x${H})`);
  const fn: Record<string, (s: number) => Promise<void>> = { main: groupMain, sound: groupSound, wren: groupWren, other: (s) => groupOther(s * 0.7), graded: groupGraded, mode: async () => { const f = await measureFps(1366, 768); await groupMode(Math.max(0.05, Math.min(0.5, f / 8))); }, lock: async () => { const f = await measureFps(1366, 768); await groupLock(Math.max(0.05, Math.min(0.5, f / 8))); }, hud: async () => { const f = await measureFps(1366, 768); await groupHud(Math.max(0.05, Math.min(0.5, f / 8))); }, bar: async () => { const f = await measureFps(1920, 1080); await groupBar(Math.max(0.05, Math.min(0.5, f / 8))); }, swells: groupSwells, modes: groupModes, stills: async () => { const f = await measureFps(1920, 1080); await groupStills(Math.max(0.05, Math.min(0.5, f / 8))); } };
  for (const g of groups) { try { await fn[g](SLOW); } catch (e) { console.error(`GROUP ${g} FAILED`, e); } }
  process.exit(0);
})().catch((e) => { console.error("CAPTURE FAILED", e); process.exit(1); });
