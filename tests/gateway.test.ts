// Ages gateway (server/gateway.ts): two fake game servers behind the gateway, on random ports. Cohort cookie, /age/<slot>,
// proxying (body, headers, X-Forwarded-*), the WebSocket pipe, fallback when a backend is down, and the admin status.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { COOKIE, configFromEnv, createGateway, parseSplit, parseTargets, pickSlot } from "../server/gateway";

const listen = (s: http.Server) => new Promise<number>((ok) => s.listen(0, "127.0.0.1", () => ok((s.address() as net.AddressInfo).port)));

/** A fake game server: echoes what it got as JSON, answers /health with its build, and echoes WebSocket messages. */
function backend(name: string) {
  const s = http.createServer((req, res) => {
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
  const g = createGateway({ ...cfg, log: (m) => logs.push(m) });
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
  const g = await gateway("blue=100,green=0");
  let r = await fetch(`${g.url}/age/green`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/");
  assert.match(cookieIn(r)!, /^ptb_age=green;/);
  r = await fetch(`${g.url}/age/red`, { redirect: "manual" });
  assert.equal(r.status, 404);
  assert.equal(cookieIn(r), undefined);
  r = await fetch(`${g.url}/`, { headers: { cookie: "ptb_age=red" } });
  assert.equal(r.headers.get("x-from"), "blue");
  assert.match(cookieIn(r)!, /^ptb_age=blue;/);
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
  const s = await r.json() as { primary: string; split: Record<string, number>; backends: { slot: string; ok: boolean; build: string }[] };
  assert.equal(s.primary, "blue");
  assert.deepEqual(s.split, { blue: 90, green: 10 });
  assert.deepEqual(s.backends.map((b) => [b.slot, b.ok, b.build]), [["blue", true, "blue-build"], ["green", true, "green-build"]]);
  // /health itself is the player's Age's (client/src/reconnect.ts reads its X-Build)
  r = await fetch(`${g.url}/health`, { headers: { cookie: "ptb_age=green" } });
  assert.equal(r.headers.get("x-build"), "green-build");
  // Without a key configured, status stays closed
  const open = await gateway("blue=100");
  assert.equal((await fetch(`${open.url}/gateway/status?key=`)).status, 404);
});
