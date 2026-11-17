// Ages gateway (server/gateway.ts): two fake game servers behind the gateway, on random ports. Cohort cookie, /age/<slot>,
// proxying (body, headers, X-Forwarded-*), the WebSocket pipe, fallback when a backend is down, and the admin status.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { COOKIE, addressDraw, configFromEnv, createGateway, parseSplit, parseTargets, pickSlot } from "../server/gateway";

const listen = (s: http.Server) => new Promise<number>((ok) => s.listen(0, "127.0.0.1", () => ok((s.address() as net.AddressInfo).port)));

/** A fake game server: echoes what it got as JSON, answers /health with its build, and echoes WebSocket messages. */
const seen: string[] = []; // "<name> <method> <url>" of every request a backend got
function backend(name: string) {
  const s = http.createServer((req, res) => {
    seen.push(`${name} ${req.method} ${req.url}`);
    if (req.url === "/hang") return; // never answers
    // The Ages status (server/agesStatus.ts): blue answers when the gateway's key is right, green never answers
    if (req.url?.startsWith("/admin/ages.json")) {
      if (name === "green") return;
      const ok = new URL(req.url, "http://x").searchParams.get("key") === "a-long-admin-key";
      res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
      res.end(ok ? JSON.stringify({ slot: name, roles: { war: "owner" } }) : "");
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/health") { res.writeHead(200, { "x-build": `${name}-build` }); res.end("ok"); return; }
      res.writeHead(201, { "content-type": "application/json", "x-from": name, "set-cookie": "own=1" });
      res.end(JSON.stringify({ name, method: req.method, url: req.url, body, headers: req.headers }));
    });
  });
  const wss = new WebSocketServer({ server: s });
  wss.on("connection", (ws, req) => ws.on("message", (m) => ws.send(`${name}:${m}:${req.headers["x-forwarded-for"] ? "fwd" : "nofwd"}`)));
  return s;
}

const blue = backend("blue"), green = backend("green");
const servers: http.Server[] = [blue, green];
after(() => { for (const s of servers) { s.closeAllConnections(); s.close(); } });

async function gateway(split: string, extra: Record<string, string> = {}) {
  const bp = (blue.address() as net.AddressInfo | null)?.port ?? await listen(blue);
  const gp = (green.address() as net.AddressInfo | null)?.port ?? await listen(green);
  const logs: string[] = [];
  const cfg = configFromEnv({ GATEWAY_TARGETS: `blue=http://127.0.0.1:${bp},green=http://127.0.0.1:${gp}`, AGE_SPLIT: split, ...extra });
  const g = createGateway({ ...cfg, idleMs: 300, log: (m) => logs.push(m) });
  servers.push(g);
  const port = await listen(g);
  return { url: `http://127.0.0.1:${port}`, port, logs };
}
const cookieIn = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));

test("config: targets, split and the weighted pick", () => {
  const t = parseTargets("blue=http://a:1, green=http://b:2");
  assert.deepEqual(t.map((b) => [b.slot, b.url.host]), [["blue", "a:1"], ["green", "b:2"]]);
  assert.throws(() => parseTargets("blue=https://a:1"));
  assert.throws(() => parseTargets("=http://a:1"));
  assert.throws(() => parseTargets("blue=http://a:1,blue=http://b:1"));
  assert.throws(() => parseTargets(""));
  assert.deepEqual(parseSplit(undefined, ["blue", "green"], "blue"), { blue: 100 });
  assert.deepEqual(parseSplit("blue=0,green=0", ["blue", "green"], "green"), { green: 100 });
  assert.deepEqual(parseSplit("blue=70,green=30,red=5", ["blue", "green"], "blue"), { blue: 70, green: 30 });
  assert.equal(pickSlot({ blue: 70, green: 30 }, "blue", () => 0.69), "blue");
  assert.equal(pickSlot({ blue: 70, green: 30 }, "blue", () => 0.71), "green");
  assert.equal(configFromEnv({ GATEWAY_TARGETS: "blue=http://a:1,green=http://b:2", GATEWAY_PRIMARY: "green" }).split.green, 100);
});

