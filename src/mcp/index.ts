#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { 拡張クライアント } from "./client";
import {
  MCP接続先を表示する,
  MCP接続先を解決する,
} from "./接続先解決";
import { tools } from "./ツール定義";
import { ツールを呼び出す } from "./ツール呼び出し";

function MCPサーバーを作る(client: 拡張クライアント): Server {
  const server = new Server(
    { name: "megadenryu-vscode-lsp-mcp", version: "0.3.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    ツールを呼び出す(client, req),
  );
  return server;
}

async function main(): Promise<void> {
  const 接続先 = MCP接続先を解決する(process.env);
  const client = new 拡張クライアント(接続先.ポート);
  const server = MCPサーバーを作る(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[megadenryu-vscode-lsp-mcp] MCP server started: ${MCP接続先を表示する(接続先)}\n`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[megadenryu-vscode-lsp-mcp] fatal: ${message}\n`);
  process.exit(1);
});
