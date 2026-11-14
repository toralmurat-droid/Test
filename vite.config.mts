import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { buildAssetManifest } from "./server/assetVersions";

// The mp3s in client/public/assets/music: songs whose file is not there yet stay out of the music menu (music.ts)
const musicFiles = readdirSync(fileURLToPath(new URL("./client/public/assets/music", import.meta.url))).filter((f) => f.endsWith(".mp3"));

/**
 * Content-hash versions of client/public (server/assetVersions.ts): the manifest goes into the client as
 * __ASSET_VERSIONS__ (client/src/assetUrl.ts, no extra request), and the public URLs in the HTML pages and CSS (favicons,
 * fonts) get their `?v=` here. Dev serves plain URLs (no manifest).
 */
function assetVersions(): Plugin {
  const pub = fileURLToPath(new URL("./client/public", import.meta.url));
  let versions: Record<string, string> = {};
  const withV = (url: string) => { const h = versions[url.slice(1)]; return h ? `${url}?v=${h}` : url; };
  return {
    name: "asset-versions",
    config(_, { command }) {
      if (command === "build") versions = buildAssetManifest(pub);
      return { define: { __ASSET_VERSIONS__: command === "build" ? JSON.stringify(versions) : "null" } };
    },
    transformIndexHtml: { order: "post", handler: (html) => html.replace(/(\s(?:href|src)=")(\/[^"?#]+)"/g, (_m, a, url) => `${a}${withV(url)}"`) },
    // CSS sources, before Vite hashes the CSS file names: a changed font must also change the stylesheet's name
    transform: {
      order: "pre",
      handler: (code, id) => /\.css$/.test(id.split("?")[0]) ? code.replace(/url\((["']?)(\/[^)"'?#]+)\1\)/g, (_m, q, url) => `url(${q}${withV(url)}${q})`) : null,
    },
  };
}

export default defineConfig({
  root: "client",
  plugins: [assetVersions()],
  define: { __MUSIC_FILES__: JSON.stringify(musicFiles) },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./client/index.html", import.meta.url)),
        map: fileURLToPath(new URL("./client/map.html", import.meta.url)),
        skills: fileURLToPath(new URL("./client/skills.html", import.meta.url)),
        wiki: fileURLToPath(new URL("./client/wiki.html", import.meta.url)),
        roadmap: fileURLToPath(new URL("./client/roadmap.html", import.meta.url)),
      },
    },
  },
  server: { host: true, port: 5173 },
});
