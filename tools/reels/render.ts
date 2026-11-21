// Renders a vertical Instagram reel (1080x1920, 9:16, 30 fps, H.264 + AAC) of real gameplay from a reel script.
// Run after `npm run build` (needs Playwright with Chromium and ffmpeg, like tools/skill-clips):
//   npx tsx tools/reels/render.ts reels/<slug>/reel.json
// Writes reels/<slug>/reel.mp4 (and cover.jpg). Publish it with the "Instagram reel" workflow
// (.github/workflows/instagram-reel.yml), only after Murat has watched it and said yes to that post.
//
// It reuses the skill clip method: the built server runs with SKILL_CAPTURE=1 ("/stage", "/goto tx ty") and both
// clocks slowed so the software-WebGL browser draws every frame; frames are read straight off the canvas in a
// 540x960 portrait window and scaled 2x (nearest, the pixels stay crisp). The HUD is hidden; reel texts are drawn in
// the game's own pixel fonts (client/public/fonts) and laid over the frames.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TILE } from "../../shared/constants";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright") as { chromium: any };
const ROOT = path.resolve(__dirname, "../..");
const PORT = 2691, FPS = 30, VW = 540, VH = 960, OW = 1080, OH = 1920;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One shot of the reel: a hero of `cls`, the camera on the hero or parked on a tile, some actions, `ms` of film. */
interface Shot {
  cls: string;
  time?: "day" | "dusk" | "night";
  zoom?: number;
  /** put the hero on this tile first ("/goto") */
  goto?: [number, number];
  /** fresh skill stage with three blobs ("/stage"), "weak" for Devour/Bite */
  stage?: boolean | "weak";
  /** camera parked on this tile (else it follows the hero); with `panTo` it glides there during the shot */
  look?: [number, number];
  panTo?: [number, number];
  /** skill casts at this many game ms into the shot (aimed east of the hero unless `aim` tile given) */
  casts?: { id: string; at: number; aim?: [number, number] | "mob" }[];
  /** the hero walks (WASD) through these tiles, from a moment before the shot starts, so it never opens static */
  route?: [number, number][];
  /** keys held: [key, from ms, to ms] */
  keys?: [string, number, number][];
  /** keep the game's moody colour grade (default true); false = plain daylight like the skills page */
  grade?: boolean;
  ms: number;
  /** text laid over the shot */
  text?: string;
  textAt?: "top" | "center";
  /** "voice": every line the same middle size, like a creator's caption (default "title": big first line) */
  textStyle?: "title" | "voice";
  /** darken the frame (end card) */
  dim?: boolean;
}
interface Reel { caption: string; music?: string; musicStart?: number; shots: Shot[] }

/** The reel texts as transparent 1080x1920 PNGs, drawn in the browser with the game's own fonts. */
async function textCards(browser: any, reel: Reel, dir: string) {
  const font = (f: string) => readFileSync(path.join(ROOT, "client/public/fonts", f)).toString("base64");
  const css = `@font-face{font-family:T;src:url(data:font/woff2;base64,${font("oakvale-title.woff2")})}
    @font-face{font-family:X;src:url(data:font/woff2;base64,${font("oakvale-text.woff2")})}
    html,body{margin:0;background:transparent;width:${OW}px;height:${OH}px;overflow:hidden}
    .box{position:absolute;left:70px;right:70px;text-align:center;color:#f1d9a0;font-family:T;font-size:84px;line-height:1.15;
      text-shadow:0 6px 0 #1a0f08,6px 0 0 #1a0f08,-6px 0 0 #1a0f08,0 -6px 0 #1a0f08,6px 6px 0 #1a0f08,-6px 6px 0 #1a0f08,6px -6px 0 #1a0f08,-6px -6px 0 #1a0f08}
    .box small{display:block;font-family:X;font-size:52px;color:#e8e0cc;margin-top:24px}
    .voice{font-size:62px;line-height:1.3}
    .top{top:300px}.center{top:50%;transform:translateY(-50%)}`;
  const page = await browser.newPage({ viewport: { width: OW, height: OH } });
  for (const [i, s] of reel.shots.entries()) {
    if (!s.text) continue;
    const [head, ...rest] = s.text.split("\n");
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const body = s.textStyle === "voice" ? [head, ...rest].map(esc).join("<br>") : `${esc(head)}${rest.length ? `<small>${rest.map(esc).join("<br>")}</small>` : ""}`;
    await page.setContent(`<style>${css}</style><div class="box ${s.textAt ?? "top"} ${s.textStyle ?? ""}">${body}</div>`);
    await page.evaluate(() => (document as any).fonts.ready);
    await page.screenshot({ path: path.join(dir, `text${i}.png`), omitBackground: true });
  }
  await page.close();
}

