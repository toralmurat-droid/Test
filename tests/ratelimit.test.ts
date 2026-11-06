import { test } from "node:test";
import assert from "node:assert/strict";
import { Bucket, FailDelay, KeyedLimiter } from "../server/ratelimit";

test("bucket allows the burst, then refills at the set rate", () => {
  const b = new Bucket(2, 3, 0);
  assert.equal([1, 2, 3, 4].map(() => b.take(0)).filter(Boolean).length, 3);
  assert.equal(b.take(400), false); // 0.8 token
  assert.equal(b.take(500), true); // 1 token after 0.5 s
});

test("keyed limiter keeps one bucket per key", () => {
  const l = new KeyedLimiter(1, 1);
  assert.equal(l.take("a", 0), true);
  assert.equal(l.take("a", 0), false);
  assert.equal(l.take("b", 0), true);
});

test("fail delay grows after the free tries and clears on success", () => {
  const f = new FailDelay(2);
  f.fail("x", 0); f.fail("x", 0);
  assert.equal(f.wait("x", 0), 0);
  f.fail("x", 0);
  assert.equal(f.wait("x", 0), 1000);
  f.fail("x", 0);
  assert.equal(f.wait("x", 0), 2000);
  f.ok("x");
  assert.equal(f.wait("x", 0), 0);
});
