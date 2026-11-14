// Browser check of on-demand character sheets (client/src/artAssets.ts ensureCharSheet): after login only the hero's
// sheet is loaded; NPCs, townsfolk, the watch and other heroes must appear as their sheets arrive, never as a
// missing-texture box. Starts its own server on PORT (default 2661) with a fresh save, kills it at the end.
//   npm run build && PORT=2661 NODE_PATH=$(npm root -g) node tools/e2e-sheets.cjs <outDir> [width=1920] [height=1080]
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = +(process.env.PORT || 2661), OUT = process.argv[2], W = +(process.argv[3] || 1920), H = +(process.argv[4] || 1080);
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-sheets-"));
const server = spawn("node", ["server-dist/index.cjs"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SAVE_FILE: path.join(tmp, "saves.json"), IDEAS_FILE: path.join(tmp, "ideas.json") }, stdio: ["ignore", "ignore", "inherit"] });
const stop = () => { try { server.kill("SIGKILL"); } catch { /* gone */ } };
process.on("exit", stop);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [], report = { size: [W, H], checks: {} };

/** In the page: sheets loaded, and every drawn sprite that shows a placeholder / missing texture. */
const probe = () => {
  const g = window.__game, s = g.scene.scenes.find((x) => x.entities && x.npcs && x.entities.get(x.me));
  if (!s) return { notReady: true, bad: [], sheets: [], sheetCount: 0 };
  const sheets = g.textures.getTextureKeys().filter((k) => g.textures.get(k).source[0] && g.textures.get(k).source[0].height === 5760);
  const cam = s.cameras.main, v = cam.worldView, bad = [];
  for (const o of s.children.list) {
    if (o.type !== "Sprite" || !o.visible || !o.texture) continue;
    if (o.texture.key === "__MISSING" || o.texture.key === "__DEFAULT") bad.push([o.texture.key, Math.round(o.x), Math.round(o.y)]);
  }
  const ents = []; s.entities.forEach((e, id) => { if (!e.mob) ents.push({ name: e.state.name, cls: e.state.cls, hero: e.hero || null, waiting: e.waiting || null, vis: e.sprite.visible, tex: e.sprite.texture.key, gear: e.gear ? Object.keys(e.gear.sprites || {}).length : 0 }); });
  const npcs = []; for (const [id, n] of s.npcs.sprites) npcs.push({ id, vis: n.sprite.visible, tex: n.sprite.texture.key, d: Math.round(Math.hypot(n.sprite.x - s.entities.get(s.me).sprite.x, n.sprite.y - s.entities.get(s.me).sprite.y)), x: Math.round(n.sprite.x), y: Math.round(n.sprite.y) });
  return { sheets, sheetCount: sheets.length, textureMB: Math.round(g.textures.getTextureKeys().reduce((a, k) => a + g.textures.get(k).source.reduce((b, src) => b + src.width * src.height * 4, 0), 0) / 1048576), bad, ents, npcs, anims: g.anims.anims.size, log: window.__sheetLog };
};

