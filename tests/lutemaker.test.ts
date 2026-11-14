// DI-5 lute-maker (docs/songweaver-di-plan.md): Wren in Oakvale, her shop, breaking items into material, monster
// materials on the ground, and the nine lute traits with their engine effects.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE } from "../shared/constants";
import { EMPTY, isSafeZone, isSolidAt, OBJECTS, T, VILLAGE } from "../shared/map";
import { BOUNCE, materialAt } from "../shared/acoustics";
import { isDecorSolidAt, NPC_DECOR, npcById } from "../shared/npcs";
import { SHOPS, shopBuys } from "../shared/shops";
import { LOOT } from "../shared/items";
import { isGearId, withLevel } from "../shared/gear";
import { LUTE_FX, LUTE_GROUPS, LUTE_TRAITS, MATERIAL_IDS, MATERIALS } from "../shared/lute";
import { breakYield, fitProblem, matItemId, matOfItem, rollMats, WREN } from "../shared/lutemaker";
import { fillGauge, luteHas, toneOf } from "../shared/skillEngine";
import { GAUGE, MODES, NOTES } from "../shared/songs";
import { skillById } from "../shared/skills";
import { bounceWave, SongCollector, stringShot } from "../server/songs";
import { breakItem, fitTrait, pickMat } from "../server/lutemaker";
import { near, play, singer, world } from "./helpers/songWorld";
import { startRoom, wait } from "./helpers/room";

test("Wren: an Oakvale NPC with the lutemaker sprite, her stall props, a shop of books that buys weapons and shields", () => {
  const n = npcById("lutemaker")!;
  assert.ok(n);
  assert.deepEqual([n.name, n.title, n.sprite, n.shop], ["Wren", "Lute-maker", "lutemaker", "lutemaker"]);
  const tx = n.x / TILE, ty = n.y / TILE;
  assert.ok(tx >= VILLAGE.x0 && tx <= VILLAGE.x1 && ty >= VILLAGE.y0 && ty <= VILLAGE.y1 && isSafeZone(n.x, n.y), "in Oakvale");
  assert.ok(!isSolidAt(n.x, n.y) && !isDecorSolidAt(n.x, n.y), "she stands on open ground");
  for (const prop of ["lu_bench", "lu_rack"]) assert.ok(NPC_DECOR.some((d) => d.prop === prop && d.solid), prop);
  const shop = SHOPS.lutemaker;
  assert.deepEqual(shop.stock.map((e) => e.item.split("@")[0]), ["bk_hymnal", "bk_march", "bk_dissonance"]);
  assert.ok(shop.stock.every((e) => isGearId(e.item) && e.price > 0));
  assert.ok(shopBuys(shop, "w_frost@5") && shopBuys(shop, "sh_iron") && shopBuys(shop, "bk_march"));
  assert.ok(!shopBuys(shop, "a_chain") && !shopBuys(shop, "songweaver_weapon@9") && !shopBuys(shop, "songweaver_shield"), "no armour, nothing bound");
});

test("traits: nine in three exclusive groups, one exotic each, with level gates, gold and material costs", () => {
  assert.equal(LUTE_TRAITS.length, 9);
  for (const g of LUTE_GROUPS) {
    const ts = LUTE_TRAITS.filter((t) => t.group === g);
    assert.equal(ts.length, 3, g);
    assert.equal(ts.filter((t) => t.exotic).length, 1, `${g}: one exotic`);
  }
  for (const t of LUTE_TRAITS) {
    assert.ok(t.level >= 5 && t.gold > 0 && Object.keys(t.mats).length && t.desc, t.id);
    if (t.exotic) assert.ok(Object.keys(t.mats).some((m) => m !== "tonewood" && m !== "brass"), `${t.id} needs a monster material`);
  }
  assert.deepEqual(MATERIAL_IDS, ["tonewood", "brass", "bone", "silk", "horn", "sunglass"]);
  for (const m of MATERIAL_IDS) assert.ok(MATERIALS[m].name && MATERIALS[m].pick, m);
});

test("breaking: a weapon gives tonewood, a shield or book brass, more for tier, level and rarity; bound items and armour can't", () => {
  assert.equal(breakYield("w_bronze")!.mat, "tonewood");
  assert.equal(breakYield("sh_wood")!.mat, "brass");
  assert.equal(breakYield("bk_hymnal")!.mat, "brass");
  const n = (id: string) => breakYield(id)!.n;
  assert.ok(n("w_frost") > n("w_bronze"), "tier");
  assert.ok(n(withLevel("w_frost", 30)) > n("w_frost"), "item level");
  assert.ok(n("w_frost@12~R:atk3,sta2,str2") > n("w_frost@12"), "rarity");
  for (const no of ["songweaver_weapon@20", "songweaver_shield", "a_chain", "r_sling", "rune:ember:1"]) assert.equal(breakYield(no), undefined, no);
});

