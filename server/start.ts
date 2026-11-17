/**
 * The image's entry (Dockerfile CMD): the game server as always, or the Ages gateway (server/gateway.ts) when
 * GATEWAY_TARGETS is set, so one image serves every Railway service. Both bundles sit next to this one in server-dist/;
 * the game's own SIGTERM handling is untouched (same process, same signals).
 */
if (process.env.GATEWAY_TARGETS) require("./gateway.cjs").main();
else require("./index.cjs");
