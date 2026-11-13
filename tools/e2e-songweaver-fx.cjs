// Dev harness for the Songweaver client effects (client/src/skillfx.ts, chordHud.ts, soundCues.ts): logs a hero in, then
// fires FAKE contract events, status words and messages (docs/songweaver-progress.md "Interface contract") through the
// scene, and takes screenshots at desktop and phone sizes. Nothing here touches the server's rules.
// Start the production build on a fresh save file first, then:
//   node tools/e2e-songweaver-fx.cjs 2631 docs/art
// (needs playwright; set PLAYWRIGHT_CHROME=/path/to/chrome if its own browser is not installed)
const { chromium, devices } = require("playwright");
const PORT = process.argv[2], OUT = process.argv[3];
const SETUPS = [
  ["desktop", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
  ["phone-portrait", devices["iPhone 13"]],
  ["phone-landscape", devices["iPhone 13 landscape"]],
];
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {});
  for (const [name, opts] of SETUPS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem("cls", "summoner"); } catch {} });
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1500);
    await page.fill("#name", "Fx" + name.replace(/[^a-z]/g, "").slice(0, 10));
    await page.fill("#password", "songpass1");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(2500);
    // Everything below runs in the page: `S` is the town scene, `me` my hero entity.
    await page.evaluate(() => {
      const S = window.__game.scene.scenes.find((s) => s.entities);
      window.S = S; window.me = S.entities.get(S.me);
      globalThis.__devSong = true;
      globalThis.__devMobSound = { slime: { tier: "fragile", pitch: "H" }, rat: { tier: "deaf", pitch: "L" }, wolf: { tier: "keen", pitch: "M" } };
      const emit = (t, m) => S.room.onMessageHandlers.emit(t, m);
      window.emit = emit;
      const sfx = (ev) => S.onSkillFx(ev);
      window.sfx = sfx;
      // a stand-in monster next to the hero: clone of a villager-less scene, so make one from a plain sprite entity
      window.MOBS = [];
      S.entities.forEach((e) => { if (e.mob && !e.state.dead) window.MOBS.push(e); });
    });
    const info = await page.evaluate(() => ({ mobs: window.MOBS.length, kinds: window.MOBS.map((m) => m.state.kind).slice(0, 5) }));
    console.log(name, info);
    // 1. rings + notes + chord HUD + wave
    await page.evaluate(() => {
      const { me, S, emit, sfx } = window, x = me.sprite.x, y = me.sprite.y;
      me.state.fx = "sg_ballad,mode:minor,res2";
      emit("chord", { notes: ["vi", "IV"], mode: "minor", lockMs: 0 });
      sfx({ ev: "note", id: S.me, s: "sg_ballad", deg: "vi", mode: "minor", pitch: "M", x, y });
      setTimeout(() => sfx({ ev: "note", id: S.me, s: "sg_ballad", deg: "IV", mode: "minor", pitch: "M", x, y }), 250);
      // wave shot flying right
      const g = S.fx.addShot("dev1", { kind: "wave", x: x + 20, y: y - 8, vx: 1, vy: 0, size: 1 });
      window.__wave = setInterval(() => { g.x += 2; }, 16);
      setTimeout(() => { clearInterval(window.__wave); S.fx.removeShot("dev1"); g.destroy(); S.fx.impact(g.x, g.y, "wave", 0); }, 1500);
      sfx({ ev: "bounce", x: x + 60, y: y - 20, mat: "stone" });
      sfx({ ev: "bounce", x: x + 80, y: y + 10, mat: "wood" });
      sfx({ ev: "bounce", x: x + 100, y: y - 10, mat: "metal" });
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/songweaver-${name}-1-ring-notes.png` });
    // 2. shield + resonance 3 + chord fired
    await page.evaluate(() => {
      const { me, S, emit, sfx } = window, x = me.sprite.x, y = me.sprite.y;
      me.state.fx = "sg_march,sg_pedal,mode:dorian,res3";
      emit("chord", { notes: [], mode: "dorian", lockMs: 12000 });
      sfx({ ev: "chord", id: S.me, prog: "resolve", mode: "dorian", x, y });
      sfx({ ev: "resonate", id: S.me, x: x - 40, y: y - 10, shatter: true });
      sfx({ ev: "shieldbreak", id: S.me, s: "sg_pedal", x: x + 40, y: y - 10 });
      emit("hit", { id: S.me, dmg: 0 });
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/songweaver-${name}-2-shield-chord.png` });
    // 3. every mode ring in a row (the hero's fx only: one mode at a time, quick succession)
    for (const m of ["major", "lydian", "phrygian"]) {
      await page.evaluate((m) => { window.me.state.fx = `sg_jig,mode:${m}`; }, m);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}/songweaver-${name}-3-ring-${m}.png`, clip: undefined });
    }
    // 4. a monster: ear icon + ringing / muffled numbers + hint (if one is in view; walk out otherwise)
    if (info.mobs) {
      await page.evaluate(() => {
        const { S, emit, sfx } = window, m = window.MOBS[0];
        S.pointer.hovered = [...S.entities.entries()].find(([, e]) => e === m)[0];
        const id = S.pointer.hovered;
        m.state.fx = "res2";
        emit("hit", { id, dmg: 42 });
        sfx({ ev: "soundhit", id, x: m.sprite.x, y: m.sprite.y, tier: "keen", match: true });
        emit("hit", { id, dmg: 17 });
        sfx({ ev: "soundhit", id, x: m.sprite.x, y: m.sprite.y, tier: "dull", match: false });
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/songweaver-${name}-4-mob.png` });
    }
    console.log(name, "errors:", errors.slice(0, 5));
    await ctx.close();
  }
  await browser.close();
})();
