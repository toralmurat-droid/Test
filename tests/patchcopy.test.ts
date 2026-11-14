// server/patchCopy.ts: what a socket is handed for a state patch or a full state must not change afterwards.
// With per-message deflate `ws` compresses it later, so a view of Colyseus' reused buffer would go out corrupted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyPatches } from "../server/patchCopy";

const overlaps = (a: Uint8Array, b: Uint8Array) =>
  a.buffer === b.buffer && a.byteOffset < b.byteOffset + b.byteLength && b.byteOffset < a.byteOffset + a.byteLength;
type Sent = { d: Buffer; snap: Buffer };

test("copyPatches refuses a room without the expected Colyseus internals", () => {
  assert.throws(() => copyPatches({} as any), /patchCopy: Colyseus internals changed/);
  assert.throws(() => copyPatches({ _serializer: { id: "schema", encoder: {} } } as any), /patchCopy/);
});

test("patches and full states sent to clients are copies that later encodes leave alone", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const { Protocol } = await import("colyseus");
  const { TownRoom } = await import("../server/TownRoom");
  // Record each full state as it goes to a joining client's socket
  const proto = TownRoom.prototype as any, sendFull = proto.sendFullState;
  const full = new Map<string, Sent>();
  proto.sendFullState = function (client: any) {
    const raw = client.raw;
    client.raw = (d: Buffer, ...r: unknown[]) => { full.set(client.sessionId, { d, snap: Buffer.from(d) }); return raw.call(client, d, ...r); };
    try { return sendFull.call(this, client); } finally { client.raw = raw; }
  };
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "vampire" });
    const room = srv.room, ser = room._serializer, enc = ser.encoder;
    const until = async (ok: () => unknown) => { for (let i = 0; i < 100 && !ok(); i++) await wait(20); };
    await until(() => full.get(a.sessionId)); // sent once the client acknowledges the join
    const fullA = full.get(a.sessionId)!;
    assert.ok(fullA && fullA.d[0] === Protocol.ROOM_STATE, "full state captured");

    // Patches: record what A's socket gets, and make sure each patch has something new in it
    const patches: Sent[] = [];
    const sc = room.clients.find((c: any) => c.sessionId === a.sessionId), raw = sc.raw;
    sc.raw = (d: Buffer, ...r: unknown[]) => { if (d[0] === Protocol.ROOM_STATE_PATCH) patches.push({ d, snap: Buffer.from(d) }); return raw.call(sc, d, ...r); };
    const me = room.state.players.get(a.sessionId);
    for (let i = 0; i < 40 && patches.length < 4; i++) { me.hp = 1 + (i % 7); await wait(60); }
    assert.ok(patches.length >= 4, `saw ${patches.length} patches`);
    for (const [i, p] of patches.slice(0, -1).entries()) {
      assert.ok(!overlaps(p.d, enc.sharedBuffer), `patch ${i} shares memory with the encoder's shared buffer`);
      assert.deepEqual(p.d, p.snap, `patch ${i} changed after later patches were encoded`);
    }

    // Full state: the state changed since A joined, so B's join re-encodes it
    me.hp = 42; await wait(120);
    const b = await srv.join({ cls: "summoner" });
    await until(() => full.get(b.sessionId));
    assert.ok(full.get(b.sessionId), "second full state captured");
    assert.ok(!overlaps(fullA.d, ser.fullEncodeBuffer), "A's full state shares memory with the serializer's full-state buffer");
    assert.deepEqual(fullA.d, fullA.snap, "A's full state changed when B joined");

    // A second call does not wrap again
    const once = enc.encode;
    copyPatches(room);
    assert.equal(enc.encode, once);
    await a.leave(); await b.leave();
  } finally {
    proto.sendFullState = sendFull;
    await srv.stop();
  }
});
