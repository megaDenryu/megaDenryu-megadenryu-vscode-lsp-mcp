import { describe, expect, it } from "vitest";
import { MCP設定を作る } from "../src/extension/MCP設定";

describe("MCP設定を作る", () => {
  it("stdio起動設定へ固定ポートを明記する", () => {
    const 設定: unknown = JSON.parse(
      MCP設定を作る("C:\\extension\\dist\\mcp.js", 17800),
    );

    expect(設定).toEqual({
      mcpServers: {
        "vscode-lsp-mcp": {
          command: "node",
          args: ["C:\\extension\\dist\\mcp.js"],
          env: {
            MEGADENRYU_LSP_MCP_PORT: "17800",
          },
        },
      },
    });
  });
});
