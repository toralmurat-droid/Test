// Real end-to-end check of the Songweaver client effects against a real server, at desktop and phone sizes:
// songs (ring), the Amen progression (chord HUD, legend), Modulate, waves in flight, a deaf slime and a fragile
// skeleton (ringing / muffled numbers, ear icon, hint line), and `refId not found` errors.
// Needs a DEV server (the /tp chat command is off in production) on a fresh save file, and
// the client (vite dev) in front of it:
//   SAVE_FILE=/tmp/saves.json npx tsx server/index.ts      (port 2567)
//   npx vite --port 5180
//   node tools/e2e-songweaver-fx.cjs 5180 docs/art
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
  const report = {};
  for (const [name, opts] of SETUPS) {
    if (process.argv[4] && process.argv[4] !== name) continue; // optional: run one setup only
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" || /refId|decode/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => { try { localStorage.setItem("cls", "songweaver"); } catch {} });
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1500);
    await page.fill("#name", "Sw" + name.replace(/[^a-z]/g, "").slice(0, 10));
    await page.fill("#password", "songpass1");
    await page.click("#play");
    await page.waitForSelector("#pkgo", { state: "visible", timeout: 20000 });
    await page.screenshot({ path: `${OUT}/songweaver-e2e-${name}-0-picker.png` });
    await page.click("#pkgo");
    await page.waitForSelector("#hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const S = window.__game.scene.scenes.find((s) => s.entities);
      window.S = S;
      window.log = [];
      // the mouse is not over any monster in a headless run: pin the hovered monster (its nameplate shows the ear icons)
      Object.defineProperty(S.pointer, "hoverId", { get: () => window.__hover });
      // record the sfx events and chat hints the client handled
      const so = S.songEvent.bind(S);
      S.songEvent = (ev) => { window.log.push(ev); return so(ev); };
      const sy = S.npcs.say.bind(S.npcs);
      S.npcs.say = (id, t) => { const r = sy(id, t); window.log.push({ ev: "npcsay", id, text: t, shown: r }); return r; };
      const cn = S.chatNote.bind(S);
      S.chatNote = (t, c) => { window.log.push({ ev: "hint", text: t }); return cn(t, c); };
    });
    const send = (t, m) => page.evaluate(([t, m]) => window.S.room.send(t, m), [t, m]);
    const chat = (t) => send("chat", t);
    const shot = (n) => page.screenshot({ path: `${OUT}/songweaver-e2e-${name}-${n}.png` });
    const me = () => page.evaluate(() => { const p = window.S.room.state.players.get(window.S.me); return { cls: p.cls, level: p.level, fx: p.fx, x: p.x, y: p.y, mana: p.me?.mp }; });
    const result = { cls: (await me()).cls };
    await chat("/max");
    await page.waitForTimeout(1200);
    // ---- songs: Hearth Ballad ring (major, so Oakvale allows it) ----
    await send("cast", "sg_ballad");
    await page.waitForTimeout(900);
    result.ballad = (await me()).fx;
    await shot("1-song-ring");
    // busk next to Elder Rowan at the bonfire (a villager answers within 4 tiles, once a minute)
    const rowan = await page.evaluate(() => { const sp = window.S.npcs.sprites.get("druid").sprite; return { x: Math.floor(sp.x / 32) + 2, y: Math.floor(sp.y / 32) + 1 }; });
    await chat(`/tp ${rowan.x} ${rowan.y}`);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6 && !(await page.evaluate(() => window.log.some((e) => e.ev === "npcsay"))); i++) { await send("cast", "sg_ballad"); await page.waitForTimeout(1500); }
    await page.waitForTimeout(500);
    result.busking = await page.evaluate(() => window.log.filter((e) => e.ev === "npcsay").slice(0, 2));
    await shot("1b-busking-bubble");
    // ---- Amen = vi (Pedal Point), IV (Mending Note), I (Hearth Ballad again once the song cooldown is ready) ----
    await send("cast", "sg_pedal");
    await page.waitForTimeout(300);
    await send("cast", "sg_mend");
    await page.waitForTimeout(2300);
    await send("cast", "sg_ballad");
    await page.waitForTimeout(1200);
    result.chord = await page.evaluate(() => window.log.filter((e) => e.ev === "chord").map((e) => e.prog));
    await shot("2-chord-fired");
    await page.waitForTimeout(2500);
    // legend: open through the real "?" button
    await page.click("#chordhud .ch-help");
    await page.waitForTimeout(300);
    result.hudText = await page.evaluate(() => document.getElementById("chordhud")?.innerText.slice(0, 80));
    await shot("3-chord-hud-legend");
    await page.click("#chordhud .ch-help");
    // ---- the deaf slime in the North Meadow ----
    const fightAt = async (tx, ty, kind, tag, skills) => {
      await chat(`/tp ${tx} ${ty}`);
      await page.waitForTimeout(2500);
      const found = await page.evaluate((kind) => {
        const S = window.S, m = S.entities.get(S.me); let best, bd = 1e9;
        S.entities.forEach((e, id) => { if (e.mob && !e.state.dead && e.state.kind === kind) { const d = Math.hypot(e.sprite.x - m.sprite.x, e.sprite.y - m.sprite.y); if (d < bd) { bd = d; best = { id, x: e.state.x, y: e.state.y }; } } });
        return best;
      }, kind);
      if (!found) return { found: false };
      await chat(`/tp ${Math.floor(found.x / 32) - 3} ${Math.floor(found.y / 32)}`);
      await page.waitForTimeout(800);
      // hover a second monster of the kind (not hit yet): its nameplate shows the ear and note icons with the tooltip
      await page.evaluate(([kind, id]) => { const S = window.S, m = S.entities.get(S.me); let bd = 1e9; window.__hover = id; S.entities.forEach((e, k) => { if (!e.mob || e.culled || e.state.dead || e.state.kind !== kind || k === id) return; const d = Math.hypot(e.sprite.x - m.sprite.x, e.sprite.y - m.sprite.y); if (d < bd) { bd = d; window.__hover = k; } }); }, [kind, found.id]);
      await page.waitForTimeout(1500); // the headless frame rate is 2-3 fps
      result[tag + "-ear"] = await page.evaluate(() => { const c = window.S.soundCues, e = window.S.entities.get(window.__hover); return c.ear && { vis: c.ear.visible, x: Math.round(c.ear.x), y: Math.round(c.ear.y), sc: c.ear.scaleX, lab: e?.label && [Math.round(e.label.x), Math.round(e.label.y)], tex: c.ear.texture.key, note: c.note?.visible }; });
      await shot(`${tag}-ear`);
      for (let i = 0; i < 14; i++) {
        const t = await page.evaluate((id) => { const e = window.S.entities.get(id); return e && !e.state.dead ? { x: e.state.x, y: e.state.y } : null; }, found.id);
        if (!t) break;
        await page.evaluate((id) => { window.__hover = id; }, found.id);
        await send("face", t);
        await send("attack");
        if (i % 4 === 1) for (const s of skills) await send("cast", s);
        await page.waitForTimeout(280);
        if (i === 1) await shot(`${tag}-wave`);
        if (i === 2) await shot(`${tag}-numbers`);
      }
      return { found: true };
    };
    await chat("/max");
    result.slime = await fightAt(100, 20, "slime", "4-slime", ["sg_shrill"]);
    // ---- Modulate through every known key, out in the meadow (not in the Oakvale stockade) ----
    const modes = [];
    for (let i = 0; i < 5; i++) {
      await send("cast", "sg_modulate");
      await page.waitForTimeout(1000);
      modes.push(((await me()).fx || "").split(",").find((w) => w.startsWith("mode:")));
    }
    result.modes = modes;
    result.skeleton = await fightAt(94, 100, "skeleton", "5-skeleton", ["sg_shrill", "sg_crack"]);
    result.events = await page.evaluate(() => {
      const c = {}; for (const e of window.log) c[e.ev === "soundhit" ? `soundhit:${e.tier}${e.match ? "+match" : ""}` : e.ev] = (c[e.ev === "soundhit" ? `soundhit:${e.tier}${e.match ? "+match" : ""}` : e.ev] ?? 0) + 1;
      return { counts: c, hints: window.log.filter((e) => e.ev === "hint").map((e) => e.text), resonate: window.log.filter((e) => e.ev === "resonate").slice(0, 2), note: window.log.filter((e) => e.ev === "note").slice(0, 3).map((e) => e.s + ":" + e.deg) };
    });
    result.errors = errors.slice(0, 8); // Colyseus `refId not found` / decode errors show up now and then (known, see CLAUDE.md gotchas)
    report[name] = result;
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  const bad = Object.entries(report).filter(([, r]) => r.cls !== "songweaver" || !r.chord.includes("amen") || !r.slime.found || !r.skeleton.found || r.errors.some((e) => !/refId|decode|addCallback/i.test(e)));
  if (bad.length) { console.error("E2E FAILED:", bad.map(([k]) => k).join(", ")); process.exit(1); }
  console.log("E2E OK");
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
