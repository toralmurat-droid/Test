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
