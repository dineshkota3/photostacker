import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site at /photostacker/ — keep localhost using "/"
  base: process.env.GITHUB_PAGES ? "/photostacker/" : "/",
  server: {
    port: 5173,
    strictPort: true,
  },
});