test("break and fit (rules): runes come back, bound refused, levels, gold and materials checked and paid, refit costs again", () => {
  const col = new SongCollector();
  const sw = { cls: "songweaver", level: 12, gold: 1000, weapon: "songweaver_weapon@12", x: 0, y: 0, dead: false, sk: {} as any };
  const bag = ["w_frost@12^ember2", "songweaver_shield", "a_chain"];
  let r = breakItem(sw, bag, 1, col, 0);
  assert.equal(r.text, WREN.bound);
  r = breakItem(sw, bag, 2, col, 0);
  assert.equal(r.text, WREN.nothing);
  r = breakItem(sw, bag, 0, col, 0);
  assert.ok("mat" in r && r.mat === "tonewood" && r.n === breakYield("w_frost@12")!.n);
  assert.deepEqual(bag, ["songweaver_shield", "a_chain", "rune:ember:2"], "the rune comes back");
  assert.equal(col.mats(sw).tonewood, r.n);
  const kn = { ...sw, cls: "knight" };
  assert.equal(breakItem(kn, ["w_frost"], 0, col, 0).text, WREN.breakOnly);
  // fitting
  col.addMat(sw, "tonewood", 20);
  assert.equal(fitProblem({ ...sw, mats: col.mats(sw) }, "silk"), WREN.level(18));
  assert.equal(fitProblem({ ...sw, mats: col.mats(sw) }, "nope"), "No such fitting.");
  assert.equal(fitProblem({ ...sw, weapon: "", mats: {} }, "steel"), WREN.noLute);
  assert.equal(fitProblem({ ...kn, mats: {} }, "steel"), WREN.notSinger);
  const t0 = col.mats(sw).tonewood!;
  let f = fitTrait(sw, col, "steel");
  assert.ok(f.ok);
  assert.equal(sw.weapon, "songweaver_weapon@12#steel");
  assert.deepEqual([sw.gold, col.mats(sw).tonewood], [850, t0 - 6]);
  assert.equal(fitTrait(sw, col, "steel").text, WREN.have);
  f = fitTrait(sw, col, "gut"); // refitting the Strings pays again
  assert.ok(f.ok);
  assert.equal(sw.weapon, "songweaver_weapon@12#gut");
  assert.deepEqual([sw.gold, col.mats(sw).tonewood], [700, t0 - 12]);
  assert.ok(fitTrait(sw, col, "wide").ok);
  assert.equal(sw.weapon, "songweaver_weapon@12#gut.wide", "one per group, at most three");
  sw.gold = 10;
  col.addMat(sw, "tonewood", 8);
  assert.equal(fitTrait(sw, col, "deep").text, WREN.gold);
  assert.equal(sw.weapon, "songweaver_weapon@12#gut.wide", "nothing paid on a refusal");
  sw.gold = 9999;
  assert.match(fitTrait({ ...sw, level: 40 }, col, "bonepegs").text, /Bone/);
});

test("materials: monsters drop them per LOOT[kind].mats as mat_<id> ground items; only a Songweaver picks them up", () => {
  for (const [kind, mat] of [["skeleton", "bone"], ["hollowking", "bone"], ["silkwretch", "silk"], ["weaver", "silk"], ["tuskborn", "horn"], ["hornbrute", "horn"], ["scorpion", "sunglass"], ["sunwright", "sunglass"]] as const)
    assert.ok(LOOT[kind].mats?.some((d) => d.mat === mat && d.chance > 0), `${kind} drops ${mat}`);
  assert.equal(LOOT.slime.mats, undefined);
  assert.ok(!Object.values(LOOT).some((l) => l.mats?.some((d) => d.mat === "tonewood" || d.mat === "brass")), "tonewood and brass only from breaking");
  assert.deepEqual(rollMats(LOOT.hollowking.mats, () => 0), [{ mat: "bone", n: 4 }]);
  assert.deepEqual(rollMats(LOOT.skeleton.mats, () => 0.5), []);
  assert.equal(matItemId("silk"), "mat_silk");
  assert.equal(matOfItem("mat_silk"), "silk");
  assert.equal(matOfItem("mat_gold"), undefined);
  const col = new SongCollector();
  assert.equal(pickMat({ cls: "knight" }, "mat_bone", 3, col), undefined);
  assert.deepEqual(pickMat({ cls: "songweaver" }, "mat_bone", 3, col), { mat: "bone", n: 3 });
});

