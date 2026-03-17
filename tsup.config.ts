import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts", "src/client.ts", "src/store.ts", "src/sync.ts", "src/search.ts", "src/types.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  bundle: true,
  treeshake: true,
  target: "node18",
  outDir: "dist"
});