/** `failFirst`: abort the first two requests of these sheets, to see the retry (the townsfolk's "elder" is asked for at once). */
async function login(browser, name, cls, failFirst = []) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const fails = {};
  for (const f of failFirst) await page.route(`**/characters/${f}.webp*`, (r) => { fails[f] = (fails[f] || 0) + 1; return fails[f] <= 2 ? r.abort() : r.continue(); });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if ((m.type() === "error" && !/Failed to load resource/.test(m.text())) || /refId|definition mismatch/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await page.addInitScript((c) => { try { localStorage.setItem("cls", c); } catch { /* ignore */ } window.__longTasks = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ["longtask"] }); } catch { /* no longtask */ } }, cls);
  await page.goto(`http://localhost:${PORT}/${process.env.QS || ""}`);
  await page.waitForSelector("#name");
  await page.fill("#name", name);
  await page.fill("#password", "sheetspass1");
  await page.click("#play");
  await page.waitForSelector("#pkgo", { state: "visible", timeout: 60000 });
  const t = Date.now();
  await page.click("#pkgo");
  await page.waitForSelector("#hud:not([hidden])", { timeout: 180000 });
  await page.evaluate(() => { // cost of creating each arriving texture (decode result -> GPU upload) on the main thread
    const tm = window.__game.textures, o = tm.addSpriteSheet.bind(tm); window.__addMs = [];
    tm.addSpriteSheet = (k, img, cfg) => { const t0 = performance.now(); const r = o(k, img, cfg); window.__addMs.push([k, Math.round((performance.now() - t0) * 10) / 10]); return r; };
  });
  return { page, ms: Date.now() - t };
}

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
    if (i > 100) throw new Error("server did not start");
    await wait(300);
  }
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
  try {
    const A = await login(browser, "SheetA" + (Date.now() % 10000), process.env.CLS_A || "summoner", ["elder"]);
    const page = A.page;
    report.loginToPlayMs = A.ms;
    await wait(1000);
    await page.screenshot({ path: path.join(OUT, `a-1s-${W}.png`) });
    report.at1s = await page.evaluate(probe);
    report.addMsEarly = await page.evaluate(() => window.__addMs);
    await wait(4000);
    await page.screenshot({ path: path.join(OUT, `a-5s-${W}.png`) });
    report.at5s = await page.evaluate(probe);

    // walk to NPCs around town and look at each
    const npcsToVisit = ["druid", "weaponsmith", "witch", "armourer", "fisher", "captain"];
    report.visits = [];
    for (const id of npcsToVisit) {
      const pos = await page.evaluate((id) => { const s = window.__game.scene.scenes.find((x) => x.entities); const n = s.npcs.sprites.get(id); return n ? { x: n.sprite.x, y: n.sprite.y } : null; }, id);
      if (!pos) { report.visits.push({ id, error: "no sprite" }); continue; }
      const go = () => page.evaluate((p) => { const s = window.__game.scene.scenes.find((x) => x.entities); const g = { kind: "walk", x: p.x, y: p.y + 14 }; s.pointer.goal = g; s.pointer.route(g); }, pos);
      await go();
      for (let i = 0; i < 120; i++) {
        await wait(500);
        const d = await page.evaluate((p) => { const s = window.__game.scene.scenes.find((x) => x.entities); const m = s.entities.get(s.me).sprite; return Math.hypot(m.x - p.x, m.y - p.y); }, pos);
        if (d < 40) break;
        if (i % 10 === 9) await go();
      }
      await wait(800);
      const r = await page.evaluate(probe);
      const me = r.npcs.find((n) => n.id === id);
      report.visits.push({ id, d: me && me.d, vis: me && me.vis, tex: me && me.tex, bad: r.bad, sheetCount: r.sheetCount });
      await page.screenshot({ path: path.join(OUT, `npc-${id}-${W}.png`) });
      if (me && me.vis && me.d < 45) { // any NPC we reached: talk to it
        await page.keyboard.press("KeyE");
        await wait(1200);
        const dlg = await page.evaluate(() => { const d = document.getElementById("npcdialog"); return { open: d.classList.contains("open"), text: d.innerText.slice(0, 60) }; });
        (report.dialogs = report.dialogs || []).push({ id, ...dlg }); report.dialog = dlg;
        await page.screenshot({ path: path.join(OUT, `dialog-${id}-${W}.png`) });
        await page.evaluate(() => { const b = document.querySelector("#npcdialog .nd-bye"); if (b) b.click(); });
        await wait(300);
      }
    }

    // a second player of another class appears: the first looks at them
    const B = await login(browser, "SheetB" + (Date.now() % 10000), process.env.CLS_B || "wizard");
    report.second = { loginToPlayMs: B.ms };
    await wait(2500);
    // bring A next to B's spawn is not needed (both spawn in Oakvale); look at what A has
    const goB = () => page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); let other; s.entities.forEach((e, id) => { if (id !== s.me && !e.mob) other = e; }); if (other) { const g = { kind: "walk", x: other.sprite.x + 20, y: other.sprite.y + 6 }; s.pointer.goal = g; s.pointer.route(g); } });
    await goB();
    for (let i = 0; i < 120; i++) { await wait(500); if (i % 10 === 9) await goB(); const d = await page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); let o; s.entities.forEach((e, id) => { if (id !== s.me && !e.mob) o = e; }); const m = s.entities.get(s.me).sprite; return o ? Math.hypot(o.sprite.x - m.x, o.sprite.y - m.y) : 9999; }); if (d < 60) break; }
    await wait(1500);
    report.addMs = await page.evaluate(() => window.__addMs);
    report.afterSecond = await page.evaluate(probe);
    await page.screenshot({ path: path.join(OUT, `a-sees-b-${W}.png`) });
    await B.page.screenshot({ path: path.join(OUT, `b-${W}.png`) });
    // out of town into the meadow (grass and ground must be there; use QS="?time=day" to see it by day)
    const out = () => page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); const g = { kind: "walk", x: 101 * 32, y: 59.5 * 32 }; s.pointer.goal = g; s.pointer.route(g); });
    await out();
    for (let i = 0; i < 100; i++) { await wait(500); if (i % 10 === 9) await out(); const x = await page.evaluate(() => { const s = window.__game.scene.scenes.find((q) => q.entities); return s.entities.get(s.me).state.x; }); if (x > 100 * 32) break; }
    await wait(2500);
    await page.screenshot({ path: path.join(OUT, `meadow-${W}.png`) });
    report.afterMeadow = await page.evaluate(probe);
    report.longTasks = await page.evaluate(() => window.__longTasks);
    report.errors = errors.slice(0, 12);
    fs.writeFileSync(path.join(OUT, `report-${W}.json`), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ ...report, at1s: { ...report.at1s, ents: undefined, npcs: undefined }, at5s: { ...report.at5s, ents: undefined, npcs: undefined } }));
  } finally {
    await browser.close().catch(() => {});
  }
})().then(() => process.exit(0), (e) => { console.error("FAILED", e); process.exit(1); });
