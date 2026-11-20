import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import { landOf, newWar, WAR, warTick } from "../shared/war/rules";
import { builtRegions, initialOwners, isSanctuary, TERRITORIES, territoryByName } from "../shared/war/territories";
import { capitalsOf, regionOf } from "../shared/war/regions";
import { SPAWN_ZONES } from "../shared/spawns";

function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

test("war map: every capital is a territory, borders are two-way, and every territory is reachable", () => {
  for (const [n, c] of capitalsOf(builtRegions(TERRITORIES))) assert.equal(territoryByName(n)?.capitalOf, c.clan, `${c.clan} capital ${n}`);
  // every homeland built, so no forward capital is left; one capital per clan, each in its own homeland (coherence
  // review 2026-11-20: the footholds and the Grey Ring garrison are ordinary territories)
  const caps: Record<string, string[]> = { wardens: ["oakvale"], redfang: ["badlands"], host: ["moors"], hidekin: ["sinkholes"], veiled: ["sunscar"] };
  for (const k of CLAN_KEYS) assert.deepEqual(TERRITORIES.filter((t) => t.capitalOf === k).map((t) => t.region).sort(), caps[k], k);
  assert.ok(!TERRITORIES.some((t) => t.forward), "no forward capitals remain");
  for (const t of TERRITORIES) {
    assert.ok(t.near.length > 0, `${t.name} has no neighbour`);
    for (const n of t.near) assert.ok(TERRITORIES[n].near.includes(t.id), `${t.name} <-> ${TERRITORIES[n].name}`);
  }
  const seen = new Set([0]), todo = [0];
  while (todo.length) for (const n of TERRITORIES[todo.pop()!].near) if (!seen.has(n)) { seen.add(n); todo.push(n); }
  assert.equal(seen.size, TERRITORIES.length, "all five acts form one connected war map");
  for (const a of [1, 2, 3, 4, 5]) assert.ok(TERRITORIES.some((t) => t.act === a), `Act ${a} is at war`);
});

test("sanctuaries stay out of the war: dungeons, boss lairs and wild zones", () => {
  // (zones of a land that is not built yet stay out too)
  for (const z of SPAWN_ZONES) assert.equal(!!territoryByName(z.name), !isSanctuary(z) && !!regionOf(z.x + (z.w >> 1), z.y + (z.h >> 1)), z.name);
  for (const n of ["The Gnawing Halls", "Gorehowl's Lair", "The Sun Furnace", "Oakvale Countryside", "The Sunscar", "The Barrow-King's Mound", "The Grey Barrow Moors",
    "Fangrock Keep", "The Red Badlands", "The Great Maw", "The Mawdeep Sinkholes"]) assert.equal(territoryByName(n), undefined, n);
});

test("every clan starts with land around its capitals", () => {
  const o = initialOwners();
  for (const k of CLAN_KEYS) assert.ok(o.filter((x) => x === k).length >= 3, k);
});

test("capitals never fall and the war is deterministic for a seed", () => {
  const run = () => {
    const s = newWar(), m = newMinds(), r = rng(7);
    for (let i = 0; i < WAR.ticksPerDay * 10; i++) {
      warTick(s, scriptedOrders(s, m, r));
      for (const t of TERRITORIES) if (t.capitalOf) assert.equal(s.owner[t.id], t.capitalOf, `${t.name} fell`);
    }
    return s.owner.join();
  };
  assert.equal(run(), run());
});

test("left alone, no clan runs away with the map", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const s = newWar(), m = newMinds(), r = rng(seed);
    for (let i = 0; i < WAR.ticksPerDay * 12; i++) warTick(s, scriptedOrders(s, m, r));
    const top = Math.max(...CLAN_KEYS.map((k) => landOf(s, k))) / s.owner.length;
    assert.ok(top <= 0.36, `seed ${seed}: one clan holds ${(top * 100).toFixed(0)}%`);
    for (const k of CLAN_KEYS) assert.ok(landOf(s, k) >= 2, `seed ${seed}: ${k} was all but wiped out`);
  }
});

test("broken or illegal orders never poison the war", () => {
  const s = newWar(), bad: any = { wardens: { defend: NaN, attack: [{ t: 0, share: Infinity }] }, redfang: { defend: 0.5, attack: [{ t: 9999, share: 1 }, { t: 1.5, share: 1 }] } };
  for (let i = 0; i < 50; i++) warTick(s, bad); // host, hidekin and veiled send nothing at all
  for (const k of CLAN_KEYS) assert.ok(Number.isFinite(s.army[k]), k);
  assert.ok(s.control.every(Number.isFinite));
});

test("a siege takes a territory when the attack still out-fights the defence", () => {
  const s = newWar();
  const t = TERRITORIES.find((x) => !x.capitalOf && x.near.some((n) => s.owner[n] !== s.owner[x.id]))!;
  const attacker = s.owner[t.near.find((n) => s.owner[n] !== s.owner[t.id])!];
  s.army[attacker] = 1e6;
  for (let i = 0; i < WAR.ticksPerDay && s.owner[t.id] !== attacker; i++) warTick(s, { [attacker]: { defend: 0, attack: [{ t: t.id, share: 1 }] } });
  assert.equal(s.owner[t.id], attacker, `${attacker} took ${t.name}`);
});

test("tunnels: a Hide-Kin strike two borders away is fed from where the tunnel starts", async () => {
  const { targetsOf, newWar, warTick, WAR } = await import("../shared/war/rules");
  // Since the sinkholes joined (no forward capitals left) the Hide-Kin's land on a new war is their homeland, and its
  // only way out (Hollowbrook Dells, the Sinkway) lies far from Hidehall: a tunnel from there is fed little more than a
  // cut-off strike. So the Wardens take Tunneltop and the three lands round it, and the Hide-Kin tunnel back in from
  // Hidehall's side, two borders away.
  const war = () => {
    const s = newWar();
    for (const n of ["Tunneltop", "Rootfall Slopes", "The Pitfields", "Rushmere Hollows"]) s.owner[territoryByName(n)!.id] = "wardens";
    return s;
  };
  const s = war(), far = territoryByName("Tunneltop")!.id;
  assert.ok(targetsOf(s, "hidekin").includes(far) && !TERRITORIES[far].near.some((n) => s.owner[n] === "hidekin"), "a tunnel target");
  const out = warTick(war(), { hidekin: { defend: 0, attack: [{ t: far, share: 1 }] } }, { phase: 0 });
  assert.ok(out.pressure[far] > out.army.hidekin * WAR.cutOff * 1.5, `well above a cut-off strike (${out.pressure[far]})`);
});
