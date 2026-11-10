// Champions (shared/champions.ts rules, server/champions.ts affixes): spawn rate, exclusions, 2.5x HP, the rune, each affix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOSS, ELITE, MOBS, TILE, type MobKind } from "../shared/constants";
import { AFFIX_FX, AFFIX_KEYS, AFFIXES, CHAMPION, canBeChampion, championName, championFullName, CHAMP_NAME_MAX, FAMILIES, FAMILY_OF, hasAffix, packAffixes, pickAffixes, rollChampion, unpackAffixes, type AffixKey } from "../shared/champions";
import { SPAWN_ZONES } from "../shared/spawns";
import { isRuneId } from "../shared/runes";
import { blocked } from "../shared/movement";
import { isSafeZone } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { startRoom, wait } from "./helpers/room";
import { CHAMP_WEAPONS } from "../tools/art/paint/look";
import { CHAMP_WEAPON_SHEETS } from "../shared/champions";

process.env.DAY_TIME = "day"; // no Night Raiders riding into the tests

/** A seeded random source, so rates are measured the same every run. */
function seeded(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test("about one in twenty eligible monsters comes as a champion, with 1-2 of its family's affixes", () => {
  const rnd = seeded(7), N = 200_000;
  let champs = 0, two = 0;
  for (let i = 0; i < N; i++) {
    const a = rollChampion("skeleton", rnd);
    if (!a) continue;
    champs++;
    if (a.length === 2) two++;
    assert.ok(a.every((k) => FAMILIES.necro.affixes.includes(k)));
  }
  const rate = champs / N;
  assert.ok(Math.abs(rate - CHAMPION.chance) < 0.003, `rate ${rate}`);
  assert.ok(Math.abs(two / champs - CHAMPION.twoAffixChance) < 0.03, "two-affix share");
  for (let i = 0; i < 200; i++) assert.deepEqual(pickAffixes("bandit", rnd), ["gang"], "a one-affix family always gives it");
});

test("share of champions over the real zone spawns stays near 5% of the eligible monsters", () => {
  const rnd = seeded(11);
  let all = 0, eligible = 0, champs = 0;
  for (let round = 0; round < 40; round++) for (const z of SPAWN_ZONES) for (const [k, n] of Object.entries(z.mobs) as [MobKind, number][]) {
    for (let i = 0; i < n; i++) { all++; if (canBeChampion(k)) eligible++; if (rollChampion(k, rnd)) champs++; }
  }
  assert.ok(eligible / all > 0.9, "almost every zone monster belongs to a family");
  assert.ok(Math.abs(champs / eligible - CHAMPION.chance) < 0.005, `rate ${champs / eligible}`);
});

test("never a champion: bosses, elites and lair mini-bosses, Night Raiders, summons, bloblings and raised dead", () => {
  for (const k of Object.keys(MOBS) as MobKind[]) {
    if (ELITE[k] || BOSS[k]) assert.equal(canBeChampion(k), false, k);
  }
  for (const k of ["nightraider", "blobling", "crawler", "golem_fire", "golem_colossus", "bride", "wisp", "demon", "necromancer", "packlord", "hornbrute", "gnasher", "weaver", "hidemother", "banditchief", "hollowking", "sunwright"] as MobKind[]) {
    assert.equal(canBeChampion(k), false, k);
    assert.equal(rollChampion(k, () => 0), null, k);
  }
  assert.equal(canBeChampion("skeleton", { owner: "hero" }), false, "a hero's thrall");
  assert.equal(rollChampion("skeleton", () => 0, { summoned: true }), null, "anything summoned");
  assert.ok(rollChampion("skeleton", () => 0), "a plain skeleton can be one");
});

test("affixes: each belongs to its family, packs into bits and back, and names a champion", () => {
  for (const [fam, def] of Object.entries(FAMILIES)) for (const k of def.affixes) assert.equal(AFFIXES[k].family, fam);
  for (const k of AFFIX_KEYS) assert.ok(Object.values(FAMILIES).some((f) => f.affixes.includes(k)), `${k} is used`);
  for (const kind of Object.keys(FAMILY_OF) as MobKind[]) assert.ok(MOBS[kind], kind);
  const a: AffixKey[] = ["siege", "risen"];
  assert.deepEqual(unpackAffixes(packAffixes(a)), a);
  assert.ok(hasAffix(packAffixes(a), "risen") && !hasAffix(packAffixes(a), "split"));
  assert.equal(unpackAffixes(0).length, 0);
  assert.equal(championName("skeleton", ["risen"], () => 0), "Morgrul");
  assert.equal(championFullName("Morgrul", packAffixes(["risen"])), "Morgrul the Risen");
  for (const f of Object.values(FAMILIES)) for (const n of f.names) assert.ok(n.length <= CHAMP_NAME_MAX, `"${n}" is too long for the label`);
});

test("humanoid champions carry another weapon (no hats or crowns); only blobs and scorpions get a painted detail", () => {
  assert.deepEqual(Object.keys(CHAMP_WEAPONS).sort(), [...CHAMP_WEAPON_SHEETS].sort(), "the client loads every painted champion sheet");
  for (const k of AFFIX_KEYS) {
    const fam = AFFIXES[k].family;
    assert.equal(!!AFFIXES[k].overlay, fam === "gloam" || fam === "scorpion", `${k}: painted detail only for blobs and scorpions`);
  }
});

// ---- On the server ----

/** A clear patch of open ground (radius r px) near (tx, ty) tiles. */
function openAt(tx: number, ty: number, r = 90): { x: number; y: number } {
  for (let d = 0; d < 60; d++) for (let a = 0; a < 16; a++) {
    const x = (tx + Math.cos(a / 16 * Math.PI * 2) * d) * TILE, y = (ty + Math.sin(a / 16 * Math.PI * 2) * d) * TILE;
    let ok = true;
    for (let k = 0; k < 12 && ok; k++) { const px = x + Math.cos(k) * r * (k % 3) / 2, py = y + Math.sin(k) * r * (k % 3) / 2; ok = !blocked(px, py) && !isSafeZone(px, py) && !noMobsAt(px, py); }
    if (ok) return { x, y };
  }
  throw new Error("no open ground");
}

test("champions on the server: zone spawns, 2.5x HP, the rune, and every affix at work", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const ev: { ev: string; id?: string }[] = [];
    c.onMessage("champ", (d: { ev: string }) => ev.push(d));
    await wait(200);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
    p.hp = p.maxHp = 9_999_999; p.level = 30;
    const o = openAt(40, 120);
    p.x = o.x; p.y = o.y;

    // Zone spawns at start: some champions, never an elite, each with 2.5x its HP and a name
    let zoneMobs = 0, champs = 0;
    room.state.mobs.forEach((m: any) => {
      if (m.zone < 0) return;
      zoneMobs++;
      if (!m.champion) return;
      champs++;
      assert.ok(canBeChampion(m.kind), `${m.kind} may not be a champion`);
      assert.ok(m.title.length > 3, "named");
      assert.ok(m.champ.affixes.length >= 1 && m.champ.affixes.length <= 2);
    });
    assert.ok(champs > zoneMobs * 0.02 && champs < zoneMobs * 0.09, `${champs} champions in ${zoneMobs}`);
    room.state.mobs.forEach((m: any) => { if (m.guard) assert.equal(m.champion, 0, "lair guards stay plain"); });

    let seq = 0;
    /** A fresh champion of `kind` with these affixes, dist px from the hero, already fighting them. */
    const champ = (kind: MobKind, affixes: AffixKey[], dist = 30, level = 30) => {
      const id = `test${++seq}`;
      room.spawnMob(kind, -1, id, { x: p.x + dist, y: p.y, level });
      const m = room.state.mobs.get(id);
      const hp0 = m.maxHp;
      room.champs.make(m, id, affixes);
      assert.equal(m.maxHp, Math.round(hp0 * CHAMPION.hpMult), "2.5x HP");
      assert.equal(m.hp, m.maxHp);
      m.target = pid; m.nextAggro = Date.now() + 60_000;
      return { id, m };
    };
    const until = async (f: () => boolean, ms = 4000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };

    // A sure rune and a potion in the loot, three times the gold and the XP
    {
      const kill = (champion: boolean) => {
        const id = `loot${++seq}`;
        room.spawnMob("slime", -1, id, { x: p.x + 30, y: p.y, level: 30 });
        const m = room.state.mobs.get(id);
        if (champion) room.champs.make(m, id, ["taint"]);
        const before = new Set<string>(); room.state.items.forEach((_: any, k: string) => before.add(k));
        const xp0 = p.xp, lv0 = p.level;
        room.hitTarget(pid, id, m.maxHp * 10, [0, 0]);
        assert.ok(m.dead);
        p.level = lv0; // a level up would change the XP curve
        const fresh: any[] = []; room.state.items.forEach((it: any, k: string) => { if (!before.has(k)) fresh.push(it); });
        for (const it of fresh) room.state.items.delete([...room.state.items.entries()].find(([, v]: any) => v === it)![0]);
        return { xp: p.xp - xp0, gold: fresh.filter((i) => i.kind === "gold").reduce((n, i) => n + i.amount, 0), runes: fresh.filter((i) => isRuneId(i.gear)).length, potions: fresh.filter((i) => i.kind === "potion").length };
      };
      let plainGold = 0, champGold = 0;
      for (let i = 0; i < 20; i++) { plainGold += kill(false).gold; }
      const plain = kill(false);
      for (let i = 0; i < 19; i++) { const c = kill(true); champGold += c.gold; assert.ok(c.runes >= 1, "a rune drops"); assert.ok(c.potions >= CHAMPION.potions, "a potion drops"); }
      const champ1 = kill(true);
      champGold += champ1.gold;
      assert.ok(plain.xp > 0);
      assert.ok(Math.abs(champ1.xp / plain.xp - CHAMPION.xpMult) < 0.2, `XP x${champ1.xp / plain.xp}`);
      assert.ok(champGold > plainGold * 2, `gold ${champGold} vs ${plainGold}`);
    }
    // Harder blows: a champion's shot carries CHAMPION.dmgMult more damage
    {
      const shot = (champion: boolean) => {
        const id = `mage${++seq}`;
        room.spawnMob("skeletonmage", -1, id, { x: p.x + 200, y: p.y, level: 30 });
        const m = room.state.mobs.get(id);
        if (champion) room.champs.make(m, id, ["risen"]);
        const ids = new Set<string>(); room.state.projectiles.forEach((_: any, k: string) => ids.add(k));
        room.mobShot(m, id, p.x, p.y);
        let dmg = 0; room.state.projectiles.forEach((s: any, k: string) => { if (!ids.has(k)) dmg = s.damage; });
        m.dead = true;
        return dmg;
      };
      const a = shot(false), b = shot(true);
      assert.ok(a > 0 && Math.abs(b / a - CHAMPION.dmgMult) < 0.05, `damage x${b / a}`);
    }
    // Risen: back up once at 30%, down for good the second time
    {
      const { id, m } = champ("skeleton", ["risen"]);
      room.hitTarget(pid, id, m.maxHp * 10, [0, 0]);
      assert.ok(!m.dead, "gets back up");
      assert.equal(m.hp, Math.round(m.maxHp * AFFIX_FX.risen.hpFrac));
      assert.ok(await until(() => ev.some((e) => e.ev === "rise" && e.id === id)));
      room.hitTarget(pid, id, m.maxHp * 10, [0, 0]);
      assert.ok(m.dead, "only once");
    }
    // Splitting: a twin breaks off at half health
    {
      const { id, m } = champ("warriorblob", ["split"]);
      const n0 = room.state.mobs.size;
      room.hitTarget(pid, id, Math.ceil(m.maxHp * 0.55), [0, 0]);
      assert.equal(room.state.mobs.size, n0 + 1, "a twin");
      assert.ok(await until(() => ev.some((e) => e.ev === "split" && e.id === id)));
      const twin = room.state.mobs.get((ev.find((e: any) => e.ev === "split" && e.id === id) as any).twin);
      assert.equal(twin.kind, "warriorblob"); assert.equal(twin.champion, 0, "the twin is plain");
      assert.ok(twin.banishAt > Date.now(), "a helper leaves again if nobody kills it");
      room.hitTarget(pid, id, 1, [0, 0]);
      assert.equal(room.state.mobs.size, n0 + 1, "only one split");
    }
    // Hide-Stitched: its other skin at half health, faster
    {
      const { id, m } = champ("tuskborn", ["stitched"]);
      const w0 = m.weapon;
      room.hitTarget(pid, id, Math.ceil(m.maxHp * 0.55), [0, 0]);
      assert.ok(m.champ.shifted && m.weapon !== w0, "changed skin");
      assert.ok(await until(() => ev.some((e) => e.ev === "shift" && e.id === id)));
      m.dead = true;
    }
    // Ringleader: two cutthroats come when it spots you
    {
      const { id, m } = champ("bandit", ["gang"]);
      assert.ok(await until(() => m.champ.called), "calls");
      let cut = 0;
      room.state.mobs.forEach((o: any, k: string) => { if (k.startsWith("c") && o.kind === "bandit" && o.weapon === "cutthroat" && !o.champion && Math.hypot(o.x - m.x, o.y - m.y) < 80) cut++; });
      assert.ok(cut >= AFFIX_FX.gang.count, `${cut} cutthroats`);
      void id; m.dead = true;
    }
    // Siegewright: a ballista goes up and shoots
    {
      const { id, m } = champ("skeleton", ["siege"], 120);
      assert.ok(await until(() => room.champs.ballistaCount(id) === 1), "a ballista");
      assert.ok(await until(() => ev.some((e) => e.ev === "fire")), "it shoots");
      room.hitTarget(pid, id, m.maxHp * 10, [0, 0]);
      assert.equal(room.champs.ballistaCount(id), 0, "falls with its builder");
    }
    // Sunborn: burns close heroes and makes their Heat climb
    {
      const { m } = champ("veiled", ["sunborn"], 25);
      const hp0 = p.hp; p.energy = 0;
      assert.ok(await until(() => p.hp < hp0 && p.energy > 0), "burns and heats");
      m.dead = true;
    }
    // Sand-Buried and Veil-Bearer: gone for a moment, then out right by the hero
    for (const [kind, aff, down, up] of [["sanddead", "buried", "burrow", "surface"], ["nomad", "veil", "veil", "unveil"]] as [MobKind, AffixKey, string, string][]) {
      const { id, m } = champ(kind, [aff], 90);
      m.champ.nextBlink = 0;
      assert.ok(await until(() => ev.some((e) => e.ev === down && e.id === id)), `${aff}: goes`);
      assert.ok(await until(() => ev.some((e) => e.ev === up && e.id === id)), `${aff}: comes back`);
      assert.ok(!m.hidden && Math.hypot(m.x - p.x, m.y - p.y) < 45, `${aff}: by the hero`);
      m.dead = true;
    }
    // Tainted and Deep-Venomed: puddles behind them
    for (const [kind, aff] of [["fireblob", "taint"], ["scorpion", "deepvenom"]] as [MobKind, AffixKey][]) {
      const { id, m } = champ(kind, [aff], 60);
      assert.ok(await until(() => ev.some((e: any) => e.ev === "pool" && e.id === id)), `${aff}: a puddle`);
      if (aff === "taint") assert.equal((ev.find((e: any) => e.ev === "pool" && e.id === id) as any).el, "fire");
      m.dead = true;
    }
    // Sun-Branded: the third brand flares
    {
      const { id, m } = champ("camelfolk", ["brand"], 200);
      m.stunUntil = Date.now() + 60_000;
      const now = Date.now();
      room.champs.struck(m, id, pid, now); room.champs.struck(m, id, pid, now);
      assert.equal(room.champs.brandsOn(id, pid), 2);
      const hp0 = p.hp; p.energy = 0;
      room.champs.struck(m, id, pid, now);
      assert.equal(room.champs.brandsOn(id, pid), 0);
      assert.ok(p.hp < hp0 && p.energy >= AFFIX_FX.brand.heat - 1, "flares");
      m.dead = true;
    }
    c.leave();
  } finally {
    await srv.stop();
  }
});
