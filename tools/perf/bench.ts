// Server load bench: runs the game server, connects N bot heroes (tools/perf/bots.ts, in a child process),
// then prints the time per server tick, CPU, memory and the bytes each player receives per second.
//   npm run bench -- [bots=5] [seconds=15]        SPREAD=1 scatters the bots over the whole map (worst case)
//   kbPerPlayerPerSec = payload after inflate (what the game decodes); wireKbPerPlayerPerSec = bytes read from the socket (frame headers, after deflate)
//   DEFLATE=1: per-message deflate with the production settings (server/index.ts: threshold 256, level 1); off by default so numbers stay comparable.
//     The server copies each state patch before deflate (server/patchCopy.ts) and the bots copy each send (tools/perf/bots.ts);
//     without those copies `ws` compressed reused buffers late, giving "refId not found" decode errors and garbled bot inputs.
//   PHASES=1: also prints a second JSON line with the time per phase of the tick (wraps TownRoom methods). The wrappers add overhead, so the
//     totals in this mode are INFLATED (more for the hot, tiny ones); use it to see shares, not absolute ms. PHASES=fine adds the hot per-mob helpers.
//   BENCH_PORT=2656: listen on another port (default 2599), e.g. when two benches run on one machine
//   WAR=1: a fresh clan war is running (server/war.ts), so clan troops march and fight near the bots (server/warTroops.ts)
//   SIEGE=1 (with WAR=1): a siege is called on an Act 1 land and the first bot stands at its gate, so a siege battle runs (server/warSieges.ts)
//   SIEGE=host: the same, led by the Ossuary Host, so its bone ram and crew roll too (server/warWorks.ts)
//   TUNNEL=1 (with WAR=1): the Hide-Kin are ordered through a tunnel and the last bot stands at its mouth (server/warTunnels.ts)
//   RITUAL=1 (with WAR=1): the rituals run on a clock shifted to noon and the second bot stands at the circle (server/warRituals.ts)
//   CAST=1 SPREAD=1: the Summoner bots cast wisps, blades, black holes and the Void Arsenal non-stop (tools/perf/bots.ts)
//   TIDE=1: a Gloam Tide march is out the whole time, its last wave all at once (TIDE.maxAlive marchers, server/tide.ts)
//   SONGWEAVER=1 (PARTY=1): Songweaver bots too; PARTY=1 groups them
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fork } from "node:child_process";
import { performance } from "node:perf_hooks";

