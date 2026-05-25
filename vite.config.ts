import { defineConfig } from "vite";
import { resolve } from "node:path";
import { builtinModules } from "node:module";

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  // Node.js 環境向けに ws の "node" エントリを解決させる。
  // 既定だと ws の package.json の browser フィールドが優先されてしまい、
  // 拡張ロード時に config.browser.WebSocketServer など壊れた参照になる。
  resolve: {
    conditions: ["node", "import", "module", "default"],
    mainFields: ["main", "module"],
  },
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
      // vscode のみ拡張ホスト側で提供されるので external。
      // ws / @modelcontextprotocol/sdk / zod は extension.js / mcp.js に
      // 同梱しないと .vsix インストール先で node_modules が無く load 失敗する。
      //
      // bufferutil / utf-8-validate は ws の optional native 依存。bundle すると
      // try/catch require の劣化モード分岐を壊し「bufferUtil.mask is not a
      // function」で実行時失敗する。external にしておけば require が普通に失敗
      // し、ws が純 JS 実装に切り替わる。
      external: [
        "vscode",
        "bufferutil",
        "utf-8-validate",
        ...nodeBuiltins,
      ],
      output: {
        exports: "named",
      },
    },
  },
});
