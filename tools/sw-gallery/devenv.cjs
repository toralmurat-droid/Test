// Capture-only preload (node -r): the built server serves the built client only when NODE_ENV is "production", but the
// dev chat commands (/tp, /god) are only on when it is not. For the first seconds after start NODE_ENV reads as
// production (index.ts decides then), afterwards as development. Only used by tools/sw-gallery/capture.ts.
const real = process.env, born = Date.now();
process.env = new Proxy(real, { get: (t, k) => (k === "NODE_ENV" ? (Date.now() - born < 4000 ? "production" : "development") : t[k]) });
