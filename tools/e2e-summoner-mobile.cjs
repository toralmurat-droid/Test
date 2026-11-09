// Browser check of the Summoner's HUD on desktop and phones (iPhone and Pixel emulation, portrait and landscape):
// the grimoire panel shows, a real click / tap on it changes the first golem to frost, and the panel overlaps no other
// HUD box. Screenshots for each setup (town, out, picker open, after). Start the production build on a fresh save
// file first (an existing account skips the class picker), then:
//   node tools/e2e-summoner-mobile.cjs 2620 <folder for screenshots>
const { chromium, devices } = require("playwright");
const PORT = process.argv[2], OUT = process.argv[3];
const SETUPS = [
  ["desktop", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
  ["iphone-portrait", devices["iPhone 13"]],
  ["iphone-landscape", devices["iPhone 13 landscape"]],
  ["pixel-portrait", devices["Pixel 7"]],
  ["pixel-landscape", devices["Pixel 7 landscape"]],
];
(async () => {
  const browser = await chromium.launch();
  const report = {};
  for (const [name, opts] of SETUPS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => { try { localStorage.setItem("cls", "summoner"); } catch {} });
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1500);
    await page.fill("#name", "Ui" + name.replace(/[^a-z]/g, "").slice(0, 10));
    await page.fill("#password", "summonpass1");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(2500);
    const send = (t, m) => page.evaluate(([t, m]) => window.__game.scene.scenes.find((s) => s.entities).room.send(t, m), [t, m]);
    await page.screenshot({ path: `${OUT}/${name}-town.png` });
    const townTxt = await page.evaluate(() => document.getElementById("grimoire")?.innerText);
    await send("chat", "/max");
    await page.waitForTimeout(800);
    const walk = () => page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); s.pointer.goal = { kind: "walk", x: 101 * 32, y: 59.5 * 32 }; s.pointer.route({ x: 101 * 32, y: 59.5 * 32 }); });
    await walk();
    for (let i = 0; i < 120; i++) { await page.waitForTimeout(500); const x = await page.evaluate(() => { const s = window.__game.scene.scenes.find((q) => q.entities); return s.entities.get(s.me).state.x; }); if (x > 96 * 32) break; if (i % 10 === 9) await walk(); }
    await page.waitForTimeout(2500);
    await send("cast", "su_wisps");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${name}-out.png` });
    const outTxt = await page.evaluate(() => document.getElementById("grimoire")?.innerText);
    // open page 1 and pick Frost through the HUD itself (a real click / tap)
    await page.click('#grimoire [data-slot="0"]');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${name}-pick.png` });
    await page.click('#grimoire [data-el="cold"]');
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => { const s = window.__game.scene.scenes.find((q) => q.entities); const out = []; s.entities.forEach((e) => { if (e.state.owner === s.me && !e.state.dead && e.state.kind.startsWith("golem")) out.push(e.state.kind); }); return { kinds: out, txt: document.getElementById("grimoire")?.innerText }; });
    // overlap check: grimoire box vs every other visible HUD box
    const overlaps = await page.evaluate(() => {
      const g = document.getElementById("grimoire").getBoundingClientRect(), out = [];
      for (const id of ["hotbar", "buffs", "chat", "chatlog", "menubtns", "xpbar", "stats", "mapbox", "rbars", "lvlnote", "hudbar", "questtracker", "online"]) {
        const el = document.getElementById(id); if (!el || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (r.left < g.right && r.right > g.left && r.top < g.bottom && r.bottom > g.top) out.push(id);
      }
      for (const c of document.querySelectorAll("#orbhud .orb, #orbhud .garg")) { const r = c.getBoundingClientRect(); if (r.left < g.right && r.right > g.left && r.top < g.bottom && r.bottom > g.top) out.push(c.className); }
      return { box: [Math.round(g.left), Math.round(g.top), Math.round(g.width), Math.round(g.height)], vw: innerWidth, vh: innerHeight, hits: out };
    });
    await page.screenshot({ path: `${OUT}/${name}-after.png` });
    report[name] = { townTxt, outTxt, after, overlaps, errors: errors.slice(0, 5) };
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  const bad = Object.entries(report).filter(([, r]) => !r.after.kinds.includes("golem_cold") || r.overlaps.hits.length || r.errors.length);
  if (bad.length) { console.error("E2E FAILED:", bad.map(([k]) => k).join(", ")); process.exit(1); }
  console.log("E2E OK");
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
