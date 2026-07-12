import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: "../../_dist/clinical-reasoning-workbench",
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
