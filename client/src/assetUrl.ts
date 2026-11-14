/**
 * URLs of files in client/public (art, music, fonts, clips) with their content version: `path?v=<hash>`. The server
 * lets the browser keep a versioned file for a year without asking again (server/assetVersions.ts), and a changed file
 * gets a new hash, so unchanged art loads from the cache after a deploy and changed art is fetched again.
 * Every loader goes through assetUrl. In dev (no manifest) URLs stay plain.
 */

/** Path (relative to client/public, no leading slash) -> content hash; set by the assetVersions plugin in vite.config.mts at build time. */
declare const __ASSET_VERSIONS__: Record<string, string> | null;
let VERSIONS: Record<string, string> | null = null;
try { VERSIONS = __ASSET_VERSIONS__; } catch { /* not built by Vite (unit tests) */ } // named once: the define inlines the whole manifest

/** `url` with `?v=` from `versions`; plain (and `missing` called) when the file is not listed. URLs with a query are left alone. */
export function versionedUrl(url: string, versions: Record<string, string> | null, missing?: (url: string) => void): string {
  if (!versions || /[?#]/.test(url)) return url;
  const hash = versions[url.replace(/^\.?\//, "")];
  if (hash) return `${url}?v=${hash}`;
  missing?.(url);
  return url;
}

const warned = new Set<string>();
/** The versioned URL of a client/public file, e.g. assetUrl("assets/hd/mobs/mobs.json"). An unlisted file still loads, unversioned, with one warning. */
export const assetUrl = (url: string) => versionedUrl(url, VERSIONS, (u) => {
  if (warned.has(u)) return;
  warned.add(u);
  console.warn(`assetUrl: ${u} is not in the asset manifest, loading it without a version`);
});
