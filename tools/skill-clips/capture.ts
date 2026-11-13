// Records a short clip of every active skill of every playable class, for the public /skills page (client/skills.html).
// Run after `npm run build` (needs Playwright with Chromium and ffmpeg):
//   npx tsx tools/skill-clips/capture.ts [only skill ids, comma separated]
// It boots the built server with SKILL_CAPTURE=1 (the "/stage" chat command) and both clocks slowed (slowtime.cjs and
// the browser init script below), logs a hero of each class in, "/max", and for each skill: "/stage", aim east, cast,
// and records the page. The clips land in client/public/skills/<id>.webp with client/public/skills/clips.json.
// .github/workflows/skill-clips.yml runs it after each merge that touches the skills or their looks.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
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
const PORT = 2690, ZOOM = 5, SLOW = 0.35, FPS = 12; // game frames per second in the clips
const W = 640, H = 480, CROP = { w: 448, h: 336 }; // the stage, cut from the middle of the page
const STAGE: [number, number] = [101, 72]; // CAPTURE_SPOT in server/TownRoom.ts
const only = process.argv[2]?.split(",").filter(Boolean);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const real = (gameMs: number) => gameMs / SLOW;

/** How long to film a skill (game ms): buffs, forms, summons and fields linger, quick spells don't. */
function clipMs(s: SkillDef): number {
  if (s.colossus || s.arsenal || s.wisps || s.summon) return 3600;
  if (s.field || s.buff || s.counter || s.chargeMs) return 3000;
  return 2200;
}

const dir = mkdtempSync(path.join(tmpdir(), "clips-"));
const server = spawn("node", ["-r", path.join(__dirname, "slowtime.cjs"), "server-dist/index.cjs"], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SLOW: String(SLOW), SKILL_CAPTURE: "1", SAVE_FILE: path.join(dir, "saves.json"), IDEAS_FILE: path.join(dir, "ideas.json") },
  stdio: ["ignore", "ignore", "inherit"],
});
const stop = (code: number) => { server.kill("SIGKILL"); process.exit(code); };

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
    if (i > 200) throw new Error("server did not start");
    await wait(300);
  }
  mkdirSync(OUT, { recursive: true });
  const old = existsSync(path.join(OUT, "clips.json")) ? JSON.parse(readFileSync(path.join(OUT, "clips.json"), "utf8")) : { clips: {} };
  const clips: Record<string, { ms: number; frames: number }> = only ? old.clips : {};
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  for (const cls of ACTIVE_CLASSES) {
    // what stays around after the clip (helpers that fight on, a Colossus) is filmed last, so it never walks into another clip
    const stays = (s: SkillDef) => (s.colossus || s.arsenal || s.wisps || s.brides || s.bite ? 1 : 0);
    const skills = activeSkills(cls).filter((s) => !only || only.includes(s.id)).sort((a, b) => stays(a) - stays(b));
    if (!skills.length) continue;
    const vids = path.join(dir, cls);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: vids, size: { width: W, height: H } } });
    await ctx.addInitScript(({ S, cls }: { S: number; cls: string }) => {
      // the same slowed clock as the server: Date, performance, frames and timers
      const d0 = Date.now(), dn = Date.now.bind(Date), p0 = performance.now(), pn = performance.now.bind(performance);
      Date.now = () => Math.floor(d0 + (dn() - d0) * S);
      performance.now = () => p0 + (pn() - p0) * S;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (fn: FrameRequestCallback) => raf(() => fn(performance.now()));
      const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
      (window as any).setTimeout = (fn: any, ms?: number, ...a: any[]) => st(fn, (Number(ms) || 0) / S, ...a);
      (window as any).setInterval = (fn: any, ms?: number, ...a: any[]) => si(fn, (Number(ms) || 0) / S, ...a);
      try { localStorage.setItem("cls", cls); localStorage.setItem("introSeen", "1"); } catch { /* private mode */ }
    }, { S: SLOW, cls });
    const page = await ctx.newPage();
    const t0 = Date.now(); // the video starts with the page
    await page.goto(`http://localhost:${PORT}/?time=day&zoom=${ZOOM}&look=${STAGE[0] - 0.6},${STAGE[1]}`);
    await page.fill("#name", cls[0].toUpperCase() + cls.slice(1)); // a fresh save file each run, so the name is free
    await page.fill("#password", "clippass123");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 60000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 120000 });
    const send = (t: string, m: unknown) => page.evaluate(([t, m]: [string, unknown]) => (window as any).__game.scene.scenes.find((s: any) => s.entities).room.send(t, m), [t, m]);
    // nothing on the page but the world: the HUD, panels and notices are hidden
    await page.addStyleTag({ content: "body > *:not(#game):not(canvas) { visibility: hidden !important } #game > *:not(canvas) { visibility: hidden !important }" });
    await send("chat", "/max");
    await send("chat", "/stage");
    await wait(real(5000)); // the ground and the light around the stage are painted before the first clip
    const cuts: { id: string; from: number; ms: number }[] = [];
    for (const s of skills) {
      await send("chat", (s.devour || s.bite) ? "/stage weak" : "/stage");
      await wait(real(900)); // the hero and the blobs settle in their spots
      await send("face", { x: (STAGE[0] + 1.6) * TILE, y: (STAGE[1] + 0.5) * TILE });
      await wait(real(120));
      const from = Date.now() - t0 - real(150);
      await send("cast", s.id);
      const ms = clipMs(s);
      await wait(real(ms));
      cuts.push({ id: s.id, from, ms });
      console.log(`${cls} ${s.id}`);
    }
    await send("chat", "/stage"); // clear thralls and leftovers before the last frames
    await page.close();
    await ctx.close(); // the video file is written now
    const video = path.join(vids, readdirSync(vids).find((f) => f.endsWith(".webm"))!);
    for (const c of cuts) {
      const file = path.join(OUT, `${c.id}.webp`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(c.from / 1000), "-t", String(real(c.ms) / 1000), "-i", video,
        "-vf", `fps=${FPS * SLOW},crop=${CROP.w}:${CROP.h}:${(W - CROP.w) / 2}:${(H - CROP.h) / 2},setpts=N/${FPS}/TB`,
        "-c:v", "libwebp_anim", "-loop", "0", "-quality", "72", "-compression_level", "6", "-r", String(FPS), file]);
      const frames = Math.round((c.ms / 1000) * FPS);
      clips[c.id] = { ms: c.ms, frames };
    }
  }
  await browser.close();
  writeFileSync(path.join(OUT, "clips.json"), JSON.stringify({ sources: clipSourcesHash(), clips }, null, 1) + "\n");
  rmSync(dir, { recursive: true, force: true });
  console.log(`${Object.keys(clips).length} clips in ${path.relative(ROOT, OUT)}`);
  stop(0);
})().catch((e) => { console.error("CAPTURE FAILED", e); stop(1); });