/** Films the shots of one hero session (same class and time of day) into frames/<shot index>/. */
async function session(browser: any, SLOW: number, shots: [number, Shot][], dir: string) {
  const first = shots[0][1];
  const saves = mkdtempSync(path.join(tmpdir(), "reel-saves-"));
  const server = spawn("node", ["-r", path.join(ROOT, "tools/skill-clips/slowtime.cjs"), "server-dist/index.cjs"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SLOW: String(SLOW), SKILL_CAPTURE: "1", DAY_TIME: first.time === "dusk" ? "0.685" : first.time ?? "day", SAVE_FILE: path.join(saves, "saves.json"), IDEAS_FILE: path.join(saves, "ideas.json"), DATABASE_URL: "" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const real = (ms: number) => ms / SLOW;
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
      if (i > 200) throw new Error("server did not start");
      await wait(300);
    }
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
      try { localStorage.setItem("cls", cls); localStorage.setItem("introSeen", "1"); localStorage.setItem("musicVol", "0"); } catch { /* private mode */ }
    }, { S: SLOW, cls: first.cls });
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
            if (!url) url = g.canvas.toDataURL("image/png");
            rec.frames.push(url); rec.next += ${1000 / FPS};
          }
        });
      };
      hook();
    })();` });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/?time=${first.time ?? "day"}&zoom=${first.zoom ?? 3}`);
    await page.fill("#name", first.cls[0].toUpperCase() + first.cls.slice(1));
    await page.fill("#password", "reelpass123");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 120000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 300000 });
    const send = (t: string, m: unknown) => page.evaluate(([t, m]: [string, unknown]) => (window as any).__game.scene.scenes.find((s: any) => s.entities).room.send(t, m), [t, m]);
    await page.addStyleTag({ content: "body > *:not(#game):not(canvas) { visibility: hidden !important } #game > *:not(canvas) { visibility: hidden !important }" });
    await send("chat", "/max");
    for (const [idx, s] of shots) {
      if (s.goto) await send("chat", `/goto ${s.goto[0]} ${s.goto[1]}`);
      if (s.stage) await send("chat", s.stage === "weak" ? "/stage weak" : "/stage");
      // camera: zoom, grade, parked or on the hero; snap there and let the ground paint
      await page.evaluate(({ s, TILE }: { s: Shot; TILE: number }) => {
        const sc = (window as any).__game.scene.scenes.find((x: any) => x.entities);
        const cam = sc.cameras.main;
        cam.setZoom(s.zoom ?? 3);
        if (s.grade === false) { sc.grade?.reset(); cam.postFX?.clear(); sc.grade = undefined; }
        const hero = sc.entities.get(sc.me)?.sprite;
        // a skill stage is framed between the hero and the blobs (CAPTURE_SPOT in server/TownRoom.ts)
        const look = s.look ?? (s.stage ? [100.4, 72] : undefined);
        const z = look ? sc.add.zone((look[0] + 0.5) * TILE, (look[1] + 0.5) * TILE, 1, 1) : hero;
        cam.startFollow(z, true, 1, 1);
        (window as any).__panZone = look ? z : undefined;
      }, { s, TILE });
      await wait(real(s.goto || s.stage ? 3500 : 600));
      if (s.panTo) {
        await page.evaluate(({ to, ms, TILE }: { to: [number, number]; ms: number; TILE: number }) => {
          const sc = (window as any).__game.scene.scenes.find((x: any) => x.entities);
          sc.cameras.main.setLerp(1, 1);
          sc.tweens.add({ targets: (window as any).__panZone, x: (to[0] + 0.5) * TILE, y: (to[1] + 0.5) * TILE, duration: ms, ease: "Sine.easeInOut" });
        }, { to: s.panTo, ms: s.ms, TILE });
      }
      const heroAt = () => page.evaluate(() => { const sc = (window as any).__game.scene.scenes.find((x: any) => x.entities); const e = sc.entities.get(sc.me).sprite; return [e.x, e.y] as [number, number]; });
      // walking: steer with WASD towards each tile of the route in turn
      let steering = !!s.route?.length;
      const held = new Set<string>();
      const steer = (async () => {
        let i = 0;
        while (steering && s.route && i < s.route.length) {
          const [x, y] = await heroAt(), tx = (s.route[i][0] + 0.5) * TILE, ty = (s.route[i][1] + 0.5) * TILE;
          const dx = tx - x, dy = ty - y;
          if (Math.hypot(dx, dy) < TILE * 0.6) { i++; continue; }
          const want = new Set<string>();
          if (Math.abs(dx) > TILE * 0.3) want.add(dx > 0 ? "d" : "a");
          if (Math.abs(dy) > TILE * 0.3) want.add(dy > 0 ? "s" : "w");
          for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
          for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
          await wait(real(60));
        }
        for (const k of held) await page.keyboard.up(k);
        held.clear();
      })();
      if (steering) await wait(real(500)); // already walking on the first frame
      await page.evaluate(() => { (window as any).__rec = { next: performance.now(), frames: [] }; });
      // actions at their game time into the shot
      const acts: [number, () => Promise<unknown>][] = [];
      for (const c of s.casts ?? []) acts.push([c.at, async () => {
        const me = await heroAt();
        let at = { x: me[0] + 1.6 * TILE, y: me[1] };
        if (c.aim === "mob") {
          // the nearest living monster on screen
          const m = await page.evaluate(([hx, hy]: number[]) => {
            const sc = (window as any).__game.scene.scenes.find((x: any) => x.entities);
            let best: number[] | undefined, bd = 1e9;
            for (const e of sc.entities.values()) {
              if (!e.mob || !e.sprite.visible || e.state?.dead) continue;
              const d = Math.hypot(e.sprite.x - hx, e.sprite.y - hy);
              if (d < bd) { bd = d; best = [e.sprite.x, e.sprite.y]; }
            }
            return best;
          }, me);
          if (m) at = { x: m[0], y: m[1] };
        } else if (c.aim) at = { x: (c.aim[0] + 0.5) * TILE, y: (c.aim[1] + 0.5) * TILE };
        await send("face", at);
        if (c.id === "attack") await send("attack", undefined); else await send("cast", c.id);
      }]);
      for (const [k, a, b] of s.keys ?? []) { acts.push([a, () => page.keyboard.down(k)]); acts.push([b, () => page.keyboard.up(k)]); }
      acts.sort((a, b) => a[0] - b[0]);
      const t0 = Date.now();
      for (const [at, fn] of acts) { const d = real(at) - (Date.now() - t0); if (d > 0) await wait(d); await fn(); }
      const left = real(s.ms) - (Date.now() - t0);
      if (left > 0) await wait(left);
      steering = false;
      await steer;
      const rec = await page.evaluate(() => { const r = (window as any).__rec; (window as any).__rec = null; return r; });
      const fdir = path.join(dir, `f${idx}`);
      mkdirSync(fdir, { recursive: true });
      const n = Math.round((s.ms / 1000) * FPS);
      for (let i = 0; i < n; i++) writeFileSync(path.join(fdir, `${String(i).padStart(4, "0")}.png`), Buffer.from(rec.frames[Math.min(i, rec.frames.length - 1)].split(",")[1], "base64"));
      console.log(`shot ${idx}: ${rec.frames.length} frames (${n} used)`);
    }
  } finally {
    await ctx.close();
    server.kill("SIGKILL");
    await wait(500);
    rmSync(saves, { recursive: true, force: true });
  }
}

