// E2E for the Songweaver design ideas, client side (DI-1 note rings, DI-3 song gauge orb and swell effect), at desktop
// and phone sizes. Needs a DEV server on a fresh save file, and vite in front of it:
//   SAVE_FILE=/tmp/saves.json npx tsx server/index.ts      (port 2567)
//   npx vite --port 5180
//   node tools/e2e-songweaver-di.cjs 5180 docs/art [desktop|phone-portrait|phone-landscape]
// HARNESS: while the server side of DI is missing, the fx words `ch1` / `ch2` / `chlock` and the `swell` event are
// faked in the page (entity.state.fx is edited locally, events go through scene.onSkillFx). Once the server sends
// them, set FAKE=0 in the environment to rely on the real ones. Needs playwright (or playwright-core);
// set PLAYWRIGHT_CHROME=/path/to/chrome if its own browser is not installed.
let pw; try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const { chromium, devices } = pw;
const PORT = process.argv[2], OUT = process.argv[3];
const FAKE = process.env.FAKE !== "0";
const SETUPS = [
  ["desktop", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
  ["phone-portrait", devices["iPhone 13"]],
  ["phone-landscape", devices["iPhone 13 landscape"]],
];
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {});
  const report = {};
  for (const [name, opts] of SETUPS) {
    if (process.argv[4] && process.argv[4] !== name) continue;
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" || /refId|decode/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => { try { localStorage.setItem("cls", "songweaver"); } catch {} });
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1500);
    await page.fill("#name", "Di" + name.replace(/[^a-z]/g, "").slice(0, 10));
    await page.fill("#password", "songpass1");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { window.S = window.__game.scene.scenes.find((s) => s.entities); window.evs = []; const o = window.S.fx.onEvent.bind(window.S.fx); window.S.fx.onEvent = (ev) => { window.evs.push(ev.ev); return o(ev); }; });
    const send = (t, m) => page.evaluate(([t, m]) => window.S.room.send(t, m), [t, m]);
    const shot = (n) => page.screenshot({ path: `${OUT}/songweaver-di-${name}-${n}.png` });
    const rings = () => page.evaluate(() => { const r = window.S.fx.songRings.get(window.S.me); return r && { rings: r.rings.length, bursts: r.bursts.length, lockFrom: r.lockFrom > 0 }; });
    const setFx = (words) => page.evaluate((w) => { const st = window.S.entities.get(window.S.me).state; st.fx = [(st.fx || "").split(",").filter((x) => x && !/^(ch1|ch2|chlock)$/.test(x)), w].flat().join(","); }, words);
    const result = {};
    await send("chat", "/max");
    await page.waitForTimeout(1200);
    // ---- Chorus: a base ring under her; then three notes = three rings ----
    await send("cast", "sg_ballad");
    await page.waitForTimeout(1500);
    result.chorus = await rings();
    await shot("1-chorus-ring");
    await send("cast", "sg_pedal");
    await page.waitForTimeout(500);
    result.afterNote2 = await rings();
    if (FAKE) await setFx(["ch2"]);
    await shot("2-two-rings");
    await send("cast", "sg_mend");
    await page.waitForTimeout(500);
    result.afterNote3 = await rings();
    await shot("3-three-rings");
    // ---- chord burst (the real Amen: vi, IV, I) ----
    await page.waitForTimeout(2300);
    await send("cast", "sg_ballad");
    await page.waitForTimeout(350);
    result.afterChord = await rings();
    result.chordSeen = await page.evaluate(() => window.evs.includes("chord"));
    await shot("4-chord-burst");
    if (FAKE) await setFx(["chlock"]);
    await page.waitForTimeout(2000);
    result.lock = await rings();
    await shot("5-lockout-ring");
    // ---- the chord panel is gone; the legend sits behind a "?" on the skills page ----
    result.panelGone = await page.evaluate(() => !document.getElementById("chordhud"));
    await page.keyboard.press("t");
    await page.waitForTimeout(600);
    await shot("6-skills-page");
    // HARNESS (FAKE): the owner-only "songbook" message, as the server will send it (two songs found, some materials)
    const emit = (t, m) => page.evaluate(([t, m]) => window.S.room.onMessageHandlers.emit(t, m), [t, m]);
    if (FAKE) await emit("songbook", { songs: ["song_hum", "song_pond"], mats: { tonewood: 7, brass: 3, bone: 12, silk: 0, horn: 2, sunglass: 1 } });
    result.sbButton = !!(await page.$(".sbbtn"));
    const help = await page.$(".chhelp");
    result.helpButton = !!help;
    if (help) { await help.click(); await page.waitForTimeout(300); await shot("7-songbook-reader"); result.legend = await page.evaluate(() => document.getElementById("songbook")?.innerText.slice(0, 80)); await page.click("#songbook .sb-x"); }
    await page.keyboard.press("t");
    await page.waitForTimeout(300);
    // ---- song gauge orb: empty, half, nearly full (pulsing) ----
    result.orb = await page.evaluate(() => { const o = document.querySelector("#orbhud .orb.mp"); return { cls: o.className, label: o.querySelector(".olabel").textContent, title: o.title }; });
    await shot("8-gauge-orb");
    if (FAKE) {
      const set = (mp) => page.evaluate((mp) => { window.S.resBars.orbs.update(100, 100, mp, 100, true); }, mp);
      await set(0); await page.waitForTimeout(300); await shot("9-gauge-empty");
      await set(55); await page.waitForTimeout(300); await shot("10-gauge-half");
      await set(97); await page.waitForTimeout(500); await shot("11-gauge-full");
      result.orbFull = await page.evaluate(() => document.querySelector("#orbhud .orb.mp").className);
    }
    result.tempoIcon = await page.evaluate(() => !!document.querySelector("#hotbar .slot.charge"));
    // ---- swell: one burst per book, and the no-book puff ----
    for (const book of ["songweaver_shield", "bk_hymnal", "bk_march", "bk_dissonance", null]) {
      await page.evaluate((book) => { const m = window.S.entities.get(window.S.me); window.S.onSkillFx({ ev: "swell", id: window.S.me, book, x: m.sprite.x, y: m.sprite.y, fizzle: book ? undefined : true }); }, book);
      await page.waitForTimeout(150);
      await shot(`12-swell-${book ?? "fizzle"}`);
      await page.waitForTimeout(900);
    }
    // ---- C1 / C2 / D1 / D2 client, with faked server events and a faked lute-maker (the server side lands later) ----
    if (FAKE) {
      const me = () => page.evaluate(() => { const m = window.S.entities.get(window.S.me); return { x: m.sprite.x, y: m.sprite.y }; });
      // new song banner + effect
      await page.evaluate(() => window.S.onSkillFx({ ev: "newsong", id: window.S.me, song: "song_round" }));
      await page.waitForTimeout(500);
      result.banner = await page.evaluate(() => document.getElementById("newsong")?.innerText);
      await shot("13-newsong");
      await page.waitForTimeout(3500);
      // material pickup, lute fit and break effects, all at once
      await page.evaluate(() => { const m = window.S.entities.get(window.S.me), s = window.S;
        s.onSkillFx({ ev: "matpick", id: s.me, mat: "silk", n: 2, x: m.sprite.x + 20, y: m.sprite.y });
        s.onSkillFx({ ev: "lutefit", id: s.me, trait: "steel" });
        s.onSkillFx({ ev: "break", id: s.me, mat: "tonewood", n: 5 }); });
      await page.waitForTimeout(400);
      await shot("14-mat-fit-break-fx");
      await page.waitForTimeout(1200);
      // bag: lute (bound) and a sword (can't wear) -> tooltips
      await page.evaluate(() => { const b = window.S.entities.get(window.S.me).state.bag; b.push("songweaver_weapon"); b.push("w_bronze"); b.push("sh_iron"); });
      await page.keyboard.press("g");
      await page.waitForTimeout(800);
      const cells = await page.$$("#gearbag .gcell:not([disabled])");
      result.bagCells = cells.length;
      if (cells.length >= 2) {
        await cells[0].hover(); await page.waitForTimeout(200);
        result.luteTip = await page.evaluate(() => document.getElementById("gearinfo").innerText);
        await cells[1].hover(); await page.waitForTimeout(200);
        result.swordTip = await page.evaluate(() => document.getElementById("gearinfo").innerText);
        await shot("15-gear-cant-wear");
      }
      await page.keyboard.press("g");
      await page.waitForTimeout(300);
      // lute-maker panel (Wren is not in shared/npcs.ts yet: open the panel on a fake NPC)
      await page.evaluate(() => { const n = window.S.npcs; n.close = () => {}; n.open({ id: "lutemaker", name: "Wren", title: "Lute-maker" }); });
      await page.waitForTimeout(500);
      result.lm = await page.evaluate(() => document.getElementById("npcdialog").innerText.slice(0, 700));
      await shot("16-lutemaker-traits");
      await page.click(".lm-tab[data-tab=break]");
      await page.waitForTimeout(400);
      result.lmBreak = await page.evaluate(() => document.getElementById("npcdialog").innerText.slice(0, 700));
      await shot("17-lutemaker-break");
      result.dialogFits = await page.evaluate(() => { const r = document.getElementById("npcdialog").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; });
      await page.evaluate(() => { const n = window.S.npcs; delete n.close; n.close(); });
    }
    result.errors = errors.slice(0, 8);
    report[name] = result;
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  const bad = Object.entries(report).filter(([, r]) => !r.panelGone || !r.helpButton || !r.chorus || (FAKE && (!r.sbButton || !/New song/.test(r.banner || "") || !/Can't wear/.test(r.swordTip || "") || !/Steel/.test(r.lm || "") || !r.dialogFits)) || r.errors.some((e) => !/refId|decode|addCallback/i.test(e)));
  if (bad.length) { console.error("E2E FAILED:", bad.map(([k]) => k).join(", ")); process.exit(1); }
  console.log("E2E OK");
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
