// Client load probe: starts the production server (server-dist/index.cjs) with temp saves, logs a hero in with
// headless Chromium, and measures the client in four phases (town, walking out, outside, fighting): scene object
// counts, draw calls, textures, and main-thread ms per frame for scene update and render.
//   npm run build && NODE_PATH=$(npm root -g) node tools/perf/client.cjs [width=1920] [height=1080|phone] [outDir]
//   `phone` as first arg (or width) uses Playwright's "Pixel 7" device.   CPUPROFILE=1: also write a fight CPU profile to outDir.
// Playwright is installed globally here, not in package.json, hence NODE_PATH. PORT=n picks the port (default 2641).
// Prints ONE compact JSON object; with outDir the full detail (top textures, object kinds, screenshots) goes there.
// NOTE: headless Chromium draws in software. Counts (objects, draw calls, textures, MB) are exact, but millisecond
// figures do NOT transfer to a real machine and say nothing about GPU cost. Use `?perf=1` on the real PC for that.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium, devices } = require("playwright");

const a = process.argv.slice(2);
const PHONE = a[0] === "phone";
const W = PHONE ? 0 : +(a[0] || 1920), H = PHONE ? 0 : +(a[1] || 1080);
const OUT = a[PHONE ? 1 : 2];
const PORT = +(process.env.PORT || 2641);
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-client-"));
const server = spawn("node", ["server-dist/index.cjs"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SAVE_FILE: path.join(tmp, "saves.json"), IDEAS_FILE: path.join(tmp, "ideas.json") },
  stdio: ["ignore", "ignore", "inherit"],
});
const stopServer = () => { try { server.kill("SIGKILL"); } catch { /* gone */ } };
process.on("exit", stopServer);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(1));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
    if (i > 100) throw new Error("server did not start (run npm run build first)");
    await wait(300);
  }
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
  try {
    const ctx = await browser.newContext(PHONE ? { ...devices["Pixel 7"] } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => {
      try { localStorage.setItem("cls", "summoner"); } catch { /* ignore */ }
      window.__dc = 0;
      for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) for (const f of ["drawArrays", "drawElements"]) { const o = P[f]; P[f] = function () { window.__dc++; return o.apply(this, arguments); }; }
    });
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector("#name");
    const msToLoginForm = Date.now() - t0;
    await wait(500);
    await page.fill("#name", "Perf" + (Date.now() % 100000));
    await page.fill("#password", "perfpass123");
    const t1 = Date.now();
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 30000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 120000 });
    const msLoginToPlay = Date.now() - t1;
    await wait(6000);
    await page.evaluate(() => {
      const g = window.__game, m = (window.__m = { upd: [], ren: [], dc: [], on: false });
      let x = 0, y = 0;
      g.events.on("prestep", () => { x = performance.now(); window.__dc = 0; });
      g.events.on("poststep", () => { y = performance.now(); if (m.on) m.upd.push(y - x); });
      g.events.on("postrender", () => { if (m.on) { m.ren.push(performance.now() - y); m.dc.push(window.__dc); } });
    });
    const sample = async (label, ms) => {
      await page.evaluate(() => { const m = window.__m; m.upd.length = m.ren.length = m.dc.length = 0; m.on = true; });
      await wait(ms);
      return page.evaluate((label) => {
        const m = window.__m; m.on = false;
        const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return +(s[Math.floor(s.length * p)] ?? 0).toFixed(2); };
        const avg = (arr) => +(arr.reduce((x, y) => x + y, 0) / (arr.length || 1)).toFixed(2);
        const g = window.__game, s = g.scene.scenes.find((x) => x.entities);
        let bytes = 0, n = 0; const big = [];
        for (const k of g.textures.getTextureKeys()) for (const src of g.textures.get(k).source) { const by = src.width * src.height * 4; bytes += by; n++; big.push([k, src.width, src.height, +(by / 1048576).toFixed(1)]); }
        big.sort((x, y) => y[3] - x[3]);
        const kinds = {}; for (const o of s.children.list) kinds[o.type] = (kinds[o.type] || 0) + 1;
        return {
          label, frames: m.upd.length, displayList: s.children.list.length, visible: s.children.list.filter((o) => o.visible).length,
          updateList: s.sys.updateList.length, drawCalls: avg(m.dc), textures: n, textureMB: +(bytes / 1048576).toFixed(0),
          updateMs: avg(m.upd), updateP95Ms: q(m.upd, 0.95), renderMs: avg(m.ren), renderP95Ms: q(m.ren, 0.95),
          tweens: s.tweens.getTweens().length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
          canvas: [g.canvas.width, g.canvas.height], detail: { kinds, topTextures: big.slice(0, 20), anims: g.anims.anims.size },
        };
      }, label);
    };
    const tag = PHONE ? "phone" : String(W);
    const shot = (name) => OUT ? page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) }) : null;
    const res = {};
    res.town = await sample("town, standing", 8000);
    await shot("town");
    const send = (t, m) => page.evaluate(([t, m]) => window.__game.scene.scenes.find((s) => s.entities).room.send(t, m), [t, m]);
    await send("chat", "/max");
    const walk = () => page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); s.pointer.goal = { kind: "walk", x: 101 * 32, y: 59.5 * 32 }; s.pointer.route({ x: 101 * 32, y: 59.5 * 32 }); });
    await walk();
    await wait(1000);
    res.walking = await sample("walking out of town", 8000);
    for (let i = 0; i < 80; i++) {
      await wait(500);
      const x = await page.evaluate(() => { const s = window.__game.scene.scenes.find((q) => q.entities); return s.entities.get(s.me).state.x; });
      if (x > 96 * 32) break;
      if (i % 12 === 11) await walk();
    }
    await wait(2000);
    res.outside = await sample("outside, standing", 6000);
    let cdp;
    if (process.env.CPUPROFILE && OUT) {
      cdp = await ctx.newCDPSession(page);
      await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start");
    }
    await page.evaluate(() => { const m = window.__m; m.upd.length = m.ren.length = m.dc.length = 0; m.on = true; });
    for (let i = 0; i < 40; i++) { for (const sk of ["su_wisps", "su_arsenal", "su_blades", "su_blackhole"]) await send("cast", sk); await send("attack"); await wait(200); }
    if (cdp) fs.writeFileSync(path.join(OUT, `fight-${tag}.cpuprofile`), JSON.stringify((await cdp.send("Profiler.stop")).profile));
    res.fight = await sample("outside, casting (tail)", 3000);
    await shot("fight");

    const full = { viewport: PHONE ? "Pixel 7" : [W, H], msToLoginForm, msLoginToPlay, phases: res, errors: errors.slice(0, 5) };
    if (OUT) fs.writeFileSync(path.join(OUT, `result-${tag}.json`), JSON.stringify(full, null, 1));
    const compact = JSON.parse(JSON.stringify(full));
    for (const p of Object.values(compact.phases)) delete p.detail;
    console.log(JSON.stringify(compact));
  } finally {
    await browser.close().catch(() => {});
  }
}
main().then(() => process.exit(0), (e) => { console.error("FAILED", e); process.exit(1); });