test("a new visitor gets a cohort cookie by the split; the cookie keeps them there", async () => {
  const toGreen = await gateway("blue=0,green=100");
  let r = await fetch(`${toGreen.url}/`);
  assert.equal(r.headers.get("x-from"), "green");
  const c = cookieIn(r)!;
  assert.match(c, /^ptb_age=green; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
  assert.ok(r.headers.getSetCookie().includes("own=1"), "the backend's own cookies pass through");
  r = await fetch(`${toGreen.url}/`, { headers: { cookie: "ptb_age=green" } });
  assert.equal(r.headers.get("x-from"), "green");
  assert.equal(cookieIn(r), undefined, "no new cookie once chosen");

  const toBlue = await gateway("blue=100,green=0");
  r = await fetch(`${toBlue.url}/x`, { headers: { "x-forwarded-proto": "https" } });
  assert.equal(r.headers.get("x-from"), "blue");
  assert.match(cookieIn(r)!, /; Secure$/);
  // Someone already on green stays there whatever the split says now
  r = await fetch(`${toBlue.url}/`, { headers: { cookie: "a=b; ptb_age=green" } });
  assert.equal(r.headers.get("x-from"), "green");
});

test("/age/<slot> switches a known slot; an unknown slot or cookie is refused / re-picked", async () => {
  const g = await gateway("blue=90,green=10");
  let r = await fetch(`${g.url}/age/green`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/");
  assert.match(cookieIn(r)!, /^ptb_age=green;/);
  r = await fetch(`${g.url}/age/red`, { redirect: "manual" });
  assert.equal(r.status, 404);
  assert.equal(cookieIn(r), undefined);
  r = await fetch(`${g.url}/`, { headers: { cookie: "ptb_age=red", "x-forwarded-for": "198.51.100.1" } });
  assert.equal(r.headers.get("x-from"), pickSlot({ blue: 90, green: 10 }, "blue", () => addressDraw({ headers: { "x-forwarded-for": "198.51.100.1" }, socket: {} } as never)));
  assert.match(cookieIn(r)!, /^ptb_age=(blue|green);/);
});

test("an Age with weight 0 is open through /age/<slot> only with the admin key", async () => {
  const g = await gateway("blue=100,green=0", { ADMIN_KEY: "a-long-admin-key" });
  let r = await fetch(`${g.url}/age/green`, { redirect: "manual" });
  assert.equal(r.status, 404);
  assert.equal(cookieIn(r), undefined);
  assert.equal((await fetch(`${g.url}/age/green?key=wrong-admin-key`, { redirect: "manual" })).status, 404);
  r = await fetch(`${g.url}/age/green?key=a-long-admin-key`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.match(cookieIn(r)!, /^ptb_age=green;/);
  assert.equal((await fetch(`${g.url}/age/blue`, { redirect: "manual" })).status, 302, "a weighted Age stays open");
});

test("without a cookie the Age is fixed by the address, not drawn per request", async () => {
  const g = await gateway("blue=50,green=50");
  const ageOf = async (ip: string) => (await fetch(`${g.url}/`, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } })).headers.get("x-from");
  const both = new Set<string | null>();
  for (let i = 1; i <= 40; i++) {
    const ip = `203.0.113.${i}`, first = await ageOf(ip);
    both.add(first);
    for (let k = 0; k < 3; k++) assert.equal(await ageOf(ip), first, ip);
  }
  assert.deepEqual([...both].sort(), ["blue", "green"], "the split still spreads addresses over both Ages");
});

test("a chunked body is re-framed for the backend: no request smuggling", async () => {
  const g = await gateway("blue=100");
  const smug = "GET /secret HTTP/1.1\r\nHost: x\r\n\r\n";
  const before = seen.length;
  const reply = await new Promise<string>((ok, fail) => {
    const c = net.connect(g.port, "127.0.0.1", () => c.write(`OPTIONS /opt HTTP/1.1\r\nHost: x\r\nCookie: ptb_age=blue\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n${smug.length.toString(16)}\r\n${smug}\r\n0\r\n\r\n`));
    let out = ""; c.on("data", (d) => (out += d)); c.on("end", () => ok(out)); c.on("error", fail);
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(seen.slice(before), ["blue OPTIONS /opt"], "the backend saw one request");
  const body = JSON.parse(reply.slice(reply.indexOf("\r\n\r\n") + 4).replace(/^[0-9a-f]+\r\n|\r\n0\r\n\r\n$/g, "")) as { body: string };
  assert.equal(body.body, smug, "the body arrived as a body");
});

test("a silent backend is cut after the idle time; a player who leaves does not mark the backend down", async () => {
  const g = await gateway("blue=100");
  const t0 = Date.now();
  const r = await fetch(`${g.url}/hang`, { headers: { cookie: "ptb_age=blue" } });
  assert.equal(r.status, 502);
  assert.ok(Date.now() - t0 >= 250);
  const ac = new AbortController();
  const p = fetch(`${g.url}/hang`, { headers: { cookie: "ptb_age=blue" }, signal: ac.signal }).catch(() => "aborted");
  setTimeout(() => ac.abort(), 50);
  assert.equal(await p, "aborted");
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!g.logs.some((l) => /down/.test(l)), g.logs.join("\n"));
});

test("HTTP is proxied with its body and headers; hop-by-hop headers stripped, X-Forwarded-* set", async () => {
  const g = await gateway("blue=100");
  const r = await fetch(`${g.url}/account?a=1`, {
    method: "POST", body: JSON.stringify({ name: "Hero" }),
    headers: { "content-type": "application/json", cookie: "ptb_age=blue", "x-forwarded-for": "203.0.113.7", "x-forwarded-proto": "https", "x-custom": "yes" },
  });
  assert.equal(r.status, 201);
  const got = await r.json() as { name: string; method: string; url: string; body: string; headers: Record<string, string> };
  assert.equal(got.name, "blue");
  assert.equal(got.method, "POST");
  assert.equal(got.url, "/account?a=1");
  assert.deepEqual(JSON.parse(got.body), { name: "Hero" });
  assert.equal(got.headers["x-custom"], "yes");
  assert.equal(got.headers["x-forwarded-for"], "203.0.113.7, 127.0.0.1", "the client's address stays first");
  assert.equal(got.headers["x-forwarded-proto"], "https");
  assert.equal(got.headers["x-forwarded-host"], `127.0.0.1:${g.port}`);
  // Hop-by-hop headers (and those Connection names) stop at the gateway
  const hop = await new Promise<Record<string, string>>((ok, fail) => {
    const q = http.request(`${g.url}/hop`, { headers: { cookie: "ptb_age=blue", connection: "keep-alive, x-drop", "keep-alive": "timeout=5", "x-drop": "1", "x-keep": "1" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok(JSON.parse(b).headers));
    });
    q.on("error", fail); q.end();
  });
  assert.equal(hop["keep-alive"], undefined);
  assert.equal(hop["x-drop"], undefined);
  assert.equal(hop["x-keep"], "1");
  // A big streamed body arrives whole
  const big = "x".repeat(300_000);
  const r2 = await fetch(`${g.url}/up`, { method: "POST", body: big, headers: { cookie: "ptb_age=blue" } });
  assert.equal(((await r2.json()) as { body: string }).body.length, big.length);
});

test("the WebSocket upgrade goes to the cookie's Age and is piped both ways", async () => {
  const g = await gateway("blue=100,green=0");
  const talk = (cookie?: string) => new Promise<string>((ok, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${g.port}/abc/room?sessionId=1`, { headers: cookie ? { cookie } : {} });
    ws.on("open", () => ws.send("hi"));
    ws.on("message", (m) => { ok(String(m)); ws.close(); });
    ws.on("error", fail);
  });
  assert.equal(await talk("ptb_age=green"), "green:hi:fwd");
  assert.equal(await talk(), "blue:hi:fwd");
  // Only WebSocket upgrades; a backend that refuses the upgrade answers the client itself
  const raw = (req: string) => new Promise<string>((ok) => {
    const c = net.connect(g.port, "127.0.0.1", () => c.write(req));
    let out = ""; c.on("data", (d) => (out += d)); c.on("close", () => ok(out)); c.on("error", () => ok(out));
  });
  assert.match(await raw("GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: h2c\r\n\r\n"), /^HTTP\/1\.1 400 /);
  assert.match(await raw("GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"), /^HTTP\/1\.1 400 /, "ws refuses a bad handshake");
});

test("a backend down: HTTP falls back to a live Age (not the game's session paths), WebSocket closes", async () => {
  const dead = net.createServer(); // a port that refuses connections once closed
  const deadPort = await new Promise<number>((ok) => dead.listen(0, "127.0.0.1", () => ok((dead.address() as net.AddressInfo).port)));
  await new Promise((ok) => dead.close(ok));
  const gp = (green.address() as net.AddressInfo | null)?.port ?? await listen(green);
  const logs: string[] = [];
  const cfg = configFromEnv({ GATEWAY_TARGETS: `blue=http://127.0.0.1:${deadPort},green=http://127.0.0.1:${gp}` });
  const g = createGateway({ ...cfg, log: (m) => logs.push(m) });
  servers.push(g);
  const url = `http://127.0.0.1:${await listen(g)}`;
  let r = await fetch(`${url}/`, { headers: { cookie: "ptb_age=blue" } });
  assert.equal(r.headers.get("x-from"), "green");
  assert.ok(logs.some((l) => /backend blue down/.test(l)), logs.join("\n"));
  r = await fetch(`${url}/account`, { method: "POST", body: "{}", headers: { cookie: "ptb_age=blue" } });
  assert.equal(((await r.json()) as { body: string }).body, "{}", "the body survives the retry");
  // /health and the seat reservation wait for the player's own Age (the reconnect notice keeps polling)
  r = await fetch(`${url}/health`, { headers: { cookie: "ptb_age=blue" } });
  assert.equal(r.status, 502);
  r = await fetch(`${url}/matchmake/joinOrCreate/town`, { method: "POST", body: "{}", headers: { cookie: "ptb_age=blue" } });
  assert.equal(r.status, 502);
  const closed = await new Promise<boolean>((ok) => {
    const ws = new WebSocket(`ws://${new URL(url).host}/x/y`, { headers: { cookie: "ptb_age=blue" } });
    ws.on("open", () => ok(false));
    ws.on("error", () => ok(true));
  });
  assert.ok(closed);
});

test("/gateway/health answers itself; /gateway/status needs the admin key", async () => {
  const g = await gateway("blue=90,green=10", { ADMIN_KEY: "a-long-admin-key" });
  let r = await fetch(`${g.url}/gateway/health`);
  assert.equal(await r.text(), "ok");
  assert.equal((await fetch(`${g.url}/gateway/status`)).status, 404);
  assert.equal((await fetch(`${g.url}/gateway/status?key=wrong-admin-key`)).status, 404);
  r = await fetch(`${g.url}/gateway/status?key=a-long-admin-key`);
  assert.equal(r.status, 200);
  const s = await r.json() as { primary: string; split: Record<string, number>; backends: { slot: string; ok: boolean; build: string; ages?: any; agesError?: string }[] };
  assert.equal(s.primary, "blue");
  assert.deepEqual(s.split, { blue: 90, green: 10 });
  assert.deepEqual(s.backends.map((b) => [b.slot, b.ok, b.build]), [["blue", true, "blue-build"], ["green", true, "green-build"]]);
  // Each Age's own status comes along (same key); one that does not answer within 2 s is reported, not waited for
  assert.deepEqual(s.backends[0].ages, { slot: "blue", roles: { war: "owner" } });
  assert.equal(s.backends[0].agesError, undefined);
  assert.equal(s.backends[1].ages, undefined);
  assert.equal(s.backends[1].agesError, "timeout");
  // /health itself is the player's Age's (client/src/reconnect.ts reads its X-Build)
  r = await fetch(`${g.url}/health`, { headers: { cookie: "ptb_age=green" } });
  assert.equal(r.headers.get("x-build"), "green-build");
  // Without a key configured, status stays closed
  const open = await gateway("blue=100");
  assert.equal((await fetch(`${open.url}/gateway/status?key=`)).status, 404);
});
