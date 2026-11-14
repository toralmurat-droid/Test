// Hands every socket its own copy of the encoded state instead of a view of Colyseus' reused buffers.
//
// Why: @colyseus/schema's Encoder.encode returns `buffer.subarray(0, offset)` of one buffer per room (the encoder's
// `sharedBuffer` for patches, the serializer's `fullEncodeBuffer` for the full state sent on join), and
// SchemaSerializer passes that view to `client.raw`. With per-message deflate `ws` neither copies it nor compresses
// it at once (one process-wide limit of 10 jobs on the thread pool), so a socket still waiting when the next patch
// (or the next join) is encoded compresses overwritten bytes. The client cannot tell: wrong values stay until they
// change again. One copy per encode, shared by all clients, is enough: `ws` only reads it, and the server does not
// mask frames.
//
// This reaches into internals of @colyseus/core 0.16.26 and @colyseus/schema 3.0.76 (pinned exactly in package.json)
// and throws at room creation if their shape changed, so a dependency bump cannot silently drop the protection.
import { Encoder } from "@colyseus/schema";
import type { Room } from "colyseus";

// Upstream, an oversized patch allocates a bigger buffer but never keeps it (`buffer === this.sharedBuffer` is
// compared after reassigning `buffer`), so every oversized patch reallocates and warns again. A larger start size
// avoids that in heavy rooms. Read when a room's serializer and encoder are created (in setState), after this import.
Encoder.BUFFER_SIZE = Math.max(Encoder.BUFFER_SIZE, 64 * 1024);

const WRAPPED = Symbol("patchCopy");

/** Call right after `setState` (a later setState installs a new serializer and needs another call). Idempotent. */
export function copyPatches(room: Room): void {
  const ser = (room as any)._serializer, enc: any = ser?.encoder;
  const bad = (what: string) => new Error(`patchCopy: Colyseus internals changed (${what}); state patches would be sent as views of a reused buffer. Re-check server/patchCopy.ts against the new @colyseus/core and @colyseus/schema.`);
  if (!ser || ser.id !== "schema") throw bad("room._serializer is not the schema serializer; call after setState");
  if (!(ser.encoder instanceof Encoder) || typeof enc.encode !== "function") throw bad("serializer.encoder.encode missing");
  if (!Buffer.isBuffer(enc.sharedBuffer) || !Buffer.isBuffer(ser.fullEncodeBuffer)) throw bad("sharedBuffer / fullEncodeBuffer missing");
  if (typeof ser.applyPatches !== "function" || typeof ser.getFullState !== "function") throw bad("applyPatches / getFullState missing");
  if (enc[WRAPPED]) return;
  enc[WRAPPED] = true;
  // Wrap point: Encoder.encode on this room's encoder only. It is the single producer of both views that reach
  // `client.raw` unfiltered: applyPatches calls `encode(it)`, getFullState calls `encodeAll`, which calls
  // `this.encode` (so the cached full state is a copy, and re-encoding it on the next join leaves earlier ones alone).
  // Copies are made only for the outermost call (the overflow path re-enters encode with a fresh buffer) and only
  // without a view: encodeView / encodeAllView ignore encode's result and already return a fresh Buffer.concat.
  // Callers use the result only for its bytes and length; `it.offset` and the encoder's buffers are untouched.
  const encode: (...a: unknown[]) => Buffer = enc.encode;
  let depth = 0;
  enc.encode = function (this: Encoder, ...a: unknown[]): Buffer {
    depth++;
    try {
      const out = encode.apply(this, a);
      return depth === 1 && a[1] === undefined ? Buffer.from(out) : out;
    } finally { depth--; }
  };
}
