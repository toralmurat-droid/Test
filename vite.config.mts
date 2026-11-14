import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

// The mp3s in client/public/assets/music: songs whose file is not there yet stay out of the music menu (music.ts)
const musicFiles = readdirSync(fileURLToPath(new URL("./client/public/assets/music", import.meta.url))).filter((f) => f.endsWith(".mp3"));

export default defineConfig({
  root: "client",
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
