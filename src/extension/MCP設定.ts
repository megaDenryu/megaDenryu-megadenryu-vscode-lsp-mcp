export function MCP設定を作る(
  MCPサーバーパス: string,
  ポート: number,
): string {
  return JSON.stringify(
    {
      mcpServers: {
        "vscode-lsp-mcp": {
          command: "node",
          args: [MCPサーバーパス],
          env: {
            MEGADENRYU_LSP_MCP_PORT: String(ポート),
          },
        },
      },
    },
    null,
    2,
  );
}
