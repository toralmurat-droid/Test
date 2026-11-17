// Postgres store: runs only with TEST_DATABASE_URL (CI starts a Postgres service), skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { openKv, pgLeases, postgresStore } from "../server/store";

const url = process.env.TEST_DATABASE_URL;

test("postgres store: imports the JSON file once, upserts changed accounts, loads them back", { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP TABLE IF EXISTS accounts");
  await admin.end();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-test-"));
  const file = path.join(dir, "saves.json");
  fs.writeFileSync(file, JSON.stringify({ old: { name: "Old", gold: 5 } }));

  const s = await postgresStore<{ name: string; gold: number }>(url!, file);
  assert.deepEqual(await s.load(), { old: { name: "Old", gold: 5 } });
  await s.save({ old: { name: "Old", gold: 9 }, neu: { name: "Neu", gold: 1 } }, {});
  assert.deepEqual(await s.load(), { old: { name: "Old", gold: 9 }, neu: { name: "Neu", gold: 1 } });
  await s.close!();

  // A second start never imports again (the table is not empty), even if the file changed
  fs.writeFileSync(file, JSON.stringify({ other: { name: "Other", gold: 0 } }));
  const s2 = await postgresStore<{ name: string; gold: number }>(url!, file);
  assert.equal(Object.keys(await s2.load()).length, 2);
  await s2.close!();
});

test("postgres store: the world table saves and loads one row, and a bad table name is rejected", { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP TABLE IF EXISTS world");
  await admin.end();

  type World = { v: 1; tide: number; marchAt?: number; marches: number };
  const s = await postgresStore<World>(url!, undefined, "world");
  assert.deepEqual(await s.load(), {}, "a new world table is empty");
  await s.save({ world: { v: 1, tide: 9, marches: 1 } }, {});
  assert.deepEqual((await s.load()).world, { v: 1, tide: 9, marches: 1 });
  await s.save({ world: { v: 1, tide: 12, marchAt: 5000, marches: 2 } }, {});
  const all = await s.load();
  assert.equal(Object.keys(all).length, 1, "still one row");
  assert.deepEqual(all.world, { v: 1, tide: 12, marchAt: 5000, marches: 2 });
  await s.close!();

  for (const bad of ["world; DROP TABLE accounts", "Wor ld", "world1", "a-b"]) await assert.rejects(postgresStore(url!, undefined, bad), /Bad store table name/);
});

test("postgres store: loadOne reads one row; kv insertIfAbsent writes only a new key, list reads a prefix", { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP TABLE IF EXISTS world");
  await admin.query("DELETE FROM kv WHERE key LIKE 'agetest%'").catch(() => {});
  await admin.end();
  const s = await postgresStore<{ n: number }>(url!, undefined, "world");
  await s.save({ a: { n: 1 }, b: { n: 2 } }, {});
  assert.deepEqual(await s.loadOne!("b"), { n: 2 });
  assert.equal(await s.loadOne!("nope"), undefined);
  await s.close!();

  const kv = await openKv(url);
  assert.equal(await kv.insertIfAbsent!("agetest-pre", { n: 1 }), true);
  assert.equal(await kv.insertIfAbsent!("agetest-pre", { n: 2 }), false, "an existing key is kept");
  assert.deepEqual(await kv.get("agetest-pre"), { n: 1 });
  await kv.set("agetest-q:a", { x: 1 }); await kv.set("agetest-q:b", { x: 2 }); await kv.set("agetest-r", { x: 3 });
  assert.deepEqual(await kv.list!("agetest-q:"), { "agetest-q:a": { x: 1 }, "agetest-q:b": { x: 2 } });
  assert.deepEqual(await kv.take!("agetest-q:a"), { x: 1 }, "take reads and deletes");
  assert.equal(await kv.take!("agetest-q:a"), undefined, "only once");
  await kv.del!(["agetest-q:b", "agetest-r"]);
  assert.deepEqual(await kv.list!("agetest"), { "agetest-pre": { n: 1 } });
  assert.ok(kv.leases, "Postgres brings the shared lease table");
  await kv.close!();
});

