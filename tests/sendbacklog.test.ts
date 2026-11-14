// server/sendBacklog.ts: a socket that falls behind on per-message deflate sends uncompressed until it catches up,
// so its queue (and the pings waiting in it) cannot grow without end.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { guardSendBacklog, MAX_COMPRESSING, PER_MESSAGE_DEFLATE } from "../server/sendBacklog";

type Call = { data: unknown; opts: any; cb?: (err?: Error) => void };
const fakeSocket = () => {
  const calls: Call[] = [];
  return { calls, sock: { send(data: unknown, opts?: any, cb?: (err?: Error) => void) { calls.push({ data, opts, cb }); } } };
};

test("past MAX_COMPRESSING unfinished sends, messages go out uncompressed; options, order and callbacks kept", () => {
  const { calls, sock } = fakeSocket();
  guardSendBacklog({ ref: sock }, 3);
  const done: number[] = [];
  for (let i = 0; i < 5; i++) sock.send(i, { binary: true, mask: false }, () => done.push(i));
  assert.deepEqual(calls.map((c) => c.data), [0, 1, 2, 3, 4]);
  assert.deepEqual(calls.map((c) => c.opts.compress), [undefined, undefined, undefined, false, false]);
  for (const c of calls) { assert.equal(c.opts.binary, true); assert.equal(c.opts.mask, false); }
  // The uncompressed ones are not counted; their callbacks still reach the caller
  calls[3].cb!(); calls[4].cb!();
  sock.send(5, { binary: true });
  assert.equal(calls[5].opts.compress, false, "still three compressions on their way");
  calls[0].cb!(); // one of them written: the next message may be compressed again
  sock.send(6, { binary: true });
  assert.equal(calls[6].opts.compress, undefined);
  calls[1].cb!(new Error("closed")); // errors count as finished and are passed on
  assert.deepEqual(done, [3, 4, 0, 1]);
});

test("deflate settings: no threshold (ws ignores it with context takeover), zlib not throttled to 10 jobs", () => {
  assert.equal((PER_MESSAGE_DEFLATE as Record<string, unknown>).threshold, undefined);
  assert.ok(PER_MESSAGE_DEFLATE.concurrencyLimit >= 64);
  assert.equal((PER_MESSAGE_DEFLATE as Record<string, unknown>).clientNoContextTakeover, undefined, "only helped ws bots, not browsers");
});

test("send(data, cb), sends already marked uncompressed, idempotence and non-sockets", () => {
  const { calls, sock } = fakeSocket();
  guardSendBacklog({ ref: sock }, 1);
  guardSendBacklog({ ref: sock }, 1); // a second call does not wrap again
  let n = 0;
  sock.send("a", () => n++);
  sock.send("b", { compress: false }); // not counted, passed as it is
  sock.send("c", () => n++);
  assert.deepEqual(calls.map((c) => c.opts?.compress), [undefined, false, false]);
  calls[0].cb!(); calls[2].cb!();
  assert.equal(n, 2);
  assert.doesNotThrow(() => { guardSendBacklog({}); guardSendBacklog({ ref: {} }); guardSendBacklog({ ref: null }); });
  assert.ok(MAX_COMPRESSING >= 1);
});

/** A real `ws` pair with the production deflate settings; `guard` wraps the server's socket. */
async function burst(guard: boolean, n: number, size = 600) {
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: PER_MESSAGE_DEFLATE });
  await new Promise<void>((r) => httpServer.listen(0, r));
  const server = new Promise<WebSocket>((r) => wss.once("connection", r));
  const client = new WebSocket(`ws://localhost:${(httpServer.address() as { port: number }).port}`);
  const ws = await server;
  await new Promise((r) => client.once("open", r));
  if (guard) guardSendBacklog({ ref: ws });
  const got: number[] = [];
  const all = new Promise<void>((r) => client.on("message", (d: Buffer) => { got.push(d.readUInt32LE(0)); if (got.length === n) r(); }));
  const sock = (client as any)._socket, read0 = sock.bytesRead;
  const msg = (i: number) => { const b = Buffer.alloc(size); b.writeUInt32LE(i, 0); return b; }; // compresses well
  for (let i = 0; i < n; i++) ws.send(msg(i), { binary: true });
  const queued = ws.bufferedAmount;
  await all;
  const wire = sock.bytesRead - read0, left = ws.bufferedAmount;
  client.close(); wss.close(); httpServer.close();
  return { got, queued, wire, left };
}

test("on a real deflate socket a burst keeps its order and only its first MAX_COMPRESSING messages wait for zlib", async () => {
  const n = 400;
  const plain = await burst(false, n), guarded = await burst(true, n);
  const order = [...Array(n).keys()];
  assert.deepEqual(guarded.got, order);
  assert.deepEqual(plain.got, order);
  assert.ok(guarded.queued > 0 && plain.queued > 0, "the burst was queued behind a compression");
  assert.equal(guarded.left, 0);
  // Unguarded every message is compressed (each waits for its own trip to zlib); guarded only the first few are.
  // An uncompressed frame here is 604 bytes (600 + header), so the bytes saved tell how many were compressed.
  assert.ok(plain.wire < n * 100, "unguarded: every message compressed");
  const compressed = (n * 604 - guarded.wire) / (604 - plain.wire / n);
  assert.ok(Math.abs(compressed - MAX_COMPRESSING) < 1, `guarded: about ${compressed.toFixed(1)} messages compressed`);
});

test("the room guards every joining client's socket", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "vampire" });
    for (let i = 0; i < 50 && !srv.room.clients.length; i++) await wait(20);
    const sc = srv.room.clients.find((c: any) => c.sessionId === a.sessionId);
    assert.ok(sc.ref instanceof WebSocket);
    assert.notEqual(sc.ref.send, WebSocket.prototype.send, "send is wrapped on this socket");
    assert.ok(Object.hasOwn(sc.ref, "send"), "only this instance, not the prototype");
    a.leave();
  } finally { await srv.stop(); }
});

test("one connection with context takeover carries compressed and uncompressed messages mixed (per-message RSV1)", async () => {
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: PER_MESSAGE_DEFLATE });
  await new Promise<void>((r) => httpServer.listen(0, r));
  const server = new Promise<WebSocket>((r) => wss.once("connection", r));
  const client = new WebSocket(`ws://localhost:${(httpServer.address() as { port: number }).port}`);
  const ws = await server;
  await new Promise((r) => client.once("open", r));
  guardSendBacklog({ ref: ws });
  const sock = (client as any)._socket;
  try {
    // Every third message goes out as it is (as when the socket is behind); the others are compressed against a deflate
    // window that holds only the compressed ones, on both sides
    for (let i = 0; i < 60; i++) {
      const plain = i % 3 === 2, size = plain ? 100 : 700, sent = Buffer.from(`msg ${i} `.repeat(size).slice(0, size));
      const read0 = sock.bytesRead;
      const got = new Promise<Buffer>((r) => client.once("message", (d: Buffer) => r(d)));
      ws.send(sent, plain ? { binary: true, compress: false } : { binary: true });
      assert.ok((await got).equals(sent), `message ${i} intact`);
      const wire = sock.bytesRead - read0;
      if (plain) assert.equal(wire, 102, "as it is (100 bytes + header)"); else assert.ok(wire < 200, `compressed (${wire} bytes)`);
    }
  } finally { client.close(); wss.close(); httpServer.close(); }
});
