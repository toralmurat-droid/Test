// Bot heroes for tools/perf/bench.ts (runs in its own process): join, roam at random, swing now and then.
//   CAST=v_bats,su_mote: each bot goes "/max" and casts those skills non-stop (those of its class; the others are ignored)
//   CAST=1: the Summoner's heaviest load (wisps, Void Arsenal, Void Blades, Black Hole); with SPREAD=1 they stand out of the safe zone
import { Client } from "colyseus.js";
import zlib from "node:zlib";

async function main() {
  const [n, port] = process.argv.slice(2).map(Number);
  const classes = ["vampire", "summoner"]; // only active classes can join (shared/classes.ts ACTIVE_CLASSES)
  const rooms: any[] = [];
  const cast = process.env.CAST === "1" ? ["su_wisps", "su_arsenal", "su_blades", "su_blackhole"] : (process.env.CAST ?? "").split(",").filter(Boolean);
  let bytes = 0, raw = 0, packed = 0;
  for (let i = 0; i < n; i++) {
    const room = await new Client(`ws://localhost:${port}`).joinOrCreate("town", { name: `bot${i}p${process.pid % 10000}`, password: "benchpass1", cls: classes[i % classes.length], newGame: true });
    (room.connection as any).transport.ws.addEventListener("message", (e: any) => { const b = Buffer.from(e.data); bytes += b.length; if (process.env.DEFLATE_EST) { raw += b.length; packed += b.length > 256 ? zlib.deflateRawSync(b, { level: 1 }).length : b.length; } });
    room.onMessage("*", () => {});
    room.send("mvready"); // be fed the monsters near it, like the game client
    if (cast.length) room.send("chat", "/max"); // learn every skill, so the CAST ones can be used
    rooms.push(room);
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
  setInterval(() => { process.send!({ bytes }); bytes = 0; }, 500);
  process.on("message", (m: any) => { if (m === "stop") { if (raw) console.error(`deflate level 1 would send ${(100 * packed / raw).toFixed(0)}% of the bytes`); for (const r of rooms) r.leave(); setTimeout(() => process.exit(0), 200); } });
}
main();
