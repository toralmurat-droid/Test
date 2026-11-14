// server/assetVersions.ts + client/src/assetUrl.ts: art URLs carry a hash of the file's bytes, and only a matching hash
// is cached for good. A hash from anything but the content (mtime, build time) would serve stale art after a deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAssetManifest, contentHash, fileHashes, IMMUTABLE, versionedCacheControl } from "../server/assetVersions";
import { assetUrl, versionedUrl } from "../client/src/assetUrl";

const tmpPublic = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assetv-"));
  fs.mkdirSync(path.join(dir, "assets/hd/mobs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets/hd/mobs/slime.webp"), "slime v1");
  fs.writeFileSync(path.join(dir, "assets/hd/mobs/mobs.json"), "{}");
  fs.writeFileSync(path.join(dir, "favicon.ico"), "ico");
  fs.writeFileSync(path.join(dir, "assets/page.html"), "<html>");
  return dir;
};

test("the hash depends on the content only, and is short", () => {
  assert.match(contentHash("abc"), /^[0-9a-f]{8}$/);
  assert.equal(contentHash("abc"), contentHash(Buffer.from("abc")));
  assert.notEqual(contentHash("abc"), contentHash("abd"));
});

test("the manifest lists every public file but HTML, by posix path, and follows content not mtime", () => {
  const dir = tmpPublic();
  const a = buildAssetManifest(dir);
  assert.deepEqual(Object.keys(a), ["assets/hd/mobs/mobs.json", "assets/hd/mobs/slime.webp", "favicon.ico"]);
  assert.equal(a["assets/hd/mobs/slime.webp"], contentHash("slime v1"));
  // a fresh checkout (new mtime, same bytes) keeps every hash
  const later = new Date(Date.now() + 86_400_000);
  fs.utimesSync(path.join(dir, "assets/hd/mobs/slime.webp"), later, later);
  assert.deepEqual(buildAssetManifest(dir), a);
  // new bytes: only that file's hash moves
  fs.writeFileSync(path.join(dir, "assets/hd/mobs/slime.webp"), "slime v2");
  const b = buildAssetManifest(dir);
  assert.notEqual(b["assets/hd/mobs/slime.webp"], a["assets/hd/mobs/slime.webp"]);
  assert.equal(b["assets/hd/mobs/mobs.json"], a["assets/hd/mobs/mobs.json"]);
});

test("the server's file hash matches the build's", async () => {
  const dir = tmpPublic(), hashOf = fileHashes(), m = buildAssetManifest(dir);
  assert.equal(await hashOf(path.join(dir, "assets/hd/mobs/slime.webp")), m["assets/hd/mobs/slime.webp"]);
  assert.equal(await hashOf(path.join(dir, "nope.png")), null);
  assert.equal(await hashOf(path.join(dir, "assets")), null); // a directory
});

test("only a v that is the served file's hash is cached for good", () => {
  assert.equal(versionedCacheControl("1a2b3c4d", "1a2b3c4d"), IMMUTABLE);
  assert.match(IMMUTABLE, /max-age=31536000/);
  assert.match(IMMUTABLE, /immutable/);
  assert.equal(versionedCacheControl("deadbeef", "1a2b3c4d"), undefined); // stale page after a deploy, or a made-up v
  assert.equal(versionedCacheControl(undefined, "1a2b3c4d"), undefined); // no v: today's headers
  assert.equal(versionedCacheControl(["1a2b3c4d"], "1a2b3c4d"), undefined); // ?v=a&v=b
  assert.equal(versionedCacheControl("", null), undefined); // no such file
});

test("client URLs get their version; unlisted files stay plain and are reported", () => {
  const v = { "assets/hd/mobs/slime.webp": "1a2b3c4d", "skills/v_exsang.webp": "0000ffff" };
  const missed: string[] = [];
  const miss = (u: string) => missed.push(u);
  assert.equal(versionedUrl("assets/hd/mobs/slime.webp", v, miss), "assets/hd/mobs/slime.webp?v=1a2b3c4d");
  assert.equal(versionedUrl("/skills/v_exsang.webp", v, miss), "/skills/v_exsang.webp?v=0000ffff");
  assert.equal(versionedUrl("./assets/hd/mobs/slime.webp", v, miss), "./assets/hd/mobs/slime.webp?v=1a2b3c4d");
  assert.equal(versionedUrl("assets/hd/mobs/gone.webp", v, miss), "assets/hd/mobs/gone.webp");
  assert.equal(versionedUrl("assets/hd/mobs/slime.webp?x=1", v, miss), "assets/hd/mobs/slime.webp?x=1");
  assert.deepEqual(missed, ["assets/hd/mobs/gone.webp"]);
  // dev (no manifest): plain URLs, nothing reported
  assert.equal(versionedUrl("assets/hd/mobs/slime.webp", null, miss), "assets/hd/mobs/slime.webp");
  assert.equal(missed.length, 1);
  // outside a Vite build there is no manifest at all
  assert.equal(assetUrl("/assets/music/blob-slayer.mp3"), "/assets/music/blob-slayer.mp3");
});