test("trait effects in the engine: Gut, Deep, Horn, Bone Pegs, Bright, Dark, Wide", () => {
  // Gut: +15% resonance
  const res = (lute?: string) => {
    const w = world(), u = singer(w);
    u.sk.lute = lute;
    const foe = w.add("foe", 30, { hp: 9999, maxHp: 9999 });
    play(w, "sg_crack");
    w.step(400);
    return { foe, w };
  };
  const plain = res("songweaver_weapon@20").foe.sk.res, gut = res("songweaver_weapon@20#gut").foe.sk.res;
  assert.ok(plain > 0 && near(gut, plain * LUTE_FX.gutRes, 1e-3), `${plain} -> ${gut}`);
  // Deep: low notes (pitch L) +15%: Dirge's power
  const dirge = (lute: string) => { const w = world(), u = singer(w); u.sk.lute = lute; u.sk.mode = "minor"; play(w, "sg_dirge"); return w.fields.find((f) => f.skill === "sg_dirge")!.tune!.base; };
  assert.equal(skillById("sg_dirge")!.pitch, "L");
  assert.ok(near(dirge("songweaver_weapon@20#deep"), dirge("songweaver_weapon@20") * LUTE_FX.deepLow));
  // Horn: chords fill +50%
  for (const [lute, fill] of [["songweaver_weapon@30", GAUGE.chord], ["songweaver_weapon@30#horn", GAUGE.chord * LUTE_FX.hornChord]] as const) {
    const w = world(), u = singer(w);
    u.sk.lute = lute; u.sk.book = "songweaver_shield";
    for (const s of ["sg_pedal", "sg_mend"]) play(w, s);
    const before = u.mana!;
    play(w, "sg_chorale"); // vi IV I: Amen
    assert.ok(w.fx.some((e) => e.ev === "chord"), "the chord fired");
    assert.ok(near(u.mana! - before, GAUGE.note + fill, 1e-6), `${lute}: +${u.mana! - before}`);
  }
  // Bone Pegs: the drain waits 4 s longer; the full effect is stronger
  for (const [lute, wait] of [["songweaver_weapon@30", GAUGE.idleMs], ["songweaver_weapon@30#bonepegs", GAUGE.idleMs + LUTE_FX.pegsIdleMs]] as const) {
    const w = world(), u = singer(w);
    u.sk.lute = lute; u.mana = 50; u.sk.gaugeAt = w.now;
    w.step(wait - 100);
    assert.equal(u.mana, 50, `${lute}: holds`);
    w.step(1100);
    assert.ok(u.mana! < 50, `${lute}: drains after`);
  }
  const heal = (lute: string) => { const w = world(), u = singer(w, { hp: 1 }); u.sk.lute = lute; u.sk.book = "bk_hymnal"; u.mana = GAUGE.max; fillGauge(w.h, "sw", 1); return w.heals.find((x) => x.id === "sw")!.amount; };
  assert.ok(near(heal("songweaver_weapon@30#bonepegs"), heal("songweaver_weapon@30") * LUTE_FX.pegsFull, 1e-6));
  // Bright / Dark
  const u = { cls: "songweaver", sk: { lute: "songweaver_weapon@30#bright" } } as any;
  assert.ok(near(toneOf(u, "major").ally, MODES.major.ally * LUTE_FX.brightAlly) && toneOf(u, "minor").ally === MODES.minor.ally);
  u.sk.lute = "songweaver_weapon@30#dark";
  assert.ok(near(toneOf(u, "phrygian").foe, MODES.phrygian.foe * LUTE_FX.darkFoe) && toneOf(u, "major").foe === MODES.major.foe);
  assert.equal(luteHas({ cls: "knight", sk: { lute: "songweaver_weapon#dark" } } as any, "dark"), false);
  // Wide: the Chorus reaches 15% further
  const radius = (lute: string) => { const w = world(), s = singer(w); s.sk.lute = lute; play(w, "sg_ballad"); return w.fields.find((f) => f.song)!.def.r; };
  assert.ok(near(radius("songweaver_weapon@30#wide"), radius("songweaver_weapon@30") * LUTE_FX.wideRadius));
  assert.ok(NOTES.keep === 3);
});

/** A stone wall tile with free tiles to its west. */
function stoneWall(): [number, number] {
  for (let ty = 5; ty < 200; ty++) for (let tx = 5; tx < MAP_W - 5; tx++) {
    if (![T.ROCK, T.WALL_STONE].includes(OBJECTS[ty][tx]) || materialAt(tx, ty) !== "stone") continue;
    if ([1, 2].every((i) => !isSolidAt((tx - i + 0.5) * TILE, (ty + 0.5) * TILE) && OBJECTS[ty][tx - i] === EMPTY)) return [tx, ty];
  }
  throw new Error("no wall");
}

