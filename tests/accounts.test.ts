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
  assert.deepEqual(await acc.peek("Newbie", "longenough", "1.2.3.4"), { exists: true, heroes: {}, email: "" });
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

test("accounts: email + password reset by code", async () => {
  const acc = await import("../server/accounts");
  const { outbox } = await import("../server/mailer");
  const ip = "7.7.7.7";
  await acc.login("Forgetful", "firstpass1", ip);
  await assert.rejects(acc.setEmail("Forgetful", "wrongwrong", "a@b.co", ip), /Wrong password/);
  await assert.rejects(acc.setEmail("Forgetful", "firstpass1", "not-an-email", ip), /email/);
  assert.equal(await acc.setEmail("Forgetful", "firstpass1", " Me@Example.COM ", ip), "me@example.com");
  assert.equal((await acc.peek("Forgetful", "firstpass1", ip) as any).email, "me@example.com");
  // no email -> nothing sent
  await acc.login("NoMail", "firstpass1", ip);
  assert.deepEqual(await acc.requestReset("NoMail", ip), { sent: false });
  const r = await acc.requestReset("forgetful", ip);
  assert.deepEqual(r, { sent: true, to: "m***@example.com" });
  const mail = outbox.at(-1)!;
  assert.equal(mail.to, "me@example.com");
  const code = /Code: (\d{6})/.exec(mail.text)![1];
  // asking again right away sends nothing new (1 a minute per account)
  assert.deepEqual(await acc.requestReset("me@example.com", ip), { sent: false });
  await assert.rejects(acc.resetPassword("Forgetful", code, "short", ip), /at least 8/);
  const wrong = code === "000000" ? "111111" : "000000";
  await assert.rejects(acc.resetPassword("Forgetful", wrong, "secondpass2", ip), /wrong or too old/);
  assert.equal(await acc.resetPassword("Forgetful", code, "secondpass2", ip), "Forgetful");
  await assert.rejects(acc.login("Forgetful", "firstpass1", ip), /Wrong password/);
  assert.equal(await acc.login("Forgetful", "secondpass2", ip), "Forgetful");
  // a code works once
  await assert.rejects(acc.resetPassword("Forgetful", code, "thirdpass3", ip), /wrong or too old/);
});

test("accounts: reset codes expire and lock after 5 wrong tries", async () => {
  const acc = await import("../server/accounts");
  const { outbox } = await import("../server/mailer");
  const ip = "8.8.8.8";
  await acc.login("Locky", "firstpass1", ip);
  await acc.setEmail("Locky", "firstpass1", "locky@example.com", ip);
  const t = Date.now();
  await acc.requestReset("Locky", ip, t);
  const code = /Code: (\d{6})/.exec(outbox.at(-1)!.text)![1];
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await assert.rejects(acc.resetPassword("Locky", wrong, "newpass123", ip, t), /wrong/);
  await assert.rejects(acc.resetPassword("Locky", code, "newpass123", ip, t), /wrong/);
  await acc.requestReset("Locky", ip, t + 61_000);
  const code2 = /Code: (\d{6})/.exec(outbox.at(-1)!.text)![1];
  await assert.rejects(acc.resetPassword("Locky", code2, "newpass123", ip, t + 61_000 + 31 * 60_000), /too old/);
});
