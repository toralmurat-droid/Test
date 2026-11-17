// Runs the real game room in this process on a free port, so tests can join with real clients and look at the
// server-side state directly. Saves go to a temp folder.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-test-"));
process.env.SAVE_FILE ??= path.join(dir, "saves.json");
process.env.ALLOW_ARCHIVED_CLASSES ??= "1"; // tests still cover the archived classes
process.env.IDEAS_FILE ??= path.join(dir, "ideas.json");
// `node --test` frames its results on the child's stdout. The room logs ("X joined", trades, ideas) with console.log,
// and those raw lines can land inside a frame; the runner then dies with "Unable to deserialize cloned data"
// (about every second full run). Send console.log to stderr, which is not framed. Written straight to the stream, not
// through console.error, so a test that watches console.error (tests/view.test.ts) never sees room log lines.
console.log = console.info = (...a: unknown[]) => { process.stderr.write(a.map(String).join(" ") + "\n"); };

export async function startRoom() {
  const { Server } = await import("colyseus");
  const { WebSocketTransport } = await import("@colyseus/ws-transport");
  const { TownRoom } = await import("../../server/TownRoom");
  const { Client } = await import("colyseus.js");
  let room: any;
  const proto = TownRoom.prototype as any, onCreate = proto.onCreate;
  proto.onCreate = function (...a: unknown[]) { room = this; return onCreate.apply(this, a); };
  const httpServer = http.createServer();
  const gs = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gs.define("town", TownRoom);
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as { port: number }).port;
  let n = 0;
  return {
    port,
    get room() { return room; },
    async join(opts: Record<string, unknown> = {}) {
      const c = await new Client(`ws://localhost:${port}`).joinOrCreate<any>("town", { name: `Tester${++n}x${process.pid % 1000}`, password: "testpass1", cls: "knight", newGame: true, ...opts });
      c.onMessage("*", () => {});
      return c;
    },
    async stop() {
      proto.onCreate = onCreate;
      await gs.gracefullyShutdown(false);
    },
  };
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Polls `ok` every 50 ms until it holds or `ms` pass, then returns it. Room tests wait on the game loop, which runs
 *  slower while the whole suite shares the CPU: wait for the event, not for a fixed time. */
export async function until(ok: () => boolean, ms = 6000) {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await wait(50);
  return ok();
}
