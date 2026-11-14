// Bot heroes for tools/perf/bench.ts (runs in its own process): join, roam at random, swing now and then.
//   CAST=v_bats,su_mote: each bot goes "/max" and casts those skills non-stop (those of its class; the others are ignored)
//   CAST=1: the Summoner's heaviest load (wisps, Void Arsenal, Void Blades, Black Hole); with SPREAD=1 they stand out of the safe zone
//   SONGWEAVER=1: every third bot is a Songweaver (otherwise only Vampires and Summoners); with
//     CAST=1 they play songs, notes and chords non-stop (Dirge, Ballad, Shrill Note, Cracked String, Mending Note...)
//   PARTY=1: the bots form groups of four (pinvite / paccept), so party auras and party buffs reach each other
import zlib from "node:zlib";
import WebSocket from "ws";

const SONG_CASTS = ["sg_dirge", "sg_ballad", "sg_march", "sg_pedal", "sg_mend", "sg_shrill", "sg_crack", "sg_jig", "sg_call", "sg_chorale", "sg_anthem", "sg_twelve", "sg_modulate"];

async function main() {
  // colyseus.js prefers Node's built-in (undici) WebSocket, which hides the TCP socket. Hide it so the `ws` package is used:
  // it offers permessage-deflate by default and exposes _socket.bytesRead (true bytes on the wire). It picks the class when it loads.
  delete (globalThis as any).WebSocket;
  // colyseus.js packs every send (the join acknowledgement too) into one reused buffer per room, and `ws` deflates it
  // later without copying, so with DEFLATE=1 a later send overwrote an earlier one before it went out. Copy first
  // (browsers copy on send; bench only). Same `ws` module as colyseus.js uses (one copy in node_modules).
  const send = WebSocket.prototype.send;
  (WebSocket.prototype as any).send = function (this: WebSocket, data: unknown, ...a: unknown[]) { return (send as Function).call(this, ArrayBuffer.isView(data) ? Buffer.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) : data, ...a); };
  const { Client } = await import("colyseus.js");
  const [n, port] = process.argv.slice(2).map(Number);
  // only active classes can join (shared/classes.ts ACTIVE_CLASSES); the Songweaver is one, SONGWEAVER=1 adds her to the mix
  const classes = process.env.SONGWEAVER ? ["vampire", "summoner", "songweaver"] : ["vampire", "summoner"];
  const rooms: any[] = [];
  const base = process.env.CAST === "1" ? ["su_wisps", "su_arsenal", "su_blades", "su_blackhole"] : (process.env.CAST ?? "").split(",").filter(Boolean);
  const cast = process.env.CAST === "1" && process.env.SONGWEAVER ? [...base, ...SONG_CASTS] : base;
  let bytes = 0, wire = 0, raw = 0, packed = 0;
  const socks: [any, number][] = []; // each bot's TCP socket and the bytesRead already counted (true bytes on the wire: frame headers, after deflate)
  for (let i = 0; i < n; i++) {
    const room = await new Client(`ws://localhost:${port}`).joinOrCreate("town", { name: `bot${i}p${process.pid % 10000}`, password: "benchpass1", cls: classes[i % classes.length], newGame: true });
    (room.connection as any).transport.ws.addEventListener("message", (e: any) => { const b = Buffer.from(e.data); bytes += b.length; if (process.env.DEFLATE_EST) { raw += b.length; packed += b.length > 256 ? zlib.deflateRawSync(b, { level: 1 }).length : b.length; } });
    const sock = (room.connection as any).transport.ws._socket; if (sock) socks.push([sock, sock.bytesRead]);
    room.onMessage("*", () => {});
    room.send("mvready"); // be fed the monsters near it, like the game client
    if (cast.length) room.send("chat", "/max"); // learn every skill, so the CAST ones can be used
    rooms.push(room);
  }
  // PARTY=1: the first bot of every four invites the next three, one at a time (the "ask" rate limit), and they accept
  if (process.env.PARTY) for (let g = 0; g < rooms.length; g += 4) {
    const lead = rooms[g];
    rooms.slice(g + 1, g + 4).forEach((m, k) => setTimeout(() => {
      lead.send("pinvite", { id: m.sessionId });
      setTimeout(() => m.send("paccept", { from: lead.sessionId }), 200);
    }, 1200 * k));
  }
  process.send!({ joined: true });
  let seq = 0;
  setInterval(() => {
    for (const r of rooms) {
      if (Math.random() < 0.1) r.send("input", { up: Math.random() < 0.5, down: Math.random() < 0.3, left: Math.random() < 0.5, right: Math.random() < 0.5, seq: ++seq });
      if (Math.random() < 0.15) r.send("attack");
      for (const sk of cast) r.send("cast", sk); // the server drops it while on cooldown
    }
  }, 100);
  setInterval(() => { wire = 0; for (const t of socks) { wire += t[0].bytesRead - t[1]; t[1] = t[0].bytesRead; } process.send!({ bytes, wire }); bytes = 0; }, 500);
  process.on("message", (m: any) => { if (m === "stop") { if (raw) console.error(`deflate level 1 would send ${(100 * packed / raw).toFixed(0)}% of the bytes`); for (const r of rooms) r.leave(); setTimeout(() => process.exit(0), 200); } });
}
main();