async function main() {
  const BOTS = Number(process.argv[2] ?? 5), SECS = Number(process.argv[3] ?? 15), PORT = Number(process.env.BENCH_PORT ?? 2599);
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
  // PHASES: accumulating timers. A stack gives each phase's own time (self) next to the inclusive time (nested phases subtracted from self)
  const PH = process.env.PHASES, ph = new Map<string, { n: number; incl: number; self: number; out: boolean }>(), stack: number[] = [], skipped: string[] = [];
  let inUpdate = false;
  const timed = (obj: any, name: string, label = name, out = false) => {
    const fn = obj?.[name];
    if (typeof fn !== "function") { skipped.push(label); return; }
    const rec = { n: 0, incl: 0, self: 0, out }; ph.set(label, rec);
    obj[name] = function (this: any, ...a: unknown[]) {
      if (!inUpdate && !out) return fn.apply(this, a);
      const t = performance.now(); stack.push(0);
      try { return fn.apply(this, a); } finally { const el = performance.now() - t, kids = stack.pop()!; rec.n++; rec.incl += el; rec.self += el - kids; if (stack.length) stack[stack.length - 1] += el; }
    };
  };
  const proto = TownRoom.prototype as any, update = proto.update;
  if (PH) {
    for (const n of ["tradeTick", "autoGolems", "golemNews", "checkQuestPlace", "wakePortals", "useLinks", "pickUp", "updateWrath", "markWarm", "buildFeudGrid", "assignFlanks",
      "updateUndeadNight", "updateRaids", "bossVoices", "checkRituals", "updateMob", "pickTarget", "claimSpot", "updateSummon", "updateZones", "updateGuards", "updateWatch",
      "updateProjectile", "updateHazards", ...(PH === "fine" ? ["cold", "dozing", "heroNear", "equipped", "syncMana"] : [])]) timed(proto, n);
  }
  proto.update = function (dt: number) {
    if (room !== this) {
      room = this;
      // Time each state patch: wrapped on the room itself (Colyseus 0.16 calls this.broadcastPatch() from its own timer)
      const bp = this.broadcastPatch;
      if (PH) { timed(this.mobView, "send", "mobView.send (outside update)", true); timed(this.champs, "update", "champs.update"); timed(this.warTroops, "step", "warTroops.step"); timed(this.warTroops, "tick", "warTroops.tick (outside update)", true); }
      this.broadcastPatch = function (...a: unknown[]) { const t = performance.now(); const r = bp.apply(this, a); patches.push(performance.now() - t); return r; };
    }
    const t = performance.now(); inUpdate = true; try { update.call(this, dt); } finally { inUpdate = false; } ticks.push(performance.now() - t);
  };

  const httpServer = http.createServer();
  const gs = new Server({ transport: new WebSocketTransport({ server: httpServer, ...(process.env.DEFLATE ? { perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 1 } } } : {}) } as any) });
  gs.define("town", TownRoom);
  if (process.env.WAR) (await import("../../server/war"))._resetWar();
  await gs.listen(PORT);
  // Worst send backlog of any connection (bytes accepted by send() and not yet written). With DEFLATE=1 each socket
  // compresses one message at a time in the background; when the tick loop leaves it no time, the backlog only grows,
  // pings wait behind it and the transport drops the clients (docs/optimisation-plan.md N7).
  let backlog = 0;
  setInterval(() => { for (const c of (gs as any).transport.wss.clients) backlog = Math.max(backlog, c.bufferedAmount); }, 500).unref();

  const botsFile = path.join(__dirname, "bots.cjs");
  const child = fork(botsFile, [String(BOTS), String(PORT)], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  let bytes = 0, wire = 0, dropped = 0;
  await new Promise<void>((r) => child.on("message", (m: any) => { if (m.joined) r(); else if (m.bytes !== undefined) { bytes += m.bytes; wire += m.wire ?? 0; dropped = m.dropped ?? 0; } }));
  if (process.env.SPREAD) room.state.players.forEach((p: any) => {
    for (let i = 0; i < 500; i++) { const x = Math.random() * MAP_W * TILE, y = Math.random() * MAP_H * TILE; if (!isSolidAt(x, y)) { p.x = x; p.y = y; break; } }
  });
  if (process.env.TIDE) room.tide.start(Date.now(), true);
  let siegeLand = -1;
  if (process.env.SIEGE && process.env.WAR) {
    const { warState } = await import("../../server/war"), { siegeFronts } = await import("../../shared/war/siege");
    const { TERRITORIES } = await import("../../shared/war/territories"), { targetsOf } = await import("../../shared/war/rules"), { CLAN_KEYS } = await import("../../shared/war/clans");
    const st = warState()!;
    for (const t of TERRITORIES) {
      const atk = CLAN_KEYS.find((k) => k !== st.owner[t.id] && targetsOf(st, k).includes(t.id) && (process.env.SIEGE !== "host" || k === "host"));
      if (t.act !== 1 || t.capitalOf || !atk || siegeFronts(t.id).length < 3) continue;
      st.siege[t.id] = { by: atk, at: st.tick + 6 }; st.control[t.id] = 30; siegeLand = t.id;
      const g = siegeFronts(t.id).find((f) => f.gate)!, p0 = [...room.state.players.values()][0];
      if (p0) { p0.x = g.x; p0.y = g.y; }
      break;
    }
  }
  let tunnelLand = -1;
  if (process.env.TUNNEL && process.env.WAR) {
    const { warState, _setWarOrders } = await import("../../server/war"), { targetsOf } = await import("../../shared/war/rules");
    const { tunnelMouth, tunnelStrikes } = await import("../../shared/war/tunnels"), { TERRITORIES } = await import("../../shared/war/territories");
    const st = warState()!;
    for (const t of targetsOf(st, "hidekin")) {
      const orders = { hidekin: { defend: 0.5, attack: [{ t, share: 1 }] } }, g = tunnelStrikes(st, orders)[0], at = g && tunnelMouth(g.t, g.from);
      if (!at || TERRITORIES[t].act !== 1 || t === siegeLand) continue;
      _setWarOrders(orders); tunnelLand = t;
      const pl = [...room.state.players.values()].at(-1);
      if (pl) { pl.x = at.x + 64; pl.y = at.y; }
      break;
    }
  }
  let ritualLand = -1;
  if (process.env.RITUAL && process.env.WAR) {
    const { warState } = await import("../../server/war"), { ritualSite, ritualSpot, ritualTime } = await import("../../shared/war/rituals");
    const site = ritualSite(warState()!), at = site && ritualSpot(site.t);
    if (site && at) {
      let shift = 0; while (!ritualTime(Date.now() + shift)) shift += 10_000; // noon for the whole run
      const tick = room.rituals.tick.bind(room.rituals);
      room.rituals.tick = (now: number = Date.now()) => tick(now + shift);
      ritualLand = site.t;
      const pl = [...room.state.players.values()][1];
      if (pl) { pl.x = at.x + 48; pl.y = at.y; }
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
  ticks.length = 0; patches.length = 0; bytes = 0; wire = 0; backlog = 0; for (const r of ph.values()) r.n = r.incl = r.self = 0;
  const cpu0 = process.cpuUsage(), t0 = performance.now();
  await new Promise((r) => setTimeout(r, SECS * 1000));
  const cpu = process.cpuUsage(cpu0), wall = performance.now() - t0;
  const s = [...ticks].sort((a, b) => a - b), q = (p: number) => s[Math.floor(s.length * p)]?.toFixed(1);
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  let active = 0;
  let marchers = 0, troopers = 0;
  room.state.mobs.forEach((m: any) => { if (!m.dead && (m.moving || m.target)) active++; if (!m.dead && m.tide) marchers++; if (!m.dead && m.kind === "trooper") troopers++; });
  console.log(JSON.stringify({
    bots: BOTS, spread: !!process.env.SPREAD, ticksPerSec: (ticks.length / (wall / 1000)).toFixed(1), tickAvgMs: avg(ticks), tickP95Ms: q(0.95),
    patchAvgMs: avg(patches), cpuPct: (((cpu.user + cpu.system) / 1000) / wall * 100).toFixed(0), rssMB: (process.memoryUsage().rss / 1e6).toFixed(0),
    kbPerPlayerPerSec: (bytes / BOTS / (wall / 1000) / 1024).toFixed(1), wireKbPerPlayerPerSec: (wire / BOTS / (wall / 1000) / 1024).toFixed(1), deflate: !!process.env.DEFLATE, mobs: room.state.mobs.size, activeMobs: active,
    sendBacklogKbMax: +(backlog / 1024).toFixed(0), botsDropped: dropped,
    ...(process.env.TIDE ? { tide: true, tideMarchers: marchers } : {}),
    ...(process.env.WAR ? { war: true, troopers } : {}),
    ...(siegeLand >= 0 ? { siege: siegeLand, siegeTroopers: room.sieges.count } : {}),
    ...(tunnelLand >= 0 ? { tunnel: tunnelLand, tunnelTroopers: room.tunnels.count } : {}),
    ...(ritualLand >= 0 ? { ritual: ritualLand, ritualTroopers: room.rituals.count, ritualState: room.rituals._ritual?.state } : {}),
  }));
  if (dropped) console.error(`BENCH INVALID: ${dropped} of ${BOTS} bots lost their connection during the run, so the numbers above are not a measurement`);
  if (PH) {
    const T = ticks.length || 1, f = (x: number) => +(x / T).toFixed(3), phases: any = {};
    let inSelf = 0;
    for (const [k, r] of [...ph].sort((a, b) => b[1].incl - a[1].incl)) {
      if (!r.n) continue;
      phases[k] = { inclMsPerTick: f(r.incl), selfMsPerTick: f(r.self), callsPerTick: f(r.n) };
      if (!r.out) inSelf += r.self;
    }
    const upd = ticks.reduce((x, y) => x + y, 0);
    phases["rest of update (inline loops, tickUnit, heroes, fields)"] = { selfMsPerTick: f(upd - inSelf) };
    console.log(JSON.stringify({ phasesNote: "INFLATED by the wrappers; inclusive = with nested phases, self = own time; selfs + rest = update total", updateMsPerTick: f(upd), phases, skipped }));
  }
  child.send("stop");
  setTimeout(() => process.exit(0), 500);
}
main();
