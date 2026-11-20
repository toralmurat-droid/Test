// Account save versions (Ages part 5, shared/accountApi.ts): an older build never logs in, edits or writes an account a
// newer build saved, and keeps the fields it does not know (account and hero level) through login, play and save.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { accountAccess, ACCOUNT_API, ACCOUNT_MIN_READER } from "../shared/accountApi";
/** A newer build's account version than this one's. */
const NEXT = ACCOUNT_API + 1;
import { memLeases } from "../server/lease";
import { memDb } from "./helpers/fencedStore";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acctver-test-"));
process.env.SAVE_FILE = path.join(dir, "saves.json");
const IP = "127.0.0.1", PW = "testpass1";
const acct = (name: string, extra: Record<string, unknown> = {}) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return { name, salt, hash: crypto.scryptSync(PW, salt, 32).toString("hex"), created: 1, heroes: {}, ...extra };
};
const NEW_AGE = /lives in the new Age: play it there/;
// The JSON save file the accounts module reads when first imported: an old account (no av) and a newer build's
const hero = { color: 1, xp: 0, level: 3, kills: 0, gold: 5, potions: 0, ptSta: 0, ptStr: 0, ptMag: 0, weapon: "", armour: "", shoes: "", hat: "", shield: "", ranged: "", bag: [], talents: {}, slots: [], questStage: 0, questCount: 0, zap: 7 };
const saved = { oldie: acct("Oldie", { guild: "far", heroes: { wizard: hero } }), newer: acct("Newer", { av: NEXT, minReader: NEXT, heroes: { wizard: hero } }) };
fs.writeFileSync(process.env.SAVE_FILE, JSON.stringify(saved));

test("accountAccess: missing av is 1; a newer account is read-only when minReader allows, else hidden", () => {
  // 2 since settlement network step 4 (new portal ids: an older build's cleanPortals would drop the village stones)
  assert.equal(ACCOUNT_API, 2);
  assert.equal(ACCOUNT_MIN_READER, 1, "older builds may still show the accounts");
  assert.equal(accountAccess({ name: "a" }), "write", "old saves (no av) are version 1");
  assert.equal(accountAccess({ av: null }), "write");
  assert.equal(accountAccess({ av: 1, minReader: 1 }), "write");
  assert.equal(accountAccess({ av: 2, minReader: 1 }), "write", "this build's own");
  assert.equal(accountAccess({ av: 2, minReader: 1 }, 1), "read", "an older build (1) may show this build's accounts, never write them");
  assert.equal(accountAccess({ av: NEXT }), "hide", "a newer account that names no reader");
  assert.equal(accountAccess({ av: NEXT, minReader: 1 }), "read");
  assert.equal(accountAccess({ av: NEXT, minReader: NEXT }), "hide");
  assert.equal(accountAccess({ av: NEXT, minReader: "x" }), "hide", "an unusable minReader is the account's own version");
  assert.equal(accountAccess({ av: 2, minReader: 1 }, 2), "write", "the newer build writes its own");
  assert.equal(accountAccess({ av: 3, minReader: 2 }, 2), "read");
  assert.equal(accountAccess({ av: "two" }), "hide", "an av that is no version: not ours");
  assert.equal(accountAccess({ av: 0 }), "hide");
  assert.equal(accountAccess(null), "hide");
  assert.equal(accountAccess([]), "hide");
});

test("keepUnknown: a newer build's hero fields are kept, known fields the snapshot leaves out are dropped", async () => {
  const { keepUnknown } = await import("../server/accounts");
  const old = { gold: 1, wear: 50, clan: "x", zap: 7, future: { a: [1] } } as any;
  const out = keepUnknown(old, { gold: 9 } as any) as any;
  assert.deepEqual(out, { zap: 7, future: { a: [1] }, gold: 9 });
  assert.deepEqual(keepUnknown(undefined, { gold: 2 } as any), { gold: 2 });
  assert.equal((keepUnknown({ toString: 5 } as any, { gold: 1 } as any) as any).toString, 5, "own keys only");
});

test("accounts (JSON): an old save without av loads and is written with this build's av, unknown fields kept; a newer one is refused and never written", async () => {
  const acc = await import("../server/accounts");
  assert.equal(await acc.login("Oldie", PW, IP), "Oldie");
  const { zap: _z, ...known } = hero; // (the snapshot of a build that does not know `zap`)
  acc.saveHero("Oldie", "wizard", { ...known, gold: 77 } as any);
  await acc.login("Fresh1", "longenough", IP);
  await assert.rejects(acc.login("Newer", PW, IP), NEW_AGE);
  await assert.rejects(acc.login("Newer", "wrongwrong", IP), /Wrong password/, "the password is checked first");
  await assert.rejects(acc.peek("Newer", PW, IP), NEW_AGE);
  await assert.rejects(acc.setEmail("Newer", PW, "a@b.cd", IP), NEW_AGE);
  acc.saveHero("Newer", "wizard", { ...hero, gold: 1 } as any);
  acc.markChest("Newer", "c1", Date.now() + 60_000);
  await acc.flush();
  const disk = JSON.parse(fs.readFileSync(process.env.SAVE_FILE!, "utf8"));
  assert.equal(disk.oldie.av, ACCOUNT_API);
  assert.equal(disk.oldie.minReader, ACCOUNT_MIN_READER);
  assert.equal(disk.oldie.guild, "far", "unknown account field kept");
  assert.equal(disk.oldie.heroes.wizard.gold, 77);
  assert.equal(disk.oldie.heroes.wizard.zap, 7, "unknown hero field kept");
  assert.equal(disk.fresh1.av, ACCOUNT_API, "new accounts carry av");
  assert.deepEqual(disk.newer, saved.newer, "the newer account is untouched");
});

