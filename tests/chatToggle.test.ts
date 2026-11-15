import test from "node:test";
import assert from "node:assert/strict";
import { chatShown, unreadLabel } from "../client/src/chatToggle";

test("unreadLabel: empty at 0, count to 9, then 9+", () => {
  assert.equal(unreadLabel(0), "");
  assert.equal(unreadLabel(-1), "");
  assert.equal(unreadLabel(3), "3");
  assert.equal(unreadLabel(9), "9");
  assert.equal(unreadLabel(10), "9+");
});

test("chatShown: hidden log shows only while typing", () => {
  assert.equal(chatShown(false, false), true);
  assert.equal(chatShown(false, true), true);
  assert.equal(chatShown(true, false), false);
  assert.equal(chatShown(true, true), true);
});