/** Real frames per second the headless browser draws here, on the village square. */
async function measureFps(browser: any, dir: string): Promise<number> {
  await session(browser, 1, [[999, { cls: "vampire", ms: 3000 }]], dir);
  // a full-speed shot repeats each frame until a new one is drawn: count the distinct ones
  const uniq = Number(execFileSync("sh", ["-c", `md5sum ${path.join(dir, "f999")}/* | cut -c1-32 | uniq | wc -l`]).toString()) || 0;
  rmSync(path.join(dir, "f999"), { recursive: true, force: true });
  return uniq > 0 ? uniq / 3 : 4;
}

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npx tsx tools/reels/render.ts reels/<slug>/reel.json");
  const reel: Reel = JSON.parse(readFileSync(file, "utf8"));
  const out = path.dirname(path.resolve(file));
  const dir = mkdtempSync(path.join(tmpdir(), "reel-"));
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  try {
    const SLOW = Number(process.env.SLOW) || Math.min(1, Math.max(0.02, (await measureFpsSafe(browser, dir)) / (FPS * 1.6)));
    console.log(`game slowed to x${SLOW.toFixed(3)}`);
    await textCards(browser, reel, dir);
    // one hero session per run of shots with the same class and time of day
    const runs: [number, Shot][][] = [];
    reel.shots.forEach((s, i) => {
      const last = runs[runs.length - 1]?.[0]?.[1];
      if (last && last.cls === s.cls && (last.time ?? "day") === (s.time ?? "day")) runs[runs.length - 1].push([i, s]);
      else runs.push([[i, s]]);
    });
    for (const r of runs) await session(browser, SLOW, r, dir);
  } finally { await browser.close(); }

  // each shot: frames scaled 2x (crisp pixels), dimmed for an end card, its text faded in on top
  const segs: string[] = [];
  for (const [i, s] of reel.shots.entries()) {
    const seg = path.join(dir, `seg${i}.mp4`);
    const txt = path.join(dir, `text${i}.png`);
    const dur = s.ms / 1000, fade = Math.min(0.25, dur / 4);
    let vf = `[0:v]scale=${OW}:${OH}:flags=neighbor${s.dim ? ",eq=brightness=-0.08:saturation=0.8" : ""},format=yuva420p`;
    vf += i === reel.shots.length - 1 ? `,fade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5` : "";
    const args = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, `f${i}`, "%04d.png")];
    if (existsSync(txt)) {
      args.push("-loop", "1", "-framerate", String(FPS), "-i", txt);
      vf += `[b];[1:v]format=rgba,fade=t=in:st=0.15:d=${fade}:alpha=1[t];[b][t]overlay=0:0:shortest=1`;
    }
    args.push("-filter_complex", vf + ",format=yuv420p[v]", "-map", "[v]", "-t", dur.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "16", seg);
    execFileSync("ffmpeg", args);
    segs.push(seg);
  }
  const list = path.join(dir, "list.txt");
  writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n"));
  const total = reel.shots.reduce((t, s) => t + s.ms, 0) / 1000;
  const mp4 = path.join(out, "reel.mp4");
  const music = reel.music ? path.join(ROOT, "client/public/assets/music", reel.music) : "";
  const args = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list];
  if (music) args.push("-ss", String(reel.musicStart ?? 0), "-i", music, "-filter_complex", `[1:a]afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5,aresample=48000[a]`, "-map", "0:v", "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
  args.push("-t", total.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", mp4);
  execFileSync("ffmpeg", args);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", mp4, "-frames:v", "1", "-q:v", "3", path.join(out, "cover.jpg")]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`reel: ${path.relative(ROOT, mp4)} (${total.toFixed(1)} s)`);
  process.exit(0);
})().catch((e) => { console.error("REEL FAILED", e); process.exit(1); });

async function measureFpsSafe(browser: any, dir: string) {
  try { return await measureFps(browser, dir); } catch (e) { console.warn("fps measure failed, assuming 4 fps", e); return 4; }
}
