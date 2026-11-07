// Browser check of the Summoner: picks the class, /max, walks out of Oakvale (no magic inside it), calls a golem,
// then the Colossus, and prints what the client draws. Start the production build first, then:
//   node tools/e2e-summoner.cjs 2620 <folder for screenshots>
const { chromium } = require("playwright");
const PORT = process.argv[2], OUT = process.argv[3];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });
  await page.addInitScript(() => { try { localStorage.setItem("cls", "summoner"); } catch {} });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + "/fireside.png" });
  await page.fill("#name", "Occultist");
  await page.fill("#password", "summonpass1");
  await page.click("#play");
  await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
  const label = await page.textContent("#pkgo");
  await page.screenshot({ path: OUT + "/pick.png" });
  await page.click("#pkgo");
  await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const send = (t, m) => page.evaluate(([t, m]) => window.__game.scene.scenes.find((s) => s.entities).room.send(t, m), [t, m]);
  await send("chat", "/max");
  await page.waitForTimeout(800);
  // walk out of the safe square first (golems can't stand in it): a few seconds east
  // walk out of the east gate with the click-to-walk router (world point past the gate on the east road)
  await page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); s.pointer.goal = { kind: "walk", x: 101 * 32, y: 59.5 * 32 }; s.pointer.route({ x: 101 * 32, y: 59.5 * 32 }); });
  let where = "";
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(500); where = (await page.textContent("#location"))?.trim() ?? ""; const me = await page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); const p = s.entities.get(s.me).state; return p.x; }); if (me > 96 * 32) break; }
  await page.waitForTimeout(1500);
  errors.push("area: " + where);
  await send("cast", "su_golem"); await page.waitForTimeout(700);
  await send("cast", "su_attune"); await page.waitForTimeout(300);
  await send("cast", "su_golem"); await page.waitForTimeout(1500);
  const badge = await page.textContent("#attune");
  await page.screenshot({ path: OUT + "/golems.png" });
  const info = await page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); const out = []; s.entities.forEach((e) => { if (e.state.owner) out.push({ kind: e.state.kind, tex: e.sprite.texture.key, label: e.label?.text }); }); return out; });
  await page.waitForTimeout(8500); // the Colossus cooldown is not the issue: skills were just cast, wait for mana
  await send("cast", "su_colossus"); await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + "/colossus.png" });
  const info2 = await page.evaluate(() => { const s = window.__game.scene.scenes.find((x) => x.entities); const out = []; s.entities.forEach((e) => { if (e.state.owner && !e.state.dead) out.push({ kind: e.state.kind, tex: e.sprite.texture.key, label: e.label?.text }); }); return out; });
  console.log(JSON.stringify({ label, badge, golems: info, colossus: info2, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
  const ok = info.some((g) => g.tex === `mob_${g.kind}`) && info2.some((g) => g.kind === "golem_colossus" && g.tex.startsWith("mob_golem_colossus_"))
    && !errors.some((e) => !e.startsWith("area:"));
  if (!ok) { console.error("E2E FAILED"); process.exit(1); }
  console.log("E2E OK");
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
