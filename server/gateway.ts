/**
 * Ages gateway (roadmap M5, docs/ages-setup.md): one public front for two game servers ("Ages", e.g. blue / green).
 * Each browser gets a cohort cookie (`ptb_age`) and every request it makes (page, /account, /matchmake, the game's
 * WebSocket) goes to that Age's server, so a new build can open to some players while the others stay on the old one.
 * Plain node:http / node:net, no dependencies: it only moves bytes and decides nothing about the game.
 */
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";

export interface Backend { slot: string; url: URL }
export interface GatewayConfig {
  targets: Backend[];
  primary: string;
  /** Weight per slot for new visitors (missing = 0). */
  split: Record<string, number>;
  adminKey?: string;
  log?: (msg: string) => void;
}

export const COOKIE = "ptb_age";
const COOKIE_AGE = 30 * 24 * 3600; // s
const CONNECT_MS = 5_000;
const SLOT_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

/** `GATEWAY_TARGETS="blue=http://host:port,green=http://host:port"`; throws on a bad entry so a typo fails at boot. */
export function parseTargets(spec: string): Backend[] {
  const out: Backend[] = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    const slot = part.slice(0, Math.max(eq, 0)).trim();
    if (eq < 1 || !SLOT_RE.test(slot)) throw new Error(`GATEWAY_TARGETS: bad slot in "${part}"`);
    const url = new URL(part.slice(eq + 1).trim());
    if (url.protocol !== "http:") throw new Error(`GATEWAY_TARGETS: only http:// backends (private network), got "${part}"`);
    if (out.some((b) => b.slot === slot)) throw new Error(`GATEWAY_TARGETS: slot "${slot}" twice`);
    out.push({ slot, url });
  }
  if (!out.length) throw new Error("GATEWAY_TARGETS: no backends");
  return out;
}

/** `AGE_SPLIT="blue=90,green=10"`; unset or all zero = everyone new to the primary. Unknown slots are ignored. */
export function parseSplit(spec: string | undefined, slots: string[], primary: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (spec ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [slot, w] = part.split("=").map((s) => s.trim());
    const n = Number(w);
    if (slots.includes(slot) && Number.isFinite(n) && n > 0) out[slot] = n;
  }
  return Object.keys(out).length ? out : { [primary]: 100 };
}

/** Config from the environment (GATEWAY_TARGETS, GATEWAY_PRIMARY, AGE_SPLIT, ADMIN_KEY). */
export function configFromEnv(env = process.env): GatewayConfig {
  const targets = parseTargets(env.GATEWAY_TARGETS ?? "");
  const slots = targets.map((b) => b.slot);
  const primary = env.GATEWAY_PRIMARY && slots.includes(env.GATEWAY_PRIMARY) ? env.GATEWAY_PRIMARY : slots[0];
  return { targets, primary, split: parseSplit(env.AGE_SPLIT, slots, primary), adminKey: env.ADMIN_KEY };
}

/** A new visitor's Age, drawn by the split's weights. */
export function pickSlot(split: Record<string, number>, primary: string, rnd = Math.random): string {
  const total = Object.values(split).reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const [slot, w] of Object.entries(split)) if ((r -= w) < 0) return slot;
  return primary;
}

const cookieOf = (req: http.IncomingMessage): string | undefined => {
  for (const c of String(req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = c.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
};
const httpsOf = (req: http.IncomingMessage) => String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
const setCookie = (req: http.IncomingMessage, slot: string) =>
  `${COOKIE}=${slot}; Path=/; Max-Age=${COOKIE_AGE}; HttpOnly; SameSite=Lax${httpsOf(req) ? "; Secure" : ""}`;

// Hop-by-hop headers belong to one connection, never forwarded (RFC 9110 7.6.1), plus any the Connection header names
const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);
function strip(h: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const named = String(h.connection ?? "").toLowerCase().split(",").map((s) => s.trim());
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(h)) if (v !== undefined && !HOP.has(k) && !named.includes(k)) out[k] = v;
  return out;
}
/** X-Forwarded-*: the edge's client address stays first (the game reads the first hop with TRUST_PROXY). */
function forwarded(req: http.IncomingMessage, h: http.OutgoingHttpHeaders) {
  const prev = req.headers["x-forwarded-for"], addr = req.socket.remoteAddress ?? "";
  h["x-forwarded-for"] = prev ? `${prev}, ${addr}` : addr;
  h["x-forwarded-proto"] = req.headers["x-forwarded-proto"] ?? "http";
  h["x-forwarded-host"] = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return h;
}