test("Steel: a basic wave bounces once off a wall; Silk: a bounce loses no damage", () => {
  const [tx, ty] = stoneWall();
  const shot = () => ({ x: (tx + 0.2) * TILE, y: (ty + 0.5) * TILE, vx: 1, vy: 0, dir: "right", traveled: 50, bounced: 0, bouncedAt: 0, damage: 100 } as any);
  const ev: any[] = [];
  const sw = (lute: string) => ({ cls: "songweaver", sk: { lute } }) as any;
  let s = shot();
  stringShot(s, sw("songweaver_weapon@20"), true);
  assert.equal(bounceWave(s, (tx - 0.3) * TILE, s.y, (e) => ev.push(e)), false, "no strings: no bounce");
  s = shot();
  stringShot(s, sw("songweaver_weapon@20#steel"), true);
  assert.ok(bounceWave(s, (tx - 0.3) * TILE, s.y, (e) => ev.push(e)));
  assert.ok(s.vx < 0 && near(s.damage, 100 * BOUNCE.stone!.dmg));
  s.traveled += 100;
  assert.equal(bounceWave(s, s.x - 4, s.y, () => {}), false, "once only");
  s = shot();
  stringShot(s, sw("songweaver_weapon@20#silk"), true);
  assert.equal(s.keep, true);
  s.bounces = 1;
  assert.ok(bounceWave(s, (tx - 0.3) * TILE, s.y, () => {}));
  assert.equal(s.damage, 100, "silk keeps it whole");
  const spec = { ...shot(), spec: { bounce: 2, dmg: 80, vx: 1, vy: 0 } } as any;
  stringShot(spec, sw("songweaver_weapon@20#silk"), false);
  assert.ok(bounceWave(spec, (tx - 0.3) * TILE, spec.y, () => {}));
  assert.equal(spec.spec.dmg, 80, "skill waves too");
});

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

test("room: at Wren a Songweaver breaks, fits and picks up materials; songbook messages and events go out; far away nothing", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  const books: any[] = [], fx: any[] = [], shop: any[] = [];
  c.onMessage("songbook", (m: any) => books.push(m));
  c.onMessage("sfx", (m: any) => fx.push(m));
  c.onMessage("shop", (m: any) => shop.push(m));
  try {
    await wait(250);
    const room = srv.room, p = room.state.players.get(c.sessionId), wren = npcById("lutemaker")!;
    p.level = 12; p.gold = 500;
    room.applyStats(p);
    p.weapon = "songweaver_weapon@12";
    p.bag.clear(); p.bag.push("w_frost@12");
    // far away: ignored
    p.x = wren.x + 10 * TILE; p.y = wren.y;
    c.send("break", { bag: 0 });
    await wait(200);
    assert.equal(p.bag.length, 1);
    p.x = wren.x; p.y = wren.y + 20;
    c.send("break", { bag: "0" }); c.send("break", { bag: 7 }); c.send("break", { bag: 0.5 }); // bad input: ignored
    await wait(150);
    assert.equal(p.bag.length, 1);
    c.send("break", { bag: 0 });
    await wait(250);
    assert.equal(p.bag.length, 0);
    const n = breakYield("w_frost@12")!.n;
    assert.ok(fx.some((e) => e.ev === "break" && e.mat === "tonewood" && e.n === n));
    assert.deepEqual(books.at(-1).mats, { tonewood: n });
    room.songs.addMat(p, "tonewood", 10);
    c.send("lutefit", { trait: "steel" });
    await wait(250);
    assert.equal(p.weapon, "songweaver_weapon@12#steel");
    assert.equal(p.sk.lute, "songweaver_weapon@12#steel", "the engine plays it");
    assert.equal(p.gold, 350);
    assert.ok(fx.some((e) => e.ev === "lutefit" && e.trait === "steel"));
    c.send("lutefit", { trait: { evil: 1 } });
    c.send("lutefit", { trait: "silk" });
    await wait(200);
    assert.equal(shop.at(-1).ok, false);
    assert.equal(p.weapon, "songweaver_weapon@12#steel");
    // a material on the ground
    room.dropItem("mat", p.x, p.y, 2, "mat_silk");
    await wait(300);
    assert.ok(fx.some((e) => e.ev === "matpick" && e.mat === "silk" && e.n === 2));
    assert.equal(books.at(-1).mats.silk, 2);
    assert.deepEqual(room.snapshot(p).swMats, { tonewood: n + 10 - 6, silk: 2 });
  } finally { await c.leave(); await wait(50); }
});

test("room: a knight leaves a material on the ground", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "knight" });
  try {
    await wait(250);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const before = room.state.items.size;
    room.dropItem("mat", p.x, p.y, 1, "mat_bone");
    await wait(300);
    assert.equal(room.state.items.size, before + 1, "still there");
  } finally { await c.leave(); await wait(50); }
});
