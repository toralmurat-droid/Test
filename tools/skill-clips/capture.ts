// Records a short clip of every active skill of every playable class, for the public /skills page (client/skills.html).
// Run after `npm run build` (needs Playwright with Chromium and ffmpeg):
//   npx tsx tools/skill-clips/capture.ts [only skill ids, comma separated]
// It measures how fast this machine's browser draws, then boots the built server with SKILL_CAPTURE=1 (the "/stage"
// chat command) and both clocks slowed to match, logs a hero of each class in, "/max", and for each skill: "/stage",
// aim east, cast, and grabs the canvas frame by frame (full daylight, no colour grade). The clips land in client/public/skills/<id>.webp with client/public/skills/clips.json.
// .github/workflows/skill-clips.yml runs it after each merge that touches the skills or their looks.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ACTIVE_CLASSES } from "../../shared/classes";
import { activeSkills, type SkillDef } from "../../shared/skills";
import { TILE } from "../../shared/constants";
import { clipSourcesHash } from "./sources";

// Playwright is not a dependency of the game: CI installs it for this script only
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright") as { chromium: any };
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "client/public/skills");
const PORT = 2690, ZOOM = 4, FPS = 20; // frames per game second in the clips
const W = 576, H = 432; // the canvas size = the clip size (only the world is drawn on the canvas, the HUD is HTML)
const STAGE: [number, number] = [101, 72]; // CAPTURE_SPOT in server/TownRoom.ts
const PRE_MS = 250; // a moment before the cast
const only = process.argv[2]?.split(",").filter(Boolean);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How long to film a skill (game ms): summons, fields, buffs and forms linger, quick spells don't. */
function clipMs(s: SkillDef): number {
  if (s.colossus || s.arsenal || s.wisps || s.summon || s.brides) return 5000;
  if (s.field || s.buff || s.counter || s.chargeMs) return 3800;
  return 2800;
}

/**
 * Both clocks run SLOW times as fast (the server through slowtime.cjs, the page through the init script), so a slow
 * software-WebGL browser still draws every frame of the clip. Frames are read straight off the canvas (lossless) each
 * time the game clock passes the next 1/FPS s, never from a screen recording.
 */
