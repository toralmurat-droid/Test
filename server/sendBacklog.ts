// Keeps a client's send queue from growing without end when per-message deflate falls behind.
//
// Why: `ws` compresses one message per socket at a time, in the background (zlib on the thread pool), and every later
// send on that socket (pings too) waits in its queue until that compression is done. Each compression costs a few
// turns of the event loop whatever its size, so when the tick loop keeps the event loop busy a socket gets through only
// a handful per second, fewer than the room sends (state patch, monster feed, sfx). The queue then only grows
// (measured: 2,000 messages, seconds behind), the transport's pings wait behind it and it terminates every client
// (close code 1006). A limit in bytes (`bufferedAmount`) does not help: the cost is per message and messages are small.
// So a socket may have at most MAX_COMPRESSING compressed messages on their way; later ones go out uncompressed: they
// still wait for the compressions ahead of them, but then leave in one go, so the queue empties and order is kept.
// A server that keeps up compresses everything as before.
//
// Uses only the public `ws` API: `send(data, { compress }, cb)`, whose callback fires once the frame is written.

/** Per-message deflate settings, shared by the server (server/index.ts) and the bench (tools/perf/bench.ts). Level 1 is
 * the fastest. `ws` applies `threshold` only to a side without context takeover, so the server compresses every message
 * it sends. `clientNoContextTakeover` makes `ws` clients (the bench bots) send messages under their own 1 KB threshold
 * as they are; without it every input is inflated on the server, one at a time per socket, a pong waits behind those
 * and the bench drops every bot even when sends are bounded. Client messages are tiny, so the reset costs nothing. */
export const PER_MESSAGE_DEFLATE = { threshold: 256, zlibDeflateOptions: { level: 1 }, clientNoContextTakeover: true };

/** Compressed messages one socket may have queued or in flight before the next is sent uncompressed. Transport tuning,
 * not a gameplay value: a few ticks of messages to one hero, few enough that a ping never waits long (the bench kept a
 * little more compression and steadier ticks with 8 than with 4). */
export const MAX_COMPRESSING = 8;

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
    pending++;
    const done = cb;
    return send.call(this, data, opts, (err?: Error) => { pending--; done?.(err); });
  };
}
