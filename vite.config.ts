import { defineConfig } from "vite";
import { resolve } from "node:path";
import { builtinModules } from "node:module";

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  build: {
    target: "node20",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        extension: resolve(__dirname, "src/extension/index.ts"),
        mcp: resolve(__dirname, "src/mcp/index.ts"),
      },
      formats: ["cjs"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        "vscode",
        "ws",
        "@modelcontextprotocol/sdk",
        /^@modelcontextprotocol\/sdk\//,
        "zod",
        ...nodeBuiltins,
      ],
      output: {
        exports: "named",
      },
    },
  },
});