/** The gateway as an http.Server (not listening yet). */
export function createGateway(cfg: GatewayConfig): http.Server {
  const log = cfg.log ?? ((m: string) => console.log(`[gateway] ${m}`));
  const bySlot = new Map(cfg.targets.map((b) => [b.slot, b]));
  const down = new Set<string>(); // slots whose last connect failed (only for the log and the fallback order)
  const mark = (slot: string, isDown: boolean, why = "") => {
    if (isDown === down.has(slot)) return;
    if (isDown) down.add(slot); else down.delete(slot);
    log(isDown ? `backend ${slot} down (${why})` : `backend ${slot} back up`);
  };
  /** The cookie's slot when it names a configured one; otherwise a fresh pick (and the cookie to set). */
  const cohort = (req: http.IncomingMessage) => {
    const c = cookieOf(req);
    if (c && bySlot.has(c)) return { slot: c, fresh: false };
    return { slot: pickSlot(cfg.split, cfg.primary), fresh: true };
  };
  const port = (b: Backend) => Number(b.url.port || 80);

  /** Proxy one HTTP request to `order[0]`; on a connect error try the next. The body is read only once connected. */
  function forward(req: http.IncomingMessage, res: http.ServerResponse, order: Backend[], cookie?: string) {
    const b = order[0];
    const headers = forwarded(req, strip(req.headers));
    const preq = http.request({ host: b.url.hostname, port: port(b), method: req.method, path: req.url, headers, agent: false });
    let connected = false;
    const timer = setTimeout(() => { if (!connected) preq.destroy(new Error("connect timeout")); }, CONNECT_MS);
    preq.on("socket", (s) => {
      const go = () => { connected = true; clearTimeout(timer); mark(b.slot, false); req.pipe(preq); };
      if ((s as net.Socket).connecting) s.once("connect", go); else go();
    });
    preq.on("response", (pres) => {
      const h = strip(pres.headers);
      if (cookie) h["set-cookie"] = [...(([] as string[]).concat(h["set-cookie"] as string[] ?? [])), cookie];
      res.writeHead(pres.statusCode ?? 502, pres.statusMessage, h);
      pres.pipe(res);
      pres.on("error", () => res.destroy());
    });
    preq.on("error", (e) => {
      clearTimeout(timer);
      if (!connected) {
        mark(b.slot, true, (e as NodeJS.ErrnoException).code ?? e.message);
        if (order.length > 1) { log(`${req.method} ${req.url}: ${b.slot} down, trying ${order[1].slot}`); return forward(req, res, order.slice(1), cookie); }
      }
      if (!res.headersSent) { res.writeHead(502, { "content-type": "text/plain", "cache-control": "no-store" }); res.end("bad gateway"); }
      else res.destroy();
    });
    res.on("close", () => { if (!res.writableFinished) preq.destroy(); });
  }

  const adminOk = (u: URL) => {
    const want = Buffer.from(cfg.adminKey ?? ""), got = Buffer.from(u.searchParams.get("key") ?? "");
    return want.length >= 12 && got.length === want.length && crypto.timingSafeEqual(got, want);
  };
  const probe = (b: Backend) => new Promise<object>((ok) => {
    const t0 = Date.now();
    const r = http.get({ host: b.url.hostname, port: port(b), path: "/health", agent: false, timeout: 3_000 }, (res) => {
      res.resume();
      ok({ slot: b.slot, url: b.url.origin, ok: res.statusCode === 200, status: res.statusCode, build: res.headers["x-build"] ?? null, ms: Date.now() - t0 });
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", (e) => ok({ slot: b.slot, url: b.url.origin, ok: false, error: (e as NodeJS.ErrnoException).code ?? e.message, ms: Date.now() - t0 }));
  });
  const json = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://gateway");
    if (u.pathname === "/gateway/health") { res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); res.end("ok"); return; }
    if (u.pathname === "/gateway/status") {
      if (!adminOk(u)) { res.writeHead(404); res.end(); return; }
      void Promise.all(cfg.targets.map(probe)).then((backends) => json(res, 200, { primary: cfg.primary, split: cfg.split, backends }));
      return;
    }
    const age = /^\/age\/([^/]+)\/?$/.exec(u.pathname);
    if (age) {
      if (!bySlot.has(age[1])) { res.writeHead(404, { "content-type": "text/plain" }); res.end("no such age"); return; }
      res.writeHead(302, { location: "/", "set-cookie": setCookie(req, age[1]), "cache-control": "no-store" });
      res.end();
      return;
    }
    const { slot, fresh } = cohort(req);
    // The game's session paths stay with the player's Age: a /health or a seat reservation answered by the other Age
    // would reload the page into it, or reserve a seat the WebSocket (always the cookie's Age) cannot find. They wait.
    const pinned = u.pathname === "/health" || u.pathname.startsWith("/matchmake");
    const others = pinned ? [] : cfg.targets.filter((b) => b.slot !== slot).sort((a, b) => Number(down.has(a.slot)) - Number(down.has(b.slot)));
    forward(req, res, [bySlot.get(slot)!, ...others], fresh ? setCookie(req, slot) : undefined);
  });

  // WebSocket (the game's room connection): replay the request to the cookie's Age and pipe both ways. No fallback:
  // a seat lives on one server.
  server.on("upgrade", (req: http.IncomingMessage, sock: net.Socket, head: Buffer) => {
    const b = bySlot.get(cohort(req).slot)!;
    const up = net.connect(port(b), b.url.hostname);
    let connected = false;
    const close = () => { clearTimeout(timer); up.destroy(); sock.destroy(); };
    const timer = setTimeout(() => { if (!connected) { mark(b.slot, true, "connect timeout"); close(); } }, CONNECT_MS);
    up.on("error", (e) => { if (!connected) mark(b.slot, true, (e as NodeJS.ErrnoException).code ?? e.message); close(); });
    sock.on("error", close);
    up.on("close", close); sock.on("close", close);
    up.once("connect", () => {
      connected = true;
      clearTimeout(timer);
      mark(b.slot, false);
      const h = forwarded(req, { ...req.headers });
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(h)) for (const one of ([] as unknown[]).concat(v ?? [])) raw += `${k}: ${String(one).replace(/[\r\n]/g, "")}\r\n`;
      up.write(raw + "\r\n");
      if (head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    sock.setNoDelay(true); up.setNoDelay(true);
  });
  server.on("clientError", (_e, sock) => { if (sock.writable) sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); else sock.destroy(); });
  return server;
}

/** Entry for the image (server/start.ts, when GATEWAY_TARGETS is set). SIGTERM: stop taking connections and exit. */
export function main() {
  const cfg = configFromEnv();
  const server = createGateway(cfg);
  const sockets = new Set<net.Socket>();
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  const PORT = Number(process.env.PORT ?? 2567);
  server.listen(PORT, () => console.log(`[gateway] on :${PORT}: ${cfg.targets.map((b) => `${b.slot}=${b.url.origin}`).join(", ")}; primary ${cfg.primary}; split ${JSON.stringify(cfg.split)}`));
  process.once("SIGTERM", () => {
    console.log("[gateway] SIGTERM: closing");
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => { for (const s of sockets) s.destroy(); process.exit(0); }, 3_000).unref();
  });
}