test("postgres leases: one holder at a time, renewal in one call, takeover only after the lease ran out", { skip: !url }, async () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    await pool.query("DROP TABLE IF EXISTS leases");
    const l = await pgLeases(pool);
    assert.deepEqual((await l.acquire(["lease:a", "lease:b"], "x", 60_000)).sort(), ["lease:a", "lease:b"]);
    assert.deepEqual(await l.acquire(["lease:a", "lease:b"], "y", 60_000), [], "held by x");
    assert.deepEqual((await l.acquire(["lease:a", "lease:b"], "x", 60_000)).sort(), ["lease:a", "lease:b"], "x renews");
    // both try at once: exactly one wins a free key
    const [p, q] = await Promise.all([l.acquire(["lease:c"], "x", 60_000), l.acquire(["lease:c"], "y", 60_000)]);
    assert.equal(p.length + q.length, 1);
    await pool.query("UPDATE leases SET until = now() - interval '1 second' WHERE key = 'lease:a'");
    assert.deepEqual(await l.acquire(["lease:a", "lease:b"], "y", 60_000), ["lease:a"], "ran out: y takes it, b stays x's");
    await l.release(["lease:b"], "y");
    assert.deepEqual(await l.acquire(["lease:b"], "y", 60_000), [], "y cannot release x's lease");
    await l.release(["lease:b"], "x");
    assert.deepEqual(await l.acquire(["lease:b"], "y", 60_000), ["lease:b"], "released: free at once");
  } finally { await pool.end(); }
});

test("postgres accounts (Ages part 3): insertNew only for a new key, the write fence follows the lease, findBy reads one field", { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP TABLE IF EXISTS world");
  await admin.query("DELETE FROM leases WHERE key LIKE 'acct:%'").catch(() => {});
  await admin.end();
  type Acc = { name: string; gold: number; email?: string };
  const s = await postgresStore<Acc>(url!, undefined, "world"); // (a table of the accounts' shape; also makes the lease table)
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    const l = await pgLeases(pool);
    assert.equal(await s.insertNew!("amy", { name: "Amy", gold: 1, email: "a@x.io" }), true);
    assert.equal(await s.insertNew!("amy", { name: "AMY", gold: 99 }), false, "an existing account is never replaced");
    assert.deepEqual(await s.loadOne!("amy"), { name: "Amy", gold: 1, email: "a@x.io" });
    // no lease: refused; this holder's lease: written; another holder's: refused; ran out: refused; missing row: not made
    assert.deepEqual(await s.saveFenced!({ amy: { name: "Amy", gold: 2 } }, "A", "acct:"), ["amy"]);
    assert.equal((await s.loadOne!("amy"))!.gold, 1);
    await l.acquire(["acct:amy", "acct:ghost"], "A", 60_000);
    assert.deepEqual(await s.saveFenced!({ amy: { name: "Amy", gold: 3, email: "a@x.io" }, ghost: { name: "Ghost", gold: 1 } }, "A", "acct:"), ["ghost"]);
    assert.equal((await s.loadOne!("amy"))!.gold, 3);
    assert.equal(await s.loadOne!("ghost"), undefined, "the fence never creates a row");
    assert.deepEqual(await s.saveFenced!({ amy: { name: "Amy", gold: 4 } }, "B", "acct:"), ["amy"], "B does not hold it");
    await pool.query("UPDATE leases SET until = now() - interval '1 second' WHERE key = 'acct:amy'");
    assert.deepEqual(await s.saveFenced!({ amy: { name: "Amy", gold: 5 } }, "A", "acct:"), ["amy"], "ran out");
    assert.equal((await s.loadOne!("amy"))!.gold, 3);
    // findBy: the reset by email without loading every account
    await s.insertNew!("bea", { name: "Bea", gold: 0, email: "b@x.io" });
    assert.deepEqual(await s.findBy!("email", "a@x.io"), { amy: { name: "Amy", gold: 3, email: "a@x.io" } });
    assert.deepEqual(await s.findBy!("email", "nobody@x.io"), {});
    await l.release(["acct:amy", "acct:ghost"], "A");
  } finally { await pool.end(); await s.close!(); }
});
