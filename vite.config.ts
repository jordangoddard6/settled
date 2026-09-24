import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SERVER = "http://localhost:3001";

export default defineConfig({
  root: "src/client",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    // Listen on the LAN so a phone on the same Wi-Fi can open the dev site.
    host: true,
    proxy: {
      "/api": SERVER,
      "/socket.io": { target: SERVER, ws: true },
    },
  },
});
