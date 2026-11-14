// E2E for the Songweaver design ideas (DI-1 note rings, DI-3 song gauge and swell, DI-2 books and songs, DI-5 lute and
// Wren), against the REAL server, at the two desktop sizes. Nothing is faked: the fx words, the gauge, the events and the
// "songbook" message all come from the server. Needs a DEV server (NODE_ENV not production: /max, /god and /tp exist) on a
// fresh save file, and vite in front of it:
//   SAVE_FILE=/tmp/saves.json npx tsx server/index.ts      (port 2567)
//   npx vite --port 5180
//   node tools/e2e-songweaver-di.cjs 5180 docs/art [desktop|desktop-1366]
// The dev commands used: /max (level, skills, 1,000,000 gold), /god, /tp x y. There is no command that grants materials,
// so tonewood and brass come from breaking bought weapons at Wren, and bone from a real skeleton drop.
// FAKE is gone: the old fx / event / "songbook" fakes were removed when the server side landed.
// Needs playwright (or playwright-core); set PLAYWRIGHT_CHROME=/path/to/chrome if its own browser is not installed.
let pw; try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const { chromium } = pw;
const PORT = process.argv[2], OUT = process.argv[3];
const SETUPS = [
  // desktop only (mouse and keyboard): the two screen sizes CLAUDE.md asks for
  ["desktop", { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }],
  ["desktop-1366", { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {});
  const report = {}, fails = [];
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
    await page.fill("#name", "Di" + name.replace(/[^a-z]/g, "").slice(0, 8) + String(Date.now()).slice(-5));
    await page.fill("#password", "songpass1");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(2500);
    // hooks: every sfx event the scene routes to the effects, "gearno" and "shop" answers
    await page.evaluate(() => {
      const S = window.S = window.__game.scene.scenes.find((s) => s.entities);
      window.evs = []; window.gearno = []; window.shopMsgs = [];
      const o = S.fx.onEvent.bind(S.fx); S.fx.onEvent = (ev) => { window.evs.push(ev); return o(ev); };
      S.room.onMessage("gearno", (m) => window.gearno.push(m.text));
      S.room.onMessage("shop", (m) => window.shopMsgs.push(m));
    });
    const send = (t, m) => page.evaluate(([t, m]) => window.S.room.send(t, m), [t, m]);
    const shot = (n) => page.screenshot({ path: `${OUT}/songweaver-di-${name}-${n}.png` });
    const P = () => page.evaluate(() => { const p = window.S.room.state.players.get(window.S.me); return { x: p.x / 32, y: p.y / 32, level: p.level, gold: p.me?.gold, weapon: p.weapon, shield: p.shield, mana: (p.me?.mp ?? 0) % 1000, maxMana: Math.floor((p.me?.mp ?? 0) / 1000) % 1000, fx: p.fx, bag: [...p.bag] }; });
    const fxWords = async () => (await P()).fx.split(",");
    const rings = () => page.evaluate(() => { const r = window.S.fx.songRings.get(window.S.me); return r && { rings: r.rings.length, bursts: r.bursts.length, lock: r.lockFrom > 0, held: r.held }; });
    const count = (ev) => page.evaluate((ev) => window.evs.filter((e) => e.ev === ev).length, ev);
    const tp = async (x, y) => { await send("chat", `/tp ${x} ${y}`); await page.waitForTimeout(700); };
    const say = (text) => send("chat", text);
    const result = {}, check = (k, ok, info) => { result[k] = ok ? "ok" : `FAIL ${JSON.stringify(info ?? "")}`; if (!ok) { fails.push(`${name}: ${k} ${JSON.stringify(info ?? "")}`); console.log(`  FAIL ${name}: ${k} ${JSON.stringify(info ?? "").slice(0, 300)}`); } };
    const closePanels = async () => { for (const sel of ["#songbook .sb-x", ".ql-close"]) { const b = await page.$(sel); if (b && await b.isVisible()) await b.click(); } };
    // nearest mob of these kinds, in tiles, or undefined
    const nearest = (kinds) => page.evaluate((kinds) => { const me = window.S.entities.get(window.S.me); let best; window.S.entities.forEach((e, id) => { if (id === window.S.me || !kinds.includes(e.state.kind) || e.state.dead || e.state.hp <= 0) return; const d = Math.hypot(e.sprite.x - me.sprite.x, e.sprite.y - me.sprite.y); if (!best || d < best.d) best = { id, d, x: e.sprite.x, y: e.sprite.y }; }); return best; }, kinds);
    // walk up to a mob (a jump next to it) and hit it with basic attacks until it is gone
    const kill = async (kinds, off = 1) => {
      const m = await nearest(kinds);
      if (!m) return false;
      await send("chat", `/tp ${Math.floor(m.x / 32) + off}${Math.floor(m.y / 32)}`); await page.waitForTimeout(350);
      for (let i = 0; i < 10; i++) {
        const cur = await page.evaluate((id) => { const e = window.S.entities.get(id); return e && !e.state.dead && e.state.hp > 0 ? { x: e.sprite.x, y: e.sprite.y } : null; }, m.id);
        if (!cur) return true;
        await send("face", { x: cur.x, y: cur.y }); await send("attack"); await page.waitForTimeout(300);
      }
      return false;
    };
    await send("chat", "/max");
    await send("chat", "/god");
    await page.waitForTimeout(1500);
    const first = await P();
    check("hasLuteAndSongbook", /^songweaver_weapon/.test(first.weapon) && first.shield === "songweaver_shield", first);
    check("gaugeStartsEmpty", first.mana === 0 && first.maxMana === 100, { mana: first.mana, max: first.maxMana });

    // ---- the tutorial for a Songweaver: the first quest gives a book, not a sword ----
    await tp(82, 61);
    let accept = null; // the "E Talk" prompt needs a moment after the jump: press again if nothing opened
    for (let i = 0; i < 4 && !accept; i++) { await page.keyboard.press("e"); accept = await page.waitForSelector(".nd-accept", { timeout: 2000 }).catch(() => null); }
    check("rowanOffers", !!accept, await page.evaluate(() => [window.S.room.state.players.get(window.S.me).x / 32, window.S.room.state.players.get(window.S.me).y / 32, document.getElementById("npcdialog")?.className, document.getElementById("npcdialog")?.innerText.slice(0, 120)]));
    if (accept) await accept.click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await tp(101, 19);
    for (let i = 0; i < 12 && !(await page.evaluate(() => /Wear your new book/.test(document.body.innerText))); i++) await kill(["slime"]);
    await page.waitForTimeout(600);
    const trk = await page.evaluate(() => (document.getElementById("questtracker") || {}).innerText || "");
    check("trackerSaysBook", /book/i.test(trk) && !/weapon/i.test(trk), trk.slice(0, 200));
    check("bagHasGiftBook", (await P()).bag.some((b) => b.startsWith("bk_hymnal")), (await P()).bag);
    await shot("1-tutorial-tracker");

    // ---- DI-1 rings: a Chorus base ring, then vi - IV - I really played (the Chorus is not refreshed) ----
    await send("cast", "sg_ballad");
    await page.waitForTimeout(1500);
    result.chorus = await rings();
    check("chorusBaseRing", !!result.chorus);
    await send("cast", "sg_pedal"); // vi
    await page.waitForTimeout(700);
    result.afterVi = await rings();
    check("ch1Word", (await fxWords()).includes("ch1"), await fxWords());
    check("oneRing", result.afterVi && result.afterVi.held === 1 && result.afterVi.rings >= 1, result.afterVi);
    await send("cast", "sg_mend"); // IV
    await page.waitForTimeout(700);
    result.afterIV = await rings();
    check("ch2Word", (await fxWords()).includes("ch2"), await fxWords());
    check("twoRings", result.afterIV && result.afterIV.held === 2 && result.afterIV.rings >= 2, result.afterIV);
    await shot("2-two-rings");
    const notesBefore = await count("note");
    await send("cast", "sg_ballad"); // the same Chorus again with more than 10 s left: no note, no fill
    await page.waitForTimeout(500);
    check("chorusRefreshIsNoNote", (await count("note")) === notesBefore, { before: notesBefore, after: await count("note") });
    await page.waitForTimeout(2200); // a change of song waits SONG.changeMs
    const gaugeBefore = (await P()).mana; result.gaugeTrace = [gaugeBefore];
    await send("cast", "sg_march"); // I: a different Chorus, completes vi IV I = Amen
    await page.waitForTimeout(350);
    result.afterChord = await rings();
    check("chordEvent", (await count("chord")) >= 1);
    check("chordBurst", result.afterChord && result.afterChord.bursts >= 3, result.afterChord);
    await shot("3-chord-burst");
    await page.waitForTimeout(700);
    for (let i = 0; i < 6; i++) { result.gaugeTrace.push((await P()).mana); await page.waitForTimeout(150); }
    check("chlockWord", (await fxWords()).includes("chlock"), await fxWords());
    result.lock = await rings();
    check("lockRing", result.lock && result.lock.lock, result.lock);
    await page.waitForTimeout(1500);
    await shot("4-lockout-ring");
    check("gaugeFilled", Math.max(...result.gaugeTrace.slice(1)) > result.gaugeTrace[0], result.gaugeTrace); // notes and the chord filled it (it drains after 4 s idle)
    check("panelGone", await page.evaluate(() => !document.getElementById("chordhud")));
    result.orb = await page.evaluate(() => { const o = document.querySelector("#orbhud .orb.mp"); return o && { cls: o.className, label: o.querySelector(".olabel").textContent }; });
    check("orbIsGauge", !!result.orb && /gauge|song/i.test(result.orb.cls + result.orb.label), result.orb);
    await shot("5-gauge-orb");

    // ---- DI-3 the gauge, filled for real, until the book's gift swells ----
    const fill = async () => {
      const before = await count("swell");
      for (let round = 0; round < 8 && (await count("swell")) === before; round++) {
        for (const s of ["sg_jig", "sg_call", "sg_shrill", "sg_crack", "sg_mend", "sg_pedal", "sg_ballad", "sg_march", "sg_dirge"]) {
          await send("cast", s);
          await page.waitForTimeout(140);
          if ((await count("swell")) > before) break;
        }
        await page.waitForTimeout(500);
      }
      return (await count("swell")) > before;
    };
    result.sawHalf = (await P()).mana;
    const swelled = await fill();
    check("swell", swelled, { mana: (await P()).mana });
    await page.waitForTimeout(200);
    const sw = await page.evaluate(() => window.evs.filter((e) => e.ev === "swell").pop());
    check("swellIsSongbook", sw && sw.book === "songweaver_shield" && !sw.fizzle, sw);
    await shot("6-swell");
    await page.waitForTimeout(900);
    check("gaugeEmptiesAfterSwell", (await P()).mana < 40, (await P()).mana);

    // ---- DI-2 a song found for real: Mirror Pond's shore ----
    await tp(35, 94);
    const songsBefore = await count("newsong");
    for (const s of ["sg_dirge", "sg_ballad", "sg_march"]) {
      if ((await count("newsong")) > songsBefore) break;
      await send("cast", s);
      await page.waitForTimeout(2400);
    }
    check("newsongPond", (await count("newsong")) > songsBefore, await count("newsong"));
    check("newsongBanner", /Mirror Pond Air|New song/.test(await page.evaluate(() => document.getElementById("newsong")?.innerText || "")), await page.evaluate(() => document.getElementById("newsong")?.innerText));
    await shot("7-newsong");
    await page.waitForTimeout(3000);

    // ---- the skills page "?" and the Songbook reader: the found song, the three unknown, the four new chords ----
    await page.keyboard.press("t");
    await page.waitForTimeout(600);
    const help = await page.$(".chhelp");
    check("helpButton", !!help);
    if (help) { await help.click(); await page.waitForTimeout(500); }
    const reader = await page.evaluate(() => document.getElementById("songbook")?.innerText || "");
    check("readerFindsPond", /Mirror Pond Air/.test(reader) && (reader.match(/\?\?\?/g) || []).length === 3, reader.slice(0, 400));
    check("readerLegendHasUnknownChords", (reader.match(/\? \? \?/g) || []).length === 3 && /i bII i/.test(reader) && /Chords from songs/.test(reader), reader.slice(-500));
    await shot("8-reader-top");
    await page.evaluate(() => { const s = document.getElementById("songbook"); if (s) s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(300);
    await shot("9-reader-legend");
    await closePanels();
    await page.keyboard.press("t");
    await page.waitForTimeout(300);

    // ---- Brann's weapons (to break) and Wren's books ----
    await tp(72, 58);
    for (const i of [4, 5, 15]) await send("buy", { i }); // w_dragon@12 x2 (5 tonewood each), sh_dragon@12 (5 brass)
    await page.waitForTimeout(600);
    const bag1 = (await P()).bag;
    check("boughtGear", bag1.filter((b) => /^w_dragon|^w_sky|^sh_dragon/.test(b)).length === 3, { bag1 });
    await tp(85, 65);
    await send("buy", { i: 1 }); // War March
    await send("buy", { i: 0 }); // Hymnal
    await page.waitForTimeout(500);
    await page.waitForTimeout(500);
    check("boughtBook", (await P()).bag.some((b) => b.startsWith("bk_march")) && (await P()).bag.some((b) => b.startsWith("bk_hymnal")), (await P()).bag);

    // ---- the bag and gear screens: a book, the lute, a sword that can't be worn ----
    await page.keyboard.press("g");
    await page.waitForTimeout(900);
    const cellInfo = await page.evaluate(() => [...document.querySelectorAll("#gearbag .gcell:not([disabled])")].map((c, i) => i));
    result.bagCells = cellInfo.length;
    const hoverCell = async (pred) => {
      const idx = await page.evaluate((src) => { const bag = [...window.S.room.state.players.get(window.S.me).bag]; return bag.findIndex(new Function("b", "return " + src)); }, pred);
      const cells = await page.$$("#gearbag .gcell");
      if (idx < 0 || !cells[idx]) return "";
      await cells[idx].hover(); await page.waitForTimeout(250);
      return page.evaluate(() => document.getElementById("gearinfo").innerText);
    };
    result.swordTip = await hoverCell("/^w_dragon|^w_sky/.test(b)");
    check("cantWearTip", /not a musical instrument/.test(result.swordTip), result.swordTip);
    await shot("10-cant-wear");
    const shieldIdx = (await P()).bag.findIndex((b) => b.startsWith("sh_dragon"));
    await send("equip", shieldIdx); // the server refuses too: "gearno"
    await page.waitForTimeout(500);
    const gno = await page.evaluate(() => window.gearno);
    check("gearnoShield", gno.some((t) => /book, not a shield/.test(t)), gno);
    const wIdx = (await P()).bag.findIndex((b) => /^w_dragon|^w_sky/.test(b));
    await send("equip", wIdx);
    await page.waitForTimeout(500);
    check("gearnoSword", (await page.evaluate(() => window.gearno)).some((t) => /not a musical instrument/.test(t)), await page.evaluate(() => window.gearno));
    result.bookTip = await hoverCell("/^bk_march/.test(b)");
    check("bookTip", /Rally/.test(result.bookTip) && /Full gauge/.test(result.bookTip), result.bookTip);
    await shot("11-bag-books");
    result.songbookRow = await page.evaluate(() => document.querySelector("#gearslots .slot-shield")?.innerText || "");
    check("songbookSlot", /Songbook/.test(result.songbookRow) && /Read/.test(result.songbookRow), result.songbookRow);
    // equip the gifted Hymnal by clicking it
    const hIdx = (await P()).bag.findIndex((b) => b.startsWith("bk_hymnal"));
    const cells = await page.$$("#gearbag .gcell");
    if (hIdx >= 0 && cells[hIdx]) await cells[hIdx].click();
    await page.waitForTimeout(700);
    check("hymnalWorn", (await P()).shield.startsWith("bk_hymnal"), (await P()).shield);
    const lute = await page.evaluate(() => document.querySelector("#gearslots .slot-weapon")?.innerText || "");
    result.luteRow = lute;
    check("luteRow", /Lute/.test(lute), lute);
    await shot("12-gear-hymnal");
    await page.keyboard.press("g");
    await page.waitForTimeout(300);

    // ---- Wren: shop, break, fit ----
    await tp(85, 65);
    for (let i = 0; i < 4 && !(await page.$(".lm-tab")); i++) { await page.keyboard.press("e"); await page.waitForTimeout(1200); }
    result.wrenShop = await page.evaluate(() => document.getElementById("npcdialog").innerText.slice(0, 300));
    await page.click(".lm-tab[data-tab=shop]");
    await page.waitForTimeout(500);
    result.wrenShop = await page.evaluate(() => document.getElementById("npcdialog").innerText.slice(0, 500));
    check("wrenShopTab", /Hymnal/.test(result.wrenShop) && /War March/.test(result.wrenShop), result.wrenShop);
    await shot("13-wren-shop");
    await page.click(".lm-tab[data-tab=break]");
    await page.waitForTimeout(500);
    const breakRows = await page.$$(".lm-break");
    check("breakRows", breakRows.length >= 3, breakRows.length);
    await shot("14-wren-break");
    for (let n = 0; n < 3; n++) { // two weapons and the shield; each needs a second click ("Sure?")
      const b = await page.$(".lm-break");
      if (!b) break;
      await b.click(); await page.waitForTimeout(250);
      const b2 = await page.$(".lm-break");
      if (b2) { await b2.click(); await page.waitForTimeout(700); }
    }
    const broke = await count("break");
    check("breakEvents", broke >= 3, broke);
    const bm = await page.evaluate(() => window.shopMsgs.filter((m) => m.ok).map((m) => m.text));
    check("breakAnswers", bm.length >= 3, bm);
    const mats = await page.evaluate(() => [...document.querySelectorAll(".lm-matc")].map((c) => c.innerText.replace(/\s+/g, " ")));
    result.mats = mats;
    check("tonewood10", /10/.test(mats[0] || "") && /5/.test(mats[1] || ""), mats);
    await page.click(".lm-tab[data-tab=traits]");
    await page.waitForTimeout(500);
    result.traits = await page.evaluate(() => document.getElementById("npcdialog").innerText.slice(0, 900));
    check("wideLockedByWood", /Wren needs 8/.test(result.traits) || /not enough Tonewood/i.test(result.traits) || /Needs more|Wren needs/.test(result.traits), result.traits.slice(0, 300));
    await shot("15-wren-traits");
    const fit = await page.$(".lm-fit[data-trait=steel]:not([disabled])");
    check("steelFitEnabled", !!fit);
    if (fit) await fit.click();
    await page.waitForTimeout(900);
    check("lutefitEvent", (await count("lutefit")) >= 1);
    check("luteHasSteel", /#steel/.test((await P()).weapon), (await P()).weapon);
    const fitMsg = await page.evaluate(() => window.shopMsgs.filter((m) => m.ok).pop());
    check("fitAnswer", !!fitMsg, fitMsg);
    result.afterFit = await page.evaluate(() => document.getElementById("npcdialog").innerText.slice(0, 500));
    check("fittedShown", /Fitted/.test(result.afterFit), result.afterFit.slice(0, 200));
    await shot("16-wren-fitted");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // the lute tooltip in the gear screen
    await page.keyboard.press("g");
    await page.waitForTimeout(700);
    const luteSlot = await page.$("#gearslots .slot-weapon");
    if (luteSlot) { await luteSlot.hover(); await page.waitForTimeout(250); }
    result.luteTip = await page.evaluate(() => document.getElementById("gearinfo").innerText);
    check("luteTip", /Steel Strings/.test(result.luteTip) && /Lute/.test(result.luteTip), result.luteTip);
    await shot("17-lute-tooltip");
    await page.keyboard.press("g");
    await page.waitForTimeout(300);

    // ---- the Hymnal's swell (a different book, a different effect) ----
    const swellsBefore = await count("swell");
    await tp(101, 19);
    await fill();
    const sw2 = await page.evaluate(() => window.evs.filter((e) => e.ev === "swell").pop());
    check("swellHymnal", (await count("swell")) > swellsBefore && sw2 && /^bk_hymnal/.test(sw2.book), sw2);
    await shot("18-swell-hymnal");

    // ---- a material from the ground: skeletons drop bone (stand 3 tiles off so it is not picked up on the spot) ----
    await tp(100, 103);
    let bone = 0, seenOnGround = false;
    const skip = new Set(); // ground items the keys could not reach (behind a wall): left alone
    const t0 = Date.now();
    while (Date.now() - t0 < (Number(process.env.BONE_MS) || 420000) && !bone) {
      const k = await kill(["skeleton", "skeletonmage"], 2);
      result.boneKills = (result.boneKills || 0) + (k ? 1 : 0); result.boneTries = (result.boneTries || 0) + 1;
      const m = await page.evaluate((skip) => { let o; window.S.items.forEach((img, id) => { if (img.getData("mat") && !skip.includes(id)) o = { id, x: img.x, y: img.y, mat: img.getData("mat") }; }); return o; }, [...skip]);
      if (m && !seenOnGround) { seenOnGround = true; await shot("19-material-on-ground"); }
      if (m) { // the pickup radius is 10 px: jump to its tile, then tap the walking keys until it is gone
        await tp(Math.floor(m.x / 32), Math.floor(m.y / 32));
        const dist = () => page.evaluate((id) => { const me = window.S.room.state.players.get(window.S.me), it = window.S.room.state.items.get(id); return it ? Math.hypot(it.x - me.x, it.y - me.y) : -1; }, m.id);
        let d = await dist();
        for (let i = 0; i < 30 && d >= 0; i++) {
          let best = d;
          for (const key of ["w", "a", "s", "d"]) {
            await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(120);
            const nd = await dist();
            if (nd < 0) { best = nd; break; }
            if (nd < best) { best = nd; break; }
          }
          d = best;
        }
        if (d >= 0) skip.add(m.id);
        await page.waitForTimeout(300);
      }
      if (await count("matpick")) { bone = 1; await shot("20-material-picked"); }
    }
    result.materialSeenOnGround = seenOnGround;
    if (!bone) await shot("99-pickup-failed");
    check("materialPickup", !!bone, { skipped: [...skip], kills: result.boneKills });
    if (bone) {
      const lastPick = await page.evaluate(() => window.evs.filter((e) => e.ev === "matpick").pop());
      check("matpickEvent", lastPick && lastPick.mat === "bone" && lastPick.n >= 1, lastPick);
    }

    result.errors = errors.slice(0, 8);
    report[name] = result;
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  const refId = Object.values(report).flatMap((r) => r.errors).filter((e) => /refId|decode|addCallback/i.test(e));
  if (refId.length) console.log(`NOTE: ${refId.length} Colyseus decode error(s) seen:`, refId.slice(0, 3));
  const bad = Object.entries(report).flatMap(([k, r]) => r.errors.filter((e) => !/refId|decode|addCallback/i.test(e)).map((e) => `${k}: page error ${e}`));
  if (fails.length || bad.length) { console.error("E2E FAILED:\n" + [...fails, ...bad].join("\n")); process.exit(1); }
  console.log("E2E OK");
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
