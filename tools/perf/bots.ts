// Bot heroes for tools/perf/bench.ts (runs in its own process): join, roam at random, swing now and then.
import { Client } from "colyseus.js";
import zlib from "node:zlib";

async function main() {
  const [n, port] = process.argv.slice(2).map(Number);
  const classes = ["knight", "ninja", "wizard", "archer", "barbarian"];
  const rooms: any[] = [];
  let bytes = 0, raw = 0, packed = 0;
  for (let i = 0; i < n; i++) {
    const room = await new Client(`ws://localhost:${port}`).joinOrCreate("town", { name: `bot${i}p${process.pid % 10000}`, password: "benchpass1", cls: classes[i % 5], newGame: true });
    (room.connection as any).transport.ws.addEventListener("message", (e: any) => { const b = Buffer.from(e.data); bytes += b.length; if (process.env.DEFLATE_EST) { raw += b.length; packed += b.length > 256 ? zlib.deflateRawSync(b, { level: 1 }).length : b.length; } });
    room.onMessage("*", () => {});
    rooms.push(room);
  }
  process.send!({ joined: true });
  let seq = 0;
  setInterval(() => {
    for (const r of rooms) {
      if (Math.random() < 0.1) r.send("input", { up: Math.random() < 0.5, down: Math.random() < 0.3, left: Math.random() < 0.5, right: Math.random() < 0.5, seq: ++seq });
      if (Math.random() < 0.15) r.send("attack");
    }
  }, 100);
  setInterval(() => { process.send!({ bytes }); bytes = 0; }, 500);
  process.on("message", (m: any) => { if (m === "stop") { if (raw) console.error(`deflate level 1 would send ${(100 * packed / raw).toFixed(0)}% of the bytes`); for (const r of rooms) r.leave(); setTimeout(() => process.exit(0), 200); } });
}
main();
