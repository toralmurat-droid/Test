// Time dilation for skill clip capture (node -r ./slowtime.cjs): the server's clocks and timers run SLOW times as fast,
// so the headless browser (a software WebGL that draws few frames a second) keeps up and the clips stay smooth.
const S = Number(process.env.SLOW || 1);
if (S > 0 && S !== 1) {
  const d0 = Date.now(), dn = Date.now;
  Date.now = () => Math.floor(d0 + (dn() - d0) * S);
  const p0 = performance.now(), pn = performance.now.bind(performance);
  performance.now = () => p0 + (pn() - p0) * S;
  const h0 = process.hrtime.bigint(), hb = process.hrtime.bigint;
  const big = () => h0 + BigInt(Math.floor(Number(hb() - h0) * S));
  process.hrtime.bigint = big;
  const hr = (prev) => { const t = big(); const r = [Number(t / 1000000000n), Number(t % 1000000000n)]; if (!prev) return r; let s = r[0] - prev[0], n = r[1] - prev[1]; if (n < 0) { s--; n += 1e9; } return [s, n]; };
  process.hrtime = Object.assign(hr, { bigint: big });
  const st = setTimeout, si = setInterval;
  globalThis.setTimeout = (fn, ms, ...a) => st(fn, (Number(ms) || 0) / S, ...a);
  globalThis.setInterval = (fn, ms, ...a) => si(fn, (Number(ms) || 0) / S, ...a);
}
