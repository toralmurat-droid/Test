import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, CLANS } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import { landOf, newWar, WAR, warTick } from "../shared/war/rules";
import { initialOwners, isSanctuary, TERRITORIES, territoryByName } from "../shared/war/territories";
import { SPAWN_ZONES } from "../shared/spawns";

function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

test("war map: every capital is a territory, borders are two-way, and every territory is reachable", () => {
  for (const k of CLAN_KEYS) for (const n of Object.values(CLANS[k].capitals)) assert.equal(territoryByName(n)?.capitalOf, k, `${k} capital ${n}`);
  for (const t of TERRITORIES) {
    assert.ok(t.near.length > 0, `${t.name} has no neighbour`);
    for (const n of t.near) assert.ok(TERRITORIES[n].near.includes(t.id), `${t.name} <-> ${TERRITORIES[n].name}`);
  }
  const seen = new Set([0]), todo = [0];
  while (todo.length) for (const n of TERRITORIES[todo.pop()!].near) if (!seen.has(n)) { seen.add(n); todo.push(n); }
  assert.equal(seen.size, TERRITORIES.length, "both acts form one connected war map");
  assert.ok(TERRITORIES.some((t) => t.act === 1) && TERRITORIES.some((t) => t.act === 2));
});

test("sanctuaries stay out of the war: dungeons, boss lairs and wild zones", () => {
  for (const z of SPAWN_ZONES) assert.equal(!!territoryByName(z.name), !isSanctuary(z), z.name);
  for (const n of ["The Gnawing Halls", "Gorehowl's Lair", "The Sun Furnace", "Oakvale Countryside", "The Sunscar"]) assert.equal(territoryByName(n), undefined, n);
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
