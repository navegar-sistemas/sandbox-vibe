import { defineConfig } from "tsup";
import { cp } from "node:fs/promises";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  outExtension: () => ({ js: ".mjs" }),
  clean: true,
  minify: false,
  splitting: false,
  sourcemap: true,
  dts: false,
  shims: false,
  async onSuccess() {
    await cp("templates", "dist/templates", { recursive: true });
  },
});
