// Ages gateway (server/gateway.ts) in front of the real game room: the Colyseus client's seat reservation (HTTP) and its
// room WebSocket both pass through, and the hero joins.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { startRoom, until } from "./helpers/room";
import { configFromEnv, createGateway } from "../server/gateway";

test("a hero joins the real room through the gateway", async () => {
  const srv = await startRoom();
  const g = createGateway({ ...configFromEnv({ GATEWAY_TARGETS: `blue=http://127.0.0.1:${srv.port},green=http://127.0.0.1:1`, AGE_SPLIT: "blue=100" }), log: () => {} });
  const port = await new Promise<number>((ok) => g.listen(0, "127.0.0.1", () => ok((g.address() as net.AddressInfo).port)));
  try {
    const { Client } = await import("colyseus.js");
    const c = await new Client(`ws://127.0.0.1:${port}`).joinOrCreate<any>("town", { name: `Gate${process.pid % 1000}`, password: "testpass1", cls: "wizard", newGame: true });
    c.onMessage("*", () => {});
    assert.ok(await until(() => !!c.state?.players?.get(c.sessionId)), "hero in the synced state");
    assert.ok(srv.room.state.players.get(c.sessionId), "hero in the server's room");
    await c.leave();
  } finally {
    g.closeAllConnections(); g.close();
    await srv.stop();
  }
});