test("accounts (shared): login, peek, edits and claims of a newer account are refused, and it is never written", async () => {
  const acc = await import("../server/accounts");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "old", retryMs: 1 });
  const code = "123456", reset = { hash: crypto.createHash("sha256").update(code).digest("hex"), until: Date.now() + 600_000, tries: 0 };
  const row = acct("Future", { av: NEXT, minReader: NEXT, email: "f@x.io", reset, extra: { keep: true } });
  db.rows.set("future", structuredClone(row));
  await assert.rejects(acc.login("Future", PW, IP), NEW_AGE);
  await assert.rejects(acc.peek("Future", PW, IP), NEW_AGE);
  await assert.rejects(acc.setEmail("Future", PW, "g@x.io", IP), NEW_AGE);
  await assert.rejects(acc.resetPassword("Future", "000000", "newpassword", IP), NEW_AGE, "not even a wrong guess is counted");
  await assert.rejects(acc.resetPassword("Future", code, "newpassword", IP), NEW_AGE);
  assert.deepEqual(await acc.requestReset("Future", IP), { sent: false });
  assert.ok(![...leases.rows.keys()].includes("acct:future"), "edits gave the lease back");
  // A newer account that allows older readers is listed (showing writes nothing), still not played
  db.rows.set("future", { ...structuredClone(row), minReader: 1 });
  assert.equal((await acc.peek("Future", PW, IP)).exists, true);
  await assert.rejects(acc.login("Future", PW, IP), NEW_AGE);
  db.rows.set("future", structuredClone(row));

  // Logged in while it was version 1; a newer build wrote it before the room claimed it: the claim reloads and refuses
  db.rows.set("later", acct("Later"));
  assert.equal(await acc.login("Later", PW, IP), "Later");
  const newer = acct("Later", { av: NEXT, heroes: { wizard: { gold: 3, beyond: 1 } } });
  db.rows.set("later", structuredClone(newer));
  await assert.rejects(acc.claimAccount("Later"), NEW_AGE);
  assert.ok(!leases.rows.has("acct:later"), "the lease went back");
  acc.saveHero("Later", "wizard", { gold: 999 } as any);
  acc.saveStash("Later", { items: [], gold: 5 }, "wizard", { gold: 999 } as any);
  acc.resetChests("Later");
  await acc.flush();
  assert.equal(db.writes, 0, "nothing written");
  assert.deepEqual(db.rows.get("later"), newer);
  assert.deepEqual(db.rows.get("future"), row);
});

test("accounts (room): unknown account and hero fields survive login, play and save; an old row without av is written with this build's av", async () => {
  const acc = await import("../server/accounts");
  const { startRoom, until, wait } = await import("./helpers/room");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "here", retryMs: 5 });
  const srv = await startRoom();
  try {
    await srv.join({ cls: "wizard" });
    await wait(100);
    const room = srv.room, name = "Roundy", ctx = { ip: IP, headers: {} }, opts = { name, password: PW, cls: "wizard" };
    const client = (sid: string) => ({ sessionId: sid, send: () => {} });
    const play = async (sid: string, gold: number) => {
      const c = client(sid);
      assert.deepEqual(await room.onAuth(c, opts, ctx), { name });
      room.onJoin(c, { cls: "wizard" }, { name });
      room.state.players.get(sid).gold = gold;
      room.onLeave(c);
      assert.ok(await until(() => !leases.rows.has("acct:roundy")), "saved and released");
    };
    await acc.login(name, PW, IP);
    await play("r1", 100);
    // A newer Age added fields (account and hero level) without a bump; the row also predates av
    const r = db.rows.get("roundy");
    delete r.av; delete r.minReader;
    Object.assign(r, { realm: { banner: "blue" }, perks: [1, 2] });
    Object.assign(r.heroes.wizard, { zap: 7, deeds: { kraken: 2 } });
    r.heroes.oracle = { level: 9, gold: 1, newOnly: true };
    await play("r2", 250);
    const out = db.rows.get("roundy");
    assert.equal(out.av, ACCOUNT_API, "written with this build's av");
    assert.equal(out.minReader, ACCOUNT_MIN_READER);
    assert.deepEqual(out.realm, { banner: "blue" });
    assert.deepEqual(out.perks, [1, 2]);
    assert.equal(out.heroes.wizard.gold, 250, "the play was saved");
    assert.equal(out.heroes.wizard.zap, 7);
    assert.deepEqual(out.heroes.wizard.deeds, { kraken: 2 });
    assert.deepEqual(out.heroes.oracle, { level: 9, gold: 1, newOnly: true }, "a hero of a class this build does not know");
    // New game starts the hero over: nothing of the old one is kept
    const c = client("r3");
    await room.onAuth(c, opts, ctx);
    room.onJoin(c, { cls: "wizard", newGame: true }, { name });
    room.onLeave(c);
    assert.ok(await until(() => !leases.rows.has("acct:roundy")));
    assert.equal(db.rows.get("roundy").heroes.wizard.zap, undefined);
    assert.deepEqual(db.rows.get("roundy").realm, { banner: "blue" }, "account fields stay");
  } finally { await srv.stop(); }
});
