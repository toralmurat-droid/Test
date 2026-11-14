// Keeps a client's send queue short when per-message deflate falls behind.
//
// Why: `ws` compresses one message per socket at a time, in the background (zlib on the thread pool), and every later
// send on that socket (pings too) waits in its queue until that compression is done. Each compression costs a few
// turns of the event loop whatever its size, so when the tick loop keeps the event loop busy a socket gets through only
// a handful per second, fewer than the room sends (state patch, monster feed, sfx). The queue then only grows
// (measured: 2,000 messages, seconds behind), the transport's pings wait behind it and it terminates every client
// (close code 1006). A limit in bytes (`bufferedAmount`) does not help: the cost is per message and messages are small.
// So a socket may have at most MAX_COMPRESSING compressed messages on their way; later ones go out uncompressed: they
// still wait for the compressions ahead of them, but then leave in one go, so the queue empties and order is kept.
// A server that keeps up compresses nearly everything as before.
// Mixing is valid: RFC 7692 marks each message as compressed or not (RSV1 on its first frame), the deflate window
// (context takeover) only ever holds compressed messages on both sides, and `ws` takes `compress` per `send`.
//
// Uses only the public `ws` API: `send(data, { compress }, cb)`, whose callback fires once the frame is written.
//
// NOT solved here: what clients send. Browsers compress every message they send (no size threshold), the server
// inflates them one at a time per socket, and a pong is read only after the messages before it. The bench bots
// compress everything too (tools/perf/bots.ts): 20 non-stop casting bots stay connected; 40 (the server is then over
// its tick budget) are all dropped at their ~45 messages a second, and stay connected at ~9 a second (CAST_EVERY=5)
// with pongs 5-8 s late, right at the cut-off. No real browser has been measured.
//
// Also not covered: a client on a slow link. `pending` falls when a frame is handed to the kernel, so a socket whose
// kernel buffer is full stays at the limit and gets uncompressed messages (about twice the bytes) while it is behind.

/** Per-message deflate settings, shared by the server (server/index.ts) and the bench (tools/perf/bench.ts). Level 1 is
 * the fastest. No `threshold`: `ws` applies it only to a side without context takeover, which browsers do not ask the
 * server for, so it never applied to them.
 * `concurrencyLimit`: zlib jobs (both ways, all sockets) that may be under way at once. One limiter per process, fixed
 * by the first socket made in it. With the default 10 every socket waited its turn behind all the others: 40 casting
 * bots saw 1-3 s per message and pongs 2-5 s late, against 0.1-0.6 s and 0.2-0.3 s with 256. Each job is microseconds
 * of zlib work; the wait was the queue. The limit does not bound memory (each socket keeps its two zlib streams either
 * way); the jobs now wait in libuv's thread-pool queue instead, which logins (scrypt) and file reads share. */
export const PER_MESSAGE_DEFLATE = { zlibDeflateOptions: { level: 1 }, concurrencyLimit: 256 };

/** Compressed messages one socket may have queued or in flight before the next is sent uncompressed. Transport tuning,
 * not a gameplay value: 2 kept send delays and pong ages lowest under load (bench, against 4 and 8), for a little less
 * compression when the server keeps up (wire/payload about 0.54 instead of 0.51). */
export const MAX_COMPRESSING = 2;

type Cb = (err?: Error) => void;
type SendFn = (data: unknown, opts?: Record<string, unknown> | Cb, cb?: Cb) => void;
/** The part of a `ws` WebSocket this needs. */
export interface BacklogSocket { send: SendFn }

const GUARDED = Symbol("sendBacklog");

/** Wraps this socket's `send` (only this instance) so it stops compressing while it is behind. Idempotent; a client
 * whose `ref` is not a socket (tests with fake clients) is left alone. */
export function guardSendBacklog(client: { ref?: unknown }, max = MAX_COMPRESSING): void {
  const ws = client.ref as (BacklogSocket & { [GUARDED]?: true }) | undefined;
  if (!ws || typeof ws.send !== "function" || ws[GUARDED]) return;
  ws[GUARDED] = true;
  const send = ws.send;
  let pending = 0;
  ws.send = function (this: BacklogSocket, data, opts, cb) {
    if (typeof opts === "function") { cb = opts; opts = undefined; }
    if (opts?.compress === false) return send.call(this, data, opts, cb);
    if (pending >= max) return send.call(this, data, { ...opts, compress: false }, cb);
    const done = cb;
    const r = send.call(this, data, opts, (err?: Error) => { pending--; done?.(err); });
    pending++; // after the call: a send that throws (socket still connecting) must not take a slot for good
    return r;
  };
}
