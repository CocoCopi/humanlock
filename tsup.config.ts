import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/adapters/react.tsx",
    vue: "src/adapters/vue.ts",
    svelte: "src/adapters/svelte.ts",
    server: "src/verify/server.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2020",
  external: ["react", "vue", "svelte"],
});
