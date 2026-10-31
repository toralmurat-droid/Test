import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "client",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./client/index.html", import.meta.url)),
        map: fileURLToPath(new URL("./client/map.html", import.meta.url)),
      },
    },
  },
  server: { host: true, port: 5173 },
});
