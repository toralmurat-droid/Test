// Server load bench: runs the game server, connects N bot heroes (tools/perf/bots.ts, in a child process),
// then prints the time per server tick, CPU, memory and the bytes each player receives per second.
//   npm run bench -- [bots=5] [seconds=15]        SPREAD=1 scatters the bots over the whole map (worst case)
//   CAST=1 SPREAD=1: the Summoner bots cast wisps, blades, black holes and the Void Arsenal non-stop (tools/perf/bots.ts)
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fork } from "node:child_process";
import { performance } from "node:perf_hooks";

async function main() {
  const BOTS = Number(process.argv[2] ?? 5), SECS = Number(process.argv[3] ?? 15), PORT = 2599;
  process.env.SAVE_FILE = path.join(os.tmpdir(), `bench-saves-${process.pid}.json`);
  process.env.IDEAS_FILE = path.join(os.tmpdir(), `bench-ideas-${process.pid}.json`);
  const colyseus: any = await import("colyseus");
  const { Server } = colyseus.Server ? colyseus : colyseus.default;
  const { WebSocketTransport } = await import("@colyseus/ws-transport");
  const { TownRoom } = await import("../../server/TownRoom");
  const { isSolidAt } = await import("../../shared/map");
  const { MAP_W, MAP_H, TILE } = await import("../../shared/constants");

  const ticks: number[] = [], patches: number[] = [];
  let room: any;
  const proto = TownRoom.prototype as any, update = proto.update;
  proto.update = function (dt: number) {
    if (room !== this) {
      room = this;
      // Time each state patch: wrapped on the room itself (Colyseus 0.16 calls this.broadcastPatch() from its own timer)
      const bp = this.broadcastPatch;
      this.broadcastPatch = function (...a: unknown[]) { const t = performance.now(); const r = bp.apply(this, a); patches.push(performance.now() - t); return r; };
    }
    const t = performance.now(); update.call(this, dt); ticks.push(performance.now() - t);
  };

  const httpServer = http.createServer();
  const gs = new Server({ transport: new WebSocketTransport({ server: httpServer, ...(process.env.DEFLATE ? { perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 1 } } } : {}) } as any) });
  gs.define("town", TownRoom);
  await gs.listen(PORT);

  const botsFile = path.join(__dirname, "bots.cjs");
  const child = fork(botsFile, [String(BOTS), String(PORT)], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  let bytes = 0;
  await new Promise<void>((r) => child.on("message", (m: any) => { if (m.joined) r(); else if (m.bytes !== undefined) bytes += m.bytes; }));
  if (process.env.SPREAD) room.state.players.forEach((p: any) => {
    for (let i = 0; i < 500; i++) { const x = Math.random() * MAP_W * TILE, y = Math.random() * MAP_H * TILE; if (!isSolidAt(x, y)) { p.x = x; p.y = y; break; } }
  });
  await new Promise((r) => setTimeout(r, 3000));
  ticks.length = 0; patches.length = 0; bytes = 0;
  const cpu0 = process.cpuUsage(), t0 = performance.now();
  await new Promise((r) => setTimeout(r, SECS * 1000));
  const cpu = process.cpuUsage(cpu0), wall = performance.now() - t0;
  const s = [...ticks].sort((a, b) => a - b), q = (p: number) => s[Math.floor(s.length * p)]?.toFixed(1);
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  let active = 0;
  room.state.mobs.forEach((m: any) => { if (!m.dead && (m.moving || m.target)) active++; });
  console.log(JSON.stringify({
    bots: BOTS, spread: !!process.env.SPREAD, ticksPerSec: (ticks.length / (wall / 1000)).toFixed(1), tickAvgMs: avg(ticks), tickP95Ms: q(0.95),
    patchAvgMs: avg(patches), cpuPct: (((cpu.user + cpu.system) / 1000) / wall * 100).toFixed(0), rssMB: (process.memoryUsage().rss / 1e6).toFixed(0),
    kbPerPlayerPerSec: (bytes / BOTS / (wall / 1000) / 1024).toFixed(1), mobs: room.state.mobs.size, activeMobs: active,
  }));
  child.send("stop");
  setTimeout(() => process.exit(0), 500);
}
main();
