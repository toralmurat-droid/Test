import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Content versions for the files in client/public (art, music, fonts, clips), copied as they are into dist/.
 * The build (vite.config.mts, assetVersions plugin) hands the client a manifest path -> hash and the client asks for
 * `path?v=hash` (client/src/assetUrl.ts). The hash comes from the bytes only, never mtime or build time, so a file
 * that did not change keeps its URL (and its browser cache) across deploys, and a changed file gets a new URL.
 */

/** 8 hex chars of the SHA-256 of the content: plenty to tell two versions of one file apart. */
export const contentHash = (data: Uint8Array | string) => crypto.createHash("sha256").update(data).digest("hex").slice(0, 8);

/** Every file under `dir` (posix path relative to it, no leading slash) -> its contentHash, sorted. HTML pages are left out (never cached). */
export function buildAssetManifest(dir: string): Record<string, string> {
  const out: [string, string][] = [];
  const walk = (sub: string) => {
    for (const ent of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(rel);
      else if (ent.isFile() && !/\.html?$/.test(ent.name)) out.push([rel, contentHash(fs.readFileSync(path.join(dir, rel)))]);
    }
  };
  walk("");
  return Object.fromEntries(out.sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

export const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Cache-Control for a static file asked for with `?v=`: kept for a year only when `v` is the hash of the bytes this
 * server sends (`hash`). A stale or made-up `v` (an old page during a deploy, a typo) gets undefined = the normal
 * headers, so a year-long cache entry can never hold other bytes than its URL promises.
 */
export function versionedCacheControl(v: unknown, hash: string | null | undefined): string | undefined {
  return typeof v === "string" && !!hash && v === hash ? IMMUTABLE : undefined;
}

/**
 * contentHash of files on disk, computed once per file (the built files never change while the server runs); null if
 * unreadable. Never rejects and never throws, whatever the path (a NUL byte makes createReadStream throw at once).
 * Only real files are remembered, so made-up paths cannot grow the memo.
 */
export function fileHashes() {
  const memo = new Map<string, Promise<string | null>>();
  return (file: string) => {
    let p = memo.get(file);
    if (!p) {
      p = new Promise<string | null>((ok) => {
        const fail = () => { memo.delete(file); ok(null); };
        try {
          const h = crypto.createHash("sha256");
          fs.createReadStream(file).on("error", fail).on("data", (c) => h.update(c)).on("end", () => ok(h.digest("hex").slice(0, 8)));
        } catch { fail(); }
      });
      memo.set(file, p);
    }
    return p;
  };
}

/**
 * The Cache-Control a request for a file under `dist` earns through its `?v=`, or undefined for the normal headers.
 * One place for every check, and it never rejects: this runs on requests from anyone, in the game server's process,
 * where an unhandled rejection shuts the server down (a path with %00 did exactly that before it was caught here).
 * Only a `v` shaped like a hash reaches the disk; HTML pages are never cached; paths outside `dist` are ignored.
 */
export function versionedCache(dist: string) {
  const hashOf = fileHashes();
  return async (method: string, reqPath: string, v: unknown): Promise<string | undefined> => {
    try {
      if ((method !== "GET" && method !== "HEAD") || typeof v !== "string" || !/^[0-9a-f]{8}$/.test(v)) return undefined;
      const rel = decodeURIComponent(reqPath);
      if (rel.includes("\0")) return undefined;
      const file = path.join(dist, path.normalize(rel));
      if (!file.startsWith(dist + path.sep) || /\.html?$/.test(file)) return undefined;
      return versionedCacheControl(v, await hashOf(file));
    } catch { return undefined; }
  };
}
