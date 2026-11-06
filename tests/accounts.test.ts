import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "accounts-test-"));
process.env.SAVE_FILE = path.join(dir, "saves.json");

test("accounts: create, log in, wrong password, throttling, save to disk", async () => {
  const acc = await import("../server/accounts");
  await assert.rejects(acc.login("Newbie", "short", "1.2.3.4"), /at least 8/);
  assert.equal(await acc.login("Newbie", "longenough", "1.2.3.4"), "Newbie");
  assert.equal(await acc.login("newbie", "longenough", "1.2.3.4"), "Newbie");
  assert.deepEqual(await acc.peek("Newbie", "longenough", "1.2.3.4"), { exists: true, heroes: {} });
  // 5 free wrong tries, then the account waits
  for (let i = 0; i < 5; i++) await assert.rejects(acc.login("Newbie", "wrongwrong", "1.2.3.4"), /Wrong password/);
  await assert.rejects(acc.login("Newbie", "wrongwrong", "1.2.3.4"), /Wrong password/);
  await assert.rejects(acc.login("Newbie", "longenough", "1.2.3.4"), /Too many wrong passwords/);
  await acc.flush();
  const disk = JSON.parse(fs.readFileSync(process.env.SAVE_FILE!, "utf8"));
  assert.equal(disk.newbie.name, "Newbie");
  assert.equal(disk.newbie.hash.length, 64);
});

test("accounts: new accounts per address are capped", async () => {
  const acc = await import("../server/accounts");
  const made = [];
  for (let i = 0; i < 12; i++) made.push(await acc.login(`Spam${i}`, "longenough", "9.9.9.9").then(() => true, () => false));
  assert.equal(made.filter(Boolean).length, 10);
});

test("accounts: background saves keep working after a blocking final write (room emptied, not shutdown)", async () => {
  const acc = await import("../server/accounts");
  await acc.flushFinal();
  await acc.login("Later", "longenough", "5.5.5.5");
  await acc.flush();
  const disk = JSON.parse(fs.readFileSync(process.env.SAVE_FILE!, "utf8"));
  assert.ok(disk.later, "account made after the final write is on disk");
});
