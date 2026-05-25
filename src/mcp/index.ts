#!/usr/bin/env node
// MCP server エントリ (stdio)。Claude Code 等から spawn される。
// 受け取ったツール呼び出しを WebSocket 経由で VSCode 拡張に転送する。

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ポート解決 } from "../shared/config";
import { 拡張クライアント } from "./client";

const port = ポート解決(process.env.MEGADENRYU_LSP_MCP_PORT);
const client = new 拡張クライアント(port);

const renameSymbolSchema = z.object({
  file: z.string().describe("対象シンボルが含まれるファイルの絶対パス"),
  line: z.number().int().min(0).describe("0-origin の行番号"),
  character: z.number().int().min(0).describe("0-origin の桁番号"),
  newName: z.string().min(1).describe("リネーム後の新しい名前"),
  apply: z
    .boolean()
    .default(true)
    .describe("true なら workspace.applyEdit まで実施。false ならドライラン (編集内容のみ返す)"),
});

const findSymbolSchema = z.object({
  query: z.string().min(1).describe("シンボル名 (部分一致) または fuzzy 検索クエリ"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe("返却するシンボル数の上限"),
});

const findReferencingSymbolsSchema = z.object({
  file: z.string().describe("参照を調べたいシンボルが定義されているファイルの絶対パス"),
  line: z.number().int().min(0).describe("0-origin 行番号"),
  character: z.number().int().min(0).describe("0-origin 桁番号"),
  includeDeclaration: z
    .boolean()
    .default(false)
    .describe("true なら定義自体も結果に含める"),
});

const tools: Tool[] = [
  {
    name: "rename_symbol",
    description:
      "VSCode の rust-analyzer / tsserver 等の LSP を使ってシンボルをリネームし、全参照を更新する。cross-crate / cross-file 含めて WorkspaceEdit を atomic に適用する。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "対象シンボルが含まれるファイルの絶対パス" },
        line: { type: "number", description: "0-origin の行番号" },
        character: { type: "number", description: "0-origin の桁番号" },
        newName: { type: "string", description: "リネーム後の新しい名前" },
        apply: {
          type: "boolean",
          description: "true なら適用、false ならドライラン (既定: true)",
          default: true,
        },
      },
      required: ["file", "line", "character", "newName"],
    },
  },
  {
    name: "find_symbol",
    description:
      "VSCode の workspace symbol provider を使ってシンボルを名前検索する。rust-analyzer / tsserver の対象 workspace 全体が対象。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "シンボル名 (部分一致 / fuzzy)" },
        limit: { type: "number", description: "上限 (既定: 50)", default: 50 },
      },
      required: ["query"],
    },
  },
  {
    name: "find_referencing_symbols",
    description:
      "指定位置のシンボルの参照箇所を列挙する (VSCode reference provider 経由)。",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "シンボルが含まれるファイルの絶対パス" },
        line: { type: "number", description: "0-origin 行番号" },
        character: { type: "number", description: "0-origin 桁番号" },
        includeDeclaration: {
          type: "boolean",
          description: "定義自体も含めるか (既定: false)",
          default: false,
        },
      },
      required: ["file", "line", "character"],
    },
  },
  {
    name: "ping",
    description:
      "VSCode 拡張との接続疎通確認。拡張バージョンと workspace folder 一覧を返す。",
    inputSchema: { type: "object", properties: {} },
  },
];

const server = new Server(
  { name: "megadenryu-vscode-lsp-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  try {
    switch (name) {
      case "ping": {
        const result = await client.呼び出し("ping", {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "rename_symbol": {
        const parsed = renameSymbolSchema.parse(args);
        const result = await client.呼び出し("renameSymbol", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "find_symbol": {
        const parsed = findSymbolSchema.parse(args);
        const result = await client.呼び出し("findSymbol", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "find_referencing_symbols": {
        const parsed = findReferencingSymbolsSchema.parse(args);
        const result = await client.呼び出し("findReferencingSymbols", parsed);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      default:
        return {
          isError: true,
          content: [{ type: "text", text: `未知のツール: ${name}` }],
        };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout を MCP プロトコルが占有するので、診断は stderr へ。
  process.stderr.write(
    `[megadenryu-vscode-lsp-mcp] MCP server started, expecting VSCode extension on ws://127.0.0.1:${port}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[megadenryu-vscode-lsp-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
