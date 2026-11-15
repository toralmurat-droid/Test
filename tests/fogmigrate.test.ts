import test from "node:test";
import assert from "node:assert/strict";
import { loadFog } from "../client/src/fogmigrate";
import { MAP_H, MAP_W } from "../shared/constants";

test("fog saved at the old 288x592 map size survives the moors band", () => {
  const bin = new Array(288 * 592).fill(String.fromCharCode(0)).map((c, i) => (i === 5 * 288 + 7 || i === 591 * 288 + 287 ? String.fromCharCode(255) : c)).join("");
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(bin, seen, MAP_W, MAP_H), true);
  assert.equal(seen[5 * MAP_W + 7], 255);
  assert.equal(seen[591 * MAP_W + 287], 255);
  assert.equal(seen.reduce((a, b) => a + (b ? 1 : 0), 0), 2);
});

test("fog at the current size loads directly; unknown sizes are ignored", () => {
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(String.fromCharCode(9).repeat(MAP_W * MAP_H), seen, MAP_W, MAP_H), true);
  assert.equal(seen[100], 9);
  assert.equal(loadFog("abc", new Uint8Array(MAP_W * MAP_H), MAP_W, MAP_H), false);
});

import { decodeFog, encodeFog, OLD_FOG_SIZES } from "../client/src/fogmigrate";

const bytes = (bin: string) => Uint8Array.from(bin, (c) => c.charCodeAt(0));
const rawB64 = (u: Uint8Array) => { let b = ""; for (const v of u) b += String.fromCharCode(v); return btoa(b); };

test("fog saved at 288x776 (before the badlands) keeps every cell, last row included", () => {
  assert.ok(OLD_FOG_SIZES.some(([w, h]) => w === 288 && h === 776));
  const old = new Uint8Array(288 * 776);
  old[0] = 1; old[775 * 288 + 287] = 255; old[775 * 288 + 3] = 77; old[400 * 288 + 100] = 9;
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(String.fromCharCode(...old.subarray(0, 4096)) + [...old.subarray(4096)].map((c) => String.fromCharCode(c)).join(""), seen, MAP_W, MAP_H), true);
  assert.equal(seen[0], 1); assert.equal(seen[775 * MAP_W + 287], 255); assert.equal(seen[775 * MAP_W + 3], 77); assert.equal(seen[400 * MAP_W + 100], 9);
  assert.equal(seen.reduce((a, b) => a + (b ? 1 : 0), 0), 4);
});

test("fog saved at 288x960 (before the sinkholes) keeps every cell, last row included", () => {
  assert.ok(OLD_FOG_SIZES.some(([w, h]) => w === 288 && h === 960));
  const old = new Uint8Array(288 * 960);
  old[0] = 1; old[959 * 288 + 287] = 255; old[959 * 288 + 3] = 77; old[800 * 288 + 100] = 9;
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog([...old].map((c) => String.fromCharCode(c)).join(""), seen, MAP_W, MAP_H), true);
  assert.equal(seen[0], 1); assert.equal(seen[959 * MAP_W + 287], 255); assert.equal(seen[959 * MAP_W + 3], 77); assert.equal(seen[800 * MAP_W + 100], 9);
  assert.equal(seen.reduce((a, b) => a + (b ? 1 : 0), 0), 4);
});

test("fog RLE round-trips random and realistic data", () => {
  let st = 12345; const rnd = () => (st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const random = Uint8Array.from({ length: MAP_W * MAP_H }, () => Math.floor(rnd() * 256));
  const real = new Uint8Array(MAP_W * MAP_H);
  for (let k = 0; k < 40; k++) { // 40 discs of explored ground with soft edges
    const cx = rnd() * MAP_W, cy = rnd() * MAP_H;
    for (let y = Math.max(0, cy - 40 | 0); y < Math.min(MAP_H, cy + 40); y++) for (let x = Math.max(0, cx - 40 | 0); x < Math.min(MAP_W, cx + 40); x++) {
      const d = Math.hypot(x - cx, y - cy); const v = d <= 9 ? 255 : d < 12 ? Math.round(255 * (1 - (d - 9) / 3)) : 0;
      if (v > real[y * MAP_W + x]) real[y * MAP_W + x] = v;
    }
  }
  for (const f of [random, real, new Uint8Array(MAP_W * MAP_H), new Uint8Array(MAP_W * MAP_H).fill(255)]) {
    const z = encodeFog(f);
    assert.ok(z.startsWith("z1:"));
    const back = new Uint8Array(MAP_W * MAP_H);
    assert.equal(loadFog(decodeFog(z), back, MAP_W, MAP_H), true);
    assert.deepEqual(back, f);
  }
  const size = encodeFog(real).length;
  console.log(`# compressed fog of a well explored map: ${size} bytes (raw base64 would be ${Math.ceil(MAP_W * MAP_H / 3) * 4})`);
  assert.ok(size < 60_000); // (40 scattered discs: a worst case, each row crossing costs its soft edge)
});

test("saved raw strings (current size and an old size) still load through decodeFog", () => {
  const cur = new Uint8Array(MAP_W * MAP_H); cur[MAP_W * MAP_H - 1] = 200; cur[5] = 3;
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(decodeFog(rawB64(cur)), seen, MAP_W, MAP_H), true);
  assert.deepEqual(seen, cur);
  const old = new Uint8Array(288 * 592); old[591 * 288 + 287] = 255;
  const s2 = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(decodeFog(rawB64(old)), s2, MAP_W, MAP_H), true);
  assert.equal(s2[591 * MAP_W + 287], 255);
  void bytes;
});
