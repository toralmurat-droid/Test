// Browser check: two real players log in to a running server and must see each other move.
// Start the production build first (npm run build && PORT=2620 npm start), then:
//   node tools/e2e-two-players.cjs 2620 <folder for screenshots>
// Needs Playwright with Chromium (npx playwright install chromium). Prints what player A sees of player B.
const { chromium } = require("playwright");
const PORT = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function hero(name) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${name} console: ${m.text()}`); });
    await page.goto(`http://localhost:${PORT}/`);
    await page.fill("#name", name);
    await page.fill("#password", "browserpass1");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(3000);
    return page;
  }
  const a = await hero("AlphaTest"), b = await hero("BravoTest");
  // What each scene knows about the other (entities map holds every synced hero)
  const seen = (page) => page.evaluate(() => {
    const s = window.__game?.scene?.scenes?.find((x) => x.entities) ?? null;
    if (!s) return null;
    const out = {};
    s.entities.forEach((e, id) => { if (e.state && e.state.name) out[e.state.name] = { x: Math.round(e.state.x), y: Math.round(e.state.y) }; });
    return out;
  });
  const before = await seen(a);
  await b.keyboard.down("KeyD"); await b.waitForTimeout(1500); await b.keyboard.up("KeyD");
  await a.waitForTimeout(800);
  const after = await seen(a);
  await a.screenshot({ path: process.argv[3] + "/alpha.png" });
  await b.screenshot({ path: process.argv[3] + "/bravo.png" });
  console.log(JSON.stringify({ before, after, errors: errors.slice(0, 10) }));
  await browser.close();
  const moved = before?.BravoTest && after?.BravoTest && (before.BravoTest.x !== after.BravoTest.x || before.BravoTest.y !== after.BravoTest.y);
  if (!moved || errors.length) { console.error("E2E FAILED: player A did not see player B move, or the page logged errors"); process.exit(1); }
  console.log("E2E OK");
})().catch((e) => { console.error("E2E FAILED", e); process.exit(1); });