async function session(SLOW: number, work: (page: any, send: (t: string, m: unknown) => Promise<unknown>, real: (ms: number) => number) => Promise<void>, cls: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "clips-"));
  const server = spawn("node", ["-r", path.join(__dirname, "slowtime.cjs"), "server-dist/index.cjs"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SLOW: String(SLOW), SKILL_CAPTURE: "1", SAVE_FILE: path.join(dir, "saves.json"), IDEAS_FILE: path.join(dir, "ideas.json") },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
      if (i > 200) throw new Error("server did not start");
      await wait(300);
    }
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(({ S, cls, FPS }: { S: number; cls: string; FPS: number }) => {
      // the same slowed clock as the server: Date, performance, frames and timers
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
    }, { S: SLOW, cls, FPS });
    // frame grabber, as plain text (tsx would wrap named functions in a helper the page doesn't have): __rec = { next,
    // frames, dup } while a clip is filmed; __draws counts the frames drawn
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
    await page.goto(`http://localhost:${PORT}/?time=day&zoom=${ZOOM}&look=${STAGE[0]},${STAGE[1] + 0.3}`);
    await page.fill("#name", cls[0].toUpperCase() + cls.slice(1)); // a fresh save file each run, so the name is free
    await page.fill("#password", "clippass123");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 120000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 300000 });
    const send = (t: string, m: unknown) => page.evaluate(([t, m]: [string, unknown]) => (window as any).__game.scene.scenes.find((s: any) => s.entities).room.send(t, m), [t, m]);
    await page.addStyleTag({ content: "body > *:not(#game):not(canvas) { visibility: hidden !important } #game > *:not(canvas) { visibility: hidden !important }" });
    // full daylight for the showcase: no gloomy colour grade, no dark vignette round the edges
    await page.evaluate(() => {
      const s = (window as any).__game.scene.scenes.find((x: any) => x.entities);
      s.grade?.reset();
      s.cameras.main.postFX?.clear();
      s.grade = undefined;
    });
    await work(page, send, (ms) => ms / SLOW);
  } finally {
    await browser.close();
    server.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Real frames per second the browser draws on this machine (at full speed, on the stage). */
async function measureFps(): Promise<number> {
  let fps = 10;
  await session(1, async (page, send, real) => {
    await send("chat", "/stage");
    await wait(real(4000));
    const a = await page.evaluate(() => [(window as any).__draws, (window as any).__realNow()]);
    await wait(5000);
    const b = await page.evaluate(() => [(window as any).__draws, (window as any).__realNow()]);
    fps = ((b[0] - a[0]) * 1000) / (b[1] - a[1]);
  }, "vampire");
  return fps;
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const old = existsSync(path.join(OUT, "clips.json")) ? JSON.parse(readFileSync(path.join(OUT, "clips.json"), "utf8")) : { clips: {} };
  const clips: Record<string, { ms: number; frames: number }> = only ? old.clips : {};
  const fps = await measureFps();
  // slow the game enough that the browser draws ~1.6 frames for every clip frame (a little headroom for the cast)
  const SLOW = Math.min(1, Math.max(0.03, fps / (FPS * 1.6)));
  console.log(`browser draws ${fps.toFixed(1)} fps: game slowed to x${SLOW.toFixed(3)}`);
  for (const cls of ACTIVE_CLASSES) {
    // what stays around after the clip (helpers that fight on, a Colossus) is filmed last, so it never walks into another clip
    const stays = (s: SkillDef) => (s.colossus || s.arsenal || s.wisps || s.brides || s.bite ? 1 : 0);
    const skills = activeSkills(cls).filter((s) => !only || only.includes(s.id)).sort((a, b) => stays(a) - stays(b));
    if (!skills.length) continue;
    await session(SLOW, async (page, send, real) => {
      await send("chat", "/max");
      await send("chat", "/stage");
      await wait(real(5000)); // the ground around the stage is painted before the first clip
      for (const s of skills) {
        await send("chat", (s.devour || s.bite) ? "/stage weak" : "/stage");
        await wait(real(900)); // the hero and the blobs settle in their spots
        await send("face", { x: (STAGE[0] + 1.6) * TILE, y: (STAGE[1] + 0.5) * TILE });
        const ms = clipMs(s);
        await page.evaluate(() => { (window as any).__rec = { next: performance.now(), frames: [], dup: 0 }; });
        await wait(real(PRE_MS));
        await send("cast", s.id);
        await wait(real(ms));
        const rec = await page.evaluate(() => { const r = (window as any).__rec; (window as any).__rec = null; return r; });
        const tmp = mkdtempSync(path.join(tmpdir(), "frames-"));
        rec.frames.forEach((u: string, i: number) => writeFileSync(path.join(tmp, `${String(i).padStart(4, "0")}.png`), Buffer.from(u.split(",")[1], "base64")));
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "%04d.png"),
          "-vf", `scale=${W}:${H}:flags=neighbor`, "-c:v", "libwebp_anim", "-loop", "0", "-lossless", "0", "-quality", "90", "-compression_level", "6", path.join(OUT, `${s.id}.webp`)]);
        rmSync(tmp, { recursive: true, force: true });
        clips[s.id] = { ms: PRE_MS + ms, frames: rec.frames.length };
        console.log(`${cls} ${s.id}: ${rec.frames.length} frames, ${rec.dup} repeated`);
      }
    }, cls);
  }
  writeFileSync(path.join(OUT, "clips.json"), JSON.stringify({ sources: clipSourcesHash(), clips }, null, 1) + "\n");
  console.log(`${Object.keys(clips).length} clips in ${path.relative(ROOT, OUT)}`);
  process.exit(0);
})().catch((e) => { console.error("CAPTURE FAILED", e); process.exit(1); });

