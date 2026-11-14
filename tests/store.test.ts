// Postgres store: runs only with TEST_DATABASE_URL (CI starts a Postgres service), skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { postgresStore } from "../server/store";

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
