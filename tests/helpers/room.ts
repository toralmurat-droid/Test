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
